import { describe, expect, it } from "vitest";

import { submitScoreSchema } from "@/lib/validation/score";

const token = "a".repeat(64);
const matchId = "123e4567-e89b-42d3-a456-426614174000";

const valid = { token, matchId, scoreA: "2", scoreB: "1" };

describe("submitScoreSchema", () => {
  it("parses valid input into numbers", () => {
    expect(submitScoreSchema.parse(valid)).toEqual({ token, matchId, scoreA: 2, scoreB: 1 });
  });

  it("accepts the boundaries 0 and 99", () => {
    expect(submitScoreSchema.parse({ ...valid, scoreA: "0", scoreB: "99" })).toMatchObject({ scoreA: 0, scoreB: 99 });
  });

  it("trims surrounding whitespace", () => {
    expect(submitScoreSchema.parse({ ...valid, scoreA: " 3 " })).toMatchObject({ scoreA: 3 });
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["negative", "-1"],
    ["over the maximum", "100"],
    ["non-integer", "1.5"],
    ["not a number", "abc"],
    ["exponent notation", "1e1"],
    ["hex notation", "0x10"],
    ["explicit plus sign", "+5"],
  ])("rejects a %s score", (_label, value) => {
    expect(submitScoreSchema.safeParse({ ...valid, scoreA: value }).success).toBe(false);
    expect(submitScoreSchema.safeParse({ ...valid, scoreB: value }).success).toBe(false);
  });

  it("gives a readable message for an empty score", () => {
    const result = submitScoreSchema.safeParse({ ...valid, scoreA: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Score is required");
  });

  it.each(["", "abc", "A".repeat(64), "a".repeat(63)])("rejects a malformed token (%j)", (bad) => {
    expect(submitScoreSchema.safeParse({ ...valid, token: bad }).success).toBe(false);
  });

  it.each(["", "m1", "not-a-uuid"])("rejects a non-uuid match id (%j)", (bad) => {
    expect(submitScoreSchema.safeParse({ ...valid, matchId: bad }).success).toBe(false);
  });
});
