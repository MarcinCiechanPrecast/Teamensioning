/**
 * Proof for the UI literal guard (scripts/check-ui-literals.mjs, `npm run check:ui`).
 *
 * Runs the real script against throwaway source trees under the OS temp dir and asserts its scope:
 * every view under src/pages, src/components and src/layouts (.astro and .tsx) is scanned, shadcn
 * primitives in src/components/ui/ and *.test.tsx are exempt, and lint-staged's absolute paths go
 * through the same filter.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const GUARD = path.resolve(import.meta.dirname, "check-ui-literals.mjs");
const LITERAL = `<div class="bg-white/10 text-blue-100/80"></div>\n`;
const CLEAN = `<div class="bg-card text-muted-foreground"></div>\n`;

let root: string;

function tree(files: Record<string, string>) {
  root = mkdtempSync(path.join(tmpdir(), "check-ui-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function guard(...args: string[]) {
  const run = spawnSync(process.execPath, [GUARD, ...args], { cwd: root, encoding: "utf8" });
  return { code: run.status, out: run.stdout + run.stderr };
}

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("check-ui-literals default scope", () => {
  it("fails on a literal in a nested .tsx view", () => {
    tree({ "src/pages/index.astro": CLEAN, "src/components/leagues/Form.tsx": LITERAL });

    const { code, out } = guard();

    expect(code).toBe(1);
    expect(out).toContain("src/components/leagues/Form.tsx:1:");
  });

  it("scans pages, components and layouts but exempts ui/ primitives and tests", () => {
    tree({
      "src/pages/a.astro": CLEAN,
      "src/layouts/Layout.astro": CLEAN,
      "src/components/Banner.astro": CLEAN,
      "src/components/ui/input.tsx": LITERAL,
      "src/components/leagues/Form.test.tsx": LITERAL,
      "src/lib/helper.tsx": LITERAL,
    });

    const { code, out } = guard();

    expect(code).toBe(0);
    expect(out).toContain("No UI literals in 3 file(s).");
  });

  it("fails when there is nothing to scan", () => {
    tree({ "README.md": "nothing here" });

    expect(guard().code).toBe(1);
  });
});

describe("check-ui-literals with explicit paths (lint-staged)", () => {
  it("applies the same filter to absolute paths", () => {
    tree({ "src/components/ui/input.tsx": LITERAL, "src/pages/a.astro": LITERAL });

    const { code, out } = guard(path.join(root, "src/components/ui/input.tsx"), path.join(root, "src/pages/a.astro"));

    expect(code).toBe(1);
    expect(out).toContain("src/pages/a.astro:1:");
    expect(out).not.toContain("ui/input.tsx");
  });

  it("passes when only exempt files are staged", () => {
    tree({ "src/components/ui/input.tsx": LITERAL });

    const { code, out } = guard(path.join(root, "src/components/ui/input.tsx"));

    expect(code).toBe(0);
    expect(out).toContain("No guarded views");
  });
});
