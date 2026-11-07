import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leagueCleanup, signUpUser, type TestLeague } from "./fixtures";
import { anonClient } from "./supabase-test-env";

// Proves the fixtures build a real league that a link holder can reach, before any risk test relies on them.
describe("integration harness", () => {
  const leagues = leagueCleanup();
  let league: TestLeague;

  beforeAll(async () => {
    const owner = await signUpUser();
    league = await leagues.create(owner, ["Anna", "Bartek", "Celina", "Darek"]);
  });

  afterAll(() => leagues.run());

  it("creates every pairing for 4 players (PRD US-01: 4 players -> 6 matches)", () => {
    expect(league.matchIds).toHaveLength(6);
    expect(league.shareToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lets an anonymous link holder read the league through its share token", async () => {
    const { data, error } = await anonClient().rpc("get_shared_league", { p_token: league.shareToken });

    expect(error).toBeNull();
    const shared = data as { players: unknown[]; matches: { id: string }[] } | null;
    expect(shared?.players).toHaveLength(4);
    expect(shared?.matches.map((m) => m.id)).toEqual(league.matchIds);
  });
});
