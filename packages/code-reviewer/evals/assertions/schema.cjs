// Structure check every case shares: the gate in CI is only as trustworthy as this shape.
const KEYS = [
  "implementationCorrectness",
  "idiomaticity",
  "complexity",
  "testRiskCoverage",
  "documentation",
  "securitySafety",
];

module.exports = (output) => {
  const result = typeof output === "string" ? JSON.parse(output) : output;
  if (result?.verdict !== "pass" && result?.verdict !== "fail") {
    return { pass: false, score: 0, reason: `verdict is ${JSON.stringify(result?.verdict)}` };
  }
  for (const key of KEYS) {
    const score = result.criteria?.[key]?.score;
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      return { pass: false, score: 0, reason: `${key}.score is ${JSON.stringify(score)}, expected an integer 1-10` };
    }
  }
  return { pass: true, score: 1, reason: "six integer scores 1-10 and a pass/fail verdict" };
};
