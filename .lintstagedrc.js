import { existsSync } from "fs";
import path from "path";

/**
 * Monorepo-aware lint-staged config.
 *
 * ESLint v9 flat config files live per-workspace (apps/backend, apps/frontend).
 * This groups staged files by their nearest workspace and runs ESLint *from
 * inside* that workspace so its flat config resolves correctly.
 *
 * Running from inside the workspace matters: the configs scope rules with
 * relative `files: ["src/**"]` globs (e.g. `no-explicit-any` is turned off for
 * source). Those globs are matched against the ESLint CWD — if we invoked
 * ESLint from the repo root with absolute paths (as lint-staged passes them),
 * the overrides silently never match and the hook lints more strictly than CI,
 * rejecting code that `bun run lint` accepts.
 *
 * Only JS/TS source files are linted, and only for workspaces that actually
 * have an eslint flat config. Without these guards, staging e.g.
 * `packages/shared/package.json` (a workspace with no eslint.config.js) made
 * ESLint abort with ENOENT and blocked the commit.
 */

const WORKSPACES = ["apps/backend", "apps/frontend", "packages/shared"];
const LINTABLE = /\.(?:js|jsx|ts|tsx|cjs|mjs)$/;

/** Return the workspace root for a given absolute file path, or null. */
function getWorkspace(filePath) {
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  return WORKSPACES.find((ws) => rel.startsWith(ws + "/")) ?? null;
}

export default (stagedFiles) => {
  /** @type {Record<string, string[]>} workspace -> [absolute file paths] */
  const byWorkspace = {};

  for (const file of stagedFiles) {
    if (!LINTABLE.test(file)) continue; // only lint JS/TS sources
    const ws = getWorkspace(file);
    if (!ws) continue; // skip root-level files
    if (!byWorkspace[ws]) byWorkspace[ws] = [];
    byWorkspace[ws].push(file);
  }

  return Object.entries(byWorkspace).flatMap(([ws, files]) => {
    const wsAbs = path.resolve(process.cwd(), ws);
    if (!existsSync(path.join(wsAbs, "eslint.config.js"))) return []; // no config (e.g. packages/shared)
    // Paths relative to the workspace so ESLint's relative `files` overrides match.
    const fileList = files.map((f) => `'${path.relative(wsAbs, f).replace(/\\/g, "/")}'`).join(" ");
    // Wrap in `sh -c` so the `cd` runs: lint-staged spawns the command directly
    // (no shell), so a bare `cd ... && ...` would try to exec `cd` and ENOENT.
    return [`sh -c "cd '${ws}' && eslint --fix --max-warnings=0 --no-warn-ignored ${fileList}"`];
  });
};
