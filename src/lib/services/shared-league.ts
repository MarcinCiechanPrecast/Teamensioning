import type { Json } from "@/db/database.types";
import type { FixtureDTO, PlayerDTO, SharedLeagueDTO } from "@/types";

/** A share token is 64 lowercase hex chars (enforced by the tournaments_share_token_check constraint). */
const SHARE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function isValidShareToken(token: string | undefined): token is string {
  return token !== undefined && SHARE_TOKEN_PATTERN.test(token);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPlayer(value: unknown): PlayerDTO | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  return { id: value.id, name: value.name };
}

/** Both null means unplayed (null); both numbers is a score; anything else is malformed (undefined). */
function toScore(a: unknown, b: unknown): FixtureDTO["score"] | undefined {
  if (a === null && b === null) return null;
  if (typeof a === "number" && typeof b === "number") return { a, b };
  return undefined;
}

/** The ids of fixtures that already have a stored score, for `filterFixturesByPlayer`. */
export function playedMatchIds(fixtures: FixtureDTO[]): Set<string> {
  return new Set(fixtures.filter((fixture) => fixture.score !== null).map((fixture) => fixture.id));
}

/**
 * Turns the get_shared_league RPC payload into a SharedLeagueDTO.
 *
 * Returns null for a null or malformed payload. Matches whose players are missing are dropped,
 * like the owner page does.
 */
export function toSharedLeague(payload: Json | null | undefined): SharedLeagueDTO | null {
  if (!isRecord(payload)) return null;

  const { league, players, matches } = payload;
  if (
    !isRecord(league) ||
    typeof league.name !== "string" ||
    typeof league.points_win !== "number" ||
    typeof league.points_draw !== "number" ||
    typeof league.points_loss !== "number" ||
    !Array.isArray(players) ||
    !Array.isArray(matches)
  ) {
    return null;
  }

  const playerList: PlayerDTO[] = [];
  for (const raw of players) {
    const player = toPlayer(raw);
    if (!player) return null;
    playerList.push(player);
  }
  const playersById = new Map(playerList.map((player) => [player.id, player]));

  const fixtures: FixtureDTO[] = [];
  for (const raw of matches) {
    if (
      !isRecord(raw) ||
      typeof raw.id !== "string" ||
      typeof raw.position !== "number" ||
      typeof raw.player_a_id !== "string" ||
      typeof raw.player_b_id !== "string"
    ) {
      return null;
    }
    const score = toScore(raw.score_a, raw.score_b);
    if (score === undefined) return null;
    const playerA = playersById.get(raw.player_a_id);
    const playerB = playersById.get(raw.player_b_id);
    if (playerA && playerB) fixtures.push({ id: raw.id, position: raw.position, playerA, playerB, score });
  }

  return {
    league: {
      name: league.name,
      points_win: league.points_win,
      points_draw: league.points_draw,
      points_loss: league.points_loss,
    },
    players: playerList,
    fixtures,
  };
}

/**
 * Resolves a raw `?player=` value to a player id that exists in the league, or null for "no filter".
 * An unknown id is treated as no filter.
 */
export function resolvePlayerFilter(players: PlayerDTO[], rawPlayerId: string | null | undefined): string | null {
  if (!rawPlayerId) return null;
  return players.some((player) => player.id === rawPlayerId) ? rawPlayerId : null;
}

/**
 * Returns the unplayed fixtures involving `playerId` (as playerA or playerB), in their original order.
 * A null `playerId` returns all unplayed fixtures. Use `resolvePlayerFilter` first to drop unknown ids.
 */
export function filterFixturesByPlayer(
  fixtures: FixtureDTO[],
  playerId: string | null,
  playedMatchIds: ReadonlySet<string> = new Set(),
): FixtureDTO[] {
  return fixtures.filter(
    (fixture) =>
      !playedMatchIds.has(fixture.id) &&
      (playerId === null || fixture.playerA.id === playerId || fixture.playerB.id === playerId),
  );
}
