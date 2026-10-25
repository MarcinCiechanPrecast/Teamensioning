/**
 * Error codes the score endpoint puts in `?error=`. The share page maps a code to a fixed message,
 * so a crafted link can never make the page show arbitrary text or a raw database error.
 */
export const SCORE_ERROR_MESSAGES = {
  "invalid-score": "Enter a whole number from 0 to 99 for both scores.",
  "match-not-found": "That match could not be found.",
  server: "The score could not be saved. Try again.",
} as const;

export type ScoreErrorCode = keyof typeof SCORE_ERROR_MESSAGES;

export function isScoreErrorCode(value: string | null | undefined): value is ScoreErrorCode {
  return value !== null && value !== undefined && Object.hasOwn(SCORE_ERROR_MESSAGES, value);
}

/** What the endpoint does after a submit: redirect to the share page, with a notice or an error code. */
export type ScoreOutcome = { kind: "created" } | { kind: "already-entered" } | { kind: "error"; code: ScoreErrorCode };

/** Reads the status of a submit_match_score payload without trusting its shape. */
export function toScoreOutcome(data: unknown): ScoreOutcome {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { kind: "error", code: "server" };

  switch ((data as Record<string, unknown>).status) {
    case "created":
      return { kind: "created" };
    case "already_entered":
      return { kind: "already-entered" };
    case "not_found":
      return { kind: "error", code: "match-not-found" };
    default:
      return { kind: "error", code: "server" };
  }
}

/** Postgres check_violation: a score outside 0-99 reached the database. */
const CHECK_VIOLATION = "23514";

export function rpcErrorCode(error: { code?: string }): ScoreErrorCode {
  return error.code === CHECK_VIOLATION ? "invalid-score" : "server";
}

/** A bad match id means no such match; every other validation problem is a bad score. */
export function validationErrorCode(issues: readonly { path: readonly PropertyKey[] }[]): ScoreErrorCode {
  return issues[0]?.path[0] === "matchId" ? "match-not-found" : "invalid-score";
}
