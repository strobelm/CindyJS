"use strict";

// Shared esbuild configuration for the CindyJS core.
//
// Three consumers, deliberately built from one place so the CI checks and the
// shipping build cannot drift apart:
//
//   tools/bundle-esm.js       - the `make esmbundle` graph smoke check
//   tools/build-cindy.js      - the shipping build/js/Cindy.js
//   tools/build-test-bundle.js - build/js/exposed.cjs for the unit tests
//
// Anything that decides *how the module graph is read* (specifier resolution,
// language target, which warnings are noise) lives here. Anything that decides
// *what the artifact looks like* stays in the individual scripts.

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src", "js");

//////////////////////////////////////////////////////////////////////
// Resolve plugin
//
// The core sources follow the TypeScript convention for ESM: a specifier
// always carries the ".js" extension it will have after compilation, even when
// the file on disk is still ".ts" (libcs/CSNumber.ts, libcs/Json.ts,
// expose.ts, types.ts). esbuild only applies that remapping when the importing
// file is itself TypeScript, and most importers here are plain .js - hence
// this eleven-line shim. It is the standard adapter for the convention, and it
// disappears together with the last .js file in Phase 3.

const tsExtensionResolve = {
    name: "ts-extension",
    setup(build) {
        build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
            if (!args.path.endsWith(".js")) return undefined;
            const asJs = path.resolve(args.resolveDir, args.path);
            if (fs.existsSync(asJs)) return undefined; // real .js file, default resolution
            const asTs = asJs.slice(0, -3) + ".ts";
            return fs.existsSync(asTs) ? { path: asTs } : undefined;
        });
    },
};

//////////////////////////////////////////////////////////////////////
// Module substitution for the environment seam.
//
// Every core module imports its environment (window, document, nada, the
// CindyJS object, the invocation arguments) from "./expose.js". `substitute`
// redirects that one specifier to a different implementation at build time -
// the standard bundler seam, with no runtime branch and no second copy of
// either variant in the output.

function substituteModule(fromBasename, toFile) {
    const escaped = fromBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
        name: "substitute-" + fromBasename,
        setup(build) {
            build.onResolve({ filter: new RegExp("(^|/)" + escaped + "$") }, (args) => {
                if (!args.path.startsWith(".")) return undefined;
                return { path: toFile };
            });
        },
    };
}

//////////////////////////////////////////////////////////////////////
// Options every core bundle shares.

const commonOptions = {
    bundle: true,
    target: "es2018",
    logLevel: "warning",
    logOverride: {
        // Parser.js has a `typeof module !== "undefined"` block that exports
        // its tokenizer to node consumers. It is dead code inside the bundle
        // (the `window` check right next to it) and goes away with the concat
        // build; warning about it on every run only hides the warnings that
        // would matter.
        "commonjs-variable-in-esm": "silent",
    },
};

//////////////////////////////////////////////////////////////////////
// Files under src/js that are NOT part of the instance module graph, and
// therefore must not be expected in a bundle of src/js/index.js.

const nonGraphSources = new Set([
    "index.js", // the entry itself
    "instance-main.js", // entry of the per-instance bundle
    "test-exports.js", // entry of the unit-test bundle
    "CindyJS.js", // the once-evaluated bundle; importing it per instance is a bug
    "expose.browser.js", // substituted in for expose.ts, never imported by name
    "types.ts", // type declarations only, erased by esbuild
]);

//////////////////////////////////////////////////////////////////////
// The version constant.
//
// make/getversion.js writes build/js/Version.json for the module builds (the
// concat build used to get the same value as a generated build/js/Version.js).
// Running a build script standalone, without make, falls back to the same
// "unknown" value getversion uses when git is unavailable.

function readVersion() {
    const json = path.join(repoRoot, "build", "js", "Version.json");
    if (fs.existsSync(json)) return JSON.parse(fs.readFileSync(json, "utf-8"));
    console.warn("no build/js/Version.json - falling back to an unknown version");
    return [0, 0, 0, -1, "?!"];
}

module.exports = {
    repoRoot,
    srcRoot,
    tsExtensionResolve,
    substituteModule,
    commonOptions,
    nonGraphSources,
    readVersion,
};
