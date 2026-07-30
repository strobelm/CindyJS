# CindyJS Modernization Plan

Goal: an ESM/TypeScript codebase built with a standard toolchain, published on
npmjs as `cindyjs` (core + CindyGL + Cindy3D), while every existing script-tag
deployment and every legacy plugin keeps working unchanged.

## Scope decisions

-   **Modernized:** core (`src/js`), `plugins/cindygl`, `plugins/cindy3d`.
-   **Kept running, not modernized:** cindyprint, cindyxr, cindyleap,
    ComplexCurves, katex, midi, QuickHull3D, symbolic. They interact with the
    core only through the plugin API (`CindyJS.registerPlugin`), so they keep
    building with the old `node make` pipeline and loading against the bundled
    builds. The plugin API is therefore a compatibility contract and must not
    change observable behavior.
-   **Compatibility target:** the published artifacts must include drop-in
    replacements for today's `build/js/Cindy.js`, `CindyGL.js`, `Cindy3D.js`
    (global-scope IIFE bundles), alongside new ESM entry points.
-   **Safety net, not rewrite:** behavior is frozen throughout. The existing
    suites — mocha unit tests, fast-check property tests, `ref/` doctests,
    example compile checks — gate every phase. No phase lands red.

## Phase 0 — Safety net and tooling hygiene (no architecture changes)

1. Ensure `node make alltests` is green in CI and stays required.
2. Raise the Node baseline to current LTS (≥ 20) and state it in
   `package.json#engines`.
3. Replace dead/ancient dev dependencies that only the build tools use, without
   changing the build's behavior:
    - `q` / `q-io` → native promises + `fs/promises` in `make/`
    - `request` (deprecated) → native `fetch`
    - drop `babel-cli` 6 (redundant next to `@babel/core` 7; check what still
      invokes it)
    - ESLint 7 → 9 (flat config), Prettier 2 → 3, Mocha current
4. Add a headless-browser smoke test (Playwright) that loads a handful of
   examples including one CindyGL and one Cindy3D example and asserts no
   errors and a non-blank canvas. This is the only coverage the GPU plugins
   have; it must exist before their sources are touched.
5. Verify control of the `cindyjs` npm name (0.0.5 is published). If the org
   doesn't own it, plan for the `@cindyjs/…` scope instead.

## Phase 1 — Core to ES modules

The concatenation order in `make/sources.js` _is_ the dependency graph; the
conversion follows it bottom-up:

`CSNumber` → `List` → `Json`/`Dict` → `General`/`Essentials` → `Namespace` →
`Accessors` → `Operators`/`OpDrawing`/`OpImageDrawing`/`OpSound` → `Parser` →
`Evaluator` → `CSad`/`Render2D`/`RenderBackends`/`Tools`/`PSLQ` → `libgeo`
(GeoState → GeoBasics → GeoRender → Tracing → Prover → GeoOps → GeoScripts →
StateIO) → `liblab` → `Setup.js`/`Events.js`.

Per file: add explicit `import`/`export`, delete nothing else. Shared mutable
state that today lives in the common IIFE scope (`namespace`, `csconsole`,
`globalInstance`, tracing state, …) moves into small dedicated modules so the
dependency direction stays acyclic. Converting a layer mechanically surfaces
every implicit cross-file global as an unresolved identifier — that is the
point; resolve each with an explicit import, never with a new global.

**Head start:** the core sources are already ESM-annotated — every file except
`Parser.js`/`GeoScripts.js` carries `import`/`export` statements (resolved via
`src/js/jsconfig.json` baseUrl) which the concat build strips with
`babel-plugin-remove-import-export` in `tools/cat.js`. Phase 1 is therefore
mostly: make those imports real, complete the missing ones, and break the
init-time cycles below.

**Circular dependencies** (hit in an earlier rollup attempt): the concat scope
allows free mutual calling, so cycles are expected — they are not a blocker.

Analysis results (2026-07-29, scope-aware AST pass over the annotated
imports): 33 files, 215 import edges, 401 call-time-only imported bindings;
madge reports 75 elementary cycles but only **two init-time SCCs** need
structural work, and no dynamic-import workarounds are acceptable:

