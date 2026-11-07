---
date: 2026-11-07T15:30:00Z
researcher: Claude (Opus 5.5) for Marcin Ciechan
git_commit: a5eb251
branch: testing-guardrail-correctness
repository: Teamensioning
topic: "Ground test-plan Phase 2: guardrail correctness from stored data (risks #3, #5, #6)"
tags: [research, testing, supabase, standings, leaderboard, points-lock, update_tournament_settings, create_league, rls]
status: complete
last_updated: 2026-11-07
last_updated_by: Claude (Opus 5.5)
---

# Research: Ground test-plan Phase 2 — guardrail correctness from stored data

**Date**: 2026-11-07T15:30:00Z
**Researcher**: Claude (Opus 5.5) for Marcin Ciechan
**Git Commit**: a5eb251 (`origin/master` after Phase 1 merged)
**Branch**: testing-guardrail-correctness
**Repository**: Teamensioning

## Research Question

For risks #3, #5 and #6 of `context/foundation/test-plan.md` §2: find where each guardrail is actually enforced (app vs RPC vs constraint vs policy), verify or correct the Risk Response Guidance, list what existing tests already cover, pick the cheapest layer for each, and flag any current defect.

## Summary

- **Risk #3 — one path from stored rows to the table, no cache.** The leaderboard exists only on the shared page `src/pages/t/[token].astro`. It calls `get_shared_league` as anon (`:23`), parses the payload with `toSharedLeague` (`src/lib/services/shared-league.ts:39-99`) and ranks with `computeStandings` (`src/lib/services/standings.ts:14-63`) on every request (`[token].astro:45`). There is no `Cache-Control`, no memoisation and no stored standings table (`grep -i cache src` finds nothing). So "a correction not reflected on the next view" can only fail if `get_shared_league` returns stale or wrong scores. The owner page `src/pages/leagues/[id].astro` shows no standings.
- **Points are read per tournament.** `get_shared_league` returns `points_win/draw/loss` from the tournament row (`supabase/migrations/20261025130000_add_match_results.sql:121-127`); `toSharedLeague` copies them (`shared-league.ts:91-96`); `computeStandings` uses `league.points_*` (`standings.ts:41-48`). No hard-coded 3/1/0 on this path.
- **Unplayed matches** come back with `score_a`/`score_b` null via a `left join results` (`20261025130000_add_match_results.sql:146`), become `score: null` (`shared-league.ts:22-26`) and are skipped (`standings.ts:52`).
- **Existing unit coverage** (`src/lib/services/standings.test.ts`, 8 tests): zero table, unplayed ignored, one non-default points set (2/1/1), draw, GF/GA/GD, order by points, GD then GF tiebreak, shared rank 1,1,3. **Gaps:** shared rank in the middle of the table (1,2,2,4), tiebreak inside negative goal difference, a player with no games ranking above a player with negative GD on equal points, a three-way tie resolved by both tiebreakers at once, settings where win = draw (1/1/0) or all zero (0/0/0), and `toSharedLeague` → `computeStandings` composition. No test at all for stored rows → leaderboard.
- **Risk #5 — the lock is inside `update_tournament_settings`.** `security definer`, owner check, `for update` lock on the tournament row, then refuses with `points_locked` when points are given, differ from the stored ones, and any result exists for the tournament (`supabase/migrations/20261102130000_add_update_tournament_settings.sql:37-79`). Null points mean "unchanged" (rename-only). `tournaments` has no UPDATE policy, so the RPC is the only write path (Phase 1 already proves the owner's direct update returns 0 rows). The endpoint `src/pages/api/leagues/[id]/settings.ts:62-78` only maps `points_locked` to a message.
- **Can a correction re-open the lock?** No. The owner can only `update (score_a, score_b)` on `results` (`20261102120000_add_results_owner_update_policy.sql:25-26`), both `not null`; there is no DELETE policy on `results` and none on `matches`. A result can only disappear with its tournament (cascade). So "correction to null" is impossible by construction; the test plan's "must challenge" question is answered by the schema, and a test asserts the lock still holds after a correction.
- **Lock race.** `submit_match_score` takes `for share of t` (`20261102130000_add_update_tournament_settings.sql:94-99`) against the settings RPC's `for update`. A lost race (settings sees no result, score commits, settings commits new points) leaves exactly the same final state as the legal order "settings first, then score", so it is **not observable from outcomes** in an integration test. Not tested; recorded as an assumption.
- **Risk #6 — DB invariants exist for name and pairs.** `players_tournament_id_lower_name_key` unique on `(tournament_id, lower(name))` (`20261023120000_create_league_schema.sql:44`); `create_league` trims names (`:154-156`), checks 3–20 players (`:137-140`) and exactly n(n−1)/2 fixtures (`:142-148`); `matches_tournament_id_pair_key` makes every unordered pair unique (`:65-69`); `matches_distinct_players_check` refuses a self-pair (`:56`). The count check alone does not mean "every pair exactly once" — a right-length list with a repeated pair is stopped only by the pair index. Everything runs in one transaction, so any failure leaves no tournament behind.
- **Real gap (defect): post-creation inserts.** `players_insert_own` and `matches_insert_own` (`20261023120000_create_league_schema.sql:93-112`) let the owner add rows to an existing tournament through PostgREST at any time. `create_league` is `security invoker` and needs those policies (`:124`). An extra player has no fixtures, which breaks PRD Guardrail 2 ("every pair meets exactly once") and the PRD non-goal "No changes to the player list after creation". The app never inserts directly (`grep "\.insert(" src` finds only a Phase 1 test). Phase 1 research flagged this for Phase 2 (`context/changes/testing-db-authorization-write-integrity/research.md:96-98`). `tournaments_insert_own` likewise lets an owner create a tournament with zero players, bypassing the 3–20 rule. Owner-only, so not an abuse path, but the DB is supposed to be the last guard for this invariant.

