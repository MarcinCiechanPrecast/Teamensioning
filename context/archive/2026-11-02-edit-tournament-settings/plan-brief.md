# Edit Tournament Settings — Plan Brief

> Full plan: `context/changes/edit-tournament-settings/plan.md`

## What & Why

Organizers can rename a tournament at any time and change its win/draw/loss points only until the first score is entered (roadmap S-07, PRD FR-013). Changing points mid-league would reshuffle the table retroactively, so the lock is a product rule, not a UI nicety.

## Starting Point

Tournaments can be created and deleted but not updated — there is no UPDATE policy. Scores arrive anonymously through `submit_match_score`, a `security definer` RPC that bypasses RLS and does not lock the tournament row, so a naive "check for scores, then update" would race.

## Desired End State

An "Edit settings" link on the league page opens `/leagues/[id]/edit`. Before any score the organizer edits name and points; afterwards the points show read-only with "Points are locked because a score has been entered". If a score lands while the form is open, a save with changed points is rejected as a whole and the form comes back locked.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Lock enforcement | `security definer` RPC `update_tournament_settings` with owner check and `FOR UPDATE`; no UPDATE policy | Single race-safe write path; owners can't bypass it with direct PostgREST updates |
| Serializing with scores | `submit_match_score` takes `FOR SHARE` on the tournament row | Row locks only order transactions that both lock; score submissions still don't block each other |
| "Unchanged" points | Null or identical-to-current points never trigger the lock | Name-only saves and same-value resubmits must not fail |
| Edit UI | New `/leagues/[id]/edit` page + React form island | Same client+server validation as create; keeps `[id].astro` diff to one link (S-06 overlap) |
| Locked display | Points read-only with a reason note | Organizer sees why points can't change |
| Race outcome | Reject the whole save | No half-applied edits; organizer resubmits the rename knowingly |
| Validation | Extract shared `leagueSettingsSchema` from `createLeagueSchema` | One source of truth for name/points rules |

## Scope

**In scope:**
- Migration: `update_tournament_settings` RPC, `submit_match_score` with `FOR SHARE`, regenerated types
- `leagueSettingsSchema` + unit tests; `POST /api/leagues/[id]/settings`
- Edit page, `EditLeagueSettingsForm` island, link from the league page

**Out of scope:**
- Editing players, fixtures or the share token
- Unlocking points after a score; edit history/audit
- Owner UPDATE RLS policy; restyling existing league pages

## Architecture / Approach

Edit form island → `POST /api/leagues/[id]/settings` (zod) → `update_tournament_settings` RPC → `{updated | not_found | points_locked}` → redirect to the league page, back to the edit form with `?error=`, or to the dashboard. The RPC locks the tournament row `FOR UPDATE`; `submit_match_score` locks it `FOR SHARE`, so whichever commits second sees the other.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB lock and RPC | Race-safe settings RPC; score path takes the shared lock | Breaking anonymous score entry — covered by `npm run smoke` |
| 2. Validation and endpoint | Shared schema + tests; settings endpoint with status → redirect mapping | Refactor changes create-form messages |
| 3. Edit UI | Edit page, form island with locked state, entry link | Merge overlap with S-06 on `leagues/[id].astro` |

**Prerequisites:** S-01 and S-04 done (they are); local Supabase running (Docker).
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- `organizer-score-correction` (S-06) will likely edit `src/pages/leagues/[id].astro` too; this plan limits its change there to one link to keep the merge trivial.
- Assumes there is no result-deletion path; if one is added later, "locked" would still be computed live from `results`, so unlocking would follow automatically.

## Success Criteria (Summary)

- An organizer can rename any of their leagues, and change points on one with no scores, from the UI.
- After the first score, no path — UI, endpoint or direct SQL as the owner — changes the points.
- Anonymous score entry behaves exactly as before.
