import { randomUUID } from "node:crypto";
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
}

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

/** Creates a league with 3/1/0 points as `owner`, then reads its share token and match ids back as that owner. */
export async function createLeagueAs(owner: TestUser, playerNames: string[]): Promise<TestLeague> {
  const { data: tournamentId, error } = await owner.client.rpc("create_league", {
    p_name: `IT league ${randomUUID().slice(0, 8)}`,
    p_points_win: 3,
    p_points_draw: 1,
    p_points_loss: 0,
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
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("position");
  if (matchesError) throw new Error(`createLeagueAs (matches): ${matchesError.message}`, { cause: matchesError });

  return { tournamentId, shareToken: tournament.share_token, matchIds: matches.map((m) => m.id) };
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
    async create(owner: TestUser, playerNames: string[]): Promise<TestLeague> {
      const league = await createLeagueAs(owner, playerNames);
      created.push({ owner, tournamentId: league.tournamentId });
      return league;
    },
    async run(): Promise<void> {
      await Promise.all(created.splice(0).map(({ owner, tournamentId }) => deleteLeagueAs(owner, tournamentId)));
    },
  };
}
