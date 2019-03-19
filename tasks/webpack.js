"use strict";

const gulp = require("gulp");
const PluginError = require("plugin-error");
const _       = require("lodash");
const path    = require("path");
const spawn   = require("cross-spawn");

function browserDependencies(cb) {
    const webpackPath = path.resolve(
        __dirname,
        "..",
        "node_modules",
        ".bin",
        process.platform === "win32" ? "webpack.cmd" : "webpack"
    );
    const webpackTasks = [
        [
            "--entry=./node_modules/semver/semver.js",
            "--output=./src/thirdparty/semver.browser.js",
            "--output-library-target=amd",
            "--mode=development"
        ]
    ];
    const doneWithWebpackTask = _.after(webpackTasks.length, cb);
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
            if (code === 0) {
                doneWithWebpackTask();
                return;
            }

            const err = new PluginError("webpack-browser-dependencies", `Something went wrong: code ${ code }`);
            return cb(err);
        });
    });
}
browserDependencies.description = "Runs webpack on stuff we need to use from browser";

gulp.task("webpack-browser-dependencies", browserDependencies);
