import type { Tables } from "@/db/database.types";

/** One fixture: an unordered pair of 0-based indices into a league's player list (a < b). */
export interface FixturePair {
  a: number;
  b: number;
}

/**
 * One cup match. `a`/`b` are 0-based player indexes in entry order (index 0 = seed 1), null when the
 * slot is filled later by the winner of the match that links to it. `position` is global and 1-based
 * (round 1 first, final last). `nextPosition`/`nextSlot` name the later slot the winner moves into
 * (null for the final).
 */
export interface BracketMatch {
  round: number;
  position: number;
  a: number | null;
  b: number | null;
  nextPosition: number | null;
  nextSlot: "a" | "b" | null;
}

/** A league as shown to its owner. */
export type TournamentDTO = Pick<
  Tables<"tournaments">,
  "id" | "name" | "points_win" | "points_draw" | "points_loss" | "created_at"
>;

/** A player within a league. */
export type PlayerDTO = Pick<Tables<"players">, "id" | "name">;

/** A scheduled match with its 1-based display position and both players resolved. */
export interface FixtureDTO {
  id: Tables<"matches">["id"];
  position: Tables<"matches">["position"];
  playerA: PlayerDTO;
  playerB: PlayerDTO;
  /** The stored result, or null while the match is unplayed. */
  score: { a: number; b: number } | null;
}

/** A league as shown to anyone holding its share link: no owner, no ids, no token. */
export interface SharedLeagueDTO {
  league: Pick<Tables<"tournaments">, "name" | "points_win" | "points_draw" | "points_loss">;
  players: PlayerDTO[];
  fixtures: FixtureDTO[];
}

/** One leaderboard row: a player's record over the played matches of a league. */
export interface StandingDTO {
  /** Competition rank: players level on points, goal difference and goals for share it. */
  rank: number;
  player: PlayerDTO;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
