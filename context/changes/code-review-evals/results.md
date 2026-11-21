# Eval results (partial baseline)

Status: **no complete matrix yet.** The OpenRouter free-tier daily limit (`free-models-per-day`) ran out during
the first full run, so the suite aborted with `RateLimitExhaustedError`. Re-run `npm run eval` in
`packages/code-reviewer` after the limit resets (00:00 UTC) and replace this note with the full matrix.

## What the first partial run showed (nemotron-3.5-super-vl, ernie-5.5-flash-preview)

| Diff            | nemotron                   | ernie                         |
| --------------- | -------------------------- | ----------------------------- |
| scores endpoint | 5/5 assertions pass        | 5/5 assertions pass           |
| migration       | 3/5 (429 on one call)      | 4/5 (429 on one call)         |
| React island    | not run (templating error) | not run (templating error)    |
| clean control   | 2/2 pass (DoD met)         | FAIL: verdict `fail` on clean |

- The React island case failed before reaching the agent because promptfoo templated the `{{ }}` in the JSX diff.
  Fixed afterwards by `evals/run.mjs` (templating off); not yet re-verified against a model.
- ernie rated the clean control `fail` (a false positive); nemotron did not. One run is not a ranking.
- ling-3.2-flash returned `AI_APICallError` on every call and was dropped from the suite.
- nemotron failed as the LLM judge (it echoed the format template, reason `"string"`); particle-1 judged correctly.

## Offline checks that did pass

The assertions (`schema.cjs`, `flawed.cjs`, `dod-gate.cjs`) were run against a saved real result: shape accepted,
planted-flaw threshold works, DoD gate rejects a `fail` verdict and a `securitySafety` of 6, accepts all-8 `pass`,
and a deliberately impossible expectation (`max: 0`) fails.

## Recommendation (provisional)

Keep `nvidia/nemotron-3.5-super-vl:free` as the CI default for now: it was correct on every case it completed.
Decide for real once the full matrix exists, and consider paid credits: free models are rate-limited per day,
which also turns the PR review check red when the limit is hit.
