// Runs promptfoo with templating off (JSX fixtures contain "{{ }}") and a delay between calls (free-tier rate limits).
// Extra CLI args are passed through, e.g. `npm run eval -- --filter-first-n 1`.
import { spawnSync } from "node:child_process";

const args = [
  "promptfoo",
  "eval",
  "-c",
  "evals/promptfooconfig.yaml",
  "--no-cache",
  "--delay",
  "2000",
  ...process.argv.slice(2),
];
const result = spawnSync("npx", args, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PROMPTFOO_DISABLE_TEMPLATING: "true" },
});
process.exit(result.status ?? 1);
