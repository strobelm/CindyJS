/**
 * Headless-browser smoke tests for the shipped bundles.
 *
 * For each example we assert that
 *   - nothing throws (no page errors, no `console.error`, no failed requests),
 *   - the widget's canvas actually contains a drawing (not a uniform surface),
 *   - and, for the GPU plugins, that a real WebGL context was created.
 *
 * This is the only automated coverage CindyGL and Cindy3D have, so the canvas
 * check deliberately inspects composited pixels rather than trusting that the
 * scripts merely ran without complaining.
 */

import { expect, test } from "@playwright/test";

/**
 * Examples under test. They are deliberately small, static and free of user
 * interaction or external resources (images, audio, network), so a single
 * page load is enough to produce a deterministic picture.
 */
const CASES = [
    {
        title: "2D CindyScript: sunflower",
        path: "examples/01_sunflower.html",
        // CindyJS replaces the placeholder <div id="CSCanvas"> with a canvas.
        canvas: "#CSCanvas canvas",
        webgl: false,
    },
    {
        title: "2D CindyScript: simple geometry",
        path: "examples/04_SimpleGeo.html",
        canvas: "#CSCanvas canvas",
        webgl: false,
    },
    {
        title: "CindyGL: static colorplot",
        path: "examples/cindygl/01_colorplot.html",
        // CindyGL renders into an offscreen WebGL canvas and blits the result
        // onto the ordinary 2D widget canvas via drawimage().
        canvas: "#CSCanvas canvas",
        webgl: true,
    },
    {
        title: "Cindy3D: three spheres",
        path: "examples/cindy3d/01_ThreeSpheres.html",
        // Cindy3D renders straight into the page's <canvas id="Cindy3D">.
        canvas: "canvas#Cindy3D",
        webgl: true,
    },
];

/**
 * Console messages that are emitted by healthy builds and carry no failure
 * information. Anything not matched here fails the test.
 *
 * Currently empty: CindyGL logs its shader sources via `console.debug` and
 * Cindy3D reports the WebGL version via `console.log`, neither of which is a
 * `console.error`, so no whitelist entry is needed. Kept as the documented
 * place to add one (with a reason) should that change.
 */
const ALLOWED_CONSOLE_ERRORS = [];

function baseURL() {
    const url = process.env.CINDY_BASE_URL;
    if (!url) throw new Error("CINDY_BASE_URL is not set — global setup did not run.");
    return url;
}

/** Records every signal that would indicate a broken page. */
function collectFailures(page) {
    const pageErrors = [];
    const consoleErrors = [];
    const failedRequests = [];

    page.on("pageerror", (error) => pageErrors.push(error.stack || String(error)));
    page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (ALLOWED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) return;
        consoleErrors.push(text);
    });
    page.on("requestfailed", (request) => {
        failedRequests.push(`${request.url()} (${request.failure()?.errorText})`);
    });
    page.on("response", (response) => {
        if (response.status() >= 400) failedRequests.push(`${response.url()} → HTTP ${response.status()}`);
    });

    return { pageErrors, consoleErrors, failedRequests };
}

/**
 * Instruments `getContext` before any page script runs, so the test can tell
 * whether a WebGL context was genuinely created (as opposed to the plugin
 * silently falling back or bailing out).
 */
async function trackWebglContexts(page) {
    await page.addInitScript(() => {
        window.__cindyContexts = [];
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
            const context = getContext.call(this, type, ...rest);
            window.__cindyContexts.push({ type, created: context !== null });
            return context;
        };
    });
}

/**
 * Screenshots the canvas element and decodes the PNG *inside the browser*
 * (no image-decoding dependency in node), returning colour statistics.
 *
 * Screenshotting rather than reading the canvas back matters for Cindy3D:
 * its WebGL context has no `preserveDrawingBuffer`, so reading pixels after
 * the frame has been composited is not reliable, while the screenshot always
 * reflects what the user would see.
 */
async function canvasStats(page, selector) {
    const shot = await page.locator(selector).screenshot();
    return await page.evaluate(
        async (dataUrl) => {
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = () => reject(new Error("could not decode canvas screenshot"));
                image.src = dataUrl;
            });
            const probe = document.createElement("canvas");
            probe.width = image.naturalWidth;
            probe.height = image.naturalHeight;
            probe.getContext("2d").drawImage(image, 0, 0);
            const { data } = probe.getContext("2d").getImageData(0, 0, probe.width, probe.height);

            const histogram = new Map();
            for (let i = 0; i < data.length; i += 4) {
                const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
                histogram.set(key, (histogram.get(key) || 0) + 1);
            }
            let dominant = 0;
            for (const count of histogram.values()) dominant = Math.max(dominant, count);
            const pixels = data.length / 4;
            return {
                width: probe.width,
                height: probe.height,
                distinctColors: histogram.size,
                // Pixels that differ from the most common colour, i.e. everything
                // that is not the background.
                paintedPixels: pixels - dominant,
            };
        },
        `data:image/png;base64,${shot.toString("base64")}`
    );
}

