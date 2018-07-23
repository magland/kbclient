exports.KBClientImpl=KBClientImpl;

let fs=null;
try {
  fs = require('fs'); // Note: for webpack we need: externals: {"fs":"require('fs')"}
}
catch(err) {
}
const axios = require('axios');
const async = require('async');

const sumit = require(__dirname+'/sumit.js');
var SHA1 = require('node-sha1');

function KBClientImpl() {
  let that=this;
  this.readTextFile=function(path, opts, callback) {
    if (!callback) {
      callback = opts;
      opts = {};
    }
    resolve_file_path(path, {}, function(err, path2) {
      if (err) {
        callback(new Error(err));
        return;
      }
      if (is_url(path2)) {
        http_get_text(path2, callback);
        return;
      }
      try {
        var txt = fs.readFileSync(path2, 'utf8');
        callback(null, txt);
      } catch (err) {
        callback(new Error(`Error reading text file (${err.message}): ${path2}`));
      }
    });
  };

  this.readBinaryFilePart=function(path, opts, callback) {
    if (!callback) {
      callback = opts;
      opts = {};
    }
    resolve_file_path(path, {}, function(err, path2) {
      if (err) {
        callback(new Error(err));
        return;
      }
      if (is_url(path2)) {
        http_get_binary(path2, opts, callback);
        return;
      }
      let start = opts.start;
      let end = opts.end;
      fs.open(path2, 'r', function(err, fd) {
        if (err) {
          callback(err);
          return;
        }
        if ((start === undefined) && (end === undefined)) {
          start = 0;
          end = get_file_size(path2);
        }
        var buffer = new Buffer(end - start);
        fs.read(fd, buffer, 0, end - start, start, function(err, num) {
          if (err) {
            callback(err);
            return;
          }
          callback(null, buffer.buffer);
        });
      });
    });
  };

  this.locateFile=function(path, opts, callback) {
    if (!callback) {
      callback = opts;
      opts = {};
    }
    opts.download_if_needed = false;
    resolve_file_path(path, opts, callback);
  };

  this.realizeFile=function(path, opts, callback) {
    if (!callback) {
      callback = opts;
      opts = {};
    }
    opts.download_if_needed = true;
    resolve_file_path(path, opts, callback);
  };

  this.downloadFile=function(path, output_fname, opts, callback) {
    let opts2=JSON.parse(JSON.stringify(opts));
    opts2.download_to_file=output_fname;
    that.realizeFile(path,opts2,function(err,file_path) {
      if (err) {
        callback(err);
        return;
      }
      if (file_path==output_fname) {
        return;
      }
      console.info(`Copying file [${file_path}] -> [${output_fname}]`);
      let write_stream=fs.createWriteStream(output_fname);
      fs.createReadStream(file_path).pipe(write_stream);
    });
  };

  this.readDir=function(path, opts, callback) {
    if (!callback) {
      callback = opts;
      opts = {};
    }
    if (!path) {
  		callback(new Error('Path is empty.'));
  		return;
  	}
    if (path.startsWith('kbucket://')) {
      let str = path.slice(('kbucket://').length);
      let ind0 = str.indexOf('/');
      let kbhub_id, subdirectory;
      if (ind0 < 0) {
        kbhub_id = str;
        subdirectory = '';
        return;
      } else {
        kbhub_id = str.slice(0, ind0);
        subdirectory = str.slice(ind0 + 1);
      }
      let HKBC = new HttpKBucketClient();
      HKBC.readDir(kbhub_id, subdirectory, function(err, files, dirs) {
        if (err) {
          callback(new Error('Error reading directory of kbucket hub: ' + err));
          return;
        }
        let files2 = {};
        for (let ii in files) {
          files2[files[ii].name] = files[ii];
        }
        let dirs2 = {};
        for (let ii in dirs) {
          dirs2[dirs[ii].name] = dirs[ii];
        }
        callback(null, files2, dirs2);
      });
      return;
    }

    fs.readdir(path, function(err, list) {
      if (err) {
        callback(err);
        return;
      }
      let files = {};
      let dirs = {};
      async.eachSeries(list, function(item, cb) {
        if ((item == '.') || (item == '..')) {
          cb();
          return;
        }
        var item_path = require('path').join(path, item);
        if (ends_with(item_path, '.prv')) {
          var item_path_1 = item_path.slice(0, item_path.length - ('.prv').length);
          if (exists_sync(item_path_1)) {
            //don't need to worry about it... the actual file with be handled separately
            cb();
          } else {
            var file0 = {
              name: item.slice(0, item.length - ('.prv').length),
              size: 0
            };
            var prv_obj = read_json_file(item_path);
            if (prv_obj) {
              file0.size = prv_obj.original_size;
            } else {
              console.warn('Unable to read file: ' + item_path);
            }
            files[file0.name] = file0;
            cb();
          }
        } else {
          fs.stat(item_path, function(err0, stat0) {
            if (err0) {
              callback(new Error(`Error in stat of file ${item}: ${err0.message}`));
              return;
            }
            if (stat0.isFile()) {
              var file0 = {
                name: item,
                size: stat0.size,
              };
              files[file0.name] = file0;
            } else if (stat0.isDirectory()) {
              dirs[item] = {
                name: item
              };
            }
            cb();
          });
        }
      }, function() {
        callback(null, files, dirs);
      });
    });
  };

  this.prvCreate=function(fname, opts, callback) {
    var stat0 = stat_file(fname);
    if (!stat0) {
      callback(new Error('Unable to stat file in prv_create: ' + fname));
      return;
    }
    sumit.compute_file_sha1(fname, function(err, sha1) {
      if (err) {
        callback(err);
        return;
      }
      var sha1_head = compute_sha1_of_head(fname, 1000);
      var fcs = 'head1000-' + sha1_head;
      var obj = {
        original_checksum: sha1,
        original_size: stat0.size,
        original_fcs: fcs,
        original_path: require('path').resolve(fname),
        prv_version: '0.11'
      };
      callback(null, obj);
    });
  }

  function temporary_directory() {
    var ml_temporary_directory = process.env.ML_TEMPORARY_DIRECTORY || ('/tmp/mountainlab-tmp');
    mkdir_if_needed(ml_temporary_directory);
    return ml_temporary_directory;
  }

  function get_cache_file_path_for_sha1(sha1) {
    let dirpath = temporary_directory() + '/sha1_cache';
    mkdir_if_needed(dirpath);
    mkdir_if_needed(dirpath + '/' + sha1.slice(0, 3));
    return dirpath + '/' + sha1.slice(0, 3) + '/' + sha1;
  }

  function download_file(url, dest_fname, opts, callback) {
    console.info(`Downloading [${url}] > [${dest_fname}] ...`);
    var bytes_downloaded = 0;
    var bytes_total = opts.size || null;
    var timer = new Date();
    axios.get(url, {
        responseType: 'stream'
      })
      .then(function(response) {
        response.data.on('data', function(data) {
          bytes_downloaded += data.length;
          report_progress(bytes_downloaded, bytes_total);
        });
        var write_stream = fs.createWriteStream(dest_fname+'.downloading_');
        response.data.pipe(write_stream);
        response.data.on('end', function() {
          fs.renameSync(dest_fname+'.downloading_', dest_fname);
          console.info(`Downloaded ${format_file_size(bytes_downloaded)} to ${dest_fname}.`)
          setTimeout(function() { //dont catch an error from execution of callback
            callback(null);
          }, 0);
        });
      })
      .catch(function(err) {
        callback(err);
      });

    function report_progress(bytes_downloaded, bytes_total) {
      var elapsed = (new Date()) - timer;
      if (elapsed < 5000) {
        return;
      }
      timer = new Date();
      if (bytes_total) {
        console.info(`Downloaded ${format_file_size(bytes_downloaded)} of ${format_file_size(bytes_total)} ...`)
      } else {
        console.info(`Downloaded ${format_file_size(bytes_downloaded)} ...`);
      }
    }

    function format_file_size(size_bytes) {
      var a = 1024;
      var aa = a * a;
      var aaa = a * a * a;
      if (size_bytes > aaa * 3) {
        return Math.floor(size_bytes / aaa) + ' GB';
      } else if (size_bytes > aaa) {
        return Math.floor(size_bytes / (aaa / 10)) / 10 + ' GB';
      } else if (size_bytes > aa * 3) {
        return Math.floor(size_bytes / aa) + ' MB';
      } else if (size_bytes > aa) {
        return Math.floor(size_bytes / (aa / 10)) / 10 + ' MB';
      } else if (size_bytes > 10 * a) {
        return Math.floor(size_bytes / a) + ' KB';
      } else if (size_bytes > a) {
        return Math.floor(size_bytes / (a / 10)) / 10 + ' KB';
      } else {
        return size_bytes + ' bytes';
      }
    }
  }

  function resolve_file_path_2(sha1, url, opts, callback) {
  	if (!fs) {
  		callback(null,url);
  		return;
  	}
    let cache_file_path = get_cache_file_path_for_sha1(sha1);
    if (fs.existsSync(cache_file_path)) {
      callback(null, cache_file_path);
      return;
    }
    if (opts.download_if_needed) {
      let out_fname = opts.download_to_file || cache_file_path;
      let tmp_fname = out_fname + '.downloading.' + make_random_id(5);
      download_file(url, tmp_fname, {
        sha1: sha1,
        size: opts.size || undefined
      }, function(err) {
        if (err) {
          try {
            fs.unlinkSync(tmp_fname);
          } catch (err2) {

          }
          callback(err);
          return;
        }
        if (fs.existsSync(out_fname)) {
          fs.unlinkSync(out_fname);
        }
        try {
          fs.renameSync(tmp_fname, out_fname);
        } catch (err2) {
          callback(new Error('Error renaming file after download.'));
          return;
        }
        callback(null, out_fname);
      });
    } else {
      callback(null, url);
    }
  }

  function resolve_file_path(path, opts, callback) {
    if (path.startsWith('sha1://')) {
      let sha1 = path.slice(('sha1://').length);
      let HKBC = new HttpKBucketClient();
      let kbucket_url = process.env.KBUCKET_URL||'https://kbucket.flatironinstitute.org';
      HKBC.setKBucketUrl(kbucket_url);
      HKBC.findFile(sha1, opts, function(err, resp) {
        if (err) {
          callback(new Error('Error searching for file on kbucket: ' + err));
          return;
        }
        if (!resp.found) {
          callback(new Error('File not found on kbucket.'));
          return;
        }
        resolve_file_path_2(sha1, resp.url, opts, callback);
      });
      return;
    }
    if (path.startsWith('kbucket://')) {
      let str = path.slice(('kbucket://').length);
      let ind0 = str.indexOf('/');
      if (ind0 < 0) {
        callback(new Error('Improper kbucket:// path: ' + path));
        return;
      }
      let kbshare_id = str.slice(0, ind0);
      let HKBC = new HttpKBucketClient();
      HKBC.findLowestAccessibleHubUrl(kbshare_id, function(err, hub_url) {
        if (err) {
          callback(new Error('Error finding kbucket share: ' + err));
          return;
        }
        let url_prv = hub_url + '/' + kbshare_id + '/prv/' + str.slice(ind0 + 1);
        let url_download = hub_url + '/' + kbshare_id + '/download/' + str.slice(ind0 + 1);
        http_get_json(url_prv, function(err, prv0) {
          if (err) {
            callback(new Error(`Error getting prv object (${url_prv}): ` + err));
            return;
          }
          opts.filename = require('path').basename(str);
          opts.size = prv0.original_size;
          resolve_file_path('sha1://' + prv0.original_checksum, opts, callback);
        });
      });
      return;
    }
    if (ends_with(path, '.prv')) {
      let obj = read_json_file(path);
      if (!obj) {
        callback(new Error('Error reading .prv file: ' + path));
        return;
      }
      opts.filename = require('path').basename(path);
      opts.size = obj.original_size;
      resolve_file_path_from_prv_obj(obj, opts, callback);
      return;
    }
    if ((!fs.existsSync(path)) && (fs.existsSync(path + '.prv'))) {
      resolve_file_path(path + '.prv', opts, callback);
      return;
    }

    callback(null, path);
  }

  function resolve_file_path_from_prv_obj(obj, opts, callback) {
    find_local_file_from_prv_obj(obj, opts, function(err,path) {
      if ((!err)&&(path)) {
        callback(null,path);
        return;
      }
      resolve_file_path('sha1://' + obj.original_checksum, opts, callback);
      return;  
    });
  }
}


