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

module.exports = [
    {
        id: "libcs/PSLQ.js",
        exports: ["PSLQ", "PSLQMatrix"],
    },
    {
        id: "libgeo/TracingSizes.js",
        exports: ["tracing2StateSize", "tracing4StateSize", "tracing2ConicsStateSize"],
    },
];
