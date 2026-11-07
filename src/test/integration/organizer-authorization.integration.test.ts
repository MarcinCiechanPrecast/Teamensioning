import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leagueCleanup, readResultAs, readTournamentAs, signUpUser, type TestLeague, type TestUser } from "./fixtures";
import { anonClient, type TestClient } from "./supabase-test-env";

/**
 * Risk #2 (context/foundation/test-plan.md): "only the admin manages the tournament" (PRD Access Control),
 * proven at the database for each of its three enforcement mechanisms — the RLS correction policy, the
 * owner check inside update_tournament_settings, and the RLS delete policy — plus the absence of any direct
 * UPDATE path on tournaments.
 *
 * A refusal is "error or 0 rows" AND an owner read-back showing nothing changed: an RLS-refused update or
 * delete returns success with 0 rows, so `error === null` alone proves nothing. Each refusal has an owner
 * control showing the same write does work when allowed, so a broken fixture cannot pass vacuously.
 */

/** The generated RPC types never allow null, but null points mean "leave points unchanged". */
const UNCHANGED = null as unknown as number;

describe("organizer-only writes (risk #2)", () => {
  const leagues = leagueCleanup();
  let owner: TestUser;
  let otherUser: TestUser;
  const anon = () => anonClient();

  beforeAll(async () => {
    [owner, otherUser] = await Promise.all([signUpUser(), signUpUser()]);
  });

  afterAll(() => leagues.run());

  /** A fresh league per test, so a positive control can never disturb a refusal test. */
  const freshLeague = () => leagues.create(owner, ["Ania", "Bogdan", "Cezary"]);

  const firstMatch = (league: TestLeague) => {
    const id = league.matchIds[0];
    if (!id) throw new Error("fixture league has no matches");
    return id;
  };

  async function enterScore(league: TestLeague, matchId: string, a: number, b: number) {
    const { data, error } = await anonClient().rpc("submit_match_score", {
      p_token: league.shareToken,
      p_match_id: matchId,
      p_score_a: a,
      p_score_b: b,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ status: "created" });
  }

  const correct = (client: TestClient, matchId: string) =>
    client.from("results").update({ score_a: 7, score_b: 7 }).eq("match_id", matchId).select();

  // Two RLS policies guard this together: the UPDATE policy, and the SELECT policy (an UPDATE whose WHERE
  // reads a column must also see the row). Widening only one of them leaves this test green — by design.
  describe("score correction", () => {
    it("is refused for another signed-in user and for anon, leaving the score unchanged", async () => {
      const league = await freshLeague();
      const matchId = firstMatch(league);
      await enterScore(league, matchId, 2, 1);

      const byOther = await correct(otherUser.client, matchId);
      const byAnon = await correct(anon(), matchId);

      expect(byOther.data ?? []).toHaveLength(0);
      expect(byAnon.data ?? []).toHaveLength(0);
      expect(await readResultAs(owner, matchId)).toEqual({ score_a: 2, score_b: 1 });
    });

    it("control: works for the owner", async () => {
      const league = await freshLeague();
      const matchId = firstMatch(league);
      await enterScore(league, matchId, 2, 1);

      const byOwner = await correct(owner.client, matchId);

      expect(byOwner.error).toBeNull();
      expect(byOwner.data).toHaveLength(1);
      expect(await readResultAs(owner, matchId)).toEqual({ score_a: 7, score_b: 7 });
    });
  });

  describe("settings edit (name and points)", () => {
    const hijack = (client: TestClient, tournamentId: string) =>
      client.rpc("update_tournament_settings", {
        p_tournament_id: tournamentId,
        p_name: "Hijacked",
        p_points_win: 5,
        p_points_draw: 2,
        p_points_loss: 1,
      });

    it("is refused for another signed-in user and for anon, leaving name and points unchanged", async () => {
      const league = await freshLeague();
      const before = await readTournamentAs(owner, league.tournamentId);

      const byOther = await hijack(otherUser.client, league.tournamentId);
      const byAnon = await hijack(anon(), league.tournamentId);

      // Same rule, two refusal shapes: the non-owner gets "not found", anon may not call the function at all.
      expect(byOther).toMatchObject({ data: { status: "not_found" }, error: null });
      expect(byAnon.error).not.toBeNull();
      expect(await readTournamentAs(owner, league.tournamentId)).toEqual(before);
    });

    it("control: the owner can rename", async () => {
      const league = await freshLeague();

      const byOwner = await owner.client.rpc("update_tournament_settings", {
        p_tournament_id: league.tournamentId,
        p_name: "Renamed by owner",
        p_points_win: UNCHANGED,
        p_points_draw: UNCHANGED,
        p_points_loss: UNCHANGED,
      });

      expect(byOwner).toMatchObject({ data: { status: "updated" }, error: null });
      expect(await readTournamentAs(owner, league.tournamentId)).toMatchObject({ name: "Renamed by owner" });
    });
  });

  describe("tournament delete", () => {
    const remove = (client: TestClient, tournamentId: string) =>
      client.from("tournaments").delete().eq("id", tournamentId).select("id");

    it("is refused for another signed-in user and for anon, leaving the league and its link intact", async () => {
      const league = await freshLeague();

      const byOther = await remove(otherUser.client, league.tournamentId);
      const byAnon = await remove(anon(), league.tournamentId);

      expect(byOther.data ?? []).toHaveLength(0);
      expect(byAnon.data ?? []).toHaveLength(0);
      expect(await readTournamentAs(owner, league.tournamentId)).not.toBeNull();
      const shared = await anonClient().rpc("get_shared_league", { p_token: league.shareToken });
      expect((shared.data as { matches: unknown[] } | null)?.matches).toHaveLength(league.matchIds.length);
    });

    it("control: the owner can delete, and the share link stops working", async () => {
      const league = await freshLeague();

      const byOwner = await remove(owner.client, league.tournamentId);

      expect(byOwner.error).toBeNull();
      expect(byOwner.data).toHaveLength(1);
      expect(await readTournamentAs(owner, league.tournamentId)).toBeNull();
      const shared = await anonClient().rpc("get_shared_league", { p_token: league.shareToken });
      expect(shared.data).toBeNull();
    });
  });

  describe("direct tournament update (bypassing update_tournament_settings)", () => {
    it("is refused for another user, for anon and for the owner too", async () => {
      const league = await freshLeague();
      const before = await readTournamentAs(owner, league.tournamentId);
      const directUpdate = (client: TestClient) =>
        client.from("tournaments").update({ name: "Direct", points_win: 9 }).eq("id", league.tournamentId).select();

      // The owner is refused as well: a direct path would skip the function's ownership and points-lock checks.
      for (const client of [otherUser.client, anon(), owner.client]) {
        const result = await directUpdate(client);
        expect(result.data ?? []).toHaveLength(0);
      }
      expect(await readTournamentAs(owner, league.tournamentId)).toEqual(before);
    });
  });
});
