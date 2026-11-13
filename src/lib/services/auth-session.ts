import { isAuthError, isAuthRetryableFetchError, isAuthSessionMissingError, type User } from "@supabase/supabase-js";

const PROTECTED_ROUTES = ["/dashboard", "/leagues", "/api/leagues"];

/** Routes that require a signed-in organizer. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * What `supabase.auth.getUser()` actually told us. auth-js *returns* its errors, network failures included,
 * so "no user" alone cannot tell a signed-out visitor from an Auth outage.
 */
export type AuthOutcome =
  | { kind: "user"; user: User }
  | { kind: "anonymous" }
  | { kind: "auth-unavailable"; error: unknown }
  | { kind: "auth-rejected"; error: unknown };

export function classifyAuthResult(user: User | null, error: unknown): AuthOutcome {
  if (user) return { kind: "user", user };
  if (!error || isAuthSessionMissingError(error)) return { kind: "anonymous" };
  // Network failure or an Auth 5xx/52x: the user may well be signed in, we just cannot tell right now.
  if (isAuthRetryableFetchError(error)) return { kind: "auth-unavailable", error };
  return { kind: "auth-rejected", error };
}

/**
 * A sign-in/sign-up error that is the user's own doing (wrong password, weak password, existing account):
 * an Auth error with a 4xx status. Network failures (status 0), Auth 5xx and non-Auth errors are not.
 */
export function isUserCausedAuthError(error: unknown): boolean {
  return isAuthError(error) && typeof error.status === "number" && error.status >= 400 && error.status < 500;
}
