# Organizer score correction — Plan Brief

> Full plan: `context/changes/organizer-score-correction/plan.md`

## What & Why

The organizer can overwrite an already-entered match score (FR-006, roadmap S-06), so a typo or a disputed result does not stay in the league. Link holders can only enter a score once, so without this slice a wrong score is permanent.

## Starting Point

`public.results` is write-once: only `submit_match_score` (anon-callable) inserts, and no update policy exists. The organizer's league page does not read results at all (`score: null` is hardcoded), so the organizer cannot even see the scores.

## Desired End State

On `/leagues/[id]` the organizer sees every score and corrects a played match inline; the page returns showing the new score and a "Score updated." notice. Non-owners and link holders cannot overwrite anything. The shared page and, once S-05 lands, the leaderboard show the corrected score on their next load.

## Key Decisions Made

| Decision        | Choice                                                              | Why (1 sentence)                                                                    |
| --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Write path      | Owner `UPDATE` policy on `results` (score columns only)             | RLS already expresses ownership for this table; no extra security-definer function. |
| Edit scope      | Overwrite an existing score only                                    | Matches FR-006 literally; first scores stay a link-holder action.                   |
| Organizer UI    | Inline plain form per played match on `/leagues/[id]`               | No JavaScript and the same form-POST-redirect pattern as delete and `/api/scores`.  |
| Testing         | Vitest unit tests + manual RLS check                                | Fast, covers new code; ownership verified once against the real policy.             |
| Validation      | Reuse the 0-99 score field of the anonymous form                    | Organizer and link-holder entry cannot disagree on what is valid.                   |
| Failure outcome | Non-owner, unknown match and "no result" all give `match-not-found` | Same convention as tournament delete; reveals nothing about other leagues.          |

## Scope

**In scope:** owner-only update policy; correction endpoint with validation and fixed error codes; showing scores on the organizer page; inline correction form; unit tests.

**Out of scope:** organizer entering first scores or clearing results; score history; a confirm step; changes to the link-holder flow; leaderboard (S-05); points lock (S-07); migrating `/leagues/[id]` to design tokens.

## Architecture / Approach

Database first. RLS is the only "owner" check: the endpoint updates `results` and treats 0 returned rows as one `match-not-found` outcome, redirecting back to `/leagues/[id]` with a fixed `?notice=` or `?error=` code. The league page loads each match's result into the existing `FixtureDTO.score` and renders a prefilled form for played matches.

## Phases at a Glance

| Phase                            | What it delivers                                                 | Key risk                                                                        |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1. Owner update policy           | Migration: owner-only update of `score_a`/`score_b`              | Policy too wide (non-owner or `match_id` repoint) — no automated test guards it |
| 2. Correction endpoint and tests | Schema, outcome mapping, `POST /api/leagues/[id]/scores`, Vitest | Telling "not owner" from "no result" — both intentionally one code              |
| 3. Organizer UI                  | Scores shown on `/leagues/[id]`, inline correction form, notices | Crowded fixture row at 375px; embedding `results` in the matches query          |

**Prerequisites:** S-04 done (it is); local Supabase running for the migration and manual RLS check. Use a migration timestamp different from S-07's.
**Estimated effort:** ~1-2 sessions across 3 small phases.

## Open Risks & Assumptions

- No automated regression test for the ownership rule (accepted for the 2026-11-04 deadline).
- Parallel-safe with S-05 and S-07: the fixture list moves into a new `OrganizerFixtureList.astro`, so `[id].astro` changes only in imports, loader and one block, and S-07's footer anchor lands elsewhere. This change does not touch `src/types.ts` or `database.types.ts`.
- Assumes PostgREST can embed `results` on `matches` (one-to-one via primary key); fall back to a second query if not.

## Success Criteria (Summary)

- The owner changes a score and the new value shows on the league page and the share page.
- A different user, anon, or a link holder cannot change a score.
- `npm test`, lint, `astro check` and build pass.
