// The Definition of Done gate (context/team/definition-of-done.md): verdict pass, every criterion at least
// MIN_CRITERION, securitySafety at least MIN_SECURITY. Keep these constants in step with the document.
const MIN_CRITERION = 5;
const MIN_SECURITY = 7;

module.exports = (output) => {
  const result = typeof output === "string" ? JSON.parse(output) : output;
  if (result?.verdict !== "pass")
    return { pass: false, score: 0, reason: `verdict is ${result?.verdict}, expected pass` };
  for (const [key, criterion] of Object.entries(result.criteria ?? {})) {
    const min = key === "securitySafety" ? MIN_SECURITY : MIN_CRITERION;
    if (criterion.score < min)
      return { pass: false, score: 0, reason: `${key} scored ${criterion.score}, DoD needs at least ${min}` };
  }
  return { pass: true, score: 1, reason: "meets the Definition of Done" };
};
