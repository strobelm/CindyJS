// Leaf module: the state-vector sizes of the tracing routines.
//
// GeoOps.js builds its operation tables at module scope and needs these three
// numbers there (`geoOps.IntersectCirCir.stateSize = ...`), while Tracing.js -
// which owns the routines the numbers describe - imports GeoOps.js in turn.
// Reading them off the function objects (`tracing2.stateSize`) therefore made
// GeoOps depend on Tracing having been *evaluated* first, and ESM does not
// promise that inside a cycle: in the bundled build Tracing is entered first,
// so GeoOps' body runs before `tracing2.stateSize = 12` ever executes and every
// affected operation ends up with an undefined state size. The concatenation
// build hid this because make/sources.js lists Tracing before GeoOps.
//
// Owning the constants in a leaf, the way MODERNIZATION.md prescribes for
// init-time dependencies, removes the init-time edge GeoOps -> Tracing and with
// it the order sensitivity. Tracing.js keeps publishing them on the function
// objects, since that is what the tracing machinery itself reads at run time.

// two three-element complex vectors
const tracing2StateSize = 12;

// four three-element complex vectors
const tracing4StateSize = 24;

const tracing2ConicsStateSize = 24;

export { tracing2StateSize, tracing4StateSize, tracing2ConicsStateSize };
