"use strict";

const gulp = require("gulp");

[
    "./tasks/copy",
    "./tasks/download-default-extensions",
    "./tasks/nls-check",
    "./tasks/eslint",
    "./tasks/format",
    "./tasks/npm-install",
    "./tasks/test",
    "./tasks/watch",
    "./tasks/webpack",
    "./tasks/write-config",
].forEach((taskfile) => {
    require(taskfile);
});

gulp.task(
    "install",
    gulp.series(
        "write-config:dist",
        "npm-download-default-extensions",
        "npm-install-source",
        "webpack-browser-dependencies"
    )
);

gulp.task("build", gulp.series("npm-install-dist", "npm-install-extensions-dist"));

// task: optimize - optimize contents of dist folder
gulp.task(
    "optimize-common",
    gulp.series(
        // "eslint:src",
        // "clean",
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
        // "clean:node_modules_test_dir"
    )
);

// task: optimize
gulp.task(
    "optimize",
    gulp.series(
        // "write-config:dist",
        "optimize-common"
    )
);

// task: optimize-prerelease
gulp.task(
    "optimize-prerelease",
    gulp.series(
        // "write-config:prerelease",
        "optimize-common"
    )
);

gulp.task("test", gulp.parallel("eslint", "nls-check", "format-check"));
gulp.task("default", gulp.series("test"));
