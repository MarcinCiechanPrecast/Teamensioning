# Definition of Done and promptfoo evals for the review agent — Implementation Plan

## Overview

Write down the team's Definition of Done for pull requests (six criteria, conventions, a numeric pass threshold) and
turn it into an executable regression suite: promptfoo runs the real review agent on four diffs (three with planted
flaws, one clean) across three free OpenRouter models, with static checks and an LLM judge. The suite shows which
model is good enough and guards every later prompt change. M5L3 task 3.

## Current State Analysis

- `packages/code-reviewer` exposes `review(diff, model, meta)` and the `ReviewResult` schema (six criteria with
  `score` 1-10, `verdict` `pass|fail`, `summary`) in `src/review.ts:15-33` and `src/review-schema.ts:43-48`.
- Bundled diffs: `data/sample-1.diff` (flawed: raw token logged, zod validation and try/catch removed) and
  `data/sample-2.diff` (clean `pointsFor` addition with a test).
- No `evals/` folder, no promptfoo dependency, no written DoD; criteria exist only as the rubric in the schema and
  `src/project-conventions.ts` (five AGENTS.md rules).
- Only free OpenRouter models can be used (no credits). Free models with structured output: nemotron-3.5-super-vl
  (already passed both samples), ling-3.2-flash, ernie-5.5-flash-preview, particle-1.
- Live runs: output tokens about 3.6x input, so a 12-case run costs time, not money, on free models, but may hit rate limits.

## Desired End State

`context/team/definition-of-done.md` states the DoD and the gate rule. `cd packages/code-reviewer && npm run eval`
runs 4 diffs x 3 models and prints a pass/fail matrix with token usage; flawed diffs must `fail` and be explained
correctly, the clean diff must meet the DoD threshold. A results note records the first matrix and the model
recommendation. Verify by running the suite and reading the matrix.

### Key Discoveries:

- promptfoo custom providers return a `ProviderResponse` whose `output` may be an object, with `tokenUsage` and
  `cost`; `javascript` assertions receive that object (promptfoo docs via context7).
- `llm-rubric` grader is set with `defaultTest.options.provider`; promptfoo does not pick OpenRouter on its own.
- The provider can read the diff from `context.vars.diff`, so the prompt template is only a placeholder.

## What We're NOT Doing

- Paid models, the CI wiring of the evals (a later step once the matrix is stable), making the review check required.
- Changing the review prompt or schema to improve scores (this change measures; tuning is a follow-up).
- Business-alignment or architecture criteria, agent tools, red-teaming.
- Changing `review.yml`, `pr.yml` or any app code.

## Implementation Approach

DoD first (it is the contract), then the smallest working eval with one fixture to prove the provider/judge wiring,
then the remaining fixtures and assertions, then the multi-model run. Static assertions are derived from the DoD
thresholds so the document and the suite cannot drift: pass iff verdict `pass`, every criterion at least 5,
`securitySafety` at least 7.

## Critical Implementation Details

- **Timing & lifecycle**: promptfoo templates prompts and vars with Nunjucks; a JSX fixture contains `{{ }}`.
  Verify with the React fixture first; if rendering breaks it, run through `PROMPTFOO_DISABLE_TEMPLATING=true` via a
  small cross-platform wrapper (an inline `VAR=value` in an npm script fails on Windows shells).
- **Performance constraints**: the judge and the three models share one free-tier rate limit; run with a low
  `maxConcurrency` and `--no-cache` so every run is a real measurement.

## Phase 1: Definition of Done

### Overview

One team-owned document that the agent prompt and the evals both trace back to.

### Changes Required:

#### 1. DoD document

**File**: `context/team/definition-of-done.md`

**Intent**: State what "done" means for a PR: the six criteria with a one-line 1/10 anchor each, the five project
conventions, the numeric gate (`verdict = pass`, every criterion at least 5, `securitySafety` at least 7), what the
agent does not judge (business, architecture) and stays a human call, and how the gate evolves (optional now, required
after stable evals). Written in Polish like the other `context/team` documents.

**Contract**: sections: Cel, Kryteria (table), Konwencje projektu, Bramka (thresholds), Poza zakresem agenta, Jak to
zmieniać (changes go through the evals).

