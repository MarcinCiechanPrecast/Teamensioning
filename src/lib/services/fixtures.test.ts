import { describe, expect, it } from "vitest";

import { generateFixtures } from "@/lib/services/fixtures";

const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

describe("generateFixtures", () => {
  it("produces the exact circle-method order for 4 players", () => {
    expect(generateFixtures(4)).toEqual([
      // round 1
      { a: 0, b: 3 },
      { a: 1, b: 2 },
      // round 2
      { a: 0, b: 2 },
      { a: 1, b: 3 },
      // round 3
      { a: 0, b: 1 },
      { a: 2, b: 3 },
    ]);
  });

  it("produces 10 matches for 5 players (odd count, bye dropped)", () => {
    const fixtures = generateFixtures(5);
    expect(fixtures).toHaveLength(10);
    expect(fixtures.every(({ a, b }) => a < 5 && b < 5)).toBe(true);
  });

  it.each([1, 0, -1])("throws for playerCount %i (< 2)", (count) => {
    expect(() => generateFixtures(count)).toThrow();
  });

  const supportedSizes = Array.from({ length: 18 }, (_, i) => i + 3); // 3..20

  describe.each(supportedSizes)("for %i players", (n) => {
    const fixtures = generateFixtures(n);

    it("has N(N-1)/2 matches", () => {
      expect(fixtures).toHaveLength((n * (n - 1)) / 2);
    });

    it("has no self-pair", () => {
      expect(fixtures.some(({ a, b }) => a === b)).toBe(false);
    });

    it("keeps every index in [0, N)", () => {
      for (const { a, b } of fixtures) {
        for (const index of [a, b]) {
          expect(Number.isInteger(index)).toBe(true);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(n);
        }
      }
    });

    it("contains every unordered pair exactly once", () => {
      const keys = fixtures.map(({ a, b }) => pairKey(a, b));
      expect(new Set(keys).size).toBe(keys.length);

      const expected = new Set<string>();
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expected.add(pairKey(i, j));
        }
      }
      expect(new Set(keys)).toEqual(expected);
    });

    it("has distinct players within each consecutive block of floor(N/2) pairs", () => {
      const blockSize = Math.floor(n / 2);
      for (let start = 0; start < fixtures.length; start += blockSize) {
        const players = fixtures.slice(start, start + blockSize).flatMap(({ a, b }) => [a, b]);
        expect(new Set(players).size).toBe(players.length);
      }
    });
  });
});