for (const testCase of CASES) {
    test(testCase.title, async ({ page }) => {
        const failures = collectFailures(page);
        await trackWebglContexts(page);

        await page.goto(`${baseURL()}/${testCase.path}`, { waitUntil: "load" });

        // The widget replaces/attaches its canvas during CindyJS startup.
        const canvas = page.locator(testCase.canvas);
        await expect(canvas).toBeVisible();
        await expect
            .poll(async () => (await canvas.evaluate((el) => el.width * el.height)) > 0, {
                message: `canvas ${testCase.canvas} never got a non-zero size`,
            })
            .toBe(true);

        // Drawing happens in requestAnimationFrame; poll until the canvas is
        // no longer uniform instead of sleeping a fixed amount. This is what
        // stabilises the suite on slow software rasterisers. The bound is in
        // absolute pixels rather than a fraction because thin line art
        // (04_SimpleGeo) still leaves ~99% of the canvas as background.
        let stats;
        await expect
            .poll(
                async () => {
                    stats = await canvasStats(page, testCase.canvas);
                    return stats.paintedPixels;
                },
                {
                    message: `canvas ${testCase.canvas} of ${testCase.path} stayed blank`,
                    timeout: 30_000,
                }
            )
            .toBeGreaterThan(500);

        // A single flat-colour splash would satisfy the pixel count; requiring
        // several colours rules that out as well.
        expect(stats.distinctColors, `canvas of ${testCase.path} is essentially uniform`).toBeGreaterThan(2);

        if (testCase.webgl) {
            const contexts = await page.evaluate(() => window.__cindyContexts);
            const webglContexts = contexts.filter((c) => /^webgl/.test(c.type) && c.created);
            expect(webglContexts.length, `no WebGL context was created for ${testCase.path}`).toBeGreaterThan(0);
        }

        expect(failures.pageErrors, "uncaught page errors").toEqual([]);
        expect(failures.consoleErrors, "console.error output").toEqual([]);
        expect(failures.failedRequests, "failed or 4xx/5xx requests").toEqual([]);
    });
}

/**
 * The multi-instance regression test.
 *
 * `build/js/Cindy.js` re-evaluates its whole interpreter inside
 * `CindyJS.newInstance`, once per widget - that re-evaluation IS the
 * multi-instance mechanism (Phase 1, step 7a of MODERNIZATION.md), and the four
 * single-widget cases above cannot observe it at all. This one loads two
 * widgets whose scripts use identical variable and element names with different
 * values and checks that neither the interpreter state nor the geometry leaked
 * between them:
 *
 *   - both canvases are painted, and painted DIFFERENTLY,
 *   - each instance still evaluates its own `mark` and its own point `A`,
 *   - `CindyJS.instances` holds exactly the two of them,
 *   - and no page error or console error was produced.
 *
 * It is also the guard for step 8, which hoists modules out of the factory one
 * subsystem at a time: the first hoist that shares mutable state turns one of
 * these assertions red.
 */
test("two independent widgets on one page", async ({ page }) => {
    const failures = collectFailures(page);

    await page.goto(`${baseURL()}/tests/browser/fixtures/two-widgets.html`, { waitUntil: "load" });

    const canvasA = page.locator("#widgetA canvas");
    const canvasB = page.locator("#widgetB canvas");
    await expect(canvasA).toBeVisible();
    await expect(canvasB).toBeVisible();

    let statsA, statsB;
    await expect
        .poll(
            async () => {
                statsA = await canvasStats(page, "#widgetA canvas");
                statsB = await canvasStats(page, "#widgetB canvas");
                return Math.min(statsA.paintedPixels, statsB.paintedPixels);
            },
            { message: "one of the two widgets stayed blank", timeout: 30_000 }
        )
        .toBeGreaterThan(500);

    // Different `tint` per widget, so the two pictures must not coincide. The
    // dominant colour is the background, hence the comparison over the shares
    // of the painted pixels rather than over a screenshot hash.
    expect(statsA.distinctColors).toBeGreaterThan(2);
    expect(statsB.distinctColors).toBeGreaterThan(2);
    const identical = await page.evaluate(async () => {
        const shot = (sel) => document.querySelector(sel).toDataURL();
        return shot("#widgetA canvas") === shot("#widgetB canvas");
    });
    expect(identical, "both widgets rendered the same picture - shared interpreter state?").toBe(false);

    // The decisive check: each instance's namespace is its own.
    const state = await page.evaluate(() => {
        // evalcs returns a CindyScript value; unwrap the real part of numbers.
        const num = (instance, code) => {
            const value = instance.evalcs(code);
            return value && value.ctype === "number" ? value.value.real : value && value.ctype;
        };
        return {
            markA: num(window.widgetA, "mark"),
            markB: num(window.widgetB, "mark"),
            tintA: num(window.widgetA, "tint"),
            tintB: num(window.widgetB, "tint"),
            axA: num(window.widgetA, "A.x"),
            axB: num(window.widgetB, "A.x"),
            instances: window.CindyJS.instances.length,
            distinct: window.widgetA !== window.widgetB,
        };
    });
    expect(state.distinct).toBe(true);
    expect(state.instances).toBe(2);
    expect(state.markA, "widget one's `mark`").toBe(1);
    expect(state.markB, "widget two's `mark`").toBe(2);
    expect(state.tintA, "widget one's `tint`").toBe(0);
    expect(state.tintB, "widget two's `tint`").toBe(1);
    expect(state.axA, "widget one's point A").toBeCloseTo(1, 6);
    expect(state.axB, "widget two's point A").toBeCloseTo(3, 6);

    expect(failures.pageErrors, "uncaught page errors").toEqual([]);
    expect(failures.consoleErrors, "console.error output").toEqual([]);
    expect(failures.failedRequests, "failed or 4xx/5xx requests").toEqual([]);
});
