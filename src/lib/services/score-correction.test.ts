import { describe, expect, it } from "vitest";

import { CORRECTION_ERROR_MESSAGES, isCorrectionErrorCode, toCorrectionOutcome } from "@/lib/services/score-correction";

describe("toCorrectionOutcome", () => {
  it("maps one updated row to updated", () => {
    expect(toCorrectionOutcome({ error: null, rowCount: 1 })).toEqual({ kind: "updated" });
  });

  it("maps 0 rows to match-not-found", () => {
    expect(toCorrectionOutcome({ error: null, rowCount: 0 })).toEqual({ kind: "error", code: "match-not-found" });
  });

  it("maps a match outside the URL's tournament to match-not-found even with a row count", () => {
    expect(toCorrectionOutcome({ error: null, rowCount: 1, inTournament: false })).toEqual({
      kind: "error",
      code: "match-not-found",
    });
    expect(toCorrectionOutcome({ error: null, rowCount: 1, inTournament: true })).toEqual({ kind: "updated" });
  });

  it("maps a check violation to invalid-score", () => {
    expect(toCorrectionOutcome({ error: { code: "23514" }, rowCount: 0 })).toEqual({
      kind: "error",
      code: "invalid-score",
    });
  });

  it("maps a malformed uuid to match-not-found", () => {
    expect(toCorrectionOutcome({ error: { code: "22P02" }, rowCount: 0 })).toEqual({
      kind: "error",
      code: "match-not-found",
    });
  });

  it("maps any other error to server", () => {
    expect(toCorrectionOutcome({ error: { code: "XX000" }, rowCount: 0 })).toEqual({ kind: "error", code: "server" });
    expect(toCorrectionOutcome({ error: {}, rowCount: 0 })).toEqual({ kind: "error", code: "server" });
  });
});

describe("isCorrectionErrorCode", () => {
  it.each(Object.keys(CORRECTION_ERROR_MESSAGES))("accepts %s", (code) => {
    expect(isCorrectionErrorCode(code)).toBe(true);
  });

  it.each([null, undefined, "", "nope", "__proto__", "toString", "constructor"])("rejects %s", (value) => {
    expect(isCorrectionErrorCode(value)).toBe(false);
  });
});