## Detailed Findings

### Risk #3 — stored rows → leaderboard

- Read path: `[token].astro:15-27` → `get_shared_league` (security definer, granted to anon) → `toSharedLeague` → `computeStandings`.
- Ordering: points desc, GD desc, GF desc (`standings.ts:7-9`), then name `localeCompare`, then id (`:57-59`) for a stable display order. Rank is competition ranking: `1 + count of players strictly ahead` (`:60-62`). The PRD only fixes points → GD → GF (FR-008, Output section); the name order for fully level players is a display choice, so tests assert shared rank there, not which name comes first, except where the existing tests already pin alphabetical order.
- Correction path: owner `update results set score_a, score_b` → next `get_shared_league` reads the row (no cache). One integration test proves it end to end.
- The DB allows points 0–99 with `win >= draw >= loss` (`20261023120000_create_league_schema.sql:21-25`), so 1/1/0, 0/0/0 and 5/2/1 are all valid settings.

### Risk #5 — points lock

- Statuses: `updated`, `not_found`, `points_locked`; mixed null/non-null points raise 22023 (`20261102130000_add_update_tournament_settings.sql:37-40`).
- "Same points as stored" counts as unchanged and is accepted after a score (`:57-59` uses `is distinct from`), so a rename that resubmits the same points works — that is how the edit form posts.
- Phase 1 already covers: non-owner/anon settings refusal, owner rename control, direct UPDATE refused for the owner. Phase 2 adds the lock itself.

### Risk #6 — DB invariants

- Expected failure codes (from Postgres semantics, not the app): unique violation 23505 for duplicate names and duplicate pairs; 22023 raised by `create_league` for wrong counts; 23514 check violation for a self-pair.
- Transactionality: `create_league` is one function call → one statement → one transaction. A failure mid-way must leave no tournament; the owner's `tournaments` list proves it.
- Fix options for post-creation inserts:
  1. Drop `players_insert_own`, `matches_insert_own` and `tournaments_insert_own`, and make `create_league` `security definer` with an explicit `auth.uid()` check. Backward compatible: the deployed Worker calls only `create_league` with an unchanged signature.
  2. A trigger that refuses inserts outside the creating transaction. Clever but opaque.
  3. Accept as an owner-only gap. Rejected: the PRD explicitly freezes the player list and the DB is the last guard.

## Code References

- `src/pages/t/[token].astro:15-45` — shared page load and standings
- `src/lib/services/shared-league.ts:22-99` — payload parsing
- `src/lib/services/standings.ts:7-63` — ranking
- `src/lib/services/standings.test.ts` — existing unit coverage
- `supabase/migrations/20261023120000_create_league_schema.sql:34-190` — players/matches constraints, insert policies, `create_league`
- `supabase/migrations/20261025130000_add_match_results.sql:110-155` — `get_shared_league` with scores
- `supabase/migrations/20261102120000_add_results_owner_update_policy.sql` — correction policy and column grant
- `supabase/migrations/20261102130000_add_update_tournament_settings.sql:23-120` — lock and `for share`
- `src/test/integration/fixtures.ts` — Phase 1 helpers (always 3/1/0 points today)

## Open Questions (resolved by assumption — user delegated decisions)

- Post-creation inserts: treated as a defect and fixed (option 1), not accepted.
- Lock race: not tested (not observable from outcomes); the `for share`/`for update` pairing stays a code-review item.
- Display order of fully level players: not part of the PRD oracle; only rank equality is asserted in new tests.
