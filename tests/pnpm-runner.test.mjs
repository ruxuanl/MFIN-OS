import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolvePnpmCommand } from "../scripts/pnpm.mjs";

test("reuses a JavaScript pnpm entry point through the current node binary", () => {
  const command = resolvePnpmCommand({ npm_execpath: "/opt/corepack/pnpm/11.16.0/bin/pnpm.cjs" }, "/usr/bin/node", "linux");
  assert.deepEqual(command, { command: "/usr/bin/node", prefix: ["/opt/corepack/pnpm/11.16.0/bin/pnpm.cjs"], shell: false });
});

test("runs a native pnpm executable directly", () => {
  const command = resolvePnpmCommand({ npm_execpath: "C:\\tools\\pnpm.exe" }, "node", "win32");
  assert.equal(command.command, "C:\\tools\\pnpm.exe");
  assert.deepEqual(command.prefix, []);
});

test("falls back to corepack when not started by pnpm", () => {
  assert.deepEqual(resolvePnpmCommand({}, "node", "win32"), { command: "corepack", prefix: ["pnpm"], shell: true });
  assert.deepEqual(resolvePnpmCommand({ npm_execpath: "/usr/lib/npm/bin/npm-cli.js" }, "node", "linux"),
    { command: "corepack", prefix: ["pnpm"], shell: false });
});

test("root package scripts never call a bare global pnpm", async () => {
  const { scripts } = JSON.parse(await readFile("package.json", "utf8"));
  for (const [name, body] of Object.entries(scripts)) {
    assert.doesNotMatch(body, /(^|&&\s*)pnpm\s/, `script "${name}" calls bare pnpm`);
  }
});
