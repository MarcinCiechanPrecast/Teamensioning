import { describe, expect, it } from "vitest";

import { computeStandings } from "@/lib/services/standings";
import type { FixtureDTO, PlayerDTO, SharedLeagueDTO } from "@/types";

const ann: PlayerDTO = { id: "p1", name: "Ann" };
const bob: PlayerDTO = { id: "p2", name: "Bob" };
const cid: PlayerDTO = { id: "p3", name: "Cid" };
const dan: PlayerDTO = { id: "p4", name: "Dan" };

const std = { name: "L", points_win: 3, points_draw: 1, points_loss: 0 };

function match(id: string, a: PlayerDTO, b: PlayerDTO, score: [number, number] | null): FixtureDTO {
  return { id, position: 1, playerA: a, playerB: b, score: score ? { a: score[0], b: score[1] } : null };
}

function league(
  players: PlayerDTO[],
  fixtures: FixtureDTO[],
  settings: SharedLeagueDTO["league"] = std,
): Pick<SharedLeagueDTO, "league" | "players" | "fixtures"> {
  return { league: settings, players, fixtures };
}

describe("computeStandings", () => {
  it("lists every player with zeros, rank 1 and alphabetical order when nothing is played", () => {
    const result = computeStandings(league([cid, ann, bob], [match("m1", cid, ann, null)]));
    expect(result.map((r) => r.player.name)).toEqual(["Ann", "Bob", "Cid"]);
    expect(result.every((r) => r.rank === 1 && r.played === 0 && r.points === 0)).toBe(true);
  });

  it("ignores unplayed matches for played and points", () => {
    const result = computeStandings(
      league([ann, bob, cid], [match("m1", ann, bob, [1, 0]), match("m2", ann, cid, null)]),
    );
    expect(result.find((r) => r.player.id === "p1")).toMatchObject({ played: 1, won: 1, points: 3 });
    expect(result.find((r) => r.player.id === "p3")?.played).toBe(0);
  });

  it("awards points from the tournament settings, including a non-zero loss value", () => {
    const result = computeStandings(
      league([ann, bob, cid], [match("m1", ann, bob, [2, 0]), match("m2", bob, cid, [1, 1])], {
        name: "L",
        points_win: 2,
        points_draw: 1,
        points_loss: 1,
      }),
    );
    const byId = Object.fromEntries(result.map((r) => [r.player.id, r.points]));
    expect(byId).toEqual({ p1: 2, p2: 2, p3: 1 });
  });

  it("counts a draw as drawn for both sides", () => {
    const result = computeStandings(league([ann, bob], [match("m1", ann, bob, [2, 2])]));
    expect(result.map((r) => [r.won, r.drawn, r.lost, r.points])).toEqual([
      [0, 1, 0, 1],
      [0, 1, 0, 1],
    ]);
  });

  it("tracks goals for, against and goal difference", () => {
    const result = computeStandings(league([ann, bob], [match("m1", ann, bob, [3, 1])]));
    expect(result[0]).toMatchObject({ goalsFor: 3, goalsAgainst: 1, goalDifference: 2 });
    expect(result[1]).toMatchObject({ goalsFor: 1, goalsAgainst: 3, goalDifference: -2, lost: 1 });
  });

  it("orders by points first", () => {
    const result = computeStandings(
      league([ann, bob, cid], [match("m1", bob, ann, [1, 0]), match("m2", cid, ann, [9, 0])]),
    );
    // Cid and Bob both have 3 points; Cid's goal difference (+9) beats Bob's (+1); Ann has none.
    expect(result.map((r) => r.player.name)).toEqual(["Cid", "Bob", "Ann"]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("breaks a points tie by goal difference, then by goals for", () => {
    // Ann and Bob both win once (3 pts). Ann +3, Bob +1 -> Ann first.
    const byDiff = computeStandings(
      league([ann, bob, cid, dan], [match("m1", ann, cid, [3, 0]), match("m2", bob, dan, [2, 1])]),
    );
    expect(byDiff.slice(0, 2).map((r) => r.player.name)).toEqual(["Ann", "Bob"]);

    // Same points and goal difference (+1); Bob scored more goals.
    const byGoals = computeStandings(
      league([ann, bob, cid, dan], [match("m1", ann, cid, [1, 0]), match("m2", bob, dan, [3, 2])]),
    );
    expect(byGoals.slice(0, 2).map((r) => r.player.name)).toEqual(["Bob", "Ann"]);
    expect(byGoals.slice(0, 2).map((r) => r.rank)).toEqual([1, 2]);
  });

  it("gives players level on points, goal difference and goals for a shared rank and skips the next", () => {
    const result = computeStandings(
      league([bob, ann, cid, dan], [match("m1", ann, cid, [1, 0]), match("m2", bob, dan, [1, 0])]),
    );
    expect(result.map((r) => [r.player.name, r.rank])).toEqual([
      ["Ann", 1],
      ["Bob", 1],
      ["Cid", 3],
      ["Dan", 3],
    ]);
  });
});
