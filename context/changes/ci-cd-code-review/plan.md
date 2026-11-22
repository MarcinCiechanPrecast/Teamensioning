# AI code review workflow for pull requests — Implementation Plan

## Overview

Run the `packages/code-reviewer` agent on every PR to `master` from GitHub Actions: a separate, optional workflow
`.github/workflows/review.yml` calls a local composite action `.github/actions/ai-reviewer/`, then publishes one
PR comment (updated in place) and the label `ai-cr:passed` or `ai-cr:failed`. Adding the label `ai-cr:review` re-runs
the review on demand. Requirements: `context/changes/ci-cd-code-review/requirements.md`.

## Current State Analysis

- `.github/workflows/pr.yml` holds the required checks (`ci`, `smoke`, `migration-upgrade`) and the optional `e2e`;
  it uses `actions/checkout@v4`, `actions/setup-node@v4`, `node-version-file: .nvmrc` (`pr.yml:19-27`).
- `.github/actions/` does not exist; no composite action yet.
- The agent (`packages/code-reviewer`) reads a diff from stdin or `data/<sample>.diff` and prints JSON to stdout, token
  usage and verdict to stderr (`src/cli.ts:17-49`); `review(diff, model)` is single-shot with `stopWhen: isStepCount(2)`
  (`src/review.ts:15-22`). It takes no PR title/body and writes no files.
- The package is independent: own `package.json` and lockfile, excluded from root lint and `tsconfig`; root `npm ci`
  does not install it.
- Default model `z-ai/glm-5.3` is paid; the OpenRouter account has no credits, `nvidia/nemotron-3.5-super-vl:free`
  already passed both bundled samples (fail on `sample-1`, pass on `sample-2`).
- Output tokens were about 3.6x input tokens in the live runs, so diff size is the main cost lever.

## Desired End State

Opening or updating a ready (non-draft), same-repo PR to `master` starts the `AI Code Review` workflow. It posts a
single comment with the six scores and summary, sets exactly one of `ai-cr:passed` / `ai-cr:failed`, and the job is red
on a `fail` verdict. Adding `ai-cr:review` re-runs it and the label is removed afterwards. The check is not in branch
protection. Verify with the evidence screenshots (pipeline view, job logs, LLM comment) from a real PR.

### Key Discoveries:

- `pr.yml:9-10` sets `permissions: contents: read`; the new workflow needs only `pull-requests: write` on top.
- PR title and body are attacker-controlled text: they must reach the agent through `env:` / files, never be
  interpolated into a `run:` script.
- `lessons.md` rule for `.github/workflows`: do not touch Workers deploy or app secrets; no new heavy dependencies —
  comments and labels use the preinstalled `gh` CLI.
- Workflow-level `concurrency` cancels a running review when an unrelated `labeled` event starts a run that is later
  skipped by the job `if`; the group key must separate those events (see Critical Implementation Details).

## What We're NOT Doing

- Making the check required in branch protection (decide after the `code-review-evals` change).
- Business-alignment and architectural-fit criteria, plan-aware review and agent tools (lesson task 4).
- Extracting the action to its own repository, pinning third-party actions (only first-party `actions/*` are used).
- Handling fork PRs (no secrets there; the job skips with a notice).
- Changing `pr.yml`, `migrate.yml`, the app, Supabase or Cloudflare configuration.
- Switching the package's `DEFAULT_MODEL`; the CI default lives in the workflow.

## Implementation Approach

Keep the agent and schema untouched and add a thin CI layer around them: the CLI gains PR metadata input, a size limit
and file outputs; the composite action installs and runs the package; the workflow owns triggers, skip rules and the
GitHub side effects. Review verdict never changes the CLI exit code (0 on `fail`); the workflow turns `fail` into a red
job in its last step so comment and labels are always published first.

## Critical Implementation Details

- **Timing & lifecycle**: labels added by the workflow with `GITHUB_TOKEN` do not trigger new runs, but a human adding
  any other label does. Use a concurrency group that includes the label name for non-`ai-cr:review` `labeled` events
  (for example `ai-review-<pr>-noise`), so those skipped runs never cancel a real review.
- **Performance constraints**: diff capped at 120000 characters and PR body at 2000, each with a visible truncation
  notice in the comment; output tokens dominate cost.

