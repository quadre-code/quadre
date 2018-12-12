/*
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

/*
 * Inspired by:
 * https://github.com/gruntjs/grunt/blob/01055249b3a6493ee2c0ef43168f1d4d591f31f4/lib/grunt/file.js
 */

/*eslint-env node */
"use strict";

const path = require("path");
const fs = require("fs-extra");

// Normalize \\ paths to / paths.
var unixifyPath = function(filepath) {
    if (process.platform === "win32") {
        return filepath.replace(/\\/g, "/");
    }

    return filepath;

};

// Recurse into a directory, executing callback for each file.
function recurse(rootdir, callback, subdir) {
    var abspath = subdir ? path.join(rootdir, subdir) : rootdir;
    fs.readdirSync(abspath, "utf8").forEach(function(filename) {
        var filepath = path.join(abspath, filename);
        if (fs.statSync(filepath).isDirectory()) {
            recurse(rootdir, callback, unixifyPath(path.join(subdir || "", filename || "")));
        } else {
            callback(unixifyPath(filepath), rootdir, subdir, filename);
        }
    });
}

function read(filepath) {
    return fs.readFileSync(filepath, "utf8");
}

function write(filepath, contents) {
    // Create path, if necessary.
    fs.mkdirpSync(path.dirname(filepath));
    fs.writeFileSync(filepath, contents, {});
}

exports.recurse = recurse;
exports.read = read;
exports.write = write;
