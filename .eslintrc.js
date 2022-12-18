module.exports = {
    "extends": "moody-tsx",
    "env": {
        "es6": true
    },
    "rules": {
        "guard-for-in": "off",
        "max-len": "off",
        "new-cap": ["error", {
            capIsNewExceptions: [
                "CodeMirror",
                "CodeMirror.Pos",
                "Immutable.List",
                "Immutable.Map",
                "$.Deferred",
                "$.Event"
            ]
        }],
        "no-console": "off",
        "no-invalid-this": "off",
        "no-shadow": "warn",
    },
    "globals": {
        "$": false,
        "appshell": false,
        "brackets": false,
        "clearTimeout": false,
        "define": false,
        "node": false,
        "Promise": false,
        "require": false,
        "setTimeout": false,
        "window": false,
        "ArrayBuffer": false,
        "Uint32Array": false,
        "WebSocket": false,
        "XMLHttpRequest": false
    },
    "overrides": [
        // TypeScript
        {
            "files": [
                "**/*.ts",
                "**/*.tsx"
            ],
            "excludedFiles": "**/*.js",
            "rules": {
                "@typescript-eslint/naming-convention": "off",
                "@typescript-eslint/no-shadow": "warn"
            }
        },
        // app/
        {
            "files": [ "app/**" ],
            "env": {
                "node": true
            }
        },
        // src/
        {
            "files": [
                "src/**",
                "!src/**/node/**",
                "!src/languageTools/LanguageClient/**"
            ],
            "globals": {
                "electron": false,
                "electronRemote": false,
                "exports": false,
                "module": false
            }
        },
        // src/
        {
            "files": [
                "src/dependencies.ts",
                "src/main.ts",
                "src/xorigin.ts"
            ],
            "parserOptions": {
                "sourceType": "script",
            },
        },
        // src/ node files
        {
            "files": [
                "src/**/node/**",
                "src/languageTools/LanguageClient/**"
            ],
            "env": {
                "node": true
            }
        },
        // Build files
        {
            "files": [
                "Gruntfile.js",
                "gulpfile.js",
                "tasks/**/*.js"
            ],
            "parserOptions": {
                "ecmaVersion": 6
            },
            "env": {
                "node": true,
            },
            "rules": {
                // http://eslint.org/docs/rules/#stylistic-issues
                "one-var": ["error", { let: "never", const: "never" }],
                "one-var-declaration-per-line": ["error", "always"],
                // https://eslint.org/docs/rules/#ecmascript-6
                "no-var": "error",
                "prefer-const": "error",
            }
        },
        // Tests
        {
            "files": [
                "test/**",
                "src/extensions/default/**/unittests.js",
                "src/extensions/default/**/unittests.disabled.js",
                "src/extensibility/node/spec/*.js"
            ],
            "env": {
                "jasmine": true,
            },
            "globals": {
                "beforeFirst": false,
                "afterLast": false,
                "waitsForDone": false,
                "waitsForFail": false,
                "electron": false,
                "electronRemote": false
            }
        },
        // Tests node files
        {
            "files": [
                "test/node/**",
                "test/spec/LanguageTools-test-files/clients/**/client.js",
                "test/spec/LanguageTools-test-files/server/lsp-test-server/main.js"
            ],
            "env": {
                "node": true
            }
        },
        // Enable incrementally
        {
            "files": [
                "app/**",
                "src/editor",
                "src/extensibility",
                "src/extensions/default",
                "!src/extensions/default/CodeFolding/**/*.ts",
                "!src/extensions/default/TypeScriptTooling/**/*.ts",
                "src/features",
                "src/filesystem",
                "src/JSUtils",
                "src/language",
                "src/languageTools",
                "!src/languageTools/ClientLoader.ts",
                "!src/languageTools/LanguageTools.ts",
                "!src/languageTools/PathConverters.ts",
                "src/preferences",
                "src/utils",
                "src/view",
                "src/widgets",
                "src/brackets.ts",
                "src/xorigin.ts",
            ],
            "rules": {
                "@typescript-eslint/explicit-function-return-type": "off"
            }
        }
    ]
};