### Success Criteria:

#### Automated Verification:

- Document is well-formed: `npx prettier --check context/team/definition-of-done.md`

#### Manual Verification:

- You read the DoD and the thresholds (5 per criterion, 7 for security) match your expectations

---

## Phase 2: promptfoo wiring with one fixture

### Overview

Prove the provider, the judge and the multi-model matrix on a single diff.

### Changes Required:

#### 1. Dependency and script

**File**: `packages/code-reviewer/package.json`

**Intent**: Add `promptfoo` as a devDependency and an `eval` script running promptfoo against
`evals/promptfooconfig.yaml` with `--no-cache` (wrapper only if Phase 2 shows the templating problem).

**Contract**: `npm run eval` from `packages/code-reviewer`; lockfile updated; root `package.json` untouched.

#### 2. Provider running the real agent

**File**: `packages/code-reviewer/evals/reviewProvider.ts`

**Intent**: promptfoo custom provider that reads the diff from `context.vars.diff`, calls `review()` with an
OpenRouter model from `config.model` and returns the `ReviewResult` as `output` with `tokenUsage` and `cost: 0`.
Failures return `{ error }` instead of throwing, so one rate-limited model does not abort the matrix.

**Contract**: `export default class ReviewProvider implements ApiProvider` with `id()` and `callApi(prompt, context)`;
reads `OPENROUTER_API_KEY` from the environment (`.env` in the package).

#### 3. Config with models and judge

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Three providers (nemotron, ling-3.2-flash, ernie-5.5-flash-preview, each `file://./reviewProvider.ts` with
its `config.model` and a short label), a placeholder prompt, `defaultTest.options.provider` set to
`openrouter:particle-ai/particle-1:free` as the judge (nemotron failed as judge in Phase 2: it echoed the format template; particle-1 is not a model under test), and the first test using `data/sample-1.diff`.

**Contract**: providers `label`s are the matrix column names; `maxConcurrency` low (2).

### Success Criteria:

#### Automated Verification:

- Package type check passes: `cd packages/code-reviewer && npm run typecheck`
- Existing package tests pass: `cd packages/code-reviewer && npm test`
- Config loads and the provider runs one case: `cd packages/code-reviewer && npm run eval -- --filter-first-n 1`

#### Manual Verification:

- The matrix shows three columns (one per model) with a pass/fail, token usage and a judge verdict for the first fixture

---

## Phase 3: Fixtures and assertions

### Overview

Four diffs with known flaws and a clean control, each with static and LLM-judge assertions.

### Changes Required:

#### 1. Fixtures

**File**: `packages/code-reviewer/evals/fixtures/*.diff` (new) and reuse of `data/sample-1.diff`, `data/sample-2.diff`

**Intent**: (a) `scores-token-logging` (reuse sample-1): raw share token logged, validation removed, try/catch removed;
(b) `migration-released-edit.diff`: edits an already released migration, adds a table without RLS, drops a column
still used by the deployed app; (c) `react-island-stale.diff`: a React 19 island with three impactful flaws
(user text rendered with `dangerouslySetInnerHTML`, `setInterval` in `useEffect` without cleanup, unchecked
`fetch().json()` result); includes `style={{...}}` to exercise templating; (d) `points-for-clean` (reuse sample-2) as
the no-false-positive control.

**Contract**: each flawed fixture lists its planted flaws in a comment line of the test (`description`), not in the diff.

