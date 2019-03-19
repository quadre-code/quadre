"use strict";

const gulp = require("gulp");

[
    "./tasks/copy",
    "./tasks/download-default-extensions",
    "./tasks/nls-check",
    "./tasks/eslint",
    "./tasks/less",
    "./tasks/npm-install",
    "./tasks/test",
    "./tasks/watch",
    "./tasks/webpack",
    "./tasks/write-config"
].forEach((taskfile) => {
    require(taskfile);
});


gulp.task("install", gulp.series(
    "write-config:dist",
    "less",
    "npm-download-default-extensions",
    "npm-install-source",
    "webpack-browser-dependencies"
));

gulp.task("build", gulp.series(
    "npm-install-dist",
    "npm-install-extensions-dist"
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
