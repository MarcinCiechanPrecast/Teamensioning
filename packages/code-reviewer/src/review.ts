import { Output, ToolLoopAgent, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import { REVIEWER_PROMPT, ReviewResult } from "./review-schema.ts";

export interface ReviewRun {
  result: ReviewResult;
  usage: { inputTokens: number | undefined; outputTokens: number | undefined; totalTokens: number | undefined };
}

export function buildReviewPrompt(diff: string): string {
  return `Review this diff:\n\n${diff}`;
}

// Single-shot review: no tools, two steps at most (read the diff, then emit the structured object).
export async function review(diff: string, model: LanguageModel): Promise<ReviewRun> {
  const reviewer = new ToolLoopAgent({
    model,
    instructions: REVIEWER_PROMPT,
    tools: {},
    output: Output.object({ schema: ReviewResult }),
    stopWhen: isStepCount(2),
  });

  const { output, usage } = await reviewer.generate({ prompt: buildReviewPrompt(diff) });
  return {
    result: ReviewResult.parse(output),
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    },
  };
}
