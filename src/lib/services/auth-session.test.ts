import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
  type User,
} from "@supabase/supabase-js";

import { classifyAuthResult, isProtectedPath, isUserCausedAuthError } from "@/lib/services/auth-session";

describe("isUserCausedAuthError", () => {
  it.each([
    ["wrong password", new AuthApiError("Invalid login credentials", 400, "invalid_credentials")],
    ["weak password", new AuthWeakPasswordError("Password too weak", 422, ["length"])],
    ["rate limit", new AuthApiError("Too many requests", 429, "over_request_rate_limit")],
  ])("treats %s as the user's doing (not logged)", (_label, error) => {
    expect(isUserCausedAuthError(error)).toBe(true);
  });

  it.each([
    ["network failure", new AuthRetryableFetchError("fetch failed", 0)],
    ["Auth 503", new AuthRetryableFetchError("Service Unavailable", 503)],
    // auth-js turns Auth 5xx into AuthRetryableFetchError; this case pins the >= 500 boundary of the guard itself.
    ["Auth 500 API error", new AuthApiError("Database error saving new user", 500, "unexpected_failure")],
    ["non-Auth error", new Error("boom")],
  ])("treats %s as a server-side failure (logged)", (_label, error) => {
    expect(isUserCausedAuthError(error)).toBe(false);
  });
});

const user = { id: "00000000-0000-0000-0000-000000000001" } as User;

describe("classifyAuthResult", () => {
  it("returns the user when getUser found one", () => {
    expect(classifyAuthResult(user, null)).toEqual({ kind: "user", user });
  });

  it("treats no session as an ordinary anonymous visitor", () => {
    expect(classifyAuthResult(null, new AuthSessionMissingError())).toEqual({ kind: "anonymous" });
    expect(classifyAuthResult(null, null)).toEqual({ kind: "anonymous" });
  });

  // Regression for audit finding P1: an Auth outage used to look exactly like "not signed in".
  it.each([
    ["network failure", new AuthRetryableFetchError("fetch failed", 0)],
    ["Auth 503", new AuthRetryableFetchError("Service Unavailable", 503)],
  ])("reports %s as Auth being unavailable, not as a signed-out user", (_label, error) => {
    expect(classifyAuthResult(null, error)).toEqual({ kind: "auth-unavailable", error });
  });

  it("reports a rejected session token as rejected", () => {
    const error = new AuthApiError("invalid JWT", 401, "bad_jwt");
    expect(classifyAuthResult(null, error)).toEqual({ kind: "auth-rejected", error });
  });
});

describe("isProtectedPath", () => {
  it.each(["/dashboard", "/leagues", "/leagues/abc", "/leagues/new", "/api/leagues", "/api/leagues/abc/delete"])(
    "protects %s",
    (path) => {
      expect(isProtectedPath(path)).toBe(true);
    },
  );

  it.each(["/", "/t/abc", "/auth/signin", "/api/scores", "/api/auth/signin"])("leaves %s public", (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});
