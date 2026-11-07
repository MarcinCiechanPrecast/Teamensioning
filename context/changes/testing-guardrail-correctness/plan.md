# Guardrail Correctness from Stored Data — Implementation Plan

## Overview

This is rollout Phase 2 of `context/foundation/test-plan.md`. It proves three PRD guardrails on **persisted data**, not only on pure functions:

- the leaderboard built from stored results matches a table computed by hand from the PRD rules, with the tournament's own points, tiebreaks and corrections (risk #3);
- points cannot change once a score exists, while renaming still works (risk #5);
- the database itself refuses a duplicate case-insensitive name, a wrong or repeated pairing, and rows added to a league after creation (risk #6).

Research found one real defect (`research.md` §Summary, risk #6): the owner can insert players and matches into an existing league directly. The plan writes the failing test first, then fixes it with a backward-compatible migration.

## Current State Analysis

- The leaderboard has one path: `get_shared_league` (anon) → `toSharedLeague` → `computeStandings`, recomputed on every request, no cache (`research.md` §Risk #3).
- `standings.test.ts` covers the basics with hand-written expectations; it misses middle-of-table shared ranks, tiebreaks inside negative goal difference, players with no games, and degenerate points settings (1/1/0, 0/0/0). Nothing tests stored rows → leaderboard.
- The points lock lives inside `update_tournament_settings` (`20261102130000_add_update_tournament_settings.sql:57-68`). No test exercises `points_locked`.
- Name uniqueness and pair uniqueness are DB constraints; pair count and player count are checks inside `create_league`. All were verified by hand only (`context/archive/2026-10-16-create-league-with-fixtures/plan.md`).
- `players_insert_own`, `matches_insert_own` and `tournaments_insert_own` let the owner write rows outside `create_league`.

## Desired End State

- `npm test` includes new standings edge cases; `npm run test:integration` includes three new files (leaderboard, points lock, league invariants) and passes.
- Each new DB test has been shown red by a mutation of the real protection.
- A migration freezes a league's players and matches after creation; `create_league` keeps working for the deployed Worker.
- Test-plan §6.1 and §6.4 explain how to add the next test of this kind; §6.6 has a Phase 2 note.

### Key Discoveries:

- `computeStandings` order: points → GD → GF → name → id; rank is competition rank (`src/lib/services/standings.ts:7-63`).
- `get_shared_league` returns per-tournament points and null scores for unplayed matches (`20261025130000_add_match_results.sql:110-155`).
- A correction can never null a result or delete it (`20261102120000_add_results_owner_update_policy.sql:25-26`; no DELETE policy), so the lock cannot be re-opened.
- The lock race is not observable from outcomes (`research.md` §Summary); not tested.
- `create_league` is `security invoker` and depends on the three insert policies (`20261023120000_create_league_schema.sql:124`).

## What We're NOT Doing

- No e2e or endpoint tests; the shared page is a thin wrapper over the three functions the integration test composes.
- No concurrency test for the points lock (not observable).
- No CI wiring (test-plan Phase 4).
- No changes to `computeStandings` or the endpoints unless a test proves a defect.
- No re-test of the fixture generator (`fixtures.test.ts` owns it) and no zod-level tests.

## Implementation Approach

- **Oracle:** every expected table, status and error class is computed by hand from the PRD (FR-003, FR-007, FR-008, FR-013, Guardrails 1–2, Non-Goals) and written as literals in the test, with the arithmetic in a comment.
- **Integration composition = the page.** The leaderboard test calls `get_shared_league` as anon and runs the same `toSharedLeague` → `computeStandings` the page runs.
- **Non-default points.** The main league uses 5/2/1, so a hard-coded 3/1/0 anywhere on the path changes the result. A twin league with 3/1/0 and the same scores proves settings are read per tournament.
- **Refusal = error/0 rows + owner read-back + control** (test-plan §6.2).
- **Mutation checks** patch the local DB in place with `psql` (via `docker exec`) and restore from the migration file immediately.

## Critical Implementation Details

- The fixture helper `createLeagueAs` gains an optional points argument; the default stays 3/1/0 so Phase 1 tests are untouched.
- Scores are oriented: a helper resolves a match by player names and swaps the score when the named pair is stored as (b, a).
- The fix migration must stay backward compatible: same `create_league` signature and grants; only the security mode and the policies change.

## Phase 1: Standings Edge Cases (Unit, Risk #3)

### Overview

Pin the PRD ordering rules where the current tests are thin.

### Changes Required:

#### 1. `src/lib/services/standings.test.ts`

New tests, all hand-computed:

- points beat goal difference (a 3-point player with GD −4 ranks above a 1-point player with GD −1);
- shared rank in the middle of the table (1, 2, 2, 4);
- a player with no games (GD 0) ranks above level-on-points players with negative GD; GD then GF tiebreak inside negative GD;
- 1/1/0 settings (win = draw) and 0/0/0 settings (order purely by GD then GF).

### Success Criteria:

#### Automated Verification:

- `npm test` passes; `npm run lint` passes.

#### Manual Verification:

- Mutation: rank counted with "ahead or level" instead of "strictly ahead", and GF tiebreak removed — named tests go red.

## Phase 2: Stored Results → Leaderboard (Integration, Risk #3)

### Overview

Store results through the real write paths and compare the computed table to a hand-computed one, before and after a correction.

### Changes Required:

#### 1. `src/test/integration/fixtures.ts`

`createLeagueAs` / `leagueCleanup().create` accept optional points.

#### 2. `src/test/integration/leaderboard-from-stored-results.integration.test.ts`

- 4 players, 5/2/1, five of six matches scored via `submit_match_score` as anon, one left unplayed: full table equals the hand-computed one (Bob and Ann level on points and GD, split by GF).
- Same five scores in a 3/1/0 league: different points and a shared rank 2 — points come from each tournament.
- Owner corrects one match: the next read shows the hand-computed new table (order and a GD tiebreak change).

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` passes.

#### Manual Verification:

- Mutation: `get_shared_league` returning hard-coded 3/1/0 points turns the 5/2/1 test red.

## Phase 3: Points Lock (Integration, Risk #5)

### Overview

Prove the lock at the write boundary (the RPC), not in the form.

### Changes Required:

#### 1. `src/test/integration/points-lock.integration.test.ts`

- Control: before any score, the owner changes points.
- After one score: changing points returns `points_locked` and the whole row is unchanged.
- After a score: rename with null points and rename with the same points both succeed; points unchanged.
- After a correction the lock still holds; the owner cannot delete a result or null a score to re-open it.
- A score in another tournament does not lock this one.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` passes.

#### Manual Verification:

- Mutation: the `exists (results …)` clause removed from `update_tournament_settings` → lock tests red.
- Mutation: the tournament filter removed from that clause → "other tournament" test red.

## Phase 4: League Invariants and Post-Creation Freeze (Integration + Migration, Risk #6)

### Overview

Call `create_league` directly with input the app would never send, and prove the DB refuses it with nothing stored. Then prove a league's rows are frozen after creation — this test is expected red first.

### Changes Required:

#### 1. `src/test/integration/league-invariants.integration.test.ts`

- Duplicate names differing by case or surrounding whitespace → 23505, nothing stored; distinct names control.
- 3–20 players: 2 and 21 refused (22023).
- Pair count n(n−1)/2 − 1 and + 1 refused (22023); right count with a repeated pair or a reversed duplicate refused (23505); a self-pair refused (23514); nothing stored.
- A stored 5-player league has exactly 10 matches covering every unordered pair once.
- After creation, the owner cannot insert a player or a match, nor a bare tournament; counts unchanged.

#### 2. `supabase/migrations/20261107120000_freeze_league_rows_after_creation.sql`

- `create_league` becomes `security definer` with an explicit `auth.uid()` check and `owner_id`, same signature, same grants.
- Drop `tournaments_insert_own`, `players_insert_own`, `matches_insert_own`.
- Applied locally with `psql` (not `db reset`) and recorded in `supabase_migrations.schema_migrations`.

### Success Criteria:

#### Automated Verification:

- Post-creation test red before the migration, green after; `npm run test:integration` passes; smoke unaffected (`create_league` contract unchanged).

#### Manual Verification:

- Mutations: drop `players_tournament_id_lower_name_key`, drop `matches_tournament_id_pair_key`, remove the fixture-count check — matching tests red; restore.

## Phase 5: Cookbook and Docs

### Changes Required:

- Test-plan §3 row 2 → complete with folder; §6.1 edge-case guidance; §6.4 pattern; §6.6 Phase 2 note.
- `AGENTS.md`: none needed unless a command changes.

### Success Criteria:

- No `TBD — see §3 Phase 2` placeholders remain; Prettier clean.

## Testing Strategy

### Unit Tests:

- `standings.test.ts` edge cases (Phase 1).

### Integration Tests:

- Three new files under `src/test/integration/`, fresh users and leagues per run, owner cleanup in `afterAll`.

## Migration Notes

- Backward compatible: the deployed Worker only calls `create_league`, whose signature, grants and error codes (23505 for duplicate names) are unchanged. Dropping insert policies removes a path no code uses.

## References

- Research: `context/changes/testing-guardrail-correctness/research.md`
- Phase 1: `context/changes/testing-db-authorization-write-integrity/`
- PRD: `context/foundation/prd.md` FR-003, FR-007, FR-008, FR-013, Guardrails, Non-Goals

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Standings Edge Cases (Unit, Risk #3)

#### Automated

- [x] 1.1 Unit suite passes: `npm test` — 6b86a26
- [x] 1.2 Lint passes: `npm run lint` — 6b86a26

#### Manual

- [x] 1.3 Mutation check: rank and GF tiebreak mutations fail named tests — 6b86a26

### Phase 2: Stored Results → Leaderboard (Integration, Risk #3)

#### Automated

- [x] 2.1 Integration suite passes: `npm run test:integration` — 22df2b3

#### Manual

- [x] 2.2 Mutation check: hard-coded 3/1/0 in `get_shared_league` fails the 5/2/1 test — 22df2b3

### Phase 3: Points Lock (Integration, Risk #5)

#### Automated

- [x] 3.1 Integration suite passes: `npm run test:integration` — d55ae43

#### Manual

- [x] 3.2 Mutation check: lock clause removed fails the lock tests — d55ae43
- [x] 3.3 Mutation check: tournament filter removed fails the other-tournament test — d55ae43

### Phase 4: League Invariants and Post-Creation Freeze (Integration + Migration, Risk #6)

#### Automated

- [x] 4.1 Post-creation test red before the migration — 0adf2d2
- [x] 4.2 Integration suite passes after the migration: `npm run test:integration` — b0956a0
- [x] 4.3 Unit suite and lint pass — b0956a0

#### Manual

- [x] 4.4 Mutation checks: name index, pair index, fixture-count check — b0956a0

### Phase 5: Cookbook and Docs

#### Automated

- [x] 5.1 No `TBD — see §3 Phase 2` placeholders remain in test-plan §6
- [x] 5.2 Prettier is clean for the edited markdown

#### Manual

- [x] 5.3 A reader can add a guardrail test from §6.4 alone
