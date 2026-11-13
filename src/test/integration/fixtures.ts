import { randomUUID } from "node:crypto";
import { generateBracket } from "@/lib/services/bracket";
import { generateFixtures } from "@/lib/services/fixtures";
import { anonClient, type TestClient } from "./supabase-test-env";

/**
 * Fixtures for the DB-level suite. Everything goes through the same public surface the app uses
 * (anon key, sign-up, the create_league RPC, RLS-scoped reads) — never a service-role client, which
 * would bypass the very rules under test.
 */

export interface TestUser {
  client: TestClient;
  userId: string;
}

export interface TestLeague {
  tournamentId: string;
  shareToken: string;
  /** Match ids in display order (by position). */
  matchIds: string[];
  /** Matches in display order with their stored player ids (score_a belongs to playerAId). */
  matches: { id: string; playerAId: string; playerBId: string }[];
  /** Player id by the name passed at creation. */
  playerIds: Record<string, string>;
}

export interface TestPoints {
  win: number;
  draw: number;
  loss: number;
}

/** The PRD's prefilled defaults. */
export const DEFAULT_POINTS: TestPoints = { win: 3, draw: 1, loss: 0 };

/** Signs up a fresh user (local Supabase has email confirmation off) and returns a client holding its session. */
export async function signUpUser(): Promise<TestUser> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email: `it-${randomUUID()}@example.test`,
    password: `pw-${randomUUID()}`,
  });
  if (error) throw new Error(`signUpUser: ${error.message}`, { cause: error });
  if (!data.user || !data.session) {
    throw new Error("signUpUser: no session returned — is email confirmation enabled in the local Supabase?");
  }
  return { client, userId: data.user.id };
}

/** Creates a league (3/1/0 points unless given) as `owner`, then reads token, matches and players back as that owner. */
export async function createLeagueAs(
  owner: TestUser,
  playerNames: string[],
  points: TestPoints = DEFAULT_POINTS,
): Promise<TestLeague> {
  const { data: tournamentId, error } = await owner.client.rpc("create_league", {
    p_name: `IT league ${randomUUID().slice(0, 8)}`,
    p_points_win: points.win,
    p_points_draw: points.draw,
    p_points_loss: points.loss,
    p_players: playerNames,
    p_fixtures: generateFixtures(playerNames.length).map(({ a, b }) => ({ a, b })),
  });
  if (error) throw new Error(`createLeagueAs: ${error.message}`, { cause: error });

  const { data: tournament, error: tournamentError } = await owner.client
    .from("tournaments")
    .select("share_token")
    .eq("id", tournamentId)
    .single();
  if (tournamentError)
    throw new Error(`createLeagueAs (token): ${tournamentError.message}`, { cause: tournamentError });

  const { data: matches, error: matchesError } = await owner.client
    .from("matches")
    .select("id, player_a_id, player_b_id")
    .eq("tournament_id", tournamentId)
    .order("position");
  if (matchesError) throw new Error(`createLeagueAs (matches): ${matchesError.message}`, { cause: matchesError });

  const { data: players, error: playersError } = await owner.client
    .from("players")
    .select("id, name")
    .eq("tournament_id", tournamentId);
  if (playersError) throw new Error(`createLeagueAs (players): ${playersError.message}`, { cause: playersError });

  return {
    tournamentId,
    shareToken: tournament.share_token,
    matchIds: matches.map((m) => m.id),
    matches: matches.map((m) => {
      // A league match always has both players (DB check); only cup matches can have an open slot.
      if (!m.player_a_id || !m.player_b_id) throw new Error(`createLeagueAs: match ${m.id} has an open slot`);
      return { id: m.id, playerAId: m.player_a_id, playerBId: m.player_b_id };
    }),
    playerIds: Object.fromEntries(players.map((p) => [p.name, p.id])),
  };
}

/** The owner's view of a match result: `null` when no result is stored. */
export async function readResultAs(
  owner: TestUser,
  matchId: string,
): Promise<{ score_a: number; score_b: number } | null> {
  const { data, error } = await owner.client
    .from("results")
    .select("score_a, score_b")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw new Error(`readResultAs: ${error.message}`, { cause: error });
  return data;
}