function find_local_file_from_prv_obj(obj, opts, callback) {
  if ((obj.original_path) && (require('fs').existsSync(obj.original_path))) {
    // try the original path
    if (opts.verbose >= 1) {
      console.info('Trying original path: ' + obj.original_path);
    }
    sumit.compute_file_sha1(obj.original_path, function(err, sha1) {
      if ((!err) && (sha1 == obj.original_checksum)) {
        callback(null, obj.original_path);
        return;
      }
      scan_search_directories();
    });
  } else {
    scan_search_directories();
  }

  function scan_search_directories() {
    var prv_search_paths = prv_search_directories(opts);

    var sha1 = obj.original_checksum || '';
    var fcs = obj.original_fcs || '';
    var size = obj.original_size || '';
    if (!sha1) {
      callback('original_checksum field not found in prv file: ' + prv_fname);
      return;
    }
    sumit.find_doc_by_sha1(sha1, prv_search_paths, opts, function(err, doc0) {
      if (err) {
        callback(err);
        return;
      }
      if (doc0) {
        callback('', doc0.path);
        return;
      }
      if ((!sha1) || (!size) || (!fcs)) {
        callback('Missing fields in prv file: ' + prv_fname);
        return;
      }

      async.eachSeries(prv_search_paths, function(path0, cb) {
        prv_locate_in_directory(path0, sha1, fcs, size, function(err, fname) {
          if (err) {
            callback(err);
            return;
          }
          if (fname) {
            callback('', fname);
            return;
          }
          cb();
        });
      }, function() {
        callback(null,null); //not found
      });
    });
  }
}

