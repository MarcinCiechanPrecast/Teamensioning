# Organizer score correction Implementation Plan

## Overview

Let the signed-in organizer overwrite an already-entered match score (FR-006, roadmap S-06). The database gets an owner-only `UPDATE` policy on `public.results`, a protected form-POST endpoint performs the overwrite, and the organizer's league page `/leagues/[id]` starts showing scores with an inline correction form on every played match. The next view of the leaderboard (S-05) reflects the correction because standings are always computed from `results`; this slice stores the new score and nothing else.

## Current State Analysis

- `public.results` has no insert, update or delete policy. Its migration says "corrections are added by a later slice" (`supabase/migrations/20261025130000_add_match_results.sql:23-24`). Only `results_select_own` (owner select) exists (`:29-36`).
- `submit_match_score` is the only write path. It is write-once (`on conflict (match_id) do nothing`, `:69-72`) and callable by anon, so link holders can never overwrite. It stays untouched.
- Scores are constrained to integers 0-99 by `results_score_a_check` / `results_score_b_check` (`:17-19`). An out-of-range value raises `23514`.
- The organizer page `src/pages/leagues/[id].astro` never reads `results`: it hardcodes `score: null` (`:58`) and renders only "N. A vs B" (`:86-92`). The organizer cannot see what to correct.
- Organizer routes are protected by prefix: `PROTECTED_ROUTES = ["/dashboard", "/leagues", "/api/leagues"]` (`src/middleware.ts:4`). `src/pages/api/leagues/[id]/delete.ts` is the pattern: check `locals.user`, `createClient`, let RLS decide ownership, treat 0 returned rows as "not found", redirect with a fixed code (`:11-34`).
- The anonymous score flow is the pattern for validation and fixed codes: `src/lib/validation/score.ts` (zod, 0-99, trims, rejects `1e1`/`0x10`), `src/lib/services/score-submission.ts` (code map, `rpcErrorCode`, `validationErrorCode`), and the share page mapping `?error=` to fixed text (`src/pages/t/[token].astro:46-47`).
- `FixtureDTO.score` already exists (`src/types.ts:19-26`).

## Desired End State

The organizer opens `/leagues/[id]`, sees each match with its score (or no score if unplayed), edits the two numbers of a played match inline, presses Save, and lands back on the same page showing the new score and a "Score updated" notice. A non-owner, an unknown match, or a match with no result changes nothing and shows a fixed error. A link holder still cannot overwrite a score.

Verify by: correcting a score as the owner and reloading (new score shown, `results` row changed); attempting the same update as a different signed-in user via PostgREST and getting 0 rows updated.

### Key Discoveries:

- Ownership is already expressed as an RLS pattern in `results_select_own`, which joins `matches` to `tournaments` on `owner_id = (select auth.uid())` (`...add_match_results.sql:29-36`). The new update policy reuses that expression.
- `/api/leagues/*` is protected by the existing prefix, so the new endpoint needs no middleware change.
- `results` has no `tournament_id`; ownership is reached through `matches`. Reading scores for the organizer page means embedding or a second query keyed by `match_id`.

## What We're NOT Doing

- Organizer cannot enter a first score on an unplayed match (no INSERT policy) and cannot clear a result back to unplayed (no DELETE policy). Overwrite only.
- No score-change history or audit trail (PRD Non-Goal): a correction replaces the row.
- No confirmation step before saving a correction.
- No change to `submit_match_score` or to the link-holder flow.
- No leaderboard work (S-05) and no points-lock logic (S-07).
- No regenerated DB types (a policy changes no types).
- No new shadcn/token migration of `/leagues/[id]`. It is not covered by `npm run check:ui`; migrating it stays in the Parked roadmap item.

## Implementation Approach

Three thin layers, database first: policy, then endpoint plus tests, then UI. RLS is the single source of truth for "only the owner". The endpoint never checks ownership itself. It updates with `.select("match_id")` and treats 0 returned rows (non-owner, unknown match, or no result yet) as one outcome, `match-not-found`, exactly as `delete.ts` does for tournaments. The correction reuses the 0-99 validation of the anonymous form, so the two entry points cannot disagree on what a valid score is.

## Phase 1: Owner update policy

### Overview

