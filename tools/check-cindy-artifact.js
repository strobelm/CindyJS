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
// The artifact is MINIFIED, so none of the structural markers can be matched as
// literal source text any more. Two kinds of text survive minification and the
// checks below are built out of them:
//
//   * the composition glue tools/build-cindy.js writes around the two bundles
//     (prologue / boundary / epilogue) - it is hand-written, concatenated after
//     the fact and never seen by esbuild, so it is byte-for-byte predictable;
//   * everything esbuild is not allowed to rename: property names (it does not
//     mangle properties), string literals, export names of a `globalName`
//     bundle, and free (unbound) identifiers such as `__cindyApi`.
//
// Local variable names are gone, so wherever a marker used to name `CindyJS`
// the checks accept any identifier and assert the *shape* instead. Each check
// notes what it still proves.
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

function matches(re) {
    return (source.match(re) || []).length;
}

// Any identifier - minification replaces the source's names with short ones,
// but never changes the syntactic shape around them.
const ID = "[A-Za-z_$][\\w$]*";

check("the artifact is minified", () => {
    // Guards against a silent revert of `minify: true` in tools/build-cindy.js,
    // which would roughly double what every page downloads while every other
    // check here and every behavioral test stayed green. Both esbuild bundles
    // come out as one very long line each; nothing hand-written comes close.
    const longest = source.split("\n").reduce((n, line) => Math.max(n, line.length), 0);
    assert.ok(longest > 100000, `longest line is only ${longest} chars - the bundles look unminified`);
});

check("once-scope is evaluated exactly once", () => {
    // Markers of src/js/CindyJS.js's body. A second copy means an instance
    // module imported the once-module and esbuild inlined it into the factory,
    // giving every widget its own plugin registry and instance list.
    //
    // Minified form: the `CindyJS` receiver is a renamed local, but the
    // property names are not touched (esbuild does not mangle properties) and
    // neither are the initializers, so "<something>._pluginRegistry = {}" still
    // pins the one statement that creates a plugin registry.
    assert.strictEqual(
        matches(new RegExp(ID + "\\._pluginRegistry\\s*=\\s*\\{\\}", "g")),
        1,
        "duplicated plugin registry"
    );
    assert.strictEqual(matches(new RegExp(ID + "\\.instances\\s*=\\s*\\[\\]", "g")), 1, "duplicated instance list");
    assert.strictEqual(matches(new RegExp(ID + "\\.registerPlugin\\s*=\\s*function", "g")), 1, "duplicated plugin API");
    // `__cindyOnce` is the bundle's `globalName`: esbuild emits it verbatim
    // (only the whitespace around `=` goes away), so this one is still exact.
    assert.strictEqual(matches(/\bvar __cindyOnce\s*=/g), 1, "duplicated once-bundle");
});

check("the interpreter lives inside the factory", () => {
    // The factory header and the `return` are boundary glue written by
    // tools/build-cindy.js after esbuild has run - unminified by construction.
    const factory = source.indexOf("CindyJS.newInstance = function (instanceInvocationArguments)");
    assert.ok(factory > 0, "no newInstance factory");
    const once = source.search(/\bvar __cindyOnce\s*=/);
    assert.ok(once >= 0 && once < factory, "the once-bundle must precede the factory");
    const instance = source.search(/\bvar __cindyInstance\s*=/);
    assert.ok(instance > factory, "the instance bundle must sit inside the factory");
    assert.ok(
        source.indexOf("return __cindyInstance.globalInstance;") > instance,
        "the factory must return the instance bundle's globalInstance"
    );
    // Reading `.globalInstance` off the instance bundle only works because the
    // export survives minification as a getter on the globalName object.
    assert.ok(
        new RegExp("globalInstance\\s*:\\s*\\(\\s*\\)\\s*=>\\s*" + ID).test(source),
        "the instance bundle no longer exports globalInstance - minification renamed the export?"
    );
});

check("the browser environment seam was used, not the node stubs", () => {
    // src/js/expose.browser.js is the only module that reads `__cindyApi`, and
    // `__cindyApi` is UNBOUND inside the bundle (the newInstance wrapper binds
    // it), so minification leaves the name alone. What it does rename is the
    // `const CindyJS` it is assigned to - hence the identifier wildcard.
    assert.strictEqual(matches(new RegExp(ID + "\\s*=\\s*__cindyApi\\b", "g")), 1, "expose.browser.js not bundled");
    assert.strictEqual(
        matches(new RegExp(ID + "\\s*=\\s*__cindyArgs\\b", "g")),
        1,
        "the invocation arguments seam is gone"
    );
    // Since the step-8 hoist of nada.js, nada reaches the instance bundle
    // through the shared-module shim, not a dedicated wrapper binding. The
    // shim's key is a string literal, which minification preserves verbatim.
    assert.ok(occurrences('__cindyShared["nada.js"]') >= 1, "nada is not served from the once-bundle");
    // The node stubs of src/js/expose.ts are the mutually exclusive
    // alternative. Their fingerprint after minification is the object literal
    // `{angleUnit: ...}`; every legitimate use in the artifact READS the
    // property (`.angleUnit || "°"` in libcs/AngleUnit.ts) instead of defining
    // it, so a definition can only come from the stubs.
    assert.ok(!/\bangleUnit\s*:/.test(source), "expose.ts stubs leaked in");
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
