# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & test commands

The project uses a custom JavaScript build system in `make/` (the `Makefile` just forwards to it). Invoke it as `node make [SETTINGS] [TASKS]`, where settings are `NAME=VALUE` arguments. Task definitions live in `make/build.js`; settings in `make/Settings.js`; docs in `make/README.md`.

- `node make` — build `build/js/Cindy.js` (esbuild, unminified; there is only one flavor of the core now)
- `node make all` — Cindy.js plus all plugins (cindy3d, cindygl, katex, …). The plugins are still compiled with the Closure Compiler and need a Java runtime.
- `node make live <task>` — watch sources, rebuild on change, reload connected browsers
- `node make tests` — Cindy.js build + ref-manual tests + unit tests + example compilation
- `node make alltests` — full pre-PR suite (tests, eslint, deploy, forbidden-pattern checks, ref). Run after `git add`-ing your changes; CI runs the same suite.
- `node make eslint` or `npm run lint` — lint
- `npm run prettier` — format (prettier also runs on staged files via husky/lint-staged)
- Serve examples locally: `node_modules/.bin/st -l -nc`, then open `http://127.0.0.1:1337/examples/`

### Running unit tests

`node make unittests` runs mocha over `tests/`. The tests load two build artifacts rather than source files:

- `build/js/exposed.cjs` (`node make exposed`) — a CommonJS esbuild bundle of the module graph that re-exports the core internals the suites use (`List`, `CSNumber`, `Dict`, `General`, `niceprint`, `nada`, `geoOps`, `PSLQ`, `PSLQMatrix`). The export list lives in `src/js/test-exports.js`; add to it when a test needs another internal.
- `build/js/Cindy.js` (`node make Cindy.js`) — the shipping artifact, for the suites that drive the public `CindyJS({...})` API.

So after editing sources, rebuild before invoking mocha directly:

```
node make exposed Cindy.js
npx mocha tests/List_tests.js               # single file
npx mocha tests/List_tests.js -g "pattern"  # single test
```

(On Node ≥ 21.2 the build system adds `--no-experimental-global-navigator`; the suites stub `global.navigator` themselves.)

Ref-manual doctests: `node make nodetest` runs the CindyScript snippets embedded in `ref/*.md` via `ref/js/runtests.js`.

## Architecture

**Cindy.js is built from ES modules with esbuild.** Core sources under `src/js/` are real ES modules; `src/js/index.js` is the entry that pins the evaluation order (new source files must be reachable from it — `node make esmgraph` and `node make esmbundle` enforce that, plus import resolution and the absence of init-time cycles). TypeScript sources (`libcs/CSNumber.ts`, `libcs/Json.ts`, `expose.ts`, `types.ts`) are read by esbuild directly; `node make typescript` (tsc) only type-checks.

`tools/build-cindy.js` composes the artifact out of two esbuild bundles, because the whole interpreter lives inside `CindyJS.newInstance` and is re-evaluated per widget — that re-evaluation is the multi-instance mechanism. `src/js/CindyJS.js` is the once-per-page half; `src/js/instance-main.js` is the per-instance graph, spliced textually into the `newInstance` wrapper. `src/js/expose.ts` / `src/js/expose.browser.js` are the environment seam (node stubs vs. real DOM), selected by an esbuild module substitution. `tools/esbuild-common.js` holds the configuration all three esbuild consumers share (`build-cindy.js`, `build-test-bundle.js`, `bundle-esm.js`).

`make/sources.js` no longer holds the core's file order — only the vendored `lib/` scripts, the scss and ifs inputs.

Main layers, bottom-up (the order in `src/js/index.js`):

- `src/js/libcs/` — the CindyScript language: `Parser.js` → `Evaluator.js`/`Operators.js` (built-in functions), with core data types `CSNumber.ts` (complex arithmetic), `List.js` (vectors/matrices, incl. numerical linear algebra like `List.eig`), `Dict.js`; rendering in `Render2D.js`/`RenderBackends.js`. `build/js/Compiled.js` is generated from CindyScript sources by `tools/cs2js.js`.
- `src/js/libgeo/` — the geometry engine: `GeoOps.js` (construction operations), `Tracing.js` (continuity/tracing of moving elements), `Prover.js`, `GeoState.js`.
- `src/js/liblab/` — lab/physics objects.
- `src/js/Setup.js` / `Events.js` — widget creation (`CindyJS(...)` API, documented in [the createCindy reference](ref/createCindy.md)) and event handling.

**Plugins** (`plugins/`) are separate artifacts, each compiled with the Closure Compiler at ADVANCED level against `plugins/cindyjs.externs` (cindy3d, cindygl, ComplexCurves, katex, …). They interact with the core only through the plugin API, so core-internal renames don't break them.

The `ref/` directory is both documentation and executable test suite: markdown files describe CindyScript functions with `> examples` that `nodetest` executes. `examples/*.html` are compile-checked by the `excomp` task and screened for forbidden patterns (correct script MIME type `text/x-cindyscript`, `<div>` not `<canvas>` for the widget container, etc.) by the `forbidden` task.
