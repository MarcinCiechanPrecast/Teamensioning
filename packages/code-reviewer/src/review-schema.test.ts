import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "./args.ts";
import { REVIEWER_PROMPT, ReviewResult } from "./review-schema.ts";

const criterion = { score: 7, rationale: "ok" };
const valid = {
  criteria: {
    implementationCorrectness: criterion,
    idiomaticity: criterion,
    complexity: criterion,
    testRiskCoverage: criterion,
    documentation: criterion,
    securitySafety: criterion,
  },
  verdict: "pass",
  summary: "**pass**",
};

test("ReviewResult accepts a complete result", () => {
  assert.equal(ReviewResult.parse(valid).verdict, "pass");
});

test("ReviewResult rejects a missing criterion", () => {
  const { securitySafety: _omitted, ...rest } = valid.criteria;
  assert.equal(ReviewResult.safeParse({ ...valid, criteria: rest }).success, false);
});

test("ReviewResult rejects an unknown verdict", () => {
  assert.equal(ReviewResult.safeParse({ ...valid, verdict: "maybe" }).success, false);
});

test("the prompt names all six criteria and treats the diff as untrusted", () => {
  for (const name of Object.keys(valid.criteria)) assert.match(REVIEWER_PROMPT, new RegExp(name));
  assert.match(REVIEWER_PROMPT, /untrusted data/);
});

test("parseArgs: defaults, flags and sample name", () => {
  assert.deepEqual(parseArgs([], {}), { dryRun: false, model: "z-ai/glm-5.3", sample: "sample-1" });
  assert.deepEqual(parseArgs(["--dry-run", "sample-2", "--model", "x/y"], {}), {
    dryRun: true,
    model: "x/y",
    sample: "sample-2",
  });
  assert.equal(parseArgs([], { REVIEW_MODEL: "env/model" }).model, "env/model");
});
