# PR Validation Workflow Implementation Plan

## Overview

Split the single `.github/workflows/ci.yml` into a PR-only validation workflow (`pr.yml`) and a push-to-master workflow that only runs the production `migrate` job (`migrate.yml`). Harden both with least-privilege token permissions, PR concurrency, job timeouts and the Node version read from `.nvmrc`. Then make `ci`, `smoke` and `migration-upgrade` required checks on `master`.

The change note asked for the "first CI/CD workflow". The repo already validates PRs, so this change turns the existing workflow into a dedicated, hardened PR gate instead of building a new one.

## Current State Analysis

`.github/workflows/ci.yml` triggers on `push` and `pull_request` to `master` and contains five jobs:

- `ci` — `npm ci`, `astro sync`, lint, `check:ui`, unit tests, `astro check`, build with the `SUPABASE_URL`/`SUPABASE_KEY` repository secrets (`.github/workflows/ci.yml:10-27`).
- `smoke` — local Supabase, integration suite, production preview and smoke test (`ci.yml:29-60`).
- `migration-upgrade` — the risk #7 gate. It resolves `BASE` from `HEAD^1` on a PR or `github.event.before` on a push (`ci.yml:85-95`), then seeds data, upgrades the schema and smoke-tests the previous release.
- `migrate` — push to master only. It runs `supabase db push --linked` against production, with `concurrency: production-migrate` (`ci.yml:153-168`).
- `e2e` — the optional Playwright US-01 run (`ci.yml:170-205`).

Gaps:

- No `permissions:` block, so the `GITHUB_TOKEN` gets the repository's default scope. The PR checks and the production-writing `migrate` job share one file and one token scope.
- No PR `concurrency`, so pushing a new commit doesn't cancel the run for the superseded one.
- No `timeout-minutes`. A hung preview or Supabase start runs until GitHub's 6h default.
- Node is hard-coded `node-version: 22`, while `.nvmrc` pins `22.23.3`.
- `ci`, `smoke` and `migration-upgrade` run a second time on the push to `master` after a merge. That run gates nothing: `migrate` has no `needs`, and Workers Builds deploys outside Actions (`ci.yml:148-152`).
- Branch protection is not documented. `test-plan.md` §5 lists the gates as "required", but nothing says how that's enforced.

## Desired End State

- `.github/workflows/pr.yml` (`name: PR`) runs on `pull_request` to `master` only, with the jobs `ci`, `smoke`, `migration-upgrade` and `e2e`. Job names are unchanged.
- `.github/workflows/migrate.yml` (`name: Migrate`) runs on `push` to `master` only, with the single `migrate` job. `ci.yml` no longer exists.
- Both workflows declare `permissions: contents: read` at the top level.
- `pr.yml` has workflow-level `concurrency` keyed on the PR number with `cancel-in-progress: true`.
- Every job has `timeout-minutes`.
- Every `setup-node` step uses `node-version-file: .nvmrc`.
- `AGENTS.md`, `test-plan.md` §5 and the `lessons.md` rule context describe the new layout and the required checks.
- Branch protection on `master` requires `ci`, `smoke` and `migration-upgrade`, with "require branches to be up to date before merging". `e2e` stays optional.

How to verify: `actionlint` passes on both files. On a real PR, each job runs once, and a second push cancels the first run. The merge to `master` runs only `Migrate / migrate`.

### Key Discoveries:

- Check names come from the job name, not the workflow name. Moving `ci`, `smoke` and `migration-upgrade` into `pr.yml` with the same job keys keeps the names branch protection matches on (`ci.yml:10,29,64`).
- `migration-upgrade` already handles `pull_request` with `BASE=$(git rev-parse HEAD^1)` (`ci.yml:88`). With the push trigger gone, the `PUSH_BEFORE` branch is dead code.
- The `e2e` failure artifact upload (`ci.yml:193-201`) uses the runtime artifact token, not `GITHUB_TOKEN` scopes, so `contents: read` is enough.
- `migrate` must keep `concurrency: { group: production-migrate, cancel-in-progress: false }` (`ci.yml:156`). A cancelled `db push` could leave production half-migrated.
- A `pull_request` workflow runs from the PR's merge commit. The PR that introduces `pr.yml` therefore runs `pr.yml` itself, and it no longer runs `ci.yml`, which that PR deletes. That PR is the live verification for Phase 3.
- `lessons.md` rule "Use current Cloudflare Workers APIs" names `.github/workflows/ci.yml` in its Context line. It needs the new paths so the rule still triggers.

## What We're NOT Doing

