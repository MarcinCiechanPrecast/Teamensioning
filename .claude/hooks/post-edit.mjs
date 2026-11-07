#!/usr/bin/env node
// PostToolUse (Write|Edit): lint the file the agent just edited, then run the unit tests related to it.
// Only that file: whole-project checks belong to end-of-turn.mjs. Exit 2 + stderr reaches Claude.

import { existsSync } from "node:fs";
import path from "node:path";
import {
  LINTED,
  SCRIPT,
  block,
  checkoutOf,
  readPayload,
  registerRoot,
  relativeInCheckout,
  runTool,
  tail,
} from "./lib.mjs";

const payload = readPayload();
const input = payload.tool_input ?? {};
const raw = input.file_path ?? input.notebook_path ?? input.path;
if (typeof raw !== "string" || raw === "") process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const file = path.resolve(cwd, raw);
if (!LINTED.test(file) || !existsSync(file)) process.exit(0);

const root = checkoutOf(file, cwd);
if (!root) process.exit(0);
registerRoot(payload.session_id, root);
const rel = relativeInCheckout(file);

const problems = [];
const lint = runTool(root, "eslint", ["--quiet", "--no-warn-ignored", rel]);
if (!lint.ok) problems.push(`ESLint reported errors in ${rel}:\n${tail(lint.output)}`);

if (SCRIPT.test(file)) {
  // Unit project only: the integration project needs the shared local Supabase (CI runs it).
  const tests = runTool(root, "vitest", ["related", rel, "--run", "--project", "unit", "--passWithNoTests"]);
  if (!tests.ok) problems.push(`Unit tests related to ${rel} fail:\n${tail(tests.output)}`);
}

if (problems.length) block(problems.join("\n\n"));
