# Critical Flow in the Browser (US-01) — Plan Brief

> Full plan: `context/archive/2026-11-07-testing-critical-flow-e2e/plan.md`
> Research: `context/archive/2026-11-07-testing-critical-flow-e2e/research.md`

## What & Why

Rollout Phase 3 of the test plan. The leaderboard is computed in the share page on every request, so no database test can see it, and smoke only checks the score text. One browser run checks the rendered standings against hand-computed values. Before this run, nothing caught a page that ignores the tournament's points, a correction that never reaches the next view, or a stale tab that overwrites a score.

## Desired End State

`npm run test:e2e` builds and previews the app on port 4400 against local Supabase. It signs up a fresh organizer and runs one US-01 spec. A config guard refuses any non-local `SUPABASE_URL`. An optional, self-contained `e2e` CI job runs the same thing.

## Key Decisions Made

| Decision        | Choice                                                            | Why (1 sentence)                                                                   | Source   |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Scope           | One spec, US-01 only                                              | §1 cost × signal: smoke and integration already cover redirects and DB rules       | Research |
| Oracle          | Hand-computed cells for W4/D2/L1                                  | Non-default points with loss > 0 expose "defaults only" and "unplayed = loss" bugs | Plan     |
| Organizer auth  | Fresh sign-up per run in a `setup` project                        | Local confirmations are off; no secrets needed in env or CI                        | Plan     |
| Port            | 4400, `E2E_PORT` override                                         | A dev server on 4321 would be reused silently                                      | Plan     |
| Seed            | The US-01 spec is the seed                                        | A trivial seed would duplicate smoke                                               | Plan     |
| Failure capture | `trace: retain-on-failure`, `screenshot: only-on-failure`         | Local runs have no retries                                                         | Plan     |
| CI              | Separate `e2e` job; the `ci`/`smoke`/`migrate` jobs are untouched | Phase 4 edits those jobs concurrently                                              | Plan     |

## Success Criteria (Summary)

- Green from a cold server across repeated runs, including parallel repeats.
- Red when the share page hard-codes 3/1/0, and red when the correction endpoint writes the wrong score but still reports success.
