"use strict";

// Builds build/js/exposed.cjs, the bundle the mocha suites in tests/ and the
// microbenchmarks in benchmarks/ require (Phase 1, step 7b of
// MODERNIZATION.md).
//
// Run: node tools/build-test-bundle.js
//
// What it replaces
// ----------------
// Until step 7b the "exposed" make task concatenated the vendored lib/ scripts,
// the node environment stubs and the whole core with its imports stripped into
// one file. The suites then loaded that file through a module-reflection
// helper, which re-evaluates a CommonJS module with an injected accessor so
// that arbitrary top-level bindings of the shared concat scope became readable
// by name. Both halves of that trick are gone: the core is a module
// graph, so the internals a test needs are simply exported - by
// src/js/test-exports.js, which is the explicit list of the test surface.
//
// Why this is a separate bundle from build/js/Cindy.js
// ---------------------------------------------------
//   * format/platform: CommonJS for node, so `require()` yields the exports
//     object directly. Cindy.js is an IIFE for a <script> tag.
//   * the environment seam: tools/build-cindy.js substitutes
//     src/js/expose.browser.js for "./expose.js" because the shipping bundle
//     runs in a browser and gets its per-instance values from the factory
//     wrapper. The tests run under node, where the inert window/document/
//     CindyJS stubs of src/js/expose.ts are what lets the graph evaluate at
//     all - so this build deliberately does NOT install that substitution.
//     The plugin is opt-in for exactly this reason.
//   * no factory wrapper: the suites poke at the interpreter's data structures
//     once, they do not create widgets, so a plain once-evaluated graph is
//     both sufficient and closer to what a test wants.
//
// Everything about *how the graph is read* still comes from
// tools/esbuild-common.js, so this bundle and the shipping one cannot resolve
// the same sources differently.

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const { repoRoot, srcRoot, tsExtensionResolve, commonOptions, readVersion } = require("./esbuild-common");

const outfile = path.join(repoRoot, "build", "js", "exposed.cjs");

// Two free globals the module graph does not provide itself, exactly as
// tools/bundle-esm.js documents them:
//
//   version     - a build-time constant; an esbuild `define` here, the way the
//                 shipping build does it.
//   generateId  - owned by src/js/CindyJS.js, which the instance graph must not
//                 import (it is page-global state). The shipping bundle binds
//                 it in the factory wrapper; here the enclosing CommonJS scope
//                 provides the same counter semantics.
const banner = [
    "var __cindyIdCounter = 0;",
    'function generateId(prefix) { return (prefix === undefined ? "CindyJSid" : prefix) + ++__cindyIdCounter; }',
].join("\n");

async function main() {
    const result = await esbuild.build({
        ...commonOptions,
        entryPoints: [path.join(srcRoot, "test-exports.js")],
        format: "cjs",
        platform: "node",
        define: { version: JSON.stringify(readVersion()) },
        banner: { js: banner },
        sourcemap: false,
        metafile: true,
        plugins: [tsExtensionResolve],
        outfile,
    });

    // The node stubs must be in and the browser seam must be out - the mirror
    // image of the assertion tools/build-cindy.js makes about the shipping
    // bundle. Getting this wrong gives a bundle that throws on `window` at
    // module-evaluation time, or silently tests something else.
    const inputs = new Set(Object.keys(result.metafile.inputs));
    if (!inputs.has("src/js/expose.ts") || inputs.has("src/js/expose.browser.js")) {
        console.error("build-test-bundle: wrong environment seam - the tests need the node variant (expose.ts)");
        process.exit(1);
    }

    console.log(
        `exposed.cjs: ${(fs.statSync(outfile).size / 1024).toFixed(0)} kB, ${inputs.size} modules -> ` +
            path.relative(repoRoot, outfile)
    );
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
