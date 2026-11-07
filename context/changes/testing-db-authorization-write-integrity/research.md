---
date: 2026-11-07T12:34:58Z
researcher: Claude (Opus 5.5) for Marcin Ciechan
git_commit: c054f62
branch: master
repository: Teamensioning
topic: "Ground test-plan Phase 1: DB authorization and write integrity (risks #1, #2, #4)"
tags: [research, testing, supabase, rls, security-definer, submit_match_score, update_tournament_settings, smoke]
status: complete
last_updated: 2026-11-07
last_updated_by: Claude (Opus 5.5)
---

# Research: Ground test-plan Phase 1 — DB authorization and write integrity

**Date**: 2026-11-07T12:34:58Z
**Researcher**: Claude (Opus 5.5) for Marcin Ciechan
**Git Commit**: c054f62 (working tree has uncommitted `context/` files only)
**Branch**: master
**Repository**: Teamensioning

## Research Question

For risks #1, #2 and #4 of `context/foundation/test-plan.md` §2: ground the real failure path in code, verify or correct the Risk Response Guidance, locate existing tests, pick the cheapest useful layer (Vitest against local Supabase vs pgTAP), and flag speculative risks or misleading hot-spot evidence.

## Summary

- **All three risks are enforced in the database today, not in the endpoints.** Write-once scores rely on the `results` primary key plus `on conflict do nothing` inside the `security definer` RPC `submit_match_score` (`supabase/migrations/20261102130000_add_update_tournament_settings.sql:105-113`). The token-to-match binding is a join in that same RPC (`:94-99`). Score bounds are table check constraints (`supabase/migrations/20261025130000_add_match_results.sql:18-19`). Organizer-only writes go through three different mechanisms: an RLS DELETE policy, an RLS UPDATE policy with a column grant, and an owner check inside a `security definer` RPC.
- **None of the three risks is a current defect.** The code reviewed shows no bypass. Phase 1 adds regression guards on the boundary that actually enforces each rule. Change one migration and the guarantee is gone without any visible error.
- **`scripts/smoke.mjs` already covers part of #1, #2 and #4, but only through the HTTP endpoints.** The test plan's §2 did not account for this. The smoke run covers sequential double-submit (`scripts/smoke.mjs:163-175`), a match from another tournament (`:219-231`), an out-of-range score (`:176-180`), and a delete by another owner (`:307-319`). Every one of these goes through zod first, so the database rules behind them are not proven by smoke. Smoke's out-of-range step (`scoreA=100`) is stopped by zod (`src/lib/validation/score.ts:19`) before it reaches the DB check constraint.
- **Real gaps:**
  - (a) direct RPC/PostgREST calls with the anon key, which skip zod and the middleware;
  - (b) concurrent submissions;
  - (c) score correction by a non-owner;
  - (d) a settings edit by a non-owner or by anon;
  - (e) direct table writes (INSERT/UPDATE/DELETE on `results`, UPDATE on `tournaments`) by anon or authenticated callers;
  - (f) "data unchanged" checks after every refused write.
- **Cheapest layer: a Vitest `integration` project using `@supabase/supabase-js` with the local anon key.** It runs against the local Supabase that CI's smoke job already starts. It needs no service-role client: users sign up because `enable_confirmations = false` (`supabase/config.toml:209`), and the owner's own RLS-scoped reads check that data is unchanged. pgTAP is the weaker fit (see "Layer choice").

## Detailed Findings

### Risk #1 — overwrite and concurrent submission

