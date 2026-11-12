import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cupBracketPayload,
  cupCleanup,
  cupMatch,
  enterCupScore,
  enterScoreAsLinkHolder,
  leagueCleanup,
  matchBetween,
  readCupMatchSlots,
  readResultAs,
  signUpUser,
  type TestCup,
  type TestUser,
} from "./fixtures";
import { anonClient } from "./supabase-test-env";

/**
 * Risks #8 and #9 (context/foundation/test-plan.md) at the database, as anon and as two signed-in users:
 * cup creation, the cup branch of the anonymous score write, and the owner correction guard.
 *
 * Expected outcomes come from the PRD cup rules (FR-014..FR-018), not from the SQL. Entry order is the seed,
 * so the five players Ann, Bob, Cid, Dan, Eve are seeds 1..5. Worked out by hand for N = 5: S = 8, so 3 byes,
 * and they go to seeds 1, 2, 3 (Ann, Bob, Cid). Only seeds 4 and 5 play in round 1. The bracket is
 *
 *   position 1, round 1: Dan vs Eve          winner -> position 2, slot b
 *   position 2, round 2: Ann vs TBD          winner -> position 4, slot a      (seed 1 half)
 *   position 3, round 2: Bob vs Cid          winner -> position 4, slot b      (seed 2 half)
 *   position 4, round 3: TBD vs TBD          the final
 *
 * score_a belongs to slot a (first-named player of the pairing), score_b to slot b.
 */

const NAMES = ["Ann", "Bob", "Cid", "Dan", "Eve"];

/** The generated RPC types never allow null, but a direct caller can send it. */
const NULL_SCORE = null as unknown as number;

