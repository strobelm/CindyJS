"use strict";

// Validates build/js/Cindy.js.map against build/js/Cindy.js.
//
// The artifact is minified, so the source map is the only thing that makes a
// stack trace or a debugger session from a deployed page readable. It is also
// composed by hand (tools/build-cindy.js concatenates the two esbuild maps and
// identity maps for the vendored lib/ scripts), which is exactly the kind of
// offset arithmetic that breaks silently: a wrong line offset still yields a
// *valid* map, just one that points at the wrong file.
//
// So this checks meaning, not well-formedness: it locates distinctive tokens in
// the minified artifact, resolves their positions through the map, and asserts
// the original position names the source file the token actually comes from and
// a line whose text contains it.
//
// Run: node tools/check-cindy-sourcemap.js

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { SourceMapConsumer } = require("source-map");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "build", "js");
const artifact = path.join(outDir, "Cindy.js");
const mapfile = artifact + ".map";

// token: a string that occurs exactly once in the artifact and comes from
// `source`, on a line of the original file that also contains `expect`.
const probes = [
    // Vendored lib/ script, outside both bundles: pins the leading offset.
    { token: "use_lines: !0", source: "lib/clipper/clipper.js", expect: "use_lines: !0" },
    // once-bundle, hoisted data layer.
    {
        token: '"Inverse works only for square matrices"',
        source: "src/js/libcs/List.js",
        expect: "Inverse works only for square matrices",
    },
    { token: "roundingfactor:1e4", source: "src/js/libcs/CSNumber.ts", expect: "roundingfactor: 1e4" },
    // instance bundle, i.e. after the factory boundary: pins the offset that
    // the once-bundle plus all the hand-written glue accumulates.
    { token: '"CindyJS-editabletext"', source: "src/js/libgeo/GeoOps.js", expect: "CindyJS-editabletext" },
    {
        token: '"Condition for assert is not boolean"',
        source: "src/js/libcs/Operators.js",
        expect: "Condition for assert is not boolean",
    },
];

async function main() {
    const source = fs.readFileSync(artifact, "utf-8");
    const raw = JSON.parse(fs.readFileSync(mapfile, "utf-8"));

    const failures = [];
    const check = (name, fn) => {
        try {
            fn();
        } catch (err) {
            failures.push(`${name}: ${err.message}`);
        }
    };

    // Line/column of a character offset, both 1-based / 0-based the way source
    // maps count them.
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);
    const positionOf = (index) => {
        let lo = 0,
            hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= index) lo = mid;
            else hi = mid - 1;
        }
        return { line: lo + 1, column: index - lineStarts[lo] };
    };

    check("the map declares every section of the artifact", () => {
        assert.strictEqual(raw.version, 3, "not a v3 source map");
        assert.strictEqual(raw.file, "Cindy.js", "wrong `file`");
        assert.ok(raw.sources.length > 30, `only ${raw.sources.length} sources`);
        const unresolved = raw.sources.filter((s) => !/^ \[synthetic:/.test(s) && !fs.existsSync(path.join(outDir, s)));
        assert.deepStrictEqual(unresolved, [], "sources that do not exist on disk");
    });

    const consumer = await new SourceMapConsumer(raw);
    try {
        for (const probe of probes) {
            check(`${probe.source} maps back`, () => {
                const first = source.indexOf(probe.token);
                assert.ok(first >= 0, `token ${JSON.stringify(probe.token)} not found in the artifact`);
                assert.strictEqual(
                    source.indexOf(probe.token, first + 1),
                    -1,
                    `token ${JSON.stringify(probe.token)} is not unique - pick another probe`
                );
                const pos = positionOf(first);
                const original = consumer.originalPositionFor({ line: pos.line, column: pos.column });
                assert.ok(original.source, `no mapping at ${pos.line}:${pos.column}`);
                const resolved = path.normalize(path.join(outDir, original.source));
                assert.strictEqual(
                    path.relative(repoRoot, resolved).replace(/\\/g, "/"),
                    probe.source,
                    `mapped to ${original.source}`
                );
                const text = fs.readFileSync(resolved, "utf-8").split(/\r?\n/);
                const line = text[original.line - 1];
                assert.ok(line !== undefined, `original line ${original.line} is past the end of ${probe.source}`);
                assert.ok(
                    line.includes(probe.expect),
                    `${probe.source}:${original.line} does not contain ${JSON.stringify(
                        probe.expect
                    )}: ${JSON.stringify(line.trim().slice(0, 80))}`
                );
            });
        }
    } finally {
        consumer.destroy();
    }

    if (failures.length) {
        for (const f of failures) console.error("FAILED " + f);
        process.exit(1);
    }
    console.log(`OK: build/js/Cindy.js.map resolves (${raw.sources.length} sources, ${probes.length} probes)`);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
