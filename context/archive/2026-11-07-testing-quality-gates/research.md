---
date: 2026-11-07T15:30:00Z
researcher: Claude (Opus 5.5) for Marcin Ciechan
git_commit: a5eb251
branch: testing-quality-gates
repository: Teamensioning
topic: "Ground test-plan Phase 4: quality-gates wiring (risk #7, CI integration suite, agent post-edit hook)"
tags: [research, testing, ci, github-actions, supabase-cli, migrations, hooks, claude-code]
status: complete
last_updated: 2026-11-07
last_updated_by: Claude (Opus 5.5)
---

# Research: Ground test-plan Phase 4 — Quality-gates wiring

**Date**: 2026-11-07T15:30:00Z
**Researcher**: Claude (Opus 5.5) for Marcin Ciechan
**Git Commit**: a5eb251 (origin/master)
**Branch**: testing-quality-gates
**Repository**: Teamensioning

## Research Question

For test-plan §3 Phase 4 and risk #7: how does CI run today, where can the Phase 1 integration suite run in CI, how can a PR's migrations be proven against a database that already holds data from the previous release (and the previous release's code proven against the new schema), and which agent post-edit hooks fit this repo's toolchain?

## Summary

- **The integration suite can run inside the existing `smoke` job with one step.** `smoke` already starts local Supabase and writes `.env` with `SUPABASE_URL=http://127.0.0.1:54321` and the anon key (`.github/workflows/ci.yml:41-48`). The integration project loads `SUPABASE_*` from `.env` (`vitest.config.ts`, `loadEnv(mode, cwd, "SUPABASE_")`) and its guard accepts `127.0.0.1` (`src/test/integration/supabase-test-env.ts`). Email confirmation is off in `supabase/config.toml:209`, which the suite's sign-ups need. No other prerequisite.
- **Risk #7 has two failure shapes, and today neither is tested.** (1) A migration that applies to an empty database but fails on existing rows (a new constraint the data violates, a `not null` column without default, a type change). `smoke` applies all migrations to an empty DB and only then creates data, so it cannot see this. (2) The previous release's Worker running against the new schema. Workers Builds deploys `master` in parallel with the `migrate` job (`ci.yml` comment above `migrate`, AGENTS.md CI section), so for a window the old code meets the new schema. Today nothing runs the old code against the new schema.
- **The Supabase CLI can stage an upgrade locally.** `supabase start` applies the migrations it finds in the project's `supabase/migrations/`. `supabase migration up --local` (default `--local`) "applies pending migrations to the local database", computes the pending set from the history table, applies each transactionally and **does not seed** (Context7 `/supabase/cli/v2.121.0`, `migration up` SIDE_EFFECTS). It shares `db push`'s pending-set logic; without `--include-all` it rejects a new migration older than the last applied one, which is exactly what `migrate` (`supabase db push --linked`) would do in production.
- **"Previous release" = the merge commit's first parent on a PR, `github.event.before` on a push.** `actions/checkout` checks out `refs/pull/N/merge` on `pull_request`; `HEAD^1` is the base branch tip the PR merges into. A `git worktree` of that commit gives the previous migrations, the previous app and the previous `scripts/smoke.mjs` side by side with the PR checkout.
- **The local CLI identifies the stack by `project_id`** in `supabase/config.toml`, so `supabase start` run in the previous checkout and `supabase migration up` / `status` / `stop` run in the PR checkout talk to the same containers (same `project_id`, same ports).
- **Seeding must use the public surface, like Phase 1 fixtures.** `supabase/seed.sql` does not exist (`config.toml:60-65` points at it, but `start` skips a missing file). Seeding through `signUp`, `create_league`, `submit_match_score`, an owner correction and `update_tournament_settings` writes rows exactly as the deployed app does, with no service-role key, so the seed also exercises the previous release's write calls.
- **Hooks: Claude Code is the only harness; no hooks exist yet.** `.claude/settings.json` has permissions only, `.claude/hooks/` does not exist, `.claude/settings.json` is not gitignored (`git check-ignore` prints nothing). No `.cursor/`, `.codex/` or `.github/hooks/`. `jq` is **not installed** on this Windows host, so the hook scripts are written in Node (always present: `.nvmrc`, every script) instead of bash + jq.

## Detailed Findings

### CI today (`.github/workflows/ci.yml`)

