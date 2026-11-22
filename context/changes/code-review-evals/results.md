# Eval results (baseline, 2026-11-22)

Command: `npm run eval` in `packages/code-reviewer` (4 diffs x 2 free models, judge: particle-1). Each cell is
assertions passed / total, latency, tokens in / out. Total 43 116 tokens, 2 min 34 s, cost 0 (free tier).

| Diff            | nemotron-3.5-super-vl      | ernie-5.5-flash-preview       |
| --------------- | -------------------------- | ----------------------------- |
| scores endpoint | 5/5 ok, 16 s, 840 / 2310   | 5/5 ok, 14 s, 820 / 2750      |
| migration       | 4/5 FAIL, 14 s, 900 / 2539 | ERROR (provider rate-limited) |
| React island    | 5/5 ok, 14 s, 1048 / 1902  | 2/5 FAIL, 24 s, 1007 / 4395   |
| clean control   | 2/2 ok, 15 s, 806 / 1912   | 1/2 FAIL, 22 s, 783 / 3796    |

## Reading the matrix

- **nemotron** found every planted flaw on two flawed diffs and met the DoD on the clean one. On the migration it
  named the missing RLS and the edited released migration but the judge did not accept its wording on the dropped
  `played_at` column (it framed it as data loss, not as breaking the deployed app).
- **ernie** is the weaker candidate: on the React island its output had placeholder scores and TODO rationales, and
  it rated the clean control `fail` (a false positive). Its migration case errored because the provider was
  temporarily rate-limited, so it has no verdict there.
- The `{{ }}` in the JSX fixture reached the agent intact now that `evals/run.mjs` turns templating off.
- ling-3.2-flash was dropped earlier (API errors on every call); nemotron cannot be the judge (it echoed the format
  template), particle-1 judges correctly.

## Recommendation

Keep **`nvidia/nemotron-3.5-super-vl:free`** as the CI default: highest pass rate, no false positive on the clean
control, about 15 s per review. One run per model is a baseline, not a ranking; re-run before relying on it.
The free tier allows about 50 requests per day per key and evals and PR reviews share that pool, so a full eval run
leaves little room for PR reviews the same day. Paid credits (or a second key for evals) remove that coupling.
