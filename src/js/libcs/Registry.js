// Leaf module: the (initially empty) registries every operator layer writes
// into. Owning them here instead of in Essentials keeps the dependency
// direction acyclic: Essentials builds its infix map from Operators, while
// Operators (and OpDrawing/OpImageDrawing/OpSound/Compiled) only need the
// registries, not Essentials itself.
//
// evaluator: name (with arity suffix, e.g. "sin$1") -> function(args, modifs)
// eval_helper: helper functions shared by the operator implementations
//
// There used to be a third slot, `printing`, holding niceprint and the console
// error sink for the pure data layer (General.add's string branch, Dict.key,
// Dict.niceprint). It is gone: string concatenation moved up into Operators.js
// (addOrConcat), and Dict.key/Dict.niceprint take the printer and the error
// reporter as ordinary parameters, supplied by the callers that have them. That
// leaves General.js and Dict.js importing nothing but their siblings in the data
// layer, which is what makes them hoistable (tools/hoisted-modules.js).

const evaluator = {};
const eval_helper = {};

export { evaluator, eval_helper };
