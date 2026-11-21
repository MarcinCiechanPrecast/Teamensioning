import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.ts";
import { buildReviewPrompt, review } from "./review.ts";
import { REVIEWER_PROMPT } from "./review-schema.ts";

const DATA_DIR = new URL("../data/", import.meta.url);

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// Piped diff wins; otherwise review a bundled sample from data/ (argument picks which one).
async function loadDiff(sample: string): Promise<{ diff: string; source: string }> {
  const piped = (await readStdin()).trim();
  if (piped !== "") return { diff: piped, source: "stdin" };
  const file = new URL(`${sample}.diff`, DATA_DIR);
  return { diff: readFileSync(file, "utf8"), source: fileURLToPath(file) };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env);
  const { diff, source } = await loadDiff(options.sample);

  if (options.dryRun) {
    console.error(`[dry-run] diff from ${source}, model ${options.model}; no model call is made.`);
    console.log(`${REVIEWER_PROMPT}\n\n---\n${buildReviewPrompt(diff)}`);
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set. Copy .env.example to .env and paste your key, or use --dry-run.");
    process.exitCode = 2;
    return;
  }

  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  const openrouter = createOpenRouter();
  console.error(`Reviewing diff from ${source} with ${options.model}...`);
  const { result, usage } = await review(diff, openrouter(options.model));

  console.log(JSON.stringify(result, null, 2));
  console.error(
    `tokens: ${String(usage.inputTokens ?? "?")} in / ${String(usage.outputTokens ?? "?")} out; verdict: ${result.verdict}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
