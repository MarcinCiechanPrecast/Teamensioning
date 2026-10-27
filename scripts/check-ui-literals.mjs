// UI literal guard: fails when a cleaned dashboard view reintroduces hex/rgb/hsl/oklch colours,
// arbitrary lengths, inline styles or palette colour classes instead of design tokens.
// Zero dependencies on purpose. Usage: node scripts/check-ui-literals.mjs [files...]
// With no arguments it scans src/pages/dashboard.astro and every *.astro under src/components/dashboard/.
// It fails (exit 1) when it ends up scanning nothing, so a renamed view cannot make the guard pass silently.
// Known limits: bare named colours (`color: red`) and colour functions inside comments are not told apart.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

const DEFAULT_PAGE = "src/pages/dashboard.astro";
const DEFAULT_DIR = "src/components/dashboard";

const normalise = (path) => path.replaceAll("\\", "/");

function defaultFiles() {
  const files = existsSync(DEFAULT_PAGE) ? [DEFAULT_PAGE] : [];
  if (existsSync(DEFAULT_DIR)) {
    for (const name of readdirSync(DEFAULT_DIR).sort()) {
      if (name.endsWith(".astro")) files.push(join(DEFAULT_DIR, name));
    }
  }
  return files;
}

const args = process.argv.slice(2);
const files = args.length > 0 ? args : defaultFiles();

if (files.length === 0) {
  console.error(`No files to scan: expected ${DEFAULT_PAGE} and *.astro under ${DEFAULT_DIR}/. Was a view renamed?`);
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
