// UI literal guard: fails when a cleaned dashboard view reintroduces hex/rgb/hsl/oklch colours,
// arbitrary px/rem values or palette colour classes instead of design tokens.
// Zero dependencies on purpose. Usage: node scripts/check-ui-literals.mjs [files...]
// With no arguments it scans src/pages/dashboard.astro and every *.astro under src/components/dashboard/.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Scan regex from the 10x-ui skill.
const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

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

let hits = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (LITERAL.test(line)) {
      hits++;
      console.log(`${normalise(file)}:${index + 1}: ${line.trim()}`);
    }
  });
}

console.log(
  hits
    ? `\n${hits} UI literal(s) found in ${files.length} file(s). Use design tokens from src/styles/global.css.`
    : `No UI literals in ${files.length} file(s).`,
);
process.exit(hits ? 1 : 0);
