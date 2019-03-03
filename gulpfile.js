"use strict";

const gulp = require("gulp");

[
    "./tasks/download-default-extensions",
    "./tasks/nls-check",
    "./tasks/eslint",
    "./tasks/less",
    "./tasks/npm-install",
    "./tasks/test",
    "./tasks/watch",
    "./tasks/write-config"
].forEach((taskfile) => {
    require(taskfile);
});


gulp.task("install", gulp.series(
    "write-config:dist",
    "less",
    "npm-download-default-extensions",
    "npm-install-source"
    // "pack-web-dependencies"
));

gulp.task("build", gulp.series(
    "npm-install-dist",
    "npm-install-extensions-dist"
    // "copy:thirdparty",
    // "webpack-browser-dependencies"
));

// task: optimize - optimize contents of dist folder
gulp.task("optimize", gulp.series(
    // "eslint:src",
    // "clean",
    // "less",
    // "targethtml",
    // "useminPrepare",
    // "htmlmin",
    // "requirejs",
    // "concat",
    // "cssmin",
    // "uglify",
    // "copy:dist",
    // "cleanempty",
    // "usemin",
    "build-config"
));

gulp.task("test", gulp.parallel("eslint", "nls-check"));
gulp.task("default", gulp.series("test"));
