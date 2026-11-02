# Live Leaderboard (S-05) — Plan Brief

> Full plan: `context/changes/live-leaderboard/plan.md`

## What & Why

Players with the share link need to see standings without the organizer recalculating them. We add a leaderboard (P/W/D/L/GF/GA/GD/Pts) to `/t/<token>`, computed per request from entered scores, so it always matches the results (PRD FR-008, FR-011, no-stale-standings NFR).

## Starting Point

`get_shared_league` already returns points settings, players and every match with its score; the page is server-rendered per request. Nothing computes standings yet.

## Desired End State

The share page shows a ranked table above the fixtures. After a score is saved, the next view shows the updated table.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Meaning of "live" | Next view reflects scores (SSR per request) | PRD NFR; no Realtime/polling needed | Plan |
| Full ties (points, GD, GF equal) | Shared rank (1, 1, 3), alphabetical inside the tie | PRD defines no tiebreak beyond GF; don't imply an order | Plan |
| Placement | Above fixtures on the share page | Standings are why players open the link | Plan |
| Organizer page | Not in this slice | Different data path; roadmap outcome is link holders | Plan |
| Data | No migration/RPC change | Existing RPC already carries all inputs | Plan |
| UI | Token classes, no new literals | AGENTS.md UI rules | Plan |

## Scope

**In scope:** pure `computeStandings` + tests; table and empty state on `/t/[token]`.

**Out of scope:** Realtime/caching, owner-page leaderboard, head-to-head, schema changes, migrating the rest of the page to tokens.

## Architecture / Approach

Pure function over `SharedLeagueDTO` returns sorted, ranked `StandingDTO[]`; the Astro page renders it server-side. Rank = 1 + players strictly ahead on all three keys.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Standings calculation | `computeStandings`, `StandingDTO`, tests for ties/unplayed/custom points | Tie rank numbering off by one |
| 2. Render on share page | Table above fixtures, empty state, browser check | Contrast/mobile fit in the existing glass card |

**Prerequisites:** S-04 done (it is).
**Estimated effort:** ~1 session, 2 small phases.

## Open Risks & Assumptions

- New token-styled table sits inside an older palette-styled card; contrast needs an eyeball check.
- Duplicate player names are possible only if validation allows it; id keeps the sort stable.

## Success Criteria (Summary)

- Standings match entered results, points settings and the PRD order.
- A saved score appears in the table on the next view.
