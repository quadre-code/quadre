module.exports = {
    "rules": {
        // the rules below should be sorted in a same way they are sorted on http://eslint.org/docs/rules page
        // http://eslint.org/docs/rules/#possible-errors
        "no-caller": "error",
        "no-control-regex": "error",
        "no-empty": "error",
        "no-invalid-regexp": "error",
        "no-regex-spaces": "error",
        "no-unsafe-negation": "error",
        "valid-jsdoc": "off",
        "valid-typeof": "error",
        // http://eslint.org/docs/rules/#best-practices
        "curly": "error",
        "eqeqeq": ["error", "always", {"null": "ignore"}],
        "guard-for-in": "off",
        "no-else-return": "warn",
        "no-fallthrough": "error",
        "no-invalid-this": "off",
        "no-iterator": "error",
        "no-loop-func": "error",
        "no-multi-str": "error",
        "no-new-func": "error",
        "no-new-wrappers": "error",
        "no-new": "error",
        "no-proto": "error",
        "no-script-url": "error",
        "no-useless-escape": "error",
        "wrap-iife": ["error", "outside"],
        // http://eslint.org/docs/rules/#strict-mode
        "strict": "error",
        // http://eslint.org/docs/rules/#variables
        "no-shadow-restricted-names": "error",
        "no-shadow": "warn",
        "no-undef": "error",
        "no-unused-vars": ["warn", {"vars": "all", "args": "none"}],
        "no-use-before-define": "off",
        // http://eslint.org/docs/rules/#nodejs-and-commonjs
        "no-new-require": "error",
        // http://eslint.org/docs/rules/#stylistic-issues
        "block-spacing": "warn",
        "brace-style": ["error", "1tbs", { allowSingleLine: true }],
        "camelcase": "warn",
        "comma-dangle": "error",
        "comma-spacing": "warn",
        "comma-style": ["warn", "last"],
        "computed-property-spacing": "warn",
        "eol-last": "error",
        "func-call-spacing": "warn",
        "indent": ["warn", 4, { "SwitchCase": 1 }],
        "key-spacing": ["off", { beforeColon: false, afterColon: true }],
        "max-len": ["off", 120],
        "new-cap": ["off", {
            "capIsNewExceptions": [
                "$.Deferred",
                "$.Event",
                "CodeMirror.Pos",
                "Immutable.Map",
                "Immutable.List",
                "JSLINT"
            ]
        }],
        "new-parens": "error",
        "no-bitwise": "error",
        "no-new-object": "error",
        "no-trailing-spaces": "error",
        "quotes": ["error", "double", { "allowTemplateLiterals": true }],
        "semi-spacing": "warn",
        "semi": "error"
    },
    "globals": {
        "$": false,
        "appshell": false,
        "brackets": false,
        "clearTimeout": false,
        "console": false,
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
            "files": [ "**/*.ts" ],
            "excludedFiles": "**/*.js",
            "parser": "typescript-eslint-parser",
            "parserOptions": {
                "sourceType": "module"
            },
            "rules": {
                "no-undef": "off",
                "no-unused-vars": "off"
            }
        },
        // TypeScript + React
        {
            "files": [ "**/*.tsx" ],
            "excludedFiles": "**/*.js",
            "parser": "typescript-eslint-parser",
            "parserOptions": {
                "ecmaVersion": 6,
                "sourceType": "module",
                "ecmaFeatures": {
                    "jsx": true
                }
            },
            "plugins": [
                "react"
            ],
            "rules": {
                "no-undef": "off",
                "no-unused-vars": "off",
                "react/jsx-uses-react": "error",
                "react/jsx-uses-vars": "error"
            }
        },
        // Build files
        {
            "files": [
                "*.js",
                "tasks/**/*.js"
            ],
            "parserOptions": {
                "ecmaVersion": 6
            }
        },
        // Tests
        {
            "files": [
                "test/**",
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
