# Add cup (knockout) format Implementation Plan

## Overview

Add a single-elimination cup as a second tournament format next to the round-robin league. An organizer picks "League" or "Cup" when creating a tournament. A cup has 3–20 players seeded by entry order, byes for the top seeds when the count is not a power of two, no draws, no third-place match, and winner advancement into the next round. Link holders enter scores through the existing share link; the shared page shows a bracket instead of standings. A score correction is refused once the winner has already played the next round.

Docs come first (PRD amendment, roadmap milestone, test-plan risks), so the tests have a written oracle (frame.md: "start from a PRD amendment").

## Current State Analysis

The data model, write paths and views are hard-wired to a league (frame.md, Hypothesis Investigation). Settled upstream: the cup is a new format, not an extension of standings; it is sequenced after M-1, which is now done.

### Key Discoveries:

- `matches.player_a_id` / `player_b_id` are NOT NULL with composite FKs to `players(tournament_id, id)`, a unique `(tournament_id, position)` and a unique pair index that ignores NULLs (`20261023120000_create_league_schema.sql:49-68`). Dropping NOT NULL is deployment-safe; composite FKs skip NULL.
- `results` is write-once (PK = `match_id`), scores 0–99, draws allowed (`20261025130000_add_match_results.sql:13-20`). A table CHECK against draws would break league data, so "no draws" lives in the cup branch only.
- `submit_match_score` is `security definer`, granted to anon, takes `for share of t` on the tournament row, inserts with `on conflict (match_id) do nothing`, and returns `created | already_entered | not_found` (`20261102130000_add_update_tournament_settings.sql:99`). Winner advancement fits inside that lock.
- Since the freeze migration there are no INSERT policies on `tournaments`/`players`/`matches`; every creation path must be a `security definer` RPC with an explicit `auth.uid()` check (`20261107120000_freeze_league_rows_after_creation.sql`; test-plan §6.6 Phase 2). The same note says to run a patched function as `create or replace`.
- Score correction is a direct owner `UPDATE results` through RLS, columns limited to `score_a, score_b` (`20261102120000_add_results_owner_update_policy.sql`). There is no RPC to hook, so the "next round played" rule needs a trigger.
- `get_shared_league` returns `{league:{name,points_*}, players, matches[{id,position,player_a_id,player_b_id,score_a,score_b}]}`; `toSharedLeague` requires numeric `points_*` (`src/lib/services/shared-league.ts`). New keys are additive; existing keys must stay.
- `src/pages/api/leagues/index.ts` calls `generateFixtures` then `create_league`; `src/pages/t/[token].astro` and `src/pages/leagues/[id].astro` are standings/fixture-list pages; `check:ui` scans only dashboard views (`scripts/check-ui-literals.mjs`).
- CI `migration-upgrade` rejects edited/renamed/deleted released migrations and a new one that sorts before `20261107120000`; it seeds with the previous release's `scripts/seed-db.mjs` and runs the previous release's smoke against the new schema (`.github/workflows/pr.yml:100-152`).
- Lessons (`lessons.md`): no new dependencies without a reason (no bracket library); env via `astro:env/server`.

## Desired End State

An organizer can create a cup with 3–20 players, share the link, and link holders enter scores until a champion is shown. Verification: the bracket for N players has N−1 matches, seed 1 and 2 can only meet in the final, byes go to the top seeds, a draw is refused, entering a winner fills the next slot, and a correction that would change a winner who already played is refused. The league flow, its tests and the previous release's smoke still pass unchanged. PRD v3, the roadmap and the test plan describe the cup.

## What We're NOT Doing

- Group→knockout, Swiss, double elimination, third-place match, random or organizer-set seeding, re-seeding.
- Per-cup points settings (cups store 0/0/0 to satisfy NOT NULL; the points fields are not shown).
- Player-list changes after creation (still a PRD Non-Goal), link rotation, score history.
- Renaming `league` identifiers, routes or tables (`/leagues/[id]` serves both formats).
- Editing a cup's points; the edit form shows the name only for a cup.
- Migrating the remaining views to design tokens (new cup component uses tokens, nothing else is migrated).
- Dropping or changing `create_league` or any existing RPC signature.

