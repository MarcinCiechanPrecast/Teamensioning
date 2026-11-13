// UI literal guard: fails when a view reintroduces hex/rgb/hsl/oklch colours, arbitrary lengths,
// inline styles or palette colour classes instead of design tokens.
// Zero dependencies on purpose. Usage: node scripts/check-ui-literals.mjs [files...]
// With no arguments it walks src/pages, src/components and src/layouts and scans every view that
// isGuardedView() accepts (.astro and .tsx; shadcn primitives in src/components/ui/ are exempt).
// Explicit arguments (lint-staged passes staged paths) go through the same filter.
// With no arguments it fails (exit 1) when it scans nothing, so a moved tree cannot make the guard pass silently.
// Known limits: bare named colours (`color: red`) and colour functions inside comments are not told apart.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

// Scan patterns from the 10x-ui skill, plus inline styles and non-px arbitrary lengths.
const PATTERNS = [
  // Hex colours, but not `href="#fragment"` links or HTML entities such as `&#x27;`.
  /(?<!href=["'])(?<![\w&/])#[0-9a-fA-F]{3,8}\b/,
  /\b(?:rgba?|hsla?|oklch)\(/,
  // Arbitrary lengths (`-[12px]`, `-[50%]`, `-[calc(...)]`); `-[var(--token)]` is fine.
  /-\[[0-9.]+(?:px|rem|em|vh|vw|svh|dvh|ch|%)\]|-\[calc\(/,
  /\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/,
  // Inline styles bypass the tokens.
  /\bstyle\s*=/,
];

const SCAN_ROOTS = ["src/pages", "src/components", "src/layouts"];

const normalise = (path) => path.replaceAll("\\", "/");

/**
 * Decides whether a repo-relative path (forward slashes, e.g. "src/components/ui/button.tsx")
 * is a view the guard must scan. Used for the default walk and for explicit arguments alike.
 * @param {string} path
 * @returns {boolean}
 */
function isGuardedView(path) {
  if (!path.endsWith(".astro") && !path.endsWith(".tsx")) return false;
  // Only real views: anything outside the scan roots is not a view, even if lint-staged hands it over.
  if (!SCAN_ROOTS.some((root) => path.startsWith(`${root}/`))) return false;
  // shadcn primitives ship their own arbitrary values (`ring-[3px]`); views consume them, they are not views.
  if (path.startsWith("src/components/ui/")) return false;
  // Tests may need literal colours as fixtures.
  return !/\.test\.tsx$/.test(path);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = normalise(join(dir, entry.name));
      return entry.isDirectory() ? walk(path) : [path];
    });
}

// lint-staged passes absolute paths; isGuardedView() works on repo-relative ones.
const args = process.argv.slice(2).map((arg) => normalise(isAbsolute(arg) ? relative(process.cwd(), arg) : arg));
const files = (args.length > 0 ? args : SCAN_ROOTS.flatMap(walk)).filter(isGuardedView);

if (files.length === 0) {
  if (args.length > 0) {
    // lint-staged may pass only exempt files (e.g. a shadcn primitive); nothing to check is fine then.
    console.log("No guarded views among the given files.");
    process.exit(0);
  }
  console.error(`No files to scan under ${SCAN_ROOTS.join(", ")}. Was the source tree moved?`);
  process.exit(1);
}

let hits = 0;
let unreadable = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    unreadable++;
    console.error(`${normalise(file)}: cannot read`);
    continue;
  }
  text.split(/\r?\n/).forEach((line, index) => {
    if (PATTERNS.some((pattern) => pattern.test(line))) {
      hits++;
      console.log(`${normalise(file)}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (unreadable > 0) {
  console.error(`\n${unreadable} file(s) could not be read.`);
}
if (hits > 0) {
  console.log(
    `\n${hits} UI literal(s) found in ${files.length} file(s). Use design tokens from src/styles/global.css.`,
  );
} else if (unreadable === 0) {
  console.log(`No UI literals in ${files.length} file(s).`);
}
process.exit(hits || unreadable ? 1 : 0);
