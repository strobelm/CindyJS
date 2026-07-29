"use strict";

// Flat config replacement for the former .eslintrc.js + .eslintignore.
// Kept as CommonJS since package.json has no "type": "module".

const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
    {
        // Formerly .eslintignore. ESLint 9 flat config no longer reads
        // .eslintignore, so the same patterns are expressed here as a
        // global "ignores"-only config object.
        ignores: [
            // vendored third-party code
            "lib/**",
            "src/js/Head.js",
            "src/js/Tail.js",
            "src/js/ifs/ifs.asm.js",
            "lib/katex/katex.min.js",
            "plugins/katex/src/js/katex-plugin.js",
            "plugins/cindygl/src/js/CodeBuilder.js",
        ],
    },
    js.configs.recommended,
    {
        // ESLint 9's flat config defaults reportUnusedDisableDirectives to
        // "warn"; eslint 7 (the previous baseline) had it off by default.
        linterOptions: {
            reportUnusedDisableDirectives: false,
        },
        languageOptions: {
            ecmaVersion: 2018,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.es2017,
                ...globals.node,
                ...globals.mocha,
                Atomics: "readonly",
                SharedArrayBuffer: "readonly",
                ClipperLib: "writable",
                enableInlineVideo: "writable",
                WebKitMutationObserver: "writable",
                version: "writable",
                generateId: "writable",
            },
        },
        rules: {
            "no-unused-vars": "off",
            "no-prototype-builtins": "off",
            "no-constant-condition": "off",
            "no-useless-escape": "off",
            // Not part of eslint:recommended under the eslint 7 baseline;
            // added to eslint:recommended by later eslint versions. Disabled
            // here to keep lint behavior equivalent to before the upgrade.
            "no-loss-of-precision": "off",
            "no-constant-binary-expression": "off",
        },
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
        extends: [tseslint.configs.recommended],
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.json"],
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    }
);