function prv_search_directories(opts) {
  var ret=[];
  ret.push(ml_temporary_directory());
  var ml_additional_prv_search_directories=(process.env.ML_ADDITIONAL_PRV_SEARCH_DIRECTORIES||'').split(':');
  for (var i in ml_additional_prv_search_directories) {
    if (ml_additional_prv_search_directories[i]) {
      ret.push(ml_additional_prv_search_directories[i]);
    }
  }
  return ret;
}

function ml_temporary_directory() {
  var tmpdir=process.env.ML_TEMPORARY_DIRECTORY||('/tmp/mountainlab-tmp');
  return tmpdir;
}

function prv_locate_in_directory(path, sha1, fcs, size, callback) {
  var files = read_dir_safe(path);
  async.eachSeries(files, function(file, cb) {
    var fname = path + '/' + file;
    var stat0 = stat_file(fname);
    if (stat0) {
      if (stat0.isFile()) {
        if (stat0.size == size) { //candidate
          sumit.find_doc_by_path(fname, function(err, doc0) {
            if (err) {
              callback(err);
              return;
            }
            if (doc0) {
              if (doc0.sha1 == sha1) {
                callback('', fname)
                return;
              } else {
                cb();
              }
            } else {
              if (file_matches_fcs(fname, fcs)) {
                sumit.compute_file_sha1(fname, function(err, sha1_of_fname) {
                  if (sha1_of_fname == sha1) {
                    callback('', fname);
                    return;
                  } else {
                    cb();
                  }
                });
              } else {
                cb();
              }
            }
          });
        } else {
          cb();
        }
      } else if (stat0.isDirectory()) {
        if (file.startsWith('.')) { //hidden directory
          cb();
          return;
        }
        prv_locate_in_directory(fname, sha1, fcs, size, function(err, fname0) {
          if (fname0) {
            callback('', fname0);
            return;
          }
          cb();
        });
      } else {
        cb();
      }
    }
  }, function() {
    callback('', ''); //not found
  });
}

