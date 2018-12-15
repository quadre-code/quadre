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

const _       = require("lodash");
const common  = require("./lib/common");
const file    = require("./lib/file");
const exec    = require("child_process").exec;
const _spawn  = require("child_process").spawn;
const fs      = require("fs-extra");
const glob    = require("glob");
const https   = require("https");
const path    = require("path");
const tar     = require("tar");
const temp    = require("temp");
const zlib    = require("zlib");

module.exports = function (grunt) {
    temp.track();

    function spawn(what, args, options, callback) {
        var child = _spawn(what, args, options);
        child.on("error", function (err) {
            return callback(err, null, err.toString());
        });
        var stdout = [];
        child.stdout.addListener("data", function (buffer) {
            stdout.push(buffer);
        });
        var stderr = [];
        child.stderr.addListener("data", function (buffer) {
            stderr.push(buffer);
        });
        var exitCode;
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

        var cmd = "npm install";
        if (productionMode) {
            cmd += " --production";
        }

        grunt.log.writeln("running " + cmd + " in " + where);

        exec(cmd, { cwd: "./" + where }, function (err, stdout, stderr) {
            if (err) {
                grunt.log.error(stderr);
                return callback(stderr);
            }
            if (stdout) { grunt.log.writeln(stdout); }
            grunt.log.writeln("finished npm install --production in " + where);
            if (!stdout) {
                // nothing done by npm, skip electron-rebuild
                grunt.log.writeln("skipping electron-rebuild in " + where);
                return callback(null);
            }
            var npmRebuildPath = path.resolve(
                __dirname,
                "..",
                "node_modules",
                ".bin",
                process.platform === "win32" ? "electron-rebuild.cmd" : "electron-rebuild"
            );
            var args = [
                "-m=" + path.resolve(__dirname, "..", where)
            ];
            grunt.log.writeln("running electron-rebuild " + args.join(" "));
            spawn(npmRebuildPath, args, { cwd: "./" + where }, function (err, stdout, stderr) {
                if (err) {
                    if (stderr) {
                        grunt.log.error(stderr);
                    } else {
                        grunt.log.error(err);
                    }
                    grunt.log.writeln("failed electron-rebuild in " + where);
                    return callback(err);
                }
                if (stdout) { grunt.log.writeln(stdout); }
                grunt.log.writeln("finished electron-rebuild in " + where);
                callback(null);
            });
        });
    }

    grunt.registerTask("npm-install-dist", "Install node_modules to the dist folder so it gets bundled with release", function () {
        /*
        try {
            const npmShrinkwrapJSON = file.readJSON("src/npm-shrinkwrap.json");
            common.writeJSON("dist/npm-shrinkwrap.json", npmShrinkwrapJSON);
        } catch (err) {
            grunt.log.error(err);
        }
        */

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

        var done = this.async();
        runNpmInstall("dist", function (err) {
            if (err) {
                return done(false);
            }

            // dist/www/node_modules
            const packageJSONSrc = file.readJSON("src/package.json");
            appJson.dependencies = {};
            for (var key in packageJSONSrc.dependencies) {
                appJson.dependencies[key] = packageJSONSrc.dependencies[key];
            }
            common.writeJSON("dist/www/package.json", appJson);

            runNpmInstall("dist/www", function (err) {
                return err ? done(false) : done();
            });
        });
    });

    grunt.registerTask("npm-install-src", "Install node_modules to the src folder", function () {
        var done = this.async();
        runNpmInstall("src", function (err) {
            if (err) {
                done(false);
            }
            done();
        });
    });

    function npmInstallExtensions(globs, filterOutNodeModules = true, runProduction = true) {
        return new Promise(function (resolve) {
            var result;
            var doneWithGlob = _.after(globs.length, () => {
                resolve(result);
            });
            globs.forEach(g => {
                glob(g, function (err, files) {
                    if (err) {
                        grunt.log.error(err);
                        result = false;
                        return doneWithGlob();
                    }
                    if (filterOutNodeModules) {
                        files = files.filter(function (path) {
                            return path.indexOf("node_modules") === -1;
                        });
                    }
                    var doneWithFile = _.after(files.length, doneWithGlob);
                    files.forEach(function (file) {
                        runNpmInstall(path.dirname(file), runProduction, function (err) {
                            if (err) {
                                result = false;
                            }
                            return doneWithFile();
                        });
                    });
                });
            });
        });
    }

    grunt.registerTask("npm-install-extensions-src", "Install node_modules for default extensions which have package.json defined", function () {
        var doneWithTask = this.async();
        npmInstallExtensions([
            "src/www/+(extensibility|extensions|LiveDevelopment)/**/package.json"
        ]).then(function (result) {
            doneWithTask(result);
        });
    });

    grunt.registerTask("npm-install-extensions-dist", "Install node_modules for default extensions which have package.json defined", function () {
        var doneWithTask = this.async();
        Promise.all([
            npmInstallExtensions([
                "dist/www/node_modules/codemirror/package.json" // make sure codemirror builds
            ], false, false),
            npmInstallExtensions([
                "dist/www/+(extensibility|extensions|LiveDevelopment)/**/package.json"
            ])
        ]).then(function (results) {
            var result = !results.some(x => x != null);
            doneWithTask(result);
        }).catch(function (err) {
            grunt.log.error("err " + err);
            doneWithTask(false);
        });
    });

    grunt.registerTask(
        "npm-install-source",
        "Install node_modules for src folder and default extensions which have package.json defined",
        ["npm-install-src", "copy:thirdparty", "npm-install-extensions"]
    );

    function getNodeModulePackageUrl(extensionName) {
        return new Promise(function (resolve, reject) {
            exec("npm view " + extensionName + " dist.tarball", {}, function (err, stdout, stderr) {
                if (err) {
                    grunt.log.error(stderr);
                }
                return err ? reject(stderr) : resolve(stdout.toString("utf8").trim());
            });
        });
    }

    function getTempDirectory(tempName) {
        return new Promise(function (resolve, reject) {
            temp.mkdir(tempName, function(err, dirPath) {
                return err ? reject(err) : resolve(dirPath);
            });
        });
    }

    function downloadUrlToFolder(url, dirPath) {
        return new Promise(function (resolve, reject) {
            grunt.log.writeln(url + " downloading...");
            https.get(url, function (res) {

                if (res.statusCode !== 200) {
                    return reject(new Error("Request failed: " + res.statusCode));
                }

                var unzipStream = zlib.createGunzip();
                res.pipe(unzipStream);

                var extractStream = tar.Extract({ path: dirPath, strip: 0 });
                unzipStream.pipe(extractStream);

                extractStream.on("finish", function() {
                    grunt.log.writeln(url + " successfully downloaded");
                    resolve(path.resolve(dirPath, "package"));
                });

            }).on("error", function(err) {
                reject(err);
            });
        });
    }

    function move(from, to) {
        return new Promise(function (resolve, reject) {
            fs.remove(to, function (err) {
                if (err) {
                    return reject(err);
                }
                fs.move(from, to, function (err) {
                    if (err) {
                        return reject(err);
                    }
                    return resolve();
                });
            });
        });
    }

    function downloadAndInstallExtensionFromNpm(obj) {
        var extensionName = obj.name;
        var extensionVersion = obj.version ? "@" + obj.version : "";
        var data = {};
        return getNodeModulePackageUrl(extensionName + extensionVersion)
            .then(function (urlToDownload) {
                data.urlToDownload = urlToDownload;
                return getTempDirectory(extensionName);
            })
            .then(function (tempDirPath) {
                data.tempDirPath = tempDirPath;
                return downloadUrlToFolder(data.urlToDownload, data.tempDirPath);
            })
            .then(function (extensionPath) {
                var target = path.resolve(__dirname, "..", "src", "extensions", "default", extensionName);
                return move(extensionPath, target);
            });
    }

    grunt.registerTask(
        "npm-download-default-extensions",
        "Downloads extensions from npm and puts them to the src/extensions/default folder",
        function () {
            var packageJSON = file.readJSON("package.json");
            var extensionsToDownload = Object
                .keys(packageJSON.defaultExtensions)
                .map(function (name) {
                    return {
                        name: name,
                        version: packageJSON.defaultExtensions[name]
                    };
                });

            var done = this.async();
            Promise.all(extensionsToDownload.map(function (extension) {
                return downloadAndInstallExtensionFromNpm(extension);
            })).then(function () {
                return done();
            }).catch(function (err) {
                grunt.log.error(err);
                return done(false);
            });
        }
    );

};
