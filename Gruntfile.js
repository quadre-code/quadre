/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*eslint-env node */
/*jslint node: true */
"use strict";

var pathLib = require("path");

module.exports = function (grunt) {
    // load dependencies
    require("load-grunt-tasks")(grunt, {
        pattern: [
            "grunt-*",
            "!grunt-cli"
        ]
    });
    grunt.loadTasks("tasks");

    // Project configuration.
    grunt.initConfig({
        pkg  : grunt.file.readJSON("package.json"),
        clean: {
            dist: {
                files: [{
                    dot: true,
                    src: [
                        "dist",
                        "src/.index.html",
                        "src/styles/brackets.css"
                    ]
                }]
            }
        },
        copy: {
            dist: {
                files: [
                    {
                        "dist/index.html": "src/.index.html"
                    },
                    /* static files */
                    {
                        expand: true,
                        dest: "dist/",
                        cwd: "src/",
                        src: [
                            "nls/{,*/}*.js",
                            "xorigin.js",
                            "dependencies.js",
                            "LiveDevelopment/launch.html",
                            "LiveDevelopment/transports/**",
                            "LiveDevelopment/MultiBrowserImpl/transports/**",
                            "LiveDevelopment/MultiBrowserImpl/launchers/**"
                        ]
                    },
                    /* node domains are not minified and must be copied to dist */
                    {
                        expand: true,
                        dest: "dist/",
                        cwd: "src/",
                        src: [
                            "extensibility/node/**",
                            "!extensibility/node/spec/**",
                            "!extensibility/node/node_modules/**/{test,tst}/**/*",
                            "!extensibility/node/node_modules/**/examples/**/*",
                            "filesystem/impls/appshell/node/**",
                            "!filesystem/impls/appshell/node/spec/**",
                            "search/node/**"
                        ]
                    },
                    /* extensions and CodeMirror modes */
                    {
                        expand: true,
                        dest: "dist/",
                        cwd: "src/",
                        src: [
                            "extensions/default/**/*",
                            "!extensions/default/*/unittest-files/**/*",
                            "!extensions/default/*/unittests.js",
                            "!extensions/default/{*/thirdparty,**/node_modules}/**/test/**/*",
                            "!extensions/default/{*/thirdparty,**/node_modules}/**/doc/**/*",
                            "!extensions/default/{*/thirdparty,**/node_modules}/**/examples/**/*",
                            "!extensions/default/*/thirdparty/**/*.htm{,l}",
                            "extensions/dev/*",
                            "extensions/samples/**/*",
                            "thirdparty/CodeMirror/**",
                            "thirdparty/i18n/*.js",
                            "thirdparty/text/*.js"
                        ]
                    },
                    /* styles, fonts and images */
                    {
                        expand: true,
                        dest: "dist/styles",
                        cwd: "src/styles",
                        src: ["jsTreeTheme.css", "fonts/{,*/}*.*", "images/*", "brackets.min.css*"]
                    }
                ]
            },
            thirdparty: {
                files: [
                    {
                        expand: true,
                        dest: "dist/www/thirdparty/CodeMirror",
                        cwd: "dist/www/node_modules/codemirror",
                        src: [
                            "addon/{,*/}*",
                            "keymap/{,*/}*",
                            "lib/{,*/}*",
                            "mode/{,*/}*",
                            "theme/{,*/}*"
                        ]
                    },
                    {
                        expand: true,
                        flatten: true,
                        dest: "dist/www/thirdparty",
                        cwd: "dist/www/node_modules",
                        src: [
                            "less/dist/less.min.js"
                        ]
                    },
                    {
                        expand: true,
                        dest: "dist/www/thirdparty/acorn",
                        cwd: "dist/www/node_modules/acorn",
                        src: [
                            "dist/{,*/}*"
                        ]
                    },
                    {
                        expand: true,
                        flatten: true,
                        dest: "dist/www/thirdparty",
                        cwd: "dist/www/node_modules",
                        src: [
                            "immutable/dist/immutable.js"
                        ]
                    },
                    {
                        expand: true,
                        flatten: true,
                        dest: "dist/www/thirdparty",
                        cwd: "dist/www/node_modules",
                        src: [
                            "react/umd/react.development.js"
                        ],
                        rename: function (path, name) {
                            name = name.replace(".development", "");
                            return pathLib.join(path, name);
                        }
                    },
                    {
                        expand: true,
                        flatten: true,
                        dest: "dist/www/thirdparty",
                        cwd: "dist/www/node_modules",
                        src: [
                            "react-dom/umd/react-dom.development.js",
                            "react-dom/umd/react-dom-test-utils.development.js"
                        ],
                        rename: function (path, name) {
                            name = name.replace(".development", "");
                            return pathLib.join(path, name);
                        }
                    },
                    {
                        expand: true,
                        flatten: true,
                        dest: "dist/www/thirdparty",
                        cwd: "dist/www/node_modules",
                        src: [
                            "create-react-class/create-react-class.js"
                        ]
                    },
                    {
                        expand: true,
                        dest: "dist/www/thirdparty/codemirror-addon-toggle-comment",
                        cwd: "dist/www/node_modules/codemirror-addon-toggle-comment/dist",
                        src: [
                            "toggle-comment-simple.min.js",
                            "toggle-comment-simple.js.map"
                        ]
                    }
                ]
            }
        },
        cleanempty: {
            options: {
                force: true,
                files: false
            },
            src: ["dist/**/*"]
        },
        less: {
            dist: {
                files: {
                    "src/styles/brackets.min.css": "src/styles/brackets.less"
                },
                options: {
                    compress: true,
                    sourceMap: true,
                    sourceMapFilename: "src/styles/brackets.min.css.map",
                    outputSourceFiles: true,
                    sourceMapRootpath: "",
                    sourceMapBasepath: "src/styles"
                }
            }
        },
        requirejs: {
            dist: {
                // Options: https://github.com/jrburke/r.js/blob/master/build/example.build.js
                options: {
                    // `name` and `out` is set by grunt-usemin
                    baseUrl: "src",
                    optimize: "uglify2",
                    // brackets.js should not be loaded until after polyfills defined in "utils/Compatibility"
                    // so explicitly include it in main.js
                    include: ["utils/Compatibility", "brackets"],
                    // TODO: Figure out how to make sourcemaps work with grunt-usemin
                    // https://github.com/yeoman/grunt-usemin/issues/30
                    generateSourceMaps: true,
                    useSourceUrl: true,
                    // required to support SourceMaps
                    // http://requirejs.org/docs/errors.html#sourcemapcomments
                    preserveLicenseComments: false,
                    useStrict: true,
                    // Disable closure, we want define/require to be globals
                    wrap: false,
                    exclude: ["text!config.json"],
                    uglify2: {} // https://github.com/mishoo/UglifyJS2
                }
            }
        },
        targethtml: {
            dist: {
                files: {
                    "src/.index.html": "src/index.html"
                }
            }
        },
        useminPrepare: {
            options: {
                dest: "dist"
            },
            html: "src/.index.html"
        },
        usemin: {
            options: {
                dirs: ["dist"]
            },
            html: ["dist/{,*/}*.html"]
        },
        htmlmin: {
            dist: {
                options: {
                    /*removeCommentsFromCDATA: true,
                    // https://github.com/yeoman/grunt-usemin/issues/44
                    //collapseWhitespace: true,
                    collapseBooleanAttributes: true,
                    removeAttributeQuotes: true,
                    removeRedundantAttributes: true,
                    useShortDoctype: true,
                    removeEmptyAttributes: true,
                    removeOptionalTags: true*/
                },
                files: [{
                    expand: true,
                    cwd: "src",
                    src: "*.html",
                    dest: "dist"
                }]
            }
        },
        "jasmine_node": {
            projectRoot: "src/extensibility/node/spec/"
        },
        shell: {
            repo: grunt.option("shell-repo") || "../brackets-shell",
            mac: "<%= shell.repo %>/installer/mac/staging/<%= pkg.name %>.app",
            win: "<%= shell.repo %>/installer/win/staging/<%= pkg.name %>.exe",
            linux: "<%= shell.repo %>/installer/linux/debian/package-root/opt/brackets/brackets"
        }
    });

    // task: install
    grunt.registerTask("install", [
        "write-config:dist",
        "sync-tsconfigs",
        "less",
        "npm-download-default-extensions"
        // "npm-install-source",
        // "pack-web-dependencies"
    ]);

    // task: set-release
    // Update version number in package.json and rewrite src/config.json
    grunt.registerTask("set-release", ["update-release-number", "write-config:dev"]);

    // task: dep-change - run when you modify dependencies in package.json
    grunt.registerTask("dep-change", [
        "npm-shrinkwrap"
    ]);

    // task: build - build stuff into dist folder
    grunt.registerTask("build", [
        "npm-install-dist",
        "npm-install-extensions-dist",
        "copy:thirdparty",
        "webpack-browser-dependencies"
    ]);

    // task: optimize - optimize contents of dist folder
    grunt.registerTask("optimize", [
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
    ]);

    // Default task.
    grunt.registerTask("default", ["test"]);
};
