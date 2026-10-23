import type { Tables } from "@/db/database.types";

/** One fixture: an unordered pair of 0-based indices into a league's player list (a < b). */
export interface FixturePair {
  a: number;
  b: number;
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
}
