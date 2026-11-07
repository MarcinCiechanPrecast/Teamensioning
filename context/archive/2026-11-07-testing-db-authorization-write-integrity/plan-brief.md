# DB Authorization and Write Integrity Tests — Plan Brief

> Full plan: `context/changes/testing-db-authorization-write-integrity/plan.md`
> Research: `context/changes/testing-db-authorization-write-integrity/research.md`

## What & Why

This is rollout Phase 1 of the test plan. The app has no access control except the Supabase database: row-level security rules plus two `security definer` functions. Today nothing automated tests that layer directly. The smoke test only reaches it through the endpoints, after zod has already filtered the input. These tests make sure a future migration can't, without anyone noticing:

- let a link holder overwrite a score,
- let a link write into another tournament or store an invalid score, or
- let a non-owner manage someone else's tournament.

## Starting Point

All three guarantees hold today (research found no bypass), but they are proven only by endpoint-level smoke steps and by archived plans that say they were checked by hand. Vitest runs unit tests only. A local Supabase is already used by CI's smoke job.

## Desired End State

`npm run test:integration` runs a DB-level suite against local Supabase. The suite acts as anon, as the owner and as a second user, and calls the database directly with the public anon key. Every refused write is checked by the owner reading the data back. `npm test` stays DB-free. Test-plan §6.2 and §6.3 explain how to add the next test of this kind.

## Key Decisions Made

| Decision                            | Choice                                                                          | Why (1 sentence)                                                                                                 | Source          |
| ----------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- |
| Test layer                          | Vitest + supabase-js with the anon key, against local Supabase                  | Uses exactly the surface an attacker reaches, and can test two submissions at the same moment, which pgTAP can't | Research        |
| Admin (service-role) key            | None                                                                            | It bypasses RLS; users sign up because email confirmation is off locally                                         | Research        |
| What counts as a refusal            | Error or 0 rows, **plus** an owner read-back, **plus** an owner control         | A refused RLS write returns success with 0 rows, so "no error" proves nothing                                    | Research        |
| Keeping the suite out of `npm test` | Separate Vitest `unit` and `integration` projects, plus `test:integration`      | The CI `ci` job has no database                                                                                  | Research / Plan |
| Env safety                          | Refuse unless `SUPABASE_URL` is localhost or 127.0.0.1                          | Test runs sign up real users, which couldn't be removed from production without an admin key                     | Plan            |
| Test data                           | Fresh random users and leagues per run; the owner deletes leagues in `afterAll` | Tests stay independent with no seed file; leftover users go away on `db reset`                                   | Plan            |
| Scope                               | Database layer only, no endpoint or smoke additions                             | The database is the real boundary; the endpoints already map 0 rows to not-found                                 | Plan            |
| Expected values                     | Taken from the PRD and access rules, not from the SQL                           | Avoids tests that just confirm whatever the code currently does                                                  | Plan            |

## Scope

**In scope:**

- Vitest project split, npm script, localhost guard (with a unit test), fixture helpers, sanity test
- Risks #1 and #4: write-once one after the other and simultaneous, direct `results` writes, another tournament's match, scores 0/99/-1/100/null at the database, unknown token
- Risk #2: correction, settings, delete and direct `tournaments` update, each tried by a non-owner and by anon, with owner controls
- Test-plan §6.2, §6.3 and §6.6, plus the `AGENTS.md` command line

**Out of scope:** CI wiring (test-plan Phase 4); endpoint or smoke tests; pgTAP; risks #5 and #6 (test-plan Phase 2); any change to app code or schema.

## Architecture / Approach

- `src/test/integration/` holds a guarded env and client module, fixtures built on the public surface (`signUp`, `create_league` with `generateFixtures`, owner read-backs), and three `*.integration.test.ts` files.
- Each actor gets its own non-persistent `createClient`.
- Simultaneous submissions are two separate anon clients fired with `Promise.all`. The test asserts against whichever call won.

## Phases at a Glance

| Phase                            | What it delivers                                                    | Key risk                                                                                          |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Integration harness           | Project split, guard, fixtures, sanity test                         | Vite `loadEnv` or Vitest projects behaving differently than the docs say                          |
| 2. Anonymous write path (#1, #4) | Six test groups on `submit_match_score` and direct `results` access | The simultaneous test passing by luck; mitigated by running it on 3 matches plus a mutation check |
| 3. Organizer-only writes (#2)    | Four test groups with owner controls                                | A broken fixture making refusal tests pass trivially; mitigated by the owner controls             |
| 4. Cookbook and docs             | Test-plan §6 patterns, `AGENTS.md` command                          | Low                                                                                               |

**Prerequisites:** Docker plus `npx supabase start`; `.env` pointing at local Supabase (it already does).
**Estimated effort:** about 1–2 sessions across 4 phases.

## Open Risks & Assumptions

- Anon's call to `update_tournament_settings` is expected to fail with a permission error. The tests assert only that an error is present, not its exact code.
- Local auth rate limits could slow repeated sign-ups. `fileParallelism: false` keeps this predictable.
- If a test exposes a real defect, the plan stops for a decision. The test is not edited to pass.

## Success Criteria (Summary)

- Removing any one of the protecting rules (upsert in the write path, a loosened token join, a permissive correction rule, the owner check removed from the settings function) makes a named test fail. This is confirmed by manual mutation checks.
- `npm run test:integration` passes on a clean local Supabase, and `npm test` still needs no database.
- The next contributor can add an authorization test from test-plan §6.2 alone.
