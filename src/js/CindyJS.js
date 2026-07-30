// The once-evaluated half of the CindyJS bundle (Phase 1, step 7a of
// MODERNIZATION.md).
//
// This is a straight port of the old concatenation head's once-only content:
// everything
// that used to live in the enclosing `var CindyJS = (function () { ... })()`
// IIFE *outside* of `CindyJS.newInstance`. It runs exactly once per page load
// and owns the page-global state:
//
//   * the public `CindyJS(data)` callable and the properties hung off it
//     (`waitFor`, `instances`, `registerPlugin`, `_pluginRegistry`,
//     `getBaseDir`/`addNewScript`/`loadScript`/`autoLoadPlugin`,
//     `dumpState`/`debugState`),
//   * the startup barrier (`waitCount`/`toStart` plus the DOMContentLoaded
//     hook),
//   * the id counter behind `generateId`,
//   * the shared `nada` value,
//   * the `Math.sign` polyfill.
//
// The per-widget interpreter graph (src/js/instance-main.js) is a SEPARATE
// esbuild bundle that tools/build-cindy.js embeds textually as the body of
// `CindyJS.newInstance`, so it re-evaluates on every call - that is the
// multi-instance mechanism and it is preserved verbatim. Consequently no
// instance module may `import` this file: esbuild would inline a second copy
// into the instance bundle and the page-global state would be duplicated per
// widget. `generateId`, `nada` and the `CindyJS` object itself are handed to
// the instance bundle across the factory boundary instead (see
// src/js/expose.browser.js and tools/build-cindy.js).

// The environment. The concatenated build referenced the real DOM globals
// directly; capturing them here keeps that meaning while making the names
// bound identifiers, so the graph gate does not mistake them for the stubs
// that expose.js hands to the instance graph.
// Owned by the leaf module nada.js since step 8; re-exported below so the
// newInstance wrapper keeps reading it off __cindyOnce unchanged.
import { nada } from "./nada.js";

const window = globalThis.window;
const document = globalThis.document;

const debugStartup = false;

let waitCount = -1;

const toStart = [];

// waitFor returns a callback which will decrement the waitCount
function waitFor(name) {
    if (waitCount === 0) {
        console.error("Waiting for " + name + " after we finished waiting.");
        return function () {};
    }
    if (waitCount < 0) waitCount = 0;
    if (debugStartup) console.log("Start waiting for " + name);
    ++waitCount;
    return function () {
        if (debugStartup) console.log("Done waiting for " + name);
        --waitCount;
        if (waitCount < 0) {
            console.error("Wait count mismatch: " + name);
        }
        if (waitCount === 0) {
            let i = 0;
            const n = toStart.length;
            if (debugStartup) console.log("Done waiting, starting " + n + " instances:");
            while (i < n) toStart[i++].startup();
        }
    };
}

if (!Math.sign) {
    //polyfill from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sign#Polyfill
    //needed for IE
    Math.sign = function (x) {
        // If x is NaN, the result is NaN.
        // If x is -0, the result is -0.
        // If x is +0, the result is +0.
        // If x is negative and not -0, the result is -1.
        // If x is positive and not +0, the result is +1.
        return (x > 0) - (x < 0) || +x;
    };
}

if (
    typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof document.addEventListener !== "undefined" &&
    (typeof window.cindyDontWait === "undefined" || window.cindyDontWait !== true)
) {
    document.addEventListener("DOMContentLoaded", waitFor("DOMContentLoaded"));
}

function CindyJS(data) {
    const instance = CindyJS.newInstance(data);
    if (waitCount <= 0) instance.startup();
    else if (data.autostart !== false) toStart.push(instance);
    return instance;
}

let baseDir = null;
let cindyJsScriptElement = null;
const waitingForLoad = {};

