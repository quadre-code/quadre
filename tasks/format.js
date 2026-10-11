/*
 * Copyright (c) 2024 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

"use strict";

const gulp = require("gulp");
const prettier = require("gulp-prettier");
const { meta } = require("./eslint");

function getGlobs() {
    const globs = [
        ...meta.app,
        // ...meta.src,
        "src/extensions/default/quadre-eslint/**/*.js",
        "src/extensions/default/quadre-eslint/**/*.ts",
        "!src/extensions/default/quadre-eslint/unittest-files/**/*.js",
        "!src/extensions/default/quadre-eslint/**/node_modules/**",
        // ...meta.test,
        ...meta.build,
    ];

    const positives = globs.filter((g) => !g.startsWith("!"));
    const negatives = globs.filter((g) => g.startsWith("!"));
    return [...positives, ...negatives];
}

function format() {
    return gulp
        .src(getGlobs())
        .pipe(prettier())
        .pipe(gulp.dest((file) => file.base));
}

format.description = "Format the source code";

gulp.task("format", format);

function validate() {
    return gulp.src(getGlobs()).pipe(prettier.check());
}

format.description = "Format the source code";

gulp.task("format-check", validate);
