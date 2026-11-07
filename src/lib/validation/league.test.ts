import { describe, expect, it } from "vitest";
import { createLeagueSchema, leagueNameSchema, leagueSettingsSchema } from "./league";

const valid = { name: "Friday FIFA", pointsWin: "3", pointsDraw: "1", pointsLoss: "0" };
const ORDERING = "Points must satisfy win ≥ draw ≥ loss";

function messages(result: { error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? [];
}

describe("leagueSettingsSchema", () => {
  it("accepts valid settings and coerces points to numbers", () => {
    const result = leagueSettingsSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Friday FIFA", pointsWin: 3, pointsDraw: 1, pointsLoss: 0 });
  });

  it("trims the name", () => {
    expect(leagueSettingsSchema.safeParse({ ...valid, name: "  Spaces  " }).data?.name).toBe("Spaces");
  });

  it("rejects empty and whitespace-only names", () => {
    expect(messages(leagueSettingsSchema.safeParse({ ...valid, name: "" }))).toContain("League name is required");
    expect(messages(leagueSettingsSchema.safeParse({ ...valid, name: "   " }))).toContain("League name is required");
  });

  it("rejects an 81-char name and accepts 80", () => {
    expect(messages(leagueSettingsSchema.safeParse({ ...valid, name: "a".repeat(81) }))).toContain(
      "League name must be at most 80 characters",
    );
    expect(leagueSettingsSchema.safeParse({ ...valid, name: "a".repeat(80) }).success).toBe(true);
  });

  it("treats an empty points field as Required, not 0", () => {
    expect(messages(leagueSettingsSchema.safeParse({ ...valid, pointsDraw: "" }))).toContain("Required");
  });

  it("treats a whitespace-only points field as Required, not 0", () => {
    // Number("  ") is 0 too, so without trimming a blank-looking field would be stored as 0 points.
    expect(messages(leagueSettingsSchema.safeParse({ ...valid, pointsLoss: "  " }))).toContain("Required");
  });

  it.each([
    ["a draw worth as much as a win", { pointsWin: "3", pointsDraw: "3", pointsLoss: "0" }],
    ["a loss worth as much as a draw", { pointsWin: "3", pointsDraw: "1", pointsLoss: "1" }],
    ["every result worth the same", { pointsWin: "1", pointsDraw: "1", pointsLoss: "1" }],
  ])("accepts %s (the rule is win ≥ draw ≥ loss, not strict)", (_label, points) => {
    expect(leagueSettingsSchema.safeParse({ ...valid, ...points }).success).toBe(true);
  });

  it("rejects points above 99 and negative points", () => {
    expect(leagueSettingsSchema.safeParse({ ...valid, pointsWin: "100" }).success).toBe(false);
    expect(leagueSettingsSchema.safeParse({ ...valid, pointsLoss: "-1" }).success).toBe(false);
  });

  it("rejects draw > win with the ordering message on pointsWin", () => {
    const result = leagueSettingsSchema.safeParse({ ...valid, pointsWin: "1", pointsDraw: "2" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.message === ORDERING)?.path).toEqual(["pointsWin"]);
  });

  it("rejects loss > draw with the ordering message", () => {
    expect(messages(leagueSettingsSchema.safeParse({ ...valid, pointsDraw: "0", pointsLoss: "1" }))).toContain(
      ORDERING,
    );
  });
});

describe("leagueNameSchema", () => {
  it("validates the name only", () => {
    expect(leagueNameSchema.safeParse({ name: "Ok" }).success).toBe(true);
    expect(leagueNameSchema.safeParse({ name: " " }).success).toBe(false);
  });
});

describe("createLeagueSchema", () => {
  it("accepts valid input", () => {
    expect(createLeagueSchema.safeParse({ ...valid, players: ["A", "B", "C"] }).success).toBe(true);
  });

  it("rejects fewer than 3 players", () => {
    expect(messages(createLeagueSchema.safeParse({ ...valid, players: ["A", "B"] }))).toContain(
      "Add at least 3 players",
    );
  });

  it("rejects duplicate players case-insensitively", () => {
    expect(messages(createLeagueSchema.safeParse({ ...valid, players: ["Ann", "ann", "Bob"] }))).toContain(
      "Duplicate player name: ann",
    );
  });

  it("accepts realistic player names and stores them without surrounding spaces", () => {
    const result = createLeagueSchema.parse({ ...valid, players: ["  Anna ", "Bartek", "Zoë Kowalska-Nowak"] });
    expect(result.players).toEqual(["Anna", "Bartek", "Zoë Kowalska-Nowak"]);
  });

  it.each([
    ["an empty player name", ""],
    ["a whitespace-only player name", "   "],
  ])("tells the organizer %s is required", (_label, name) => {
    expect(messages(createLeagueSchema.safeParse({ ...valid, players: ["Anna", "Bartek", name] }))).toContain(
      "Player name is required",
    );
  });

  it("accepts a 40-character player name and refuses 41 with a readable message", () => {
    const players = (last: string) => ({ ...valid, players: ["Anna", "Bartek", last] });
    expect(createLeagueSchema.safeParse(players("x".repeat(40))).success).toBe(true);
    expect(messages(createLeagueSchema.safeParse(players("x".repeat(41))))).toContain(
      "Player name must be at most 40 characters",
    );
  });

  it("accepts 20 players and refuses 21 with a readable message", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `Player ${i + 1}`);
    expect(createLeagueSchema.safeParse({ ...valid, players: names(20) }).success).toBe(true);
    expect(messages(createLeagueSchema.safeParse({ ...valid, players: names(21) }))).toContain(
      "Add at most 20 players",
    );
  });

  it("treats names that differ only by surrounding spaces and case as duplicates", () => {
    expect(createLeagueSchema.safeParse({ ...valid, players: [" Ann", "ann ", "Bob"] }).success).toBe(false);
  });

  it("still applies the points ordering rule", () => {
    expect(
      messages(createLeagueSchema.safeParse({ ...valid, pointsWin: "0", pointsDraw: "1", players: ["A", "B", "C"] })),
    ).toContain(ORDERING);
  });
});