CindyJS.getBaseDir = function () {
    if (baseDir !== null) return baseDir;
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; ++i) {
        const script = scripts[i];
        const src = script.src;
        if (!src) continue;
        const match = /\/Cindy\.js$/.exec(src);
        if (match) {
            baseDir = src.substr(0, match.index + 1);
            console.log("Will load extensions from " + baseDir);
            cindyJsScriptElement = script;
            return baseDir;
        }
    }
    console.error("Could not find <script> tag for Cindy.js");
    baseDir = cindyJsScriptElement = false;
    return baseDir;
};

CindyJS.addNewScript = function (path, onerror) {
    if (!onerror) onerror = console.error.bind(console);
    const baseDir = CindyJS.getBaseDir();
    if (baseDir === false) {
        return false;
    }
    const elt = document.createElement("script");
    elt.src = baseDir + path;
    const next = cindyJsScriptElement.nextSibling;
    const parent = cindyJsScriptElement.parentElement;
    if (next) parent.insertBefore(elt, next);
    else parent.appendChild(elt);
    return elt;
};

CindyJS.loadScript = function (name, path, onload, onerror) {
    const names = String(name).split(".");
    let obj = window;
    while (names.length && typeof obj === "object" && obj !== null) obj = obj[names.shift()];
    if (obj && !names.length) {
        onload();
        return true;
    }
    if (!onerror) onerror = console.error.bind(console);
    let elt = waitingForLoad[name];
    if (!elt) {
        elt = CindyJS.addNewScript(path, onerror);
        if (elt === false) {
            onerror("Can't load additional components.");
            return false;
        }
        waitingForLoad[name] = elt;
    }
    elt.addEventListener("load", onload);
    elt.addEventListener("error", onerror);
    return null;
};

CindyJS._autoLoadingPlugin = {};

CindyJS.autoLoadPlugin = function (name, path, onload) {
    if (CindyJS._pluginRegistry[name]) {
        onload();
        return true;
    }
    let listeners = CindyJS._autoLoadingPlugin[name];
    if (!listeners) {
        if (!path) path = name + "-plugin.js";
        listeners = CindyJS._autoLoadingPlugin[name] = [];
        const elt = CindyJS.addNewScript(path);
        if (elt === false) {
            return false;
        }
        elt.addEventListener("error", console.error.bind(console));
    }
    listeners.push(onload);
    return null;
};

CindyJS.waitFor = waitFor;
CindyJS._pluginRegistry = {};
CindyJS.instances = [];
CindyJS.registerPlugin = function (apiVersion, pluginName, initCallback) {
    if (apiVersion !== 1) {
        console.error("Plugin API version " + apiVersion + " not supported");
        return false;
    }
    CindyJS._pluginRegistry[pluginName] = initCallback;
    const listeners = CindyJS._autoLoadingPlugin[pluginName] || [];
    listeners.forEach(function (callback) {
        callback();
    });
};

let idCounter = 0;

function generateId(prefix) {
    if (prefix === undefined) prefix = "CindyJSid";
    return prefix + ++idCounter;
}

CindyJS.dumpState = function (index) {
    // Call this if you find a rendering bug you'd like to reproduce.
    // Then save the printed JSON to a file and include it in your report.
    const state = CindyJS.instances[index || 0].saveState();
    console.log(JSON.stringify(state));
};

// The unused `index` parameter is the original signature, kept verbatim.
CindyJS.debugState = function (index) {
    // Call this to test how a widget handles a save & reload.
    // You can paste javascript:CindyJS.debugState() into the
    // address bar of your browser to achieve this.
    CindyJS.instances
        .map(function (instance) {
            let cfg = instance.config;
            cfg = JSON.parse(JSON.stringify(cfg));
            const state = instance.saveState();
            console.log(JSON.stringify(state));
            for (const key in state) cfg[key] = state[key];
            instance.shutdown();
            return cfg;
        })
        .forEach(function (cfg) {
            CindyJS(cfg);
        });
};

// `CindyJS.newInstance` is NOT defined here: tools/build-cindy.js assigns it
// after this module, with the instance bundle as its body.

export { CindyJS, generateId, nada };
