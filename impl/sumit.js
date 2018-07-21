exports.sumit = search_utils;

// db_utils
var db_utils = {} //require(__dirname + './db_utils.js');
var sha1 = require('node-sha1');

function search_utils() {
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
        if (opts.verbose >= 1) {
            console.log(`Finding documents for sha1=${sha1}`);
        }
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
            if (opts.verbose >= 1) {
                console.log(`Found ${docs.length} documents.`);
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
            sha1(stream, function(err, hash) {
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

    function compute_sha1_of_head(fname, num_bytes) {
        var buf = read_part_of_file(fname, 0, num_bytes);
        if (!buf) return null;
        return sha1(buf);
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

    return {
        compute_file_sha1 
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
