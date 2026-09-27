/**
 * The KaTeX plugin inside CindyJS: formulas drawn with drawtext must match
 * KaTeX's HTML rendering placed where CindyJS puts text, i.e. with the
 * CindyJS text size as the formula's em (as the old plugin had it), the
 * baseline at the given point and the requested alignment and colour.
 *
 * Uses the built artifacts (build/js/Cindy.js, build/js/katex-plugin.js).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { OUT_DIR, fileName } from "./report.mjs";

const CASES = [];
for (const size of [13, 20, 32]) {
    for (const tex of ["x^2+y_i", "\\frac{a}{b}", "\\sqrt{2}\\cdot\\vec{v}", "\\sum_{i=1}^n i^2"]) {
        CASES.push({ tex, size, align: "left", color: "rgb(0, 0, 0)" });
    }
}
for (const align of ["mid", "right"]) CASES.push({ tex: "\\frac{\\sin x}{x}", size: 20, align, color: "rgb(0, 0, 0)" });
CASES.push({ tex: "\\overrightarrow{AB}+c", size: 24, align: "left", color: "rgb(0, 128, 0)" });

test.describe.configure({ mode: "parallel" });

let page;
let comparePage;

test.beforeAll(async ({ browser }) => {
    mkdirSync(join(OUT_DIR, "plugin"), { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1100, height: 400 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.on("pageerror", (e) => console.error(`page error: ${e.stack || e}`));
    await page.goto(`${process.env.CINDY_BASE_URL}/tests/katex-canvas/plugin.html`);
    comparePage = await context.newPage();
    await comparePage.goto(`${process.env.CINDY_BASE_URL}/tests/katex-canvas/harness.html`);
    await comparePage.waitForFunction(() => window.harness !== undefined);
});

test.afterAll(async () => {
    await page?.context().close();
});

for (const c of CASES) {
    const id = `${c.tex}@${c.size} ${c.align} ${c.color}`;
    test(`plugin ${id}`, async () => {
        const { width, height } = await page.evaluate((c) => window.drawBoth({ ...c, x: 250, y: 110 }), c);
        const shot = async (x) =>
            "data:image/png;base64," + (await page.screenshot({ clip: { x, y: 0, width, height } })).toString("base64");
        const reference = await shot(0);
        const plugin = await shot(width);
        const cmp = await comparePage.evaluate(
            ([a, b, w, h]) => window.harness.compareTwo(a, b, w, h),
            [reference, plugin, width, height]
        );
        writeFileSync(
            join(OUT_DIR, "plugin", fileName(id) + ".png"),
            Buffer.from(cmp.composite.split(",")[1], "base64")
        );
        const stats = JSON.parse(cmp.stats);
        expect(stats.ink, "the reference has ink").toBeGreaterThan(0);
        expect(stats.score, "mismatched pixels per inked reference pixel").toBeLessThanOrEqual(0.02);
        expect(Math.abs(stats.centroidShift.x), "horizontal offset").toBeLessThanOrEqual(0.75);
        expect(Math.abs(stats.centroidShift.y), "vertical offset").toBeLessThanOrEqual(0.75);
        expect(Math.abs(stats.darkness - 1), "amount of ink").toBeLessThanOrEqual(0.08);
    });
}
