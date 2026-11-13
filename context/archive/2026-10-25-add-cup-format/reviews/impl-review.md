<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Add cup (knockout) format

- **Plan**: context/changes/add-cup-format/plan.md
- **Scope**: Full plan (Phases 1-5 of 5)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Success Criteria: every Automated row passed on re-run (428 unit, 73 integration, 3 e2e, `astro check` 0 errors, full lint, smoke incl. cup steps). Manual rows 1.3-1.5, 2.5-2.6, 3.5-3.6, 4.6-4.9, 5.6-5.7 are unchecked and pending the user.

## Findings

### F1 — Stale winner can be advanced when a correction races a first score

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261112120000_add_cup_format.sql:221-226 (and the trigger at 290-295)
- **Detail**: `submit_match_score` reads the match slots and locks only the tournament row (`for share of t`) in one statement. If the owner's correction rewrites the next match's slot while a link holder submits that match's first score, the submit keeps the stale slot value (READ COMMITTED re-checks only the locked row). The match is then scored and the stale player advances, while the corrected winner is dropped. Reported by review, not reproduced.
- **Fix**: Lock the tournament row in its own statement first, then read the match row (or lock `t, m`); use the same order in the trigger. Add an integration test that interleaves a correction and a first score.
  - Strength: Closes the stale-read window without changing statuses or payloads.
  - Tradeoff: The migration is already in the branch, so this is a second edit to an unreleased migration (fine until merged) plus a test that is hard to make deterministic.
  - Confidence: MED — the READ COMMITTED behaviour is standard, but the exact interleaving was not run.
  - Blind spot: Not reproduced against local Postgres.
- **Decision**: FIXED (lock-first order in submit_match_score and trigger; verified by code review only, race not reproduced)

### F2 — Self-referencing FK `matches.next_match_id` has no index

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261112120000_add_cup_format.sql:27
- **Detail**: With `on delete cascade` and no index, every row deleted by a tournament delete scans `matches` for referencing rows; Supabase's unindexed-FK advisor flags it.
- **Fix**: `create index on public.matches (next_match_id) where next_match_id is not null;` in the migration.
- **Decision**: FIXED (partial index on matches.next_match_id)

### F3 — Roadmap S-08 status inconsistent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:51 vs :192
- **Detail**: At-a-glance and body say `in-progress`, the Backlog Handoff row still says `planning`.
- **Fix**: Set the Backlog Handoff row to `in-progress`.
- **Decision**: FIXED (roadmap handoff row set to in-progress)

### F4 — Test-plan Phase 5 note is stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:191 (§6.6) and the §3 Phase 5 row
- **Detail**: The note says the seed, smoke and e2e halves are still open; commit a8d7cc0 delivered them. The row status is `in-progress`.
- **Fix**: Update the note to say all three landed, name the two e2e break-proofs (draw error mapping, next-slot rendering) and set the row to `complete` once the user confirms the manual rows.
- **Decision**: FIXED (test-plan Phase 5 note updated)

### F5 — Bracket columns are not tied together by constraints

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261112120000_add_cup_format.sql:25-35
- **Detail**: Nothing enforces that `next_match_id` points into the same tournament, or that `next_match_id` and `next_slot` are both null or both set. Not exploitable today (only `create_cup` writes them, no UPDATE policy on matches).
- **Fix**: Add a composite FK `(tournament_id, next_match_id)` to `matches (tournament_id, id)` and `check ((next_match_id is null) = (next_slot is null))`.
- **Decision**: FIXED (composite FK, unique (tournament_id, id), next-link check)

### F6 — Trigger locks the tournament FOR UPDATE even for league corrections

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261112120000_add_cup_format.sql:290-295
- **Detail**: The lock is taken before the `format <> 'cup'` early return, so league corrections now serialise against anonymous submissions and settings edits. No deadlock found, but it is needless contention on the league path.
- **Fix**: Read the format without a lock first; lock only for cups.
- **Decision**: FIXED (trigger reads format unlocked, locks only for cups)

### F7 — Cup draw vs range failure is told apart by message text

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/score-correction.ts (DRAW_MESSAGE)
- **Detail**: Both are 23514; rewording the trigger message would silently turn a draw refusal into "invalid-score".
- **Fix**: Give the draw refusal its own errcode or hint and map on that.
- **Decision**: FIXED (P0001 + hint cup_draw_not_allowed, mapped in score-correction.ts)

### F8 — Crafted settings POST can edit a cup's points; raw DB messages reach the user

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/leagues/[id]/settings.ts; src/pages/api/leagues/index.ts (cupError.message)
- **Detail**: Only the form hides cup points, so a crafted POST changes the unused 0/0/0 (harmless). `create_cup` 22023 messages can be shown verbatim, as the league branch already does for its errors.
- **Fix**: Accepted as-is, or map 22023 to a generic message.
- **Decision**: ACCEPTED (harmless; cup UI never reads points; same raw-message behaviour as the league branch)

### F9 — `create_cup` stages the bracket in a temp table

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20261112120000_add_cup_format.sql:93-97, 187
- **Detail**: Temp tables churn catalog tables on a pooled connection; production role TEMP privilege was not verified. Correct as written.
- **Fix**: Replace with `jsonb_to_recordset` CTEs, or confirm TEMP privilege on production before the release.
- **Decision**: ACCEPTED (works locally; production TEMP privilege still to be confirmed before release)