1. `Essentials ↔ Operators`: `Essentials` builds `infixmap` at top level from
   ~36 operator functions imported from `Operators`, while `Operators` (plus
   `OpDrawing`/`OpImageDrawing`/`OpSound`, those one-directional) registers
   ~300 entries into the `evaluator`/`eval_helper` objects owned by
   `Essentials` at top level. Fix: move the `evaluator` registry (and
   `eval_helper`) into a new leaf module; registrars import the registry,
   `Essentials` imports `Operators` only for `infixmap`. Cycle gone with
   static imports only.
2. `Setup ↔ GeoOps ↔ Tracing`: `Tracing`/`StateIO`/`RenderBackends` init-read
   mutable instance state (`globalInstance`, `shutdownHooks`, …) exported by
   `Setup`; `GeoOps` init-reads `tracing2.stateSize` etc. from `Tracing` for
   its top-level op tables; `Setup` init-uses `noop` from `GeoOps`. Fix:
   extract the per-instance mutable state from `Setup` into a small leaf
   state module (sibling of `expose.ts`'s env shims). All init-time edges
   into `Setup` disappear.

With both extractions the init-time graph is acyclic. Two missing imports to
add (`window` in `Parser.js` L780, `niceprint` in `types.ts`); the remaining
call-time cycles are legal ESM live-binding usage and stay as-is.

-   First map them: `madge --circular` (or eslint `import/no-cycle`) on the
    converted tree, and classify each cycle as _call-time_ (an imported function
    is only invoked inside function bodies) or _init-time_ (an imported binding
    is read during module evaluation, e.g. building a table at top level).
-   Call-time cycles are legal ESM and work with live bindings; rollup/esbuild
    only warn. Tolerate them during the migration; untangle opportunistically
    in Phase 3.
-   Init-time cycles must be broken by inversion, not import tricks: the
    lower-level module owns an empty registry, higher layers register into it,
    and `Setup.js` acts as the composition root that does the wiring. Likely
    candidates: the operator table (`Evaluator` ↔ `Operators`), accessor/geo-op
    definition tables (`Accessors`, `GeoOps` ↔ `Tracing`).
-   Configure the bundler to fail CI on _new_ cycles once the initial set is
    inventoried, so the count only goes down.

### Restructuring steps (minimal, in order; every step lands with alltests green)

1. **Extract the evaluator registry.** New leaf module
   `src/js/libcs/Registry.js` exporting the (initially empty) `evaluator` and
   `eval_helper` objects. `Essentials` imports them from there and keeps
   defining its own helpers on them; `Operators`, `OpDrawing`,
   `OpImageDrawing`, `OpSound` re-point their imports to the registry. No
   other code moves. Breaks SCC 1 (`Essentials ↔ Operators`).
2. **Extract instance state.** New leaf module `src/js/Instance.js` owning
   the mutable per-widget state init-read outside `Setup`: `globalInstance`,
   `shutdownHooks` (move `csgeo`/`cscompiled` too only if they turn out to be
   plain mutable containers — cohesion beats minimality there). `Setup`,
   `Tracing`, `StateIO`, `RenderBackends` import from it. Breaks SCC 2
   (`Setup ↔ GeoOps ↔ Tracing`).
3. **Complete the annotations.** Add the two missing imports (`window` in
   `Parser.js`, `niceprint` in `types.ts`). This makes every cross-file
   reference in the core explicit.
4. **Normalize import specifiers.** Mechanical codemod: bare
   `"libcs/CSNumber"` → relative `"./CSNumber.js"` (with extension), so node,
   browsers, and every bundler resolve the graph without alias config; drop
   the `baseUrl` crutch from `src/js/jsconfig.json`/`tsconfig.json`
   (`moduleResolution` set accordingly for the TS files). Bare specifiers are
   for npm packages; relative paths are the standard for internal modules.
5. **Add the entry module.** `src/js/index.js` imports every side-effectful
   module explicitly in the current `make/sources.js` order (pinning
   registration order — ESM evaluation order follows the entry's import
   list) and exports the public API. `Head.js`/`Tail.js` and the concat
   build stay canonical for now; `cat.js` keeps stripping imports, and the
   entry file simply isn't in `sources.js`.
6. **Add the graph gate to CI.** Promote the dependency analysis into
   `tools/check-esm-graph.js` and a make task wired into `alltests`,
   asserting: zero unresolved specifiers, zero missing imports, zero
   init-time cycles (call-time cycles are reported but allowed — the count
   may only go down). Plus an esbuild bundle smoke check (`esbuild` devDep —
   it's Phase 2's tool anyway): the entry must bundle and evaluate under
   node. From this step on, the ESM graph cannot silently rot while the
   concat build is still the shipping path.
7. **Flip the switch (exit of Phase 1) — factory bundle.** Finding
   (2026-07-29): the whole core is concatenated INSIDE
   `CindyJS.newInstance`, so the interpreter re-evaluates per widget —
   that is the multi-instance mechanism. A state inventory counts 94
   runtime-stateful top-level bindings (73 rebound, 21 mutated) vs 307
   init-only, clustered in Setup (36), Tracing (13), Events (8), plus
   `csport`/`Render2D` drawing state; 16 of 34 modules are fully
   stateless, including the whole data layer. Naive once-evaluated ESM
   would share interpreter state across widgets. Therefore the flip
   preserves semantics by construction:

    - `Head.js`'s once-only logic (CindyJS callable, plugin registry,
      script loader, waitFor, dumpState) becomes a real module evaluated
      once.
    - The instance graph (current `index.js` content) is esbuild-bundled
      as the BODY of `newInstance`, re-evaluated per call — exactly
      today's per-instance closure semantics, produced from real modules.
    - `expose.ts` becomes the environment seam: a browser variant
      (real `window`/`document`, `instanceInvocationArguments` from the
      `newInstance` parameter, injected via esbuild module substitution —
      a standard build-time seam, not a runtime hack) and the existing
      node/test variant.
    - 7a: the factory bundle ships as `build/js/Cindy.js` (concat +
      Closure retired for the core; still used by legacy plugins).
      **Landed.** `tools/build-cindy.js` composes two esbuild bundles:
      `src/js/CindyJS.js` (once) and `src/js/instance-main.js`
      (`format: "iife"`, `globalName`), the latter spliced textually into
      the `newInstance` wrapper, which binds `CindyJS`,
      `instanceInvocationArguments`, `nada` and `generateId` as locals
      that `src/js/expose.browser.js` picks up as free identifiers.
      `version` is an esbuild `define`. `tools/esbuild-common.js` holds
      the config both the shipping build and the `esmbundle` check use.
      The ref doctests now load the shipping artifact, and a fifth
      Playwright case (`tests/browser/fixtures/two-widgets.html`) asserts
      that two widgets on one page keep separate interpreter state - the
      regression test for the factory semantics and for step 8.

        Two order bugs surfaced that the concatenation had hidden, both in
        the 25-file call-time cycle where ESM, not `make/sources.js`,
        decides the evaluation order: `GeoOps` read `tracing2.stateSize`
        off `Tracing` at definition time (fixed by the leaf module
        `libgeo/TracingSizes.js`), and `Tracing` built its trace-log labels
        with `General.wrap` at module scope (now built on first use).
        `tools/check-esm-graph.js` gained check (d3), which replays the
        actual depth-first evaluation order and fails on any init-time edge
        that comes out inverted - the class of bug that costs a doctest run
        to find otherwise.

        Consequence to note: the core artifact is now ES2018 + `globalThis`
        output rather than Closure's ES5. Retiring Closure for the core was
        always the plan; dropping IE is the visible part of it.

    - 7b: unit tests drop `rewire` for an esbuild-built CJS test bundle
      re-exporting the internals; `Head.js`/`Tail.js` and `tools/cat.js`'s
      import-stripping die. **Landed.** `src/js/test-exports.js` is the
      explicit test surface (9 names) and `tools/build-test-bundle.js`
      turns it into `build/js/exposed.cjs` (format `cjs`, node platform,
      the `expose.ts` seam deliberately _not_ substituted). Deleted with
      it: `Head.js`, `Tail.js`, `Cindy.js.wrapper`,
      `tools/eslint-reporter.js`, the make tasks `plain`/`closure`/`ours`,
      the core file lists in `make/sources.js`, `cat.js`'s babel pass, and
      the `rewire` devDependency. `make eslint` is now the source lint
      alone - the cross-file-undefined class it used to catch on
      `ours.js` is covered by `tools/check-esm-graph.js`. The
      QuickHull3D unit tests, which used `rewire` on that legacy plugin's
      scope-sharing sources, load them through `tests/quickhull.cjs`
      instead, which concatenates them into one scope the way the
      shipping plugin build does.

