"use strict";

const gulp = require("gulp");

[
    "./tasks/nls-check",
    "./tasks/eslint",
    "./tasks/test",
    "./tasks/watch",
    "./tasks/write-config"
].forEach((taskfile) => {
    require(taskfile);
});


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