## Implementation Approach

One additive migration; cup creation is a new RPC (`create_cup`), the score write is a cup branch inside the existing `submit_match_score`, correction is guarded by a trigger on `results`, and `get_shared_league` gains format and bracket keys. The bracket is computed by a pure TypeScript generator and sent to `create_cup` as JSON, mirroring how `generateFixtures` feeds `create_league`. Order: docs, generator, DB, app, test gates — the DB lands before the app code that depends on it.

Bracket model: `S` = smallest power of two ≥ N, byes = S − N, given to seeds 1..byes (seed = entry order). Round-1 rows exist only for real pairings; a bye player is written directly into their round-2 slot. Later-round rows start with NULL slots. Each match has `round`, a global `position` (round 1 first, final last) and `next_match_id` plus `next_slot` (`a`/`b`). Standard bracket placement keeps seeds 1 and 2 in opposite halves. Total matches = N − 1.

## Phase 1: Docs and test-plan amendment

### Overview

Write down the cup rules before any code: PRD v3, a roadmap milestone, and new cup risks in the test plan.

### Changes Required:

#### 1. PRD amendment

**File**: `context/foundation/prd.md`

**Intent**: Bump to version 3 and describe the cup: format picker, the five settled rules, bracket view, correction rule. Replace the "No formats other than league" Non-Goal with "no group→knockout or Swiss".

**Contract**: FR-002 revised (picker: league | cup). New FRs: cup creation (3–20 players, entry-order seeding, byes for top seeds); bracket generation (N−1 matches, no third place); cup score entry (write-once, no draws, winner advances); cup correction (refused once the winner played the next round); bracket view for link holders. Business Logic and Access Control keep the admin vs link-holder model.

#### 2. Roadmap milestone

**File**: `context/foundation/roadmap.md`

**Intent**: Close M-1 (every slice is done) and open M-2 with this change as slice S-08, via `/10x-roadmap`.

**Contract**: `At a glance` row with Change ID `add-cup-format`, PRD refs to the new FRs, status `planning`; Parked list no longer carries "cup" or "format picker".

#### 3. Test-plan refresh

**File**: `context/foundation/test-plan.md`

**Intent**: Run `/10x-test-plan --refresh` so the plan has the cup risks and a phase for them before tests are written.

**Contract**: §2 gains risk #8 (a score or correction corrupts the bracket: draw accepted, winner in the wrong slot, a correction after the next round was played) and #9 (a cup is stored with a wrong bracket: missing match, a player twice in one round, seeds 1 and 2 in the same half, byes not on top seeds). §3 gains a Phase 5 row (cup coverage) covering #8, #9 and a browser cross-check; §5 and §7 stay consistent.

### Success Criteria:

#### Automated Verification:

- Docs formatted: `npx prettier --check context/foundation/prd.md context/foundation/roadmap.md context/foundation/test-plan.md`
- Old Non-Goal gone: `grep -n "No formats other than league" context/foundation/prd.md` prints nothing

#### Manual Verification:

- PRD v3 states all five cup rules and the bracket view, and each FR has a testable acceptance statement
- Roadmap shows M-2 with `add-cup-format` as `planning` and M-1 closed
- Test plan §2 lists risks #8 and #9 with expected outcomes written in PRD terms, and §3 has the new phase row

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Bracket generator

### Overview

A pure, unit-tested function that turns a player count into the bracket, written test-first.

### Changes Required:

#### 1. Generator

**File**: `src/lib/services/bracket.ts`

**Intent**: Build the single-elimination structure for N players (3–20) using entry order as seed, standard placement, byes to the top seeds.

