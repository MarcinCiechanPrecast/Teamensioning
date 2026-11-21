import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "./args.ts";
import { truncate } from "./limits.ts";
import { COMMENT_MARKER, defang, renderComment } from "./report.ts";
import { buildReviewPrompt } from "./review.ts";
import type { ReviewResult } from "./review-schema.ts";

const criterion = { score: 4, rationale: "ping @team about this" };
const result: ReviewResult = {
  criteria: {
    implementationCorrectness: criterion,
    idiomaticity: criterion,
    complexity: criterion,
    testRiskCoverage: criterion,
    documentation: criterion,
    securitySafety: criterion,
  },
  verdict: "fail",
  summary: "**fail**: logs a raw token",
};

test("parseArgs reads --diff-file and --out and leaves them unset otherwise", () => {
  const set = parseArgs(["--diff-file", "pr.diff", "--out", "out"], {});
  assert.equal(set.diffFile, "pr.diff");
  assert.equal(set.outDir, "out");
  const unset = parseArgs([], {});
  assert.equal(unset.diffFile, undefined);
  assert.equal(unset.outDir, undefined);
});

test("truncate keeps short text and cuts long text with the original length", () => {
  assert.deepEqual(truncate("abc", 5), { text: "abc", truncated: false, originalLength: 3 });
  assert.deepEqual(truncate("abcdef", 4), { text: "abcd", truncated: true, originalLength: 6 });
});

test("buildReviewPrompt adds title and description only when given", () => {
  assert.equal(buildReviewPrompt("D"), "Review this diff:\n\nD");
  const withMeta = buildReviewPrompt("D", { title: "Fix scores", body: "Why" });
  assert.match(withMeta, /Pull request title: Fix scores/);
  assert.match(withMeta, /Pull request description:\nWhy/);
  assert.match(withMeta, /Review this diff:\n\nD$/);
});

test("renderComment starts with the marker, lists six criteria and shows truncation notes", () => {
  const comment = renderComment(result, ["Diff truncated."]);
  assert.ok(comment.startsWith(`${COMMENT_MARKER}\n`));
  assert.match(comment, /❌ fail/);
  assert.equal((comment.match(/\| [A-Z][^|]+ \| 4\/10 \|/g) ?? []).length, 6);
  assert.match(comment, /> ⚠️ Diff truncated\./);
});

test("model text cannot ping users: @mentions are defanged", () => {
  assert.equal(defang("hi @team"), "hi @​team");
  assert.doesNotMatch(renderComment(result, []), /@team/);
});
