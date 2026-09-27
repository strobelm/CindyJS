import { assert } from "chai";
import katex from "katex";

import { layout, render } from "../plugins/katex/src/js/canvas-backend.mjs";
import { macros as cindyMacros, preprocess } from "../plugins/katex/src/js/macros.mjs";
import { loadCorpus } from "./katex-canvas/corpus/index.mjs";

// Layout checks for the KaTeX canvas backend that need no browser: text
// widths come from a stand-in measureText, but heights and depths do not
// depend on widths at all, so they can be compared with the struts KaTeX
// puts into its own output. The pixel comparison against KaTeX's HTML
// rendering lives in tests/katex-canvas (npm run test:katex-canvas).

const FAMILIES =
    /^(normal|italic) (normal|bold) [\d.]+px KaTeX_(Main|Math|AMS|Caligraphic|Fraktur|SansSerif|Script|Typewriter|Size[1-4])$/;

describe("KaTeX canvas backend", function () {
    const cases = loadCorpus();

    const measureCtx = {
        font: "",
        save() {},
        restore() {},
        measureText(text) {
            return { width: 7 * text.length };
        },
    };

    function treeOf(c) {
        return katex.__renderToHTMLTree(c.cindyMacros ? preprocess(c.tex) : c.tex, {
            displayMode: c.display,
            throwOnError: !c.noThrow,
            trust: true,
            strict: "ignore",
            macros: Object.assign({}, c.cindyMacros ? cindyMacros : {}, c.macros || {}),
        });
    }

    function strutExtent(tree, em) {
        let height = 0;
        let depth = 0;
        (function walk(node) {
            if (node.classes && node.classes.indexOf("katex-strut") !== -1) {
                const h = parseFloat(node.style.height) * em;
                const d = -(parseFloat(node.style.verticalAlign || "0") || 0) * em;
                height = Math.max(height, h - d);
                depth = Math.max(depth, d);
                return;
            }
            (node.children || []).forEach(walk);
        })(tree);
        return { height, depth };
    }

    it("lays out every formula of the corpus", function () {
        for (const c of cases) {
            let tree;
            try {
                tree = treeOf(c);
            } catch (e) {
                continue; // KaTeX itself rejects the input
            }
            const box = layout(tree, measureCtx, { fontSize: 24 });
            assert.isFinite(box.width, c.id);
            for (const font of box.fonts) assert.match(font, FAMILIES, c.id);
        }
    });

    it("agrees with KaTeX's struts on height and depth", function () {
        let checked = 0;
        for (const c of cases) {
            let tree;
            try {
                tree = treeOf(c);
            } catch (e) {
                continue;
            }
            const box = layout(tree, measureCtx, { fontSize: 24 });
            if (box.unsupported.length > 0) continue;
            const extent = strutExtent(tree, 24);
            assert.closeTo(box.height, extent.height, 0.05, `height of ${c.id}`);
            assert.closeTo(box.depth, extent.depth, 0.05, `depth of ${c.id}`);
            ++checked;
        }
        assert.isAbove(checked, 150, "too few formulas were checked");
    });

    it("renders with the context's fill style and restores the context", function () {
        const calls = [];
        const ctx = Object.assign({}, measureCtx, {
            fillStyle: "#123456",
            getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
            setTransform() {},
            fillText(text, x, y) {
                calls.push(["text", text, this.fillStyle, x, y]);
            },
            fillRect(x, y, w, h) {
                calls.push(["rect", this.fillStyle, x, y, w, h]);
            },
        });
        const box = layout(katex.__renderToHTMLTree("\\frac{a}{\\color{red}b}"), measureCtx, { fontSize: 20 });
        render(ctx, box, 100, 50);
        const texts = calls.filter((c) => c[0] === "text");
        assert.deepEqual(
            texts.map((c) => [c[1], c[2]]),
            [
                ["b", "red"],
                ["a", "#123456"],
            ]
        );
        const rects = calls.filter((c) => c[0] === "rect");
        assert.lengthOf(rects, 1, "one fraction bar");
        assert.equal(rects[0][1], "#123456");
        assert.equal(rects[0][5], 1, "the bar is snapped to one pixel");
    });
});