- No Prettier `--check` in CI, no fork-safe build, no dependency-review action. These were offered and not chosen.
- No Stryker job in CI. Mutation testing stays manual and selective, as CLAUDE.md says.
- No PR preview deploy (`wrangler versions upload --preview-alias`). It needs a separate Supabase project and Cloudflare secrets.
- No reusable `workflow_call` file and no duplicated jobs. Post-merge re-validation on `master` is dropped, and the "up to date" branch protection rule covers stale branches instead.
- No changes to job steps beyond the hardening below and removing `migration-upgrade`'s dead push branch.
- No `e2e` as a required check. `test-plan.md` §5 keeps it optional.
- `context/foundation/infrastructure.md` and `context/changes/development/deployment-plan.md` mention `ci.yml` historically. They stay as they are.

## Implementation Approach

Phase 1 does the whole split and hardening in one commit. A partial split would either run jobs twice or drop a gate. Phase 2 updates the documentation that names the workflow. Phase 3 is the PR itself: it proves the new layout runs as intended, then the repository owner turns on branch protection against the job names that ran.

## Critical Implementation Details

- **Rename, don't copy, `ci.yml`.** Use `git mv .github/workflows/ci.yml .github/workflows/migrate.yml`, then cut the validation jobs out of it. The production-writing job keeps its history, and no window exists where both files trigger on push.
- **Branch protection only lists checks GitHub has seen recently.** Configure it after the Phase 3 PR run has reported `ci`, `smoke` and `migration-upgrade`, or the checks won't be offered in the settings UI.

## Phase 1: Split and harden the workflows

### Overview

Produce `pr.yml` (PR validation) and `migrate.yml` (production migrations) from today's `ci.yml`, both hardened.

### Changes Required:

#### 1. PR validation workflow

**File**: `.github/workflows/pr.yml` (new)

**Intent**: Hold all PR validation in a file that only `pull_request` can trigger, with least privilege, cancellation of superseded runs and bounded runtimes.

**Contract**:

- `name: PR`. `on: pull_request: branches: [master]`.
- Top-level `permissions: contents: read`.
- Top-level `concurrency: { group: pr-${{ github.event.pull_request.number }}, cancel-in-progress: true }`.
- Jobs `ci`, `smoke`, `migration-upgrade` and `e2e`, moved verbatim from `ci.yml` with their existing comments, except:
  - Each `actions/setup-node@v4` step uses `node-version-file: .nvmrc` instead of `node-version: 22` (keep `cache: npm`).
  - `timeout-minutes`: `ci` 15, `smoke` 20, `migration-upgrade` 30, `e2e` 20.
  - In `migration-upgrade` "Resolve previous release and new migrations", drop the `PUSH_BEFORE` env and its push branch. `BASE` is always `$(git rev-parse HEAD^1)`. Update the step comment to match. The migration-ordering checks below it stay unchanged.

#### 2. Production migration workflow

**File**: `.github/workflows/ci.yml` → `.github/workflows/migrate.yml` (`git mv`)

**Intent**: Leave only the production `migrate` job, triggered only by a push to `master`, with the same least-privilege token.

**Contract**:

- `name: Migrate`. `on: push: branches: [master]`.
- Top-level `permissions: contents: read`.
- Single job `migrate`: same steps, env, comment block and `concurrency: { group: production-migrate, cancel-in-progress: false }`. Add `timeout-minutes: 10`. The job-level `if:` can go, since the trigger already restricts it, but keep the "never `supabase config push`" warning comment.

### Success Criteria:

#### Automated Verification:

- `actionlint` passes on both files: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest`
- `.github/workflows/ci.yml` no longer exists and `git log --follow .github/workflows/migrate.yml` shows the ci.yml history
- No workflow file still contains `node-version: 22` (`grep -rn "node-version:" .github/workflows` shows only `node-version-file`)
- `npm run lint` and `npm test` still pass (the agent hooks run them anyway)

#### Manual Verification:

- Reviewer reads the `pr.yml` diff against old `ci.yml` and confirms that job steps outside the listed edits are unchanged

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Documentation

### Overview

Make every doc that names the CI workflow describe the split and the required checks.

### Changes Required:

#### 1. Agent rules CI section

**File**: `AGENTS.md`

**Intent**: Replace the "`ci.yml` runs on every push and PR" description with the two-workflow layout, and state which checks are required.

**Contract**: `## CI` section. `pr.yml` (pull requests: `ci`, `smoke`, `migration-upgrade`, optional `e2e`; superseded runs cancelled). `migrate.yml` (push to master: `migrate`). Required checks on `master`: `ci`, `smoke`, `migration-upgrade`, with branches required to be up to date. The `migration-upgrade` bullet drops "`github.event.before` on push". Existing guidance on `migrate`, secrets and backward-compatible migrations stays.

#### 2. Test plan gate table

**File**: `context/foundation/test-plan.md`