**Contract**: `generateBracket(playerCount: number): BracketMatch[]` where each `BracketMatch` is `{ round, position, a: number | null, b: number | null, nextPosition: number | null, nextSlot: "a" | "b" | null }`; `a`/`b` are 0-based player indexes (seed order), null = filled later by advancement. `position` is global and 1-based (round 1 first, final last). Length is `playerCount - 1`. Throws on counts outside 3–20.

#### 2. Types

**File**: `src/types.ts`

**Intent**: Add `BracketMatch` next to `FixturePair`.

**Contract**: exported type exactly as above.

#### 3. Unit tests

**File**: `src/lib/services/bracket.test.ts`

**Intent**: Prove the structure for every N in 3–20, not just a few examples.

**Contract**: expectations worked out by hand from the PRD cup FRs and written in comments, never copied from the function's output. For N = 3..20: N−1 matches, unique positions, every non-final match links to exactly one later slot and every slot is fed once, one final, each player appears exactly once as a seed across round 1 and bye placement, byes = S−N and they go to seeds 1..byes, seeds 1 and 2 can only meet in the final. Hand-computed full tables for N = 4, 5, 6, 8.

#### 4. Mutation scope

**File**: `stryker.config.json`

**Intent**: Include the new service in `mutate` (CLAUDE.md: selective mutation on risk-critical modules).

**Contract**: add `src/lib/services/bracket.ts` to the `mutate` array.

### Success Criteria:

#### Automated Verification:

- Generator tests pass: `npx vitest run --project unit src/lib/services/bracket.test.ts`
- Whole unit suite passes: `npm test`
- Linting passes: `npm run lint`
- Narrow mutation run completes: `npx stryker run --mutate "src/lib/services/bracket.ts"`

#### Manual Verification:

- Surviving mutants reviewed one by one; an assertion added only where the mutant is a user-visible bracket bug
- The N = 5 and N = 6 tables match a hand-drawn bracket

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Database

### Overview

