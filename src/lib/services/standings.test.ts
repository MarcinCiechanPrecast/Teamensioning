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

  // Phase 2 edge cases (test-plan risk #3). Every expectation is worked out by hand from PRD FR-008:
  // points first, then goal difference, then goals scored; an unplayed match gives nothing.

  it("ranks on points before goal difference, even when the goal difference is far worse", () => {
    // Ann-Bob 1-0, Ann-Cid 0-5, Bob-Cid 0-0.
    // Cid: D + W = 4 pts, GD +5. Ann: W + L = 3 pts, GD 1-5 = -4. Bob: L + D = 1 pt, GD 0-1 = -1.
    const result = computeStandings(
      league(
        [ann, bob, cid],
        [match("m1", ann, bob, [1, 0]), match("m2", ann, cid, [0, 5]), match("m3", bob, cid, [0, 0])],
      ),
    );
    expect(result.map((r) => [r.player.name, r.rank, r.points, r.goalDifference])).toEqual([
      ["Cid", 1, 4, 5],
      ["Ann", 2, 3, -4],
      ["Bob", 3, 1, -1],
    ]);
  });

  it("shares a rank in the middle of the table and skips the next one (1, 2, 2, 4)", () => {
    // Ann-Dan 3-0, Bob-Dan 1-0, Cid-Dan 1-0.
    // Ann 3 pts GD +3; Bob and Cid 3 pts GD +1 GF 1 (level on all three); Dan 0 pts GD -5.
    const result = computeStandings(
      league(
        [ann, bob, cid, dan],
        [match("m1", ann, dan, [3, 0]), match("m2", bob, dan, [1, 0]), match("m3", cid, dan, [1, 0])],
      ),
    );
    expect(result.map((r) => [r.player.name, r.rank])).toEqual([
      ["Ann", 1],
      ["Bob", 2],
      ["Cid", 2],
      ["Dan", 4],
    ]);
  });

  it("ranks a player with no games above players level on points with a negative goal difference", () => {
    // Ann-Bob 1-0, Ann-Cid 3-0; Dan has not played.
    // Ann 6 pts. Then all on 0 pts: Dan GD 0, Bob GD -1, Cid GD -3.
    const result = computeStandings(
      league([ann, bob, cid, dan], [match("m1", ann, bob, [1, 0]), match("m2", ann, cid, [3, 0])]),
    );
    expect(result.map((r) => [r.player.name, r.rank, r.played, r.points, r.goalDifference])).toEqual([
      ["Ann", 1, 2, 6, 4],
      ["Dan", 2, 0, 0, 0],
      ["Bob", 3, 1, 0, -1],
      ["Cid", 4, 1, 0, -3],
    ]);
  });

  it("breaks ties on goals scored among losers too, not only among winners", () => {
    // Ann-Cid 3-2, Dan-Bob 1-0.
    // Winners on 3 pts GD +1: Ann GF 3 ahead of Dan GF 1. Losers on 0 pts GD -1: Cid GF 2 ahead of Bob GF 0.
    // Cid beating Bob goes against alphabetical order, so a missing GF tiebreak shows up in the order too.
    const result = computeStandings(
      league([ann, bob, cid, dan], [match("m1", ann, cid, [3, 2]), match("m2", dan, bob, [1, 0])]),
    );
    expect(result.map((r) => [r.player.name, r.rank, r.goalsFor])).toEqual([
      ["Ann", 1, 3],
      ["Dan", 2, 1],
      ["Cid", 3, 2],
      ["Bob", 4, 0],
    ]);
  });

  it("handles settings where a draw is worth as much as a win (1/1/0)", () => {
    // Ann-Bob 2-0, Cid-Dan 1-1.
    // Ann 1 pt GD +2; Cid and Dan 1 pt GD 0 GF 1 (shared rank 2); Bob 0 pts.
    const result = computeStandings(
      league([ann, bob, cid, dan], [match("m1", ann, bob, [2, 0]), match("m2", cid, dan, [1, 1])], {
        name: "L",
        points_win: 1,
        points_draw: 1,
        points_loss: 0,
      }),
    );
    expect(result.map((r) => [r.player.name, r.rank, r.won, r.drawn, r.lost, r.points])).toEqual([
      ["Ann", 1, 1, 0, 0, 1],
      ["Cid", 2, 0, 1, 0, 1],
      ["Dan", 2, 0, 1, 0, 1],
      ["Bob", 4, 0, 0, 1, 0],
    ]);
  });

  it("orders purely by goal difference, then goals scored, when every result is worth 0 points (0/0/0)", () => {
    // Ann-Bob 2-0, Cid-Dan 1-1, Dan-Bob 3-2.
    // All 0 pts. Ann GD +2. Dan: 1-1 and 3-2 -> GF 4 GA 3 GD +1. Cid GD 0. Bob: 0-2 and 2-3 -> GD -3.
    const result = computeStandings(
      league(
        [ann, bob, cid, dan],
        [match("m1", ann, bob, [2, 0]), match("m2", cid, dan, [1, 1]), match("m3", dan, bob, [3, 2])],
        { name: "L", points_win: 0, points_draw: 0, points_loss: 0 },
      ),
    );
    expect(result.map((r) => [r.player.name, r.rank, r.points, r.goalDifference])).toEqual([
      ["Ann", 1, 0, 2],
      ["Dan", 2, 0, 1],
      ["Cid", 3, 0, 0],
      ["Bob", 4, 0, -3],
    ]);
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
