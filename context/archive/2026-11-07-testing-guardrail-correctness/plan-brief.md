# Guardrail Correctness from Stored Data — Plan Brief

> Full plan: `context/changes/testing-guardrail-correctness/plan.md`
> Research: `context/changes/testing-guardrail-correctness/research.md`

## What & Why

Rollout Phase 2 of the test plan. Phase 1 proved who may write. This phase proves that what is stored produces the right answers and that the league's shape can't drift:

- the leaderboard computed from stored results matches a hand-computed table (risk #3),
- points can't change after the first score (risk #5),
- the database refuses duplicate names, bad pairings and rows added after creation (risk #6).

## Starting Point

The standings function has good basic unit tests, but nothing tests stored rows → leaderboard, the points lock has no test, and the DB invariants were checked by hand once. Research found one defect: the owner can insert players or matches into a league after it is created, breaking "every pair meets exactly once".

## Desired End State

`npm test` pins the remaining ranking edge cases. `npm run test:integration` adds three DB-level files: leaderboard from stored data (5/2/1 and 3/1/0, before and after a correction), the points lock, and league invariants. A migration freezes a league's rows after creation. Test-plan §6.1/§6.4/§6.6 explain the patterns.

## Key Decisions Made

| Decision                    | Choice                                                                              | Why (1 sentence)                                                                      | Source          |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| Leaderboard layer           | Integration composing `get_shared_league` → `toSharedLeague` → `computeStandings`   | That is exactly what the page does; there is no cache in between                      | Research        |
| Points in the main scenario | 5/2/1, plus a 3/1/0 twin league with the same scores                                | A hard-coded default anywhere on the path changes the expected table                  | Plan            |
| Oracle                      | Hand-computed literal tables with the arithmetic in comments                        | Avoids copying the implementation's answer                                            | Test plan §2    |
| Lock race                   | Not tested                                                                          | A lost race leaves the same final state as a legal order, so outcomes can't reveal it | Research        |
| Post-creation inserts       | Defect: fix with `create_league` as `security definer` and drop the insert policies | PRD freezes the player list; the DB is the last guard; no app code inserts directly   | Research / Plan |
| Mutation checks             | `psql` via `docker exec`, restore from the migration file at once                   | Shared local DB; no `db reset`                                                        | Test plan §6.6  |

## Scope

**In scope:** standings unit edges; three integration files; one migration; test-plan §3/§6 updates.

**Out of scope:** e2e (Phase 3), CI wiring (Phase 4), endpoint/zod tests, lock concurrency.

## Phases at a Glance

| Phase                           | What it delivers                               | Key risk                                                        |
| ------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| 1. Standings edge cases         | Unit tests for rank/tiebreak/degenerate points | Expectations copied from code; mitigated by hand arithmetic     |
| 2. Stored results → leaderboard | Integration with 5/2/1, 3/1/0 and a correction | Score orientation (a/b) mistakes; helper orients by name        |
| 3. Points lock                  | Lock, rename, correction, per-tournament scope | None beyond mutation proof                                      |
| 4. League invariants + freeze   | DB refusals and the post-creation fix          | Migration breaking `create_league`; mitigated by the full suite |
| 5. Cookbook and docs            | Test-plan updates                              | Low                                                             |

## Open Risks & Assumptions

- The user delegated all decisions; assumptions are recorded here and in research.
- Shared local DB: other agents' tests run at the same time; mutation windows are kept to a single test run.
- Error codes asserted are Postgres classes (23505, 22023, 23514), which the PRD does not name; they're stable Postgres semantics and the app already maps 23505.

## Success Criteria (Summary)

- Every new DB test was seen red under a mutation of the real protection.
- The post-creation test was red on `master` and is green after the migration.
- `npm run lint`, `npm test`, `npm run test:integration` are green.
