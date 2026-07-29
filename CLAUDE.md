# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & test commands

The project uses a custom JavaScript build system in `make/` (the `Makefile` just forwards to it). Invoke it as `node make [SETTINGS] [TASKS]`, where settings are `NAME=VALUE` arguments. Task definitions live in `make/build.js`; settings in `make/Settings.js`; docs in `make/README.md`.

- `node make` — development build of `Cindy.js` (fast, unminified, `plain` compiler)
- `node make build=release Cindy.js` — release build via Closure Compiler (needs a Java runtime). Code must work in **both** build modes; the release build also surfaces extra warnings.
- `node make all` — Cindy.js plus all plugins (cindy3d, cindygl, katex, …)
- `node make live <task>` — watch sources, rebuild on change, reload connected browsers
- `node make tests` — closure build + ref-manual tests + unit tests + example compilation
- `node make alltests` — full pre-PR suite (tests, eslint, deploy, forbidden-pattern checks, ref). Run after `git add`-ing your changes; CI runs the same suite.
- `node make eslint` or `npm run lint` — lint
- `npm run prettier` — format (prettier also runs on staged files via husky/lint-staged)
- `node make benchmark` — microbenchmarks in `benchmarks/`
- Serve examples locally: `node_modules/.bin/st -l -nc`, then open `http://127.0.0.1:1337/examples/`

### Running unit tests

`node make unittests` runs mocha over `tests/`. The tests do **not** import source files directly — they `rewire("../build/js/exposed.js")`, a concatenated bundle whose internals are made visible by `src/js/expose.ts`. So after editing sources, rebuild before invoking mocha directly:

```
node make exposed
npx mocha tests/Eig_tests.js               # single file
npx mocha tests/Eig_tests.js -g "pattern"  # single test
```

(On Node ≥ 21.2 the build system adds `--no-experimental-global-navigator`; `tests/setup.cjs` stubs `navigator` regardless.)

Property-based tests (`*_property_tests.js`) use fast-check with a random seed per run (config in `tests/fc-config.cjs`). On failure fast-check prints the seed; replay with `FAST_CHECK_SEED=12345 npx mocha tests`.

Ref-manual doctests: `node make nodetest` runs the CindyScript snippets embedded in `ref/*.md` via `ref/js/runtests.js`.

## Architecture

**Cindy.js is built by concatenation, not modules.** Core sources under `src/js/` carry `import`/`export` annotations (paths resolved via `src/js/jsconfig.json`), but the build strips them (`babel-plugin-remove-import-export` in `tools/cat.js`) and concatenates everything into one shared scope inside an IIFE formed by `src/js/Head.js` … `src/js/Tail.js` — so imports are documentation of the dependency graph, not yet load-bearing. The exact file order is defined in `make/sources.js` — new source files must be registered there or they won't be built. TypeScript sources (e.g. `libcs/CSNumber.ts`, `libcs/Json.ts`) are compiled to `build/ts/` first and the compiled output is concatenated in place of the `.js` file. Several bundle flavors exist: `Cindy.plain.js` (dev), `Cindy.closure.js` (release), `ours.js` (lint target), and `exposed.js` (test target, with internals exported via `expose.ts`).

Main layers, in the order they are concatenated:

- `src/js/libcs/` — the CindyScript language: `Parser.js` → `Evaluator.js`/`Operators.js` (built-in functions), with core data types `CSNumber.ts` (complex arithmetic), `List.js` (vectors/matrices, incl. numerical linear algebra like `List.eig`), `Dict.js`; rendering in `Render2D.js`/`RenderBackends.js`. `build/js/Compiled.js` is generated from CindyScript sources by `tools/cs2js.js`.
- `src/js/libgeo/` — the geometry engine: `GeoOps.js` (construction operations), `Tracing.js` (continuity/tracing of moving elements), `Prover.js`, `GeoState.js`.
- `src/js/liblab/` — lab/physics objects.
- `src/js/Setup.js` / `Events.js` — widget creation (`CindyJS(...)` API, documented in [the createCindy reference](ref/createCindy.md)) and event handling.

**Plugins** (`plugins/`) are separate artifacts, each compiled with the Closure Compiler at ADVANCED level against `plugins/cindyjs.externs` (cindy3d, cindygl, ComplexCurves, katex, …). They interact with the core only through the plugin API, so core-internal renames don't break them.

The `ref/` directory is both documentation and executable test suite: markdown files describe CindyScript functions with `> examples` that `nodetest` executes. `examples/*.html` are compile-checked by the `excomp` task and screened for forbidden patterns (correct script MIME type `text/x-cindyscript`, `<div>` not `<canvas>` for the widget container, etc.) by the `forbidden` task.