Allow the tournament owner, and only the owner, to update the score columns of an existing result.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261102120000_add_results_owner_update_policy.sql`

**Intent**: Let an authenticated owner overwrite `score_a` / `score_b` of a result in their own tournament, and nothing else. Use a timestamp distinct from the sibling S-07 change's migration to avoid a filename clash when the branches merge.

**Contract**: `create policy "results_update_own" on public.results for update to authenticated using (<owner exists>) with check (<same owner exists>)`, where `<owner exists>` is the `matches` + `tournaments` join from `results_select_own` (`t.owner_id = (select auth.uid())`). Restrict the writable columns: `revoke update on public.results from authenticated; grant update (score_a, score_b) on public.results to authenticated;`, so `match_id` can never be repointed to another match. No anon policy; no insert/delete policy. Update the header comment of the migration to say corrections are owner-only and overwrite without history.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local database: `npx supabase db reset`
- Lint passes: `npm run lint`

#### Manual Verification:

- As the owner, `update results set score_a = 5 where match_id = ...` through the authenticated PostgREST client changes the row.
- As a different signed-in user, the same update returns 0 rows and the score is unchanged.
- As anon, the update is rejected, and `submit_match_score` still returns `already_entered` for the same match.
- An update to `score_a = 100` fails with check violation `23514`.
- An update to `match_id` is rejected (column not updatable).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

**Execution note**: `supabase db reset` (1.1) was not run because sibling worktrees share the local Supabase. `supabase migration up --include-all` also failed with `LegacyMigrationMissingLocalError`: the shared DB already holds the sibling S-07 migration `20261102130000`, which is absent from this branch (history not repaired, to avoid touching shared state). Instead the migration SQL was run inside a rolled-back transaction on the local DB (nothing persisted) with role and JWT claim switched. That verified 1.3, 1.4, 1.6, 1.7 via SQL, but they stay pending until the human confirms them. Row 1.5 stays pending: the anon update returned 0 rows, but the `already_entered` check was invalid (the token lookup ran as anon and RLS hid it).

---

## Phase 2: Correction endpoint and tests

### Overview

Validate a correction, apply it as the signed-in organizer, and map every outcome to a fixed code, with unit tests for the pure parts.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/validation/score.ts`

**Intent**: Add the input schema of the correction form, reusing the existing 0-99 `score` field so organizer and link-holder entry validate identically.

**Contract**: export `correctScoreSchema = z.object({ matchId: z.uuid("Invalid match"), scoreA: score, scoreB: score })` and `CorrectScoreInput`. No token field; the tournament id comes from the URL path.

#### 2. Outcome and code mapping

**File**: `src/lib/services/score-correction.ts` (new)

**Intent**: Keep the fixed-message codes and outcome mapping out of the route, mirroring `score-submission.ts`, so they can be unit-tested.

**Contract**: `CORRECTION_ERROR_MESSAGES` (`invalid-score`, `match-not-found`, `server`) with `CorrectionErrorCode` and `isCorrectionErrorCode(value)`; a mapper that turns `{ error, rowCount }` into `updated | error(code)` (`23514` → `invalid-score`; other error or 22P02 for a bad uuid → `server` / `match-not-found`; 0 rows → `match-not-found`). Reuse `validationErrorCode` from `score-submission.ts` for zod issues rather than duplicating it.

#### 3. Endpoint

**File**: `src/pages/api/leagues/[id]/scores.ts` (new)

**Intent**: Apply the correction as the signed-in organizer and redirect back to `/leagues/[id]`.

**Contract**: `export const POST: APIRoute`. Reads a form; unauthenticated → `/auth/signin` (as `delete.ts`); invalid input → `/leagues/[id]?error=<code>`; otherwise `supabase.from("results").update({ score_a, score_b }).eq("match_id", matchId).select("match_id")`. 0 rows → `match-not-found`; success → `/leagues/[id]?notice=score-updated`. Raw database errors are logged server-side only (same `console.error` convention as `src/pages/api/scores.ts`); only a fixed code travels in the URL.

#### 4. Unit tests

**File**: `src/lib/services/score-correction.test.ts` (new), `src/lib/validation/score.test.ts` (extend or create alongside existing tests)

**Intent**: Cover the pure logic.

**Contract**: `correctScoreSchema` accepts `0` and `99`, rejects `-1`, `100`, `1.5`, `""`, `1e1`, a non-uuid `matchId`; the mapper returns `updated` for one row, `match-not-found` for 0 rows, `invalid-score` for `23514`, `server` for other errors; `isCorrectionErrorCode` accepts only known codes (including `Object.hasOwn` safety against `__proto__`).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build passes: `npm run build`

#### Manual Verification:

- `POST /api/leagues/<id>/scores` as the owner with valid fields updates the row and redirects with `?notice=score-updated`.
- The same request while signed out redirects to `/auth/signin`.
- The same request as a non-owner redirects with `?error=match-not-found` and changes nothing.
- A request for a match with no result redirects with `?error=match-not-found`.
- Scores `100` and `abc` redirect with `?error=invalid-score`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

**Plan adjustment (review fix)**: the endpoint now first looks up the match with `tournament_id` equal to the path id and treats a miss as `match-not-found`, so the path `[id]` is tied to the match.

**Execution note**: Manual rows 2.5-2.9 were not run (migration not applied to the shared local DB, so the endpoint was not exercised end to end). They stay pending for the human.

---

## Phase 3: Organizer UI

### Overview

Show scores on the organizer's league page and let the organizer correct a played match inline.

### Changes Required:

#### 1. Load results into fixtures

**File**: `src/pages/leagues/[id].astro`

**Intent**: Replace the hardcoded `score: null` with the stored result, so the existing `FixtureDTO.score` is populated for the organizer.

**Contract**: extend the matches read with the match's result (embedded `results(score_a, score_b)` on the matches select, or a second `results` select filtered by the match ids; pick whichever the local PostgREST returns cleanly) and map it into `FixtureDTO.score = { a, b } | null`. RLS (`results_select_own`) already scopes this to the owner.

#### 2. Score display and inline correction form

**File**: `src/components/leagues/OrganizerFixtureList.astro` (new), used from `src/pages/leagues/[id].astro`

**Intent**: Show each fixture's score; for a played match render a small plain HTML form that posts to the new endpoint. Unplayed matches show no form (organizer cannot enter first scores). The markup lives in a new component so the edit to `[id].astro` stays tiny: S-07 (`edit-tournament-settings`) adds one footer anchor to the same page and the two changes must merge without a conflict.

**Contract**: props `{ leagueId: string; fixtures: FixtureDTO[]; errorMessage: string | null; notice: string | null }`; the component renders the alert/status blocks and the fixture `<ol>`. In `[id].astro` replace only the existing `<ol class="mt-6 space-y-2">…</ol>` block with `<OrganizerFixtureList … />`, add its import, and change the loader/frontmatter. Do not touch the footer `<p>` with the "Back to dashboard" / "Delete league" links, and do not re-indent or reformat lines outside those regions. The form is `method="POST" action={`/api/leagues/${leagueId}/scores`}` with hidden `matchId`, number inputs `scoreA` / `scoreB` (`required min="0" max="99" step="1" inputmode="numeric"`, prefilled with the current score, `aria-label` per player as on `src/pages/t/[token].astro:104-126`) and a Save button. Layout must not overlap player names at 375px (name on its own full-width row, as the share page does with `basis-full`; see the archived `share-row-mobile-layout` fix). No client JavaScript.

#### 3. Notice and error messages

**File**: `src/pages/leagues/[id].astro` (frontmatter only) and `OrganizerFixtureList.astro` (rendering)

**Intent**: Map `?error=` and `?notice=` to fixed text only.

**Contract**: in the frontmatter, `isCorrectionErrorCode(searchParams.get("error"))` → `CORRECTION_ERROR_MESSAGES[code]` and `notice === "score-updated"`, passed to the component as `errorMessage` / `notice`; the component renders a `role="alert"` block and a `role="status"` block ("Score updated."). Free text from a crafted URL is never shown. Follow the existing alert styling on the share page.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build passes: `npm run build`
- Unit tests still pass: `npm test`

#### Manual Verification:

- A played match shows its score and a correction form prefilled with it; an unplayed match shows no form.
- Saving a changed score returns to `/leagues/[id]` showing the new score and "Score updated."; reloading keeps it.
- A correction made by the organizer is visible on the share page `/t/<token>` on next load.
- An invalid score shows the fixed error text and leaves the score unchanged.
- The page is usable at 375px: inputs do not overlap player names.
- A link holder still cannot overwrite a score from `/t/<token>`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

**Execution note**: The loader follows the plan's first option: the matches select embeds `results(score_a, score_b)` (one-to-one relation, typed as object or null; `astro check` and build pass). It has not run against a live PostgREST. Manual rows 3.5-3.10 were not run (migration not applied to the shared local DB). They stay pending for the human.

---

## Testing Strategy

### Unit Tests:

- `correctScoreSchema` boundaries: 0, 99, -1, 100, 1.5, empty, `1e1`, bad uuid.
- Outcome mapper: one row, 0 rows, `23514`, generic error.
- `isCorrectionErrorCode` accepts only known codes.

### Integration Tests:

- None automated (decided: unit tests plus a manual RLS check). The ownership rule has no automated regression test; Phase 1 manual verification covers it once against the real policy.

### Manual Testing Steps:

1. Create a league, enter a score through the share link, open `/leagues/[id]` as the owner and correct it.
2. Repeat the correction as a second signed-in user (PostgREST or direct request) and confirm nothing changes.
3. Confirm the share page shows the corrected score and the link holder still sees "already entered" when resubmitting.

## Performance Considerations

None. The organizer page reads at most one extra small result set per load; scale is a handful of matches per league.

## Migration Notes

Additive: one policy and a column-level grant on an existing table; no data migration. Existing `results` rows are untouched. Rollback is dropping the policy and restoring the table-level update grant.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-06), PRD FR-006 and US-01 acceptance criteria
- Write-once table and owner select policy: `supabase/migrations/20261025130000_add_match_results.sql:13-36`
- Organizer write endpoint pattern: `src/pages/api/leagues/[id]/delete.ts:8-35`
- Fixed-code score validation pattern: `src/lib/validation/score.ts`, `src/lib/services/score-submission.ts`
- Share-page score form markup: `src/pages/t/[token].astro:95-136`

## Verification note (integration run, 2026-11-02)

The three open slices (S-05, S-06, S-07) were merged on a throwaway branch and run against a fresh local database (`supabase db reset`, all migrations apply). Manual rows were checked by the agent, not by a human. Phase 1 rows 1.3–1.7 were re-run as the `authenticated` and `anon` roles in a rolled-back transaction: owner update changes the row, other user and anon update 0 rows, `score_a = 100` fails `23514`, `match_id` and `created_at` updates are denied. Phase 2 rows and Phase 3 behaviour ran over HTTP against a built preview (26 checks, repeated 3 times, plus `npm run smoke`): notice, signed-out redirect, non-owner and wrong-tournament `match-not-found`, no first score from the organizer, `100` and `abc` give `invalid-score`, the link holder gets `already-entered` and the stored score is unchanged, and the correction shows on the share page and in the leaderboard. In the browser at 375px the correction forms are prefilled, unplayed matches have no form and nothing overflows. The embedded `results(score_a, score_b)` select returns an object and works against PostgREST.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Owner update policy

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local database: `npx supabase db reset` — a59234b
- [x] 1.2 Lint passes: `npm run lint` — a59234b

#### Manual

- [x] 1.3 As the owner, updating a result's score through the authenticated client changes the row — a59234b
- [x] 1.4 As a different signed-in user, the same update returns 0 rows and the score is unchanged — a59234b
- [x] 1.5 As anon the update is rejected, and `submit_match_score` still returns `already_entered` — a59234b
- [x] 1.6 An update to `score_a = 100` fails with check violation `23514` — a59234b
- [x] 1.7 An update to `match_id` is rejected (column not updatable) — a59234b

### Phase 2: Correction endpoint and tests

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — ec42158
- [x] 2.2 Lint passes: `npm run lint` — ec42158
- [x] 2.3 Type check passes: `npx astro check` — ec42158
- [x] 2.4 Production build passes: `npm run build` — ec42158

#### Manual

- [x] 2.5 Owner POST with valid fields updates the row and redirects with `?notice=score-updated` — ec42158
- [x] 2.6 The same request while signed out redirects to `/auth/signin` — ec42158
- [x] 2.7 The same request as a non-owner redirects with `?error=match-not-found` and changes nothing — ec42158
- [x] 2.8 A request for a match with no result redirects with `?error=match-not-found` — ec42158
- [x] 2.9 Scores `100` and `abc` redirect with `?error=invalid-score` — ec42158

### Phase 3: Organizer UI

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 51fa2e3
- [x] 3.2 Type check passes: `npx astro check` — 51fa2e3
- [x] 3.3 Production build passes: `npm run build` — 51fa2e3
- [x] 3.4 Unit tests still pass: `npm test` — 51fa2e3

#### Manual

- [x] 3.5 A played match shows its score and a prefilled correction form; an unplayed match shows no form — 51fa2e3
- [x] 3.6 Saving a changed score returns to the league page showing the new score and "Score updated."; reload keeps it — 51fa2e3
- [x] 3.7 The organizer's correction is visible on the share page on next load — 51fa2e3
- [x] 3.8 An invalid score shows the fixed error text and leaves the score unchanged — 51fa2e3
- [x] 3.9 The page is usable at 375px with no overlap between inputs and player names — 51fa2e3
- [x] 3.10 A link holder still cannot overwrite a score from the share page — 51fa2e3
