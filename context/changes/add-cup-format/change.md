---
change_id: add-cup-format
title: Add cup (knockout) format
status: impl_reviewed
created: 2026-10-25
updated: 2026-11-12
archived_at: null
---

## Notes

Framed on 2026-10-25. Parked 2026-10-25 while M-1 (first-playable-league) was open.
Resumed 2026-11-12: M-1 slices are done and the test-plan phases 1-4 are complete.

Decisions settled 2026-11-12 (the five open items in `frame.md`):

- Draws: forbidden in a cup (the two scores must differ).
- Non-power-of-two player counts: byes for the top seeds.
- Seeding: order of entry.
- Third-place match: no.
- Score correction: refused once the winner has already played the next round.

Plan decisions (2026-11-12): 3-20 players; cup branch inside `submit_match_score`; `get_shared_league` extended with additive keys; correction guard as a DB trigger on `results`; docs (PRD v3, roadmap M-2, test-plan risks) are Phase 1.

Follow-ups after the plan is settled: amend the PRD (FR-002 format picker, Non-Goals), update `roadmap.md`, refresh `test-plan.md` (new risks) and add a cup e2e spec. These are Phase 1 and Phase 5 of the plan.
