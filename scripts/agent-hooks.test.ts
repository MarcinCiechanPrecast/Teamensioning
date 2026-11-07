/**
 * Proof for the Claude Code hooks in .claude/hooks (test-plan §5 "post-edit hook").
 *
 * Pipes real payloads into the real scripts and asserts the Claude Code signal protocol: exit 2 + stderr
 * reaches the agent, exit 0 means "clean" or "nothing to check". Works in throwaway git repos under the
 * OS temp dir, never on the developer's tree. Only the slow tools are stubbed: node_modules/{eslint,
 * vitest,astro} in the throwaway repo flag a marker instead of running the real thing.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "..");
const HOOKS = path.join(REPO, ".claude", "hooks");
const POST_EDIT = path.join(HOOKS, "post-edit.mjs");
const END_OF_TURN = path.join(HOOKS, "end-of-turn.mjs");

// Stub tools: each logs its call and fails when a scanned file contains its marker.
const STUB_PRELUDE = `
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2);
appendFileSync(".tool-log", TOOL + " " + args.join(" ") + "\\n");
const tracked = () => execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" }).split("\\n").filter(Boolean);
const flagged = (files, marker) => files.filter((f) => existsSync(f) && readFileSync(f, "utf8").includes(marker));
`;
const STUBS: Record<string, string> = {
  "node_modules/eslint/bin/eslint.js": `const TOOL = "eslint";${STUB_PRELUDE}
const bad = flagged(args.filter((a) => !a.startsWith("--")), "LINT_ERROR");
for (const f of bad) console.log(f + "  1:1  error  stub rule: LINT_ERROR marker");
process.exit(bad.length ? 1 : 0);`,
  "node_modules/vitest/vitest.mjs": `const TOOL = "vitest";${STUB_PRELUDE}
const bad = flagged(tracked().filter((f) => /\\.test\\.ts$/.test(f)), "FAILING_TEST");
for (const f of bad) console.log("FAIL " + f + " > AssertionError: expected 1 to be 2");
process.exit(bad.length ? 1 : 0);`,
  "node_modules/astro/bin/astro.mjs": `const TOOL = "astro";${STUB_PRELUDE}
const bad = flagged(tracked().filter((f) => /\\.(ts|astro)$/.test(f)), "TYPE_ERROR");
for (const f of bad) console.log(f + ":1:1 - error ts(2322): Type 'string' is not assignable to type 'number'.");
process.exit(bad.length ? 1 : 0);`,
};

let base: string;

function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function write(root: string, rel: string, content: string) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), content);
}

function installStubs(root: string) {
  for (const [rel, body] of Object.entries(STUBS)) write(root, rel, body);
}

/** A committed, clean throwaway repo with stub tools (node_modules and the tool log are ignored). */
function makeRepo(name: string, { stubs = true } = {}) {
  const root = path.join(base, `${name}-${randomUUID().slice(0, 8)}`);
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "hooks@example.test");
  git(root, "config", "user.name", "hooks test");
  git(root, "config", "commit.gpgsign", "false");
  write(root, ".gitignore", "node_modules/\n.tool-log\n");
  write(root, "package.json", '{ "type": "module" }\n');
  write(root, "README.md", "# throwaway\n");
  write(root, "src/ok.ts", "export const ok = 1;\n");
  write(root, "src/ok.test.ts", "// passing test\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  if (stubs) installStubs(root);
  return root;
}

function run(script: string, payload: unknown, opts: { cwd: string; env?: Record<string, string> }) {
  const r = spawnSync(process.execPath, [script], {
    cwd: opts.cwd,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...opts.env },
  });
  return { code: r.status, stderr: r.stderr, stdout: r.stdout };
}

const edit = (root: string, file: string, extra: Record<string, unknown> = {}) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  cwd: root,
  tool_input: { file_path: file },
  ...extra,
});
const stop = (root: string, extra: Record<string, unknown> = {}) => ({
  hook_event_name: "Stop",
  cwd: root,
  stop_hook_active: false,
  ...extra,
});
const toolLog = (root: string) => {
  try {
    return readFileSync(path.join(root, ".tool-log"), "utf8");
  } catch {
    return "";
  }
};

