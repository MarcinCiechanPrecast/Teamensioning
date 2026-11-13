import { describe, expect, it } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, type User } from "@supabase/supabase-js";

import { classifyAuthResult, isProtectedPath } from "@/lib/services/auth-session";

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