## Phase 1: Agent ready for CI

### Overview

Make the CLI usable from a workflow: PR title and body as input, diff from a file, results written to files, size caps.

### Changes Required:

#### 1. CLI arguments and inputs

**File**: `packages/code-reviewer/src/args.ts`, `packages/code-reviewer/src/cli.ts`

**Intent**: Accept `--diff-file <path>` (instead of stdin) and `--out <dir>`; read the PR title and body from the
environment variables `REVIEW_PR_TITLE` and `REVIEW_PR_BODY`. In `--out` mode write `verdict.txt` (`pass`/`fail`),
`summary.md` and `result.json`; stdout/stderr behaviour stays as today.

**Contract**: `Options` gains `diffFile?: string` and `outDir?: string`; `parseArgs` stays pure and covered by tests;
exit code stays 0 for a `fail` verdict, 1 for runtime errors, 2 for a missing key.

#### 2. Prompt with PR metadata and size caps

**File**: `packages/code-reviewer/src/review.ts`, new `packages/code-reviewer/src/limits.ts`

**Intent**: Include title and description in the user prompt, marked as untrusted data like the diff, and truncate
oversized input with a notice.

**Contract**: `buildReviewPrompt(diff, meta?: { title?: string; body?: string })` is backward compatible (meta
optional); `truncate(text, max)` returns `{ text, truncated, originalLength }`; limits `DIFF_MAX_CHARS = 120000`,
`BODY_MAX_CHARS = 2000`.

#### 3. Comment rendering

**File**: new `packages/code-reviewer/src/report.ts`

**Intent**: Turn a `ReviewResult` plus truncation notes into the markdown PR comment (verdict, table of six scores
with rationale, summary), starting with the marker `<!-- ai-code-review -->` so the workflow can update it in place.

**Contract**: `renderComment(result, notes: string[]): string`.

#### 4. Tests

**File**: `packages/code-reviewer/src/review-schema.test.ts` or new `src/*.test.ts` files (`tsx --test src/*.test.ts`)

**Intent**: Cover `parseArgs` additions, `truncate`, `buildReviewPrompt` with metadata, and `renderComment` (marker,
all six criteria, truncation note).

### Success Criteria:

#### Automated Verification:

- Package tests pass: `cd packages/code-reviewer && npm test`
- Type check passes: `cd packages/code-reviewer && npm run typecheck`
- Dry run shows title and body in the prompt: `REVIEW_PR_TITLE="T" REVIEW_PR_BODY="B" npm run review:dry -- --diff-file data/sample-2.diff`

#### Manual Verification:

- Live run with your key on the flawed sample writes `verdict.txt` containing `fail`, plus `summary.md` and `result.json`: `npm run review -- --diff-file data/sample-1.diff --out ../../tmp/review-out`

**Implementation Note**: After this phase and its automated checks pass, pause for manual confirmation before Phase 2.
The `- [ ]` rows for these items live in `## Progress`.

---

## Phase 2: Composite action

### Overview

Wrap the agent in `.github/actions/ai-reviewer/` so the workflow stays short and the logic is reusable.

### Changes Required:

#### 1. Action definition

**File**: `.github/actions/ai-reviewer/action.yml`

**Intent**: `using: composite` action that installs the package and runs the review, exposing the verdict to the
caller. All inputs reach the command through `env:` (never inline `${{ inputs.* }}` in `run:`); every `run` step sets
`shell: bash`.

**Contract**: inputs `api-key` (required), `model` (required), `pr-title`, `pr-body`, `diff-file` (required, path);
outputs `verdict` (`pass`|`fail`) and `summary-file` (path). Steps: `npm ci --prefix packages/code-reviewer`, then
`npm --prefix packages/code-reviewer run review -- --diff-file "$DIFF_FILE" --out "$OUT_DIR"` with
`OPENROUTER_API_KEY`, `REVIEW_MODEL`, `REVIEW_PR_TITLE`, `REVIEW_PR_BODY` in `env:`; the last step writes both outputs
to `$GITHUB_OUTPUT`. The caller owns checkout and `setup-node`.

### Success Criteria:

#### Automated Verification:

