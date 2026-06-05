// Deterministic configuration for every fast-check property test in the suite.
//
// A fixed seed makes CI reproducible: a borderline numerical case fails the same
// way on every run (caught in review) instead of flaking intermittently, and any
// reported counterexample can be replayed exactly. Individual properties still
// set their own `numRuns`; `verbose` prints the shrinking path on failure.
//
// To explore fresh inputs locally, run with a different seed, e.g.
//   FAST_CHECK_SEED=12345 npx mocha tests
const fc = require("fast-check");

const envSeed = Number(process.env.FAST_CHECK_SEED);
fc.configureGlobal({
    seed: Number.isFinite(envSeed) ? envSeed : 0x5eed,
    numRuns: 100,
    verbose: 1,
});
