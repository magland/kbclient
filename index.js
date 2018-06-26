exports.v1 = KBClient;

const KBClientImpl = require(__dirname + '/impl/kbclientimpl.js').KBClientImpl;

// Note: for webpack we need: externals:{"fs":"require('fs')"}

function KBClient() {
  let impl = new KBClientImpl();

  this.readDir = function(path, opts) {
    return new Promise(function(resolve, reject) {
      impl.readDir(path, opts, function(err, files, dirs) {
        if (err) return reject(err);
        resolve({files:files, dirs:dirs});
      });
    });
  };
  this.readTextFile = function(path, opts) {
    return new Promise(function(resolve, reject) {
      impl.readTextFile(path, opts, function(err, txt) {
        if (err) return reject(err);
        resolve(txt);
      });
    });
  };
  this.readBinaryFilePart = function(path, opts) {
    return new Promise(function(resolve, reject) {
      impl.readBinaryFilePart(path, opts, function(err, data) {
        if (err) return reject(err);
        resolve(data);
      });
    });
  };
  this.realizeFile = function(path, opts) {
    return new Promise(function(resolve, reject) {
      impl.realizeFile(path, opts, function(err, path) {
        if (err) return reject(err);
        resolve(path);
      });
    });
  };
}