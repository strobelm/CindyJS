// Entry point of the PER-INSTANCE bundle (Phase 1, step 7a of
// MODERNIZATION.md).
//
// tools/build-cindy.js bundles this file and embeds the result textually as the
// body of `CindyJS.newInstance`, so the whole graph below is re-evaluated on
// every widget - which is exactly what the concatenation build did and what the
// 94 runtime-stateful top-level bindings in the core still rely on.
//
// Difference to src/js/index.js: that entry is the ESM-facing root and exports
// the public `CindyJS` object; this one exports the value `newInstance` has to
// return. Both pull in the same graph, index.js being the single place where
// the evaluation order is pinned.
import "./index.js";

// Instance.js owns the (mutable, per-evaluation) widget object that Setup.js
// fills in; the old concatenation's `return globalInstance;` becomes a read of
// this export.
// The named export is compiled by esbuild into a getter on the bundle's export
// object, so the read happens after Setup.js has populated it - live bindings
// give us the old footer's semantics for free.
export { globalInstance } from "./Instance.js";
