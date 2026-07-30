"use strict";

// Builds the shipping artifact build/js/Cindy.js from real ES modules
// (Phase 1, step 7a of MODERNIZATION.md). Replaces what the concatenation of
// the core sources used to do, and is what the "Cindy.js" make task runs.
//
// Run: node tools/build-cindy.js
//
//////////////////////////////////////////////////////////////////////
// Why two bundles
//
// The old artifact is one IIFE whose *entire* interpreter lives inside
// `CindyJS.newInstance`. Calling `CindyJS({...})` therefore re-evaluates the
// whole core: that re-evaluation IS the multi-instance mechanism, since 94
// top-level bindings in the core are per-widget runtime state. A naive
// once-evaluated ESM bundle would silently share all of it between widgets.
//
// So the artifact keeps exactly that shape, only now assembled from modules:
//
//   bundle A  src/js/once-main.js    once-evaluated page-global state
//                                    (the callable, plugin registry, script
//                                    loader, waitFor barrier, id counter, nada
//                                    - all in CindyJS.js - plus the modules
//                                    hoisted out of the factory, see
//                                    tools/hoisted-modules.js)
//   bundle B  src/js/instance-main.js the interpreter graph, embedded TEXTUALLY
//                                    as the body of `CindyJS.newInstance` so
//                                    that every call re-evaluates it
//
//////////////////////////////////////////////////////////////////////
// How bundle B yields its result
//
// Bundle B is built with `format: "iife", globalName: "__cindyInstance"`, which
// makes esbuild emit a single statement
//
//     var __cindyInstance = (() => { ...all module bodies... })();
//
// Splicing that statement into the wrapper gives, per call, a fresh `var` in
// the wrapper's function scope and a fresh evaluation of every module body.
// The wrapper then returns `__cindyInstance.globalInstance` - esbuild compiles
// named exports into getters, so this reads the live binding after Setup.js has
// populated it, which is precisely what the old concatenation's footer did
// with its `return globalInstance;`.
//
// The alternatives were considered and rejected: `format: "cjs"` would need a
// `new Function` at runtime (the task forbids runtime eval beyond this textual
// composition, and it would break CSP), and a bare `format: "iife"` without a
// globalName discards the entry's exports, leaving no way to reach
// globalInstance. The globalName variant is plain, static text.
//
//////////////////////////////////////////////////////////////////////
// What crosses the factory boundary
//
// Nothing in bundle B may `import` bundle A's module: esbuild would inline a
// second copy of the page-global state into every widget. The four values the
// instance graph needs from the once-scope are passed as ordinary lexical
// bindings of the wrapper instead, and picked up as free identifiers (esbuild
// never renames unbound identifiers):
//
//   CindyJS                        -> __cindyApi   \  read by
//   instanceInvocationArguments    -> __cindyArgs   > src/js/expose.browser.js
//   nada                           -> __cindyNada  /  (substituted for expose.ts)
//   generateId                     -> generateId      read bare by GeoOps.js
//   shared                         -> __cindyShared   read by the step-8 shims
//                                                     substituted for hoisted
//                                                     modules (see below)
//
// `version` (build/js/Version.js in the concat world) is not a runtime value at
// all - it is a build-time constant and becomes an esbuild `define`.

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const Concat = require("concat-with-sourcemaps");
const createDummySourceMap = require("source-map-dummy");

const {
    repoRoot,
    srcRoot,
    tsExtensionResolve,
    substituteModule,
    commonOptions,
    readVersion,
} = require("./esbuild-common");
const sources = require("../make/sources");
const hoisted = require("./hoisted-modules");

const outDir = path.join(repoRoot, "build", "js");
const outfile = path.join(outDir, "Cindy.js");
const mapfile = outfile + ".map";

//////////////////////////////////////////////////////////////////////
// esbuild passes. `write: false` keeps the intermediate bundles out of
// build/js, which tools/prepare-deploy.js would otherwise reject as unknown
// files.

