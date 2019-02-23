"use strict";

const _       = require("lodash");
const path    = require("path");
const spawn   = require("cross-spawn");

module.exports = function (grunt) {

    grunt.registerTask("webpack-browser-dependencies", "Runs webpack on stuff we need to use from browser", function () {
        const done = this.async();
        const webpackPath = path.resolve(
            __dirname,
            "..",
            "node_modules",
            ".bin",
            process.platform === "win32" ? "webpack.cmd" : "webpack"
        );
        const webpackTasks = [
            [
                "./dist/node_modules/semver/semver.js",
                "./dist/www/thirdparty/semver.browser.js",
                "--output-library-target=amd"
            ]
        ];
        const doneWithWebpackTask = _.after(webpackTasks.length, done);
        webpackTasks.forEach(args => {
            const wp = spawn(webpackPath, args, {
                cwd: path.resolve(__dirname, "..")
            });
            wp.stdout.on("data", (data) => {
                console.log(`webpack-stdout: ${data}`);
            });
            wp.stderr.on("data", (data) => {
                console.log(`webpack-stderr: ${data}`);
            });
            wp.on("close", (code) => {
                console.log(`webpack-exit code ${code}`);
                return code === 0 ? doneWithWebpackTask() : done(false);
            });
        });
    });

};
