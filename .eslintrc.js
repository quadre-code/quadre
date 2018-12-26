module.exports = {
    "rules": {
        // the rules below should be sorted in a same way they are sorted on http://eslint.org/docs/rules page
        // http://eslint.org/docs/rules/#possible-errors
        "for-direction": "error",
        "getter-return": "error",
        "no-compare-neg-zero": "error",
        "no-cond-assign": "error",
        "no-constant-condition": ["error", { "checkLoops": false }],
        "no-control-regex": "error",
        "no-debugger": "error",
        "no-dupe-args": "error",
        "no-dupe-keys": "error",
        "no-duplicate-case": "error",
        "no-empty": "error",
        "no-empty-character-class": "error",
        "no-ex-assign": "error",
        "no-extra-boolean-cast": "error",
        "no-extra-semi": "error",
        "no-func-assign": "error",
        "no-inner-declarations": "error",
        "no-invalid-regexp": "error",
        "no-irregular-whitespace": "error",
        "no-obj-calls": "error",
        "no-regex-spaces": "error",
        "no-sparse-arrays": "error",
        "no-unexpected-multiline": "error",
        "no-unreachable": "error",
        "no-unsafe-finally": "error",
        "no-unsafe-negation": "error",
        "use-isnan": "error",
        "valid-jsdoc": "off",
        "valid-typeof": "error",
        // http://eslint.org/docs/rules/#best-practices
        "curly": "error",
        "eqeqeq": ["error", "always", { "null": "ignore" }],
        "guard-for-in": "off",
        "no-caller": "error",
        "no-case-declarations": "error",
        "no-else-return": ["error", { allowElseIf: false }],
        "no-empty-pattern": "error",
        "no-fallthrough": "error",
        "no-global-assign": "error",
        "no-invalid-this": "off",
        "no-iterator": "error",
        "no-loop-func": "error",
        "no-multi-str": "error",
        "no-new-func": "error",
        "no-new-wrappers": "error",
        "no-new": "error",
        "no-octal": "error",
        "no-proto": "error",
        "no-redeclare": "error",
        "no-script-url": "error",
        "no-self-assign": "error",
        "no-unused-labels": "error",
        "no-useless-escape": "error",
        "wrap-iife": ["error", "outside"],
        // http://eslint.org/docs/rules/#strict-mode
        "strict": "error",
        // http://eslint.org/docs/rules/#variables
        "no-delete-var": "error",
        "no-shadow-restricted-names": "error",
        "no-shadow": "warn",
        "no-undef": "error",
        "no-unused-vars": ["error", { "vars": "all", "args": "none" }],
        "no-use-before-define": "off",
        // http://eslint.org/docs/rules/#nodejs-and-commonjs
        "no-new-require": "error",
        // http://eslint.org/docs/rules/#stylistic-issues
        "block-spacing": "error",
        "brace-style": ["error", "1tbs", { allowSingleLine: true }],
        "camelcase": "warn",
        "comma-dangle": "error",
        "comma-spacing": "error",
        "comma-style": ["error", "last"],
        "computed-property-spacing": "error",
        "eol-last": "error",
        "func-call-spacing": "error",
        "indent": ["error", 4, {
            "SwitchCase": 1,
            "VariableDeclarator": 1,
            "FunctionDeclaration": { "parameters": "first", body: 1 },
            "FunctionExpression": { "parameters": "first", body: 1 },
            "CallExpression": { "arguments": 1 },
            "ArrayExpression": 1,
            "ObjectExpression": 1,
            "ImportDeclaration": 1,
            "flatTernaryExpressions": false
        }],
        "key-spacing": ["off", { beforeColon: false, afterColon: true }],
        "max-len": ["off", 120],
        "multiline-ternary": ["error", "always-multiline"],
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
        "no-mixed-spaces-and-tabs": "error",
        "no-new-object": "error",
        "no-tabs": "error",
        "no-trailing-spaces": "error",
        "operator-linebreak": ["error", "after", {
            "overrides": {
                "?": "before",
                ":": "before"
            }
        }],
        "quotes": ["error", "double", { "avoidEscape": true }],
        "semi-spacing": "error",
        "semi": "error",
        // https://eslint.org/docs/rules/#ecmascript-6
        "constructor-super": "error",
        "no-class-assign": "error",
        "no-const-assign": "error",
        "no-dupe-class-members": "error",
        "no-new-symbol": "error",
        "no-this-before-super": "error",
        "require-yield": "error"
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
        // TypeScript
        {
            "files": [ "**/*.ts" ],
            "excludedFiles": "**/*.js",
            "parser": "typescript-eslint-parser",
            "parserOptions": {
                "ecmaVersion": 6,
                "sourceType": "module"
            },
            "plugins": [
                "typescript"
            ],
            "rules": {
                // http://eslint.org/docs/rules/#variables
                "no-unused-vars": "off",
                "typescript/no-unused-vars": ["error", { "vars": "all", "args": "none" }],
                // http://eslint.org/docs/rules/#stylistic-issues
                "camelcase": "off",
                "typescript/camelcase": "warn",
                "indent": "off",
                "typescript/indent": ["error", 4, {
                    "SwitchCase": 1,
                    "VariableDeclarator": 1,
                    "FunctionDeclaration": { "parameters": "first", body: 1 },
                    "FunctionExpression": { "parameters": "first", body: 1 },
                    "CallExpression": { "arguments": 1 },
                    "ArrayExpression": 1,
                    "ObjectExpression": 1,
                    "ImportDeclaration": 1,
                    "flatTernaryExpressions": false
                }],
                "one-var": ["error", { let: "never", const: "never" }],
                "one-var-declaration-per-line": ["error", "always"],
                // https://eslint.org/docs/rules/#ecmascript-6
                "no-var": "error",
                "prefer-const": "error",
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
                "react",
                "typescript"
            ],
            "rules": {
                // http://eslint.org/docs/rules/#variables
                "no-unused-vars": "off",
                "typescript/no-unused-vars": ["error", { "vars": "all", "args": "none" }],
                // http://eslint.org/docs/rules/#stylistic-issues
                "camelcase": "off",
                "typescript/camelcase": "warn",
                "indent": "off",
                "typescript/indent": ["error", 4, {
                    "SwitchCase": 1,
                    "VariableDeclarator": 1,
                    "FunctionDeclaration": { "parameters": "first", body: 1 },
                    "FunctionExpression": { "parameters": "first", body: 1 },
                    "CallExpression": { "arguments": 1 },
                    "ArrayExpression": 1,
                    "ObjectExpression": 1,
                    "ImportDeclaration": 1,
                    "flatTernaryExpressions": false
                }],
                "one-var": ["error", { let: "never", const: "never" }],
                "one-var-declaration-per-line": ["error", "always"],
                // https://eslint.org/docs/rules/#ecmascript-6
                "no-var": "error",
                "prefer-const": "error",
                // react plugin
                "react/jsx-uses-react": "error",
                "react/jsx-uses-vars": "error"
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
