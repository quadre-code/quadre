/*
 * Copyright (c) 2026 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

"use strict";

const fs = require("node:fs");
const gulp = require("gulp");
const log = require("fancy-log");
const PluginError = require("plugin-error");
const file = require("./lib/file");
const { glob } = require("glob");

function electronBuilderConfigCheck(cb) {
    let optionsFiles;
    try {
        optionsFiles = getElectronBuilderOptionFiles();
    } catch (e) {
        log.error("Error on reading the electron-builder config " + e);
        const errPlugin = new PluginError("electron-builder-config-check", e, {
            showStack: true,
        });
        return cb(errPlugin);
    }

    glob("src/extensions/default/**/package.json", { ignore: ["**/node_modules/**"] })
        .then(function (files) {
            files = files.sort((a, b) => a.localeCompare(b));
            for (const _file of files) {
                const packageJSON = file.readJSON(_file);
                if (!packageJSON.dependencies || !Object.keys(packageJSON.dependencies).length) {
                    continue;
                }

                // Transform the file path from something like:
                // - src/extensions/default/quadre-eslint/package.json
                // to something like this:
                // - www/extensions/default/quadre-eslint/node_modules
                const distFile = _file
                    .replace(/\\/g, "/")
                    .replace("package.json", "node_modules")
                    .replace(/^src/, "www");

                const elements = optionsFiles.filter((x) => x.from === distFile);
                if (elements.length === 0) {
                    const errFiles = new Error(
                        "Missing electron-builder files config: " + distFile
                    );
                    log.error("errFiles " + errFiles);
                    const errPlugin = new PluginError("electron-builder-config-check", errFiles, {
                        showStack: true,
                    });
                    return cb(errPlugin);
                }
            }

            cb();
        })
        .catch(function (err) {
            log.error("err " + err);
            const errPlugin = new PluginError("electron-builder-config-check", err, {
                showStack: true,
            });
            return cb(errPlugin);
        });
}

// Crude way to extract the files option as an array.
function getElectronBuilderOptionFiles() {
    const electronBuilderConfig = fs.readFileSync("./electron-builder.ts", "utf-8");

    // Search for the start of the files options.
    const seachText = '"files": [';
    const start = electronBuilderConfig.indexOf(seachText);

    // Make sure to include the first square brackets in the search.
    let i = start + seachText.length - 1;
    let last = 0;

    // Search all opened and closed brackets until the last one which close the first square brackets.
    for (; i < electronBuilderConfig.length; i++) {
        const c = electronBuilderConfig[i];
        if (c === "[") {
            last++;
        } else if (c === "]") {
            last--;
        }
        if (last === 0) {
            break;
        }
    }

    // Extract the option files content.
    const optionsFiles = electronBuilderConfig.substring(start + seachText.length - 1, i + 1);

    // Before remove all lines which contains comments.
    const optionsFilesNoComments = optionsFiles
        .split(/\r?\n/)
        .filter((x) => !x.trim().startsWith("//"))
        .join("\n");

    // Parse it to return an array.
    const optionsFilesArray = JSON.parse(optionsFilesNoComments);

    return optionsFilesArray;
}

electronBuilderConfigCheck.description = "Check the electron builder config";
gulp.task("electron-builder-config-check", electronBuilderConfigCheck);
