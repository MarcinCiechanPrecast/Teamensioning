---
change_id: testing-guardrail-correctness
title: Test guardrail correctness from stored data (test plan Phase 2)
status: planned
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Guardrail correctness from stored data".
Risks covered: #3 (leaderboard disagrees with stored results, settings, tiebreaks or corrections), #5 (points can change after the first score), #6 (DB accepts a duplicate case-insensitive player name, a wrong pair count, or player/match inserts after creation). Test types planned: unit for calculation edges, integration against local Supabase for stored rows → leaderboard, points lock and DB invariants.
Risk response intent:

- #3: given persisted results and the tournament's own points, the leaderboard rows (P/W/D/L/GF/GA/GD/Pts and order) equal values computed by hand from the PRD rules, including after a correction.
- #5: after one score exists, any attempt to change points is refused and stored points are unchanged; renaming still works.
- #6: the DB refuses a duplicate (case-insensitive) name or a wrong pair count independent of app validation; adding players/matches after creation is refused or an explicitly accepted owner-only gap.

Run non-interactively: the user delegated all decisions; assumptions are recorded in research.md and plan.md.
