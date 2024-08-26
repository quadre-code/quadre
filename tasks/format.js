/*
 * Copyright (c) 2024 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

"use strict";

const gulp = require("gulp");
const prettier = require("gulp-prettier");
// const { meta } = require("./eslint");

const options = {
    printWidth: 100,
    tabWidth: 4,
    semi: true,
    trailingComma: "es5",
};

function getGlobs() {
    const globs = [
        "gulpfile.js",
        // ...meta.app,
        // ...meta.src,
        // ...meta.test,
        // ...meta.build,
    ];
    return globs;
}

function format() {
    return gulp
        .src(getGlobs())
        .pipe(prettier(options))
        .pipe(gulp.dest((file) => file.base));
}

format.description = "Format the source code";

gulp.task("format", format);

function validate() {
    return gulp.src(getGlobs()).pipe(prettier.check(options));
}

format.description = "Format the source code";

gulp.task("format-check", validate);
