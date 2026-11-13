import type { CupMatchDTO, PlayerDTO } from "@/types";

/** One side of a cup match as shown: a player, or TBD while the feeding match is unplayed. */
export interface BracketSlotView {
  /** Null renders as "TBD". */
  player: PlayerDTO | null;
  /** True for a player placed straight into round 2 because the field was not a power of two. */
  bye: boolean;
}

export interface BracketMatchView {
  id: string;
  position: number;
  round: number;
  a: BracketSlotView;
  b: BracketSlotView;
  score: { a: number; b: number } | null;
  /** Both players are known and no result is stored: a score can be entered. */
  ready: boolean;
  played: boolean;
}

export interface BracketRoundView {
  round: number;
  matches: BracketMatchView[];
}

export interface BracketView {
  rounds: BracketRoundView[];
  /** The winner of the final once it has a result, otherwise null. */
  champion: PlayerDTO | null;
}

/** The winner of a played match; a draw (impossible in a cup) has none. */
function winnerOf(match: CupMatchDTO): PlayerDTO | null {
  if (!match.score || match.score.a === match.score.b) return null;
  return match.score.a > match.score.b ? match.playerA : match.playerB;
}

/**
 * Groups a cup's matches into rounds and works out what the bracket page shows: open slots, byes and
 * the champion. A bye is a player who sits in a round-2 slot without having played in round 1
 * (byes only ever exist in round 2: they number fewer than half the bracket size).
 */
export function buildBracketView(matches: CupMatchDTO[]): BracketView {
  const roundOnePlayers = new Set<string>();
  for (const match of matches) {
    if (match.round !== 1) continue;
    if (match.playerA) roundOnePlayers.add(match.playerA.id);
    if (match.playerB) roundOnePlayers.add(match.playerB.id);
  }

  const slot = (match: CupMatchDTO, player: PlayerDTO | null): BracketSlotView => ({
    player,
    bye: player !== null && match.round === 2 && !roundOnePlayers.has(player.id),
  });

  const byRound = new Map<number, BracketMatchView[]>();
  for (const match of [...matches].sort((x, y) => x.position - y.position)) {
    const view: BracketMatchView = {
      id: match.id,
      position: match.position,
      round: match.round,
      a: slot(match, match.playerA),
      b: slot(match, match.playerB),
      score: match.score,
      ready: match.playerA !== null && match.playerB !== null && match.score === null,
      played: match.score !== null,
    };
    byRound.set(match.round, [...(byRound.get(match.round) ?? []), view]);
  }

  const rounds = [...byRound.entries()].sort(([x], [y]) => x - y).map(([round, list]) => ({ round, matches: list }));

  // The final is the match with the highest position (round 1 first, final last).
  const final = matches.reduce<CupMatchDTO | null>(
    (best, m) => (best === null || m.position > best.position ? m : best),
    null,
  );

  return { rounds, champion: final ? winnerOf(final) : null };
}