function compute_sha1_of_head(fname, num_bytes) {
  var buf = read_part_of_file(fname, 0, num_bytes);
  if (!buf) return null;
  return SHA1(buf);
}

function file_matches_fcs_section(path, fcs_section) {
  var tmp = fcs_section.split('-');
  if (tmp.length != 2) {
    console.warn('Invalid fcs section: ' + fcs_section);
    return false;
  }
  if (tmp[0] == 'head1000') {
    var fcs0 = compute_sha1_of_head(path, 1000);
    if (!fcs0) return false;
    return (fcs0 == tmp[1]);
  } else {
    console.warn('Unexpected head section: ' + fcs_section);
    return false;
  }
}

function read_part_of_file(path, start, num_bytes) {
  var stat0 = stat_file(path);
  if (!stat0) return null;
  if (stat0.size < start + num_bytes)
    num_bytes = stat0.size - start;
  if (num_bytes < 0) return null;
  if (num_bytes == 0) return new Buffer(0);
  var buf = new Buffer(num_bytes);
  var fd = require('fs').openSync(path, 'r');
  require('fs').readSync(fd, buf, 0, num_bytes, start);
  require('fs').closeSync(fd);
  return buf;
}

function file_matches_fcs(path, fcs) {
  var list = fcs.split(';');
  for (var i in list) {
    if (list[i]) {
      if (!file_matches_fcs_section(path, list[i]))
        return false;
    }
  }
  return true;
}