8. **Shrink the factory (the path to true single-evaluation ESM).**
   After the flip, hoist provably stateless modules OUT of the
   per-instance factory one subsystem at a time, sharing them across
   instances; the graph gate enforces that hoisted modules never import
   factory modules. First candidate: the data layer (8 stateless files),
   unblocked by the Phase 3 List-purity cleanup. Each hoist is small and
   independently testable. The full instance-context refactor (option B)
   thereby becomes a ratchet, not a big-bang phase; the async-capture
   risk (callbacks re-binding the current instance) is confined to the
   last, smallest steps.

    **Mechanism landed** (first hoists: `libcs/PSLQ.js`,
    `libgeo/TracingSizes.js`). `tools/hoisted-modules.js` is the manifest;
    the once-bundle entry is now `src/js/once-main.js` (CindyJS.js plus the
    namespace objects of the hoisted modules, published as
    `__cindyOnce.shared`), and tools/build-cindy.js substitutes each hoisted
    module in the per-instance bundle with a generated shim that re-exports
    off the `__cindyShared` wrapper binding. Guards: check (f) in
    tools/check-esm-graph.js fails any hoisted module whose imports leave
    the hoisted set (a factory module inlined into the once-bundle would be
    silently shared state), and build-cindy asserts the real files land in
    the once-bundle only. The data layer stays blocked until the Phase 3
    List-purity cleanup - `CSNumber.ts` additionally reads
    `instanceInvocationArguments.angleUnit` at module scope, so it also
    needs per-instance parameterization before it can move.

