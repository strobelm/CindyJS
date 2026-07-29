import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the repository root (this file lives in tests/browser/). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
