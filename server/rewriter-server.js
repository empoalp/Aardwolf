'use strict';

/*
 * Serves source files with debug statements inserted.
 */

var path = require('path');
var fs = require('fs');

var config = require('../config/config.defaults.js');
var util = require('./server-util.js');
var rewriter = require('../rewriter/jsrewriter.js');

var cachePath,
	fileCache = {};


function run() {
    if (!fs.existsSync(config.fileServerBaseDir)) {
        console.error('ERROR: Path does not exist: ' + config.fileServerBaseDir);
        process.exit(1);
    }

	processFiles();
	// TODO: watch for file changes
}

function processFiles() {
	var files = util.getAllFiles(),
		destBaseDir = path.normalize(config.outputDir),
		content;

	if (!fs.existsSync(destBaseDir)) {
		fs.mkdirSync(destBaseDir);
	}
	cachePath = path.join(destBaseDir, 'cache.json');

	if (fs.existsSync(cachePath)) {
		fileCache = JSON.parse(fs.readFileSync(cachePath).toString());
	}

	for (var i = 0; i < files.length; i++) {
		processFile(files[i], false);
	}

	// Copy Aardwolf script
	content =  fs.readFileSync(path.join(__dirname, '../js/aardwolf.js'));

	content = content
		.toString()
		.replace(/__SERVER_HOST__/g, config.serverHost)
		.replace(/__SERVER_PORT__/g, config.serverPort)
		.replace(/__FILE_SERVER_PORT__/g, config.fileServerPort);

	fs.writeFileSync(path.join(destBaseDir, 'aardwolf.js'), content);

	fs.writeFileSync(cachePath, JSON.stringify(fileCache));
}

function processFile(fileName, writeCache) {
	if (validFile(fileName)) {
		var serverBaseDir = path.normalize(config.fileServerBaseDir),
			destBaseDir = path.normalize(config.outputDir),
			origFilePath = path.join(serverBaseDir, fileName),
			destFilePath = path.join(destBaseDir, fileName),
			fileStat = fs.statSync(origFilePath);

		log('Processing ' + fileName + '... ');

		if (fileStat.isDirectory()) {
			try {
				fs.mkdirSync(destFilePath);
			} catch(e) {
				// The folder already exists
			}
			return;
		}

		if (fileCache[fileName] && (fileStat.mtime.getTime() == fileCache[fileName]) &&
			fs.existsSync(destFilePath)) {
			log('Skipping\n');
			// File hasn't changed, ignore it
			return;
		}

		if (fileName.substr(-3) === '.js' || fileName === config.indexFile) {
			var content = fs.readFileSync(origFilePath).toString();
			if (fileName === config.indexFile) {
				// Inject aardwolf script in index
				var where = content.indexOf(config.whereToInsertAardwolf) + config.whereToInsertAardwolf.length;

				content = [content.slice(0, where), config.aarwolfScript, '\n', content.slice(where)].join('');
			} else {
				// Instrument JS code
				content = rewriter.addDebugStatements(fileName, content);
			}
			fs.writeFileSync(destFilePath, content);
		} else {
			util.copyFileSync(origFilePath, destFilePath);
		}

		fileCache[fileName] = fileStat.mtime.getTime();
		if (writeCache) {
			fs.writeFileSync(cachePath, JSON.stringify(fileCache));
		}

		log('OK\n');
	}
}

function validFile(path) {
	for (var i = 0; i < config.ignoreFiles.length; i++) {
		if (path.indexOf(config.ignoreFiles[i]) >= 0) {
			return false;
		}
	}
	return true;
}

function log(m) {
	if (config.verbose) {
		process.stdout.write(m);
	}
}

module.exports.run = run;