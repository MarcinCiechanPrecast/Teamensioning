# Quality-Gates Wiring — Plan Brief

> Full plan: `context/archive/2026-11-07-testing-quality-gates/plan.md`
> Research: `context/archive/2026-11-07-testing-quality-gates/research.md`

## What & Why

Rollout Phase 4 of the test plan. Phase 1 built a DB-level integration suite that only runs on a developer machine. Risk #7 (a migration that applies to an empty database but breaks on production data, or breaks the Worker that is still deployed) has no gate at all. And nothing tells the agent about a lint, test or type error until CI.

## Key Decisions Made

| Decision                         | Choice                                                                                                    | Why (1 sentence)                                                       | Source              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| Where the integration suite runs | One step in the existing `smoke` job                                                                      | That job already has a local Supabase and a local `.env`               | Research            |
| Previous release                 | `HEAD^1` of the PR merge commit; `github.event.before` on push                                            | Exactly what master is before this PR lands                            | Research            |
| Staging the upgrade              | `supabase start` in a worktree of the previous release, `supabase migration up` from the PR               | Same `project_id`; `migration up` shares `db push`'s pending-set rules | Research (Context7) |
| Seed                             | `scripts/seed-db.mjs` through the public anon surface, previous release's copy when it exists             | Writes rows the way the deployed app does; no service-role key         | Plan                |
| Old code vs new schema           | Build the previous release and run its `scripts/smoke.mjs` after the upgrade                              | That is the Worker running while `migrate` and the deploy race         | Plan                |
| Verification                     | Snapshot projection must still be a subset of what is read back; writes still work                        | Additive migrations pass, lost/altered data fails                      | Plan                |
| Hook language                    | Node scripts                                                                                              | No `jq` on the developer host                                          | Research            |
| Hook moments                     | ESLint + related unit tests per edit; ESLint on changed files + unit suite + `astro check` at end of turn | Lint 18 s, unit 3 s, `astro check` 24 s                                | Research            |

## Phases at a Glance

| Phase                    | Delivers                                                       | Key risk                                       |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------------- |
| 1. Integration in CI     | `smoke` step                                                   | Low                                            |
| 2. Seeded migration gate | `seed-db.mjs`, `migration-upgrade` job, deliberate-break proof | CLI not finding the stack across two checkouts |
| 3. Agent hooks           | settings + 2 scripts + committed test                          | Windows path handling                          |
| 4. Docs                  | test plan, AGENTS.md                                           | Low                                            |

## Open Risks & Assumptions

See research.md §Assumptions (A1–A5).
