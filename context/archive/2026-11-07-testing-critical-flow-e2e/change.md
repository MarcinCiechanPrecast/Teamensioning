---
change_id: testing-critical-flow-e2e
title: Critical US-01 flow in the browser (test plan Phase 3)
status: archived
created: 2026-11-07
updated: 2026-11-07
archived_at: 2026-11-07T15:34:47Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Critical flow in the browser".
Risks covered: #3 (leaderboard disagrees with stored results, including after a correction) and #1 as a cross-check (a link holder cannot change an entered score; the organizer can). Test type: e2e (Playwright), one US-01 run: create league → share link → enter score anonymously → leaderboard reflects it → organizer correction reflected.
Constraint from §1: add the browser run only where it gives signal over `scripts/smoke.mjs` and the Phase 1 integration suite.

Delegated, non-interactive run: the user delegated all decisions. Assumptions are recorded in research.md and plan.md.
Shared environment: the local Supabase at 127.0.0.1:54321 is shared with other agents. No schema changes, no `db reset`/`stop`, never `--linked`. Preview server on port 4400.
