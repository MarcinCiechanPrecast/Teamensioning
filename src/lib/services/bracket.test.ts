import { describe, expect, it } from "vitest";
import { generateBracket } from "@/lib/services/bracket";
import type { BracketMatch } from "@/types";

/**
 * Expectations come from the PRD cup rules, worked out by hand (never from the function output):
 * - S = smallest power of two >= N; byes = S - N; byes go to seeds 1..byes (indexes 0..byes-1).
 * - Round-1 rows exist only for real pairings: S/2 pairs minus `byes` = N - S/2 rows.
 * - A bye player sits directly in his round-2 slot.
 * - Total matches = N - 1 (single elimination, no third-place match).
 * - Seeds 1 and 2 (indexes 0 and 1) sit in opposite halves, so they can only meet in the final.
 */

function m(
  round: number,
  position: number,
  a: number | null,
  b: number | null,
  nextPosition: number | null,
  nextSlot: "a" | "b" | null,
): BracketMatch {
  return { round, position, a, b, nextPosition, nextSlot };
}

/** Smallest power of two >= n, computed independently of the generator. */
function powerOfTwoAtLeast(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

describe("generateBracket - hand-computed tables", () => {
  it("N=4: no byes, two semifinals feed the final", () => {
    // S=4, byes=0. Standard placement pairs seed1-seed4 and seed2-seed3 (indexes 0v3, 1v2).
    // Round 1: pos1 = 0v3, pos2 = 1v2. Round 2 (final): pos3, both slots fed by the winners.
    expect(generateBracket(4)).toEqual([m(1, 1, 0, 3, 3, "a"), m(1, 2, 1, 2, 3, "b"), m(2, 3, null, null, null, null)]);
  });

  it("N=5: three byes for seeds 1-3, one round-1 match", () => {
    // S=8, byes=3 -> indexes 0,1,2 skip round 1. Pairs in bracket order: (1v8) (4v5) (2v7) (3v6).
    // Only (4v5) is real -> indexes 3v4. Round-1 rows = 5 - 8/2 = 1.
    // Round 2: pos2 = pair0 + pair1 = bye 0 vs winner(pos1); pos3 = pair2 + pair3 = bye 1 vs bye 2.
    // Final pos4 fed by pos2 (a) and pos3 (b). Total 1 + 2 + 1 = 4 = N - 1.
    expect(generateBracket(5)).toEqual([
      m(1, 1, 3, 4, 2, "b"),
      m(2, 2, 0, null, 4, "a"),
      m(2, 3, 1, 2, 4, "b"),
      m(3, 4, null, null, null, null),
    ]);
  });

  it("N=6: two byes for seeds 1-2, two round-1 matches", () => {
    // S=8, byes=2 -> indexes 0,1 skip round 1. Pairs: (1v8) bye0, (4v5) 3v4, (2v7) bye1, (3v6) 2v5.
    // Round-1 rows = 6 - 4 = 2: pos1 = 3v4, pos2 = 2v5.
    // Round 2: pos3 = bye 0 vs winner(pos1); pos4 = bye 1 vs winner(pos2). Final pos5. Total 5 = N - 1.
    expect(generateBracket(6)).toEqual([
      m(1, 1, 3, 4, 3, "b"),
      m(1, 2, 2, 5, 4, "b"),
      m(2, 3, 0, null, 5, "a"),
      m(2, 4, 1, null, 5, "b"),
      m(3, 5, null, null, null, null),
    ]);
  });

  it("N=8: full bracket, no byes", () => {
    // S=8, byes=0. Pairs in bracket order: (1v8) (4v5) (2v7) (3v6) -> indexes 0v7, 3v4, 1v6, 2v5.
    // Round 1 pos1..4. Round 2: pos5 <- pos1,pos2; pos6 <- pos3,pos4. Final pos7. Total 7 = N - 1.
    expect(generateBracket(8)).toEqual([
      m(1, 1, 0, 7, 5, "a"),
      m(1, 2, 3, 4, 5, "b"),
      m(1, 3, 1, 6, 6, "a"),
      m(1, 4, 2, 5, 6, "b"),
      m(2, 5, null, null, 7, "a"),
      m(2, 6, null, null, 7, "b"),
      m(3, 7, null, null, null, null),
    ]);
  });
});

describe("generateBracket - structure for every N in 3..20", () => {
  for (let n = 3; n <= 20; n++) {
    describe(`N=${n}`, () => {
      const s = powerOfTwoAtLeast(n);
      const byes = s - n;
      const rounds = Math.log2(s);

      it("has N-1 matches with unique positions 1..N-1 in order", () => {
        const bracket = generateBracket(n);
        expect(bracket).toHaveLength(n - 1);
        expect(bracket.map((x) => x.position)).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1));
      });

      it("has exactly one final: the last match, in the last round, linking nowhere", () => {
        const bracket = generateBracket(n);
        const finals = bracket.filter((x) => x.nextPosition === null);
        expect(finals).toHaveLength(1);
        expect(finals[0]).toBe(bracket[bracket.length - 1]);
        expect(finals[0].nextSlot).toBeNull();
        expect(finals[0].round).toBe(rounds);
        expect(bracket.filter((x) => x.round === rounds)).toHaveLength(1);
      });

      it("orders rows by round and has the expected row count per round", () => {
        const bracket = generateBracket(n);
        const rounds1 = bracket.filter((x) => x.round === 1).length;
        // S/2 first-round pairings, `byes` of them are byes: N - S/2 real rows (0 would mean all byes).
        expect(rounds1).toBe(n - s / 2);
        for (let r = 2; r <= rounds; r++) {
          // Round r has S / 2^r matches.
          expect(bracket.filter((x) => x.round === r)).toHaveLength(s / 2 ** r);
        }
        const roundsInOrder = bracket.map((x) => x.round);
        expect(roundsInOrder).toEqual([...roundsInOrder].sort((p, q) => p - q));
      });

      it("links every non-final match to exactly one later slot, and every slot is a bye or fed once", () => {
        const bracket = generateBracket(n);
        const feeders = new Map<string, number>();
        for (const match of bracket) {
          if (match.nextPosition === null) continue;
          expect(match.nextSlot === "a" || match.nextSlot === "b").toBe(true);
          const target = bracket.find((x) => x.position === match.nextPosition);
          expect(target).toBeDefined();
          // Winners move exactly one round forward.
          expect(target?.round).toBe(match.round + 1);
          const key = `${match.nextPosition}:${match.nextSlot}`;
          feeders.set(key, (feeders.get(key) ?? 0) + 1);
        }
        for (const match of bracket) {
          for (const slot of ["a", "b"] as const) {
            const fed = feeders.get(`${match.position}:${slot}`) ?? 0;
            if (match[slot] === null) {
              expect(fed).toBe(1); // empty slot: filled by exactly one earlier match
            } else {
              expect(fed).toBe(0); // occupied slot: a real player (round 1) or a bye placement, never fed
            }
          }
        }
      });

      it("places every player exactly once across round-1 slots and bye placements", () => {
        const bracket = generateBracket(n);
        const placed: number[] = [];
        for (const match of bracket) {
          for (const slot of [match.a, match.b]) {
            if (slot !== null) placed.push(slot);
          }
          // Only rounds 1 and 2 hold pre-placed players; later rounds are all fed by matches.
          if (match.round >= 3) {
            expect(match.a).toBeNull();
            expect(match.b).toBeNull();
          }
        }
        expect([...placed].sort((p, q) => p - q)).toEqual(Array.from({ length: n }, (_, i) => i));
      });

      it("gives the byes to the top seeds: S-N byes, indexes 0..byes-1", () => {
        const bracket = generateBracket(n);
        const round1Players = new Set<number>();
        const byePlayers: number[] = [];
        for (const match of bracket) {
          if (match.round === 1) {
            expect(match.a).not.toBeNull();
            expect(match.b).not.toBeNull();
            if (match.a !== null) round1Players.add(match.a);
            if (match.b !== null) round1Players.add(match.b);
          } else if (match.round === 2) {
            for (const slot of [match.a, match.b]) {
              if (slot !== null) byePlayers.push(slot);
            }
          }
        }
        expect(byePlayers).toHaveLength(byes);
        expect([...byePlayers].sort((p, q) => p - q)).toEqual(Array.from({ length: byes }, (_, i) => i));
        // Round 1 holds the remaining N - byes players, none of them a bye seed.
        expect(round1Players.size).toBe(n - byes);
        for (let i = 0; i < byes; i++) expect(round1Players.has(i)).toBe(false);
      });

      it("keeps seeds 1 and 2 in opposite halves so they can only meet in the final", () => {
        const bracket = generateBracket(n);
        const final = bracket[bracket.length - 1];
        // Which final slot a player's path ends in = the half of the bracket he belongs to.
        const halfOf = (player: number): "a" | "b" | null => {
          let current = bracket.find((x) => x.a === player || x.b === player);
          expect(current).toBeDefined();
          while (current && current.position !== final.position) {
            if (current.nextPosition === final.position) return current.nextSlot;
            const nextPosition = current.nextPosition;
            current = bracket.find((x) => x.position === nextPosition);
          }
          // The player is placed directly in the final (N=3 bye).
          return final.a === player ? "a" : "b";
        };
        expect(halfOf(0)).not.toBe(halfOf(1));
      });
    });
  }
});

describe("generateBracket - input validation", () => {
  it("throws for a count below 3", () => {
    expect(() => generateBracket(2)).toThrow(Error);
  });

  it("throws for a count above 20", () => {
    expect(() => generateBracket(21)).toThrow(Error);
  });

  it("throws for a non-integer count", () => {
    expect(() => generateBracket(3.5)).toThrow(Error);
  });
});
