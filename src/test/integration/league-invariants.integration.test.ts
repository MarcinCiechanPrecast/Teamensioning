import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteLeagueAs, leagueCleanup, signUpUser, type TestUser } from "./fixtures";

/**
 * Risk #6 (context/foundation/test-plan.md): PRD Guardrail 2 "every pair of players meets exactly once", FR-003
 * "names must be unique within a tournament", FR-007, and the non-goal "no changes to the player list after
 * creation". The database is the last guard, so these tests call create_league directly with input the app's
 * zod schema and fixture generator would never send, and check that nothing is stored.
 *
 * Expected error classes are Postgres semantics, not app strings: 23505 unique violation, 22023 invalid
 * parameter (raised by create_league), 23514 check violation, 42501 row-level security violation.
 */

interface Pair {
  a: number;
  b: number;
}

/** Every unordered pair of n players once: (i, j) for every i < j. Deliberately not the app's generator. */
function allPairs(n: number): Pair[] {
  const pairs: Pair[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push({ a, b });
  return pairs;
}

function names(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Player ${i + 1}`);
}

describe("league invariants at the database (risk #6)", () => {
  const leagues = leagueCleanup();
  const stray: string[] = [];
  let owner: TestUser;

  beforeAll(async () => {
    owner = await signUpUser();
  });

  afterAll(async () => {
    await leagues.run();
    await Promise.all(stray.splice(0).map((id) => deleteLeagueAs(owner, id)));
  });

  /** Calls create_league directly; a league that does get created is registered for cleanup. */
  async function createRaw(players: string[], fixtures: Pair[]) {
    const name = `IT invariant ${randomUUID().slice(0, 8)}`;
    const result = await owner.client.rpc("create_league", {
      p_name: name,
      p_points_win: 3,
      p_points_draw: 1,
      p_points_loss: 0,
      p_players: players,
      p_fixtures: fixtures,
    });
    if (typeof result.data === "string") stray.push(result.data);
    return { ...result, name };
  }

  /** The owner's tournaments with this name: a refused create_league must leave none (one transaction). */
  async function storedWithName(name: string) {
    const { data, error } = await owner.client.from("tournaments").select("id").eq("name", name);
    expect(error).toBeNull();
    return data ?? [];
  }

  async function expectRefused(players: string[], fixtures: Pair[], code: string) {
    const result = await createRaw(players, fixtures);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe(code);
    expect(await storedWithName(result.name)).toHaveLength(0);
  }

  describe("player names", () => {
    it("refuses two names that differ only by case", async () => {
      await expectRefused(["Ann", "ann", "Bob"], allPairs(3), "23505");
    });

    it("refuses two names that differ only by surrounding spaces", async () => {
      await expectRefused(["Ann", "  Ann ", "Bob"], allPairs(3), "23505");
    });

    it("control: distinct names are stored, trimmed", async () => {
      const result = await createRaw(["Ann", " Bob ", "Cid"], allPairs(3));
      expect(result.error).toBeNull();
      if (typeof result.data !== "string") throw new Error("create_league returned no id");
      const { data } = await owner.client.from("players").select("name").eq("tournament_id", result.data);
      expect((data ?? []).map((p) => p.name).sort()).toEqual(["Ann", "Bob", "Cid"]);
    });
  });

  describe("player count (3-20)", () => {
    it("refuses 2 players", async () => {
      await expectRefused(names(2), allPairs(2), "22023");
    });

    it("refuses 21 players", async () => {
      await expectRefused(names(21), allPairs(21), "22023");
    });

    it("control: 20 players with all 190 pairings are stored", async () => {
      const result = await createRaw(names(20), allPairs(20));
      expect(result.error).toBeNull();
    });
  });

  describe("pairings: every pair exactly once", () => {
    // 4 players -> 4 * 3 / 2 = 6 pairings.
    it("refuses one pairing too few", async () => {
      await expectRefused(names(4), allPairs(4).slice(0, 5), "22023");
    });

    it("refuses one pairing too many", async () => {
      await expectRefused(names(4), [...allPairs(4), { a: 0, b: 1 }], "22023");
    });

    it("refuses the right count with one pair repeated and another missing", async () => {
      // (0,1) twice, (2,3) never: the count check alone would accept this.
      const fixtures = [...allPairs(4).filter((p) => !(p.a === 2 && p.b === 3)), { a: 0, b: 1 }];
      expect(fixtures).toHaveLength(6);
      await expectRefused(names(4), fixtures, "23505");
    });

    it("refuses the same pair written in reverse order", async () => {
      const fixtures = [...allPairs(4).filter((p) => !(p.a === 2 && p.b === 3)), { a: 1, b: 0 }];
      await expectRefused(names(4), fixtures, "23505");
    });

    it("refuses a player paired with themself", async () => {
      const fixtures = [...allPairs(4).filter((p) => !(p.a === 2 && p.b === 3)), { a: 2, b: 2 }];
      await expectRefused(names(4), fixtures, "23514");
    });

    it("control: a stored 5-player league has 10 matches covering every pair once", async () => {
      const league = await leagues.create(owner, names(5));
      const { data, error } = await owner.client
        .from("matches")
        .select("player_a_id, player_b_id")
        .eq("tournament_id", league.tournamentId);
      expect(error).toBeNull();
      const pairs = new Set((data ?? []).map((m) => [m.player_a_id, m.player_b_id].sort().join("|")));
      // 5 * 4 / 2 = 10 distinct pairs, and 10 rows: no duplicates, none missing.
      expect(data).toHaveLength(10);
      expect(pairs.size).toBe(10);
    });
  });

  // PRD Non-Goals: "No changes to the player list after creation". create_league is the only way to write a league.
  describe("no rows added after creation", () => {
    // A late player would have no fixtures at all, so "every pair meets exactly once" would silently break.
    it("refuses the owner adding a player to an existing league", async () => {
      const league = await leagues.create(owner, ["Ann", "Bob", "Cid"]);

      const player = await owner.client
        .from("players")
        .insert({ tournament_id: league.tournamentId, name: "Late joiner" })
        .select("id");
      expect(player.error?.code).toBe("42501");

      const { data: players } = await owner.client
        .from("players")
        .select("id")
        .eq("tournament_id", league.tournamentId);
      expect(players).toHaveLength(3);
    });

    it("refuses the owner adding a match to an existing league", async () => {
      const league = await leagues.create(owner, ["Ann", "Bob", "Cid"]);
      const [first] = league.matches;

      // Even a repeat of an existing pairing must be refused by access control, not only by the pair index (23505).
      const match = await owner.client
        .from("matches")
        .insert({
          tournament_id: league.tournamentId,
          position: 99,
          player_a_id: first.playerBId,
          player_b_id: first.playerAId,
        })
        .select("id");
      expect(match.error?.code).toBe("42501");

      const { data: matches } = await owner.client
        .from("matches")
        .select("id")
        .eq("tournament_id", league.tournamentId);
      expect(matches).toHaveLength(3);
    });

    it("refuses creating a bare tournament without create_league (no players, no fixtures)", async () => {
      const name = `IT bare ${randomUUID().slice(0, 8)}`;
      const bare = await owner.client
        .from("tournaments")
        .insert({ name, points_win: 3, points_draw: 1, points_loss: 0 })
        .select("id");
      for (const row of bare.data ?? []) stray.push(row.id);

      expect(bare.error?.code).toBe("42501");
      expect(await storedWithName(name)).toHaveLength(0);
    });
  });
});
