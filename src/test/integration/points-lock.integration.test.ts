import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  enterScoreAsLinkHolder,
  leagueCleanup,
  matchBetween,
  readResultAs,
  readTournamentAs,
  signUpUser,
  type TestLeague,
  type TestUser,
} from "./fixtures";

/**
 * Risk #5 (context/foundation/test-plan.md): PRD FR-013 — the organizer can edit the name at any time, but the
 * points for win/draw/loss only before any score has been entered. Proven at the write boundary
 * (update_tournament_settings), not in the form: the outcome is the returned status plus an owner read-back.
 */

/** The generated RPC types never allow null, but null points mean "leave points unchanged". */
const UNCHANGED = null as unknown as number;

describe("points lock after the first score (risk #5)", () => {
  const leagues = leagueCleanup();
  let owner: TestUser;

  beforeAll(async () => {
    owner = await signUpUser();
  });

  afterAll(() => leagues.run());

  const freshLeague = () => leagues.create(owner, ["Ann", "Bob", "Cid"]);

  const editSettings = (league: TestLeague, name: string, points: [number, number, number] | null) =>
    owner.client.rpc("update_tournament_settings", {
      p_tournament_id: league.tournamentId,
      p_name: name,
      p_points_win: points ? points[0] : UNCHANGED,
      p_points_draw: points ? points[1] : UNCHANGED,
      p_points_loss: points ? points[2] : UNCHANGED,
    });

  it("control: before any score the owner can change points", async () => {
    const league = await freshLeague();
    const { name } = (await readTournamentAs(owner, league.tournamentId)) ?? { name: "" };

    const result = await editSettings(league, name, [5, 2, 1]);

    expect(result).toMatchObject({ data: { status: "updated" }, error: null });
    expect(await readTournamentAs(owner, league.tournamentId)).toEqual({
      name,
      points_win: 5,
      points_draw: 2,
      points_loss: 1,
    });
  });

  it("refuses a points change once one score exists, and stores nothing (not even the new name)", async () => {
    const league = await freshLeague();
    await enterScoreAsLinkHolder(league, "Ann", 1, 0, "Bob");
    const before = await readTournamentAs(owner, league.tournamentId);

    const result = await editSettings(league, "Renamed with new points", [5, 2, 1]);

    expect(result).toMatchObject({ data: { status: "points_locked" }, error: null });
    expect(await readTournamentAs(owner, league.tournamentId)).toEqual(before);
  });

  it("refuses changing even one of the three values", async () => {
    const league = await freshLeague();
    await enterScoreAsLinkHolder(league, "Ann", 1, 0, "Bob");
    const before = await readTournamentAs(owner, league.tournamentId);

    // Only the loss value differs from the stored 3/1/0.
    const result = await editSettings(league, "Same name", [3, 1, 1]);

    expect(result).toMatchObject({ data: { status: "points_locked" } });
    expect(await readTournamentAs(owner, league.tournamentId)).toEqual(before);
  });

  it("still lets the owner rename after a score: without points, or resubmitting the same points", async () => {
    const league = await freshLeague();
    await enterScoreAsLinkHolder(league, "Ann", 1, 0, "Bob");

    const renameOnly = await editSettings(league, "Renamed once", null);
    expect(renameOnly).toMatchObject({ data: { status: "updated" }, error: null });

    // The edit form posts all fields; resubmitting the stored 3/1/0 is not a change.
    const samePoints = await editSettings(league, "Renamed twice", [3, 1, 0]);
    expect(samePoints).toMatchObject({ data: { status: "updated" }, error: null });

    expect(await readTournamentAs(owner, league.tournamentId)).toEqual({
      name: "Renamed twice",
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
    });
  });

  it("stays locked after an organizer correction, which can neither delete nor blank the score", async () => {
    const league = await freshLeague();
    await enterScoreAsLinkHolder(league, "Ann", 1, 0, "Bob");
    const annBob = matchBetween(league, "Ann", "Bob");

    const corrected = await owner.client.from("results").update(annBob.orient(0, 0)).eq("match_id", annBob.id).select();
    expect(corrected.data).toHaveLength(1);

    // The only ways a correction could "un-enter" the score are refused.
    const deleted = await owner.client.from("results").delete().eq("match_id", annBob.id).select();
    expect(deleted.data ?? []).toHaveLength(0);
    const blanked = await owner.client
      .from("results")
      .update({ score_a: null as unknown as number, score_b: null as unknown as number })
      .eq("match_id", annBob.id)
      .select();
    expect(blanked.error).not.toBeNull();
    expect(await readResultAs(owner, annBob.id)).toEqual(annBob.orient(0, 0));

    const before = await readTournamentAs(owner, league.tournamentId);
    const result = await editSettings(league, "After correction", [5, 2, 1]);

    expect(result).toMatchObject({ data: { status: "points_locked" } });
    expect(await readTournamentAs(owner, league.tournamentId)).toEqual(before);
  });

  it("is per tournament: a score in another league does not lock this one", async () => {
    const scored = await freshLeague();
    const untouched = await freshLeague();
    await enterScoreAsLinkHolder(scored, "Ann", 1, 0, "Bob");
    const { name } = (await readTournamentAs(owner, untouched.tournamentId)) ?? { name: "" };

    const result = await editSettings(untouched, name, [5, 2, 1]);

    expect(result).toMatchObject({ data: { status: "updated" }, error: null });
    expect(await readTournamentAs(owner, untouched.tournamentId)).toMatchObject({
      points_win: 5,
      points_draw: 2,
      points_loss: 1,
    });
  });
});