var s_kbucket_client_data = {
  infos_by_sha1: {}
}

function HttpKBucketClient() {
  const that = this;
  this.setKBucketUrl = function(url) {
    m_kbucket_url = url;
  };
  this.findFile = function(sha1, opts, callback) {
    findFile(sha1, opts, callback);
  };
  this.clearCacheForFile = function(sha1) {
    clearCacheForFile(sha1);
  };
  this.clearCache = function() {
    s_kbucket_client_data.infos_by_sha1 = {};
  };
  this.getNodeInfo = function(kbnode_id, callback) {
    getNodeInfo(kbnode_id, callback);
  };
  this.readDir = function(kbnode_id, subdirectory, callback) {
    readDir(kbnode_id, subdirectory, callback);
  };
  this.findLowestAccessibleHubUrl = function(kbnode_id, callback) {
    find_lowest_accessible_hub_url(kbnode_id, callback);
  };

  //var m_kbucket_url='https://kbucket.org';
  var m_kbucket_url = process.env.KBUCKET_URL||'https://kbucket.flatironinstitute.org';

  function clearCacheForFile(sha1) {
    if (sha1 in s_kbucket_client_data.infos_by_sha1) {
      delete s_kbucket_client_data.infos_by_sha1[sha1];
    }
  }

  function findFile(sha1, opts, callback) {
    if (typeof(opts) == 'string') {
      opts = {
        filename: opts
      };
    }
    find_file(sha1, opts, function(err, resp) {
      if (err) {
        callback(err);
        return;
      }
      if (resp.found) {
        callback(null, resp);
        return;
      }
      if (resp.alt_hub_url) {
        var opts2 = JSON.parse(JSON.stringify(opts));
        opts2.kbucket_url = resp.alt_hub_url;
        find_file(sha1, opts2, callback);
        return;
      }
      callback(null, resp);
    });
  }

  function find_file(sha1, opts, callback) {
    if (s_kbucket_client_data.infos_by_sha1[sha1]) {
      callback(null, s_kbucket_client_data.infos_by_sha1[sha1]);
      return;
    }
    if (!m_kbucket_url) {
      callback(new Error('KBucketClient: kbucket url not set.'));
      return;
    }
    var url0 = opts.kbucket_url || m_kbucket_url;
    var url1 = url0 + '/find/' + sha1;
    if (opts.filename) {
      url1 += '/' + opts.filename;
    }
    http_get_json(url1, function(err, obj) {
      if (err) {
        callback(new Error(`Error in http_get_json (${url1}): ` + err), null);
        return;
      }
      if (!obj.found) {
        callback(null, obj);
        return;
      }
      var url = '';
      var candidate_urls = obj.urls || [];
      //should this be done in series or parallel?
      async.eachSeries(candidate_urls, function(candidate_url, cb) {
        url_exists(candidate_url, function(exists) {
          if (exists) {
            url = candidate_url;
            finalize();
            return;
          }
          cb();
        })
      }, function() {
        finalize();
      });

      function finalize() {
        if (!url) {
          console.warn('Found file, but none of the urls actually work.', candidate_urls);
          callback(null, {
            found: false
          });
          return;
        }
        var info0 = {
          found: true,
          url: url,
          size: obj.size
        };
        s_kbucket_client_data.infos_by_sha1[sha1] = info0;
        callback(null, info0);
      }
    });
  }

  function getNodeInfo(kbnode_id, callback) {
    var url0 = `${m_kbucket_url}/${kbnode_id}/api/nodeinfo`;
    http_get_json(url0, function(err, resp) {
      if (err) {
        callback(err);
        return;
      }
      if (!resp.info) {
        callback(new Error('No info field in response to nodeinfo.'));
        return;
      }
      //check accessible
      var check_url = `${resp.info.listen_url}/${kbnode_id}/api/nodeinfo`;
      console.info(`Checking whether node ${kbnode_id} is accessible from this location...`, check_url);
      url_exists(check_url, function(accessible) {
        callback(null, resp.info, resp.parent_hub_info, accessible);
      });
    });
  }

  function readDir(kbnode_id, subdirectory, callback) {
    var url0 = `${m_kbucket_url}/${kbnode_id}/api/readdir/${subdirectory}`;
    http_get_json(url0, function(err, resp) {
      if (err) {
        callback(err);
        return;
      }
      if (resp.error) {
        callback(new Error(resp.error));
        return;
      }
      callback(null, resp.files, resp.dirs);
    });
  }

  function find_lowest_accessible_hub_url(kbnode_id, callback) {
    that.getNodeInfo(kbnode_id, function(err, info, parent_hub_info, accessible) {
      if (err) {
        callback(err);
        return;
      }
      if ((accessible) && ((info.kbnode_type||info.node_type) == 'hub')) {
        callback(null, info.listen_url);
        return;
      }
      if (!parent_hub_info) {
        callback(new Error(`Unable to find accessible hub (id=${kbnode_id}).`));
        return;
      }
      find_lowest_accessible_hub_url(parent_hub_info.kbnode_id||parent_hub_info.node_id, callback);
    });
  }
}

