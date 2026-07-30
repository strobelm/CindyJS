"use strict";

// The modules hoisted OUT of the per-instance factory (Phase 1, step 8 of
// MODERNIZATION.md): evaluated once per page inside the once-bundle and shared
// by every widget, instead of being re-evaluated on each CindyJS(...) call.
//
// This list is the single source of truth for the hoist. Three consumers:
//
//   tools/build-cindy.js      substitutes each entry with a shim in the
//                             per-instance bundle (reading the shared namespace
//                             object off the newInstance wrapper) and asserts
//                             the real file ended up in the once-bundle only.
//   tools/check-esm-graph.js  check (f): a hoisted module's transitive imports
//                             must stay inside this list - anything else would
//                             make esbuild inline a per-widget copy of the
//                             imported module into the once-scope.
//   src/js/once-main.js       the once-bundle entry; hand-written, but
//                             build-cindy.js asserts it mentions every id here.
//
// A module qualifies only if ALL of the following hold:
//   - no top-level binding is reassigned or mutated at runtime, by the module
//     itself OR by any importer (exported objects that collect registrations,
//     like Registry.evaluator or Essentials.myfunctions, are per-instance
//     state even though their home file looks clean);
//   - nothing in it reads the instance environment at module scope - no import
//     of expose.js (instanceInvocationArguments, nada is fine only via the
//     once-bundle's own copy) and no free __cindy* identifier;
//   - its transitive imports satisfy the same conditions (check f enforces
//     this closure).
//
// `exports` lists the names the instance-side shim re-exports; esbuild fails
// the build if an instance module imports a name that is missing here, and
// check (f) fails if a name here is not exported by the real file.
//
// `id` is the module's path RELATIVE TO src/js SPELLED THE WAY IMPORTERS SPELL
// IT, i.e. always with a ".js" extension even where the file on disk is ".ts"
// (the TypeScript ESM convention the whole core follows, see
// tools/esbuild-common.js). It has to be the specifier path, because it is both
// the key build-cindy.js's shim plugin looks up resolved import paths under and
// the key of the shared namespace object in src/js/once-main.js. The only place
// that has to know about the ".ts" file behind it is build-cindy.js's
// once/instance bundle assertion, which checks esbuild's metafile - and
// metafile inputs name the file on disk.

// NEVER hoist these - they hold genuine per-instance state even where their
// own file looks init-only (audited 2026-07-30, evidence in the commit that
// added this note):
//   libcs/Registry.js     evaluator/eval_helper are filled per instance at
//                         runtime (plugins, defineFunction)
//   libcs/AngleUnit.ts    the widget's angleUnit setting
//   libcs/Random.js       the widget's random seed
//   libcs/Essentials.js   myfunctions collects user := definitions
//   libcs/Json.ts         _helper.self is the evaluator's dynamic scope
//   libcs/Namespace.js    the CindyScript variable store
//   libcs/Evaluator.js    callStack
//   libcs/Operators.js    epoch/statusbar/activeButton + registry writes
//   libgeo/GeoBasics.js   csgeo construction state, geoDependantsCache
module.exports = [
    {
        id: "nada.js",
        exports: ["nada"],
    },
    {
        id: "libcs/PSLQ.js",
        exports: ["PSLQ", "PSLQMatrix"],
    },
    {
        // The CindyScript grammar. Its operator tables (`operators`,
        // `operatorSymbols`, `functionCallPrecedence`) are built by the
        // initializeOperators IIFE during module evaluation and never written
        // again; everything a parse mutates lives on the `new Parser()`
        // instance (usedVariables/usedFunctions/infixmap, set per call in
        // Evaluator.analyse). Audited 2026-07-30.
        id: "libcs/Parser.js",
        exports: ["Parser"],
    },
    {
        id: "libgeo/TracingSizes.js",
        exports: ["tracing2StateSize", "tracing4StateSize", "tracing2ConicsStateSize"],
    },
    // The pure data layer: complex arithmetic, vectors/matrices, the type-
    // generic operations over both, and dictionaries. Four files rather than
    // one entry, but a single hoist: CSNumber/List/General form one strongly
    // connected component (see check (d)) and General needs Dict, so none of
    // them can move without the others.
    //
    // They qualify because they are pure code over values: every CindyScript
    // value is a fresh `{ctype, value}` object, no top-level binding is ever
    // written after init, and nothing in them reads the environment. The two
    // pieces of CSNumber that were NOT pure - the widget's angle unit and its
    // random seed - were split out into libcs/AngleUnit.ts and libcs/Random.js
    // beforehand, and those stay per-instance (they are what makes two widgets
    // with different angleUnit settings print differently). Check (g) is the
    // standing guard that no per-instance module writes into any of them.
    {
        // libcs/CSNumber.ts on disk; the ".js" spelling is the specifier, see
        // the note on `id` above.
        id: "libcs/CSNumber.js",
        exports: ["CSNumber", "TWOPI"],
    },
    {
        id: "libcs/List.js",
        exports: ["List"],
    },
    {
        id: "libcs/General.js",
        exports: ["General"],
    },
    {
        id: "libcs/Dict.js",
        exports: ["Dict"],
    },
];
