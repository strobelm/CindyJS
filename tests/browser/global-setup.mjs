/**
 * Playwright global setup: verifies the build artifacts the smoke tests need
 * and starts the static server that serves the repository root.
 *
 * The returned function is used by Playwright as the global teardown.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";

import { REPO_ROOT } from "./paths.mjs";
import { startStaticServer } from "./static-server.mjs";

const REQUIRED_ARTIFACTS = ["build/js/Cindy.js", "build/js/CindyGL.js", "build/js/Cindy3D.js"];

export default async function globalSetup() {
    const missing = [];
    for (const artifact of REQUIRED_ARTIFACTS) {
        try {
            await access(join(REPO_ROOT, artifact));
        } catch {
            missing.push(artifact);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            `Missing build artifacts required by the browser smoke tests:\n` +
                missing.map((f) => `  - ${f}`).join("\n") +
                `\n\nBuild them first (needs a JDK for the plugins):\n` +
                `  node make Cindy.js cindygl cindy3d\n`
        );
    }

    const server = await startStaticServer(REPO_ROOT);
    // Workers are forked after global setup, so they inherit this.
    process.env.CINDY_BASE_URL = server.url;

    return async () => {
        await server.close();
    };
}
