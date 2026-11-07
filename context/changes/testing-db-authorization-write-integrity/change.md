---
change_id: testing-db-authorization-write-integrity
title: Test DB authorization and anonymous write integrity (test plan Phase 1)
status: implementing
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "DB authorization and write integrity".
Risks covered: #1 (link holder overwrites an entered score / concurrent submissions both land), #2 (non-owner or anon performs organizer writes: correct score, edit settings, delete), #4 (anon submission crosses tournaments or stores an invalid score). Test types planned: integration against local Supabase (anon + two authenticated users).
Risk response intent:

- #1: a second submission, sequential or concurrent, leaves the first score unchanged and reports "already entered".
- #2: every organizer-only write is refused for a different authenticated user and for anon, and data is unchanged afterwards.
- #4: a valid token posting another tournament's match id, or an out-of-range score, is rejected server-side with nothing stored.
  After creating the folder, follow the downstream continuation rule.
