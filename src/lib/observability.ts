/**
 * The one place that writes server logs. Each call writes a single JSON-serialisable object, so Workers Logs
 * can index its fields. Never pass an email, a password or a raw share token: use `user.id` and `hashToken()`.
 */
export type LogLevel = "error" | "warn";

export function logServerEvent(level: LogLevel, op: string, fields: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console -- the app's single logging sink (Workers Logs collects console output)
  console[level]({ level, op, ...fields });
}

export interface ErrorFields {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  stack?: string;
}

const STRING_KEYS = ["name", "message", "code", "details", "hint", "stack"] as const;

/** Pulls the diagnostic fields out of a PostgrestError, an AuthError or any Error; skips empty values. */
export function errorFields(error: unknown): ErrorFields {
  if (error === undefined || error === null) return {};
  if (typeof error !== "object") {
    return typeof error === "string" ? { message: error } : { message: JSON.stringify(error) };
  }
  const source = error as Record<string, unknown>;
  const fields: ErrorFields = {};
  for (const key of STRING_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value !== "") fields[key] = value;
  }
  if (typeof source.status === "number") fields.status = source.status;
  return fields;
}

/** First 8 hex chars of the token's SHA-256: groups log lines by league without leaking the share secret. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest).slice(0, 4), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