/** The owner's view of a tournament's name and points: `null` when it no longer exists (or is not theirs). */
export async function readTournamentAs(owner: TestUser, tournamentId: string) {
  const { data, error } = await owner.client
    .from("tournaments")
    .select("name, points_win, points_draw, points_loss")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Error(`readTournamentAs: ${error.message}`, { cause: error });
  return data;
}

/** Cleanup for afterAll: the owner deletes the league (players, matches and results cascade). */
export async function deleteLeagueAs(owner: TestUser, tournamentId: string): Promise<void> {
  const { error } = await owner.client.from("tournaments").delete().eq("id", tournamentId);
  if (error) throw new Error(`deleteLeagueAs: ${error.message}`, { cause: error });
}

/**
 * Collects owner-side cleanups as leagues are created, so afterAll removes only what actually exists
 * (a failed beforeAll leaves nothing registered instead of crashing the teardown).
 */
export function leagueCleanup() {
  const created: { owner: TestUser; tournamentId: string }[] = [];
  return {
    async create(owner: TestUser, playerNames: string[], points?: TestPoints): Promise<TestLeague> {
      const league = await createLeagueAs(owner, playerNames, points);
      created.push({ owner, tournamentId: league.tournamentId });
      return league;
    },
    async run(): Promise<void> {
      await Promise.all(created.splice(0).map(({ owner, tournamentId }) => deleteLeagueAs(owner, tournamentId)));
    },
  };
}

/**
 * The match between two named players, plus `orient`, which turns "`first` scored x, `second` scored y"
 * into the stored (score_a, score_b) order — the fixture generator decides who is player A.
 */
export function matchBetween(league: TestLeague, first: string, second: string) {
  const firstId = league.playerIds[first];
  const secondId = league.playerIds[second];
  const found = league.matches.find(
    (m) =>
      (m.playerAId === firstId && m.playerBId === secondId) || (m.playerAId === secondId && m.playerBId === firstId),
  );
  if (!firstId || !secondId || !found) throw new Error(`matchBetween: no match ${first} v ${second}`);
  const firstIsA = found.playerAId === firstId;
  return {
    id: found.id,
    orient: (firstGoals: number, secondGoals: number) =>
      firstIsA ? { score_a: firstGoals, score_b: secondGoals } : { score_a: secondGoals, score_b: firstGoals },
  };
}

/** Enters "`first` x - y `second`" through the anonymous write path, as a link holder would. Throws unless created. */
export async function enterScoreAsLinkHolder(
  league: TestLeague,
  first: string,
  firstGoals: number,
  secondGoals: number,
  second: string,
): Promise<void> {
  const target = matchBetween(league, first, second);
  const { score_a, score_b } = target.orient(firstGoals, secondGoals);
  const { data, error } = await anonClient().rpc("submit_match_score", {
    p_token: league.shareToken,
    p_match_id: target.id,
    p_score_a: score_a,
    p_score_b: score_b,
  });
  if (error) throw new Error(`enterScoreAsLinkHolder: ${error.message}`, { cause: error });
  if ((data as { status?: string } | null)?.status !== "created") {
    throw new Error(`enterScoreAsLinkHolder: expected created, got ${JSON.stringify(data)}`);
  }
}

// ---------------------------------------------------------------------------
// Cup (single-elimination) fixtures
// ---------------------------------------------------------------------------

export interface TestCupMatch {
  id: string;
  /** Global 1-based position (round 1 first, final last). */
  position: number;
  round: number;
}

export interface TestCup {
  tournamentId: string;
  shareToken: string;
  /** Player id by the name passed at creation (entry order = seed). */
  playerIds: Record<string, string>;
  /** Matches by position: `matches[position - 1]`. */
  matches: TestCupMatch[];
}

/** One match as the owner reads it: slots as player names (null = still TBD) plus the advancement link. */
export interface CupMatchSlots {
  position: number;
  round: number;
  a: string | null;
  b: string | null;
  nextPosition: number | null;
  nextSlot: string | null;
}

/** The generator's bracket in the snake_case shape `create_cup` takes as `p_bracket`. */
export function cupBracketPayload(playerCount: number) {
  return generateBracket(playerCount).map((m) => ({
    round: m.round,
    position: m.position,
    a: m.a,
    b: m.b,
    next_position: m.nextPosition,
    next_slot: m.nextSlot,
  }));
}

