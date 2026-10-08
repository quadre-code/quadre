"use strict";

module.exports = {
    extends: "moody-tsx",
    env: {
        es6: true,
    },
    rules: {
        "new-cap": [
            "error",
            {
                capIsNewExceptions: [
                    "CodeMirror",
                    "CodeMirror.Pos",
                    "Immutable.List",
                    "Immutable.Map",
                    "$.Deferred",
                    "$.Event",
                ],
            },
        ],
        "no-console": "off",
        "no-invalid-this": "off",
        indent: "off",
        "@typescript-eslint/member-delimiter-style": "off",
    },
    globals: {
        $: false,
        brackets: false,
        define: false,
    },
    overrides: [
        // TypeScript
        {
            files: ["**/*.ts", "**/*.tsx"],
            excludedFiles: "**/*.js",
            rules: {
                "@typescript-eslint/naming-convention": "off",
                "no-shadow": "off",
                "@typescript-eslint/no-shadow": "warn",
                "no-dupe-class-members": "off",
                "no-redeclare": "off",
                "@typescript-eslint/no-redeclare": "error",
            },
        },
        // node files
        {
            files: [".eslintrc.js", "src/**/node/**"],
            env: {
                node: true,
            },
        },
    ],
};
