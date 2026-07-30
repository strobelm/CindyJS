// Browser variant of the environment seam (Phase 1, step 7a of
// MODERNIZATION.md).
//
// src/js/expose.ts is the node/test variant: it hands the instance graph inert
// stubs so the modules can be evaluated (and unit-tested) outside a browser.
// This file is the variant the SHIPPING bundle uses; tools/build-cindy.js
// substitutes it for "./expose.js" with an esbuild onResolve plugin - a
// build-time module substitution, not a runtime switch, so exactly one of the
// two ever ends up in an artifact.
//
// Two of the bindings are genuinely per-instance and cannot come from an
// import, because importing them would drag the once-evaluated module
// src/js/CindyJS.js into the per-instance bundle (esbuild would inline a second
// copy of the plugin registry, the instance list and the id counter into every
// widget). They arrive as free identifiers instead, bound by the
// `CindyJS.newInstance` wrapper that tools/build-cindy.js writes around this
// bundle:
//
//   __cindyApi   - the page-global CindyJS function object (Setup.js used to
//                  reach it as `this`).
//   __cindyArgs  - the `instanceInvocationArguments` parameter of newInstance,
//                  i.e. the configuration object the caller passed to
//                  `CindyJS({...})`.
//
// esbuild never renames unbound identifiers, so these two names survive into
// the artifact verbatim and resolve lexically to the wrapper's locals.
//
// nada used to be a third such value (__cindyNada); since the step-8 hoist of
// the leaf module nada.js it is re-exported from there instead - the hoist
// shim resolves it to the once-bundle's object, so its page-global identity is
// preserved without a dedicated wrapper binding.
/* global __cindyApi, __cindyArgs */
export { nada } from "./nada.js";

// The real DOM globals. Read off globalThis rather than referenced bare so
// that loading the bundle under node (the ref/ doctests do exactly that)
// leaves them `undefined` instead of throwing at module-evaluation time,
// which is what bare references in the concatenated build effectively did.
const window = globalThis.window;
const document = globalThis.document;

const CindyJS = __cindyApi;
const instanceInvocationArguments = __cindyArgs;

export { CindyJS, document, instanceInvocationArguments, window };
