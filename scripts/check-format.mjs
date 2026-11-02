import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".next", ".vercel", "coverage", "dist", "node_modules", "work"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".yml", ".yaml"]);
const exactTextFiles = new Set([".editorconfig", ".env.example", ".gitattributes", ".gitignore"]);
const decoder = new TextDecoder("utf-8", { fatal: true });
const failures = [];
let checked = 0;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!textExtensions.has(path.extname(entry.name).toLowerCase()) && !exactTextFiles.has(entry.name)) continue;

    checked += 1;
    const relative = path.relative(root, absolute);
    try {
      const content = decoder.decode(await readFile(absolute));
      if (content.length > 0 && !content.endsWith("\n")) failures.push(`${relative}: missing final newline`);
      if (content.includes("\u0000")) failures.push(`${relative}: contains NUL byte`);
    } catch {
      failures.push(`${relative}: is not valid UTF-8`);
    }
  }
}

await walk(root);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`format check passed (${checked} text files)`);
