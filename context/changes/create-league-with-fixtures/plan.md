# Create League with Fixtures Implementation Plan

## Overview

A signed-in organizer creates a league with a name, win/draw/loss points (prefilled 3/1/0) and 3–20 uniquely named players. On save the system atomically stores the tournament, its players and every round-robin pairing in circle-method order, then shows the organizer the full fixture list. This is roadmap slice S-01 (US-01, FR-001, FR-002, FR-003, FR-007). It proves the "every pair meets exactly once" guardrail and gives later slices their data model.

## Current State Analysis

- **Auth is present.** Supabase SSR cookie sessions are in `src/lib/supabase.ts`, and `src/middleware.ts` resolves `locals.user` and redirects anonymous users away from the prefixes in `PROTECTED_ROUTES` (currently only `/dashboard`).
- **No data layer.** `supabase/migrations/` does not exist, `supabase/seed.sql` does not exist (the seed is enabled in `config.toml` but has no file), and `src/types.ts` does not exist. The Supabase client is untyped and only the anon key exists, so there is no service-role client. All data access runs as the signed-in user, which makes RLS the access-control mechanism.
- **No domain routes or tests.** Only `src/pages/api/auth/*` exists. There is no unit test runner, and the only test is the dependency-free `scripts/smoke.mjs` (8 auth steps) run by CI against a local Supabase.
- **Form pattern.** A React island validates on the client and then lets the browser do a native `POST` to an API route. The route reads `formData()` and redirects back with `?error=<message>` on failure. Only `button` is installed from shadcn/ui. Form primitives live in `src/components/auth/` (`FormField`, `ServerError`, `SubmitButton`).
- **Lint is strict.** `strictTypeChecked` applies, so untyped Supabase query results (`any`) will trip the `no-unsafe-*` rules. A typed `Database` generic avoids this.
- **zod is not installed.** AGENTS.md says to add it when a route first needs validation.

## Desired End State

- From the dashboard, a signed-in organizer clicks "Create league" and lands on `/leagues/new`. The form has a name, three points inputs (3/1/0) and a player list that starts with 3 empty rows and supports adding and removing rows.
- Invalid input is rejected with a clear message, on the client and again on the server and in the DB:
  - player count outside 3–20
  - empty or duplicate names (trimmed, case-insensitive)
  - points outside 0–99, or not win ≥ draw ≥ loss
- On a valid submit the organizer is redirected to `/leagues/<id>`. That page shows the league name, the points settings and all n(n−1)/2 fixtures in circle-method order (4 players → 6 matches).
- The tournament, players and matches are created in one transaction (`create_league` RPC). Either all rows exist or none do.
- Only the owner can see a league. Anonymous requests to `/leagues/*` redirect to sign-in, and another user's or an unknown id shows 404.
- `npm run test` (Vitest) proves the generator. CI runs it, and the extended `npm run smoke` covers create → view.

Verify by running `npm run test`, `npm run lint`, `npx astro check` and `npm run smoke` against the local preview, then creating a 4-player and a 5-player league by hand.

### Key Discoveries:

- `src/middleware.ts:4`: `PROTECTED_ROUTES = ["/dashboard"]` uses a `startsWith` prefix match at line 18. API routes are not protected unless listed.
- `src/pages/api/auth/signin.ts:4-20`: the endpoint pattern to mirror is `formData()` → null-guard `createClient` → `redirect(?error=encodeURIComponent(msg))`.
- `src/components/auth/SignInForm.tsx:36-43`: the island pattern is `<form method="POST" action=...>` with `onSubmit` calling `preventDefault()` only when client validation fails.
- `src/lib/supabase.ts`: `createClient(headers, cookies)` returns `null` when the env is missing, and the client has no `Database` generic.
- `.github/workflows/ci.yml:41`: `supabase start` applies `supabase/migrations/*` automatically in the smoke job, so new migrations are exercised in CI with no workflow change.
- `context/changes/development/deployment-plan.md:199`: production migrations are manual and human-only. The agent never runs `db push`.
- `context/foundation/lessons.md`: no lodash, and env is read via `astro:env/server` only.

