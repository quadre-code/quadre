/*
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

"use strict";

const gulp = require("gulp");
const rename = require("gulp-rename");

gulp.task("copy-thirdparty-codemirror", function () {
    return gulp.src(
        [
            "addon/{,*/}*",
            "keymap/{,*/}*",
            "lib/{,*/}*",
            "mode/{,*/}**",
            "theme/{,*/}*"
        ],
        {
            cwd: "src/node_modules/codemirror",
            base: "src/node_modules/codemirror"
        }
    )
        .pipe(gulp.dest("src/thirdparty/CodeMirror"));
});

gulp.task("copy-thirdparty-less", function () {
    return gulp.src(
        "dist/less.min.js",
        {
            cwd: "src/node_modules/less"
        }
    )
        .pipe(gulp.dest("src/thirdparty"));
});

gulp.task("copy-thirdparty-acorn", function () {
    return gulp.src(
        "dist/{,*/}*",
        {
            cwd: "src/node_modules/acorn"
        }
    )
        .pipe(gulp.dest("src/thirdparty/acorn"));
});

gulp.task("copy-thirdparty-immutable", function () {
    return gulp.src(
        "dist/immutable.js",
        {
            cwd: "src/node_modules/immutable"
        }
    )
        .pipe(gulp.dest("src/thirdparty"));
});

gulp.task("copy-thirdparty-react", function () {
    return gulp.src(
        "umd/react.development.js",
        {
            cwd: "src/node_modules/react"
        }
    )
        .pipe(rename(function (path) {
            path.basename = path.basename.replace(".development", "");
        }))
        .pipe(gulp.dest("src/thirdparty"));
});

gulp.task("copy-thirdparty-react-dom", function () {
    return gulp.src(
        [
            "umd/react-dom.development.js",
            "umd/react-dom-test-utils.development.js"
        ],
        {
            cwd: "src/node_modules/react-dom"
        }
    )
        .pipe(rename(function (path) {
            path.basename = path.basename.replace(".development", "");
        }))
        .pipe(gulp.dest("src/thirdparty"));
});

gulp.task("copy-thirdparty-create-react-class", function () {
    return gulp.src(
        "create-react-class.js",
        {
            cwd: "src/node_modules/create-react-class"
        }
    )
        .pipe(gulp.dest("src/thirdparty"));
});

gulp.task("copy-thirdparty-codemirror-addon-toggle-comment", function () {
    return gulp.src(
        [
            "dist/toggle-comment-simple.js",
            "dist/toggle-comment-simple.min.js",
            "dist/toggle-comment-simple.js.map"
        ],
        {
            cwd: "src/node_modules/codemirror-addon-toggle-comment"
        }
    )
        .pipe(gulp.dest("src/thirdparty/codemirror-addon-toggle-comment"));
});


gulp.task("copy-thirdparty", gulp.parallel(
    "copy-thirdparty-codemirror",
    "copy-thirdparty-less",
    "copy-thirdparty-acorn",
    "copy-thirdparty-immutable",
    "copy-thirdparty-react",
    "copy-thirdparty-react-dom",
    "copy-thirdparty-create-react-class",
    "copy-thirdparty-codemirror-addon-toggle-comment"
));
