import path from "node:path";
import { Configuration } from "webpack";
import TranspilePlugin from "transpile-webpack-plugin";
import nodeExternals from "webpack-node-externals";

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
            // Used by `app\socket-server\index.ts` through DomainManager.loadDomainModulesFromPaths.
            "./app/socket-server/BaseDomain.ts",
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
    }
];

export default configs;
