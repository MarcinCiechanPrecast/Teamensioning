import { describe, expect, it } from "vitest";

import {
  SCORE_ERROR_MESSAGES,
  isScoreErrorCode,
  rpcErrorCode,
  toScoreOutcome,
  validationErrorCode,
} from "@/lib/services/score-submission";

describe("toScoreOutcome", () => {
  it("maps each RPC status", () => {
    expect(toScoreOutcome({ status: "created" })).toEqual({ kind: "created" });
    expect(toScoreOutcome({ status: "already_entered" })).toEqual({ kind: "already-entered" });
    expect(toScoreOutcome({ status: "not_found" })).toEqual({ kind: "error", code: "match-not-found" });
  });

  it.each([
    ["null", null],
    ["a string", "created"],
    ["an array", ["created"]],
    ["no status", {}],
    ["a non-string status", { status: 1 }],
    ["an unknown status", { status: "weird" }],
  ])("treats %s as a server error", (_label, payload) => {
    expect(toScoreOutcome(payload)).toEqual({ kind: "error", code: "server" });
  });
});

describe("rpcErrorCode", () => {
  it("maps a check violation to invalid-score", () => {
    expect(rpcErrorCode({ code: "23514" })).toBe("invalid-score");
  });

  it("maps any other database error to server, without exposing its text", () => {
    expect(rpcErrorCode({ code: "23503" })).toBe("server");
    expect(rpcErrorCode({})).toBe("server");
  });
});

describe("validationErrorCode", () => {
  it("reports a bad match id as match-not-found", () => {
    expect(validationErrorCode([{ path: ["matchId"] }])).toBe("match-not-found");
  });

  it("reports a bad score or token as invalid-score", () => {
    expect(validationErrorCode([{ path: ["scoreA"] }])).toBe("invalid-score");
    expect(validationErrorCode([])).toBe("invalid-score");
  });
});

describe("isScoreErrorCode", () => {
  it("accepts only known codes", () => {
    for (const code of Object.keys(SCORE_ERROR_MESSAGES)) expect(isScoreErrorCode(code)).toBe(true);
    expect(isScoreErrorCode("Session expired, sign in at evil.example")).toBe(false);
    expect(isScoreErrorCode("toString")).toBe(false);
    expect(isScoreErrorCode(null)).toBe(false);
  });
});
