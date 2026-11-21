export const DEFAULT_MODEL = "z-ai/glm-5.3";

export interface Options {
  dryRun: boolean;
  model: string;
  sample: string;
}

// `--dry-run` prints the prompt without calling a model, `--model <id>` overrides REVIEW_MODEL, and a bare
// argument picks which bundled sample diff to review when nothing is piped in.
export function parseArgs(argv: string[], env: Record<string, string | undefined>): Options {
  const options: Options = { dryRun: false, model: env.REVIEW_MODEL ?? DEFAULT_MODEL, sample: "sample-1" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--model") options.model = argv[++i] ?? options.model;
    else if (arg !== undefined && !arg.startsWith("--")) options.sample = arg;
  }
  return options;
}