## What We're NOT Doing

- No share token, unlisted link or anonymous access. S-03 adds the token column (with a random default that backfills existing rows) and the public route.
- No score columns, score entry or leaderboard (S-04, S-05).
- No list of "my tournaments", and no delete, rename or points edit (S-02, S-07). RLS gets only the SELECT and INSERT policies this slice needs.
- No editing of the player list after creation (PRD Non-Goal).
- No rounds in the UI. The circle-method order is kept only as `position`, and fixtures are displayed as one flat numbered list.
- The form is not refilled after a server-side error. Client validation mirrors the server schema, so server errors are rare, and the user sees an `?error=` banner on an empty form.
- No pushing migrations to production. A human runs it (see Migration Notes).
- No public routes under `/leagues`. The middleware protects the whole `/leagues` prefix (`startsWith`), so S-03's anonymous link route must live outside it (e.g. `/t/<token>`).

## Implementation Approach

The work goes inside-out:

1. A pure, fully tested TypeScript generator.
2. A schema with DB-level invariants and a transactional `create_league` RPC that runs as the user (`security invoker`), so RLS still applies.
3. A thin endpoint that validates with zod, generates fixtures and calls the RPC, plus the read-only fixtures page.
4. The interactive form.

The zod schema lives in one module that both the API route and the React island import, so client and server validation cannot drift. The DB repeats the core rules (CHECK constraints, unique `lower(name)`, pair-count check inside the RPC) as the backstop for the guardrail.

## Critical Implementation Details

- **Timing & lifecycle (deploy ordering):** Cloudflare Workers Builds auto-deploys on merge to `master`, but production migrations are manual. The human must apply the migration to the hosted Supabase (`npx supabase db push` after `supabase link`) **before** merging. Otherwise production serves `/leagues/*` against missing tables.
- **Atomicity contract:** the RPC receives fixtures as player indices into `p_players`, because player UUIDs don't exist until the insert. Inside one function it inserts the players, maps index → id, then inserts matches with `position` = array order (1-based). Any constraint violation aborts the whole call.

## Phase 1: Fixture generator + Vitest

### Overview

Add a pure circle-method round-robin generator and prove it with Vitest. Wire `npm run test` into CI.

### Changes Required:

#### 1. Test runner

**File**: `package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`

**Intent**: Introduce Vitest as the unit test runner for domain logic. Later slices reuse it for standings tests in S-05.

**Contract**:

- `vitest@^5` is a devDependency (5.x declares peer `vite ^6.4 || ^7 || ^8`; Astro 7.3.2 runs on Vite 8.3.0), with a `"test": "vitest run"` script.
- `vitest.config.ts` (from `vitest/config`) resolves the `@` alias to `./src` and includes `src/**/*.test.ts`. Tests import `describe`/`it`/`expect` explicitly (no globals; ESLint has no vitest globals configured).
- The `ci` job gets an `npm run test` step after `npm run lint`.

#### 2. Fixture generator

**File**: `src/lib/services/fixtures.ts`

**Intent**: Turn an ordered list of N players into every unordered pair exactly once, ordered by the circle method so that consecutive blocks look like rounds.

**Contract**:

- Signature: `generateFixtures(playerCount: number): FixturePair[]`. `FixturePair` is `{ a: number; b: number }` with 0-based indices into the player list, exported from `src/types.ts`. The function is pure: no I/O, no Supabase types.
- For an odd N, add a phantom "bye" player and drop pairs that include it.
- Output order is round by round, so each consecutive block of `floor(N/2)` pairs contains every player at most once.
- Throws on `playerCount < 2`. The 3–20 business limit is enforced by validation, not here.

#### 3. Generator tests

**File**: `src/lib/services/fixtures.test.ts`

