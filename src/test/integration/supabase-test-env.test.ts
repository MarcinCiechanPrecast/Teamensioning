import { describe, expect, it } from "vitest";
import { assertLocalSupabaseUrl } from "./supabase-test-env";

describe("assertLocalSupabaseUrl", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://127.0.0.1:54321/"])(
    "accepts local %s",
    (url) => {
      expect(assertLocalSupabaseUrl(url)).toBe(url);
    },
  );

  it.each([
    ["a hosted project", "https://eortunvxkvspuuousnff.supabase.co"],
    ["a lookalike host", "http://127.0.0.1.evil.example:54321"],
    ["a lookalike subdomain", "http://localhost.evil.example"],
    ["credentials pointing elsewhere", "http://localhost@evil.example"],
    ["an empty string", ""],
    ["text that is not a URL", "127.0.0.1:54321"],
  ])("rejects %s", (_label, url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow(/local/i);
  });

  it("rejects a missing URL", () => {
    expect(() => assertLocalSupabaseUrl(undefined)).toThrow(/local/i);
  });
});
