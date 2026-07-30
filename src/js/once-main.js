// Entry point of the ONCE-PER-PAGE bundle (Phase 1, steps 7a/8 of
// MODERNIZATION.md).
//
// tools/build-cindy.js bundles this file as `__cindyOnce`, evaluated a single
// time when Cindy.js loads. It carries two things:
//
//   - the page-global side of the API: the callable CindyJS object, the shared
//     `nada` value and the widget id counter (all owned by CindyJS.js);
//   - the namespace objects of the modules hoisted out of the per-instance
//     factory (step 8). The newInstance wrapper hands this object to the
//     instance bundle as `__cindyShared`, where build-time shims re-export its
//     contents under the modules' original names - so importers are oblivious
//     to whether a module is per-instance or shared.
//
// The keys of `shared` are the module ids of tools/hoisted-modules.js, which
// is the single source of truth for what is hoisted; build-cindy.js asserts
// this file and that list stay in sync.

export { CindyJS, generateId, nada } from "./CindyJS.js";

import * as PSLQ from "./libcs/PSLQ.js";
import * as TracingSizes from "./libgeo/TracingSizes.js";

export const shared = {
    "libcs/PSLQ.js": PSLQ,
    "libgeo/TracingSizes.js": TracingSizes,
};
