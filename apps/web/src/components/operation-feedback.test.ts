import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("operation feedback contract", () => {
  it("does not leave bare submit buttons inside forms", () => {
    const violations: string[] = [];

    for (const path of tsxFiles(sourceRoot)) {
      const source = readFileSync(path, "utf8");
      const formBlocks = source.match(/<form\b[\s\S]*?<\/form>/g) ?? [];

      for (const form of formBlocks) {
        const directButtons = form.match(/<button\b[\s\S]*?>/g) ?? [];
        if (directButtons.some((button) => !button.includes("aria-busy"))) {
          violations.push(relative(sourceRoot, path));
          break;
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
