/*
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

"use strict";

const gulp = require("gulp");
const less = require("gulp-less");
const sourcemaps = require("gulp-sourcemaps");
const cleanCSS = require("gulp-clean-css");
const rename = require("gulp-rename");
const path = require("path");

gulp.task("less", function () {
    return gulp.src("src/styles/brackets.less")
        .pipe(sourcemaps.init())
        .pipe(less({
            paths: [
                path.join(__dirname, "dist", "www", "styles")
            ],
            math: "always"
        }))
        .pipe(cleanCSS({ compatibility: "ie7" }))
        .pipe(rename({
            suffix: ".min"
        }))
        .pipe(sourcemaps.write("."))
        .pipe(gulp.dest("dist/www/styles"));
});
