/**
 * Error codes the organizer correction endpoint puts in `?error=`. The league page maps a code to a fixed
 * message, so a crafted link can never make the page show arbitrary text or a raw database error.
 */
export const CORRECTION_ERROR_MESSAGES = {
  "invalid-score": "Enter a whole number from 0 to 99 for both scores.",
  "match-not-found": "That match could not be found or has no score to correct.",
  server: "The score could not be saved. Try again.",
} as const;

export type CorrectionErrorCode = keyof typeof CORRECTION_ERROR_MESSAGES;

export function isCorrectionErrorCode(value: string | null | undefined): value is CorrectionErrorCode {
  return value !== null && value !== undefined && Object.hasOwn(CORRECTION_ERROR_MESSAGES, value);
}

export type CorrectionOutcome = { kind: "updated" } | { kind: "error"; code: CorrectionErrorCode };

/** Postgres check_violation: a score outside 0-99 reached the database. */
const CHECK_VIOLATION = "23514";
/** PostgREST answers a malformed uuid with 22P02; to the organizer that is simply "not found". */
const INVALID_TEXT_REPRESENTATION = "22P02";

/**
 * Maps the result of the update to an outcome. `rowCount` is the number of rows the update returned:
 * RLS hides results of other owners' matches, so a non-owner, an unknown match and a match without
 * a result all return 0 rows and are one outcome.
 */
export function toCorrectionOutcome(result: { error: { code?: string } | null; rowCount: number }): CorrectionOutcome {
  if (result.error) {
    if (result.error.code === CHECK_VIOLATION) return { kind: "error", code: "invalid-score" };
    if (result.error.code === INVALID_TEXT_REPRESENTATION) return { kind: "error", code: "match-not-found" };
    return { kind: "error", code: "server" };
  }
  return result.rowCount === 0 ? { kind: "error", code: "match-not-found" } : { kind: "updated" };
}
