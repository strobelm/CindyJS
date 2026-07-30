// Leaf module: the (initially empty) registries every operator layer writes
// into. Owning them here instead of in Essentials keeps the dependency
// direction acyclic: Essentials builds its infix map from Operators, while
// Operators (and OpDrawing/OpImageDrawing/OpSound/Compiled) only need the
// registries, not Essentials itself.
//
// evaluator: name (with arity suffix, e.g. "sin$1") -> function(args, modifs)
// eval_helper: helper functions shared by the operator implementations
//
// printing: the two host services the pure data layer (General/Dict) needs but
// must not import, for the same acyclicity reason:
//   * niceprint(a, modifs, options) - the value printer. It lives in
//     Essentials.js because it recurses through evaluate() and the namespace,
//     i.e. it is interpreter-layer code; General.add's string-concatenation
//     branch and Dict.niceprint/Dict.key only consume it. Filled by
//     Essentials.js at module init.
//   * err(message) - the per-instance CindyScript console's error sink, used by
//     Dict.key to report a malformed dictionary key. csconsole itself is
//     Setup.js state that is only assigned when an instance is created, so the
//     slot holds a delegating function that reads the live binding at call
//     time. Filled by Setup.js at module init.
// Both slots are only ever read at call time, never during module init.

const evaluator = {};
const eval_helper = {};
const printing = {};

export { evaluator, eval_helper, printing };
