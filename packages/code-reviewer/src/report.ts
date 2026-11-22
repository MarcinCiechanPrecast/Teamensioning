import type { ReviewResult } from "./review-schema.ts";

// First line of every review comment; the workflow finds and updates the existing comment by this marker.
export const COMMENT_MARKER = "<!-- ai-code-review -->";

const LABELS: Record<keyof ReviewResult["criteria"], string> = {
  implementationCorrectness: "Implementation correctness",
  idiomaticity: "Idiomaticity",
  complexity: "Complexity",
  testRiskCoverage: "Test / risk coverage",
  documentation: "Documentation",
  securitySafety: "Security & safety",
};

// Model output goes into a PR comment: a zero-width space after "@" stops it from pinging users or teams.
export function defang(text: string): string {
  return text.replace(/@(?=\w)/g, "@​");
}

export function renderComment(result: ReviewResult, notes: string[]): string {
  const icon = result.verdict === "pass" ? "✅" : "❌";
  const entries = Object.entries(result.criteria) as [keyof typeof LABELS, ReviewResult["criteria"][keyof typeof LABELS]][];
  const table = entries.map(([key, c]) => `| ${LABELS[key]} | ${String(c.score)}/10 |`).join("\n");
  const details = entries
    .map(([key, c]) => `- **${LABELS[key]}** (${String(c.score)}/10): ${defang(c.rationale)}`)
    .join("\n");
  const noteBlock = notes.length === 0 ? "" : `\n\n${notes.map((n) => `> ⚠️ ${n}`).join("\n")}`;

  return [
    COMMENT_MARKER,
    `## AI code review: ${icon} ${result.verdict}`,
    "",
    defang(result.summary),
    "",
    "| Criterion | Score |",
    "| --- | --- |",
    table,
    "",
    "<details><summary>Rationale per criterion</summary>",
    "",
    details,
    "",
    "</details>",
  ].join("\n") + noteBlock + "\n";
}