Explicitly out of scope for these steps: renames, TypeScript conversion,
tsconfig strictness, build-system replacement, and any dynamic `import()` —
cycles are broken by the two extractions alone, statically.

Supporting changes in the same phase:

-   `tools/cs2js.js` emits an ES module instead of a concatenation fragment.
-   `build/js/Version.js` becomes a build-time constant (esbuild `define`).
-   `src/js/Head.js`, `Tail.js`, `Cindy.js.wrapper`, and `expose.ts` are
    deleted. Tests import modules directly; `rewire` and the `exposed` bundle
    disappear. Keep test file names and assertions unchanged so failures are
    attributable to the migration, not to test rewrites.
-   An esbuild IIFE bundle (`CindyJS` global) reproduces today's `Cindy.js`.
    Gate: ref doctests, unit tests, property tests, `excomp`, and the Playwright
    smoke test all pass against the bundled output.

Do this as one focused push per layer (bottom-up), not a months-long dual
system. The old concat build keeps working from a branch until the final layer
lands, then is switched off in one commit.

## Phase 2 — Replace the build system for the core

-   esbuild drives everything for the core: dev build with watch + serve
    (replaces `node make live`), production build with minify + sourcemaps
    (replaces Closure; run `benchmarks/` and compare bundle size before/after to
    quantify the regression, if any).
-   Small plain-node scripts (in `make/` or `scripts/`) wrap the remaining
    non-bundling steps: cs2js, sass, ref-doctest runner, forbidden-pattern
    checks, example compile check. Wire them as npm scripts:
    `dev`, `build`, `test`, `test:unit`, `test:ref`, `lint`, `bench`.
-   `node make` remains solely as the legacy-plugin builder (Closure + Java stay
    a dependency only for that path); the core no longer needs Java.
-   CI runs the new pipeline plus one legacy-plugin build to prove the contract
    holds.

## Phase 3 — TypeScript migration of the core

-   Flip `allowJs: true`, `checkJs` selectively; migrate file-by-file in the
    same bottom-up order as Phase 1. `CSNumber.ts`/`Json.ts`/`types.ts` already
    exist as the template.
