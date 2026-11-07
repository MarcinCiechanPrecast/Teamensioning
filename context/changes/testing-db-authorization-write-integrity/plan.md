# DB Authorization and Write Integrity Tests — Implementation Plan

## Overview

This is rollout Phase 1 of `context/foundation/test-plan.md`. It adds a Vitest `integration` project that calls the local Supabase database **directly with the public anon key**, as anon and as two signed-up users. The goal is to prove the database rules behind risks #1, #2 and #4:

- a score can be entered only once, including when two submissions arrive at the same moment;
- a share link can't write into another tournament or store an invalid score;
- every organizer-only write is refused for anyone who isn't the owner.

No app code or schema changes. Only tests, test configuration and docs.

## Current State Analysis

- The database already enforces all three risks. Research found no bypass (`research.md` §Summary). The tests in this plan are regression guards on the rules that actually enforce each guarantee.
- **Existing coverage stops at the endpoints.** `scripts/smoke.mjs` covers:
  - a second submission one after the other (`:163-175`)
  - a match from another tournament (`:196-231`)
  - an out-of-range score (`:176-180`)
  - a delete by another owner (`:307-319`)

  Every one of these goes through zod first. Unit tests cover only the pure functions that map outcomes to codes (`src/lib/services/score-submission.test.ts`, `score-correction.test.ts`).

- **No test covers:**
  - direct RPC or table calls with the anon key
  - two submissions at the same moment
  - a score correction by a non-owner
  - a settings edit by a non-owner or by anon
  - direct UPDATE/DELETE on `results` or `tournaments`
- `vitest.config.ts:11-12` includes every `src/**/*.test.ts` file. `npm test` runs in the CI `ci` job, which has no database (`.github/workflows/ci.yml:22`).
- Locally, `.env` points at `127.x` (local Supabase), but nothing stops a misconfigured `.env` from pointing at production.

## Desired End State

- `npm run test:integration` runs a DB-level suite against a running local Supabase (`npx supabase start`) and passes.
- `npm test` still runs only the unit tests and doesn't need a database.
- Each covered guarantee has a test that fails if the rule is removed. Manual mutation checks in Phases 2 and 3 confirm this.
- The suite refuses to start unless `SUPABASE_URL` points at `localhost` or `127.0.0.1`.
- Test-plan §6.2 and §6.3 describe how to add the next test of this kind.

### Key Discoveries:

