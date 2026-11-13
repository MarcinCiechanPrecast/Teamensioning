/**
 * Guard: the app started from the 10x Astro template. Its identity texts must not come back
 * (home page copy, default page title, README, package name). Scans every file under src/
 * plus README.md, package.json and package-lock.json, and reports each hit as file:line.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const FORBIDDEN = [/10x Astro Starter/i, /10x-astro-starter/i, /production-ready starter/i];
const TOP_LEVEL_FILES = ["README.md", "package.json", "package-lock.json"];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

function leftovers(): string[] {
  const files = [...filesUnder(path.join(ROOT, "src")), ...TOP_LEVEL_FILES.map((file) => path.join(ROOT, file))];
  return files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, index) =>
        FORBIDDEN.some((pattern) => pattern.test(line))
          ? [`${path.relative(ROOT, file).replaceAll("\\", "/")}:${index + 1}: ${line.trim()}`]
          : [],
      ),
  );
}

describe("starter leftovers", () => {
  it("no template identity text remains in src/, README or package files", () => {
    expect(leftovers()).toEqual([]);
  });
});
