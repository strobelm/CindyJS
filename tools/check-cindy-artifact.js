"use strict";

// Post-build assertions on build/js/Cindy.js (Phase 1, step 7a of
// MODERNIZATION.md). Run by the "Cindy.js" make task right after
// tools/build-cindy.js.
//
// The doctests, unit tests and the Playwright smoke tests all exercise the
// artifact's behavior; what they cannot see is its *shape*. Two properties of
// the factory composition are invisible at the level of a single widget and
// would only surface as cross-widget interference much later:
//
//   1. the once-evaluated half really is once-evaluated (page-global state such
//      as the plugin registry, the instance list and the id counter must exist
//      exactly once in the file), and
//   2. the public surface legacy plugins compile against is intact.
//
// Run: node tools/check-cindy-artifact.js

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const artifact = path.join(repoRoot, "build", "js", "Cindy.js");
const source = fs.readFileSync(artifact, "utf-8");

const failures = [];
function check(name, fn) {
    try {
        fn();
    } catch (err) {
        failures.push(`${name}: ${err.message}`);
    }
}

//////////////////////////////////////////////////////////////////////
// (1) Structure

function occurrences(needle) {
    return source.split(needle).length - 1;
}

check("once-scope is evaluated exactly once", () => {
    // Markers of src/js/CindyJS.js's body. A second copy means an instance
    // module imported the once-module and esbuild inlined it into the factory,
    // giving every widget its own plugin registry and instance list.
    assert.strictEqual(occurrences("CindyJS._pluginRegistry = {}"), 1, "duplicated plugin registry");
    assert.strictEqual(occurrences("CindyJS.instances = []"), 1, "duplicated instance list");
    assert.strictEqual(occurrences("CindyJS.registerPlugin = function"), 1, "duplicated plugin API");
    assert.strictEqual(occurrences("var __cindyOnce = "), 1, "duplicated once-bundle");
});

check("the interpreter lives inside the factory", () => {
    const factory = source.indexOf("CindyJS.newInstance = function (instanceInvocationArguments)");
    assert.ok(factory > 0, "no newInstance factory");
    const once = source.indexOf("var __cindyOnce = ");
    assert.ok(once >= 0 && once < factory, "the once-bundle must precede the factory");
    const instance = source.indexOf("var __cindyInstance = ");
    assert.ok(instance > factory, "the instance bundle must sit inside the factory");
    assert.ok(
        source.indexOf("return __cindyInstance.globalInstance;") > instance,
        "the factory must return the instance bundle's globalInstance"
    );
});

check("the browser environment seam was used, not the node stubs", () => {
    assert.strictEqual(occurrences("var CindyJS = __cindyApi"), 1, "expose.browser.js not bundled");
    assert.strictEqual(occurrences("var nada = __cindyNada"), 1, "nada is not threaded across the boundary");
    assert.ok(!/var instanceInvocationArguments = \{ angleUnit/.test(source), "expose.ts stubs leaked in");
});

//////////////////////////////////////////////////////////////////////
// (2) Public surface, as loaded

check("public API", () => {
    // ref/js/runtests.js needs the same shim; node >= 21.2 has its own.
    if (typeof navigator === "undefined") global.navigator = {};
    const CindyJS = require(artifact);

    assert.strictEqual(typeof CindyJS, "function", "module.exports is not the CindyJS callable");
    assert.strictEqual(typeof CindyJS.newInstance, "function", "no newInstance");
    assert.strictEqual(typeof CindyJS.registerPlugin, "function", "no registerPlugin");
    assert.strictEqual(typeof CindyJS.waitFor, "function", "no waitFor");
    assert.strictEqual(typeof CindyJS.autoLoadPlugin, "function", "no autoLoadPlugin");
    assert.strictEqual(typeof CindyJS.loadScript, "function", "no loadScript");
    assert.strictEqual(typeof CindyJS.getBaseDir, "function", "no getBaseDir");
    assert.strictEqual(typeof CindyJS.dumpState, "function", "no dumpState");
    assert.strictEqual(typeof CindyJS.debugState, "function", "no debugState");
    assert.ok(Array.isArray(CindyJS.instances), "instances is not an array");
    assert.strictEqual(typeof CindyJS._pluginRegistry, "object", "no _pluginRegistry");
    assert.strictEqual(globalThis.createCindy, CindyJS, "the deprecated createCindy alias is missing");

    // Registering a plugin is the whole contract the legacy plugins rely on.
    let called = 0;
    CindyJS.registerPlugin(1, "__selftest", () => ++called);
    assert.strictEqual(typeof CindyJS._pluginRegistry.__selftest, "function", "registerPlugin did not register");
    delete CindyJS._pluginRegistry.__selftest;
});

//////////////////////////////////////////////////////////////////////

if (failures.length) {
    for (const f of failures) console.error("FAILED " + f);
    process.exit(1);
}
console.log(`OK: build/js/Cindy.js is well-formed (${(source.length / 1024).toFixed(0)} kB)`);
