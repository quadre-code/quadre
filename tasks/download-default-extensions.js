"use strict";

const file    = require("./lib/file");
const exec    = require("child_process").exec;
const fs      = require("fs-extra");
const https   = require("https");
const path    = require("path");
const tar     = require("tar");
const temp    = require("temp");
const zlib    = require("zlib");

module.exports = function (grunt) {
    temp.track();

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

                const unzipStream = zlib.createGunzip();
                res.pipe(unzipStream);

                const extractStream = tar.extract({ cwd: dirPath, strip: 0 });
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
            fs.remove(to, function (errRemove) {
                if (errRemove) {
                    return reject(errRemove);
                }
                fs.move(from, to, function (errMove) {
                    if (errMove) {
                        return reject(errMove);
                    }
                    return resolve();
                });
            });
        });
    }

    function downloadAndInstallExtensionFromNpm(obj) {
        const extensionName = obj.name;
        const extensionVersion = obj.version ? "@" + obj.version : "";
        const data = {};
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
                const target = path.resolve(__dirname, "..", "src", "extensions", "default", extensionName);
                return move(extensionPath, target);
            });
    }

    grunt.registerTask(
        "npm-download-default-extensions",
        "Downloads extensions from npm and puts them to the src/extensions/default folder",
        function () {
            const packageJSON = file.readJSON("package.json");
            const extensionsToDownload = Object
                .keys(packageJSON.defaultExtensions)
                .map(function (name) {
                    return {
                        name: name,
                        version: packageJSON.defaultExtensions[name]
                    };
                });

            const done = this.async();
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
