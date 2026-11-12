import { describe, expect, it } from "vitest";

import { buildBracketView } from "@/lib/services/bracket-view";
import type { CupMatchDTO, PlayerDTO } from "@/types";

const ann: PlayerDTO = { id: "p1", name: "Ann" };
const bob: PlayerDTO = { id: "p2", name: "Bob" };
const cid: PlayerDTO = { id: "p3", name: "Cid" };
const dan: PlayerDTO = { id: "p4", name: "Dan" };
const eve: PlayerDTO = { id: "p5", name: "Eve" };

function match(
  position: number,
  round: number,
  playerA: PlayerDTO | null,
  playerB: PlayerDTO | null,
  score: { a: number; b: number } | null = null,
): CupMatchDTO {
  return { id: `m${position}`, position, round, playerA, playerB, score, nextMatchId: null };
}

// 3 players: S = 4, one bye. Seed 1 (Ann) skips round 1; Bob v Cid play; the final is Ann v winner.
const threePlayers = (round1: { a: number; b: number } | null, final: { a: number; b: number } | null) => [
  match(1, 1, bob, cid, round1),
  match(2, 2, ann, round1 ? (round1.a > round1.b ? bob : cid) : null, final),
];

describe("buildBracketView", () => {
  it("groups matches into rounds in order", () => {
    const view = buildBracketView([match(3, 3, null, null), match(2, 2, null, null), match(1, 1, ann, bob)]);
    expect(view.rounds.map((r) => [r.round, r.matches.map((m) => m.position)])).toEqual([
      [1, [1]],
      [2, [2]],
      [3, [3]],
    ]);
  });

  it("shows an unfilled slot as no player and the match as not ready", () => {
    const view = buildBracketView(threePlayers(null, null));
    const final = view.rounds[1].matches[0];
    expect(final.b.player).toBeNull();
    expect(final.ready).toBe(false);
    expect(final.played).toBe(false);
  });

  it("marks a match ready when both slots are filled and unplayed", () => {
    const view = buildBracketView(threePlayers({ a: 2, b: 1 }, null));
    expect(view.rounds[0].matches[0]).toMatchObject({ ready: false, played: true });
    expect(view.rounds[1].matches[0]).toMatchObject({ ready: true, played: false });
  });

  it("marks the player placed in round 2 without a round-1 match as a bye", () => {
    const view = buildBracketView(threePlayers({ a: 2, b: 1 }, null));
    const final = view.rounds[1].matches[0];
    expect(final.a).toEqual({ player: ann, bye: true });
    // Bob won round 1 and advanced: he is not a bye.
    expect(final.b).toEqual({ player: bob, bye: false });
  });

  it("gives no byes when the field is a power of two", () => {
    const view = buildBracketView([match(1, 1, ann, dan), match(2, 1, bob, cid), match(3, 2, null, null)]);
    expect(view.rounds.flatMap((r) => r.matches).some((m) => m.a.bye || m.b.bye)).toBe(false);
  });

  it("marks both slots of a round-2 match as byes when both players skipped round 1", () => {
    // 5 players: seeds 1-3 have byes, Dan v Eve play round 1. Round 2: Ann v W(Dan,Eve) and Cid v Bob.
    const view = buildBracketView([
      match(1, 1, dan, eve),
      match(2, 2, ann, null),
      match(3, 2, cid, bob),
      match(4, 3, null, null),
    ]);
    expect(view.rounds[1].matches.map((m) => [m.a.bye, m.b.bye])).toEqual([
      [true, false],
      [true, true],
    ]);
    expect(view.rounds[2].matches[0]?.a.bye).toBe(false);
  });

  it("has no champion until the final has a result", () => {
    expect(buildBracketView(threePlayers({ a: 2, b: 1 }, null)).champion).toBeNull();
  });

  it("names the winner of the final as champion, whichever slot they are in", () => {
    expect(buildBracketView(threePlayers({ a: 2, b: 1 }, { a: 3, b: 0 })).champion).toEqual(ann);
    expect(buildBracketView(threePlayers({ a: 2, b: 1 }, { a: 0, b: 1 })).champion).toEqual(bob);
  });

  it("takes the final as the match with the highest position, not the last in the input", () => {
    const view = buildBracketView([
      match(3, 2, ann, bob, { a: 1, b: 0 }),
      match(1, 1, ann, cid, { a: 1, b: 0 }),
      match(2, 1, bob, dan, { a: 1, b: 0 }),
    ]);
    expect(view.champion).toEqual(ann);
  });

  it("returns no rounds and no champion for no matches", () => {
    expect(buildBracketView([])).toEqual({ rounds: [], champion: null });
  });
});