/** Creates a cup as `owner` (bracket from the real generator), then reads token, players and matches back as that owner. */
export async function createCupAs(owner: TestUser, names: string[]): Promise<TestCup> {
  const { data: tournamentId, error } = await owner.client.rpc("create_cup", {
    p_name: `IT cup ${randomUUID().slice(0, 8)}`,
    p_players: names,
    p_bracket: cupBracketPayload(names.length),
  });
  if (error) throw new Error(`createCupAs: ${error.message}`, { cause: error });

  const { data: tournament, error: tournamentError } = await owner.client
    .from("tournaments")
    .select("share_token")
    .eq("id", tournamentId)
    .single();
  if (tournamentError) throw new Error(`createCupAs (token): ${tournamentError.message}`, { cause: tournamentError });

  const { data: matches, error: matchesError } = await owner.client
    .from("matches")
    .select("id, position, round")
    .eq("tournament_id", tournamentId)
    .order("position");
  if (matchesError) throw new Error(`createCupAs (matches): ${matchesError.message}`, { cause: matchesError });

  const { data: players, error: playersError } = await owner.client
    .from("players")
    .select("id, name")
    .eq("tournament_id", tournamentId);
  if (playersError) throw new Error(`createCupAs (players): ${playersError.message}`, { cause: playersError });

  return {
    tournamentId,
    shareToken: tournament.share_token,
    playerIds: Object.fromEntries(players.map((p) => [p.name, p.id])),
    matches: matches.map((m) => {
      if (m.round === null) throw new Error(`createCupAs: match ${m.id} has no round`);
      return { id: m.id, position: m.position, round: m.round };
    }),
  };
}

/** Collects owner-side cleanups as cups are created, mirroring `leagueCleanup` (a cup is deleted like a league). */
export function cupCleanup() {
  const created: { owner: TestUser; tournamentId: string }[] = [];
  return {
    async create(owner: TestUser, names: string[]): Promise<TestCup> {
      const cup = await createCupAs(owner, names);
      created.push({ owner, tournamentId: cup.tournamentId });
      return cup;
    },
    async run(): Promise<void> {
      await Promise.all(created.splice(0).map(({ owner, tournamentId }) => deleteLeagueAs(owner, tournamentId)));
    },
  };
}

/** The match at a 1-based bracket position. */
export function cupMatch(cup: TestCup, position: number): TestCupMatch {
  const found = cup.matches.find((m) => m.position === position);
  if (!found) throw new Error(`cupMatch: no match at position ${position}`);
  return found;
}

/** Enters a score through the anonymous write path and returns the reported status (no throw on a refusal status). */
export async function enterCupScore(cup: TestCup, position: number, scoreA: number, scoreB: number): Promise<string> {
  const { data, error } = await anonClient().rpc("submit_match_score", {
    p_token: cup.shareToken,
    p_match_id: cupMatch(cup, position).id,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });
  if (error) throw new Error(`enterCupScore: ${error.message}`, { cause: error });
  return (data as { status: string }).status;
}

/** The owner's read of every match: slots as player names (null = TBD), ordered by position. */
export async function readCupMatchSlots(owner: TestUser, cup: TestCup): Promise<CupMatchSlots[]> {
  const { data, error } = await owner.client
    .from("matches")
    .select("position, round, player_a_id, player_b_id, next_match_id, next_slot")
    .eq("tournament_id", cup.tournamentId)
    .order("position");
  if (error) throw new Error(`readCupMatchSlots: ${error.message}`, { cause: error });

  const nameById = new Map(Object.entries(cup.playerIds).map(([name, id]) => [id, name]));
  const positionById = new Map(cup.matches.map((m) => [m.id, m.position]));
  const nameOf = (id: string | null) => (id === null ? null : (nameById.get(id) ?? `?${id}`));
  return data.map((m) => ({
    position: m.position,
    round: m.round ?? 0,
    a: nameOf(m.player_a_id),
    b: nameOf(m.player_b_id),
    nextPosition: m.next_match_id === null ? null : (positionById.get(m.next_match_id) ?? null),
    nextSlot: m.next_slot,
  }));
}