**Intent**: Prove the guardrail for every supported size, not just samples.

**Contract**: For every N in 3..20:

- the length equals N(N−1)/2;
- there is no self-pair;
- no unordered pair appears twice;
- every unordered pair appears;
- every index is in [0, N);
- each consecutive block of `floor(N/2)` pairs has distinct players.

There is also an explicit 4-player case that asserts the exact expected order as a literal array of 6 pairs (so the order is reviewable in the test file), a 5-player case (10 matches, odd count), and a test that `playerCount < 2` throws.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- The literal expected 4-player order in `fixtures.test.ts` reads as a sensible schedule (each player once per block of 2)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Database schema + RPC

### Overview

Create the first migration: tournaments, players and matches with DB-level invariants, per-operation RLS for `authenticated`, and the transactional `create_league` function. Generate DB types and type the Supabase client.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_league_schema.sql`

**Intent**: Persist leagues so that the "every pair exactly once" and "unique names" rules hold even if application code is wrong.

**Contract**:

- `tournaments`:
  - `id uuid pk default gen_random_uuid()`
  - `owner_id uuid not null default auth.uid() references auth.users on delete cascade`
  - `name text not null`, with a check that it is trimmed and 1–80 chars
  - `points_win`, `points_draw`, `points_loss smallint not null`, each with a check for 0–99 and a check that `points_win >= points_draw and points_draw >= points_loss`
  - `created_at timestamptz default now()`
- `players`:
  - `id uuid pk`
  - `tournament_id uuid not null references tournaments on delete cascade`
  - `name text not null`, with a check that it is trimmed and 1–40 chars
  - `unique (tournament_id, id)`, which is the target for the composite FK below
  - unique index on `(tournament_id, lower(name))`
- `matches`:
  - `id uuid pk`
  - `tournament_id uuid not null references tournaments on delete cascade`
  - `position int not null check (position > 0)`
  - `player_a_id`, `player_b_id uuid not null`
  - composite FKs `(tournament_id, player_a_id)` and `(tournament_id, player_b_id)` referencing `players (tournament_id, id)`, so both players belong to the same tournament
  - `check (player_a_id <> player_b_id)`
  - `unique (tournament_id, position)`
  - unique index on `(tournament_id, least(player_a_id, player_b_id), greatest(player_a_id, player_b_id))`
- RLS is enabled on all three tables. Policies are for `authenticated` only:
  - `tournaments`: SELECT and INSERT where `owner_id = (select auth.uid())`.
  - `players` and `matches`: SELECT and INSERT where `exists` an owned tournament with that `tournament_id`.
  - There are no `anon` policies and no UPDATE or DELETE policies (later slices add them).
- Indexes on `players(tournament_id)`, plus the match uniques above, cover the page queries.

#### 2. create_league function

**File**: same migration

**Intent**: Write a whole league in one transaction while RLS still applies, and re-check the guardrail at the DB boundary.

**Contract**:

- Signature: `public.create_league(p_name text, p_points_win int, p_points_draw int, p_points_loss int, p_players text[], p_fixtures jsonb) returns uuid`.
- Declared `language plpgsql security invoker set search_path = ''`, with fully qualified table names.
- `p_fixtures` is a JSON array of `{"a": int, "b": int}`, 0-based indices into `p_players`, in display order.
- Raises unless `array_length(p_players) between 3 and 20` and `jsonb_array_length(p_fixtures) = n*(n-1)/2`.
- Inserts the tournament, then the players (names trimmed), then the matches with `position` = 1-based array order.
- Returns the tournament id.
- Grants: `revoke execute ... from public, anon`, then `grant execute ... to authenticated`.

#### 3. DB types and typed client

**File**: `src/db/database.types.ts` (generated), `src/lib/supabase.ts`, `src/types.ts`

**Intent**: Give query results real types so strict type-checked lint passes, and expose app-level entity types.

**Contract**:

- `database.types.ts` is generated with `npx supabase gen types typescript --local`. It is kept byte-identical to that output: add it to the `ignores` in `eslint.config.js` and to a new `.prettierignore`, so neither lint-staged's `eslint --fix` nor `npm run format` rewrites it.
- `createClient` returns `SupabaseClient<Database>` (via `createServerClient<Database>`).
- `src/types.ts` exports `FixturePair`, and `TournamentDTO`, `PlayerDTO` and `FixtureDTO` (a match with resolved player names and its position), derived from the generated row types.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset`
- Generated types are up to date: `npx supabase gen types typescript --local | diff - src/db/database.types.ts`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Existing smoke test still passes against local preview: `npm run smoke`

