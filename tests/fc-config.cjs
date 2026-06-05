// Shared fast-check configuration for the property-based test suite.
//
// By default the seed is random: each run explores fresh inputs, which is the
// point of property testing. On failure fast-check prints the seed and shrinking
// path, so any counterexample can be replayed exactly by pinning it:
//   FAST_CHECK_SEED=12345 npx mocha tests
// `verbose` enables that shrink-path output; individual properties set numRuns.
const fc = require("fast-check");

const envSeed = Number(process.env.FAST_CHECK_SEED);
fc.configureGlobal({
    ...(Number.isFinite(envSeed) ? { seed: envSeed } : {}), // pin only when requested
    numRuns: 100,
    verbose: 1,
});
