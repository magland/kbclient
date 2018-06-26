exports.v1 = KBClient;

const KBClientImpl=require(__dirname+'/impl/kbclientimpl.js');

// Note: for webpack we need: externals:{"fs":"require('fs')"}

function KBClient() {
  let impl=new KBClientImpl();

  this.readDir = function(path, opts, callback) {
    impl.readDir(path, opts, callback);
  };
  this.readTextFile = function(path, opts, callback) {
    impl.readTextFile(path, opts, callback);
  };
  this.readBinaryFilePart = function(path, opts, callback) {
    impl.readBinaryFilePart(path, opts, callback);
  };
  this.realizeFile = function(path, opts, callback) {
    impl.realizeFile(path, callback);
  };
}