- Action file is well-formed: `npx prettier --check .github/actions/ai-reviewer/action.yml`
- The action's command works from the repo root in dry mode: `npm ci --prefix packages/code-reviewer && npm --prefix packages/code-reviewer run review:dry -- --diff-file data/sample-2.diff`

#### Manual Verification:

- Read `action.yml`: no untrusted input is interpolated into a `run:` body, the API key is only in `env:`

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Workflow review.yml

### Overview

Triggers, skip rules, diff, action call and the GitHub side effects.

### Changes Required:

#### 1. Workflow

**File**: `.github/workflows/review.yml`

**Intent**: Workflow `AI Code Review`, `on: pull_request` to `master` with types `opened`, `synchronize`, `reopened`,
`ready_for_review`, `labeled`. Job `review` on `ubuntu-latest`, `timeout-minutes: 10`, `permissions:
contents: read, pull-requests: write`, Node from `.nvmrc` with npm cache keyed on
`packages/code-reviewer/package-lock.json`. Job `if` runs it for non-draft same-repo PRs, and for a `labeled` event
only when the label is `ai-cr:review` (a draft is reviewed only via that label). Steps: checkout with
`fetch-depth: 0`; a step that outputs `skip=true` with a `::notice::` when `secrets.OPENROUTER_API_KEY` is empty; write
`git diff "origin/$BASE_REF...HEAD"` to `$RUNNER_TEMP/pr.diff` (`BASE_REF` via `env:`); run `./.github/actions/ai-reviewer`
with `model: ${{ vars.REVIEW_MODEL || 'nvidia/nemotron-3.5-super-vl:free' }}`; upsert the comment through `gh api`
(find the comment containing `<!-- ai-code-review -->` and PATCH, else POST); set the label for the verdict and remove
the opposite one with `gh pr edit`; remove `ai-cr:review` when it triggered the run (`if: always()` for that cleanup);
final step fails the job when the verdict is `fail`.

**Contract**: concurrency `group: ai-review-${{ github.event.pull_request.number }}-${{ (github.event.action ==
'labeled' && github.event.label.name != 'ai-cr:review') && 'noise' || 'review' }}`, `cancel-in-progress: true`. Labels
`ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` must already exist in the repository (created in Phase 4) so the
workflow does not need `issues: write`. Only first-party `actions/*@v4` are used, consistent with `pr.yml`.

### Success Criteria:

#### Automated Verification:

- Workflow is well-formed: `npx prettier --check .github/workflows/review.yml`
- Workflow and local action lint clean: `actionlint .github/workflows/review.yml` (Docker image `rhysd/actionlint` or the release binary)
- Existing pipeline untouched: `git diff --stat -- .github/workflows/pr.yml .github/workflows/migrate.yml` prints nothing

#### Manual Verification:

- Read `review.yml`: permissions are only `contents: read` + `pull-requests: write`, no `${{ github.event.pull_request.* }}` text inside `run:`, draft/fork/no-secret paths skip without failing the PR

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Verification on a real PR

### Overview

Prove the pipeline end to end and collect the 10xChampion evidence.

### Changes Required:

#### 1. Repository setup (one-time, by the owner)

**Intent**: Add the repository secret `OPENROUTER_API_KEY` (Settings → Secrets and variables → Actions), optionally the
variable `REVIEW_MODEL`, and create the three labels with colours red/green/neutral
(`gh label create ai-cr:failed --color d73a4a`, `ai-cr:passed --color 0e8a16`, `ai-cr:review --color 5319e7`).
The secret is pasted by the owner in the GitHub UI; it is never typed or echoed by the agent.

#### 2. Evidence

**File**: `context/changes/ci-cd-code-review/screens/` (new)

**Intent**: Save screenshots of the pipeline view, the job logs and the LLM comment on the PR.

### Success Criteria:

#### Automated Verification:

- Root gates unaffected: `npm run lint && npm test && npx astro check`

#### Manual Verification:

- Secret added and the three labels exist
- Opening the PR from `feat/code-reviewer-agent` starts `AI Code Review`; one comment appears and exactly one of `ai-cr:passed` / `ai-cr:failed` is set; the job is red on `fail`
- Adding `ai-cr:review` re-runs the review, updates the same comment in place and removes the label
- Screenshots (pipeline view with the job, job logs, LLM comment) saved under `context/changes/ci-cd-code-review/screens/`