- **Enforcement point:** `submit_match_score` is `security definer` (`20261102130000_add_update_tournament_settings.sql:88`). It inserts with `on conflict (match_id) do nothing returning match_id` (`:106-109`). When no row comes back, it returns `{"status":"already_entered"}` (`:111-113`). `results.match_id` is the primary key (`20261025130000_add_match_results.sql:14`). So under concurrent calls, at most one insert per match can succeed. The losing call gets `already_entered`, not an error.
- **Direct writes by link holders:** `results` has RLS enabled (`20261025130000_add_match_results.sql:27`). Its policies are `results_select_own` (`:29-36`) and `results_update_own`, which is for `authenticated` only and only matches rows where the caller owns the tournament (`20261102120000_add_results_owner_update_policy.sql:10-23`). No migration defines a policy for anon on `results`, and none defines an INSERT or DELETE policy (all 6 files under `supabase/migrations/` were checked). So in the code reviewed, an anonymous direct INSERT, UPDATE or DELETE on `results` is denied by RLS.
- **Endpoint mapping:** `/api/scores` maps `already_entered` to a redirect with `?notice=already-entered` (`src/pages/api/scores.ts:67-68`, `src/lib/services/score-submission.ts:27-28`).
- **Correction to the guidance:** "the UI hides the form" doesn't matter here. The RPC is granted to `anon` (`20261102130000_add_update_tournament_settings.sql:120`), so anyone holding the public anon key and a share token can call it directly. The useful test calls the RPC directly, not through the endpoint.
- **Correction to the risk wording:** concurrent double-landing cannot happen with the current schema. Keep the concurrency test as a guard against regressions, such as someone replacing `do nothing` with `do update` (an upsert). Lower the likelihood to Medium, because smoke already covers the sequential path.

### Risk #2 — organizer-only writes by a non-owner or by anon

| Write                          | Mechanism                                                                                                                                                                                                                                                                    | Non-owner (authenticated) outcome         | Anon outcome                                                                                                                             | Existing automated test                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Delete tournament              | RLS `tournaments_delete_own`, `to authenticated` (`20261025140000_add_tournament_delete_policy.sql:8-10`); endpoint uses `.delete().select("id")` and treats 0 rows as not found (`src/pages/api/leagues/[id]/delete.ts:21-32`)                                              | 0 rows deleted, no error                  | No anon policy, so 0 rows. The endpoint is also behind middleware (`src/middleware.ts:4,18-21`)                                          | Smoke, endpoint only (`scripts/smoke.mjs:287-319`)                        |
| Correct score                  | RLS `results_update_own` plus `grant update (score_a, score_b)` (`20261102120000_add_results_owner_update_policy.sql:10-26`); endpoint treats 0 returned rows as `match-not-found` (`src/pages/api/leagues/[id]/scores.ts:52-64`, `src/lib/services/score-correction.ts:41`) | 0 rows updated, no error                  | No anon policy, so 0 rows                                                                                                                | **None.** `score-correction.test.ts` only tests the pure mapping function |
| Edit name/points               | `security definer` RPC with `where t.id = p_tournament_id and t.owner_id = auth.uid()` (`20261102130000_add_update_tournament_settings.sql:41-49`)                                                                                                                           | `{"status":"not_found"}`, nothing written | `revoke execute ... from public, anon` (`:74`), so the call fails with a permission error (expected 42501; check this when implementing) | **None**                                                                  |
| Direct UPDATE on `tournaments` | No UPDATE policy in any migration (the comment at `20261102130000_add_update_tournament_settings.sql:9` says so)                                                                                                                                                             | 0 rows                                    | 0 rows                                                                                                                                   | **None**                                                                  |

- **Correction to the guidance:** "asserting only the HTTP status" understates the problem. A refused correction or delete returns **no error** at the PostgREST layer. It just affects 0 rows. A test that only checks `error === null` would pass on a refused write and also on a successful one. The proof is a read-back by the owner showing the row is unchanged, plus `data.length === 0` from the attacker's call.
- **The anon cases have different shapes:** settings fails with an error, while delete and correction succeed silently with 0 rows. Tests have to assert each shape on its own terms.

### Risk #4 — cross-tournament match id and invalid scores from anon

