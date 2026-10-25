import { describe, expect, it } from "vitest";

import type { Json } from "@/db/database.types";
import {
  filterFixturesByPlayer,
  playedMatchIds,
  resolvePlayerFilter,
  toSharedLeague,
  isValidShareToken,
} from "@/lib/services/shared-league";
import type { FixtureDTO, PlayerDTO } from "@/types";

const ann: PlayerDTO = { id: "p1", name: "Ann" };
const bob: PlayerDTO = { id: "p2", name: "Bob" };
const cid: PlayerDTO = { id: "p3", name: "Cid" };
const dan: PlayerDTO = { id: "p4", name: "Dan" };
const players = [ann, bob, cid, dan];

const fixtures: FixtureDTO[] = [
  { id: "m1", position: 1, playerA: ann, playerB: bob, score: null },
  { id: "m2", position: 2, playerA: cid, playerB: ann, score: null },
  { id: "m3", position: 3, playerA: bob, playerB: cid, score: null },
];

describe("filterFixturesByPlayer", () => {
  it("includes matches where the player is playerA or playerB", () => {
    expect(filterFixturesByPlayer(fixtures, "p1").map((f) => f.id)).toEqual(["m1", "m2"]);
  });

  it("returns an empty list when the player has no fixtures", () => {
    expect(filterFixturesByPlayer(fixtures, "p4")).toEqual([]);
  });

  it("returns all fixtures for a null player", () => {
    expect(filterFixturesByPlayer(fixtures, null)).toEqual(fixtures);
  });

  it("excludes played match ids", () => {
    expect(filterFixturesByPlayer(fixtures, "p1", new Set(["m1"])).map((f) => f.id)).toEqual(["m2"]);
    expect(filterFixturesByPlayer(fixtures, null, new Set(["m2"])).map((f) => f.id)).toEqual(["m1", "m3"]);
  });

  it("hides played matches derived from fixture scores", () => {
    const withScore = fixtures.map((f) => (f.id === "m1" ? { ...f, score: { a: 2, b: 1 } } : f));
    expect(filterFixturesByPlayer(withScore, "p1", playedMatchIds(withScore)).map((f) => f.id)).toEqual(["m2"]);
  });

  it("preserves the original order", () => {
    const shuffledPositions = [fixtures[2], fixtures[0], fixtures[1]];
    expect(filterFixturesByPlayer(shuffledPositions, "p2").map((f) => f.id)).toEqual(["m3", "m1"]);
  });
});

describe("playedMatchIds", () => {
  it("collects only the ids of fixtures with a score", () => {
    const mixed: FixtureDTO[] = [
      { ...fixtures[0], score: { a: 0, b: 0 } },
      fixtures[1],
      { ...fixtures[2], score: { a: 3, b: 1 } },
    ];
    expect(playedMatchIds(mixed)).toEqual(new Set(["m1", "m3"]));
  });

  it("is empty when nothing is played", () => {
    expect(playedMatchIds(fixtures).size).toBe(0);
  });
});

describe("resolvePlayerFilter", () => {
  it("returns the id of a player in the league", () => {
    expect(resolvePlayerFilter(players, "p2")).toBe("p2");
  });

  it("treats an unknown player id as no filter, so all fixtures are returned", () => {
    const resolved = resolvePlayerFilter(players, "nope");
    expect(resolved).toBeNull();
    expect(filterFixturesByPlayer(fixtures, resolved)).toEqual(fixtures);
  });

  it.each([null, undefined, ""])("treats %j as no filter", (raw) => {
    expect(resolvePlayerFilter(players, raw)).toBeNull();
  });
});

describe("toSharedLeague", () => {
  const payload: Json = {
    league: { name: "Cup", points_win: 3, points_draw: 1, points_loss: 0 },
    players: [
      { id: "p1", name: "Ann" },
      { id: "p2", name: "Bob" },
    ],
    matches: [
      { id: "m1", position: 1, player_a_id: "p1", player_b_id: "p2", score_a: null, score_b: null },
      { id: "m2", position: 2, player_a_id: "p1", player_b_id: "ghost", score_a: null, score_b: null },
    ],
  };

  it("maps a valid payload and drops matches with missing players", () => {
    expect(toSharedLeague(payload)).toEqual({
      league: { name: "Cup", points_win: 3, points_draw: 1, points_loss: 0 },
      players: [ann, bob],
      fixtures: [{ id: "m1", position: 1, playerA: ann, playerB: bob, score: null }],
    });
  });

  it("reads scores for played fixtures and null for unplayed ones", () => {
    const result = toSharedLeague({
      league: { name: "Cup", points_win: 3, points_draw: 1, points_loss: 0 },
      players: [
        { id: "p1", name: "Ann" },
        { id: "p2", name: "Bob" },
      ],
      matches: [
        { id: "m1", position: 1, player_a_id: "p1", player_b_id: "p2", score_a: 2, score_b: 0 },
        { id: "m2", position: 2, player_a_id: "p2", player_b_id: "p1", score_a: null, score_b: null },
      ],
    });
    expect(result?.fixtures.map((f) => f.score)).toEqual([{ a: 2, b: 0 }, null]);
  });

  it.each<[string, Record<string, Json>]>([
    ["only score_a set", { score_a: 1, score_b: null }],
    ["only score_b set", { score_a: null, score_b: 1 }],
    ["a non-numeric score", { score_a: "1", score_b: "2" }],
    ["missing score keys", {}],
  ])("returns null when scores are inconsistent (%s)", (_label, scores) => {
    expect(
      toSharedLeague({
        league: { name: "Cup", points_win: 3, points_draw: 1, points_loss: 0 },
        players: [
          { id: "p1", name: "Ann" },
          { id: "p2", name: "Bob" },
        ],
        matches: [{ id: "m1", position: 1, player_a_id: "p1", player_b_id: "p2", ...scores }],
      }),
    ).toBeNull();
  });

  it("returns null for a null payload", () => {
    expect(toSharedLeague(null)).toBeNull();
  });

  it.each<[string, Json]>([
    ["a non-object", "oops"],
    ["an array", []],
    ["missing league", { players: [], matches: [] }],
    [
      "bad points",
      { league: { name: "Cup", points_win: "3", points_draw: 1, points_loss: 0 }, players: [], matches: [] },
    ],
    [
      "players not an array",
      { league: { name: "Cup", points_win: 3, points_draw: 1, points_loss: 0 }, players: {}, matches: [] },
    ],
    [
      "malformed player",
      { league: { name: "Cup", points_win: 3, points_draw: 1, points_loss: 0 }, players: [{ id: 1 }], matches: [] },
    ],
    [
      "malformed match",
      { league: { name: "Cup", points_win: 3, points_draw: 1, points_loss: 0 }, players: [], matches: [{ id: "m1" }] },
    ],
  ])("returns null for a malformed payload (%s)", (_label, bad) => {
    expect(toSharedLeague(bad)).toBeNull();
  });
});

describe("isValidShareToken", () => {
  it("accepts 64 lowercase hex chars only", () => {
    expect(isValidShareToken("a".repeat(64))).toBe(true);
    expect(isValidShareToken("A".repeat(64))).toBe(false);
    expect(isValidShareToken("a".repeat(63))).toBe(false);
    expect(isValidShareToken("g".repeat(64))).toBe(false);
    expect(isValidShareToken(undefined)).toBe(false);
  });
});