#### Manual Verification:

- Using Studio's SQL editor impersonating an authenticated user, calling `create_league` with 4 names creates 1 tournament, 4 players and 6 matches; a call with a duplicate name ('Tomek', 'tomek') or a wrong fixture count creates nothing
- Impersonating a second user in Studio's SQL editor, a select cannot see the first user's tournament

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Create endpoint + fixtures page

### Overview

Add shared validation, the `POST /api/leagues` endpoint, the organizer-only `/leagues/[id]` fixtures page, route protection, and smoke steps for the new flow.

### Changes Required:

#### 1. Validation schema

**File**: `package.json`, `src/lib/validation/league.ts`

**Intent**: Define one source of truth for league input rules that both the server and the client island import.

**Contract**:

- `zod` is added as a dependency.
- `createLeagueSchema` parses:
  - `name`: trimmed, 1–80 chars.
  - `pointsWin`, `pointsDraw`, `pointsLoss`: each required as a non-empty string first, then coerced to an integer 0–99, with a refine that win ≥ draw ≥ loss. Plain `z.coerce.number()` is not enough, because `Number("")` and `Number(null)` are 0, so an empty field would silently pass as 0.
    Snippet: `z.string().trim().min(1, "Required").pipe(z.coerce.number().int().min(0).max(99))`
  - `players`: an array of trimmed, non-empty strings of 1–40 chars, 3–20 entries, with a refine that rejects duplicates by `toLowerCase()` and names the duplicate in the message.
- Exports the inferred `CreateLeagueInput` type.

#### 2. Create endpoint

**File**: `src/pages/api/leagues/index.ts`

**Intent**: Accept the form post, validate it, generate fixtures and create the league atomically.

**Contract**:

- `export const POST: APIRoute`.
- Reads `formData()`. Players come from `form.getAll("players")`, and empty rows are dropped before validation.
- Redirects to `/auth/signin` if `locals.user` is null. Redirects to `/leagues/new?error=<msg>` on a missing client, a validation failure (first zod issue message) or an RPC error. A Postgres `23505` unique violation is mapped to "Player names must be unique".
- On success it calls `supabase.rpc("create_league", …)` with `generateFixtures(players.length)` and redirects to `/leagues/<id>`.

#### 3. Fixtures page

**File**: `src/pages/leagues/[id].astro`

**Intent**: Show the organizer the league they just created and its complete fixture list.

**Contract**:

- Loads the tournament by `id`, then its players and matches ordered by `position`, mapped to `FixtureDTO`.
- Responds with 404 when the tournament isn't returned (not the owner, unknown id, or malformed uuid; PostgREST `22P02` is treated as not found).
- Renders the name, the points as "W 3 / D 1 / L 0", the match count, and a numbered list "1. Anna vs Bartek".
- Uses `Layout` and the existing card styling.

#### 4. Route protection

**File**: `src/middleware.ts`

**Intent**: Keep all league pages and the create endpoint organizer-only.

**Contract**: `PROTECTED_ROUTES` adds `"/leagues"` and `"/api/leagues"`. The endpoint keeps its own `locals.user` guard as defense in depth.

#### 5. Smoke coverage

**File**: `scripts/smoke.mjs`

