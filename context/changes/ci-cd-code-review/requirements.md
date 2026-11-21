## Overall concept

- GHA workflow `.github/workflows/review.yml`, separate from `pr.yml`, runs for every PR to master
  (`opened`, `synchronize`, `reopened`, `labeled`) and on demand (`workflow_dispatch` not needed: retry is a label).
- Review itself lives in a local composite action `.github/actions/ai-reviewer/` so the workflow stays short.
  The action runs the existing agent from `packages/code-reviewer` (Vercel AI SDK + OpenRouter).
- The check is **optional** at first (not in branch protection), like `e2e`. Promote it to required only after
  the evals (change `code-review-evals`) show the verdict is stable.

## Input parameters

- pull request title (`github.event.pull_request.title`)
- pull request description (`github.event.pull_request.body`; cost tradeoff: truncate to ~2000 chars)
- git diff (`git diff origin/<base>...HEAD`, needs `fetch-depth: 0`; passed through a file/GITHUB_OUTPUT with a
  heredoc delimiter, never inlined in the shell)
- all three are untrusted data: never interpolate `${{ ... }}` of title/body into a `run:` script; pass via `env:`

## Code Review Criteria

Six criteria, each scored 1-10 (1 worst, 10 best), already defined in `packages/code-reviewer/src/review-schema.ts`:
implementationCorrectness, idiomaticity, complexity, testRiskCoverage, documentation, securitySafety.
Team conventions (AGENTS.md rules checkable from a diff) live in `packages/code-reviewer/src/project-conventions.ts`.
Verdict: `pass` or `fail`.

## Parked for later

- business alignment (needs broader context)
- architectural fit (needs broader context)
- plan-aware review (read `context/changes/<id>/plan.md`; lesson task 4, optional)
- making the check required in branch protection

## Expected side-effects

- one PR comment with the markdown summary (updated in place on re-run, not a new comment each time)
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green); the previous one is removed on re-run
- job fails (red check) when verdict is `fail`; the check is still not required for merge

## Expected behavior

- on-demand retry when label `ai-cr:review` is added (the label is removed after the run)
- PRs from forks do not receive secrets: skip the job cleanly with a notice instead of failing
- missing `OPENROUTER_API_KEY` secret: skip with a notice, do not fail the PR
- least privilege: `contents: read`, `pull-requests: write` (comment + labels), nothing else
- cancel superseded runs of the same PR (`concurrency`), `timeout-minutes` set, Node from `.nvmrc`
- action refs pinned to a commit SHA for third-party actions
- diff larger than a size cap (e.g. 60k chars) is truncated with a visible note in the comment
