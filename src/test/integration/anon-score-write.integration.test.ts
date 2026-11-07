import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leagueCleanup, readResultAs, signUpUser, type TestLeague, type TestUser } from "./fixtures";
import { anonClient } from "./supabase-test-env";

/**
 * Risks #1 and #4 (context/foundation/test-plan.md): the anonymous write path, exercised directly against
 * the database with the public anon key — the surface a link holder can reach without the UI, the endpoint
 * or zod. Expected outcomes come from the product rules, not from the SQL:
 *   - the first submission wins; a link holder cannot change an entered score (PRD FR-009, US-01 AC)
 *   - a link grants access to one tournament only (roadmap S-03)
 *   - scores are whole numbers from 0 to 99 (S-04 decision, shown to users in SCORE_ERROR_MESSAGES)
 * Every outcome is confirmed by the owner reading the stored result back.
 */

type SubmitStatus = "created" | "already_entered" | "not_found";

async function submitAsAnon(token: string, matchId: string, scoreA: number, scoreB: number) {
  const { data, error } = await anonClient().rpc("submit_match_score", {
    p_token: token,
    p_match_id: matchId,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });
  return { status: (data as { status?: SubmitStatus } | null)?.status, error };
}

/** The generated RPC types never allow null, but a direct caller can send it. */
const NULL_SCORE = null as unknown as number;

describe("anonymous score write path (risks #1, #4)", () => {
  const leagues = leagueCleanup();
  let owner: TestUser;
  let otherOwner: TestUser;
  let league: TestLeague; // 5 players -> 10 matches, one per scenario below
  let otherLeague: TestLeague;

  beforeAll(async () => {
    [owner, otherOwner] = await Promise.all([signUpUser(), signUpUser()]);
    [league, otherLeague] = await Promise.all([
      leagues.create(owner, ["Anna", "Bartek", "Celina", "Darek", "Ewa"]),
      leagues.create(otherOwner, ["Franek", "Gosia", "Henryk"]),
    ]);
  });

  afterAll(() => leagues.run());

  const match = (index: number) => {
    const id = league.matchIds[index];
    if (!id) throw new Error(`fixture league has no match #${index}`);
    return id;
  };

  describe("risk #1: a score is written once", () => {
    it("keeps the first score when the same match is submitted again", async () => {
      const first = await submitAsAnon(league.shareToken, match(0), 2, 1);
      const second = await submitAsAnon(league.shareToken, match(0), 5, 5);

      expect(first).toEqual({ status: "created", error: null });
      expect(second).toEqual({ status: "already_entered", error: null });
      expect(await readResultAs(owner, match(0))).toEqual({ score_a: 2, score_b: 1 });
    });

    it("stores exactly one of two simultaneous submissions, and it is the one reported as created", async () => {
      // Several matches, so one lucky interleaving cannot hide a check-then-insert race.
      for (const index of [1, 2, 3]) {
        const payloads = [
          [3, 0],
          [0, 3],
        ] as const;
        const outcomes = await Promise.all(
          payloads.map(([a, b]) => submitAsAnon(league.shareToken, match(index), a, b)),
        );

        expect(outcomes.map((o) => o.error)).toEqual([null, null]);
        expect(outcomes.map((o) => o.status).sort()).toEqual(["already_entered", "created"]);

        // The winner is whichever call got "created" (exactly one did, asserted above) — never assume call order.
        const [winnerA, winnerB] = outcomes[0]?.status === "created" ? payloads[0] : payloads[1];
        expect(await readResultAs(owner, match(index))).toEqual({ score_a: winnerA, score_b: winnerB });
      }
    });

    it("refuses a direct anonymous insert into results", async () => {
      const { error } = await anonClient()
        .from("results")
        .insert({ match_id: match(4), score_a: 1, score_b: 0 });

      expect(error).not.toBeNull();
      expect(await readResultAs(owner, match(4))).toBeNull();
    });

    it("refuses a direct anonymous update or delete of an entered result", async () => {
      expect((await submitAsAnon(league.shareToken, match(5), 1, 1)).status).toBe("created");

      const updated = await anonClient()
        .from("results")
        .update({ score_a: 9, score_b: 9 })
        .eq("match_id", match(5))
        .select();
      const deleted = await anonClient().from("results").delete().eq("match_id", match(5)).select();

      // An RLS refusal is "0 rows", not necessarily an error: the read-back is the proof.
      expect(updated.data ?? []).toHaveLength(0);
      expect(deleted.data ?? []).toHaveLength(0);
      expect(await readResultAs(owner, match(5))).toEqual({ score_a: 1, score_b: 1 });
    });
  });

  describe("risk #4: a link writes only valid scores into its own tournament", () => {
    it("refuses a match of another tournament even though token and match id are both real", async () => {
      const foreignMatch = otherLeague.matchIds[0] ?? "";

      const outcome = await submitAsAnon(league.shareToken, foreignMatch, 4, 0);

      expect(outcome).toEqual({ status: "not_found", error: null });
      expect(await readResultAs(otherOwner, foreignMatch)).toBeNull();
    });

    it.each([
      ["above 99", 100, 0],
      ["below 0", -1, 0],
      ["missing", NULL_SCORE, 0],
      ["missing on the other side", 0, NULL_SCORE],
    ])("rejects a score %s at the database and stores nothing", async (_label, scoreA, scoreB) => {
      const outcome = await submitAsAnon(league.shareToken, match(6), scoreA, scoreB);

      expect(outcome.error).not.toBeNull();
      expect(await readResultAs(owner, match(6))).toBeNull();
    });

    it("accepts both ends of the range, 0 and 99", async () => {
      const outcome = await submitAsAnon(league.shareToken, match(7), 0, 99);

      expect(outcome).toEqual({ status: "created", error: null });
      expect(await readResultAs(owner, match(7))).toEqual({ score_a: 0, score_b: 99 });
    });

    it("refuses a well-formed token that belongs to no tournament", async () => {
      const unknownToken = randomBytes(32).toString("hex");

      const outcome = await submitAsAnon(unknownToken, match(8), 1, 0);

      expect(outcome).toEqual({ status: "not_found", error: null });
      expect(await readResultAs(owner, match(8))).toBeNull();
    });
  });
});
