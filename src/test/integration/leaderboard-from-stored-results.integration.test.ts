import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toSharedLeague } from "@/lib/services/shared-league";
import { computeStandings } from "@/lib/services/standings";
import {
  enterScoreAsLinkHolder,
  leagueCleanup,
  matchBetween,
  signUpUser,
  type TestLeague,
  type TestUser,
} from "./fixtures";
import { anonClient } from "./supabase-test-env";

/**
 * Risk #3 (context/foundation/test-plan.md): the leaderboard always matches the entered results (PRD Guardrail 1,
 * FR-008). Results are stored through the real write paths (link holder RPC, owner correction), then the table is
 * built exactly as the shared page builds it: get_shared_league as anon → toSharedLeague → computeStandings.
 *
 * Expected tables are worked out by hand from the PRD rules (points from the tournament's own settings; unplayed
 * matches give nothing; order by points, then goal difference, then goals scored). The arithmetic is in comments.
 *
 * Row shape: [name, rank, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points].
 */

type Row = [string, number, number, number, number, number, number, number, number, number];

async function leaderboard(league: TestLeague): Promise<Row[]> {
  const { data, error } = await anonClient().rpc("get_shared_league", { p_token: league.shareToken });
  expect(error).toBeNull();
  const shared = toSharedLeague(data);
  if (!shared) throw new Error("get_shared_league returned no league");
  return computeStandings(shared).map((r) => [
    r.player.name,
    r.rank,
    r.played,
    r.won,
    r.drawn,
    r.lost,
    r.goalsFor,
    r.goalsAgainst,
    r.goalDifference,
    r.points,
  ]);
}

const PLAYERS = ["Ann", "Bob", "Cid", "Dan"];

/** Five of the six pairings; Cid v Dan stays unplayed. */
async function enterFiveResults(league: TestLeague) {
  await enterScoreAsLinkHolder(league, "Ann", 2, 0, "Bob");
  await enterScoreAsLinkHolder(league, "Ann", 1, 1, "Cid");
  await enterScoreAsLinkHolder(league, "Ann", 0, 1, "Dan");
  await enterScoreAsLinkHolder(league, "Bob", 3, 0, "Cid");
  await enterScoreAsLinkHolder(league, "Bob", 2, 2, "Dan");
}

describe("leaderboard from stored results (risk #3)", () => {
  const leagues = leagueCleanup();
  let owner: TestUser;

  beforeAll(async () => {
    owner = await signUpUser();
  });

  afterAll(() => leagues.run());

  it("shows every player with zeros and a shared rank 1 before any result is stored", async () => {
    const league = await leagues.create(owner, PLAYERS, { win: 5, draw: 2, loss: 1 });

    expect(await leaderboard(league)).toEqual([
      ["Ann", 1, 0, 0, 0, 0, 0, 0, 0, 0],
      ["Bob", 1, 0, 0, 0, 0, 0, 0, 0, 0],
      ["Cid", 1, 0, 0, 0, 0, 0, 0, 0, 0],
      ["Dan", 1, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
  });

  it("matches the hand-computed table for non-default points (5/2/1), with one match unplayed", async () => {
    const league = await leagues.create(owner, PLAYERS, { win: 5, draw: 2, loss: 1 });
    await enterFiveResults(league);

    // Ann: W 2-0 Bob, D 1-1 Cid, L 0-1 Dan -> GF 3 GA 2 GD +1, 5 + 2 + 1 = 8
    // Bob: L 0-2 Ann, W 3-0 Cid, D 2-2 Dan -> GF 5 GA 4 GD +1, 1 + 5 + 2 = 8
    // Cid: D 1-1 Ann, L 0-3 Bob (v Dan unplayed) -> GF 1 GA 4 GD -3, 2 + 1 = 3
    // Dan: W 1-0 Ann, D 2-2 Bob (v Cid unplayed) -> GF 3 GA 2 GD +1, 5 + 2 = 7
    // Bob and Ann are level on points and GD; Bob scored more (5 > 3).
    expect(await leaderboard(league)).toEqual([
      ["Bob", 1, 3, 1, 1, 1, 5, 4, 1, 8],
      ["Ann", 2, 3, 1, 1, 1, 3, 2, 1, 8],
      ["Dan", 3, 2, 1, 1, 0, 3, 2, 1, 7],
      ["Cid", 4, 2, 0, 1, 1, 1, 4, -3, 3],
    ]);
  });

  it("uses each tournament's own points: the same results under 3/1/0 give a different table", async () => {
    const league = await leagues.create(owner, PLAYERS, { win: 3, draw: 1, loss: 0 });
    await enterFiveResults(league);

    // Ann: 3 + 1 + 0 = 4; Bob: 0 + 3 + 1 = 4; Dan: 3 + 1 = 4; Cid: 1 + 0 = 1.
    // Bob leads on goals scored (5). Ann and Dan are level on points (4), GD (+1) and GF (3): shared rank 2.
    expect(await leaderboard(league)).toEqual([
      ["Bob", 1, 3, 1, 1, 1, 5, 4, 1, 4],
      ["Ann", 2, 3, 1, 1, 1, 3, 2, 1, 4],
      ["Dan", 2, 2, 1, 1, 0, 3, 2, 1, 4],
      ["Cid", 4, 2, 0, 1, 1, 1, 4, -3, 1],
    ]);
  });

  it("reflects an organizer correction on the very next read", async () => {
    const league = await leagues.create(owner, PLAYERS, { win: 5, draw: 2, loss: 1 });
    await enterFiveResults(league);

    // The organizer corrects Ann 0-1 Dan to Ann 2-1 Dan.
    const annDan = matchBetween(league, "Ann", "Dan");
    const correction = await owner.client
      .from("results")
      .update(annDan.orient(2, 1))
      .eq("match_id", annDan.id)
      .select();
    expect(correction.error).toBeNull();
    expect(correction.data).toHaveLength(1);

    // Ann: W 2-0 Bob, D 1-1 Cid, W 2-1 Dan -> GF 5 GA 2 GD +3, 5 + 2 + 5 = 12
    // Bob: unchanged -> GF 5 GA 4 GD +1, 8
    // Dan: L 1-2 Ann, D 2-2 Bob -> GF 3 GA 4 GD -1, 1 + 2 = 3
    // Cid: unchanged -> GF 1 GA 4 GD -3, 3. Dan and Cid are level on points; Dan's GD (-1) beats Cid's (-3).
    expect(await leaderboard(league)).toEqual([
      ["Ann", 1, 3, 2, 1, 0, 5, 2, 3, 12],
      ["Bob", 2, 3, 1, 1, 1, 5, 4, 1, 8],
      ["Dan", 3, 2, 0, 1, 1, 3, 4, -1, 3],
      ["Cid", 4, 2, 0, 1, 1, 1, 4, -3, 3],
    ]);
  });
});
