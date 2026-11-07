#!/usr/bin/env node
// Stop: sweep everything this turn changed before the agent finishes, with one retry.
// Per checkout with changes: ESLint on changed lintable files (also catches files rewritten through
// Bash, which never reach post-edit.mjs), the whole unit suite (~3 s), then `astro check`.
// The integration suite is not run here: it needs the shared local Supabase; CI owns it.

import { existsSync } from "node:fs";
import path from "node:path";
import {
  CODE,
  LINTED,
  block,
  changedFiles,
  clearRegistry,
  registeredRoots,
  readPayload,
  runTool,
  tail,
  toplevel,
} from "./lib.mjs";

const payload = readPayload();

// Already sent back once by this hook: let the agent finish; the commit gate and CI catch the rest.
// (loop_count: Cursor imports .claude/settings.json hooks.)
if (payload.stop_hook_active === true || Number(payload.loop_count ?? 0) > 0) process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const roots = [...new Set([toplevel(cwd), ...registeredRoots(payload.session_id)].filter((r) => r && existsSync(r)))];
if (roots.length === 0) {
  // Not silent: the user sees why nothing was checked.
  process.stdout.write(
    JSON.stringify({ systemMessage: `end-of-turn.mjs: no git checkout at ${cwd}, nothing checked.` }),
  );
  process.exit(0);
}

const report = [];
for (const root of roots) {
  const changed = changedFiles(root);
  if (changed.length === 0) continue;

  const lintable = changed.filter((f) => LINTED.test(f) && existsSync(path.join(root, f)));
  if (lintable.length) {
    const lint = runTool(root, "eslint", ["--quiet", "--no-warn-ignored", ...lintable]);
    if (!lint.ok) report.push(`ESLint errors in changed files (${root}):\n${tail(lint.output)}`);
  }

  // Docs-only turn (e.g. markdown): nothing the unit suite or the typecheck could catch.
  if (!changed.some((f) => CODE.test(f))) continue;

  const unit = runTool(root, "vitest", ["run", "--project", "unit"]);
  if (!unit.ok) report.push(`Unit tests fail (${root}):\n${tail(unit.output)}`);

  // astro check, not tsc: it syncs the generated astro:* types itself and covers .astro files.
  const types = runTool(root, "astro", ["check"]);
  if (!types.ok) report.push(`Typecheck (astro check) fails (${root}):\n${tail(types.output)}`);
}

if (report.length) block(`Fix these before you finish:\n\n${report.join("\n\n")}`);
clearRegistry(payload.session_id);
