import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "PROJECT_STATUS.md",
  "docs/PRODUCT_SPEC.md",
  "docs/IMPLEMENTATION_PLAN.md",
  "docs/DECISIONS.md",
  "docs/ENVIRONMENTS.md",
  "docs/SECURITY_MODEL.md",
  "docs/DATA_MODEL.md",
  "docs/TEST_STRATEGY.md",
  "docs/adr/0000-template.md",
  "docs/adr/0001-technical-foundation.md",
  "docs/adr/0002-m2-postgres-task-foundation.md"
];
const failures = [];

for (const relative of requiredFiles) {
  try {
    await access(path.join(root, relative));
  } catch {
    failures.push(`missing required file: ${relative}`);
  }
}

const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
for (const reference of ["docs/PRODUCT_SPEC.md", "docs/IMPLEMENTATION_PLAN.md", "docs/DECISIONS.md"]) {
  if (!agents.includes(reference)) failures.push(`AGENTS.md does not reference ${reference}`);
}

const decisions = await readFile(path.join(root, "docs/DECISIONS.md"), "utf8");
for (const id of ["D01", "D02", "D03", "D04", "D06", "D17", "D19", "D20"]) {
  if (!decisions.includes(`### ${id}：`)) failures.push(`confirmed decision missing: ${id}`);
}

const forbiddenNames = new Set([".env", "id_rsa", "id_ed25519"]);
const forbiddenExtensions = new Set([".jks", ".key", ".p12", ".pem", ".pfx"]);
const ignoredDirectories = new Set([".git", ".next", "coverage", "dist", "node_modules"]);

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(absolute);
      continue;
    }
    if (forbiddenNames.has(entry.name) || forbiddenExtensions.has(path.extname(entry.name).toLowerCase())) {
      failures.push(`forbidden credential-like file: ${path.relative(root, absolute)}`);
    }
  }
}

await inspect(root);
for (const forbiddenPath of ["apps/windows-wechat-monitor", "services/browser-automation", "packages/credential-vault"]) {
  try {
    await access(path.join(root, forbiddenPath));
    failures.push(`second-stage implementation must not exist in M0: ${forbiddenPath}`);
  } catch {
    // Expected in M0.
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("governance check passed");
