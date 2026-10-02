/*
 * Copyright (c) 2024 - present The quadre code authors. All rights reserved.
 * @license MIT
 *
 */

import path from "node:path";
import { Configuration, css } from "webpack";
import TranspilePlugin from "transpile-webpack-plugin";
import nodeExternals from "webpack-node-externals";
import MinimizerPlugin from "minimizer-webpack-plugin";

const { cssMinify } = css.syntax;

const configs: Array<Configuration> = [
    // App
    {
        entry: [
            "./app/index.ts",
            // Used by `app/main.ts` through `path.resolve`.
            "./app/preload.ts",
            // Used by `src/utils/UpdateNotification.ts`
            "./app/xml-utils.ts",
            // Used by `app/appshell/index.ts` through `electronRemote.require`.
            "./app/appshell/app-menu.ts",
            "./app/appshell/shell.ts",
            // Used by `app/socket-server/index.ts` through DomainManager.loadDomainModulesFromPaths.
            "./app/socket-server/BaseDomain.ts",
            // Used by `src/utils/NodeConnection.ts`
            "./app/node-process/base.ts",
            // Used by `app/node-process/base.ts` through DomainManager.loadDomainModulesFromPaths.
            "./app/node-process/BaseDomain.ts",
        ],
        output: {
            path: path.resolve(__dirname, "dist"),
        },
        mode: "development",
        devtool: "source-map",
        target: "node",
        externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
        externals: [nodeExternals()], // in order to ignore all modules in node_modules folder
        module: {
            parser: {
                javascript: {
                    commonjsMagicComments: true,
                },
            },
            rules: [
                {
                    test: /\.tsx?$/,
                    use: "ts-loader",
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: [".tsx", ".ts"],
        },
        plugins: [
            new TranspilePlugin({
                extentionMapping: {
                    ".ts": ".js",
                }
            }),
        ],
        stats: {
            errorDetails: true
        }
    },
    // Filesystem impls
    {
        entry: "./src/filesystem/impls/appshell/node/FileWatcherDomain.ts",
        output: {
            path: path.resolve(__dirname, "dist/www/filesystem/impls/appshell/node"),
        },
        mode: "development",
        devtool: "source-map",
        target: "node",
        externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
        externals: [nodeExternals()], // in order to ignore all modules in node_modules folder
        module: {
            parser: {
                javascript: {
                    commonjsMagicComments: true,
                },
            },
            rules: [
                {
                    test: /\.tsx?$/,
                    use: "ts-loader",
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: [".tsx", ".ts"],
        },
        plugins: [
            new TranspilePlugin({
                extentionMapping: {
                    ".ts": ".js",
                }
            }),
        ],
        stats: {
            errorDetails: true
        }
    },
    // Extension TypeScriptTooling
    {
        entry: "./src/extensions/default/TypeScriptTooling/node/client.ts",
        output: {
            path: path.resolve(__dirname, "dist/www/extensions/default/TypeScriptTooling/node"),
        },
        target: "node",
        mode: "development",
        devtool: "source-map",
        module: {
            parser: {
                javascript: {
                    commonjsMagicComments: true,
                },
            },
            rules: [
                {
                    test: /\.tsx?$/,
                    use: "ts-loader",
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: [".tsx", ".ts"],
        },
        plugins: [
            new TranspilePlugin({
                extentionMapping: {
                    ".ts": ".js",
                }
            }),
        ],
        stats: {
            errorDetails: true
        }
    },
    {
        entry: "./src/styles/brackets.less",
        output: {
            cssFilename: "brackets.min.css",
            filename: "brackets-deleteme.min.js",
            path: path.resolve(__dirname, "dist/www/styles"),
        },
        mode: "production",
        devtool: "source-map",
        module: {
            rules: [
                {
                    test: /\.less$/,
                    use: [
                        {
                            loader: "less-loader",
                            options: {
                                lessOptions: {
                                    math: "always"
                                }
                            }
                        }
                    ],
                    type: "css/auto",
                    parser: {
                        // Do not try to resolve nonexistent images.
                        // For example: ../img/glyphicons-halflings.png
                        url: false
                    },
                },
            ],
        },
        optimization: {
            minimize: true,
            minimizer: [
                new MinimizerPlugin({
                    // test: /\.(?:[cm]?js|css|html|json)(\?.*)?$/i,
                    // minify: [
                    //     { implementation: MinimizerPlugin.terserMinify },
                    //     { implementation: cssMinify },
                    //     { implementation: htmlMinify },
                    //     { implementation: MinimizerPlugin.jsonMinify },
                    // ],
                    test: /\.(?:css)(\?.*)?$/i,
                    minify: [
                        { implementation: cssMinify },
                    ],
                }),
            ]
        },
        stats: {
            errorDetails: true
        }
    },
];

export default configs;