async function bundle(entry, globalName, extra) {
    const result = await esbuild.build({
        ...commonOptions,
        ...extra,
        entryPoints: [path.join(srcRoot, entry)],
        format: "iife",
        globalName,
        // Not written; only used to make esbuild compute the map's `sources`
        // relative to build/js, the way the concat build's map is.
        outfile: path.join(outDir, "Cindy." + globalName + ".js"),
        sourcemap: "external",
        // prepare-deploy.js re-derives sourcesContent from the repository when
        // publishing, and the concat build's map carries none either.
        sourcesContent: false,
        metafile: true,
        write: false,
        // Substitutions first: esbuild runs onResolve hooks in plugin order,
        // and tsExtensionResolve would otherwise already have turned
        // "./expose.js" into expose.ts.
        plugins: [...(extra.plugins || []), tsExtensionResolve],
    });
    const js = result.outputFiles.find((f) => f.path.endsWith(".js"));
    const map = result.outputFiles.find((f) => f.path.endsWith(".map"));
    return { code: js.text, map: normalizeMapSources(map.text), inputs: Object.keys(result.metafile.inputs) };
}

// esbuild names generated inputs `<define:version>`; nothing on disk answers to
// that path, and tools/prepare-deploy.js reads every source of a shipped map to
// re-attach its content. Closure had the same situation and spelled it
// ` [synthetic:...] `, which prepare-deploy already recognises and skips, so
// that is the spelling the composed map uses.
function normalizeMapSources(text) {
    const map = JSON.parse(text);
    map.sources = map.sources.map((src) => {
        if (/^<(.*)>$/.test(src)) return ` [synthetic:${src.slice(1, -1)}] `;
        if (src.includes("hoist-shim:")) return ` [synthetic:hoist-shim] `;
        return src;
    });
    return JSON.stringify(map);
}

//////////////////////////////////////////////////////////////////////
// Step 8: shims for the hoisted modules.
//
// A hoisted module (tools/hoisted-modules.js) is evaluated once, inside bundle
// A. Instance modules keep importing it by its original specifier; this plugin
// serves those imports with a generated shim that reads the module's namespace
// object off `__cindyShared` - the free identifier the newInstance wrapper
// binds to `__cindyOnce.shared`. Importing the real file instead would make
// esbuild inline a private per-widget copy, silently un-hoisting it.
//
// The shim lists its exports explicitly (from the manifest), so an instance
// module importing a name the manifest misses is a hard esbuild error, not an
// undefined at runtime.

function hoistShims() {
    const byPath = new Map(hoisted.map((m) => [path.join(srcRoot, m.id), m]));
    return {
        name: "hoist-shims",
        setup(build) {
            build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
                const abs = path.resolve(args.resolveDir, args.path);
                if (!byPath.has(abs)) return undefined;
                return { path: abs, namespace: "hoist-shim" };
            });
            build.onLoad({ filter: /.*/, namespace: "hoist-shim" }, (args) => {
                const m = byPath.get(args.path);
                const lines = [`const __m = __cindyShared[${JSON.stringify(m.id)}];`];
                for (const name of m.exports) lines.push(`export const ${name} = __m.${name};`);
                return { contents: lines.join("\n"), loader: "js" };
            });
        },
    };
}

//////////////////////////////////////////////////////////////////////

