# Critical Flow in the Browser (US-01) — Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md`. Add Playwright and one US-01 browser run: the organizer creates a league with non-default points, a link holder enters a score anonymously, the leaderboard shows hand-computed values, a stale tab cannot overwrite, the organizer corrects the score and the next anonymous view reflects it. No app code or schema changes.

## Current State Analysis

- Leaderboard is rendered only on `/t/<token>`, computed per request from `get_shared_league` (`research.md` §Path).
- Smoke checks score text and redirects, never the standings table or a correction. The integration suite never renders.
- No Playwright, no `tests/` directory, no `test-stack.md`.

## Desired End State

- `npm run test:e2e` builds the app, previews it on port 4400, signs up a fresh organizer, and runs the US-01 spec green.
- The spec fails when the share page ignores the tournament's points or when a correction does not land (manual mutation checks).
- `context/foundation/test-stack.md` `## E2E` records the setup; test-plan §3/§4/§6 updated.
- Optional, self-contained CI job `e2e`.

## What We're NOT Doing

- No second spec, no auth-gate or validation e2e tests (smoke covers them).
- No standings edge-case tests (Phase 2, unit/integration).
- No schema or app-code change; no seed data file; no fixed E2E user credentials.
- No change to the existing `ci`, `smoke` or `migrate` jobs (Phase 4 owns them).

## Key Decisions

| Decision        | Choice                                                                                              | Why                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Expected values | Hand-computed from PRD rules for W4/D2/L1                                                           | Oracle independent of `computeStandings`; loss > 0 distinguishes a loss from an unplayed match |
| Organizer auth  | `setup` project signs up a fresh user via the UI, saves `storageState`                              | Local confirmations are off; no secret in env or CI                                            |
| Link holder     | Second browser context with empty storage                                                           | Real anonymous session, no cookies                                                             |
| Env safety      | Config refuses non-local `SUPABASE_URL` in `.env` and `.dev.vars` (reuses `assertLocalSupabaseUrl`) | Test sign-ups cannot be removed from production                                                |
| Port            | 4400 default, `E2E_PORT` override                                                                   | Avoid silently reusing a dev server on 4321                                                    |
| Hydration       | Wait for `astro-island[ssr]` to disappear before non-idempotent React forms                         | Avoid lost input without retrying a create                                                     |
| Traces          | `retain-on-failure`, screenshots `only-on-failure`                                                  | Local runs have no retries, so `on-first-retry` would never record                             |

## Phase 1: Playwright setup

### Changes Required

- `package.json`: `@playwright/test` dev dependency, `test:e2e` script.
- `playwright.config.ts`: env load + local guard, port, `webServer` (build + preview, `ASTRO_PREVIEW_BACKGROUND=1`), `setup` + `chromium` projects.
- `tests/e2e/auth.setup.ts`, `tests/e2e/support/hydration.ts`.
- `.gitignore`: Playwright output and `playwright/.auth/`.
- `context/foundation/test-stack.md`: `## E2E`.

## Phase 2: US-01 spec (risk #3, risk #1 cross-check)

- `tests/e2e/us-01-league-flow.spec.ts`: create → share → anon score → standings → stale tab → correction → standings → delete (asserted cleanup).
- Mutation checks: (a) share page computes standings with hard-coded 3/1/0; (b) correction endpoint writes a fixed score but still reports success.

## Phase 3: CI job and docs

- `.github/workflows/ci.yml`: new self-contained `e2e` job (own local Supabase, uploads report on failure).
- `context/foundation/test-plan.md`: §3 row 3, §4 e2e row, §6.5, §6.6. `AGENTS.md` command line.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Playwright setup

#### Automated

- [x] 1.1 `npx playwright --version` → 1.65.0
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type check passes: `npx astro check`

#### Manual

- [x] 1.4 Non-local `SUPABASE_URL` makes `playwright test` fail immediately with the guard message

### Phase 2: US-01 spec

#### Automated

- [x] 2.1 `npm run test:e2e` green from a cold server (3 runs + 1 `--repeat-each=3` run)
- [x] 2.2 Unit suite still passes: `npm test`

#### Manual

- [x] 2.3 Mutation check (a): hard-coded 3/1/0 in the share page fails the first standings assertion
- [x] 2.4 Mutation check (b): correction endpoint writing a fixed score fails the post-correction standings assertion

### Phase 3: CI job and docs

- [x] 3.1 `e2e` CI job added as a separate job
- [x] 3.2 Test-plan §3/§4/§6 and `AGENTS.md` updated
