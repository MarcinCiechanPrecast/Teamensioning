import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRetryableFetchError } from "@supabase/supabase-js";

import { errorFields, hashToken, logServerEvent } from "@/lib/observability";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logServerEvent", () => {
  it("writes one object per call at the requested level", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logServerEvent("error", "leagues.create", { code: "42501" });
    logServerEvent("warn", "auth.getUser");

    expect(error).toHaveBeenCalledExactlyOnceWith({ level: "error", op: "leagues.create", code: "42501" });
    expect(warn).toHaveBeenCalledExactlyOnceWith({ level: "warn", op: "auth.getUser" });
  });
});

describe("errorFields", () => {
  it("keeps the PostgREST diagnosis and drops empty values", () => {
    const postgrestError = {
      name: "PostgrestError",
      message: "permission denied",
      code: "42501",
      details: "",
      hint: "",
    };
    expect(errorFields(postgrestError)).toEqual({
      name: "PostgrestError",
      message: "permission denied",
      code: "42501",
    });
  });

  it("keeps the HTTP status of an Auth error", () => {
    const fields = errorFields(new AuthRetryableFetchError("Service Unavailable", 503));
    expect(fields).toMatchObject({ name: "AuthRetryableFetchError", message: "Service Unavailable", status: 503 });
    expect(fields.stack).toContain("AuthRetryableFetchError");
  });

  it("handles non-objects", () => {
    expect(errorFields(null)).toEqual({});
    expect(errorFields(undefined)).toEqual({});
    expect(errorFields("boom")).toEqual({ message: "boom" });
  });
});

describe("hashToken", () => {
  it("is a stable 8-hex prefix that does not contain the token", async () => {
    const token = "a".repeat(32);
    const hash = await hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(await hashToken(token)).toBe(hash);
    expect(await hashToken("b".repeat(32))).not.toBe(hash);
    // SHA-256("abc") starts with ba7816bf: pins the algorithm, not just the shape.
    expect(await hashToken("abc")).toBe("ba7816bf");
  });
});