**Intent**: In §5's gate table, change "CI" in the location column to "CI (`pr.yml`)", and say the required gates are enforced by branch protection. Add a dated history note under the phase notes explaining the split.

**Contract**: §5 table rows (lines ~100-105) and one new dated bullet in the notes list. `e2e` stays "optional".

#### 3. Lessons rule context

**File**: `context/foundation/lessons.md`

**Intent**: Keep the Cloudflare rule triggering on CI edits by naming the new workflow paths.

**Contract**: In the "Use current Cloudflare Workers APIs…" rule, replace `.github/workflows/ci.yml` in the **Context** line with `.github/workflows/pr.yml`, `.github/workflows/migrate.yml`. Change no other text. The file is append-only for new rules, and this is a path fix.

### Success Criteria:

#### Automated Verification:

- `grep -rn "workflows/ci.yml" AGENTS.md context/foundation/test-plan.md context/foundation/lessons.md` returns nothing
- `npx prettier --check AGENTS.md context/foundation/test-plan.md context/foundation/lessons.md` passes

#### Manual Verification:

- AGENTS.md CI section reads correctly for someone who never saw `ci.yml`

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Required checks and live verification

### Overview

Prove the layout on a real PR, then enforce the required checks on `master`.

### Changes Required:

#### 1. Pull request for this change

**File**: none (GitHub)

**Intent**: Open the PR from this branch to `master`. Its run is the live test of `pr.yml`.

**Contract**: The PR checks list shows `ci`, `smoke`, `migration-upgrade` and `e2e` from workflow `PR`, and nothing from `CI` or `Migrate`.

#### 2. Branch protection on master

**File**: none (GitHub repository settings, done by the repository owner)

**Intent**: Make red PR validation unmergeable, and require branches to be up to date. That replaces the dropped post-merge re-run.

**Contract**: Branch protection or a ruleset on `master`: required status checks `ci`, `smoke`, `migration-upgrade`, with "Require branches to be up to date before merging" on. `e2e` is not required.

### Success Criteria:

#### Manual Verification:

- On the PR, each of `ci`, `smoke`, `migration-upgrade` and `e2e` runs exactly once per push, all green
- Pushing a second commit to the PR while the run is in progress cancels the earlier run
- `setup-node` resolves Node `22.23.3` from `.nvmrc` (visible in the job log)
- Branch protection on `master` lists `ci`, `smoke` and `migration-upgrade` as required, with up-to-date branches required
- After the merge, the `master` push runs only `Migrate / migrate`, and it succeeds

---

## Testing Strategy

### Unit Tests:

- None. No application code changes. Existing `npm test` (including `scripts/agent-hooks.test.ts`) must stay green.

### Integration Tests:

- The PR's own `smoke` and `migration-upgrade` runs exercise the integration suite under the new workflow.

### Manual Testing Steps:

1. Open the PR. Confirm only workflow `PR` reports checks.
2. Push a trivial follow-up commit mid-run. Confirm the older run shows "Cancelled".
3. Configure branch protection. Confirm a PR with a failing required check shows "Merging is blocked".
4. Merge. Confirm the Actions tab shows only `Migrate` for the push.

## Performance Considerations

PR concurrency cancellation and removing the post-merge re-run of three Supabase-backed jobs cut Actions minutes roughly in half per merged change.

## Migration Notes

The rename means the Actions UI shows run history for `CI` up to this change, and `Migrate`/`PR` after it. Branch protection matches job names, so the existing check names keep working.

## References

- Current workflow: `.github/workflows/ci.yml`
- Gate table: `context/foundation/test-plan.md` §5
- Production CI rules: `AGENTS.md` `## CI`
- Change identity: `context/changes/new-pr-ci-cd-workflow/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Split and harden the workflows

#### Automated

- [x] 1.1 actionlint passes on both files — 796887a
- [x] 1.2 ci.yml gone and migrate.yml keeps its history — 796887a
- [x] 1.3 No workflow uses hard-coded node-version — 796887a
- [x] 1.4 npm run lint and npm test still pass — 796887a

#### Manual

- [x] 1.5 Reviewer confirms job steps unchanged outside listed edits — 796887a

### Phase 2: Documentation

#### Automated

- [x] 2.1 No doc references workflows/ci.yml — 374f262
- [x] 2.2 Prettier check passes on edited docs — 374f262

#### Manual

- [x] 2.3 AGENTS.md CI section reads correctly — 374f262

### Phase 3: Required checks and live verification

#### Manual

- [x] 3.1 Each PR job runs once per push, all green
- [ ] 3.2 Second push cancels the in-progress run
- [x] 3.3 setup-node resolves 22.23.3 from .nvmrc
- [ ] 3.4 Branch protection requires ci, smoke, migration-upgrade and up-to-date branches
- [ ] 3.5 Merge to master runs only Migrate / migrate