One additive migration that makes the schema cup-capable without changing any league behaviour.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261112120000_add_cup_format.sql`

**Intent**: Add the format and bracket columns, the cup creation RPC, the cup branch of the score write, the correction trigger and the extended shared read. New file only; no released migration is touched.

**Contract**:

- `tournaments.format text not null default 'league' check (format in ('league','cup'))`.
- `matches`: `round int`, `next_match_id uuid` (FK to `matches(id)` on delete cascade), `next_slot text check in ('a','b')`; `player_a_id` / `player_b_id` drop NOT NULL; new CHECK `round is not null or (player_a_id is not null and player_b_id is not null)` so league rows still require both players. The pair index and `a<>b` check stay.
- `create_cup(p_name text, p_players text[], p_bracket jsonb) returns uuid`: `security definer`, `auth.uid()` explicit check (42501), granted to authenticated only, revoked from public and anon. Raises 22023 for 3–20 players out of range, `jsonb_array_length(p_bracket) <> n - 1`, a bad index, or inconsistent next links; duplicate names raise 23505 (existing index). Stores points 0/0/0 and format `cup`; inserts players, then matches, then links `next_match_id` in a second pass.
- `submit_match_score` replaced with `create or replace` (grants kept): the league branch is unchanged; for a cup it returns `not_ready` when either slot is NULL and `draw_not_allowed` when `p_score_a = p_score_b`, otherwise inserts the result and writes the winner into the next match's slot under the same `for share` lock, returning `created`. `already_entered` and `not_found` keep their meaning.
- Trigger on `results` (BEFORE UPDATE, `security definer` because the owner has no UPDATE policy on `matches`): for a cup, refuse a draw (23514); if the winner is unchanged allow; if it changed and the next match has a result, raise a refusal with a stable message/code the app maps to "next round already played"; otherwise rewrite the next match's slot with the new winner. League results are untouched.
- `get_shared_league` replaced with `create or replace`: all existing keys stay; adds `league.format`, and per match `round` and `next_match_id`; player ids may be null for cups.

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate from the local database so `create_cup`, `format` and the new match columns type-check.

**Contract**: regenerated by the project's existing method; no hand edits.

### Success Criteria:

#### Automated Verification:

- Migration applies on a running local database: `npx supabase migration up --local`
- New file sorts after the newest released one: `ls supabase/migrations | sort | tail -2`
- League behaviour unchanged, existing integration suite green: `npm run test:integration`
- Types in sync: `npx astro check`

#### Manual Verification:

- Migration diff shows no edit to a released migration and the league branch of `submit_match_score` and `get_shared_league` is functionally identical
- A quick local call to `create_cup` as an authenticated user with 5 players returns an id and 4 matches, and anon cannot call it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: App

### Overview

Wire the format picker, creation, bracket views and error mapping to the new database surface.

### Changes Required:

#### 1. Validation

**File**: `src/lib/validation/league.ts`

**Intent**: Add a cup creation schema (name + players only; 3–20, case-insensitive unique) and a discriminated union on `format` so the form and endpoint share it. League schema behaviour unchanged.

**Contract**: `createTournamentSchema` = union of the existing league schema (`format: "league"`) and `{ format: "cup", name, players }`.

#### 2. Create endpoint and form

**Files**: `src/pages/api/leagues/index.ts`, `src/components/leagues/CreateLeagueForm.tsx`, `src/pages/leagues/new.astro`

**Intent**: A format radio (League default, Cup); points fields hidden for a cup. The endpoint branches: cup calls `generateBracket` then `create_cup`; league path unchanged. Success redirects to `/leagues/{id}` for both.

**Contract**: form field `format` = `league | cup`; a missing field means league, so an old form post still works.

#### 3. Shared data and error mapping

**Files**: `src/lib/services/shared-league.ts`, `src/lib/services/score-submission.ts`, `src/lib/services/score-correction.ts`, `src/types.ts`

**Intent**: Parse `format`, `round`, `next_match_id` and null slots; map `not_ready`, `draw_not_allowed` and the correction refusal to fixed error codes and user messages. A league payload parses exactly as before.

**Contract**: `SharedLeagueDTO` gains `format` and per-match `round`; `toScoreOutcome` knows the two new statuses; new correction code for "next round played".

#### 4. Bracket view

**Files**: `src/components/cup/Bracket.astro`, `src/pages/t/[token].astro`, `src/pages/leagues/[id].astro`, `src/pages/leagues/[id]/edit.astro`

**Intent**: One bracket component used by the shared page (score entry on ready matches) and the organizer page (correction form on played matches). A cup shows no standings and no points fields; the shared page keeps its link-holder score forms.

**Contract**: markup is the e2e contract — one `<ol aria-label="Round N">` per round, each match an `<li>` containing "A vs B", unfilled slots read "TBD", bye placements read "Bye", score inputs labelled `Score of <name>` as in the league, and a "Champion: <name>" line once the final has a result. Token classes only.

#### 4b. Dashboard label and guard scope

**Files**: `src/components/dashboard/*.astro`, `scripts/check-ui-literals.mjs`

**Intent**: Show a "Cup" label for cups in the tournament list, and add `src/components/cup/*.astro` to the default `check:ui` scope.

**Contract**: dashboard selects `format`; label uses token classes.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (validation union, `toSharedLeague` cup and unchanged league payload, `toScoreOutcome` statuses): `npm test`
- Linting passes: `npm run lint`
- UI guard passes: `npm run check:ui`
- Types pass: `npx astro check`
- Build succeeds: `npm run build`

#### Manual Verification:

- Create a 5-player cup locally: bracket shows 3 byes and one round-1 match, 4 matches in total
- On the share link, entering a winner fills the next slot; a draw shows a clear refusal; entering the final shows the champion
- As organizer, correcting a score is accepted before the next round is played and refused after
- Creating, viewing and scoring a league still works exactly as before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Test gates

### Overview

Cover risks #8 and #9 at the cheapest layer that sees them, then wire the cup into the CI seed, smoke and e2e gates.

### Changes Required:

#### 1. Integration tests

**Files**: `src/test/integration/cup-bracket.integration.test.ts`, `src/test/integration/fixtures.ts`

**Intent**: Prove the DB rules as `anon` and as two authenticated users, following test-plan §6.2–6.4. Add `createCupAs` / `cupCleanup` helpers beside the league ones.

**Contract**: cases — `create_cup` refuses 2 and 21 players, wrong match count and anon; direct inserts into `matches` still refused; first score fills the next slot; a draw returns `draw_not_allowed` with nothing stored; round-2 score before both slots are filled returns `not_ready`; concurrent submissions land once; out-of-range score refused; owner flips a winner before the next round → slot rewritten; flips after the next round was played → refused with owner read-back unchanged; a non-owner correction is 0 rows; a league correction with a draw still works. Expected values come from the PRD cup FRs, not the SQL.

#### 2. Seed and smoke

**Files**: `scripts/seed-db.mjs`, `scripts/smoke.mjs`

**Intent**: Seed and verify a partial and a finished cup; add smoke steps for the cup flow. The seed must skip cup steps when the schema has no `create_cup` (it runs as the previous release's copy first), logging that it skipped.

**Contract**: smoke steps create a cup through `POST /api/leagues` with `format=cup`, open the organizer page and the share page, post a score through `/api/scores`, and check no owner id or token leaks.

#### 3. E2E

**File**: `tests/e2e/cup-flow.spec.ts`

**Intent**: One browser run through `/10x-e2e` — only what the other layers can't see: the rendered bracket with byes and TBD, a winner appearing in the next round for another visitor, and the correction refusal message. Locators by role and label per test-plan §6.5.

**Contract**: header comment lists risk ids #8, #9; unique names per run; non-default expectations worked out by hand.

#### 4. Mutation proof and notes

**File**: `context/foundation/test-plan.md`

**Intent**: Record the mutation checks and the cup cookbook note in §6.6.

**Contract**: mutations that must turn named tests red — draw rejection removed, trigger refusal removed, next-slot write removed, byes given to the wrong seeds.

### Success Criteria:

#### Automated Verification:

- Integration suite passes (new cup file and existing): `npm run test:integration`
- Unit suite passes: `npm test`
- Smoke passes against a running preview: `npm run smoke`
- E2E passes: `npm run test:e2e`
- Seed script parses: `node --check scripts/seed-db.mjs`

#### Manual Verification:

- Each listed mutation was applied locally, turned a named test red, and was reverted
- The pull request's required checks (`ci`, `smoke`, `migration-upgrade`) are green and `e2e` is green

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Generator structure for N = 3..20, hand-computed tables for 4, 5, 6, 8
- Validation union, shared-league parsing for both formats, score outcome mapping

### Integration Tests:

- `cup-bracket.integration.test.ts` as above; existing league suites guard the unchanged league path

### Manual Testing Steps:

1. Create a 5-player cup, share the link, play it to a champion
2. Try a draw and an out-of-order round-2 score
3. Correct a score before and after the next round
4. Create and play a league to confirm nothing changed

## Performance Considerations

At most 19 matches per cup; `get_shared_league` stays a single call. No caching, so a new score shows on the next view.

## Migration Notes

Additive only; existing rows backfill to `format = 'league'`. Cups can exist only after the new Worker deploys, so the old Worker never reads a cup payload. Workers Builds deploys in parallel with `migrate`: if the Worker deploys first, the cup form posts `create_cup` before it exists and fails visibly, with no data written. The previous release's smoke and the seed run against the new schema in `migration-upgrade`.

## References

- Frame brief: `context/changes/add-cup-format/frame.md`
- PRD: `context/foundation/prd.md`; roadmap: `context/foundation/roadmap.md`; test plan: `context/foundation/test-plan.md`
- Similar implementation: `context/archive/2026-10-16-create-league-with-fixtures/plan.md`
- `supabase/migrations/20261107120000_freeze_league_rows_after_creation.sql`, `src/lib/services/fixtures.ts`, `src/pages/api/leagues/index.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Docs and test-plan amendment

#### Automated

- [x] 1.1 Docs formatted: `npx prettier --check context/foundation/prd.md context/foundation/roadmap.md context/foundation/test-plan.md` — efd2690
- [x] 1.2 Old Non-Goal gone: `grep -n "No formats other than league" context/foundation/prd.md` prints nothing — efd2690

#### Manual

- [ ] 1.3 PRD v3 states all five cup rules and the bracket view, and each FR has a testable acceptance statement
- [ ] 1.4 Roadmap shows M-2 with `add-cup-format` as `planning` and M-1 closed
- [ ] 1.5 Test plan §2 lists risks #8 and #9 with expected outcomes written in PRD terms, and §3 has the new phase row

### Phase 2: Bracket generator

#### Automated

- [x] 2.1 Generator tests pass: `npx vitest run --project unit src/lib/services/bracket.test.ts` — 232a3af
- [x] 2.2 Whole unit suite passes: `npm test` — 232a3af
- [x] 2.3 Linting passes: `npm run lint` — 232a3af
- [x] 2.4 Narrow mutation run completes: `npx stryker run --mutate "src/lib/services/bracket.ts"` — 232a3af

#### Manual

- [ ] 2.5 Surviving mutants reviewed one by one; an assertion added only where the mutant is a user-visible bracket bug
- [ ] 2.6 The N = 5 and N = 6 tables match a hand-drawn bracket

### Phase 3: Database

#### Automated

- [x] 3.1 Migration applies on a running local database: `npx supabase migration up --local` — 657c356
- [x] 3.2 New file sorts after the newest released one: `ls supabase/migrations | sort | tail -2` — 657c356
- [x] 3.3 League behaviour unchanged, existing integration suite green: `npm run test:integration` — 657c356
- [x] 3.4 Types in sync: `npx astro check` — 657c356

#### Manual

- [ ] 3.5 Migration diff shows no edit to a released migration and the league branch of `submit_match_score` and `get_shared_league` is functionally identical
- [ ] 3.6 A quick local call to `create_cup` as an authenticated user with 5 players returns an id and 4 matches, and anon cannot call it

### Phase 4: App

#### Automated

- [x] 4.1 Unit tests pass (validation union, `toSharedLeague` cup and unchanged league payload, `toScoreOutcome` statuses): `npm test` — d8389aa
- [x] 4.2 Linting passes: `npm run lint` — d8389aa
- [x] 4.3 UI guard passes: `npm run check:ui` — d8389aa
- [x] 4.4 Types pass: `npx astro check` — d8389aa
- [x] 4.5 Build succeeds: `npm run build` — d8389aa

#### Manual

- [ ] 4.6 Create a 5-player cup locally: bracket shows 3 byes and one round-1 match, 4 matches in total
- [ ] 4.7 On the share link, entering a winner fills the next slot; a draw shows a clear refusal; entering the final shows the champion
- [ ] 4.8 As organizer, correcting a score is accepted before the next round is played and refused after
- [ ] 4.9 Creating, viewing and scoring a league still works exactly as before

### Phase 5: Test gates

#### Automated

- [x] 5.1 Integration suite passes (new cup file and existing): `npm run test:integration`
- [x] 5.2 Unit suite passes: `npm test`
- [x] 5.3 Smoke passes against a running preview: `npm run smoke`
- [x] 5.4 E2E passes: `npm run test:e2e`
- [x] 5.5 Seed script parses: `node --check scripts/seed-db.mjs`

#### Manual

- [ ] 5.6 Each listed mutation was applied locally, turned a named test red, and was reverted
- [ ] 5.7 The pull request's required checks (`ci`, `smoke`, `migration-upgrade`) are green and `e2e` is green
