"use strict";

// ESM graph gate for the core sources (Phase 1, step 6 of MODERNIZATION.md).
//
// The concat build in make/sources.js is still the shipping path, so nothing
// here influences the artifacts; this script only keeps the ES module graph
// from rotting while both worlds coexist. It asserts, over src/js/**/*.{js,ts}:
//
//   (a) every import specifier resolves to a file that exists, and every named
//       import is actually exported by the file it resolves to,
//   (b) no file references a global that a sibling module exports
//       (that is a missing import which only the concat scope hides),
//   (c) no init-time cycles: an imported binding read outside any function
//       body creates an init-time edge, and those edges must be acyclic,
//   (d) call-time-only cycles are reported, not failed - the count is the
//       baseline that step 7 and Phase 3 may only push down.
//
// Two further sections are informational: (d2) init-time edges that sit inside
// a cycle, where ESM cannot promise the callee runs first (tools/bundle-esm.js
// is what proves the current order works), and (e) the non-standard free
// globals the bundle has to provide from outside the module graph.
//
// Run: node tools/check-esm-graph.js [--verbose]

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src", "js");
const verbose = process.argv.includes("--verbose");

// Not part of the module graph:
//   Head.js / Tail.js  - concat-only scaffolding, deleted in step 7b
//   ifs/, includes/    - web worker / asm.js payloads built separately
//
// expose.browser.js IS checked: it is a real module (the shipping variant of
// the environment seam), it just gets substituted for expose.js at build time
// rather than imported by name.
const skipDirs = new Set(["ifs", "includes"]);
const skipFiles = new Set(["Head.js", "Tail.js"]);

// Escape hatch for check (b): names that are unbound in some core file *and*
// exported by another core file, but where the free reference is a legitimate
// external (a DOM global, the CindyJS global itself, third-party code such as
// katex) rather than a missing import.
//
// Steps 1-4 of phase 1 made every cross-file reference explicit, so the
// collision candidates - "window", "document", "nada" and "CindyJS" (DOM
// globals, the shared undefined value and the page-global API object, all
// provided by the environment seam expose.ts / expose.browser.js) - are
// imported everywhere they are used.
//
// The one genuine external is "generateId": src/js/CindyJS.js owns the id
// counter and is evaluated ONCE per page, while the instance graph is
// re-evaluated per widget (see tools/build-cindy.js). Importing it would make
// esbuild inline a second counter into every widget, so libgeo/GeoOps.js reads
// it as a free identifier that the newInstance wrapper binds - the same way the
// concatenated build resolved it into Head.js's scope.
const externalAllowlist = new Set(["generateId"]);

// Free globals that every browser/node file may use without an import. Only
// used for the informational report of "externals the bundle has to provide".
const standardGlobals = new Set([
    ...Object.keys(require("globals").browser),
    ...Object.keys(require("globals").node),
    ...Object.keys(require("globals").es2017),
]);

//////////////////////////////////////////////////////////////////////
// Collect sources

