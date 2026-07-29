# CindyJS Modernization Plan

Goal: an ESM/TypeScript codebase built with a standard toolchain, published on
npmjs as `cindyjs` (core + CindyGL + Cindy3D), while every existing script-tag
deployment and every legacy plugin keeps working unchanged.

## Scope decisions

- **Modernized:** core (`src/js`), `plugins/cindygl`, `plugins/cindy3d`.
- **Kept running, not modernized:** cindyprint, cindyxr, cindyleap,
  ComplexCurves, katex, midi, QuickHull3D, symbolic. They interact with the
  core only through the plugin API (`CindyJS.registerPlugin`), so they keep
  building with the old `node make` pipeline and loading against the bundled
  builds. The plugin API is therefore a compatibility contract and must not
  change observable behavior.
- **Compatibility target:** the published artifacts must include drop-in
  replacements for today's `build/js/Cindy.js`, `CindyGL.js`, `Cindy3D.js`
  (global-scope IIFE bundles), alongside new ESM entry points.
- **Safety net, not rewrite:** behavior is frozen throughout. The existing
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

**Circular dependencies** (hit in an earlier rollup attempt): the concat scope
allows free mutual calling, so cycles are expected — they are not a blocker.

- First map them: `madge --circular` (or eslint `import/no-cycle`) on the
  converted tree, and classify each cycle as _call-time_ (an imported function
  is only invoked inside function bodies) or _init-time_ (an imported binding
  is read during module evaluation, e.g. building a table at top level).
- Call-time cycles are legal ESM and work with live bindings; rollup/esbuild
  only warn. Tolerate them during the migration; untangle opportunistically
  in Phase 3.
- Init-time cycles must be broken by inversion, not import tricks: the
  lower-level module owns an empty registry, higher layers register into it,
  and `Setup.js` acts as the composition root that does the wiring. Likely
  candidates: the operator table (`Evaluator` ↔ `Operators`), accessor/geo-op
  definition tables (`Accessors`, `GeoOps` ↔ `Tracing`).
- Configure the bundler to fail CI on _new_ cycles once the initial set is
  inventoried, so the count only goes down.

Supporting changes in the same phase:

- `tools/cs2js.js` emits an ES module instead of a concatenation fragment.
- `build/js/Version.js` becomes a build-time constant (esbuild `define`).
- `src/js/Head.js`, `Tail.js`, `Cindy.js.wrapper`, and `expose.ts` are
  deleted. Tests import modules directly; `rewire` and the `exposed` bundle
  disappear. Keep test file names and assertions unchanged so failures are
  attributable to the migration, not to test rewrites.
- An esbuild IIFE bundle (`CindyJS` global) reproduces today's `Cindy.js`.
  Gate: ref doctests, unit tests, property tests, `excomp`, and the Playwright
  smoke test all pass against the bundled output.

Do this as one focused push per layer (bottom-up), not a months-long dual
system. The old concat build keeps working from a branch until the final layer
lands, then is switched off in one commit.

## Phase 2 — Replace the build system for the core

- esbuild drives everything for the core: dev build with watch + serve
  (replaces `node make live`), production build with minify + sourcemaps
  (replaces Closure; run `benchmarks/` and compare bundle size before/after to
  quantify the regression, if any).
- Small plain-node scripts (in `make/` or `scripts/`) wrap the remaining
  non-bundling steps: cs2js, sass, ref-doctest runner, forbidden-pattern
  checks, example compile check. Wire them as npm scripts:
  `dev`, `build`, `test`, `test:unit`, `test:ref`, `lint`, `bench`.
- `node make` remains solely as the legacy-plugin builder (Closure + Java stay
  a dependency only for that path); the core no longer needs Java.
- CI runs the new pipeline plus one legacy-plugin build to prove the contract
  holds.

## Phase 3 — TypeScript migration of the core

- Flip `allowJs: true`, `checkJs` selectively; migrate file-by-file in the
  same bottom-up order as Phase 1. `CSNumber.ts`/`Json.ts`/`types.ts` already
  exist as the template.
- Tighten `tsconfig` incrementally (`strictNullChecks` etc. are currently
  off); enable per-flag once the codebase passes.
- Emit `.d.ts` for the public API: `CindyJS(...)`, the plugin registration
  API, and the data types plugins consume (`CSNumber`, `List`, modifiers).
  These types are also the executable specification of the legacy-plugin
  contract.

## Phase 4 — CindyGL and Cindy3D

- Convert both to TS ESM in the same toolchain. Their existing Closure
  `/** @type {...} */` annotations translate nearly 1:1 to TypeScript.
- GLSL sources import via esbuild's text loader (replaces the `c3dres`/
  `cglres` string-resource tasks).
- Each ships two ways: a subpath export (`cindyjs/cindygl`, `cindyjs/cindy3d`)
  and a standalone IIFE bundle (`CindyGL.js`, `Cindy3D.js`) for script-tag
  users, registered through the same public plugin API the legacy plugins use
  — no private core access, so the modernized plugins prove the API is
  sufficient.
- Gate: the Playwright GPU smoke tests from Phase 0.

## Phase 5 — npm publishing

- `package.json`:
    - `"type": "module"`, `exports` map: `.` (ESM + types), `./cindygl`,
      `./cindy3d`, plus the IIFE bundles under `./dist/*` for CDN use
      (jsDelivr/unpkg), `sideEffects` audited, `files` restricted to `dist` +
      types + LICENSE/README.
    - version: start `0.1.0` and move honestly toward `1.0.0` once the API
      surface is typed and stable; the existing 0.0.5 on npm makes any fresh
      `0.x` fine.
- Publish from CI on tag with `--provenance`; no local publishes.
- Document the CDN path so cindyjs.org and existing users can switch script
  tags with a one-line change.

## Phase 6 — Cleanup and docs

- Remove dead make tasks, wrappers, `rewire`, the `exposed` machinery, and any
  dependency only they used.
- Update README, [the createCindy reference](ref/createCindy.md), and CLAUDE.md for the new commands and
  the ESM import story (`import { CindyJS } from "cindyjs"`).
- Keep `ref/` doctests running under node against the ESM build — they remain
  the executable documentation.

## Known risks

- **Implicit shared state** across concatenated files is the main unknown in
  Phase 1; the mechanical conversion surfaces it, but tracing/geo state may
  need genuine (small) refactors to become importable.
- **Dropping Closure ADVANCED for the core** removes property renaming; the
  IIFE bundle must be checked to expose only the intended `CindyJS` global,
  and bundle size compared (expect some growth; acceptable if benchmarks
  hold).
- **Strict-mode/module semantics**: top-level `this`, cross-file function
  hoisting, and accidental globals behave differently in modules — exactly the
  bugs the test suites and the Playwright smoke test exist to catch.
- **Legacy plugins** are compiled against `plugins/cindyjs.externs`; that
  externs file must stay in sync with the (now typed) public API until those
  plugins are retired.
