# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-12

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`, `scripts/` (excluded: `context/`, `dist/`, `node_modules/`, `.claude/worktrees/`). 33 commits in the 30 days before 2026-11-07.

Interview note: the Phase 2 interview answers were **inferred** (the user delegated: "get the most obvious answers"). They are drawn from PRD guardrails, archived-plan test gaps and hot-spot data, so they carry less weight than lived-incident evidence. Re-run `--refresh` if real incidents contradict them.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                           | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A schema change lets a link holder overwrite a score that is already entered, or lets two concurrent submissions for the same match both land (regression guard: research found the rule DB-enforced and not currently breakable) | High   | Medium     | PRD US-01 AC "link holder cannot change a score once entered", FR-009; roadmap S-04 risk; interview Q1 (inferred); hot-spot dir `supabase/migrations` (6/30d; the anonymous write path was redefined twice); research Phase 1: smoke covers the sequential case through the endpoint only                                                                                                        |
| 2   | A signed-in user who does not own a tournament (or an anonymous caller) corrects a score, edits settings, or deletes that tournament                                                                                              | High   | High       | PRD Access Control "only the admin manages the tournament"; archive `create-league-with-fixtures` plan: RLS isolation verified manually only, pgTAP deferred; archive `organizer-score-correction` plan: ownership rule has no automated regression test; hot-spot dir `supabase/migrations` (6/30d)                                                                                             |
| 3   | The leaderboard disagrees with the stored results — wrong points for the tournament's settings, wrong tiebreak order, an unplayed match awarding points, or a correction not reflected on the next view                           | High   | Medium     | PRD Guardrail 1, FR-008, NFR (no stale standings); roadmap S-05/S-06 risks; interview Q2 (inferred); hot-spot dir `src/lib/services` (16/30d)                                                                                                                                                                                                                                                    |
| 4   | An anonymous score submission writes into a match of a different tournament than the share token belongs to, or stores an invalid score (negative, non-integer, absurd) because the server trusts the form                        | High   | Medium     | PRD Access Control (link grants one tournament); roadmap S-03 risk "link must grant access to one tournament only", S-04 unknown on valid scores; abuse lens: untrusted input / IDOR; hot-spot dir `supabase/migrations` (6/30d); research Phase 1: the anonymous write path is callable directly with the public anon key, bypassing endpoint validation, and smoke only exercises the endpoint |
| 5   | Win/draw/loss points can be changed after the first score is entered, retroactively reshuffling the table                                                                                                                         | Medium | Medium     | PRD FR-013; roadmap S-07 risk (points lock depends on knowing whether any score exists); interview Q3 (inferred); hot-spot dir `supabase/migrations`                                                                                                                                                                                                                                             |
| 6   | A league is stored with a missing or duplicate pairing, or with two players whose names differ only by case, breaking "every pair meets exactly once"                                                                             | High   | Low        | PRD Guardrail 2, FR-003, FR-007; archive `create-league-with-fixtures` plan: DB invariants (case-insensitive unique name, pair count) verified manually only; smoke duplicate-name step never reaches the DB; research Phase 1: the owner can still insert players/matches directly after creation (owner-only, breaks exactly-once)                                                             |
| 7   | A migration applied by the CI `migrate` job breaks the already-deployed Worker, or fails on production data although it applied cleanly to a fresh database                                                                       | High   | Medium     | AGENTS.md CI section (Workers Builds deploys in parallel with `migrate`; migrations must stay backward compatible); interview Q1 (inferred); hot-spot dir `supabase/migrations` (6/30d)                                                                                                                                                                                                          |
| 8   | A score entry or correction corrupts a cup bracket: a draw is accepted, the winner lands in the wrong slot or none, or a correction after the next round was played rewrites played matches                                       | High   | Medium     | PRD cup FRs (FR-016, FR-017); `context/changes/add-cup-format/frame.md`; correction trigger risk (the correction is a direct owner update, guarded only by a DB trigger)                                                                                                                                                                                                                         |
| 9   | A cup is stored with a wrong bracket: a missing or duplicate match, a player placed twice, seeds 1 and 2 in the same half, byes not given to the top seeds                                                                        | High   | Low        | PRD cup FRs (FR-014, FR-015); `context/changes/add-cup-format/frame.md`; PRD Guardrail on cup consistency                                                                                                                                                                                                                                                                                        |

High-impact × low-likelihood infrastructure failures (Supabase or Workers outage) belong to observability, not tests; app-level error tracking is parked in the roadmap.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                                                                      | Must challenge                                                                                                                                                                                                    | Context `/10x-research` must ground                                                                                                                              | Likely cheapest layer                                                                                                            | Anti-pattern to avoid                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | A second submission for an already-scored match — sequential or concurrent, made directly against the database with the anon key — leaves the first score unchanged and reports already entered; direct table writes to results by anon are refused                              | "The UI hides the form for scored matches, so overwrite is impossible" — the anonymous write path is callable without the UI or the endpoint                                                                      | The anonymous write path end to end, where "first wins" is enforced (app vs DB constraint vs RPC), what the anon role may write                                  | integration against local Supabase as `anon`, calling the DB directly (concurrency via parallel calls)                           | Testing only the validation helper; mocking the Supabase client so the DB rule is never exercised; re-testing through the endpoint what smoke already covers                  |
| #2   | Every organizer-only write (correct score, edit name/points, delete, direct table update) is refused for a different authenticated user and for anon, and an owner read-back shows the data unchanged                                                                            | "The page checks ownership, so the DB is safe" — RLS is the only real access control; and "no error means refused" — an RLS-refused update/delete returns success with 0 rows                                     | Per-table, per-role RLS policies and any `security definer` functions; how endpoints derive the tournament id; the exact shape of each refusal (error vs 0 rows) | integration against local Supabase with two authenticated users + anon                                                           | Asserting only the HTTP status or `error === null`; using a service-role client that bypasses RLS                                                                             |
| #3   | Given persisted results and a tournament's own points settings, the leaderboard rows (P/W/D/L/GF/GA/GD/Pts and order) equal values computed by hand from the PRD rules, including after a correction                                                                             | "The standings unit tests pass, so the page is right" — the path from stored rows to rendered table, and caching, are untested                                                                                    | How stored results reach the standings calculation, whether points settings are read per tournament, any caching between write and next view                     | unit for calculation edges, one integration for stored-rows → leaderboard                                                        | Expected values copied from the implementation (oracle problem); only testing 3/1/0 defaults                                                                                  |
| #4   | A valid token posting a match id from another tournament, or an out-of-range score, is rejected server-side with nothing stored                                                                                                                                                  | "Zod validation in the endpoint covers it" — zod is a UX layer; the DB write path is callable directly with the public anon key, and smoke's out-of-range step never reaches the DB                               | Token → tournament → match binding inside the RPC; server-side score bounds vs client-side; whether the RPC is exposed to anon directly                          | integration as `anon` calling the RPC directly                                                                                   | Testing only the zod schema; happy-path-only                                                                                                                                  |
| #5   | After one score exists, any attempt to change points is refused and the stored points are unchanged; renaming still works                                                                                                                                                        | "The form disables the points fields" — the lock must hold at the write boundary                                                                                                                                  | Where the lock is enforced (endpoint vs RPC vs policy), and whether a correction-to-null re-opens it                                                             | integration                                                                                                                      | Asserting disabled inputs in HTML instead of the write outcome                                                                                                                |
| #6   | The DB itself refuses a league with a duplicate (case-insensitive) name or a wrong pair count, independent of the app validation; and adding players/matches after creation is either refused or an explicitly accepted owner-only gap                                           | "Fixture generator unit tests are enough" — DB invariants are the last guard and were only checked by hand                                                                                                        | DB constraints and the create-league RPC's checks                                                                                                                | integration against local Supabase                                                                                               | Re-testing the generator; asserting through zod so the DB never sees the bad input                                                                                            |
| #7   | New migrations apply on top of a database that already holds data from the previous schema, and the previous release's critical calls still work against the new schema                                                                                                          | "Smoke passes on a fresh DB, so production is fine" — fresh apply proves nothing about existing rows or old code                                                                                                  | How CI runs `migrate` vs deploy; seed data shape; which calls the deployed Worker makes                                                                          | CI gate (apply-on-seeded-DB + smoke)                                                                                             | A full e2e suite for a schema concern; testing migrations only on an empty database                                                                                           |
| #8   | A draw is refused with nothing stored; a valid score puts the winner in the right next-round slot; a round-2 score before both slots are filled is refused; an owner correction before the next round rewrites the slot, after it is refused and an owner read-back is unchanged | "The form blocks equal scores, so draws can't happen" — the anonymous write path and the owner update are callable directly; "the page hides the correction form" — the guard must hold for a direct owner update | The cup branch of the anonymous score write, the trigger on results and its refusal code, how winners map to `next_slot`, the lock shared with the league path   | unit for the generator, integration against local Supabase for the score write and the trigger, one e2e for the rendered bracket | Asserting only the HTTP status or the rendered bracket; expected slots copied from the SQL instead of worked out from the PRD; skipping the "owner read-back unchanged" check |
| #9   | For every N in 3 to 20 the stored bracket has N-1 matches, each player exactly once in round 1 or as a bye, byes on seeds 1..S-N, and seeds 1 and 2 in different halves; the DB refuses a wrong match count or an out-of-range player count                                      | "The generator unit tests are enough" — the creation RPC is the last guard and can be called with input the generator would never send                                                                            | The generator contract, the cup creation RPC's checks, how bye players are placed in round 2                                                                     | unit for the generator, integration for the creation RPC                                                                         | Re-testing the generator through the DB; only checking power-of-two counts                                                                                                    |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                             | Goal (one line)                                                                                                                     | Risks covered                 | Test types                                   | Status   | Change folder                                                        |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------- | -------- | -------------------------------------------------------------------- |
| 1   | DB authorization and write integrity   | Prove at the Supabase boundary that anon and non-owners cannot overwrite, cross tournaments, or perform organizer writes            | #1, #2, #4                    | integration (local Supabase, anon + 2 users) | complete | context/archive/2026-11-07-testing-db-authorization-write-integrity/ |
| 2   | Guardrail correctness from stored data | Prove the leaderboard, points lock and DB invariants hold for persisted data, not just pure functions                               | #3, #5, #6                    | unit (edge cases) + integration              | complete | context/archive/2026-11-07-testing-guardrail-correctness/            |
| 3   | Critical flow in the browser           | One US-01 browser run (create → share → enter score → leaderboard → correction), only where it adds signal over smoke + integration | #3, #1 (cross-check)          | e2e (Playwright)                             | complete | context/archive/2026-11-07-testing-critical-flow-e2e/                |
| 4   | Quality-gates wiring                   | Run the integration suite in CI against local Supabase, add migration-on-seeded-DB check, wire an agent post-edit hook              | #7, cross-cutting             | gates, hook                                  | complete | context/archive/2026-11-07-testing-quality-gates/                    |
| 5   | Cup format coverage                    | Prove the cup bracket is generated, stored, advanced and corrected correctly, with one browser run of the bracket                   | #8, #9, #3 (cross-check, n/a) | unit + integration + e2e                     | complete | context/archive/2026-10-25-add-cup-format/                           |

## 4. Stack

| Layer            | Tool                   | Version | Notes                                                                                                                                                                         |
| ---------------- | ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit             | Vitest                 | ^5.0.5  | `src/**/*.test.ts`; 8 files, all in `src/lib/{services,validation}` (test base: sparse)                                                                                       |
| integration (DB) | none yet — see Phase 1 | —       | Local Supabase (`npx supabase start`) already used by CI smoke; research picks Vitest-against-local-Supabase vs pgTAP                                                         |
| smoke            | `scripts/smoke.mjs`    | n/a     | Dependency-free auth-flow smoke against production preview in CI                                                                                                              |
| e2e              | Playwright Test        | ^1.65.0 | `tests/e2e/`; `npm run test:e2e` builds and previews the app on port 4400 against local Supabase; one US-01 spec (Phase 3). Setup facts in `context/foundation/test-stack.md` |
| UI literal guard | `npm run check:ui`     | n/a     | All views (.astro + .tsx under src/pages, src/components, src/layouts; ui/ primitives exempt), proven by scripts/check-ui-literals.test.ts                                    |

**Stack grounding tools (current session):**

- Docs: Context7 — available, not queried yet; Phase 1 research should use it for Supabase local testing/RLS and Vitest setup; checked: 2026-11-07
- Search: web search (deferred tool) — not used; checked: 2026-11-07
- Runtime/browser: built-in browser pane and Claude in Chrome — possible Phase 3 verification aid, not a test layer; checked: 2026-11-07
- Provider/platform: GitHub via `gh` CLI; no Supabase or Cloudflare MCP in current session; checked: 2026-11-07

## 5. Quality Gates

| Gate                                             | Where                                              | Required?                         | Catches                                                 |
| ------------------------------------------------ | -------------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| lint + typecheck (`npm run lint`, `astro check`) | local + CI (`pr.yml` `ci`)                         | required                          | syntactic / type drift                                  |
| unit (`npm test`)                                | local + CI (`pr.yml` `ci`)                         | required                          | logic regressions in services/validation                |
| smoke on production preview + local Supabase     | CI (`pr.yml` `smoke`)                              | required                          | broken auth flow, migrations not applying to a fresh DB |
| integration against local Supabase               | CI (`pr.yml` `smoke`, `migration-upgrade`) + local | required (CI since §3 Phase 4)    | RLS / write-integrity / invariant regressions           |
| migration on seeded DB                           | CI (`pr.yml` `migration-upgrade`)                  | required (since §3 Phase 4)       | migrations breaking existing data or old code           |
| e2e on US-01                                     | CI (`pr.yml` `e2e`)                                | optional after §3 Phase 3         | broken critical user path                               |
| post-edit + end-of-turn hooks                    | local (agent loop, Claude Code)                    | recommended (wired in §3 Phase 4) | lint / unit / type regressions at edit time             |

The required CI gates are enforced by branch protection on `master`: the `ci`, `smoke` and `migration-upgrade` checks must pass and the branch must be up to date. They run on pull requests only, not again after the merge.

## 6. Cookbook Patterns

### 6.1 Adding a unit test

- **Location**: next to the unit under test, `src/lib/**/<module>.test.ts`.
- **Reference test**: `src/lib/services/standings.test.ts`.
- **Run locally**: `npm test` (the Vitest `unit` project; never needs a database).
- **Standings and points edge cases** (`computeStandings`):
  - Work every expectation out by hand from PRD FR-008 (points, then goal difference, then goals scored; an unplayed match gives nothing) and write the arithmetic in a comment above the assertion. Never paste the function's output in as the expected value.
  - Assert `[name, rank, …]` tuples, not just names: a missing tiebreak often keeps the alphabetical order and only shows up in the rank.
  - Pick scores so the tiebreak under test goes **against** alphabetical order (the name fallback otherwise hides a missing tiebreak).
  - Cover non-default points, including degenerate but valid settings (1/1/0, 0/0/0; the DB allows `win >= draw >= loss`, 0–99).
  - Shared ranks are competition ranks (1, 2, 2, 4). The order of fully level players is a display choice, not a PRD rule; assert their shared rank.

### 6.2 Adding an RLS / authorization integration test

- **Location**: `src/test/integration/<area>.integration.test.ts`. The `.integration.test.ts` suffix puts it in the Vitest `integration` project and keeps it out of `npm test`.
- **Reference test**: `src/test/integration/organizer-authorization.integration.test.ts`.
- **Actors**: `signUpUser()` for the owner and a second user, `anonClient()` for anon. Each gets its own client. Never use a service-role key: it bypasses the rules under test.
- **Data**: `leagueCleanup().create(owner, names)` for a fresh league per test, then `afterAll(() => leagues.run())`.
- **A refusal is three assertions**:
  1. the attacker's call returns an error or 0 rows (`data ?? []` has length 0);
  2. the owner's read-back (`readResultAs`, `readTournamentAs`) shows the data unchanged;
  3. an owner control proves the same write succeeds when allowed.

  `error === null` alone proves nothing, because an RLS-refused UPDATE or DELETE succeeds with 0 rows.

- **Oracle**: expected outcomes come from the PRD's Access Control section, not from reading the SQL.
- **Run locally**: `npx supabase start`, then `npm run test:integration`.

### 6.3 Adding an anonymous-write integrity test

- **Reference test**: `src/test/integration/anon-score-write.integration.test.ts`.
- **Call the database directly** (`anonClient().rpc(...)` / `.from(...)`) with the public anon key. That's what a link holder can do without the UI, the endpoint or zod. Endpoint-level behavior belongs to `scripts/smoke.mjs`.
- **Simultaneous writes**: one `anonClient()` per call, fired with `Promise.all`, repeated over several matches. Assert the set of statuses, then check the stored value against whichever call reported `created`. Never assume call order.
- **Bounds and bad input**: send values zod would block (out of range, `null`) straight to the RPC, and assert an error plus an owner read-back of "nothing stored". Include both edges of the valid range as controls.

### 6.4 Adding a guardrail test from persisted data

- **Location**: `src/test/integration/<area>.integration.test.ts`, same project and helpers as §6.2.
- **Reference tests**: `leaderboard-from-stored-results.integration.test.ts` (stored rows → table), `points-lock.integration.test.ts` (write-boundary lock), `league-invariants.integration.test.ts` (DB constraints and frozen rows).
- **Store through the real write paths**: `enterScoreAsLinkHolder(league, "Ann", 2, 0, "Bob")` (anon RPC), owner `results` update for corrections. `matchBetween(league, a, b).orient(x, y)` maps "a scored x, b scored y" to the stored `score_a`/`score_b`; the fixture generator decides who is player A.
- **Read the way the page reads**: `get_shared_league` as anon → `toSharedLeague` → `computeStandings`. Assert the full `[name, rank, P, W, D, L, GF, GA, GD, Pts]` table, hand-computed, with the arithmetic in comments.
- **Use non-default points** (`leagues.create(owner, names, { win: 5, draw: 2, loss: 1 })`) so a hard-coded 3/1/0 anywhere on the path changes the answer; a twin league with the same scores and other points proves settings are read per tournament.
- **Lock / invariant tests** assert the returned status or Postgres error class (23505 unique, 22023 raised by `create_league`, 23514 check, 42501 RLS) **plus** an owner read-back (`readTournamentAs`, a name lookup for "nothing stored"). Call `create_league` directly with input zod and the generator would never send.
- **Not observable from outcomes**: a lost race between a score and a points edit leaves the same final state as the legal order, so the lock's `for share`/`for update` pairing is a review item, not a test.

### 6.5 Adding an e2e test

- **First ask whether it needs a browser.** Add an e2e test only for what smoke (HTTP) and the integration suite (DB) can't see: rendered values, hydration, flows with several tabs or actors. Redirects, status codes and DB rules stay in the layers that already cover them.
- **Location**: `tests/e2e/<flow>.spec.ts`. Name the test after the risk it protects, and list the risk ids in a header comment.
- **Reference test**: `tests/e2e/us-01-league-flow.spec.ts`.
- **Actors**: the organizer is already signed in. The `setup` project signs up a fresh user and saves `playwright/.auth/user.json`. A link holder is `browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })`; close it in `finally`.
- **Locators**: roles and labels only (`getByRole("table", { name: "Standings" })`, `getByLabel("Score of Anna")`). Scope a label that repeats to its fixture with `getByRole("listitem").filter({ hasText: "Anna vs Bartek" })`.
- **React islands**: call `waitForHydration(page)` (`tests/e2e/support/hydration.ts`) before filling a form that creates data. Never retry a non-idempotent submit, and never use `waitForTimeout`.
- **Oracle**: compute the expected leaderboard cells by hand from the PRD rules, never by copying from `computeStandings`. Use non-default points wherever a default would hide a bug: with loss > 0, a loss and an unplayed match render differently.
- **Data**: unique names per run (`randomUUID()`), and clean up through the UI as an asserted step.
- **Run locally**: `npx supabase start`, point `.env` and `.dev.vars` at it, then `npm run test:e2e`. The config refuses a non-local `SUPABASE_URL`. Port 4400 must be free, or set `E2E_PORT`.
- **Prove it**: break the behaviour in app code, see the run go red, then revert.

### 6.6 Per-rollout-phase notes

(Appended by each phase's final sub-phase.)

- **Phase 1 (2026-11-07):** the integration suite refuses any `SUPABASE_URL` that isn't `localhost` or `127.0.0.1`, because this checkout is linked to the production project and test sign-ups can't be undone. Prove each new DB test with a mutation check. Patch the local DB in place with `psql` and restore the definition from its migration file, instead of `supabase db reset`, which wipes local data. Example: score corrections are guarded by two RLS policies, SELECT and UPDATE. Widening only one of them leaves the test green, so a mutation has to remove the real protection.
- **Phase 2 (2026-11-07):** the post-creation tests were red on `master`: the owner could insert a player, or a bare tournament, directly through PostgREST, breaking "every pair meets exactly once". Fixed by `20261107120000_freeze_league_rows_after_creation.sql` (`create_league` is now `security definer` with an explicit `auth.uid()` check; no INSERT policy remains on `tournaments`/`players`/`matches`). Any future write path for these tables must go through an RPC that keeps the invariants. Mutation checks used: hard-coded 3/1/0 in `get_shared_league`, lock clause and its tournament filter removed from `update_tournament_settings`, name/pair indexes and the self-pair check dropped, count checks removed from `create_league` — each turned named tests red. When a `create function` migration is patched in place, run it as `create or replace` (grants are kept).
- **Phase 3 (2026-11-07):** one US-01 browser run, `tests/e2e/us-01-league-flow.spec.ts`. It covers only what the other layers can't see:
  - the rendered standings for non-default points (W4/D2/L1);
  - a stale share tab that can't overwrite an entered score;
  - an organizer correction showing up in the next anonymous view.

  Two mutation checks turned it red: the share page computing with hard-coded 3/1/0, and the correction endpoint writing a fixed score while still reporting success. The leaderboard is computed in the page, not in SQL, so §2's "one integration for stored-rows → leaderboard" is covered by this e2e run instead; Phase 2 keeps the calculation edges in unit tests. A failed run leaves its user and league in the local DB, which is harmless. CI has an optional, self-contained `e2e` job.

- **Phase 4 (2026-11-07):** CI now runs the integration suite in `smoke` (fresh DB) and in `migration-upgrade` (upgraded, seeded DB). `migration-upgrade` is the risk #7 gate: Supabase starts from a worktree of the previous release, `scripts/seed-db.mjs seed` writes realistic leagues through the anon surface, `supabase migration up --local` applies the new migrations, `seed-db.mjs verify` checks the seeded rows survived (a projection, so additive columns or JSON keys pass) and the write path still works, then the previous release's smoke runs against the new schema. It also refuses edited, renamed or deleted released migrations and out-of-order new ones. Proven by a deliberate migration (ASCII-only player names) that an empty DB accepts: `smoke` stayed green, `migration-upgrade` failed at the migration step. When you add a table or a write path the deployed app uses, add it to `seed-db.mjs` (seed + verify); the next release seeds with that copy. Agent hooks: `.claude/hooks/post-edit.mjs` (per edit: ESLint on the file, related unit tests) and `end-of-turn.mjs` (changed files, unit suite, `astro check`), proven by `scripts/agent-hooks.test.ts`; on Windows they use git's view of paths, because temp paths can be 8.3 short names.
- **CI split (2026-11-09, change `new-pr-ci-cd-workflow`):** `ci.yml` was split into `pr.yml` (pull requests: `ci`, `smoke`, `migration-upgrade`, `e2e`; a new push cancels the superseded run) and `migrate.yml` (push to `master`: `migrate` only). Both use a read-only token, job timeouts and Node from `.nvmrc`. The post-merge re-run of the gates was dropped because it never gated the deploy. Instead, branch protection requires the branch to be up to date.

- **Phase 5 (cup, 2026-11-12, change `add-cup-format`):** the integration half is `src/test/integration/cup-bracket.integration.test.ts` (risks #8, #9); the seed, smoke and e2e halves landed too (`scripts/seed-db.mjs` seeds a partial and a finished cup and skips cleanly when the schema has no `create_cup`; `scripts/smoke.mjs` has 12 cup steps; `tests/e2e/cup-flow.spec.ts` is the browser run). The e2e spec went red when the draw error mapping was broken and when the next-slot player was not rendered. The §3 row stays `in-progress` until the manual checks in the plan are confirmed. Mutations applied in place to the local DB (`psql` in the `supabase_db` container, restored from the migration's `create or replace` definitions) and the named tests that turned red:
  - draw rejection removed from the `submit_match_score` cup branch: "refuses a draw with draw_not_allowed";
  - next-slot write removed from `submit_match_score`: 12 tests (every advancement, `not_ready` control, flip and whole-cup tests);
  - trigger refusal `cup_next_round_played` disabled: "flipping the winner after the next round was played is refused";
  - trigger slot rewrite removed: "flipping the winner before the next round is played rewrites the next slot", the after-round refusal test and the non-owner control;
  - byes given to the wrong seeds in `generateBracket` (unit, reverted with `git checkout`): the N=5 and N=6 tables plus the placement, bye and half invariants for every N.

### 6.7 Adding a cup bracket test

- **Reference test**: `src/test/integration/cup-bracket.integration.test.ts`; same project, actors and three-assertion refusals as §6.2 and §6.3.
- **Helpers** (`fixtures.ts`): `cupCleanup().create(owner, names)` (calls `create_cup` with the real `generateBracket` payload, `cupBracketPayload(n)` for hand-built or broken ones), `cupMatch(cup, position)`, `enterCupScore(cup, position, a, b)` (anon RPC, returns the status), `readCupMatchSlots(owner, cup)` (slots as names, `null` = TBD, plus the next link).
- **Oracle**: use entry order as seed and work the bracket out by hand. Five players Ann..Eve: Dan vs Eve in round 1, byes Ann, Bob, Cid; position 2 is Ann vs the Dan/Eve winner, position 3 is Bob vs Cid, position 4 is the final. `score_a` is the first-named slot. Check both next slots (a and b) and both winners, so a fixed slot or a fixed winner turns the test red.
- **Corrections** are a direct owner `UPDATE results`; assert error code (`55000` / `cup_next_round_played` after the next round, `23514` for a draw), the owner read-back of every slot, and an owner control. A non-owner update returns 0 rows.
- **Run locally**: `npx supabase start`, `npm run test:integration`. Prove a new test by patching the local function in place (see Phase 1 and Phase 5 notes), never `supabase db reset` and never against the linked project.

## 7. What We Deliberately Don't Test

- **UI snapshot tests of views** — tokens are guarded by `check:ui` and visual gates via the kitchen sink; snapshots would churn with every restyle. Re-evaluate if a visual regression reaches production. (Source: interview Q5, inferred.)
- **Supabase auth internals (sign-up, password hashing, email confirm)** — owned by Supabase; smoke covers our wiring. (Source: interview Q5, inferred.)
- **Generated DB types** — the generator is the test; `astro check` catches drift. (Source: interview Q5, inferred.)
- **Share-link guessability / rotation** — accepted risk per PRD Non-Goals. Re-evaluate if link rotation enters scope.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-12 (cup risks #8, #9 and Phase 5 added)
- Stack versions last verified: 2026-11-07
- AI-native tool references last verified: 2026-11-07

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive (e.g. the cup format lands),
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
