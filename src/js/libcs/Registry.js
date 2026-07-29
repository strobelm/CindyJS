// Leaf module: the (initially empty) registries every operator layer writes
// into. Owning them here instead of in Essentials keeps the dependency
// direction acyclic: Essentials builds its infix map from Operators, while
// Operators (and OpDrawing/OpImageDrawing/OpSound/Compiled) only need the
// registries, not Essentials itself.
//
// evaluator: name (with arity suffix, e.g. "sin$1") -> function(args, modifs)
// eval_helper: helper functions shared by the operator implementations

const evaluator = {};
const eval_helper = {};

export { evaluator, eval_helper };
