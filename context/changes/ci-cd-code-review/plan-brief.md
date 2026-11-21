# AI code review workflow for pull requests — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Requirements: `context/changes/ci-cd-code-review/requirements.md`

## What & Why

Run the existing `packages/code-reviewer` agent on every PR to `master` in GitHub Actions, so the team gets a
structured first review (six scored criteria, pass/fail) before humans open a large, agent-written PR. This is the M5L3
step: the agent from M5L2 moves from a laptop into the pipeline.

## Starting Point

`pr.yml` already holds the required checks and an optional `e2e`. The agent works locally on a piped diff and prints
JSON, but takes no PR title/body, writes no files, and there is no `.github/actions/` folder yet.

## Desired End State

A ready, same-repo PR starts `AI Code Review`: one comment (updated in place), exactly one of `ai-cr:passed` /
`ai-cr:failed`, a red job on `fail`, and re-runs by adding `ai-cr:review`. The check is optional, not in branch
protection.

## Key Decisions Made

| Decision          | Choice                                              | Why (1 sentence)                                                     | Source       |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| Workflow location | Separate `review.yml`, composite action in repo     | Keeps required checks in `pr.yml` untouched; action is reusable.     | Requirements |
| Merge gate        | Optional check, red on `fail`                       | Promote to required only after evals show stable verdicts.           | Requirements |
| CI model          | Free `nemotron…:free`, override by `REVIEW_MODEL`   | No credits on the account; one variable switches to the eval winner. | Plan         |
| Drafts            | Skipped; reviewed on `ready_for_review` or by label | Avoids a model call per push on work in progress.                    | Plan         |
| Untrusted input   | Title/body/diff via env and files, never in `run:`  | PR text is attacker-controlled.                                      | Requirements |
| Labels            | Pre-created once; workflow has no `issues: write`   | Least privilege: `contents: read`, `pull-requests: write`.           | Plan         |
| Verdict handling  | CLI exits 0 on `fail`; last step turns it red       | Comment and labels are always published first.                       | Plan         |

## Scope

**In scope:** CLI inputs/outputs and size caps, composite action, `review.yml`, real-PR verification with evidence screenshots.

**Out of scope:** required status in branch protection, business/architecture criteria, agent tools, fork PRs, changes to `pr.yml`, app or database.

## Architecture / Approach

The agent and schema stay as they are. A thin CI layer wraps them: CLI (`--diff-file`, `--out`, PR env vars) → composite
action (install, run, expose `verdict`) → workflow (triggers, skips, `gh` comment upsert and labels, final red step).

## Phases at a Glance

| Phase                      | What it delivers                                            | Key risk                                         |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| 1. Agent ready for CI      | CLI takes PR metadata and a diff file, writes verdict files | Prompt change must stay backward compatible      |
| 2. Composite action        | `.github/actions/ai-reviewer` with inputs/outputs           | Script injection through inputs                  |
| 3. Workflow `review.yml`   | Triggers, skips, comment, labels, retry, red on fail        | Concurrency cancelling a real run by label noise |
| 4. Verification on real PR | Secret and labels set, live run, screenshots                | Free-model rate limits; needs your secret        |

**Prerequisites:** the branch pushed to GitHub with a PR; `OPENROUTER_API_KEY` repository secret added by you.
**Estimated effort:** ~2 sessions across 4 phases (phases 1-3 are local, phase 4 needs GitHub).

## Open Risks & Assumptions

- The free model can rate-limit or change; a transient error should fail the job loudly, not set a label.
- The first PR (this branch) has a large diff and will be truncated at 60000 characters.
- Creating labels and opening a PR touch the remote repository and need your go-ahead at that point.

## Success Criteria (Summary)

- A PR gets one in-place comment and one verdict label from the pipeline, and a red job on `fail`.
- Retry by label works and the label is cleaned up.
- Required checks stay unaffected; evidence screenshots exist for 10xChampion.
