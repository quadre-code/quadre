"use strict";

const _       = require("lodash");
const path    = require("path");
const spawn   = require("child_process").spawn;

module.exports = function (grunt) {

    grunt.registerTask("pack-web-dependencies", "Runs webpack on stuff we need to use from browser", function () {
        var done = this.async();
        var webpackPath = path.resolve(
            __dirname,
            "..",
            "node_modules",
            ".bin",
            process.platform === "win32" ? "webpack.cmd" : "webpack"
        );
        var webpackTasks = [
            [
                "./node_modules/semver/semver.js",
                "./src/thirdparty/semver.browser.js",
                "-p",
                "--output-library-target=amd"
            ]
        ];
        var doneWithWebpackTask = _.after(webpackTasks.length, done);
        webpackTasks.forEach(function (args) {
            var wp = spawn(webpackPath, args, {
                cwd: path.resolve(__dirname, "..")
            });
            wp.stdout.on("data", function (data) {
                console.log("webpack-stdout: " + data.toString());
            });
            wp.stderr.on("data", function (data) {
                console.log("webpack-stderr: " + data.toString());
            });
            wp.on("close", function (code) {
                console.log("webpack-exit code " + code.toString());
                return code === 0 ? doneWithWebpackTask() : done(false);
            });
        });
    });

};
