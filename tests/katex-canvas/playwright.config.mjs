import { defineConfig, devices } from "@playwright/test";

/**
 * KaTeX canvas backend comparison (`npm run test:katex-canvas`).
 *
 * Every formula of the corpus is rendered by KaTeX as HTML (the reference),
 * by the new canvas backend and by the old KaTeX 0.7 canvas fork, all in the
 * same headless chromium, and the canvas images are diffed against the
 * reference. See katex-canvas.spec.mjs for the pass criteria and
 * build/katex-canvas/index.html for the resulting gallery.
 */
export default defineConfig({
    testDir: ".",
    testMatch: /.*\.spec\.mjs/,
    globalSetup: "./global-setup.mjs",
    timeout: 30_000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [["github"], ["dot"]] : [["dot"]],
    use: {
        ...devices["Desktop Chrome"],
        headless: true,
        viewport: { width: 4000, height: 2400 },
        deviceScaleFactor: 1,
        launchOptions: { args: ["--no-sandbox"] },
    },
    projects: [{ name: "chromium" }],
});