async function main() {
    const version = readVersion();

    const once = await bundle("once-main.js", "__cindyOnce", {});

    const instance = await bundle("instance-main.js", "__cindyInstance", {
        define: { version: JSON.stringify(version) },
        plugins: [substituteModule("expose.js", path.join(srcRoot, "expose.browser.js")), hoistShims()],
    });

    // The structural invariants of the composition. A regression here is silent
    // at runtime (duplicated page state, or the node stubs shipped to
    // browsers), so it is checked rather than trusted.
    const instanceInputs = new Set(instance.inputs);
    const require1 = (cond, message) => {
        if (!cond) {
            console.error("build-cindy: " + message);
            process.exit(1);
        }
    };
    require1(
        !instanceInputs.has("src/js/CindyJS.js"),
        "the per-instance bundle pulled in src/js/CindyJS.js - the page-global " +
            "state would be duplicated per widget. Some module imports it; route " +
            "the value through expose.js instead."
    );
    require1(instanceInputs.has("src/js/expose.browser.js"), "the browser environment seam was not substituted in");
    require1(!instanceInputs.has("src/js/expose.ts"), "the node/test environment stubs leaked into the browser bundle");

    // Step 8: the hoisted modules live in the once-bundle and ONLY there.
    const onceInputs = new Set(once.inputs);
    const onceMain = fs.readFileSync(path.join(srcRoot, "once-main.js"), "utf-8");
    for (const m of hoisted) {
        const src = "src/js/" + m.id;
        require1(
            !instanceInputs.has(src),
            src + " was bundled into the per-instance bundle - the hoist-shim substitution did not catch it."
        );
        require1(
            onceInputs.has(src),
            src +
                " is listed in tools/hoisted-modules.js but missing from the once-bundle - " +
                "import it in src/js/once-main.js."
        );
        require1(
            onceMain.includes(JSON.stringify(m.id)),
            "src/js/once-main.js does not put " +
                JSON.stringify(m.id) +
                " on the shared object - " +
                "every instance would crash reading it."
        );
    }
    require1(
        !onceInputs.has("src/js/expose.ts") && !onceInputs.has("src/js/expose.browser.js"),
        "a hoisted module imports the environment seam - it depends on per-instance state and must not be hoisted."
    );

    //////////////////////////////////////////////////////////////////
    // Composition.
    //
    // The vendored lib/ scripts stay OUTSIDE the wrapper, at the top level of
    // the file, exactly where make/sources.js put them: they publish the
    // globals the core reads without importing (ClipperLib, enableInlineVideo).
    //
    // Everything of ours goes inside one IIFE and reaches the page through
    // globalThis, which is what the old footer did - `var CindyJS = ...` at the top
    // level of a classic script is a property of the global object, and the
    // deprecated `createCindy` alias plus the node `module.exports` are kept
    // verbatim. Wrapping is what keeps `generateId`, `nada` and the bundle
    // locals off the global object.

    const prologue = [
        "(function () {",
        '    "use strict";',
        "", // bundle A follows
    ].join("\n");

    const boundary = [
        "",
        "var CindyJS = __cindyOnce.CindyJS;",
        "",
        "// The per-instance factory: the whole interpreter, re-evaluated per call.",
        "CindyJS.newInstance = function (instanceInvocationArguments) {",
        "    var __cindyApi = CindyJS;",
        "    var __cindyArgs = instanceInvocationArguments;",
        "    var __cindyNada = __cindyOnce.nada;",
        "    var __cindyShared = __cindyOnce.shared;",
        "    var generateId = __cindyOnce.generateId;",
        "", // bundle B follows
    ].join("\n");

    const epilogue = [
        "",
        "    return __cindyInstance.globalInstance;",
        "};",
        "",
        "globalThis.CindyJS = CindyJS;",
        "globalThis.createCindy = CindyJS; // backwards compatibility, deprecated!",
        'if (typeof process !== "undefined" &&',
        '    typeof module !== "undefined" &&',
        '    typeof module.exports !== "undefined" &&',
        '    typeof globalThis.window === "undefined")',
        "    module.exports = CindyJS;",
        "})();",
        "",
    ].join("\n");

    //////////////////////////////////////////////////////////////////
    // Source map decision.
    //
    // Composing two esbuild maps plus the vendored scripts is exactly what
    // concat-with-sourcemaps does, so a real, complete map is cheap here:
    // esbuild's maps for the two bundles are consumed as-is, the vendored files
    // get identity maps, and only the ~20 lines of glue above carry no mapping.
    // No offset arithmetic of our own is involved.

    const concat = new Concat(true, path.basename(outfile), "\n");
    const addSource = (file) => {
        const name = path.relative(outDir, file).replace(/\\/g, "/");
        let src = fs.readFileSync(file, "utf-8");
        if (!/\r?\n$/.test(src)) src += "\n";
        concat.add(name, src, createDummySourceMap(src, { source: name, type: "js" }));
    };

    for (const lib of sources.lib) addSource(path.join(repoRoot, lib));
    concat.add(null, prologue);
    concat.add("Cindy.once.js", once.code, once.map);
    concat.add(null, boundary);
    concat.add("Cindy.instance.js", instance.code, instance.map);
    concat.add(null, epilogue);

    let content = concat.content.toString();
    if (!/\r?\n$/.test(content)) content += "\n";
    content += "//# sourceMappingURL=" + path.basename(mapfile) + "\n";

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outfile, content);
    fs.writeFileSync(mapfile, concat.sourceMap);

    console.log(
        `Cindy.js: ${(content.length / 1024).toFixed(0)} kB ` +
            `(once ${(once.code.length / 1024).toFixed(0)} kB, ` +
            `instance ${(instance.code.length / 1024).toFixed(0)} kB, ` +
            `${instance.inputs.length} modules), version ${JSON.stringify(version)}`
    );
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
