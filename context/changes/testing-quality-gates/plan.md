# Quality-Gates Wiring — Implementation Plan

## Overview

Rollout Phase 4 of `context/foundation/test-plan.md`. Three gates:

1. the Phase 1 integration suite runs in CI against local Supabase;
2. a new CI job proves risk #7: the PR's migrations apply on top of a database seeded through the previous release's schema and calls, the seeded data survives, and the previous release's app still passes its smoke test against the new schema;
3. Claude Code hooks lint the edited file per edit and sweep the turn (lint, unit suite, `astro check`) at end of turn, proven by a committed test.

No app code or schema changes.

## Current State Analysis

See `research.md`. In short: `smoke` already has a local Supabase and a local `.env`; nothing applies migrations to non-empty data or runs old code against the new schema; no agent hooks exist and `jq` is not available on the developer host.

## Desired End State

- `smoke` runs `npm run test:integration` after Supabase starts.
- A `migration-upgrade` job: refuses edited/deleted released migrations, starts Supabase from the previous release's checkout, seeds, applies the PR's new migrations with `supabase migration up`, verifies the seed, runs the previous release's smoke against the new schema, then the PR's integration suite on the upgraded data.
- `.claude/settings.json` registers `PostToolUse` (`Write|Edit`) → `.claude/hooks/post-edit.mjs` and `Stop` → `.claude/hooks/end-of-turn.mjs`.
- `scripts/agent-hooks.test.ts` (unit project) proves the hooks.
- Test plan §3 row 4 complete, §5 gates updated, §6.6 Phase 4 note; AGENTS.md CI section describes the new gates.

## What We're NOT Doing

- Not touching `migrate` or its trigger, never `--linked`, `db push` or `config push`.
- Not testing old-code-vs-new-schema for the reverse direction (new code on the old schema): `smoke` + the backward-compatibility rule in AGENTS.md cover additive changes; the reverse window is short and documented.
- No husky/lint-staged changes (recommended only).
- No production-sized data volume.

## Phase 1: Integration suite in CI

### Changes Required:

- `.github/workflows/ci.yml` `smoke`: step `npm run test:integration` after `.env` is written, before the build (fail fast).

### Success Criteria:

#### Automated Verification:

- `smoke` job green on the PR with the integration step listed and 20 tests passing.

## Phase 2: Migration on a seeded database (risk #7)

### Changes Required:

- `scripts/seed-db.mjs` (supabase-js, anon key only, refuses non-local URL):
  - `seed <snapshot.json>`: 3 owners; leagues of 4 (fully scored, one correction), 6 (2/1/0 points, partially scored, renamed), 3 (unscored), 20 (non-ASCII/mixed-case names, partially scored), plus one created then deleted. Writes credentials, ids and a snapshot (owner reads of all four tables + anon `get_shared_league`) to the file.
  - `verify <snapshot.json>`: signs in again, re-reads everything and checks the snapshot is a subset of what is read now (A3), the deleted league is still gone, and the write path still works on seeded data (anon submit → `created`, again → `already_entered`, owner correction, settings rename).
  - `cleanup <snapshot.json>`: owners delete their seeded leagues (local runs).
- `.github/workflows/ci.yml` new job `migration-upgrade`:
  1. checkout `fetch-depth: 0`; base = `HEAD^1` on PR, `github.event.before` on push;
  2. fail if any released migration is modified/deleted/renamed; list new migrations;
  3. `git worktree add` the base at `$RUNNER_TEMP/previous`; `npm ci` in both;
  4. `supabase start` from the previous checkout (previous migrations only);
  5. seed with the previous release's `scripts/seed-db.mjs` if it exists, else the PR's;
  6. `supabase migration up` from the PR checkout;
  7. verify with the same seed script;
  8. build and preview the previous release; run its `scripts/smoke.mjs`;
  9. `npm run test:integration` from the PR checkout on the upgraded data;
  10. `supabase stop --no-backup` under `always()`.

### Success Criteria:

#### Automated Verification:

- `node scripts/seed-db.mjs seed|verify|cleanup` green against the local Supabase (data only, no schema change).
- `migration-upgrade` green on the PR.
- `npm run lint` green.

#### Manual Verification:

- Deliberate break: a temporary commit adds a migration whose constraint the seeded data violates but an empty DB accepts. Expect `smoke` green and `migration-upgrade` red at the migration step. Revert the commit.

## Phase 3: Agent hooks (Claude Code)

### Changes Required:

- `.claude/hooks/lib.mjs`: payload parsing (tolerant), checkout resolution (edited file → toplevel; same `--git-common-dir` as the session cwd, else skip), session registry in `os.tmpdir()/claude-hooks/<session_id>.roots`, local tool resolution (`node_modules/eslint/bin/eslint.js`, `node_modules/vitest/vitest.mjs`, `node_modules/astro/bin/astro.mjs`; missing → visible failure), `NO_COLOR=1 FORCE_COLOR=0`.
- `.claude/hooks/post-edit.mjs` (PostToolUse `Write|Edit`, timeout 90): ESLint `--quiet` on the edited file if `.ts/.tsx/.js/.jsx/.mjs/.cjs/.astro`; then `vitest related <file> --run --project unit` for script files. Failure → stderr + exit 2.
- `.claude/hooks/end-of-turn.mjs` (Stop, timeout 180): `stop_hook_active`/`loop_count` guard; roots = cwd toplevel + registry; per root with changes: ESLint on changed covered files, whole unit suite (~3 s), `astro check`. One message, exit 2; clean → clear registry.
- `.claude/settings.json`: merge `hooks` next to the existing permissions; command `node "$(git rev-parse --show-toplevel 2>/dev/null || echo "$CLAUDE_PROJECT_DIR")/.claude/hooks/<script>.mjs"`.
- `scripts/agent-hooks.test.ts` + `vitest.config.ts` unit include `scripts/**/*.test.ts`. Throwaway git repo in `os.tmpdir()` with stub tools under `node_modules/` that flag markers; cases 1–9 of the configure-hook skill.

### Success Criteria:

#### Automated Verification:

- `npm test` green including the hook test.
- Live run of the real scripts against a real broken file in the worktree: exit 2 with the ESLint / `astro check` message; clean tree → exit 0.

#### Manual Verification:

- Deliberate break of the test: drop the retry guard → case 6 red; restore.

## Phase 4: Docs

- `context/foundation/test-plan.md`: §3 row 4 complete + folder, §4 integration row, §5 gates status, §6.6 Phase 4 note.
- `AGENTS.md` CI section + hooks line.

## Progress

### Phase 1: Integration suite in CI

- [ ] 1.1 `smoke` runs `npm run test:integration` and is green on the PR

### Phase 2: Migration on a seeded database

- [ ] 2.1 Seed/verify/cleanup green locally against the shared local Supabase
- [ ] 2.2 `migration-upgrade` green on the PR
- [ ] 2.3 Deliberate breaking migration: `smoke` green, `migration-upgrade` red; reverted

### Phase 3: Agent hooks

- [ ] 3.1 `npm test` green with `scripts/agent-hooks.test.ts`
- [ ] 3.2 Real scripts block on a real broken file, pass on the clean tree
- [ ] 3.3 Test goes red when the retry guard is removed; restored

### Phase 4: Docs

- [ ] 4.1 Test plan and AGENTS.md updated; prettier clean
