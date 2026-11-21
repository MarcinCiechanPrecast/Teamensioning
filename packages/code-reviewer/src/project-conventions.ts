// Team conventions the reviewer must enforce on top of the six generic criteria (source: AGENTS.md).
// Empty string = none (the prompt then omits the section entirely).
// Keep each rule checkable from the diff alone; the reviewer cannot see the rest of the repo.
export const PROJECT_CONVENTIONS = [
  "- Server errors are logged through `logServerEvent(level, op, fields)` from `@/lib/observability`, never raw `console.*`.",
  "- Never log an email, a password or a raw share token; log `hashToken(token)` and safe ids instead.",
  "- Every error branch that redirects with `?error=` logs first, with `...errorFields(error)`.",
  "- Input from forms or request bodies is validated (the project uses zod schemas in `src/lib/validation`) before use; a malformed body is a 400/redirect, not an unhandled throw.",
  "- New Supabase tables enable RLS with granular per-operation, per-role policies; released migrations are never edited.",
].join("\n");
