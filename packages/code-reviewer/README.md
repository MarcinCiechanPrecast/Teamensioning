# @teamensioning/code-reviewer

Standalone code-review agent for M5L2: a git diff goes in, a structured JSON verdict comes out. Built on the Vercel AI SDK (`ToolLoopAgent` + `Output.object`) with OpenRouter as the model provider. It is deliberately independent of the Astro app: own `package.json`, own dependencies, excluded from the root lint and type check.

## Run

```bash
cd packages/code-reviewer
npm install
cp .env.example .env        # then paste your own OPENROUTER_API_KEY; the file is gitignored

git diff | npm run review   # review a real diff
npm run review              # review the bundled data/sample-1.diff (a flawed change)
npm run review -- sample-2  # review the clean sample
npm run review:dry          # print the prompt only, no key and no model call
```

`--model <id>` or `REVIEW_MODEL` overrides the default model (`z-ai/glm-5.3`).

## Output

One JSON object on stdout: six criteria (`score` 1-10 plus `rationale`), a `pass`/`fail` `verdict`, and a markdown `summary` for a PR comment. Token usage and the verdict go to stderr.

## Checks

```bash
npm run typecheck
npm test
```

## Notes

- The reviewer sees only the diff and the prompt. It does not read `AGENTS.md`; project rules go in `src/project-conventions.ts`.
- The diff is treated as untrusted input in the prompt.
- Data path: the diff goes to OpenRouter and the chosen model provider. Use a key whose terms you accept for the code you send.
- Next (M5L3): wire this into a PR workflow, add promptfoo evals and decide the merge gate.

## Evals (promptfoo)

```bash
npm run eval                          # 4 diffs x 3 free models, static checks + LLM judge
npm run eval -- --filter-first-n 1    # quick wiring check
npx promptfoo view                    # open the last results in the browser
```

The suite runs the real agent (`evals/reviewProvider.ts`). Flawed diffs must `fail` with a low `securitySafety`
score and the judge must find each planted flaw; the clean diff must meet the Definition of Done
(`context/team/definition-of-done.md`, thresholds mirrored in `evals/assertions/dod-gate.cjs`). Run it before
changing the prompt, the schema or the CI model. Free models rate-limit, so a full run takes several minutes.
