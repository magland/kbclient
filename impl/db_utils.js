const SafeDatabase=require(__dirname+'/safedatabase.js').SafeDatabase;

let TheSafeDatabase=null;
function load_database() {
	if (!TheSafeDatabase) {
		var dirpath=process.env.ML_DATABASE_DIRECTORY;
		if (!dirpath) {
			mkdir_if_needed(config_directory());
			dirpath=config_directory()+'/database';
		}
		mkdir_if_needed(dirpath);

		TheSafeDatabase=new SafeDatabase(dirpath);
	}
	return TheSafeDatabase;
}

exports.findDocuments=function(collection,query,callback) {
	let DB=load_database();
	if (!DB) {
		callback('Unable to load database');
		return;
	}
	DB.findDocuments(collection,query)
		.then(function(docs) {
			callback(null,docs);
		})
		.catch(function(err) {
			callback(err.message);
		})
}
exports.saveDocument=function(collection,doc,callback) {
	let DB=load_database();
	if (!DB) {
		callback('Unable to load database');
		return;
	}
	DB.saveDocument(collection,doc)
		.then(function(docs) {
			callback(null,docs);
		})
		.catch(function(err) {
			callback(err.message);
		})
}
exports.removeDocuments=function(collection,query,callback) {
	let DB=load_database();
	if (!DB) {
		callback('Unable to load database');
		return;
	}
	DB.removeDocuments(collection,query)
		.then(function(docs) {
			callback(null,docs);
		})
		.catch(function(err) {
			callback(err.message);
		})
}