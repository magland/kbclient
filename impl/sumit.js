exports.file_matches_doc=file_matches_doc;
exports.find_doc_by_sha1=find_doc_by_sha1;
exports.find_doc_by_path=find_doc_by_path;
exports.compute_file_sha1=compute_file_sha1;

const db_utils=require(__dirname+'/db_utils.js');
var SHA1 = require('node-sha1');

function file_matches_doc(path, doc0) {
  var stat0 = stat_file(path);
  if (stat0) {
    if ((stat0.size == doc0.size) && (stat0.mtime.toISOString() == doc0.mtime) && (stat0.ctime.toISOString() == doc0.ctime) && (stat0.ino == doc0.ino)) {
      return true;
    }
  }
  return false;
};
function find_doc_by_sha1(sha1, valid_prv_search_paths, opts, callback) {
  db_utils.findDocuments('sumit', {
    sha1: sha1
  }, function(err, docs) {
    if (err) {
      callback(err);
      return;
    }
    if (docs.length === 0) {
      callback(null, null);
      return;
    }
    for (var i in docs) {
      var doc0 = docs[i];
      if (file_matches_doc(doc0.path, doc0)) {
        for (var i in valid_prv_search_paths) {
          if (doc0.path.indexOf(valid_prv_search_paths[i]) == 0) {
            callback(null, doc0);
            return;
          }
        }
      }
    }
    callback(null, null);
  });

}
function find_doc_by_path(path, callback) {
  db_utils.findDocuments('sumit', {
    path: path
  }, function(err, docs) {
    if (err) {
      callback(err);
      return;
    }
    if (docs.length === 0) {
      callback(null, null);
      return;
    }
    for (var i in docs) {
      var doc0 = docs[i];
      if (file_matches_doc(doc0.path, doc0)) {
        callback(null, doc0);
        return;
      }
    }
    callback(null, null);
  });
}
function compute_file_sha1(path, callback) {
  var stat0 = stat_file(path);
  if (!stat0) {
    callback('Unable to stat file: ' + path, '');
    return;
  }
  if (!stat0.isFile()) {
    callback('Not file type: ' + path, '');
    return;
  }
  var is_small_file = (stat0.size < 1000);
  if (is_small_file) {
    do_compute_sha1();
    return;
  }
  find_doc_by_path(path, function(err, doc0) {
    if (err) {
      callback(err);
      return;
    }
    if (doc0) {
      callback(null, doc0.sha1);
      return;
    }
    do_compute_sha1();
  });

  function do_compute_sha1() {
    var stream = require('fs').createReadStream(path);
    SHA1(stream, function(err, hash) {
      if (err) {
        callback('Error: ' + err);
        return;
      }
      var doc0 = {
        _id: path,
        path: path,
        sha1: hash,
        size: stat0.size,
        ctime: stat0.ctime.toISOString(),
        mtime: stat0.mtime.toISOString(),
        ino: stat0.ino
      };
      if (is_small_file) {
        callback('', doc0.sha1);
      } else {
        db_utils.saveDocument('sumit', doc0, function(err) {
          if (err) {
            callback(err);
            return;
          }
          callback('', doc0.sha1);
        });
      }
    });
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