/**
 * Playwright global setup for the KaTeX canvas suite: bundles the browser
 * harness, starts the static server and, on teardown, writes the gallery
 * (build/katex-canvas/index.html) from the per-case results.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import * as esbuild from "esbuild";

import { REPO_ROOT } from "../browser/paths.mjs";
import { startStaticServer } from "../browser/static-server.mjs";
import { OUT_DIR, writeReport } from "./report.mjs";

export default async function globalSetup() {
    await rm(join(OUT_DIR, "results"), { recursive: true, force: true });
    await rm(join(OUT_DIR, "img"), { recursive: true, force: true });
    await mkdir(join(OUT_DIR, "results"), { recursive: true });
    await mkdir(join(OUT_DIR, "img"), { recursive: true });

    await esbuild.build({
        entryPoints: [join(REPO_ROOT, "tests/katex-canvas/harness-entry.mjs")],
        outfile: join(OUT_DIR, "harness.js"),
        bundle: true,
        format: "iife",
        sourcemap: "inline",
        logLevel: "warning",
    });

    const server = await startStaticServer(REPO_ROOT);
    process.env.CINDY_BASE_URL = server.url;

    return async () => {
        await server.close();
        await writeReport();
    };
}
