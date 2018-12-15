/*
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

/*
 * Inspired by:
 * https://github.com/gruntjs/grunt/blob/01055249b3a6493ee2c0ef43168f1d4d591f31f4/lib/grunt/file.js
 */

"use strict";

const path = require("path");
const util = require("util");
const fs = require("fs-extra");
const iconv = require("iconv-lite");
const PluginError = require("plugin-error");

const taskName = "-gulp-file";

/*
 * Inspired by:
 * https://github.com/gruntjs/grunt-legacy-util/blob/3cd53372928ad537d9c27ae0c87a35e7f2165b37/index.js
 */
// Create a new Error object, with an origError property that will be dumped
// if grunt was run with the --debug=9 option.
function createError(err, origError) {
    if (!util.isError(err)) { err = new Error(err); }
    if (origError) { err.origError = origError; }
    return new PluginError(taskName, err, { showStack: true });
}


// The module to be exported.
var file = module.exports = {};

// Normalize \\ paths to / paths.
var unixifyPath = function(filepath) {
    if (process.platform === "win32") {
        return filepath.replace(/\\/g, "/");
    }
    return filepath;

};

// Recurse into a directory, executing callback for each file.
file.recurse = function recurse(rootdir, callback, subdir) {
    var abspath = subdir ? path.join(rootdir, subdir) : rootdir;
    fs.readdirSync(abspath).forEach(function(filename) {
        var filepath = path.join(abspath, filename);
        if (fs.statSync(filepath).isDirectory()) {
            recurse(rootdir, callback, unixifyPath(path.join(subdir || "", filename || "")));
        } else {
            callback(unixifyPath(filepath), rootdir, subdir, filename);
        }
    });
};

// The default file encoding to use.
file.defaultEncoding = "utf8";
// Whether to preserve the BOM on file.read rather than strip it.
file.preserveBOM = false;

// Read a file, return its contents.
file.read = function(filepath, options) {
    if (!options) { options = {}; }
    var contents;
    try {
        contents = fs.readFileSync(String(filepath));
        // If encoding is not explicitly null, convert from encoded buffer to a
        // string. If no encoding was specified, use the default.
        if (options.encoding !== null) {
            contents = iconv.decode(contents, options.encoding || file.defaultEncoding, {stripBOM: !file.preserveBOM});
        }
        return contents;
    } catch (e) {
        throw createError('Unable to read "' + filepath + '" file (Error code: ' + e.code + ").", e);
    }
};

// Read a file, parse its contents, return an object.
file.readJSON = function(filepath, options) {
    var src = file.read(filepath, options);
    var result;
    try {
        result = JSON.parse(src);
        return result;
    } catch (e) {
        throw createError('Unable to parse "' + filepath + '" file (' + e.message + ").", e);
    }
};

// Write a file.
file.write = function(filepath, contents, options) {
    if (!options) { options = {}; }
    // Create path, if necessary.
    fs.mkdirpSync(path.dirname(filepath));
    try {
        // If contents is already a Buffer, don't try to encode it. If no encoding
        // was specified, use the default.
        if (!Buffer.isBuffer(contents)) {
            contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
        }
        // Actually write file.
        fs.writeFileSync(filepath, contents, "mode" in options ? {mode: options.mode} : {});
        return true;
    } catch (e) {
        throw createError('Unable to write "' + filepath + '" file (Error code: ' + e.code + ").", e);
    }
};