**Implementation Note**: The required checks (`ci`, `smoke`, `migration-upgrade`) must stay unaffected by this workflow.

---

## Testing Strategy

### Unit Tests:

- `parseArgs`: `--diff-file`, `--out`, defaults unchanged.
- `truncate`: under the limit (unchanged), over the limit (cut plus flag and original length).
- `buildReviewPrompt`: with and without title/body; metadata marked untrusted.
- `renderComment`: marker first, six criteria present, truncation note shown.

### Integration Tests:

- Dry run of the CLI with `--diff-file` and the environment variables; the real model run on `sample-1` / `sample-2`.

### Manual Testing Steps:

1. Open the PR and watch the run (pipeline view, logs, comment, label).
2. Add `ai-cr:review` and confirm the in-place update and label removal.
3. Push a commit and confirm the previous run is cancelled and the comment still updates in place.

## Performance Considerations

Diff and body caps bound token use; `cancel-in-progress` avoids paying for superseded pushes; drafts are skipped.
The free model may rate-limit, so a transient model error should fail the job with a clear log line rather than label
the PR.

## Migration Notes

None: no data, schema or deployed-app changes. The workflow is additive and optional.

## References

- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Existing workflow pattern: `.github/workflows/pr.yml:17-36`
- Agent entry point: `packages/code-reviewer/src/cli.ts:24-49`, `packages/code-reviewer/src/review.ts:15-33`
- Lesson context: M5L3 (GitHub Actions composite action, PR gate)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Agent ready for CI

#### Automated

- [x] 1.1 Package tests pass: `cd packages/code-reviewer && npm test`
- [x] 1.2 Type check passes: `cd packages/code-reviewer && npm run typecheck`
- [x] 1.3 Dry run shows title and body in the prompt: `REVIEW_PR_TITLE="T" REVIEW_PR_BODY="B" npm run review:dry -- --diff-file data/sample-2.diff`

#### Manual

- [x] 1.4 Live run with your key on the flawed sample writes `verdict.txt` containing `fail`, plus `summary.md` and `result.json`: `npm run review -- --diff-file data/sample-1.diff --out ../../tmp/review-out`

### Phase 2: Composite action

#### Automated

- [x] 2.1 Action file is well-formed: `npx prettier --check .github/actions/ai-reviewer/action.yml`
- [x] 2.2 The action's command works from the repo root in dry mode: `npm ci --prefix packages/code-reviewer && npm --prefix packages/code-reviewer run review:dry -- --diff-file data/sample-2.diff`

#### Manual

- [ ] 2.3 Read `action.yml`: no untrusted input is interpolated into a `run:` body, the API key is only in `env:`

### Phase 3: Workflow review.yml

#### Automated

- [x] 3.1 Workflow is well-formed: `npx prettier --check .github/workflows/review.yml`
- [x] 3.2 Workflow and local action lint clean: `actionlint .github/workflows/review.yml` (Docker image `rhysd/actionlint` or the release binary)
- [x] 3.3 Existing pipeline untouched: `git diff --stat -- .github/workflows/pr.yml .github/workflows/migrate.yml` prints nothing

#### Manual

- [ ] 3.4 Read `review.yml`: permissions are only `contents: read` + `pull-requests: write`, no `${{ github.event.pull_request.* }}` text inside `run:`, draft/fork/no-secret paths skip without failing the PR

### Phase 4: Verification on a real PR

#### Automated

- [ ] 4.1 Root gates unaffected: `npm run lint && npm test && npx astro check`

#### Manual

- [ ] 4.2 Secret added and the three labels exist
- [ ] 4.3 Opening the PR from `feat/code-reviewer-agent` starts `AI Code Review`; one comment appears and exactly one of `ai-cr:passed` / `ai-cr:failed` is set; the job is red on `fail`
- [ ] 4.4 Adding `ai-cr:review` re-runs the review, updates the same comment in place and removes the label
- [ ] 4.5 Screenshots (pipeline view with the job, job logs, LLM comment) saved under `context/changes/ci-cd-code-review/screens/`
