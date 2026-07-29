import { defineConfig, devices } from "@playwright/test";

/**
 * Headless-browser smoke tests (`npm run test:browser`).
 *
 * Test files live next to this config and are named `*.spec.mjs`, so the mocha
 * unit-test run (`node make unittests`, which is `mocha tests`) never picks
 * them up: mocha only globs the top level of `tests/` and only for `.js`.
 *
 * WebGL in headless chromium is provided by SwiftShader, the software
 * rasterizer. Two launch flags are needed for the GPU plugins to work:
 *
 *  - `--use-angle=swiftshader` pins the ANGLE backend to SwiftShader instead of
 *    letting chromium pick a (possibly absent) hardware GL driver. On CI
 *    machines without a GPU this is what makes a context available at all.
 *  - `--enable-unsafe-swiftshader` is required since chromium 121: without it
 *    software WebGL is refused and `getContext("webgl2")` returns null after
 *    printing a "SwiftShader has been deprecated" warning.
 *
 * `--disable-gpu` must NOT be set — it disables the very fallback path we rely
 * on. `--no-sandbox` keeps the browser usable inside containers/CI images.
 */
export default defineConfig({
    testDir: ".",
    testMatch: /.*\.spec\.mjs/,
    globalSetup: "./global-setup.mjs",
    // The examples draw with requestAnimationFrame; give the widgets room to
    // finish their first frames on a slow software rasterizer.
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
    use: {
        ...devices["Desktop Chrome"],
        headless: true,
        launchOptions: {
            args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
        },
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium" }],
});
