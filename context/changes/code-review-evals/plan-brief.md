# Definition of Done and promptfoo evals for the review agent — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`

## What & Why

Write the team's Definition of Done for PRs and turn it into an executable promptfoo suite that runs the real review
agent on four diffs across three free models. The matrix replaces "looks fine on one PR" with measured pass rates and
guards every later prompt or model change. M5L3 task 3.

## Starting Point

The agent, its six-criterion schema and two sample diffs exist in `packages/code-reviewer`. There is no `evals/`
folder, no promptfoo, and the criteria live only in code.

## Desired End State

`context/team/definition-of-done.md` defines the gate; `npm run eval` (in the package) prints a 4 x 3 matrix with
token usage. Flawed diffs must fail and be explained correctly, the clean diff must meet the DoD. A results note
records the baseline and recommends a CI model.

## Key Decisions Made

| Decision       | Choice                                                                  | Why (1 sentence)                                                             | Source |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Models         | nemotron-3.5-super-vl, ling-3.2-flash, ernie-5.5-flash-preview (free)   | No credits; all three advertise structured output.                           | Plan   |
| LLM judge      | particle-1 free via `defaultTest.options.provider`                      | nemotron echoed the template as judge; particle-1 is not a model under test. | Plan   |
| DoD gate       | verdict `pass`, every criterion at least 5, `securitySafety` at least 7 | A numeric rule the static assertions can mirror exactly.                     | Plan   |
| Provider       | Custom `file://` provider calling the real `review()`                   | Tests the agent and schema, not a bare model with a prompt.                  | Plan   |
| Fixtures       | 3 flawed (token logging, released migration, React island) + 1 clean    | Planted flaws are checkable; the clean diff catches false alarms.            | Plan   |
| Scope boundary | No prompt tuning, no CI wiring in this change                           | Measure first; wiring and tuning are follow-ups.                             | Plan   |

## Scope

**In scope:** DoD document, promptfoo dependency and `eval` script, provider, config, fixtures, assertions, baseline note.

**Out of scope:** paid models, CI integration, prompt/schema changes, making the review check required.

## Architecture / Approach

DoD (contract) → minimal wiring proven on one fixture → all fixtures and assertions → three-model run and recorded
baseline. Static assertions mirror the DoD thresholds so the document and the suite cannot drift.

## Phases at a Glance

| Phase                      | What it delivers                               | Key risk                                  |
| -------------------------- | ---------------------------------------------- | ----------------------------------------- |
| 1. Definition of Done      | `context/team/definition-of-done.md`           | Thresholds must match your policy         |
| 2. promptfoo wiring        | provider, config, `npm run eval`, one fixture  | Judge and provider share free-tier limits |
| 3. Fixtures and assertions | 4 diffs, static plus LLM-judge assertions      | `{{ }}` in JSX hit by templating          |
| 4. Run, compare, record    | `results.md` baseline and model recommendation | Free models vary run to run               |

**Prerequisites:** `OPENROUTER_API_KEY` in `packages/code-reviewer/.env` (already there).
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- Free models may rate-limit or change; provider errors are reported as errors, not as review failures.
- Free judges vary: nemotron failed as judge, particle-1 worked; results are a baseline, not a leaderboard.
- Three planted flaws per diff are my choice; you can redirect after reading the fixtures.

## Success Criteria (Summary)

- A written DoD exists and the suite enforces the same thresholds.
- The matrix runs end to end and flags a deliberately wrong expectation.
- A recorded baseline recommends a CI model.
