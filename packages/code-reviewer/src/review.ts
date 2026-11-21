import { Output, ToolLoopAgent, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import { REVIEWER_PROMPT, ReviewResult } from "./review-schema.ts";

export interface ReviewRun {
  result: ReviewResult;
  usage: { inputTokens: number | undefined; outputTokens: number | undefined; totalTokens: number | undefined };
}

export interface PrMeta {
  title?: string;
  body?: string;
}

// Title and description are untrusted like the diff; they only add context about the author's intent.
export function buildReviewPrompt(diff: string, meta: PrMeta = {}): string {
  const title = meta.title?.trim() ?? "";
  const body = meta.body?.trim() ?? "";
  const context =
    title === "" && body === ""
      ? ""
      : `Pull request title: ${title === "" ? "(none)" : title}\nPull request description:\n${body === "" ? "(none)" : body}\n\n`;
  return `${context}Review this diff:\n\n${diff}`;
}

// Single-shot review: no tools, two steps at most (read the diff, then emit the structured object).
export async function review(diff: string, model: LanguageModel, meta: PrMeta = {}): Promise<ReviewRun> {
  const reviewer = new ToolLoopAgent({
    model,
    instructions: REVIEWER_PROMPT,
    tools: {},
    output: Output.object({ schema: ReviewResult }),
    stopWhen: isStepCount(2),
  });

  const { output, usage } = await reviewer.generate({ prompt: buildReviewPrompt(diff, meta) });
  return {
    result: ReviewResult.parse(output),
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    },
  };
}