- **Binding:** `submit_match_score` selects the match by joining on `t.share_token = p_token and m.id = p_match_id` (`20261102130000_add_update_tournament_settings.sql:94-99`). With a valid token and another tournament's match id, the call returns `not_found` and inserts nothing (`:101-103`).
- **Bounds:** `results_score_a_check` and `results_score_b_check` require 0–99 (`20261025130000_add_match_results.sql:18-19`). Parameters are typed `int` (`20261102130000_add_update_tournament_settings.sql:84-85`), so a non-integer passed through PostgREST fails the cast. A null score breaks `not null` (`20261025130000_add_match_results.sql:15-16`, code 23502). The endpoint would map that to `server`, not `invalid-score` (`src/lib/services/score-submission.ts:39-41`). That only matters for direct RPC calls, because zod requires both scores (`src/lib/validation/score.ts:11`).
- **Correction to the guidance:** "zod in the endpoint covers it" is correct for the endpoint. But the endpoint isn't the only way in. The RPC is exposed to `anon` through PostgREST, and the anon key is public by design. `SUPABASE_KEY` is the anon key (CI sets it to `ANON_KEY`, `.github/workflows/ci.yml:44-48`). So DB-level tests are the real proof. Smoke's out-of-range step never reaches the DB constraint.

### Existing tests (inspected: `src/**/*.test.ts`, `scripts/smoke.mjs`)

- `src/lib/services/score-submission.test.ts` and `score-correction.test.ts` test only the pure functions that map outcomes and errors to codes. They do not touch Supabase.
- `scripts/smoke.mjs` covers: anon submit (`:150-162`), sequential second submit leaving the score unchanged (`:163-175`), out-of-range via zod (`:176-180`), a malformed or unknown token (`:181-190`), an unknown match (`:191-195`), a cross-tournament match id with the other tournament still unplayed afterwards (`:196-231`), anonymous delete redirecting (`:287-291`), and another owner's delete with the league surviving (`:307-319`). It runs in CI against a production preview and local Supabase (`.github/workflows/ci.yml:29-57`).
- No test anywhere covers concurrency, a non-owner correction, a non-owner or anon settings edit, direct table writes, or direct RPC calls.

### Layer choice: Vitest integration project vs pgTAP

- **Vitest + supabase-js (recommended).**
  - It goes through PostgREST with the anon key, which is exactly the surface an attacker uses. Grants, RLS and the `security definer` checks all apply as they do in production.
  - Concurrency can be tested with `Promise.all` of two RPC calls on separate HTTP requests, so separate DB transactions.
  - It stays in the repository's existing language and test runner.
  - Vitest 5 supports separate `test.projects` with `--project` filtering, so the DB suite can be kept out of the unit run (Context7 `/vitest-dev/vitest/v5.0.3`, guide "projects", checked 2026-11-07).
  - The current config includes every `src/**/*.test.ts` file (`vitest.config.ts:11-12`). A new integration file would be picked up by `npm test`, which runs in the `ci` job without a local Supabase (`.github/workflows/ci.yml:22`). That's why it needs its own project or file pattern.
- **pgTAP (`supabase test db`, files in `supabase/tests/`, each test wrapped in a transaction and rolled back; Context7 `/supabase/cli/v2.121.0`, checked 2026-11-07).**
  - It's well suited to asserting the policy catalog and fast role switching.
  - It can't test real concurrency, because a single transaction holds one session.
  - It skips PostgREST grants exposure.
  - It adds SQL test conventions the repository doesn't have yet.
  - It's fine as a later addition, but not the cheapest real signal for these three risks.
- **Fixtures without a service role:** sign up two users with the anon client (`enable_confirmations = false`, `supabase/config.toml:209`). The owner creates a league with the `create_league` RPC, which is granted to `authenticated` (`20261023120000_create_league_schema.sql:189-190`). The owner reads the share token from `tournaments` under `tournaments_select_own`, and match ids from `matches`. Each test uses fresh users and leagues, so no teardown is needed for correctness.

### Misleading hot-spot evidence

- **`src/pages/t` (6 commits/30d):** the share page is read-only rendering. No write rule for #1 or #4 lives there; they're in `supabase/migrations`. Weak evidence for #1 and #4.
- **`src/lib/validation` (9/30d):** zod is a UX layer, not the security boundary for #4 (see above). Churn there doesn't raise the likelihood of a DB-boundary regression.
- **`supabase/migrations` (6/30d):** this is the strongest real evidence for all three risks. Every guarantee above was introduced or replaced in a migration. `submit_match_score` has been redefined twice (`20261025130000…:45`, `20261102130000…:81`), and each redefinition is a chance to drop the `on conflict` clause or the join.

