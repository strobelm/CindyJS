// ES module entry point for the CindyJS core (Phase 1, step 5 of
// MODERNIZATION.md).
//
// Since step 7a the shipping build/js/Cindy.js is produced from this graph by
// tools/build-cindy.js (through src/js/instance-main.js, which adds the value
// newInstance returns), and since step 7b the unit tests get their internals
// from src/js/test-exports.js, which pulls in the same graph. This module is
// the single root of the graph for node, esbuild and every other ESM consumer,
// and what tools/check-esm-graph.js anchors the reachability and the
// evaluation order of the whole core on.
//
// The import list is the concatenation order the build used before step 7a,
// with one deliberate difference: Instance/Setup/Events move from the front to
// the back.
// In the concatenation those three are simply the first fragments of the shared
// closure and nothing about them runs before libcs; in ESM an entry's import
// order is a depth-first traversal, so listing Setup.js first would drag its
// whole transitive closure in ahead of libcs and evaluate, for example,
// Namespace.js (which builds its variable presets from CSNumber/General/List at
// module scope) before CSNumber.js. Bottom-up is also the order MODERNIZATION.md
// states as the dependency chain for phase 1: CSNumber -> ... -> libgeo ->
// liblab -> Setup/Events. Within each layer the order is unchanged.
//
// Note that this list is a seed, not a schedule: ESM evaluates each module's
// own imports first, so the effective order is the depth-first one and the
// entry only controls where the traversal starts. That is why step 6's gate
// insists on an acyclic init-time graph, and why tools/bundle-esm.js actually
// evaluates the bundle.
//
// Two entries of the old concatenation list are missing here because they are
// build artifacts rather than sources:
//   * build/js/Version.js  - between Events.js and libcs below; defines the
//     `version` global. At the flip it becomes an esbuild `define`
//     (see tools/bundle-esm.js for the check bundle's stand-in).
//   * build/js/Compiled.js - between libcs/Namespace.js and libcs/Accessors.js;
//     generated from src/js/includes/*.cs by tools/cs2js.js, which will emit an
//     ES module (step 7's supporting changes).
// The vendored lib/ files (iphone-inline-video, clipper, es6-shim) are not part
// of the module graph either; they stay <script>-level dependencies.

// --- inclosure order, bottom-up --------------------------------------------
// build/js/Version.js goes here (it only defines the `version` global)

// leaves shared by everything
import "./nada.js";

// libcs (Registry first: every file registering into evaluator/eval_helper
// depends on it)
import "./libcs/Registry.js";
import "./libcs/CSNumber.js";
import "./libcs/AngleUnit.js";
import "./libcs/Random.js";
import "./libcs/List.js";
import "./libcs/Json.js";
import "./libcs/Dict.js";
import "./libcs/General.js";
import "./libcs/Essentials.js";
import "./libcs/Namespace.js";
// build/js/Compiled.js goes here
import "./libcs/Accessors.js";
import "./libcs/Operators.js";
import "./libcs/OpDrawing.js";
import "./libcs/OpImageDrawing.js";
import "./libcs/Parser.js";
import "./libcs/Evaluator.js";
import "./libcs/OpSound.js";
import "./libcs/CSad.js";
import "./libcs/Render2D.js";
import "./libcs/RenderBackends.js";
import "./libcs/Tools.js";
import "./libcs/PSLQ.js";

// libgeo
import "./libgeo/GeoState.js";
import "./libgeo/GeoBasics.js";
import "./libgeo/GeoRender.js";
import "./libgeo/TracingSizes.js";
import "./libgeo/Tracing.js";
import "./libgeo/Prover.js";
import "./libgeo/GeoOps.js";
import "./libgeo/StateIO.js";

// liblab
import "./liblab/LabBasics.js";
import "./liblab/LabObjects.js";

// composition root last
import "./Instance.js";
import "./Setup.js";
import "./Events.js";

// --- public API ------------------------------------------------------------
// The bundle exposes exactly one thing on the global scope: the `CindyJS`
// function object (plus the deprecated `createCindy` alias and, under node,
// `module.exports = CindyJS`). Setup.js re-exports that object under the same
// name, so the entry simply forwards it.
//
// Where the object itself comes from is the environment seam's business:
// src/js/CindyJS.js builds it once per page and the factory wrapper hands it to
// expose.browser.js, while expose.ts substitutes a stub for node and the tests.
// Either way Setup.js just imports `CindyJS` (it used to take it from `this`,
// which only worked while the core was compiled into `newInstance`'s body).
import { CindyJS } from "./Setup.js";

export { CindyJS, CindyJS as createCindy };
export default CindyJS;
