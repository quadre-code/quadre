module.exports = {
    "extends": "moody-tsx",
    "rules": {
        "guard-for-in": "off",
        "max-len": ["warn", 120],
        "new-cap": ["error", {
            capIsNewExceptions: [
                "CodeMirror.Pos",
                "Immutable.List",
                "Immutable.Map",
                "$.Deferred",
                "$.Event"
            ]
        }],
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
        // app/
        {
            "files": [ "app/**" ],
            "env": {
                "node": true
            }
        },
        // src/
        {
            "files": [ "src/**" ],
            "globals": {
                "electron": false,
                "exports": false,
                "module": false
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
                "electron": false
            }
        }
    ]
};
