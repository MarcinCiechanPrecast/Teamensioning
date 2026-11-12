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

  it("maps the cup refusal after the next round was played to next-round-played", () => {
    const expected = { kind: "error", code: "next-round-played" };
    expect(toCorrectionOutcome({ error: { code: "55000", message: "cup_next_round_played" }, rowCount: 0 })).toEqual(
      expected,
    );
    expect(toCorrectionOutcome({ error: { message: "cup_next_round_played" }, rowCount: 0 })).toEqual(expected);
    expect(toCorrectionOutcome({ error: { code: "55000" }, rowCount: 0 })).toEqual(expected);
  });

  it("maps a cup draw to draw-not-allowed but a range violation stays invalid-score", () => {
    expect(
      toCorrectionOutcome({
        error: { code: "23514", message: "a cup match cannot end in a draw" },
        rowCount: 0,
      }),
    ).toEqual({ kind: "error", code: "draw-not-allowed" });
    expect(
      toCorrectionOutcome({
        error: {
          code: "23514",
          message: 'new row for relation "results" violates check constraint "results_score_a_check"',
        },
        rowCount: 0,
      }),
    ).toEqual({ kind: "error", code: "invalid-score" });
  });

  it("has fixed messages for the cup refusals", () => {
    expect(CORRECTION_ERROR_MESSAGES["next-round-played"]).toContain("next round");
    expect(CORRECTION_ERROR_MESSAGES["draw-not-allowed"]).toContain("draw");
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