-   Tighten `tsconfig` incrementally (`strictNullChecks` etc. are currently
    off); enable per-flag once the codebase passes.
-   ~~When `List.js` is converted: move its ~10 interpreter-dependent call
    sites up into the operator layer~~ **Done early** (pulled forward after
    step 8, since it gates hoisting the data layer): `List.js` now imports
    only `CSNumber`/`General`/`expose`. Structural equality lives in
    `General.equals` (`eval_helper.equals` delegates); the elementwise `~=`
    and the geo→value coercion of `evaluateAndVal` are reproduced purely in
    `List.js` (`derefGeo`: point → dehomogenized coordinates, mass → value —
    exact because list constructors evaluate their elements, so on an element
    `evaluateAndVal` reduces to that coercion). Remaining before the data
    layer is interpreter-free: `General`/`Dict` import `niceprint` from
    `Essentials`, `Dict` imports `csconsole` from `Setup`, `Json.ts` imports
    `Evaluator`/`Namespace`, and `CSNumber.ts` reads
    `instanceInvocationArguments.angleUnit` at module scope. `General` stays
    as-is otherwise — it is the polymorphic dispatch layer over the value
    union, and becomes the home of the typed `CSValue` union.
-   Emit `.d.ts` for the public API: `CindyJS(...)`, the plugin registration
    API, and the data types plugins consume (`CSNumber`, `List`, modifiers).
    These types are also the executable specification of the legacy-plugin
    contract.

## Phase 4 — CindyGL and Cindy3D

-   Convert both to TS ESM in the same toolchain. Their existing Closure
    `/** @type {...} */` annotations translate nearly 1:1 to TypeScript.
-   GLSL sources import via esbuild's text loader (replaces the `c3dres`/
    `cglres` string-resource tasks).
-   Each ships two ways: a subpath export (`cindyjs/cindygl`, `cindyjs/cindy3d`)
    and a standalone IIFE bundle (`CindyGL.js`, `Cindy3D.js`) for script-tag
    users, registered through the same public plugin API the legacy plugins use
    — no private core access, so the modernized plugins prove the API is
    sufficient.
-   Gate: the Playwright GPU smoke tests from Phase 0.

## Phase 5 — npm publishing

-   `package.json`:
    -   `"type": "module"`, `exports` map: `.` (ESM + types), `./cindygl`,
        `./cindy3d`, plus the IIFE bundles under `./dist/*` for CDN use
        (jsDelivr/unpkg), `sideEffects` audited, `files` restricted to `dist` +
        types + LICENSE/README.
    -   version: start `0.1.0` and move honestly toward `1.0.0` once the API
        surface is typed and stable; the existing 0.0.5 on npm makes any fresh
        `0.x` fine.
-   Publish from CI on tag with `--provenance`; no local publishes.
-   Document the CDN path so cindyjs.org and existing users can switch script
    tags with a one-line change.

## Phase 6 — Cleanup and docs

-   Remove dead make tasks, wrappers, `rewire`, the `exposed` machinery, and any
    dependency only they used.
-   Update README, [the createCindy reference](ref/createCindy.md), and CLAUDE.md for the new commands and
    the ESM import story (`import { CindyJS } from "cindyjs"`).
-   Keep `ref/` doctests running under node against the ESM build — they remain
    the executable documentation.

## Known risks

-   **Implicit shared state** across concatenated files is the main unknown in
    Phase 1; the mechanical conversion surfaces it, but tracing/geo state may
    need genuine (small) refactors to become importable.
-   **Dropping Closure ADVANCED for the core** removes property renaming; the
    IIFE bundle must be checked to expose only the intended `CindyJS` global,
    and bundle size compared (expect some growth; acceptable if benchmarks
    hold).
-   **Strict-mode/module semantics**: top-level `this`, cross-file function
    hoisting, and accidental globals behave differently in modules — exactly the
    bugs the test suites and the Playwright smoke test exist to catch.
-   **Legacy plugins** are compiled against `plugins/cindyjs.externs`; that
    externs file must stay in sync with the (now typed) public API until those
    plugins are retired.