function http_get_json(url, callback) {
  axios.get(url, {
      responseType: 'json'
    })
    .then(function(response) {
      setTimeout(function() { // so we don't catch an error from the timeout
        callback(null, response.data);
      }, 0);
    })
    .catch(function(error) {
      callback(error);
    });
}

function http_get_text(url, callback) {
  http_get_binary(url,{},function(err,buf) {
    if (err) {
      callback(err);
      return;
    }
    let txt = buf.toString('utf8');
    callback(null, txt);
  });

  /*
  axios.get(url, {
      responseType: 'arraybuffer'
    })
    .then(function(response) {
      setTimeout(function() { // so we don't catch an error from the timeout
        let buffer = new Buffer(response.data, 'binary');
        let txt = buffer.toString('utf8');
        callback(null, txt);
      }, 0);
    })
    .catch(function(error) {
      callback(error);
    });
  */
}

function http_get_binary(url, opts, callback) {
  let headers = {};
  if ((opts.start !== undefined) && (opts.end !== undefined)) {
    headers['range'] = `bytes=${opts.start}-${opts.end-1}`;
  }
  axios.get(url, {
      headers: headers,
      responseType: 'arraybuffer'
    })
    .then(function(response) {
      let buf=response.data;
      // this is supper-tricky... it seems there may be a difference in this output depending on whether run in browser or on desktop...
      if ('length' in buf) {
        let buf2=new Int8Array(buf.length);
        for (let i=0; i<buf.length; i++)
          buf2[i]=buf[i];
        buf=buf2.buffer;
      }
      ////////

      setTimeout(function() { // so we don't catch an error from the timeout
        callback(null, buf);
      }, 0);
    })
    .catch(function(error) {
      callback(error);
    });
}

function url_exists(url, callback) {
  axios.head(url)
    .then(function(response) {
      setTimeout(function() { // so we don't catch an error from the timeout
        callback(response.status == 200);
      }, 0);
    })
    .catch(function(error) {
      callback(false);
    });
}

function is_url(fname_or_url) {
  return ((fname_or_url.indexOf('http://') == 0) || (fname_or_url.indexOf('https://') == 0));
}

function ends_with(str, str2) {
  return (str.slice(str.length - str2.length) == str2);
}

function exists_sync(path) {
  try {
    return fs.existsSync(path);
  } catch (err) {
    return false;
  }
}

function read_json_file(fname) {
  try {
    var txt = fs.readFileSync(fname, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    return null;
  }
}

function make_random_id(len) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < len; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

function mkdir_if_needed(path) {
  try {
    fs.mkdirSync(path);
  } catch (err) {}
}

function read_dir_safe(path) {
  try {
    return require('fs').readdirSync(path);
  }
  catch(err) {
    return [];
  }
}

function stat_file(fname) {
  try {
    return require('fs').statSync(fname);
  }
  catch(err) {
    return null;
  }
}