### Out-of-scope finding (for Phase 2, risk #6)

- `players_insert_own` and `matches_insert_own` (`20261023120000_create_league_schema.sql:93-112`) are still active. An owner can insert extra players or matches into their own tournament directly through PostgREST after it's created. That would break the PRD non-goal "no changes to the player list after creation" and the exactly-once guardrail: a new player has no matches. Only the owner can do this, so it isn't an abuse path for #2. Phase 2 should either test it or decide it's accepted.

## Code References

- `supabase/migrations/20261102130000_add_update_tournament_settings.sql:81-120` - current `submit_match_score` (FOR SHARE lock, token join, write-once insert, grants to anon)
- `supabase/migrations/20261102130000_add_update_tournament_settings.sql:19-75` - `update_tournament_settings` (owner check, points lock, revoked from anon)
- `supabase/migrations/20261025130000_add_match_results.sql:13-36` - `results` table, 0–99 checks, RLS select policy
- `supabase/migrations/20261102120000_add_results_owner_update_policy.sql:10-26` - owner-only correction policy and column grant
- `supabase/migrations/20261025140000_add_tournament_delete_policy.sql:8-10` - owner-only delete policy
- `supabase/migrations/20261023120000_create_league_schema.sql:74-112,189-190` - base RLS, insert policies, `create_league` grants
- `src/pages/api/scores.ts:31-71` - anonymous endpoint: zod, then RPC, then outcome redirect
- `src/pages/api/leagues/[id]/scores.ts:33-64` - correction endpoint: match-in-league lookup, RLS update, 0 rows meaning not found
- `src/pages/api/leagues/[id]/settings.ts:59-79` - settings endpoint: RPC status mapping
- `src/pages/api/leagues/[id]/delete.ts:20-32` - delete endpoint: 0 rows meaning not found
- `src/lib/validation/score.ts:8-28` - zod score rules (0–99 integers)
- `scripts/smoke.mjs:150-231,287-319` - existing endpoint-level coverage
- `vitest.config.ts:11-12` - single include pattern `src/**/*.test.ts`
- `.github/workflows/ci.yml:22,29-57` - unit tests in the `ci` job without a DB; local Supabase only in `smoke`

## Architecture Insights

- **The only anonymous paths are two `security definer` RPCs** (`get_shared_league`, `submit_match_score`), plus default table grants that RLS neutralizes because there are no anon policies. A `security definer` function skips RLS, so in those two functions the token join is the whole access check.
- **Organizer authorization uses three patterns:** an RLS policy (delete), RLS plus a column grant (correction), and an owner check inside a definer RPC (settings). A test suite has to cover each one. Passing on one says nothing about the others.
- **A write refused by RLS returns success with 0 rows, not an error.** The endpoints already handle this with `.select()` and a row count. The tests need the same discipline.

## Historical Context (from prior changes)

- `context/archive/2026-10-16-create-league-with-fixtures/plan.md:383`: "RLS isolation verified manually … automated DB tests (pgTAP) deferred". **Supported:** the only RLS coverage is still smoke's endpoint-level delete check.
- `context/archive/2026-11-02-organizer-score-correction/plan.md:211`: "The ownership rule has no automated regression test". **Supported:** no test exercises `results_update_own` for a non-owner.

## Related Research

- Not applicable. No earlier `research.md` covers DB-level tests.

## Open Questions

- What error code does anon get when calling `update_tournament_settings`? Expected 42501 or a PostgREST permission error. Check on the first run, and assert "error present and data unchanged" rather than an exact code if it turns out to vary.
- CI wiring (running the integration project in the `smoke` job, which already has local Supabase) is test-plan Phase 4. Phase 1 may still add a local `npm run test:integration` script.
