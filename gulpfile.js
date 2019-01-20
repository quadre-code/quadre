"use strict";

const gulp = require("gulp");

[
    "./tasks/nls-check",
    "./tasks/eslint",
    "./tasks/test",
    "./tasks/watch"
].forEach((taskfile) => {
    require(taskfile);
});

gulp.task("test", gulp.parallel("eslint", "nls-check"));
gulp.task("default", gulp.series("test"));
