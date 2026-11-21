import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type Options } from "./args.ts";
import { BODY_MAX_CHARS, DIFF_MAX_CHARS, truncate } from "./limits.ts";
import { renderComment } from "./report.ts";
import { buildReviewPrompt, review } from "./review.ts";
import { REVIEWER_PROMPT } from "./review-schema.ts";

const DATA_DIR = new URL("../data/", import.meta.url);

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// A --diff-file wins, then a piped diff, otherwise a bundled sample from data/ (the bare argument picks which).
async function loadDiff(options: Options): Promise<{ diff: string; source: string }> {
  if (options.diffFile !== undefined) return { diff: readFileSync(options.diffFile, "utf8"), source: options.diffFile };
  const piped = (await readStdin()).trim();
  if (piped !== "") return { diff: piped, source: "stdin" };
  const file = new URL(`${options.sample}.diff`, DATA_DIR);
  return { diff: readFileSync(file, "utf8"), source: fileURLToPath(file) };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env);
  const loaded = await loadDiff(options);

  // PR text arrives through the environment, never through the command line or a shell string.
  const diff = truncate(loaded.diff, DIFF_MAX_CHARS);
  const body = truncate(process.env.REVIEW_PR_BODY ?? "", BODY_MAX_CHARS);
  const notes: string[] = [];
  if (diff.truncated) notes.push(`Diff truncated to ${String(DIFF_MAX_CHARS)} of ${String(diff.originalLength)} characters; the rest was not reviewed.`);
  if (body.truncated) notes.push(`PR description truncated to ${String(BODY_MAX_CHARS)} of ${String(body.originalLength)} characters.`);
  const meta = { title: process.env.REVIEW_PR_TITLE ?? "", body: body.text };

  if (options.dryRun) {
    console.error(`[dry-run] diff from ${loaded.source}, model ${options.model}; no model call is made.`);
    console.log(`${REVIEWER_PROMPT}\n\n---\n${buildReviewPrompt(diff.text, meta)}`);
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set. Copy .env.example to .env and paste your key, or use --dry-run.");
    process.exitCode = 2;
    return;
  }

  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  const openrouter = createOpenRouter();
  console.error(`Reviewing diff from ${loaded.source} with ${options.model}...`);
  const { result, usage } = await review(diff.text, openrouter(options.model), meta);

  if (options.outDir !== undefined) {
    mkdirSync(options.outDir, { recursive: true });
    writeFileSync(join(options.outDir, "verdict.txt"), `${result.verdict}\n`);
    writeFileSync(join(options.outDir, "summary.md"), renderComment(result, notes));
    writeFileSync(join(options.outDir, "result.json"), JSON.stringify(result, null, 2));
  }

  console.log(JSON.stringify(result, null, 2));
  console.error(
    `tokens: ${String(usage.inputTokens ?? "?")} in / ${String(usage.outputTokens ?? "?")} out; verdict: ${result.verdict}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
