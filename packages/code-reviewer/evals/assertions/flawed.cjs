// A diff with planted flaws must fail the review and rate the relevant criterion low.
// config: { criterion: "<schema key>", max: <highest acceptable score> }
module.exports = (output, { config }) => {
  const result = typeof output === "string" ? JSON.parse(output) : output;
  const { criterion, max } = config;
  const score = result?.criteria?.[criterion]?.score;
  if (result?.verdict !== "fail")
    return { pass: false, score: 0, reason: `verdict is ${result?.verdict}, expected fail` };
  if (typeof score !== "number" || score > max) {
    return { pass: false, score: 0, reason: `${criterion} scored ${score}, expected at most ${max}` };
  }
  return { pass: true, score: 1, reason: `verdict fail and ${criterion} scored ${score} (at most ${max})` };
};