#### 2. Assertions

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: For every flawed fixture: a `javascript` assertion that `verdict === "fail"` and the relevant criterion is
at most 4 (security for a, b, c's XSS); one `llm-rubric` per planted flaw ("the review names X"). For the clean
fixture: a `javascript` assertion applying the DoD gate (verdict `pass`, every criterion at least 5, security at
least 7). Every case also asserts all six criteria are integers 1-10.

**Contract**: thresholds written once as constants/comment in the config and mirrored in the DoD.

### Success Criteria:

#### Automated Verification:

- Package type check and tests still pass: `cd packages/code-reviewer && npm run typecheck && npm test`
- The suite runs end to end and writes JSON results: `cd packages/code-reviewer && npm run eval -- -o evals/results/latest.json`

#### Manual Verification:

- The JSX fixture (with `{{ }}`) reaches the agent intact (check the prompt in the results view)
- Assertions fail for a deliberately broken expectation (flip one expected verdict, see red, restore)

---

## Phase 4: Run, compare, record

### Overview

Measure the three models and record the result as the baseline.

### Changes Required:

#### 1. Baseline note

**File**: `context/changes/code-review-evals/results.md`

**Intent**: Record the first matrix (pass rate per model and per fixture, tokens in/out, time, notable misses), the
judge caveat (nemotron is both judge and a competitor), the model recommended for the CI default and what would change
the recommendation. Add a short `packages/code-reviewer/README.md` section on running the suite and reading it.

**Contract**: `packages/code-reviewer/evals/results/` is gitignored; only `results.md` is committed.

### Success Criteria:

#### Automated Verification:

- Root gates unaffected: `npm test && npx astro check`

#### Manual Verification:

- You read the matrix and agree with the model recommendation
- The suite fails (non-zero exit) when a flawed fixture is rated `pass`, so it works as a regression gate

**Implementation Note**: Wiring the suite into CI and promoting the review check to required are separate follow-ups.

---

## Testing Strategy

### Unit Tests:

- Existing package tests stay green; no new unit tests (the provider is exercised by the suite itself).

### Integration Tests:

- `npm run eval` is the integration test: 4 fixtures x 3 models, static plus judge assertions.

### Manual Testing Steps:

1. Run `npm run eval`, open the matrix, read each failing cell's reason.
2. Flip one expectation to see the gate go red, then restore.
3. Re-run once to see run-to-run variance on the same models.

## Performance Considerations

12 agent runs plus judge calls per eval; low concurrency and `--no-cache`. Free-tier rate limits can produce provider
errors that must be reported as errors, not as review failures.

## Migration Notes

None. Additive, package-local, no CI change.

## References

- Requirements context: M5L3 task 3; `context/changes/ci-cd-code-review/plan.md` (workflow this feeds into)
- Agent: `packages/code-reviewer/src/review.ts:15-33`, `packages/code-reviewer/src/review-schema.ts:43-48`
- Fixtures reused: `packages/code-reviewer/data/sample-1.diff`, `packages/code-reviewer/data/sample-2.diff`
- promptfoo docs (context7): custom provider `ProviderResponse`, `defaultTest.options.provider` grader override

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Definition of Done

#### Automated

- [x] 1.1 Document is well-formed: `npx prettier --check context/team/definition-of-done.md`

#### Manual

- [ ] 1.2 You read the DoD and the thresholds (5 per criterion, 7 for security) match your expectations

### Phase 2: promptfoo wiring with one fixture

#### Automated

- [x] 2.1 Package type check passes: `cd packages/code-reviewer && npm run typecheck`
- [x] 2.2 Existing package tests pass: `cd packages/code-reviewer && npm test`
- [x] 2.3 Config loads and the provider runs one case: `cd packages/code-reviewer && npm run eval -- --filter-first-n 1`

#### Manual

- [ ] 2.4 The matrix shows three columns (one per model) with a pass/fail, token usage and a judge verdict for the first fixture

### Phase 3: Fixtures and assertions

#### Automated

- [ ] 3.1 Package type check and tests still pass: `cd packages/code-reviewer && npm run typecheck && npm test`
- [ ] 3.2 The suite runs end to end and writes JSON results: `cd packages/code-reviewer && npm run eval -- -o evals/results/latest.json`

#### Manual

- [ ] 3.3 The JSX fixture (with `{{ }}`) reaches the agent intact (check the prompt in the results view)
- [ ] 3.4 Assertions fail for a deliberately broken expectation (flip one expected verdict, see red, restore)

### Phase 4: Run, compare, record

#### Automated

- [ ] 4.1 Root gates unaffected: `npm test && npx astro check`

#### Manual

- [ ] 4.2 You read the matrix and agree with the model recommendation
- [ ] 4.3 The suite fails (non-zero exit) when a flawed fixture is rated `pass`, so it works as a regression gate
