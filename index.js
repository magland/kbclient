exports.v1 = KBClient;

const KBClientImpl = require(__dirname + '/impl/kbclientimpl.js').KBClientImpl;

// Note: for webpack we need: externals:{"fs":"require('fs')"}

function KBClient() {
  let impl = new KBClientImpl();

  this.setKBucketUrl = function(url) {
    impl.setKBucketUrl(url);
  };
  this.readDir = function(path, opts) {
    opts=opts||{};
    return new Promise(function(resolve, reject) {
      impl.readDir(path, opts, function(err, files, dirs) {
        if (err) return reject(err);
        resolve({files:files, dirs:dirs});
      });
    });
  };
  this.readTextFile = function(path, opts) {
    opts=opts||{};
    return new Promise(function(resolve, reject) {
      impl.readTextFile(path, opts, function(err, txt) {
        if (err) return reject(err);
        resolve(txt);
      });
    });
  };
  this.readBinaryFilePart = function(path, opts) {
    opts=opts||{};
    return new Promise(function(resolve, reject) {
      impl.readBinaryFilePart(path, opts, function(err, data) {
        if (err) return reject(err);
        resolve(data);
      });
    });
  };
  this.locateFile = function(path, opts) {
    opts=opts||{};
    return new Promise(function(resolve, reject) {
      impl.locateFile(path, opts, function(err, path) {
        if (err) return reject(err);
        resolve(path);
      });
    });
  };
  this.realizeFile = function(path, opts) {
    opts=opts||{};
    return new Promise(function(resolve, reject) {
      impl.realizeFile(path, opts, function(err, path) {
        if (err) return reject(err);
        resolve(path);
      });
    });
  };
  this.downloadFile = function(path, filename_out, opts) {
    opts=opts||{};
    return new Promise(function(resolve, reject) {
      impl.downloadFile(path, filename_out, opts, function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
  };
  this.prvCreate = function(path, opts) {
    opts=opts||{};
    return new Promise(function(resolve, reject) {
      impl.prvCreate(path, opts, function(err, obj) {
        if (err) return reject(err);
        resolve(obj);
      });
    });
  };
}