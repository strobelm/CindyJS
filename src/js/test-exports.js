// Entry point of the UNIT TEST bundle (Phase 1, step 7b of MODERNIZATION.md).
//
// The mocha suites in tests/ and the microbenchmarks in benchmarks/ exercise
// core internals that the public `CindyJS(...)` API does not reach: the data
// layer (CSNumber/List/Dict/General), the printer, the geometry op table and
// the PSLQ integer-relation code. Until step 7b they got at them by loading a
// concatenation of the whole core, imports stripped, through a module-
// reflection helper that made every top-level binding of that one shared
// function scope readable by name.
//
// This module is the modular successor of that arrangement, and of the role
// src/js/expose.ts played for it: it pulls in the instance graph exactly the
// way src/js/instance-main.js does (through ./index.js, the single place where
// the evaluation order is pinned) and re-exports the internals the suites name
// - nothing more, so the test surface is an explicit, greppable list rather
// than "every top-level binding in the concatenation".
//
// tools/build-test-bundle.js turns this into build/js/exposed.cjs, a CommonJS
// bundle the suites `require()`. That bundle deliberately does NOT substitute
// src/js/expose.browser.js for ./expose.js: outside a browser the graph needs
// the inert window/document/CindyJS stubs of src/js/expose.ts, which is the
// environment the tests have always run in.
//
// Tests that need the public API instead (`CindyJS({...})` on a fake widget)
// require build/js/Cindy.js, the shipping artifact, directly.

import "./index.js";

// The shared `undefined` value. It comes from the environment seam rather than
// from a core module because the shipping bundle threads it across the factory
// boundary; under node it is expose.ts's stub. The core compares against it
// with `!==`, so tests must see the same object identity the graph does.
export { nada } from "./expose.js";

// The data layer.
export { CSNumber } from "./libcs/CSNumber.js";
export { List } from "./libcs/List.js";
export { Dict } from "./libcs/Dict.js";
export { General } from "./libcs/General.js";

// The printer used by the List/Dict/GeoOps expectations.
export { niceprint } from "./libcs/Essentials.js";

// Integer relation finding (tests/Guess_tests.js).
export { PSLQ, PSLQMatrix } from "./libcs/PSLQ.js";

// The geometry operation table (tests/GeoOps_tests.js, tests/Prover_tests.js).
export { geoOps } from "./libgeo/GeoOps.js";
