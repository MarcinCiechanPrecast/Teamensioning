import type { BracketMatch } from "@/types";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;

type Source = { player: number } | { match: BracketMatch };

/**
 * Seed order of a bracket of `size` slots (size is a power of two), e.g. 8 -> [1,8,4,5,2,7,3,6].
 * Adjacent entries form a round-1 pairing (seed s meets seed size + 1 - s); seeds 1 and 2 end up
 * in opposite halves, so they can only meet in the final.
 */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, total - seed]);
  }
  return order;
}

/**
 * Builds a single-elimination bracket for `playerCount` players (3-20) seeded by entry order.
 *
 * `a`/`b` are 0-based player indexes (index 0 = seed 1). With S the smallest power of two >=
 * playerCount, the top `S - playerCount` seeds get a bye: they have no round-1 row and sit directly
 * in their round-2 slot. Slots fed by an earlier match are null. `position` is global and 1-based
 * (round 1 first, final last); `nextPosition`/`nextSlot` point at the slot the winner moves into.
 * Always returns `playerCount - 1` matches.
 */
export function generateBracket(playerCount: number): BracketMatch[] {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(
      `generateBracket requires an integer playerCount between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${playerCount}`,
    );
  }

  let size = 1;
  while (size < playerCount) size *= 2;

  const order = seedOrder(size);
  const matches: BracketMatch[] = [];

  const createMatch = (round: number, a: number | null, b: number | null): BracketMatch => {
    const match: BracketMatch = {
      round,
      position: matches.length + 1,
      a,
      b,
      nextPosition: null,
      nextSlot: null,
    };
    matches.push(match);
    return match;
  };

  // Round 1: a pairing whose lower seed does not exist is a bye for the higher seed.
  let current: Source[] = [];
  for (let i = 0; i < size; i += 2) {
    const a = order[i] - 1;
    const b = order[i + 1] - 1;
    current.push(b >= playerCount ? { player: a } : { match: createMatch(1, a, b) });
  }

  // Later rounds: each match takes the winners of two neighbouring sources.
  for (let round = 2; current.length > 1; round++) {
    const next: Source[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1];
      const match = createMatch(round, "player" in left ? left.player : null, "player" in right ? right.player : null);
      if ("match" in left) {
        left.match.nextPosition = match.position;
        left.match.nextSlot = "a";
      }
      if ("match" in right) {
        right.match.nextPosition = match.position;
        right.match.nextSlot = "b";
      }
      next.push({ match });
    }
    current = next;
  }

  return matches;
}