- **Write-once rule:** the `results` primary key plus `on conflict (match_id) do nothing` inside the `security definer` function `submit_match_score`, which returns `already_entered` (`supabase/migrations/20261102130000_add_update_tournament_settings.sql:105-113`). The function is granted to `anon` (`:120`).
- **Token binding:** the token and match id are joined inside that same function (`:94-99`). A mismatch returns `not_found`.
- **Score bounds:** check constraints of 0–99 and `not null` (`supabase/migrations/20261025130000_add_match_results.sql:15-19`).
- **Correction:** the `results_update_own` RLS rule plus a permission that allows updating only `score_a`/`score_b` (`supabase/migrations/20261102120000_add_results_owner_update_policy.sql:10-26`). `results` has no INSERT/DELETE rule and no rule at all for anon.
- **Delete:** the `tournaments_delete_own` rule, for `authenticated` only (`supabase/migrations/20261025140000_add_tournament_delete_policy.sql:8-10`).
- **Settings:** `update_tournament_settings` checks the owner itself (`security definer`) and is revoked from `anon` (`20261102130000_add_update_tournament_settings.sql:41-49,74`). `tournaments` has no UPDATE rule (`:9`).
- **RLS refusals return 0 rows, not an error.** A refused UPDATE/DELETE succeeds with 0 rows; anon calling the settings function fails with a permission error (`research.md` §Risk #2).
- **No admin key needed:** signing up works locally because email confirmation is off (`supabase/config.toml:209`). `create_league` is granted to `authenticated` and takes `p_fixtures` as `{a,b}` index pairs (`20261023120000_create_league_schema.sql:116-125,189-190`). `generateFixtures(n)` builds exactly that shape (`src/lib/services/fixtures.ts:13`).
- Typed RPC signatures exist in `src/db/database.types.ts:176-205`.

## What We're NOT Doing

- No CI wiring. Running the integration project in the `smoke` job is test-plan Phase 4.
- No HTTP endpoint tests and no new `scripts/smoke.mjs` steps (decided: test the database layer only).
- No pgTAP. It can't test two simultaneous submissions, and it skips the API layer the anon key goes through (`research.md` §Layer choice).
- No admin (service-role) client, and no seed users or `supabase/seed.sql`.
- Risks #5 (points lock) and #6 (owner adding players or matches after creation) belong to test-plan Phase 2. That includes the owner's direct `players`/`matches` inserts noted in research.
- No changes to migrations, endpoints or services. If a test reveals a real defect, stop and raise it. Don't edit the test to match.

## Implementation Approach

- **Harness first:** Vitest projects, the env guard, and fixture helpers, proven by one sanity test.
- **Then the anonymous write path (#1, #4):** it's the most exposed surface, reachable with a public key and a shared link.
- **Then organizer-only writes (#2).**
- **How the suite works:**
  - Every test builds its own data: fresh users with random emails and fresh leagues.
  - Each test reads the data back as the owner, through the owner's own RLS access, to confirm what is or isn't stored.
  - Every refusal test has an owner **control** next to it, showing the same write succeeds when it's allowed. Without that, a broken fixture would make every refusal test pass trivially.
- **Where expected values come from:** the PRD and access rules, not the SQL:
  - "first submission wins / link holder can't change an entered score" (PRD FR-009, US-01 acceptance criteria)
  - "only the admin manages the tournament" (PRD Access Control)
  - "a link grants access to one tournament" (roadmap S-03)
  - "scores are whole numbers 0–99" (S-04 decision, shown to users in `SCORE_ERROR_MESSAGES`)

## Critical Implementation Details

- **Don't assert exact error codes for refusals.** Assert the shape (error present, or 0 rows returned) plus an owner read-back showing the data unchanged. Exact codes from PostgREST and RLS (42501 vs a PostgREST wrapper) are not product requirements.
- **Clients:** each simulated actor gets its own `createClient` instance with `auth: { persistSession: false, autoRefreshToken: false }`. Otherwise sessions leak between actors in a single Node process.
- **Simultaneous submissions:** fire both calls with `Promise.all` from two separate anon clients, so they go out as separate HTTP requests and separate DB transactions. Run it on more than one match in the same test, so a lucky ordering doesn't hide a regression.

## Phase 1: Integration Harness

### Overview

Split Vitest into `unit` and `integration` projects, add the npm script, the localhost-only guard and the fixture helpers, and prove they work with one sanity test.

### Changes Required:

#### 1. Vitest projects

**File**: `vitest.config.ts`

**Intent**: Keep `npm test` DB-free while letting the integration suite share the `@` alias. Load `SUPABASE_*` variables from `.env` only for the integration project.

**Contract**:

- `test.projects`:
  - `unit`: includes `src/**/*.test.ts`, excludes `src/**/*.integration.test.ts`.
  - `integration`: includes `src/**/*.integration.test.ts`. Gets `env` from Vite's `loadEnv(mode, process.cwd(), "SUPABASE_")`. Uses a longer `testTimeout` (for example 30 s) and `fileParallelism: false`.
- Both projects use `extends: true` to inherit the root `resolve.alias`.

#### 2. npm scripts

**File**: `package.json`

**Intent**: Separate entry points for each suite.

**Contract**: `"test": "vitest run --project unit"`, `"test:integration": "vitest run --project integration"`.

#### 3. Env guard and clients

**File**: `src/test/integration/supabase-test-env.ts` (new)

**Intent**: A single place that reads `SUPABASE_URL`/`SUPABASE_KEY` and refuses to run against anything except a local Supabase. It also builds clients that don't share state.

**Contract**:

- `assertLocalSupabaseUrl(url: string | undefined): string` throws a clear message unless the URL parses and its hostname is `localhost` or `127.0.0.1`.
- `anonClient(): SupabaseClient<Database>` returns a fresh client with persistence and auto-refresh off.
- If `SUPABASE_KEY` is missing, the error message says to start local Supabase and copy `.env.example`.

#### 4. Fixture helpers

**File**: `src/test/integration/fixtures.ts` (new)

**Intent**: Create real actors and leagues through the same public surface the app uses, then clean them up as the owner.

**Contract**:

- `signUpUser(): Promise<{ client; userId }>` signs up `it-<uuid>@example.test` with a random password and returns a client holding that session.
- `createLeagueAs(owner, playerNames): Promise<{ tournamentId; shareToken; matchIds }>`:
  - calls `create_league` with points 3/1/0 and `generateFixtures(n)`;
  - then reads `share_token` and the match ids (ordered by `position`) back as the owner.
- `readResultAs(owner, matchId)` and `readTournamentAs(owner, id)` are the owner read-backs used to check data is unchanged.
- `deleteLeagueAs(owner, id)` is for `afterAll`.

#### 5. Unit test for the guard

**File**: `src/test/integration/supabase-test-env.test.ts` (new, `unit` project)

**Intent**: The production-safety guard is a pure function, so prove it the cheapest way.

**Contract**:

- Accepts `http://127.0.0.1:54321` and `http://localhost:54321`.
- Rejects `https://<ref>.supabase.co`, `undefined`, an empty string, and a lookalike such as `http://127.0.0.1.evil.example`.

#### 6. Sanity integration test

**File**: `src/test/integration/harness.integration.test.ts` (new)

**Intent**: Prove the fixtures produce a real league that anon can reach through the share link before any risk test relies on them.

**Contract**:

- The owner creates a 4-player league.
- Anon `get_shared_league(token)` returns 4 players and 6 matches. The expected 6 comes from PRD US-01 ("4 players → 6 matches").
- `afterAll` deletes the league as its owner.

### Success Criteria:

#### Automated Verification:

- Unit suite passes without a database: `npm test`
- `npm test` does not run any `*.integration.test.ts` file (the Vitest output lists only the `unit` project)
- Integration sanity test passes against local Supabase: `npm run test:integration`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- Pointing `SUPABASE_URL` at a non-local URL (temporarily, in the shell) makes `npm run test:integration` fail immediately with the guard message, before any network call

**Implementation Note**: After automated verification passes, pause for the human to confirm the manual check before proceeding.

---

## Phase 2: Anonymous Write Path (Risks #1, #4)

### Overview

Test `submit_match_score` and direct table access as anon, with every outcome checked by an owner read-back.

### Changes Required:

#### 1. Anonymous write-path tests

**File**: `src/test/integration/anon-score-write.integration.test.ts` (new)

**Intent**: Prove a link holder can store each match's score exactly once, only inside their own tournament, and only as whole numbers 0–99, even when calling the database directly and bypassing the endpoint and zod.

**Contract**: The test cases are below. Each one states the behavior asserted, the regression it catches, its research source, the edge case and the anti-pattern avoided.

- **Write-once, one after the other (#1)**
  - **Asserts:** the first call returns `created`. A second call with a different score returns `already_entered`. Owner read-back shows the first score.
  - **Catches:** `on conflict do nothing` replaced by an upsert, or the primary key dropped.
  - **Source:** research §Risk #1.
  - **Edge case:** the second score differs in both fields.
  - **Avoids:** going through the endpoint, which smoke already covers.
- **Write-once, simultaneous (#1)**
  - **Asserts:** on each of 3 matches, two anon clients submit different scores at once (`Promise.all`). The statuses are exactly one `created` and one `already_entered`. The stored score equals the payload of the call that got `created`.
  - **Catches:** check-then-insert logic that loses the race.
  - **Source:** research §Risk #1.
  - **Edge case:** the winner isn't known in advance, so the test asserts against whichever call won.
  - **Avoids:** an ordering assumption ("the first call wins").
- **No direct table writes by anon (#1)**
  - **Asserts:** anon `insert` into `results` for an unplayed match fails, and the owner read-back shows no result. Anon `update` and `delete` on an existing result return 0 rows, and the owner read-back shows it unchanged.
  - **Catches:** an accidental anon or permissive rule on `results`.
  - **Source:** research §Risk #1, the RLS rules on `results`.
  - **Avoids:** asserting only `error === null`.
- **Another tournament's match is refused (#4)**
  - **Asserts:** a valid token for league A with a match id from league B (different owners) returns `not_found`. League B's owner read-back shows no result.
  - **Catches:** the token/match join loosened to match on match id alone.
  - **Source:** research §Risk #4.
  - **Edge case:** both token and match id are individually valid.
  - **Avoids:** a nonexistent match id, which proves nothing about the binding.
- **Out-of-range and missing scores rejected at the DB (#4)**
  - **Asserts:** calling the RPC directly with `100`, `-1`, and `null` for one score each produces an error. Owner read-back shows no result stored. `0` and `99` are accepted, each on its own match (boundary controls).
  - **Catches:** check or not-null constraints dropped.
  - **Source:** research §Risk #4, PRD/S-04 "0–99".
  - **Edge case:** both ends of the range.
  - **Avoids:** testing only the zod schema.
- **Unknown token (#4)**
  - **Asserts:** a well-formed 64-hex token that matches no tournament, with a real match id, returns `not_found`, and nothing is stored.
  - **Catches:** the token check removed.
  - **Source:** research §Risk #4.

### Success Criteria:

#### Automated Verification:

- Integration suite passes: `npm run test:integration`
- Unit suite still passes: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Mutation check (local only, reverted afterwards):
  1. Add a throwaway local migration that redefines `submit_match_score` with `on conflict (match_id) do update set score_a = excluded.score_a, score_b = excluded.score_b`.
  2. Run `npx supabase db reset`.
  3. Confirm the sequential and simultaneous write-once tests fail.
  4. Delete the throwaway migration and reset again.
- Mutation check (local only, reverted afterwards): with the token join reduced to `m.id = p_match_id`, the other-tournament test fails.

**Implementation Note**: After automated verification passes, pause for the human to confirm the mutation checks before proceeding.

---

## Phase 3: Organizer-Only Writes (Risk #2)

### Overview

Prove each of the three ways organizer writes are protected refuses a non-owner and anon, with owner controls showing each write works when it's allowed.

### Changes Required:

#### 1. Organizer authorization tests

**File**: `src/test/integration/organizer-authorization.integration.test.ts` (new)

**Intent**: Prove "only the admin manages the tournament" (PRD Access Control) at the database for score correction, settings edit, delete, and a direct tournament update. A refused write must leave the data unchanged.

**Contract**: Fixtures are an owner, a second signed-up user (non-owner) and anon. Each test uses its own league so a positive control can't disturb a refusal test.

- **Score correction (RLS rule plus column permission)**
  - **Asserts:** non-owner `update results set score_a/score_b` returns 0 rows; anon does the same. The owner read-back shows the original score. **Control:** the owner's identical update returns 1 row and the read-back shows the new score.
  - **Catches:** `results_update_own` widened or dropped.
  - **Source:** research §Risk #2.
  - **Avoids:** treating "no error" as refusal.
- **Settings edit (owner check inside the definer function)**
  - **Asserts:** non-owner `update_tournament_settings` with a new name and points returns `not_found`. Anon's call returns an error. In both cases the owner read-back shows name and points unchanged. **Control:** the owner's rename returns `updated` and the read-back shows the new name.
  - **Catches:** the owner predicate removed from the function, or the anon revoke lost.
  - **Source:** research §Risk #2.
  - **Edge case:** anon is refused with an error, not 0 rows.
  - **Avoids:** pinning an exact error code.
- **Delete (RLS rule)**
  - **Asserts:** non-owner `delete from tournaments` returns 0 rows; anon does the same. The owner can still read the tournament and its matches. **Control:** the owner's delete returns 1 row, then the owner's read returns nothing, and anon `get_shared_league` with the old token returns null.
  - **Catches:** `tournaments_delete_own` widened.
  - **Source:** research §Risk #2.
  - **Avoids:** checking only the HTTP status (smoke territory).
- **Direct tournament update (no UPDATE rule)**
  - **Asserts:** a direct `update tournaments set name` returns 0 rows for the non-owner, for anon, **and for the owner**. Read-back shows the name unchanged.
  - **Catches:** a new UPDATE rule that would let anyone, including the owner, skip the function's ownership and points-lock checks.
  - **Source:** research §Risk #2.
  - **Edge case:** the owner is refused here too.
  - **Avoids:** assuming a direct update is harmless because the UI doesn't make one.

### Success Criteria:

#### Automated Verification:

- Integration suite passes: `npm run test:integration`
- Unit suite still passes: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Mutation check (local only, reverted afterwards): replacing `results_update_own` with a rule using `using (true)` makes the non-owner correction test fail
- Mutation check (local only, reverted afterwards): removing `and t.owner_id = (select auth.uid())` from `update_tournament_settings` makes the non-owner settings test fail

**Implementation Note**: After automated verification passes, pause for the human to confirm the mutation checks before proceeding.

---

## Phase 4: Cookbook and Docs

### Overview

Record the shipped patterns so the next DB-level test follows them.

### Changes Required:

#### 1. Test-plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 and §6.3 placeholders with the real patterns, and add a §6.6 note.

**Contract**:

- **§6.2** "Adding an RLS / authorization integration test": location `src/test/integration/*.integration.test.ts`; reference test `organizer-authorization.integration.test.ts`; the rule "refusal = 0 rows or error, plus owner read-back, plus owner control"; no admin key; run with `npx supabase start` then `npm run test:integration`.
- **§6.3** "Adding an anonymous-write integrity test": reference `anon-score-write.integration.test.ts`; call the RPC directly with the anon key; simultaneous calls via separate clients and `Promise.all`; assert against whichever call won.
- **§6.6**: a 2–3 line note on the localhost guard and the mutation-check habit.
- Bump "Last updated".
- Leave §3 Status to the orchestrator.

#### 2. Agent commands

**File**: `AGENTS.md`

**Intent**: Make the new command discoverable next to `npm test`.

**Contract**: Add one line to `## Commands`: `npm run test:integration` runs the DB-level suite against local Supabase (`npx supabase start` first) and refuses non-local URLs. Change the `npm test` line to say "Vitest unit tests (no DB)".

### Success Criteria:

#### Automated Verification:

- No `TBD — see §3 Phase 1` placeholders remain in test-plan §6: `grep -c "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns 0
- Prettier is clean for the edited markdown: `npx prettier --check context/foundation/test-plan.md AGENTS.md`

#### Manual Verification:

- A reader can add a new authorization test from §6.2 alone, without opening research.md

---

## Testing Strategy

### Unit Tests:

- `assertLocalSupabaseUrl`: the local hosts are accepted; remote, empty, missing and lookalike hosts are rejected.

### Integration Tests:

- Phase 2: write-once one after the other and simultaneous, direct table writes refused, another tournament's match refused, DB-level bounds (rejecting -1, 100 and null; accepting 0 and 99), unknown token.
- Phase 3: correction, settings, delete, direct update, each tried by a non-owner and by anon, each with an owner control and an owner read-back.

### Manual Testing Steps:

1. `npx supabase start`, then `npm run test:integration`: everything passes.
2. Run the mutation checks listed in Phases 2 and 3, one at a time, then reset the local DB.
3. Run with a remote `SUPABASE_URL` in the shell and confirm the guard stops the run.

## Performance Considerations

Each run signs up 2–3 users per file and creates a few small leagues on local Postgres, which should take seconds. `fileParallelism: false` keeps auth rate limits and log output predictable.

## Migration Notes

None. No schema changes. Test users stay in local `auth.users` until `npx supabase db reset`.

## References

- Research: `context/changes/testing-db-authorization-write-integrity/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (risks #1, #2, #4), §3 Phase 1
- Existing endpoint coverage: `scripts/smoke.mjs:150-231,287-319`
- Fixture shape: `src/lib/services/fixtures.ts:13`, `supabase/migrations/20261023120000_create_league_schema.sql:116-125`
- Vitest projects and `--project`: Context7 `/vitest-dev/vitest/v5.0.3` (checked 2026-11-07)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration Harness

#### Automated

- [x] 1.1 Unit suite passes without a database: `npm test` — 17ad858
- [x] 1.2 `npm test` does not run any `*.integration.test.ts` file — 17ad858
- [x] 1.3 Integration sanity test passes against local Supabase: `npm run test:integration` — 17ad858
- [x] 1.4 Lint passes: `npm run lint` — 17ad858
- [x] 1.5 Type check passes: `npx astro check` — 17ad858

#### Manual

- [x] 1.6 Non-local `SUPABASE_URL` makes the integration run fail immediately with the guard message — 17ad858

### Phase 2: Anonymous Write Path (Risks #1, #4)

#### Automated

- [x] 2.1 Integration suite passes: `npm run test:integration` — c628b47
- [x] 2.2 Unit suite still passes: `npm test` — c628b47
- [x] 2.3 Lint passes: `npm run lint` — c628b47

#### Manual

- [x] 2.4 Mutation check: upsert in `submit_match_score` fails the write-once tests — c628b47
- [x] 2.5 Mutation check: loosened token join fails the other-tournament test — c628b47

### Phase 3: Organizer-Only Writes (Risk #2)

#### Automated

- [x] 3.1 Integration suite passes: `npm run test:integration` — 9ab115d
- [x] 3.2 Unit suite still passes: `npm test` — 9ab115d
- [x] 3.3 Lint passes: `npm run lint` — 9ab115d

#### Manual

- [x] 3.4 Mutation check: permissive `results_update_own` fails the non-owner correction test — 9ab115d
- [x] 3.5 Mutation check: owner predicate removed from `update_tournament_settings` fails the non-owner settings test — 9ab115d

### Phase 4: Cookbook and Docs

#### Automated

- [x] 4.1 No `TBD — see §3 Phase 1` placeholders remain in test-plan §6
- [x] 4.2 Prettier is clean for the edited markdown

#### Manual

- [x] 4.3 A reader can add a new authorization test from §6.2 alone