- `ci`: `npm ci`, `astro sync`, lint, `check:ui`, `npm run test` (unit project only), `astro check`, build. No database.
- `smoke`: Supabase CLI pinned to `2.121.0`, `supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor`, `.env` + `.dev.vars` from `supabase status -o env`, build, `npm run preview` on 4321, `npm run smoke`, `supabase stop --no-backup` under `if: always()`.
- `migrate`: push to master only, `supabase db push --linked`. Must not change (task constraint, AGENTS.md).
- Another agent may add an e2e job concurrently; this change only adds one step to `smoke` and one new self-contained job.

### Local baselines (Windows host, 2026-11-07)

| Check         | Command                                            | Result                   | Time                             |
| ------------- | -------------------------------------------------- | ------------------------ | -------------------------------- |
| unit          | `npx vitest run --project unit`                    | 9 files, 214 tests green | ~3 s                             |
| lint one file | `npx eslint --quiet src/lib/services/fixtures.ts`  | clean                    | ~18 s (type-checked rules, cold) |
| typecheck     | `npx astro check`                                  | 0 errors                 | ~24 s                            |
| integration   | `npm run test:integration` (shared local Supabase) | 3 files, 20 tests green  | ~3 s                             |

So: lint per edit fits (≤ 60 s budget), the whole unit suite fits end of turn, `astro check` (not raw `tsc`: `.astro` files and `astro:*` modules) belongs to end of turn, and the integration suite stays in CI (it needs the shared Supabase, which hooks must not depend on).

### What the deployed Worker calls (risk #7 surface)

From the migrations and Phase 1 research: `auth.signUp/signIn`, RPC `create_league`, RPC `get_shared_league` (anon), RPC `submit_match_score` (anon), owner `select` on `tournaments`/`players`/`matches`/`results`, owner `update results (score_a, score_b)`, RPC `update_tournament_settings`, owner `delete tournaments`. `scripts/smoke.mjs` drives all of these through the built app's endpoints, so the previous release's smoke against the upgraded schema is the most faithful "old code meets new schema" check.

### Gaps and edge cases the gate must handle

- An **edited or deleted** already-released migration never reaches production (`db push` skips versions in the history table). Detectable with `git diff --diff-filter=MDR <base> HEAD -- supabase/migrations`.
- An **out-of-order** new migration (timestamp older than the newest released one) is rejected by `db push` in production; `migration up` reproduces the rejection.
- A PR **without new migrations** still runs the gate: then it proves the seed/verify path and that the previous smoke passes on seeded data (cheap insurance that the gate itself works; runs in parallel, so no wall-clock cost on the PR).
- When the previous release has no seed script (this PR introduces it), the PR's own script is used; from the next PR on, the previous release's script seeds and verifies, which is what "the previous release's calls" means.

### Hooks: toolchain facts

- ESLint flat config covers `**/*.{js,jsx,ts,tsx}`, `*.astro` and `scripts/**/*.mjs` (`eslint.config.js`); ignore file is `.gitignore`.
- Vitest projects `unit` / `integration`; `vitest related <file> --run --project unit` keeps per-edit tests DB-free.
- Git hooks: husky + lint-staged (`.husky/pre-commit` → `npx lint-staged`). Not modified.
- Claude Code payloads (`references/anthropic.md`, verified 2026-09-25): `tool_input.file_path` (absolute, backslashes on Windows), `cwd`, `session_id`; `Stop` has `stop_hook_active`; only exit 2 + stderr reaches Claude; `timeout` in seconds.

## Assumptions (user delegated all decisions)

- A1. The seeded-migration gate runs on PRs and on pushes to master, like `smoke`; it cannot gate the master deploy (Workers Builds), it gates the merge.
- A2. "Realistic data" = several owners, leagues of 3, 4, 6 and 20 players, non-default points, scored/partially scored/unscored leagues, an owner correction, a renamed league, a deleted league, non-ASCII and mixed-case names. Volume stays small (hundreds of rows); production volume is not the risk being tested.
- A3. Verification after the upgrade compares a projection of the seeded data (only the columns/keys the seed wrote), so a backward-compatible additive migration (new column, new JSON key) passes.
- A4. Hooks are Node scripts (no `jq` on the host). The end-of-turn typecheck is `astro check`.
- A5. The integration suite is not an agent hook: it needs the shared local Supabase; CI owns it.