beforeAll(() => {
  base = mkdtempSync(path.join(tmpdir(), "agent-hooks-"));
});
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("post-edit.mjs (PostToolUse Write|Edit)", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo("post");
  });

  it("1. blocks a broken file with exit 2 and names the file and the problem on stderr", () => {
    write(repo, "src/bad.ts", "export const x = 1; // LINT_ERROR\n");
    const r = run(POST_EDIT, edit(repo, path.join(repo, "src", "bad.ts")), { cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ESLint reported errors in src/bad.ts");
    expect(r.stderr).toContain("LINT_ERROR");
  });

  it("1. blocks when a related unit test fails (behavioural error)", () => {
    write(repo, "src/sum.test.ts", "// FAILING_TEST\n");
    const r = run(POST_EDIT, edit(repo, path.join(repo, "src", "sum.test.ts")), { cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Unit tests related to src/sum.test.ts fail");
    expect(toolLog(repo)).toMatch(/vitest related src\/sum\.test\.ts --run --project unit/);
  });

  it("2. passes a clean file silently", () => {
    const r = run(POST_EDIT, edit(repo, path.join(repo, "src", "ok.ts")), { cwd: repo });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(toolLog(repo)).toContain("eslint --quiet --no-warn-ignored src/ok.ts");
  });

  it("3. skips a file type the linter does not cover", () => {
    const r = run(POST_EDIT, edit(repo, path.join(repo, "README.md")), { cwd: repo });
    expect(r.code).toBe(0);
    expect(toolLog(repo)).toBe("");
  });

  it("4. skips a nonexistent file", () => {
    const r = run(POST_EDIT, edit(repo, path.join(repo, "src", "gone.ts")), { cwd: repo });
    expect(r.code).toBe(0);
    expect(toolLog(repo)).toBe("");
  });

  it.each([
    ["empty object", {}],
    ["empty stdin", ""],
    ["not json", "not json"],
    ["a tool call without a path", { tool_name: "Bash", cwd: "", tool_input: { command: "ls" } }],
  ])("5. treats %s as nothing to check", (_label, payload) => {
    const r = run(POST_EDIT, payload, { cwd: repo });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("8. resolves a relative path against the payload cwd", () => {
    write(repo, "src/bad.ts", "// LINT_ERROR\n");
    const r = run(POST_EDIT, edit(repo, "src/bad.ts"), { cwd: base });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("src/bad.ts");
  });

  it("8. ignores $CLAUDE_PROJECT_DIR pointing at another checkout with an error", () => {
    const other = makeRepo("other");
    write(other, "src/ok.ts", "// LINT_ERROR\n");
    const r = run(POST_EDIT, edit(repo, path.join(repo, "src", "ok.ts")), {
      cwd: repo,
      env: { CLAUDE_PROJECT_DIR: other },
    });
    expect(r.code).toBe(0);
  });

  it("8. skips a broken file of another repository", () => {
    const other = makeRepo("foreign");
    write(other, "src/bad.ts", "// LINT_ERROR\n");
    const r = run(POST_EDIT, edit(repo, path.join(other, "src", "bad.ts")), { cwd: repo });
    expect(r.code).toBe(0);
    expect(toolLog(other)).toBe("");
  });

  it("9. fails visibly when the linter is not installed", () => {
    const bare = makeRepo("bare", { stubs: false });
    const r = run(POST_EDIT, edit(bare, path.join(bare, "src", "ok.ts")), { cwd: bare });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/eslint is not installed/);
  });
});

describe("end-of-turn.mjs (Stop)", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo("stop");
  });

  it("2. passes a clean turn", () => {
    write(repo, "src/new.ts", "export const n = 2;\n");
    const r = run(END_OF_TURN, stop(repo), { cwd: repo });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(toolLog(repo)).toMatch(/eslint[\s\S]*vitest run --project unit[\s\S]*astro check/);
  });

  it("6. lets the agent finish when stop_hook_active is set, even with an error present", () => {
    write(repo, "src/bad.ts", "// LINT_ERROR\n");
    const r = run(END_OF_TURN, stop(repo, { stop_hook_active: true }), { cwd: repo });
    expect(r.code).toBe(0);
    expect(toolLog(repo)).toBe("");
  });

  it("6. honours Cursor's loop_count the same way", () => {
    write(repo, "src/bad.ts", "// LINT_ERROR\n");
    expect(run(END_OF_TURN, stop(repo, { loop_count: 1 }), { cwd: repo }).code).toBe(0);
  });

  it("7. blocks on a lint error written outside the edit tools (no per-edit payload)", () => {
    write(repo, "src/ok.ts", "export const ok = 1; // LINT_ERROR\n");
    const r = run(END_OF_TURN, stop(repo), { cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Fix these before you finish");
    expect(r.stderr).toContain("src/ok.ts");
  });

  it("7. blocks on a failing unit test and on a type error in one message", () => {
    write(repo, "src/ok.test.ts", "// FAILING_TEST\n");
    write(repo, "src/typed.ts", "export const n: number = 'x'; // TYPE_ERROR\n");
    const r = run(END_OF_TURN, stop(repo), { cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Unit tests fail");
    expect(r.stderr).toContain("Typecheck (astro check) fails");
    expect(r.stderr).toContain("src/typed.ts");
  });

  it("7. runs no check when nothing changed", () => {
    const r = run(END_OF_TURN, stop(repo), { cwd: repo });
    expect(r.code).toBe(0);
    expect(toolLog(repo)).toBe("");
  });

  it("7. skips the unit suite and typecheck on a docs-only turn", () => {
    write(repo, "README.md", "# changed\n");
    const r = run(END_OF_TURN, stop(repo), { cwd: repo });
    expect(r.code).toBe(0);
    expect(toolLog(repo)).toBe("");
  });

  it("5. treats an empty or unparseable payload as the process cwd", () => {
    expect(run(END_OF_TURN, "", { cwd: repo }).code).toBe(0);
    expect(run(END_OF_TURN, "not json", { cwd: repo }).code).toBe(0);
  });

  it("8. sweeps a sibling worktree the session edited", () => {
    const wt = path.join(base, `wt-${randomUUID().slice(0, 8)}`);
    git(repo, "worktree", "add", "-q", wt);
    installStubs(wt);
    const session = `test-${randomUUID()}`;
    write(wt, "src/ok.ts", "export const ok = 3;\n");
    expect(run(POST_EDIT, edit(repo, path.join(wt, "src", "ok.ts"), { session_id: session }), { cwd: repo }).code).toBe(
      0,
    );
    write(wt, "src/ok.ts", "// LINT_ERROR\n"); // later rewritten through a shell command
    const r = run(END_OF_TURN, stop(repo, { session_id: session }), { cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(path.basename(wt));
  });

  it("8. ignores $CLAUDE_PROJECT_DIR pointing at another checkout with an error", () => {
    const other = makeRepo("other");
    write(other, "src/ok.ts", "// LINT_ERROR\n");
    const r = run(END_OF_TURN, stop(repo), { cwd: repo, env: { CLAUDE_PROJECT_DIR: other } });
    expect(r.code).toBe(0);
  });

  it("9. fails visibly when the typechecker is not installed", () => {
    rmSync(path.join(repo, "node_modules", "astro"), { recursive: true });
    write(repo, "src/new.ts", "export const n = 2;\n");
    const r = run(END_OF_TURN, stop(repo), { cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/astro is not installed/);
  });

  it("8. no checkout at cwd: tells the user instead of passing silently", () => {
    const empty = path.join(base, `nogit-${randomUUID().slice(0, 8)}`);
    mkdirSync(empty);
    const r = run(END_OF_TURN, stop(empty), { cwd: empty });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("nothing checked");
  });
});

describe(".claude/settings.json hook commands", () => {
  const settings = JSON.parse(readFileSync(path.join(REPO, ".claude", "settings.json"), "utf8")) as {
    hooks: Record<string, { hooks: { command: string; timeout: number }[] }[]>;
  };
  const commands = Object.entries(settings.hooks).flatMap(([event, groups]) =>
    groups.flatMap((g) => g.hooks.map((h) => ({ event, ...h }))),
  );

  it("registers a per-edit and an end-of-turn hook with timeouts in seconds", () => {
    expect(commands.map((c) => c.event).sort()).toEqual(["PostToolUse", "Stop"]);
    for (const c of commands) expect(c.timeout).toBeLessThanOrEqual(600);
  });

  it.each(commands.map((c) => [c.event, c.command] as const))(
    "8. %s command reaches its script from the checkout even with a stale $CLAUDE_PROJECT_DIR",
    (event, command) => {
      // Payloads that exit early, so the real tree is not linted here.
      const payload = event === "Stop" ? { stop_hook_active: true } : {};
      const r = spawnSync("bash", ["-c", command], {
        cwd: REPO,
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: path.join(base, "does-not-exist") },
      });
      expect(r.stderr).not.toMatch(/Cannot find module|No such file/);
      expect(r.status).toBe(0);
    },
  );
});
