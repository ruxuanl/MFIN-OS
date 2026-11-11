#!/usr/bin/env node
// Run pnpm from inside package scripts without requiring a global `pnpm` on PATH.
// On Windows without admin rights `corepack enable` cannot install the pnpm shim, so
// nested `pnpm ...` calls in package.json fail. pnpm exposes its own entry point in
// npm_execpath; reuse it, and fall back to `corepack pnpm` when it is unavailable.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptExtensions = new Set([".js", ".cjs", ".mjs"]);

export function resolvePnpmCommand(env = process.env, nodePath = process.execPath, platform = process.platform) {
  const execPath = env.npm_execpath;
  if (execPath && /pnpm/i.test(path.basename(execPath))) {
    return scriptExtensions.has(path.extname(execPath).toLowerCase())
      ? { command: nodePath, prefix: [execPath], shell: false }
      : { command: execPath, prefix: [], shell: false };
  }
  return { command: "corepack", prefix: ["pnpm"], shell: platform === "win32" };
}

function main() {
  const { command, prefix, shell } = resolvePnpmCommand();
  const result = spawnSync(command, [...prefix, ...process.argv.slice(2)], { stdio: "inherit", shell });
  if (result.error) {
    console.error(`Unable to start pnpm: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
