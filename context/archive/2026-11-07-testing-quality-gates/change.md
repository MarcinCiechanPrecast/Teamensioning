---
change_id: testing-quality-gates
title: Wire quality gates into CI and the agent loop (test plan Phase 4)
status: archived
created: 2026-11-07
updated: 2026-11-07
archived_at: 2026-11-07T16:15:28Z
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Quality-gates wiring".
Risks covered: #7 (a migration applied by the CI `migrate` job breaks the already-deployed Worker, or fails on production data although it applied cleanly to a fresh database), plus cross-cutting gates.
Scope:

- run `npm run test:integration` in CI against local Supabase;
- add a migration-on-seeded-DB check: apply the previous release's migrations, seed realistic data, apply the PR's new migrations, then run the previous release's critical calls;
- wire an agent post-edit hook (Claude Code) and prove each hook script against a deliberately broken file.

Non-interactive run: the user delegated all decisions; assumptions are recorded in research.md and plan.md.
