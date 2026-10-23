# Create League with Fixtures — Plan Brief

> Full plan: `context/changes/create-league-with-fixtures/plan.md`

## What & Why

A signed-in organizer creates a league (name, win/draw/loss points prefilled 3/1/0, 3–20 uniquely named players) and on save immediately sees every round-robin fixture. This is roadmap slice S-01, the north star. It proves the product can turn a list of players into a correct schedule, which is the "every pair meets exactly once" guardrail, and it gives the later slices their data model.

## Starting Point

Auth (Supabase SSR sessions and the `PROTECTED_ROUTES` middleware), deploy and CI are in place. There is no data layer: no migrations, no `src/types.ts`, and an untyped Supabase client with the anon key only. There are no domain routes and no unit test runner, only an 8-step auth smoke script.

## Desired End State

From the dashboard the organizer opens `/leagues/new`, fills in a form with a dynamic player list and submits it. The organizer lands on `/leagues/<id>`, which shows the name, the points and all n(n−1)/2 fixtures in circle-method order (4 players → 6 matches). Bad input is rejected on the client, the server and the DB. Creation is all-or-nothing, and only the owner can see the league.

## Key Decisions Made

| Decision        | Choice                                           | Why (1 sentence)                                                                                        |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Player count    | 3 to 20                                          | 3 is the smallest meaningful table, and 20 (190 matches) covers any office league with a readable list. |
| Name uniqueness | Trim + case-insensitive ('Tomek' = 'tomek ')     | Prevents the ambiguous leaderboard rows FR-003 targets; enforced by a unique index on `lower(name)`.    |
| Points rules    | Integers 0–99, win ≥ draw ≥ loss                 | Blocks inverted tables; a DB CHECK is the backstop.                                                     |
| Atomicity       | Postgres `create_league` RPC, `security invoker` | One transaction, and RLS still applies because it runs as the user.                                     |
| Pair generation | In TypeScript, passed to the RPC as indices      | Keeps the guardrail algorithm fast to unit test; the RPC re-checks the pair count.                      |
| Fixture order   | Circle method, stored as `position`              | The flat list reads as a sensible playing order, and nobody waits until the end.                        |
| Test runner     | Vitest ^5 + `npm run test` in CI                 | Vite-native (alias/TS just work); S-05 standings tests reuse it.                                        |
| Share token     | Deferred to S-03                                 | Keeps S-01 minimal; adding a column with a random default backfills existing rows.                      |
| Validation      | One zod schema shared by API route and island    | Client and server rules cannot drift.                                                                   |

## Scope

**In scope:**

- Circle-method generator with exhaustive tests (N = 3..20)
- Migration: `tournaments`, `players`, `matches`, constraints, SELECT/INSERT RLS, and the `create_league` RPC
- Generated DB types and a typed client
- `POST /api/leagues`, `/leagues/new`, `/leagues/[id]`, route protection, a dashboard link
- Smoke steps: create → view, duplicate names → error, anonymous → sign-in

**Out of scope:**

- Share link and anonymous access (S-03), scores (S-04), leaderboard (S-05)
- Tournament list, delete, rename and points edit (S-02, S-07); UPDATE/DELETE policies
- Player-list edits after creation; rounds in the UI
- Refilling the form after a server-side error
- Pushing migrations to production (a human does this)

## Architecture / Approach

The form island posts natively to `POST /api/leagues`. The route validates with the shared zod schema, calls `generateFixtures(n)` (pure TS) and passes `supabase.rpc("create_league", { name, points, players[], fixtures[{a,b}] })`. The RPC inserts the tournament, then the players, then the matches in one transaction under RLS and returns the id. The route then redirects to `/leagues/<id>`, which is SSR and reads tournament, players and matches ordered by `position`. DB constraints (unique `lower(name)`, unique unordered pair, composite FKs, pair-count check) back up the application rules.

## Phases at a Glance

| Phase                              | What it delivers                                           | Key risk                                                              |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Fixture generator + Vitest      | Tested circle-method generator; `npm run test` in CI       | Odd-count bye handling breaks the per-block property                  |
| 2. Database schema + RPC           | Migration, RLS, `create_league`, typed client              | RLS or composite-FK mistakes surfacing only at runtime                |
| 3. Create endpoint + fixtures page | Validated POST, `/leagues/[id]`, protection, smoke steps   | Smoke-step ordering and cookie handling in the dependency-free script |
| 4. Create-league form UI           | `/leagues/new` island with dynamic players; dashboard link | Repeated `players` fields and row-level error mapping                 |

**Prerequisites:** Docker and local Supabase (`npx supabase start`) for Phases 2–4; the repo on `master` with CI green.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Production migration ordering: a human must run `npx supabase db push` **before** merging, because merges auto-deploy the Worker.
- The form is not refilled after a server-side error. This is acceptable because the client runs the same schema, so server errors should be rare.
- Assumes Studio's SQL-editor role impersonation is available for the Phase 2 manual RLS checks.
- DB invariants (unique names, pair-count check, RLS isolation) are verified manually only. CI's smoke duplicate-name step is stopped by zod before it reaches the DB. Automated pgTAP tests are deferred as an accepted gap.
- S-03's public link route must live outside `/leagues`, because the middleware protects that whole prefix.

## Success Criteria (Summary)

- An organizer creates a 4-player league through the UI and sees exactly 6 fixtures; 5 players → 10.
- Duplicate names, out-of-range counts and inverted points are rejected before anything is stored.
- `npm run test` and the extended `npm run smoke` pass in CI.
