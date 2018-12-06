/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

"use strict";

const gulp = require("gulp");
const log = require("fancy-log");
const PluginError = require("plugin-error");
const file = require("./lib/file");

function nlsCheck(cb) {
    const PATH = "src/nls";
    const ROOT_LANG = "root";
    let encounteredErrors = false;
    const rootDefinitions = {};

    function getDefinitions(abspath) {
        var fileContent,
            definitions = [];

        fileContent = file.read(abspath);
        fileContent.split("\n").forEach(function (line) {
            var match = line.match(/^\s*"(\S+)"\s*:/);
            if (match && match[1]) {
                definitions.push(match[1]);
            }
        });
        return definitions;
    }

    // Extracts all nls keys from nls/root
    file.recurse(PATH + "/" + ROOT_LANG, function (abspath, rootdir, subdir, filename) {
        rootDefinitions[filename] = getDefinitions(abspath);
    });

    // Compares nls keys in translations with root ones
    file.recurse(PATH, function (abspath, rootdir, subdir, filename) {
        if (!subdir || subdir === ROOT_LANG) {
            return;
        }
        const definitions = getDefinitions(abspath);

        const unknownKeys = definitions.filter(function (key) {
            return rootDefinitions[filename].indexOf(key) < 0;
        });

        if (unknownKeys.length) {
            log.error("There are unknown keys included in " + PATH + "/" + subdir + "/" + filename + ":", unknownKeys);
            encounteredErrors = true;
        }
    });

    if (encounteredErrors) {
        const err = new PluginError("nls-check", "See above logs.");
        return cb(err);
    }

    cb();
}
nlsCheck.description = "Checks if all the keys in nls files are defined in root";

gulp.task("nls-check", nlsCheck);