**Intent**: Exercise migration + RPC + RLS + pages in CI against a real local Supabase.

**Contract**:

- New steps while signed in (before signout):
  - `POST /api/leagues` with 4 players → 302 with location prefix `/leagues/`.
  - `GET` that location → 200.
  - `POST /api/leagues` with duplicate names → 302 with prefix `/leagues/new?error=`.
- A new anonymous step: `GET /leagues/new` → 302 to `/auth/signin`.
- The new POST steps pass the body as an entries array (`[["name","Smoke League"],["players","Anna"],["players","Bartek"],…]`) or as a `URLSearchParams`, because a plain object collapses repeated `players` keys. The existing `request()` helper already feeds `form` through `new URLSearchParams(form)`, which accepts both shapes, so the helper and the existing 8 steps are unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- Extended smoke passes against local preview with local Supabase: `npm run smoke`

#### Manual Verification:

- Posting a 5-player league (e.g. via the smoke script or curl) and opening the redirect shows 10 numbered fixtures in which no player appears twice within each block of 2
- Opening `/leagues/<id>` as a different signed-in user returns 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Create-league form UI

### Overview

Build `/leagues/new` with a React island that has a dynamic player list and client-side validation using the shared schema, and add the dashboard entry point.

### Changes Required:

#### 1. New league page

**File**: `src/pages/leagues/new.astro`

**Intent**: Host the form and show a server error from `?error=`.

**Contract**: Reads `Astro.url.searchParams.get("error")` and renders `<CreateLeagueForm serverError={error} client:load />` inside `Layout`, with the same card styling as the auth pages.

#### 2. Form island

**File**: `src/components/leagues/CreateLeagueForm.tsx`, `src/components/leagues/PlayerListField.tsx`

**Intent**: Let the organizer enter the name, points and a variable list of players with immediate feedback, while still submitting as a native form post.

**Contract**:

- `<form method="POST" action="/api/leagues">`. Points inputs are prefilled 3/1/0 with `name` `pointsWin`/`pointsDraw`/`pointsLoss`.
- `PlayerListField` starts with 3 rows. Each row is an input `name="players"`. "Add player" is disabled at 20 rows and "Remove" is disabled at 3.
- `onSubmit` runs `createLeagueSchema.safeParse` on the collected values and calls `preventDefault()` only on failure, mapping issues to field and row errors.
- Reuses `FormField`, `ServerError` and `SubmitButton` from `src/components/auth/`. Any list-state hook goes in `src/components/hooks/` per AGENTS.md.

#### 3. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Give the organizer a way into the flow.

**Contract**: Adds a "Create league" link-styled `Button` (`buttonVariants`) pointing to `/leagues/new`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- Unit tests pass: `npm run test`
- Smoke passes against local preview: `npm run smoke`

#### Manual Verification:

- From the dashboard, create a 4-player league through the form and land on a page with 6 fixtures
- Entering 'Tomek' and 'tomek ' shows a duplicate-name error without submitting
- Setting draw points higher than win points shows a points error without submitting
- Add/remove buttons respect the 3 and 20 limits, and the form is keyboard-usable

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Exhaustive generator properties for N = 3..20: count, no self-pairs, no duplicates, full coverage, indices in range, distinct players per block.
- Explicit 4-player (6) and 5-player (10, odd) cases, plus the `< 2` error.

### Integration Tests:

- `npm run smoke` in CI against local Supabase: create league → 302 → page 200; duplicate names → error redirect; anonymous `/leagues/new` → sign-in.
- DB invariants (unique lower(name), pair-count check, RLS isolation) are verified manually in Phase 2 (2.6, 2.7) only. CI does not cover them: the smoke test's duplicate-name step is rejected by zod in the endpoint before it reaches the DB. Automated DB tests (pgTAP) are deferred and accepted as a gap for this slice.

### Manual Testing Steps:

1. Sign in, click "Create league", and enter "Office Cup", 3/1/0 and Anna, Bartek, Celina, Darek → 6 fixtures shown.
2. Create a 5-player league → 10 fixtures, and no player appears twice in any block of 2.
3. Try 'Tomek' + 'tomek ' → duplicate error. Try draw 4 with win 3 → points error. Try 2 players → count error.
4. Sign in as a second user and open the first user's `/leagues/<id>` → 404.

## Performance Considerations

At the 20-player maximum the RPC inserts 1 + 20 + 190 rows in one transaction. The page loads a tournament, 20 players and 190 matches. Both are trivial at the PRD's small scale, and no caching is needed.

## Migration Notes

This is the first migration. Locally it runs with `npx supabase db reset`. In CI, `supabase start` in the smoke job applies it. For production, a human runs `npx supabase link --project-ref <ref>` (once) and then `npx supabase db push`. This must happen **before** the PR merges, because merging auto-deploys the Worker. To roll back, drop the three tables and the function in a follow-up migration. No existing data is affected.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-01, FR-001–003, FR-007, Business Logic)
- Endpoint pattern: `src/pages/api/auth/signin.ts:4-20`
- Form island pattern: `src/components/auth/SignInForm.tsx:36-43`
- Route protection: `src/middleware.ts:4,18`
- CI and smoke: `.github/workflows/ci.yml:41`, `scripts/smoke.mjs`
- Deploy and migration policy: `context/changes/development/deployment-plan.md:199`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fixture generator + Vitest

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — b7a23e9
- [x] 1.2 Lint passes: `npm run lint` — b7a23e9
- [x] 1.3 Type check passes: `npx astro check` — b7a23e9

#### Manual

- [x] 1.4 The literal expected 4-player order in `fixtures.test.ts` reads as a sensible schedule (each player once per block of 2) — b7a23e9

### Phase 2: Database schema + RPC

#### Automated

- [x] 2.1 Migration applies on a clean local DB: `npx supabase db reset` — f65042a
- [x] 2.2 Generated types are up to date: `npx supabase gen types typescript --local | diff - src/db/database.types.ts` — f65042a
- [x] 2.3 Lint passes: `npm run lint` — f65042a
- [x] 2.4 Type check passes: `npx astro check` — f65042a
- [x] 2.5 Existing smoke test still passes against local preview: `npm run smoke` — f65042a

#### Manual

- [x] 2.6 Using Studio's SQL editor impersonating an authenticated user, calling `create_league` with 4 names creates 1 tournament, 4 players and 6 matches; a call with a duplicate name ('Tomek', 'tomek') or a wrong fixture count creates nothing — f65042a
- [x] 2.7 Impersonating a second user in Studio's SQL editor, a select cannot see the first user's tournament — f65042a

### Phase 3: Create endpoint + fixtures page

#### Automated

- [x] 3.1 Unit tests pass: `npm run test`
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 Type check passes: `npx astro check`
- [x] 3.4 Build succeeds: `npm run build`
- [x] 3.5 Extended smoke passes against local preview with local Supabase: `npm run smoke`

#### Manual

- [x] 3.6 Posting a 5-player league (e.g. via the smoke script or curl) and opening the redirect shows 10 numbered fixtures in which no player appears twice within each block of 2
- [x] 3.7 Opening `/leagues/<id>` as a different signed-in user returns 404

### Phase 4: Create-league form UI

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 Build succeeds: `npm run build`
- [ ] 4.4 Unit tests pass: `npm run test`
- [ ] 4.5 Smoke passes against local preview: `npm run smoke`

#### Manual

- [ ] 4.6 From the dashboard, create a 4-player league through the form and land on a page with 6 fixtures
- [ ] 4.7 Entering 'Tomek' and 'tomek ' shows a duplicate-name error without submitting
- [ ] 4.8 Setting draw points higher than win points shows a points error without submitting
- [ ] 4.9 Add/remove buttons respect the 3 and 20 limits, and the form is keyboard-usable