describe("cup bracket at the database (risks #8, #9)", () => {
  const cups = cupCleanup();
  const leagues = leagueCleanup();
  let owner: TestUser;
  let otherUser: TestUser;

  beforeAll(async () => {
    [owner, otherUser] = await Promise.all([signUpUser(), signUpUser()]);
  });

  afterAll(async () => {
    await cups.run();
    await leagues.run();
  });

  /** A fresh 5-player cup per test, so a control can never disturb a refusal. */
  const freshCup = () => cups.create(owner, NAMES);

  /** Owner correction of a stored result (a direct UPDATE through RLS, the only correction path). */
  const correct = (client: TestUser["client"], cup: TestCup, position: number, scoreA: number, scoreB: number) =>
    client
      .from("results")
      .update({ score_a: scoreA, score_b: scoreB })
      .eq("match_id", cupMatch(cup, position).id)
      .select();

  const storedResult = (cup: TestCup, position: number) => readResultAs(owner, cupMatch(cup, position).id);

  /** Slots of one position as read by the owner. */
  async function slots(cup: TestCup, position: number) {
    const all = await readCupMatchSlots(owner, cup);
    const found = all.find((m) => m.position === position);
    if (!found) throw new Error(`no match at position ${position}`);
    return found;
  }

  const storedWithName = async (name: string) => {
    const { data, error } = await owner.client.from("tournaments").select("id").eq("name", name);
    expect(error).toBeNull();
    return data ?? [];
  };

  describe("creation (risk #9)", () => {
    it("control: a 5-player cup is stored as the hand-worked bracket with 4 matches", async () => {
      const cup = await freshCup();

      // Round 1 holds only the one real pairing; the byes sit directly in their round-2 slots; later slots are TBD.
      expect(await readCupMatchSlots(owner, cup)).toEqual([
        { position: 1, round: 1, a: "Dan", b: "Eve", nextPosition: 2, nextSlot: "b" },
        { position: 2, round: 2, a: "Ann", b: null, nextPosition: 4, nextSlot: "a" },
        { position: 3, round: 2, a: "Bob", b: "Cid", nextPosition: 4, nextSlot: "b" },
        { position: 4, round: 3, a: null, b: null, nextPosition: null, nextSlot: null },
      ]);
    });

    const refuse = async (names: string[], bracket: unknown) => {
      const name = `IT refused cup ${randomUUID().slice(0, 8)}`;
      const result = await owner.client.rpc("create_cup", {
        p_name: name,
        p_players: names,
        p_bracket: bracket as never,
      });
      return { name, result };
    };

    it("refuses 2 players, and nothing is stored", async () => {
      const { name, result } = await refuse(["Ann", "Bob"], cupBracketPayload(3).slice(0, 1));

      expect(result.error?.code).toBe("22023");
      expect(await storedWithName(name)).toHaveLength(0);
    });

    it("refuses 21 players, and nothing is stored", async () => {
      const names = Array.from({ length: 21 }, (_, i) => `Player ${i + 1}`);
      // The generator throws above 20, so send the 20-player bracket: the count alone must be refused.
      const { name, result } = await refuse(names, cupBracketPayload(20));

      expect(result.error?.code).toBe("22023");
      expect(await storedWithName(name)).toHaveLength(0);
    });

    it("refuses a bracket with the wrong number of matches (N-1 expected), and nothing is stored", async () => {
      const tooFew = await refuse(NAMES, cupBracketPayload(5).slice(0, 3));
      const tooMany = await refuse(NAMES, [...cupBracketPayload(5), ...cupBracketPayload(3).slice(0, 1)]);

      expect(tooFew.result.error?.code).toBe("22023");
      expect(tooMany.result.error?.code).toBe("22023");
      expect(await storedWithName(tooFew.name)).toHaveLength(0);
      expect(await storedWithName(tooMany.name)).toHaveLength(0);
    });

    it("refuses a bracket that places a player twice, and nothing is stored", async () => {
      // Right count (4 matches), but Dan sits in two starting slots and Eve in none.
      const bracket = cupBracketPayload(5).map((m) => (m.position === 1 ? { ...m, b: 3 } : m));
      const { name, result } = await refuse(NAMES, bracket);

      expect(result.error).not.toBeNull();
      expect(await storedWithName(name)).toHaveLength(0);
    });

    it("refuses anon with permission denied, and nothing is stored", async () => {
      const name = `IT anon cup ${randomUUID().slice(0, 8)}`;
      const byAnon = await anonClient().rpc("create_cup", {
        p_name: name,
        p_players: NAMES,
        p_bracket: cupBracketPayload(5),
      });

      expect(byAnon.error?.code).toBe("42501");
      expect(await storedWithName(name)).toHaveLength(0);
      // Control: the same call as a signed-in user works (see the stored-bracket control above).
      expect((await freshCup()).matches).toHaveLength(4);
    });

    it("refuses two names that differ only by case (23505), and nothing is stored", async () => {
      const { name, result } = await refuse(["Ann", "ann", "Cid"], cupBracketPayload(3));

      expect(result.error?.code).toBe("23505");
      expect(await storedWithName(name)).toHaveLength(0);
    });

    it("refuses the owner adding a player or a match directly, leaving the cup unchanged", async () => {
      const cup = await freshCup();
      const before = await readCupMatchSlots(owner, cup);

      const player = await owner.client
        .from("players")
        .insert({ tournament_id: cup.tournamentId, name: "Late joiner" })
        .select("id");
      const match = await owner.client
        .from("matches")
        .insert({ tournament_id: cup.tournamentId, position: 99, round: 1 })
        .select("id");

      expect(player.error?.code).toBe("42501");
      expect(match.error?.code).toBe("42501");
      expect(await readCupMatchSlots(owner, cup)).toEqual(before);
      const { data: players } = await owner.client.from("players").select("id").eq("tournament_id", cup.tournamentId);
      expect(players).toHaveLength(5);
    });
  });

  describe("score entry (risk #8)", () => {
    it("fills the next slot with the winner of a round-1 match, in the right slot", async () => {
      const cup = await freshCup();

      expect(await enterCupScore(cup, 1, 3, 1)).toBe("created"); // Dan 3 - 1 Eve

      expect(await storedResult(cup, 1)).toEqual({ score_a: 3, score_b: 1 });
      expect(await slots(cup, 2)).toMatchObject({ a: "Ann", b: "Dan" });
    });

    it("moves the winner when the second-named player wins (Eve into slot b)", async () => {
      const cup = await freshCup();

      expect(await enterCupScore(cup, 1, 0, 2)).toBe("created"); // Dan 0 - 2 Eve

      expect(await slots(cup, 2)).toMatchObject({ a: "Ann", b: "Eve" });
    });

    it("sends a round-2 winner to the final's slot a or b according to its position", async () => {
      const cup = await freshCup();

      await enterCupScore(cup, 1, 3, 1); // Dan -> position 2, slot b
      expect(await enterCupScore(cup, 2, 2, 1)).toBe("created"); // Ann 2 - 1 Dan -> final slot a
      expect(await enterCupScore(cup, 3, 0, 4)).toBe("created"); // Bob 0 - 4 Cid -> final slot b

      expect(await slots(cup, 4)).toMatchObject({ a: "Ann", b: "Cid" });
    });

    it("refuses a draw with draw_not_allowed, stores nothing and advances nobody", async () => {
      const cup = await freshCup();
      const before = await readCupMatchSlots(owner, cup);

      expect(await enterCupScore(cup, 1, 2, 2)).toBe("draw_not_allowed");

      expect(await storedResult(cup, 1)).toBeNull();
      expect(await readCupMatchSlots(owner, cup)).toEqual(before);
      // Control: a decisive score for the same match is accepted.
      expect(await enterCupScore(cup, 1, 2, 1)).toBe("created");
      expect(await storedResult(cup, 1)).toEqual({ score_a: 2, score_b: 1 });
    });

    it("refuses a round-2 score while a slot is TBD with not_ready, storing nothing", async () => {
      const cup = await freshCup();

      expect(await enterCupScore(cup, 2, 1, 0)).toBe("not_ready"); // Ann vs TBD: Dan v Eve not played
      expect(await enterCupScore(cup, 4, 1, 0)).toBe("not_ready"); // the final: both slots TBD

      expect(await storedResult(cup, 2)).toBeNull();
      expect(await storedResult(cup, 4)).toBeNull();
      expect(await slots(cup, 4)).toMatchObject({ a: null, b: null });
      // Control: once Dan v Eve is played, position 2 is ready.
      await enterCupScore(cup, 1, 3, 1);
      expect(await enterCupScore(cup, 2, 1, 0)).toBe("created");
      expect(await storedResult(cup, 2)).toEqual({ score_a: 1, score_b: 0 });
    });

    it("keeps the first score when the same match is submitted again", async () => {
      const cup = await freshCup();

      expect(await enterCupScore(cup, 1, 3, 1)).toBe("created");
      expect(await enterCupScore(cup, 1, 0, 5)).toBe("already_entered");

      expect(await storedResult(cup, 1)).toEqual({ score_a: 3, score_b: 1 });
      expect(await slots(cup, 2)).toMatchObject({ b: "Dan" }); // the second (Eve-winning) submission advanced nobody
    });

    it("stores exactly one of two simultaneous submissions and advances the winner of the stored one", async () => {
      // Several cups, so one lucky interleaving cannot hide a check-then-insert race.
      for (let round = 0; round < 3; round++) {
        const cup = await freshCup();
        const payloads = [
          [3, 0],
          [0, 3],
        ] as const;

        const statuses = await Promise.all(
          payloads.map(([a, b]) =>
            anonClient()
              .rpc("submit_match_score", {
                p_token: cup.shareToken,
                p_match_id: cupMatch(cup, 1).id,
                p_score_a: a,
                p_score_b: b,
              })
              .then(({ data, error }) => {
                expect(error).toBeNull();
                return (data as { status: string }).status;
              }),
          ),
        );

        expect([...statuses].sort()).toEqual(["already_entered", "created"]);
        // Never assume call order: the stored score is the one whose call reported created.
        const [scoreA, scoreB] = statuses[0] === "created" ? payloads[0] : payloads[1];
        expect(await storedResult(cup, 1)).toEqual({ score_a: scoreA, score_b: scoreB });
        // Dan (slot a) wins 3-0, Eve (slot b) wins 0-3; the next slot holds whoever won the stored score.
        expect(await slots(cup, 2)).toMatchObject({ a: "Ann", b: statuses[0] === "created" ? "Dan" : "Eve" });
      }
    });

    it.each([
      ["below 0", -1, 0],
      ["above 99", 0, 100],
      ["missing", NULL_SCORE, 0],
    ])("rejects a score %s at the database and stores and advances nothing", async (_label, scoreA, scoreB) => {
      const cup = await freshCup();

      const { error } = await anonClient().rpc("submit_match_score", {
        p_token: cup.shareToken,
        p_match_id: cupMatch(cup, 1).id,
        p_score_a: scoreA,
        p_score_b: scoreB,
      });

      expect(error).not.toBeNull();
      expect(await storedResult(cup, 1)).toBeNull();
      expect(await slots(cup, 2)).toMatchObject({ b: null });
    });

    it("accepts both ends of the range, 0 and 99, and advances the winner", async () => {
      const cup = await freshCup();

      expect(await enterCupScore(cup, 3, 0, 99)).toBe("created"); // Bob 0 - 99 Cid

      expect(await storedResult(cup, 3)).toEqual({ score_a: 0, score_b: 99 });
      expect(await slots(cup, 4)).toMatchObject({ b: "Cid" });
    });

    it("refuses a match of another tournament with not_found, even though token and match id are both real", async () => {
      const cup = await freshCup();
      const foreign = await freshCup();

      const { data, error } = await anonClient().rpc("submit_match_score", {
        p_token: cup.shareToken,
        p_match_id: cupMatch(foreign, 1).id,
        p_score_a: 4,
        p_score_b: 0,
      });

      expect(error).toBeNull();
      expect(data).toEqual({ status: "not_found" });
      expect(await readResultAs(owner, cupMatch(foreign, 1).id)).toBeNull();
      expect(await slots(foreign, 2)).toMatchObject({ b: null });
      // Control: the right token for that match works.
      expect(await enterCupScore(foreign, 1, 4, 0)).toBe("created");
    });
  });

  describe("owner correction (risk #8)", () => {
    it("flipping the winner before the next round is played rewrites the next slot", async () => {
      const cup = await freshCup();
      await enterCupScore(cup, 1, 3, 1); // Dan wins -> position 2 slot b
      expect(await slots(cup, 2)).toMatchObject({ b: "Dan" });

      const flipped = await correct(owner.client, cup, 1, 1, 3); // now Eve wins

      expect(flipped.error).toBeNull();
      expect(flipped.data).toHaveLength(1);
      expect(await storedResult(cup, 1)).toEqual({ score_a: 1, score_b: 3 });
      expect(await slots(cup, 2)).toMatchObject({ a: "Ann", b: "Eve" });
    });

    it("flipping the winner after the next round was played is refused, leaving everything unchanged", async () => {
      const cup = await freshCup();
      await enterCupScore(cup, 1, 3, 1); // Dan wins
      await enterCupScore(cup, 2, 0, 2); // Ann 0 - 2 Dan: the next round is played
      await enterCupScore(cup, 3, 2, 0); // Bob 2 - 0 Cid (control match: next round not played)
      const before = await readCupMatchSlots(owner, cup);

      const refused = await correct(owner.client, cup, 1, 1, 3);

      expect(refused.error?.code).toBe("55000");
      expect(refused.error?.message).toContain("cup_next_round_played");
      expect(await storedResult(cup, 1)).toEqual({ score_a: 3, score_b: 1 });
      expect(await storedResult(cup, 2)).toEqual({ score_a: 0, score_b: 2 });
      expect(await readCupMatchSlots(owner, cup)).toEqual(before);
      // Control: a flip whose next round is not yet played still works (Bob v Cid -> final slot b).
      const control = await correct(owner.client, cup, 3, 0, 2);
      expect(control.error).toBeNull();
      expect(control.data).toHaveLength(1);
      expect(await slots(cup, 4)).toMatchObject({ a: "Dan", b: "Cid" });
    });

    it("correcting without changing the winner is allowed even after the next round was played", async () => {
      const cup = await freshCup();
      await enterCupScore(cup, 1, 3, 1); // Dan wins
      await enterCupScore(cup, 2, 0, 2); // next round played

      const corrected = await correct(owner.client, cup, 1, 4, 1); // still Dan

      expect(corrected.error).toBeNull();
      expect(corrected.data).toHaveLength(1);
      expect(await storedResult(cup, 1)).toEqual({ score_a: 4, score_b: 1 });
      expect(await slots(cup, 2)).toMatchObject({ a: "Ann", b: "Dan" });
    });

    it("correcting to a draw is refused (23514) and the stored score is unchanged", async () => {
      const cup = await freshCup();
      await enterCupScore(cup, 1, 3, 1);

      const refused = await correct(owner.client, cup, 1, 2, 2);

      expect(refused.error?.code).toBe("23514");
      expect(await storedResult(cup, 1)).toEqual({ score_a: 3, score_b: 1 });
      expect(await slots(cup, 2)).toMatchObject({ b: "Dan" });
      // Control: a decisive correction of the same match works.
      expect((await correct(owner.client, cup, 1, 5, 1)).data).toHaveLength(1);
    });

    it("is refused for a different signed-in user and for anon (0 rows), leaving the cup unchanged", async () => {
      const cup = await freshCup();
      await enterCupScore(cup, 1, 3, 1);
      const before = await readCupMatchSlots(owner, cup);

      const byOther = await correct(otherUser.client, cup, 1, 1, 3);
      const byAnon = await correct(anonClient(), cup, 1, 1, 3);

      expect(byOther.data ?? []).toHaveLength(0);
      expect(byAnon.data ?? []).toHaveLength(0);
      expect(await storedResult(cup, 1)).toEqual({ score_a: 3, score_b: 1 });
      expect(await readCupMatchSlots(owner, cup)).toEqual(before);
      // Control: the owner's identical flip works.
      expect((await correct(owner.client, cup, 1, 1, 3)).data).toHaveLength(1);
      expect(await slots(cup, 2)).toMatchObject({ b: "Eve" });
    });
  });

  describe("playing a whole cup", () => {
    it("stores the final once every earlier match is played, and nothing else needs to advance", async () => {
      const cup = await freshCup();

      expect(await enterCupScore(cup, 1, 3, 1)).toBe("created"); // Dan beats Eve
      expect(await enterCupScore(cup, 2, 1, 2)).toBe("created"); // Ann 1 - 2 Dan
      expect(await enterCupScore(cup, 3, 2, 0)).toBe("created"); // Bob beats Cid
      expect(await slots(cup, 4)).toMatchObject({ a: "Dan", b: "Bob" });
      expect(await enterCupScore(cup, 4, 1, 0)).toBe("created"); // Dan 1 - 0 Bob: Dan is the champion

      expect(await storedResult(cup, 4)).toEqual({ score_a: 1, score_b: 0 });
      for (const position of [1, 2, 3, 4]) expect(await storedResult(cup, position)).not.toBeNull();
      // Nothing advanced out of the final: all four matches keep exactly their slots.
      expect(await readCupMatchSlots(owner, cup)).toEqual([
        { position: 1, round: 1, a: "Dan", b: "Eve", nextPosition: 2, nextSlot: "b" },
        { position: 2, round: 2, a: "Ann", b: "Dan", nextPosition: 4, nextSlot: "a" },
        { position: 3, round: 2, a: "Bob", b: "Cid", nextPosition: 4, nextSlot: "b" },
        { position: 4, round: 3, a: "Dan", b: "Bob", nextPosition: null, nextSlot: null },
      ]);
    });
  });

  describe("shared read and the league path", () => {
    it("get_shared_league as anon reports format cup and exposes no owner id, tournament id or token", async () => {
      const cup = await freshCup();
      await enterCupScore(cup, 1, 3, 1);

      const { data, error } = await anonClient().rpc("get_shared_league", { p_token: cup.shareToken });

      expect(error).toBeNull();
      const shared = data as {
        league: Record<string, unknown>;
        players: Record<string, unknown>[];
        matches: Record<string, unknown>[];
      };
      expect(Object.keys(shared).sort()).toEqual(["league", "matches", "players"]);
      expect(shared.league.format).toBe("cup");
      expect(Object.keys(shared.league)).not.toEqual(expect.arrayContaining(["owner_id"]));
      expect(Object.keys(shared.league).sort()).toEqual(
        ["format", "name", "points_draw", "points_loss", "points_win"].sort(),
      );
      const raw = JSON.stringify(data);
      expect(raw).not.toContain("owner_id");
      expect(raw).not.toContain("share_token");
      expect(raw).not.toContain(cup.tournamentId);
      expect(raw).not.toContain(cup.shareToken);
      // Round per position as worked out by hand: 1, 2, 2, 3; the TBD slot is null, not a player id.
      expect(shared.matches.map((m) => m.round)).toEqual([1, 2, 2, 3]);
      expect(shared.matches[3]).toMatchObject({ player_a_id: null, player_b_id: null });
      expect(shared.matches[0]).toMatchObject({ score_a: 3, score_b: 1 });
    });

    it("a league correction to a draw still works (league behaviour unchanged)", async () => {
      const league = await leagues.create(owner, ["Ann", "Bob", "Cid"]);
      await enterScoreAsLinkHolder(league, "Ann", 2, 0, "Bob");
      const match = matchBetween(league, "Ann", "Bob");

      const corrected = await owner.client
        .from("results")
        .update({ score_a: 2, score_b: 2 })
        .eq("match_id", match.id)
        .select();

      expect(corrected.error).toBeNull();
      expect(corrected.data).toHaveLength(1);
      expect(await readResultAs(owner, match.id)).toEqual({ score_a: 2, score_b: 2 });
      const shared = await anonClient().rpc("get_shared_league", { p_token: league.shareToken });
      expect((shared.data as { league: { format: string } }).league.format).toBe("league");
    });
  });
});
