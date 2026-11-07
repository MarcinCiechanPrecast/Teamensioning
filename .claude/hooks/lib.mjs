// Shared helpers for the Claude Code hooks in this directory (Node: no jq on the Windows dev host).
// Signal protocol (Claude Code): only exit 2 + stderr reaches the agent; exit 0 = checked and clean,
// or nothing to check. A missing tool is a visible failure, never a silent pass.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Plain output: hook output is read by a model, not a terminal. */
export const PLAIN_ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

/** Extensions the ESLint flat config covers (eslint.config.js: js/jsx/ts/tsx, scripts/*.mjs, *.astro). */
export const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/i;
/** Files that can have related unit tests. */
export const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
/** Changes that can break the unit suite or the typecheck (sources, config, package manifests). */
export const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|astro|json)$/i;

/** Reads the hook payload from stdin. Empty or unparseable input is "no payload", not an error. */
export function readPayload() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const norm = (p) => {
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

export const toplevel = (dir) => {
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  return top ? path.resolve(top) : "";
};
const commonDir = (dir) => {
  const d = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return d ? norm(d) : "";
};

/**
 * The checkout of the edited file, when it belongs to the same repository as the session (any worktree
 * of it). `$CLAUDE_PROJECT_DIR` is never used: it goes stale after EnterWorktree and does not name a
 * sibling worktree. Returns "" for files of other repositories (~/.claude, other projects).
 */
export function checkoutOf(file, sessionCwd) {
  const root = toplevel(path.dirname(file));
  if (!root) return "";
  const repo = commonDir(root);
  return repo && repo === commonDir(sessionCwd) ? root : "";
}

/**
 * Path of `file` relative to its checkout, as git sees it. Not path.relative(): on Windows the payload
 * or temp path can be an 8.3 short name (MARCIN~1.CIE) while git reports the long one.
 */
export function relativeInCheckout(file) {
  return git(path.dirname(file), ["rev-parse", "--show-prefix"]) + path.basename(file);
}

const registryPath = (sessionId) => {
  const sid = String(sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return sid ? path.join(tmpdir(), "claude-hooks", `${sid}.roots`) : "";
};

/** Remembers a checkout the session edited, so the Stop hook sweeps it even when it is not the cwd. */
export function registerRoot(sessionId, root) {
  const file = registryPath(sessionId);
  if (!file) return;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${root}\n`);
  } catch {
    // The cwd checkout is still swept; only a sibling worktree could be missed.
  }
}

export function registeredRoots(sessionId) {
  const file = registryPath(sessionId);
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
}

export function clearRegistry(sessionId) {
  const file = registryPath(sessionId);
  if (file && existsSync(file)) writeFileSync(file, "");
}

/** Changed and untracked files of a checkout (relative paths), the way the end-of-turn sweep sees a turn. */
export function changedFiles(root) {
  const out = [git(root, ["diff", "--name-only", "HEAD"]), git(root, ["ls-files", "-o", "--exclude-standard"])];
  return [...new Set(out.join("\n").split("\n").filter(Boolean))].sort();
}

const TOOLS = {
  eslint: "node_modules/eslint/bin/eslint.js",
  vitest: "node_modules/vitest/vitest.mjs",
  astro: "node_modules/astro/bin/astro.mjs",
};

/**
 * Runs a locally installed tool of `root` with Node. Returns { ok, output }. A tool that is not
 * installed is reported as a failure with an explicit message (no silent success).
 */
export function runTool(root, tool, args, timeoutMs = 170_000) {
  const bin = path.join(root, TOOLS[tool]);
  if (!existsSync(bin)) {
    return { ok: false, output: `${tool} is not installed in ${root} (missing ${TOOLS[tool]}); run npm ci.` };
  }
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    env: PLAIN_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.error) return { ok: false, output: `${tool} could not run: ${r.error.message}\n${output}` };
  return { ok: r.status === 0, output };
}

/** Keeps a long tool report readable for the agent. */
export function tail(text, lines = 80) {
  // Some tools (astro check) colour their output even with NO_COLOR set.
  // eslint-disable-next-line no-control-regex
  const all = text.replace(/\u001b\[[0-9;]*m/g, "").split(/\r?\n/);
  return (all.length > lines ? [`… (${all.length - lines} lines omitted)`, ...all.slice(-lines)] : all).join("\n");
}

/** Blocks with a message for the agent (Claude Code: exit 2 + stderr). */
export function block(message) {
  process.stderr.write(`${message.trim()}\n`);
  process.exit(2);
}
