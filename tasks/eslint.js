/*
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

"use strict";

const gulp = require("gulp");
const eslint = require("gulp-eslint-new");

const meta = {
    app: [
        "app/**/*.js",
        "app/**/*.ts"
    ],
    src: [
        "src/**/*.js",
        "src/**/*.ts",
        "!src/thirdparty/**",
        "!src/widgets/bootstrap-*.js",
        "!src/extensions/**/unittest-files/**/*.js",
        "!src/extensions/**/thirdparty/**/*.js",
        "!src/extensions/default/quadre-eslint/**",
        "!src/extensions/default/quadre-git/**",
        "!src/extensions/dev/**",
        "!src/extensions/disabled/**",
        "!**/node_modules/**",
        "!src/**/*-min.js",
        "!src/**/*.min.js"
    ],
    test: [
        "test/**/*.js",
        "test/**/*.ts",
        "!test/perf/*-files/**/*.js",
        "!test/spec/*-files/**/*.js",
        "!test/spec/*-known-goods/**/*.js",
        "!test/spec/FindReplace-test-files-*/**/*.js",
        "!test/smokes/**",
        "!test/temp/**",
        "!test/thirdparty/**",
        "!test/**/node_modules/**/*.js",
        "test/spec/LanguageTools-test-files/**/*.js",
        "test/spec/LanguageTools-test-files/**/*.ts"
    ],
    build: [
        "Gruntfile.js",
        "gulpfile.js",
        "tasks/**/*.js",
        "tasks/**/*.ts"
    ]
};

function eslintTask(files) {
    // To automatically fix issues add `fix: true` to the eslint options and
    // `.pipe(gulp.dest("./"));` at the end of the pipe.
    return gulp.src(files, { base: "." })
        .pipe(eslint({
            quiet: true
        }))
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
}

gulp.task("eslint:app", () => {
    return eslintTask(meta.app);
});

gulp.task("eslint:src", () => {
    return eslintTask(meta.src);
});

gulp.task("eslint:test", () => {
    return eslintTask(meta.test);
});

gulp.task("eslint:build", () => {
    return eslintTask(meta.build);
});

gulp.task("eslint", gulp.parallel(
    "eslint:build",
    "eslint:app",
    "eslint:src",
    "eslint:test"
));
