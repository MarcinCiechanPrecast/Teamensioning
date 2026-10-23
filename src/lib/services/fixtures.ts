import type { FixturePair } from "@/types";

/**
 * Generates a single round-robin schedule for `playerCount` players using the circle method.
 *
 * Every unordered pair appears exactly once. Pairs are emitted round by round, so each
 * consecutive block of `floor(playerCount / 2)` pairs contains every player at most once.
 * For an odd count a phantom "bye" player is added and its pairs are dropped.
 *
 * Indices are 0-based into the caller's ordered player list; each pair has `a < b`.
 * Business limits (3-20 players) are enforced by validation, not here.
 */
export function generateFixtures(playerCount: number): FixturePair[] {
  if (!Number.isInteger(playerCount) || playerCount < 2) {
    throw new Error(`generateFixtures requires an integer playerCount >= 2, got ${playerCount}`);
  }

  const slotCount = playerCount % 2 === 0 ? playerCount : playerCount + 1;
  const bye = playerCount; // only reachable as an index when playerCount is odd
  const slots = Array.from({ length: slotCount }, (_, i) => i);
  const fixtures: FixturePair[] = [];

  for (let round = 0; round < slotCount - 1; round++) {
    for (let i = 0; i < slotCount / 2; i++) {
      const x = slots[i];
      const y = slots[slotCount - 1 - i];
      if (x === bye || y === bye) continue;
      fixtures.push({ a: Math.min(x, y), b: Math.max(x, y) });
    }
    // Keep slot 0 fixed and rotate the rest one step clockwise.
    const last = slots.pop();
    if (last !== undefined) slots.splice(1, 0, last);
  }

  return fixtures;
}
