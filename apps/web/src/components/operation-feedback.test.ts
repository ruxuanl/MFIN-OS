import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: () => { throw new Error("OAuth must not use the Next page router"); } }));

import { OperationLink } from "./operation-feedback";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("operation feedback contract", () => {
  it("renders Calendar and Gmail OAuth entries without the Next page router or prefetch", () => {
    for (const href of ["/api/calendar/oauth/start", "/api/gmail/oauth/start"]) {
      const html = renderToStaticMarkup(createElement(OperationLink, { href } as Parameters<typeof OperationLink>[0], "Connect"));
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain("<a ");
    }
  });
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
