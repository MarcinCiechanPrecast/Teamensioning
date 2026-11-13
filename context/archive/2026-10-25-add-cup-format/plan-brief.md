# Add cup (knockout) format — Plan Brief

> Full plan: `context/changes/add-cup-format/plan.md`
> Frame brief: `context/changes/add-cup-format/frame.md`

## What & Why

The app's tournament model is hard-wired to "a league = a fixed set of pairings between known players with draws allowed". A cup is a second tournament format whose matches are produced progressively from earlier results, so the work is introducing a format concept in the data model and write path, not adding a bracket screen. The motivation is "elimination drama" for office players, which league standings don't give.

## Starting Point

Only round-robin leagues exist. `matches` requires two known players, `create_league` and `submit_match_score` are league-only, results allow draws, and both the organizer and share pages are standings/fixture-list views. PRD v2 lists the cup as a Non-Goal; all M-1 slices are done.

## Desired End State

An organizer picks League or Cup, creates a cup with 3–20 players, shares the link, and link holders enter scores until a champion is shown. The bracket handles byes, refuses draws, advances winners, and refuses a score correction once the winner has played the next round. PRD v3, the roadmap and the test plan describe the cup, and the league flow is unchanged.

## Key Decisions Made

| Decision                      | Choice                                        | Why (1 sentence)                                           | Source   |
| ----------------------------- | --------------------------------------------- | ---------------------------------------------------------- | -------- |
| Draws                         | Forbidden in a cup                            | A knockout needs one winner to advance.                    | User     |
| Odd player counts             | Byes for top seeds                            | Round 1 only holds real pairings; byes sit in round 2.     | User     |
| Seeding                       | Order of entry                                | Simplest rule; the organizer already controls entry order. | User     |
| Third-place match             | None                                          | Keeps the bracket at N−1 matches.                          | User     |
| Correction after later rounds | Refused once the winner played the next round | Avoids rewriting played matches.                           | User     |
| Player range                  | 3 to 20                                       | Same as a league, so the form and validation carry over.   | Plan     |
| Score write                   | Cup branch inside `submit_match_score`        | One anonymous write surface and one tournament lock.       | Plan     |
| Shared view data              | Extend `get_shared_league` with additive keys | One read path; old payload keys untouched.                 | Plan     |
| Correction guard              | DB trigger on `results`                       | Holds for direct updates, the real attack surface.         | Plan     |
| Order of work                 | Docs first (Phase 1)                          | Tests get a written oracle from the PRD.                   | Plan     |
| Draw rule location            | Cup path only, not a table CHECK              | A CHECK would break league draws and seed data.            | Research |

## Scope

**In scope:** format picker, cup creation, bracket generator, one additive migration, bracket views for organizer and link holder, correction guard, PRD v3, roadmap M-2, test-plan risks, integration/seed/smoke/e2e coverage.

**Out of scope:** group→knockout, Swiss, third-place match, other seeding modes, cup points, renaming league identifiers, player-list changes after creation.

## Architecture / Approach

A pure TypeScript generator builds the bracket and sends it to a new `create_cup` RPC, mirroring `generateFixtures` and `create_league`. One migration adds `tournaments.format`, `matches.round/next_match_id/next_slot` and nullable player slots. `submit_match_score` branches on format to reject draws and write the winner into the next slot under its existing lock; a trigger guards corrections; `get_shared_league` gains format and bracket keys.

## Phases at a Glance

| Phase                 | What it delivers                              | Key risk                                       |
| --------------------- | --------------------------------------------- | ---------------------------------------------- |
| 1. Docs and test plan | PRD v3, roadmap M-2, risks #8 and #9          | Rules written ambiguously                      |
| 2. Bracket generator  | Tested pure bracket builder                   | Wrong bye or seed placement                    |
| 3. Database           | One additive migration                        | Breaking the deployed league path              |
| 4. App                | Picker, validation, bracket views             | League regressions in shared pages             |
| 5. Test gates         | Integration, seed, smoke, e2e, mutation proof | Seed script runs as the previous release first |

**Prerequisites:** local Supabase (`npx supabase start`), Docker, M-1 done.
**Estimated effort:** ~5 sessions, one per phase; the database and test-gate phases are the largest.

## Open Risks & Assumptions

- Workers Builds deploys in parallel with `migrate`; if the Worker goes live first, cup creation fails visibly and stores nothing.
- `seed-db.mjs` edits only take effect one release later, so cup seeding must skip when `create_cup` is missing.
- The correction trigger is `security definer` and must be proven by an owner and non-owner integration test.

## Success Criteria (Summary)

- A cup of N players has N−1 matches, byes on top seeds, no draws, and ends with a champion on the share link.
- A correction after the next round was played is refused and the stored data is unchanged.
- League flows, their tests and the previous release's smoke still pass in CI.