function collectFiles(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!skipDirs.has(entry.name)) collectFiles(full, out);
        } else if (/\.(js|ts)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !skipFiles.has(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

const files = collectFiles(srcRoot, []);
const rel = (p) => path.relative(srcRoot, p).replace(/\\/g, "/");
const short = (p) => rel(p).replace(/\.(js|ts)$/, "");

//////////////////////////////////////////////////////////////////////
// Resolve a specifier the way a bundler configured for the TS ".js"
// extension convention does: "./x.js" may be served by x.js or x.ts.

function resolveSpecifier(spec, fromFile) {
    if (!spec.startsWith(".")) return null; // bare specifier: npm package, not ours
    const base = path.resolve(path.dirname(fromFile), spec);
    const candidates = [base];
    if (base.endsWith(".js")) candidates.push(base.slice(0, -3) + ".ts");
    else candidates.push(base + ".js", base + ".ts");
    for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
}

//////////////////////////////////////////////////////////////////////
// Parse

const asts = new Map(); // absolute path -> ast
const exportsByFile = new Map(); // absolute path -> Set of exported names
const parseErrors = [];

for (const file of files) {
    const code = fs.readFileSync(file, "utf-8");
    let ast;
    try {
        ast = parser.parse(code, {
            sourceType: "module",
            plugins: file.endsWith(".ts") ? ["typescript"] : [],
        });
    } catch (err) {
        parseErrors.push(`${rel(file)}: ${err.message}`);
        continue;
    }
    asts.set(file, ast);

    const exported = new Set();
    for (const node of ast.program.body) {
        if (node.type !== "ExportNamedDeclaration") continue;
        const decl = node.declaration;
        if (decl) {
            if (decl.id && decl.id.type === "Identifier") exported.add(decl.id.name);
            for (const d of decl.declarations || []) if (d.id.type === "Identifier") exported.add(d.id.name);
        }
        for (const s of node.specifiers || []) {
            if (s.exported && s.exported.type === "Identifier") exported.add(s.exported.name);
        }
    }
    exportsByFile.set(file, exported);
}

// name -> exporting file (first one wins; duplicates are reported separately)
const ownerOfExport = new Map();
for (const file of files) {
    for (const name of exportsByFile.get(file) || []) {
        if (!ownerOfExport.has(name)) ownerOfExport.set(name, file);
    }
}

//////////////////////////////////////////////////////////////////////
// Walk

const unresolved = []; // {file, spec, line}
const missingImports = []; // {file, name, owner, line}
const nonStandardGlobals = new Map(); // name -> Set(file) - reported, not failed
const initEdges = new Map(); // file -> Map(file -> [binding names])
const allEdges = new Map(); // file -> Set(file)
let callOnlyBindings = 0;
let initBindings = 0;

function addEdge(map, from, to) {
    if (!map.has(from)) map.set(from, new Set());
    map.get(from).add(to);
}

for (const [file, ast] of asts) {
    // (a) specifier resolution, over every module-level source string
    for (const node of ast.program.body) {
        const src = node.source;
        if (!src) continue;
        if (
            node.type !== "ImportDeclaration" &&
            node.type !== "ExportNamedDeclaration" &&
            node.type !== "ExportAllDeclaration"
        )
            continue;
        if (!src.value.startsWith(".")) continue;
        const target = resolveSpecifier(src.value, file);
        const line = src.loc ? src.loc.start.line : 0;
        if (!target) {
            unresolved.push({ file, spec: src.value, line });
            continue;
        }
        // Named imports must exist on the other side. The concat build hides
        // this (everything shares one scope), a bundler does not.
        const targetExports = exportsByFile.get(target);
        if (!targetExports) continue; // outside the checked tree
        for (const s of node.specifiers || []) {
            if (s.type !== "ImportSpecifier") continue; // default/namespace: nothing to match
            const wanted = s.imported.type === "Identifier" ? s.imported.name : s.imported.value;
            if (!targetExports.has(wanted)) {
                unresolved.push({ file, spec: `${wanted} from ${src.value}`, line, kind: "export" });
            }
        }
    }

    // Names used in TypeScript type positions. Babel's scope analysis reports
    // them as free globals, which they are not at runtime; collecting them here
    // keeps checks (b) and (e) free of type-only noise. Erring towards silence:
    // a name used both as a type and as an undeclared value is skipped too.
    const typeOnlyNames = new Set();
    traverse(ast, {
        TSTypeReference(p) {
            let n = p.node.typeName;
            while (n.type === "TSQualifiedName") n = n.left;
            if (n.type === "Identifier") typeOnlyNames.add(n.name);
        },
        // Interface / type-alias bodies: babel reports member and parameter
        // names of call signatures as free globals. None of them exist at
        // runtime, so every identifier below such a declaration is type-only.
        "TSInterfaceDeclaration|TSTypeAliasDeclaration|TSDeclareFunction|TSModuleDeclaration"(p) {
            if (p.node.id && p.node.id.type === "Identifier") typeOnlyNames.add(p.node.id.name);
            p.traverse({
                Identifier(i) {
                    typeOnlyNames.add(i.node.name);
                },
            });
        },
        TSTypeQuery(p) {
            let n = p.node.exprName;
            while (n.type === "TSQualifiedName") n = n.left;
            if (n.type === "Identifier") typeOnlyNames.add(n.name);
        },
    });

    // Which function bodies run while the module is being evaluated? Not only
    // top-level code: IIFEs, and any module-local function reached from
    // top-level code, run at init as well. Missing that is how three real
    // init-time dependencies survived into the first bundling attempt
    // (Namespace's preset IIFE, Operators' recursiveGen/genericListMathGen).
    //
    // Functions are keyed by the name they are callable under: "f" for a
    // declaration or `const f = function`, "obj.prop" for a top-level
    // `obj.prop = function` (that is the eval_helper registration pattern).
    const functionByKey = new Map();
    const callsInFunction = new Map(); // enclosing function node (or null) -> [key]

    const noteFunction = (key, node) => {
        if (key && node && !functionByKey.has(key)) functionByKey.set(key, node);
    };
    const calleeKey = (callee) => {
        if (callee.type === "Identifier") return callee.name;
        if (
            callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.object.type === "Identifier" &&
            callee.property.type === "Identifier"
        ) {
            return callee.object.name + "." + callee.property.name;
        }
        return null;
    };
    const isFunctionNode = (n) =>
        n &&
        (n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression" || n.type === "FunctionDeclaration");

    traverse(ast, {
        FunctionDeclaration(p) {
            if (p.node.id) noteFunction(p.node.id.name, p.node);
        },
        VariableDeclarator(p) {
            if (p.node.id.type === "Identifier" && isFunctionNode(p.node.init)) {
                noteFunction(p.node.id.name, p.node.init);
            }
        },
        AssignmentExpression(p) {
            if (isFunctionNode(p.node.right)) noteFunction(calleeKey(p.node.left), p.node.right);
        },
        CallExpression(p) {
            const enclosing = p.getFunctionParent();
            const holder = enclosing ? enclosing.node : null;
            if (!callsInFunction.has(holder)) callsInFunction.set(holder, []);
            const list = callsInFunction.get(holder);
            if (isFunctionNode(p.node.callee))
                list.push(p.node.callee); // IIFE
            else {
                const key = calleeKey(p.node.callee);
                if (key) list.push(key);
            }
        },
    });

    // Everything reachable from top-level code runs during evaluation.
    const initExecuted = new Set();
    const queue = [null];
    while (queue.length) {
        const holder = queue.shift();
        for (const target of callsInFunction.get(holder) || []) {
            const fn = typeof target === "string" ? functionByKey.get(target) : target;
            if (fn && !initExecuted.has(fn)) {
                initExecuted.add(fn);
                queue.push(fn);
            }
        }
    }
    const isInitTimeReference = (ref) => {
        const fn = ref.getFunctionParent();
        return fn === null || initExecuted.has(fn.node);
    };

    traverse(ast, {
        Program(programPath) {
            const scope = programPath.scope;

            // (c) init-time vs call-time classification of imported bindings
            for (const name of Object.keys(scope.bindings).sort()) {
                const binding = scope.bindings[name];
                if (binding.kind !== "module") continue;
                const decl = binding.path.parentPath.node;
                if (!decl.source) continue;
                const target = resolveSpecifier(decl.source.value, file);
                if (!target) continue; // already reported under (a)
                addEdge(allEdges, file, target);
                let initUses = 0;
                for (const ref of binding.referencePaths) {
                    if (isInitTimeReference(ref)) initUses++;
                }
                if (initUses > 0) {
                    initBindings++;
                    if (!initEdges.has(file)) initEdges.set(file, new Map());
                    const tos = initEdges.get(file);
                    if (!tos.has(target)) tos.set(target, []);
                    tos.get(target).push(`${name}(${initUses})`);
                } else {
                    callOnlyBindings++;
                }
            }

            // (b) unbound globals that a sibling module exports
            for (const name of Object.keys(scope.globals).sort()) {
                if (externalAllowlist.has(name) || typeOnlyNames.has(name) || name === "arguments") continue;
                const owner = ownerOfExport.get(name);
                if (!owner || owner === file) {
                    if (!owner && !standardGlobals.has(name)) {
                        if (!nonStandardGlobals.has(name)) nonStandardGlobals.set(name, new Set());
                        nonStandardGlobals.get(name).add(rel(file));
                    }
                    continue;
                }
                const node = scope.globals[name];
                missingImports.push({
                    file,
                    name,
                    owner,
                    line: node.loc ? node.loc.start.line : 0,
                });
            }
        },
    });
}

//////////////////////////////////////////////////////////////////////
// Graph helpers

function tarjanSCC(nodes, adjacency) {
    let index = 0;
    const idx = new Map();
    const low = new Map();
    const stack = [];
    const onStack = new Set();
    const components = [];
    const visit = (v) => {
        idx.set(v, index);
        low.set(v, index++);
        stack.push(v);
        onStack.add(v);
        for (const w of adjacency(v)) {
            if (!idx.has(w)) {
                visit(w);
                low.set(v, Math.min(low.get(v), low.get(w)));
            } else if (onStack.has(w)) {
                low.set(v, Math.min(low.get(v), idx.get(w)));
            }
        }
        if (low.get(v) === idx.get(v)) {
            const comp = [];
            let w;
            do {
                w = stack.pop();
                onStack.delete(w);
                comp.push(w);
            } while (w !== v);
            if (comp.length > 1 || adjacency(v).includes(v)) components.push(comp.sort());
        }
    };
    for (const v of nodes) if (!idx.has(v)) visit(v);
    return components.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const initNodes = new Set();
for (const [from, tos] of initEdges) {
    initNodes.add(from);
    for (const to of tos.keys()) initNodes.add(to);
}
const initAdjacency = (v) => (initEdges.has(v) ? [...initEdges.get(v).keys()].sort() : []);
const initSCCs = tarjanSCC([...initNodes].sort(), initAdjacency);

const allNodes = [...files].sort();
const allAdjacency = (v) => (allEdges.has(v) ? [...allEdges.get(v)].sort() : []);
const allSCCs = tarjanSCC(allNodes, allAdjacency);

// The number of elementary cycles is useless as a CI metric (the core has a
// single 25-node strongly connected component, so that number is astronomical).
// The monotone quantity worth watching is how much of the graph is entangled:
// how many edges run inside a strongly connected component, and how many files
// those components hold. Both may only go down.
const sccOf = new Map();
for (const comp of allSCCs) for (const n of comp) sccOf.set(n, comp[0]);
let cyclicEdges = 0;
for (const [from, tos] of allEdges) {
    for (const to of tos) if (sccOf.has(from) && sccOf.get(from) === sccOf.get(to)) cyclicEdges++;
}
const cyclicFiles = allSCCs.reduce((n, c) => n + c.length, 0);

// Init-time edges whose two endpoints share a strongly connected component.
// ESM guarantees a module's dependencies are evaluated first only outside
// cycles; inside one the order is the entry's depth-first order, which no
// import list controls. Such an edge therefore works by luck, not by rule -
// tools/bundle-esm.js is what proves the luck currently holds. Reported, not
// failed: the count is a baseline that may only go down.
const fragileInitEdges = [];
for (const [from, tos] of initEdges) {
    for (const to of tos.keys()) {
        if (sccOf.has(from) && sccOf.get(from) === sccOf.get(to)) fragileInitEdges.push([from, to]);
    }
}

//////////////////////////////////////////////////////////////////////
// (d3) The order ESM actually produces, and whether the init-time edges
// survive it.
//
// Every fragile edge above is a coin flip whose outcome is decided by one
// deterministic thing: the depth-first traversal from the entry module. So
// rather than trusting it, replay it. `evalIndex` is the position each module
// body gets - dependencies first, a module already on the stack (a cycle)
// contributing nothing, which is exactly the specified ESM order and exactly
// the order esbuild inlines the module bodies in.
//
// An init-time edge A -> B that comes out with B *after* A is a live bug: A
// reads a binding B has not assigned yet. That is how the flip to the bundled
// build broke every geometry operation whose state size came from Tracing.js
// (fixed by libgeo/TracingSizes.js), and it cost a doctest run to find. It is a
// hard failure from here on.

const importOrder = new Map(); // file -> [target files], in source order
for (const [file, ast] of asts) {
    const targets = [];
    for (const node of ast.program.body) {
        if (!node.source) continue;
        if (
            node.type !== "ImportDeclaration" &&
            node.type !== "ExportNamedDeclaration" &&
            node.type !== "ExportAllDeclaration"
        )
            continue;
        const target = resolveSpecifier(node.source.value, file);
        if (target && !targets.includes(target)) targets.push(target);
    }
    importOrder.set(file, targets);
}

const evalIndex = new Map();
const evalVisiting = new Set();
function evaluateModule(file) {
    if (evalIndex.has(file) || evalVisiting.has(file)) return;
    evalVisiting.add(file);
    for (const target of importOrder.get(file) || []) evaluateModule(target);
    evalVisiting.delete(file);
    evalIndex.set(file, evalIndex.size);
}
evaluateModule(path.join(srcRoot, "index.js"));

const invertedInitEdges = [];
for (const [from, tos] of initEdges) {
    for (const [to, names] of tos) {
        if (!evalIndex.has(from) || !evalIndex.has(to)) continue; // not reachable from the entry
        if (evalIndex.get(to) > evalIndex.get(from)) invertedInitEdges.push([from, to, names]);
    }
}

let edgeCount = 0;
for (const tos of allEdges.values()) edgeCount += tos.size;
let initEdgeCount = 0;
for (const tos of initEdges.values()) initEdgeCount += tos.size;

//////////////////////////////////////////////////////////////////////
// Report

const problems = [];
console.log("ESM graph check (src/js, excluding Head.js/Tail.js/ifs/includes)");
console.log(
    `  files ${asts.size}  import edges ${edgeCount}  ` +
        `imported bindings: ${initBindings} init-time / ${callOnlyBindings} call-time-only`
);

if (parseErrors.length) {
    problems.push(`${parseErrors.length} file(s) failed to parse`);
    console.log("\nPARSE ERRORS:");
    for (const e of parseErrors) console.log("  " + e);
}

console.log(`\n(a) unresolved specifiers / imports: ${unresolved.length}`);
if (unresolved.length) {
    problems.push(`${unresolved.length} unresolved specifier(s) or named import(s)`);
    for (const u of unresolved.sort((a, b) => rel(a.file).localeCompare(rel(b.file)) || a.line - b.line)) {
        console.log(
            `  ${rel(u.file)}:${u.line}  ${u.kind === "export" ? "no such export: " : "no such file: "}${u.spec}`
        );
    }
}

console.log(`\n(b) missing imports (global exported by a sibling): ${missingImports.length}`);
console.log(`    allowed externals: ${[...externalAllowlist].sort().join(", ")}`);
if (missingImports.length) {
    problems.push(`${missingImports.length} missing import(s)`);
    for (const m of missingImports.sort(
        (a, b) => rel(a.file).localeCompare(rel(b.file)) || a.name.localeCompare(b.name)
    )) {
        console.log(`  ${rel(m.file)}:${m.line}  ${m.name}  <- ${rel(m.owner)}`);
    }
}

console.log(`\n(c) init-time edges: ${initEdgeCount}, init-time cycles: ${initSCCs.length}`);
if (verbose) {
    for (const from of [...initEdges.keys()].sort((a, b) => rel(a).localeCompare(rel(b)))) {
        for (const [to, names] of [...initEdges.get(from)].sort((a, b) => rel(a[0]).localeCompare(rel(b[0])))) {
            console.log(`    ${short(from)} -> ${short(to)}: ${names.sort().join(", ")}`);
        }
    }
}
if (initSCCs.length) {
    problems.push(`${initSCCs.length} init-time cycle(s)`);
    for (const comp of initSCCs) console.log("  [" + comp.map(short).join(", ") + "]");
}

console.log(
    `\n(d) call-time cycles (reported, not failed): ${cyclicEdges} cyclic edges over ` +
        `${cyclicFiles} files in ${allSCCs.length} strongly connected component(s)`
);
for (const comp of allSCCs) {
    console.log(`    SCC (${comp.length}): ${comp.map(short).join(", ")}`);
}

console.log(`\n(d2) order-fragile init-time edges (inside a cycle, reported, not failed): ${fragileInitEdges.length}`);
for (const [from, to] of fragileInitEdges.sort((a, b) => rel(a[0]).localeCompare(rel(b[0])))) {
    const ok = evalIndex.has(from) && evalIndex.has(to) && evalIndex.get(to) < evalIndex.get(from);
    console.log(`    ${short(from)} -> ${short(to)}  ${ok ? "(order holds)" : "(INVERTED)"}`);
}

console.log(`\n(d3) init-time edges inverted by the actual evaluation order: ${invertedInitEdges.length}`);
if (invertedInitEdges.length) {
    problems.push(`${invertedInitEdges.length} init-time edge(s) evaluated in the wrong order`);
    for (const [from, to, names] of invertedInitEdges.sort((a, b) => rel(a[0]).localeCompare(rel(b[0])))) {
        console.log(`    ${short(from)} reads ${names.sort().join(", ")} from ${short(to)}, which is evaluated LATER`);
    }
} else if (verbose) {
    const order = [...evalIndex.entries()].sort((a, b) => a[1] - b[1]).map(([f]) => short(f));
    console.log("    evaluation order: " + order.join(" "));
}

const externals = [...nonStandardGlobals.keys()].sort();
console.log(`\n(e) non-standard free globals the bundle must provide: ${externals.length}`);
for (const name of externals) {
    console.log(`    ${name}: ${[...nonStandardGlobals.get(name)].sort().join(", ")}`);
}

if (problems.length) {
    console.log("\nFAILED: " + problems.join("; "));
    process.exit(1);
}
console.log("\nOK: no unresolved specifiers, no missing imports, no init-time cycles, no inverted init-time edges.");
