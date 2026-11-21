import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import { review } from "../src/review.ts";

// promptfoo provider that runs the real review agent (prompt, schema, structured output), not a bare model.
// The diff comes from the test's `diff` var; the model from the provider's `config.model`.
export default class ReviewProvider implements ApiProvider {
  private readonly model: string;

  constructor(options: ProviderOptions) {
    const model = (options.config as { model?: string } | undefined)?.model;
    if (model === undefined || model === "") throw new Error("reviewProvider needs config.model (an OpenRouter id).");
    this.model = model;
  }

  id(): string {
    return `review-agent:${this.model}`;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const diff = context?.vars?.diff;
    if (typeof diff !== "string" || diff.trim() === "") return { error: "The test has no `diff` var." };

    try {
      const { result, usage } = await review(diff, createOpenRouter()(this.model));
      return {
        output: result,
        tokenUsage: {
          prompt: usage.inputTokens ?? 0,
          completion: usage.outputTokens ?? 0,
          total: usage.totalTokens ?? 0,
        },
        cost: 0, // free-tier models only
      };
    } catch (error) {
      // A rate limit or a schema miss is a provider error in the matrix, not a failed review.
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
