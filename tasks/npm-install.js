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

const gulp    = require("gulp");
const log     = require("fancy-log");
const PluginError = require("plugin-error");
const _       = require("lodash");
const common  = require("./lib/common");
const file    = require("./lib/file");
const exec    = require("child_process").exec;
const _spawn  = require("child_process").spawn;
const glob    = require("glob");
const path    = require("path");

function spawn(what, args, options, callback) {
    const child = _spawn(what, args, options);
    child.on("error", function (err) {
        return callback(err, null, err.toString());
    });
    let stdout = [];
    child.stdout.addListener("data", function (buffer) {
        stdout.push(buffer);
    });
    let stderr = [];
    child.stderr.addListener("data", function (buffer) {
        stderr.push(buffer);
    });
    let exitCode;
    child.addListener("exit", function (code) {
        exitCode = code;
    });
    child.addListener("close", function () {
        stderr = Buffer.concat(stderr);
        stdout = Buffer.concat(stdout);
        return callback(exitCode > 0 ? new Error(stderr) : null, stdout, stderr);
    });
    child.stdin.end();
}

function runNpmInstall(where, productionMode, callback) {
    if (typeof productionMode === "function") {
        callback = productionMode;
        productionMode = true;
    }

    let cmd = "npm install";
    if (productionMode) {
        cmd += " --production";
    }

    log.info("running " + cmd + " in " + where);

    exec(cmd, { cwd: "./" + where }, function (err, stdout, stderr) {
        if (err) {
            log.error(stderr);
            const errPlugin = new PluginError("runNpmInstall", err, { showStack: true });
            return callback(errPlugin);
        }

        if (stdout) {
            log.info(stdout);
        }
        log.info("finished npm install --production in " + where);
        if (!stdout) {
            // nothing done by npm, skip electron-rebuild
            log.info("skipping electron-rebuild in " + where);
            return callback();
        }
        const npmRebuildPath = path.resolve(
            __dirname,
            "..",
            "node_modules",
            ".bin",
            process.platform === "win32" ? "electron-rebuild.cmd" : "electron-rebuild"
        );
        const args = [
            "-m=" + path.resolve(__dirname, "..", where)
        ];
        log.info("running electron-rebuild " + args.join(" "));
        spawn(npmRebuildPath, args, { cwd: "./" + where }, function (errSpawn, stdoutSpawn, stderrSpawn) {
            if (errSpawn) {
                if (stderrSpawn) {
                    log.error(stderrSpawn);
                } else {
                    log.error(errSpawn);
                }
                log.error("failed electron-rebuild in " + where);
                const errPlugin = new PluginError("runNpmInstall", errSpawn, { showStack: true });
                return callback(errPlugin);
            }

            if (stdoutSpawn) {
                log.info(stdoutSpawn);
            }
            log.info("finished electron-rebuild in " + where);
            callback();
        });
    });
}


function npmInstallDist(cb) {
    // Top level npm-shrinkwrap file is not copied over. Do it now.
    const npmShrinkwrapJSON = file.readJSON("npm-shrinkwrap.json");
    common.writeJSON("dist/npm-shrinkwrap.json", npmShrinkwrapJSON);

    const packageJSON = file.readJSON("package.json");
    const appJson = _.pick(packageJSON, [
        "name",
        "productName",
        "description",
        "author",
        "license",
        "homepage",
        "version",
        "apiVersion",
        "issues",
        "repository",
        "dependencies",
        "optionalDependencies"
    ]);

    common.writeJSON("dist/package.json", appJson);

    runNpmInstall("dist", function (err) {
        if (err) {
            log.error(err);
            const errPlugin = new PluginError("npm-install-dist", err, { showStack: true });
            return cb(errPlugin);
        }

        // dist/www/node_modules
        const packageJSONSrc = file.readJSON("src/package.json");
        const srcJson = _.omit(packageJSONSrc, [
            "scripts"
        ]);
        common.writeJSON("dist/www/package.json", srcJson);

        const dirs = ["dist/www"];
        const done = _.after(dirs.length, cb);

        dirs.forEach(function (dir) {
            runNpmInstall(dir, function (errSrc) {
                if (errSrc) {
                    log.error(errSrc);
                    const errPlugin = new PluginError("npm-install-dist", errSrc, { showStack: true });
                    return cb(errPlugin);
                }

                done();
            });
        });
    });
}
npmInstallDist.description = "Install node_modules to the dist folder so it gets bundled with release";
gulp.task("npm-install-dist", npmInstallDist);


function npmInstallSrc(cb) {
    const dirs = ["src"];
    const done = _.after(dirs.length, cb);

    dirs.forEach(function (dir) {
        runNpmInstall(dir, false, function (err) {
            if (err) {
                log.error(err);
                const errPlugin = new PluginError("npm-install-src", err, { showStack: true });
                return cb(errPlugin);
            }

            done();
        });
    });
}
npmInstallSrc.description = "Install node_modules to the src folder";
gulp.task("npm-install-src", npmInstallSrc);


function npmInstallExtensions(globs, filterOutNodeModules = true, runProduction = true) {
    return new Promise(function (resolve) {
        let error;
        const doneWithGlob = _.after(globs.length, () => {
            resolve(error);
        });
        globs.forEach(g => {
            glob(g, function (err, files) {
                if (err) {
                    log.error(err);
                    error = err;
                    return doneWithGlob();
                }
                if (filterOutNodeModules) {
                    files = files.filter(function (_path) {
                        return _path.indexOf("node_modules") === -1;
                    });
                }
                const doneWithFile = _.after(files.length, doneWithGlob);
                files.forEach(function (_file) {
                    const packageJSON = file.readJSON(_file);
                    if (!packageJSON.dependencies || !Object.keys(packageJSON.dependencies).length) {
                        return doneWithFile();
                    }

                    runNpmInstall(path.dirname(_file), runProduction, function (errFile) {
                        if (errFile) {
                            log.error(errFile);
                            error = errFile;
                        }
                        return doneWithFile();
                    });
                });
            });
        });
    });
}

function npmInstallExtensionsSrc(cb) {
    npmInstallExtensions([
        "src/+(extensibility|extensions|LiveDevelopment)/**/package.json"
    ]).then(function (err) {
        if (err) {
            const errPlugin = new PluginError("npm-install-extensions-src", err, { showStack: true });
            return cb(errPlugin);
        }

        cb();
    });
}
npmInstallExtensionsSrc.description = "Install node_modules for default extensions which have package.json defined";
gulp.task("npm-install-extensions-src", npmInstallExtensionsSrc);

function npmInstallExtensionsDist(cb) {
    Promise.all([
        npmInstallExtensions([
            "dist/www/node_modules/codemirror/package.json" // make sure codemirror builds
        ], false, false),
        npmInstallExtensions([
            "dist/www/+(extensibility|extensions|LiveDevelopment)/**/package.json"
        ])
    ]).then(function (results) {
        const hasError = results.some(x => x !== null && x !== undefined);
        if (hasError) {
            return cb(hasError);
        }

        cb();
    }).catch(function (err) {
        log.error("err " + err);
        const errPlugin = new PluginError("npm-install-extensions-dist", err, { showStack: true });
        return cb(errPlugin);
    });
}
npmInstallExtensionsDist.description = "Install node_modules for default extensions which have package.json defined";
gulp.task("npm-install-extensions-dist", npmInstallExtensionsDist);


gulp.task("npm-install-source", gulp.series(
    "npm-install-src",
    "copy-thirdparty"
    // "npm-install-extensions-src"
));
