# Link Score Entry (S-04) — Plan Brief

> Full plan: `context/changes/link-score-entry/plan.md`
> Research: `context/changes/link-score-entry/research.md`

## What & Why

Anyone with a `/t/<token>` link can enter the score of an unplayed match without signing in. The first submission wins and a later one sees "already entered" with the stored score. This delivers FR-009 and unblocks the leaderboard (S-05), organizer correction (S-06) and settings lock (S-07).

## Starting Point

The share page shows fixtures read-only through the `get_shared_league` RPC. No score storage exists, and anon has no table access, so every match counts as unplayed.

## Desired End State

On the share page each unplayed match has two score inputs and a submit button; played matches show their score. A second submit for the same match changes nothing and shows an "already entered" notice. All of this works with no session.

## Key Decisions Made

| Decision        | Choice                                                    | Why (1 sentence)                                                              | Source   |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Overwrites      | Write-once, first submission wins                         | PRD FR-009; organizer edits arrive in S-06                                    | Research |
| Write path      | `submit_match_score` security-definer RPC                 | Same closed-tables pattern as `get_shared_league`                             | Research |
| Storage         | Separate `results` table, `match_id` primary key          | The key guarantees one row per match under concurrency; reusable by S-05/S-06 | Plan     |
| Score range     | Integer 0–99, zod and DB check                            | Matches the existing 0–99 points convention; bounds an anonymous writer       | Plan     |
| Already entered | Notice plus the stored score shown                        | The second submitter can verify what won                                      | Plan     |
| Endpoint        | `POST /api/scores`, token in hidden field                 | Keeps the token out of the write's URL; outside `PROTECTED_ROUTES`            | Plan     |
| Testing         | Vitest for validation/parser, smoke for the anon boundary | Reuses existing setup; concurrency argued from the primary key                | Plan     |

## Scope

**In scope:** migration, RPC, score-aware `get_shared_league`, zod schema, API route, DTO/parser, share-page forms, Vitest, smoke steps, `AGENTS.md` doc fix.

**Out of scope:** editing scores (S-06), history, leaderboard (S-05), rate limiting, client JS, concurrency stress test.

## Architecture / Approach

Form POST → `/api/scores` (zod) → `submit_match_score` RPC as anon → redirect to `/t/<token>`. The RPC resolves the tournament from the token, checks the match belongs to it, and inserts with `on conflict do nothing`; no inserted row means already entered. The page re-reads `get_shared_league`, which now includes scores.

## Phases at a Glance

| Phase                      | What it delivers                                                  | Key risk                                                        |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Database                | `results` table, RPC, score-aware read payload, regenerated types | First anonymous write; must be write-once and tournament-scoped |
| 2. Server logic            | Validation, `/api/scores`, DTO/parser, unit tests                 | Empty field stored as 0                                         |
| 3. Share page UI and smoke | Score forms, played matches, notice, smoke steps                  | Anonymous boundary regressions                                  |

**Prerequisites:** S-03 done (it is); local Supabase via Docker.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Astro's default form-origin check was not verified for Astro 7; smoke sends `Origin`, so it should pass, but confirm in phase 3.
- Concurrency safety rests on the primary-key constraint, not on a test.
- A leaked link allows anyone to enter a wrong first score; only the organizer can fix it (S-06).

## Success Criteria (Summary)

- A link holder with no session can enter a score once, and sees it as played.
- A repeat submit never changes the stored score and shows "already entered".
- Invalid scores (empty, negative, over 99) are rejected with a readable message.
