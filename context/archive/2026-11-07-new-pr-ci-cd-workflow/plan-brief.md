# PR Validation Workflow — Plan Brief

> Full plan: `context/changes/new-pr-ci-cd-workflow/plan.md`

## What & Why

Give pull requests a dedicated, hardened GitHub Actions gate, and keep the production-writing `migrate` job in a separate workflow. The request was for a "first CI/CD workflow", but PRs are already validated, so the real need is to separate PR checks from production writes, cut wasted runs and enforce the gates that `test-plan.md` already calls "required".

## Starting Point

One file, `.github/workflows/ci.yml`, runs `ci`, `smoke`, `migration-upgrade` and `e2e` on both PRs and pushes to `master`, plus `migrate` against production on push. It has no `permissions`, no PR concurrency, no timeouts and a hard-coded Node 22. Nothing enforces the required gates in GitHub.

## Desired End State

PRs to `master` run `pr.yml`. Its jobs `ci`, `smoke`, `migration-upgrade` and `e2e` run once per push, and a new push cancels the old run. A merge runs only `migrate.yml`. Both workflows use a read-only token, bounded timeouts and the Node version from `.nvmrc`. `master` blocks merging unless `ci`, `smoke` and `migration-upgrade` are green and the branch is up to date.

## Key Decisions Made

| Decision          | Choice                                                     | Why (1 sentence)                                                                               |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Scope             | Hygiene only: permissions, concurrency, timeouts, `.nvmrc` | Cheap, low-risk fixes for real cost and security gaps; no new kind of check.                   |
| File layout       | Split `pr.yml` (PR) and `migrate.yml` (push to master)     | Isolates the production-writing job and gives each file its own token scope and concurrency.   |
| Avoid duplication | PR-only validation, no post-merge re-run                   | The post-merge run never gated anything; "up to date" branch protection covers stale branches. |
| Stryker in CI     | No, stays manual                                           | CLAUDE.md policy: selective runs, survivors reviewed one by one.                               |
| Required checks   | `ci`, `smoke`, `migration-upgrade`; `e2e` optional         | Matches the gate table in `test-plan.md` §5.                                                   |

## Scope

**In scope:**

- New `pr.yml`. `ci.yml` renamed to `migrate.yml` with only `migrate` left
- `permissions: contents: read`, PR `concurrency`, `timeout-minutes`, `node-version-file: .nvmrc`
- Removing the dead push branch in `migration-upgrade`'s BASE resolution
- Doc updates in AGENTS.md, test-plan.md §5 and the lessons.md rule path
- Branch protection on `master`, set by the repository owner

**Out of scope:**

- Prettier check, fork-safe build, dependency review, Stryker in CI
- PR preview deploys, reusable workflows, making `e2e` required

## Architecture / Approach

Check names come from job keys, so moving the jobs with unchanged keys keeps branch-protection matching stable. The PR that introduces `pr.yml` runs it on itself, which makes that PR the live test. Branch protection is configured after that run, so GitHub already knows the check names.

## Phases at a Glance

| Phase                         | What it delivers                                       | Key risk                                                                         |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1. Split & harden workflows   | `pr.yml` + `migrate.yml`, passing actionlint           | Accidental step drift while moving ~200 lines of YAML                            |
| 2. Documentation              | AGENTS.md, test-plan §5, lessons.md describe the split | Stale `ci.yml` references misleading future agents                               |
| 3. Required checks + live run | Green PR run, branch protection on `master`            | `.nvmrc` 22.23.3 not resolvable by setup-node; protection set before checks seen |

**Prerequisites:** Docker for `actionlint`, admin access to the GitHub repo for branch protection.
**Estimated effort:** About 1 session across 3 phases. Phase 3 is mostly waiting on CI.

## Open Risks & Assumptions

- No post-merge validation remains on `master`. This relies on "require branches to be up to date" being turned on.
- Assumes Node `22.23.3` from `.nvmrc` is available to `actions/setup-node`. The first PR run proves it.
- Renaming the workflow splits the Actions run history between `CI` and `PR`/`Migrate`.

## Success Criteria (Summary)

- A PR shows exactly one `PR` run per push, with older runs cancelled, and can't merge while a required check is red
- A merge to `master` triggers only the production `migrate` job
- The docs describe the new layout, with no `ci.yml` references left in AGENTS.md, test-plan.md or lessons.md
