// Seed / verify a LOCAL Supabase with realistic league (and, when the schema has them, cup) data through the public surface the app uses
// (anon key, sign-up, RPCs, owner RLS reads). Used by the CI `migration-upgrade` job (test-plan risk #7):
//   1. seed against the previous release's schema,
//   2. apply the PR's new migrations,
//   3. verify the seeded data survived and the write path still works on it.
//
// Usage: SUPABASE_URL=... SUPABASE_KEY=<anon key> node scripts/seed-db.mjs <seed|verify|cleanup> <snapshot.json>
// Reads SUPABASE_* from the environment, falling back to .env in the current directory.
//
// Keep it compatible with the deployed schema: the job runs the PREVIOUS release's copy of this file
// when one exists, so a change here takes effect for seeding one release later. Cup steps are skipped
// (with a logged line) when the schema has no create_cup.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const [mode, snapshotPath] = process.argv.slice(2);
if (!["seed", "verify", "cleanup"].includes(mode) || !snapshotPath) {
  console.error("Usage: node scripts/seed-db.mjs <seed|verify|cleanup> <snapshot.json>");
  process.exit(64);
}

function loadDotEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^\s*(SUPABASE_URL|SUPABASE_KEY)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
// Same guard as the integration suite: seeding signs up users that cannot be removed without an admin key.
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  console.error(`seed-db: refusing to run against a non-local SUPABASE_URL (${JSON.stringify(url)}).`);
  process.exit(1);
}
if (!key) {
  console.error("seed-db: SUPABASE_KEY (anon key) is not set.");
  process.exit(1);
}

const client = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

function must(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}`, { cause: error });
  return data;
}

function check(label, condition, detail = "") {
  if (!condition) throw new Error(`verify: ${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ok  ${label}`);
}

/** Every pair once, as {a, b} player indexes (create_league only checks count, range and uniqueness). */
function roundRobin(n) {
  const pairs = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push({ a, b });
  return pairs;
}

/**
 * Single-elimination bracket for n players (3-20), entry order = seed. Plain-JS twin of generateBracket
 * (src/lib/services/bracket.ts), kept inline because this script has no build step. Returns the
 * snake_case shape create_cup takes: {round, position, a, b, next_position, next_slot}.
 */
function cupBracket(n) {
  let size = 1;
  while (size < n) size *= 2;
  let order = [1];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, total - seed]);
  }
  const matches = [];
  const create = (round, a, b) => {
    const match = { round, position: matches.length + 1, a, b, next_position: null, next_slot: null };
    matches.push(match);
    return match;
  };
  let current = [];
  for (let i = 0; i < size; i += 2) {
    const a = order[i] - 1;
    const b = order[i + 1] - 1;
    current.push(b >= n ? { player: a } : { match: create(1, a, b) });
  }
  for (let round = 2; current.length > 1; round++) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1];
      const match = create(round, "player" in left ? left.player : null, "player" in right ? right.player : null);
      if ("match" in left) Object.assign(left.match, { next_position: match.position, next_slot: "a" });
      if ("match" in right) Object.assign(right.match, { next_position: match.position, next_slot: "b" });
      next.push({ match });
    }
    current = next;
  }
  return matches;
}

/** True when the schema has create_cup. Probed as anon with empty input: PGRST202/404 = no such function. */
async function supportsCups() {
  const { error, status } = await client().rpc("create_cup", { p_name: "probe", p_players: [], p_bracket: [] });
  if (!error) throw new Error("create_cup probe succeeded as anon, which must be refused");
  return !(error.code === "PGRST202" || status === 404);
}

async function signUp(label) {
  const c = client();
  const email = `seed-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `Seed-${randomUUID()}`;
  const data = must(`signUp ${label}`, await c.auth.signUp({ email, password }));
  if (!data.session) throw new Error("signUp returned no session — is email confirmation enabled locally?");
  return { c, owner: { email, password } };
}

async function signIn({ email, password }) {
  const c = client();
  must(`signIn ${email}`, await c.auth.signInWithPassword({ email, password }));
  return c;
}

async function createLeague(c, { name, points, players }) {
  const [win, draw, loss] = points;
  const id = must(
    `create_league ${name}`,
    await c.rpc("create_league", {
      p_name: name,
      p_points_win: win,
      p_points_draw: draw,
      p_points_loss: loss,
      p_players: players,
      p_fixtures: roundRobin(players.length),
    }),
  );
  const { share_token } = must("read token", await c.from("tournaments").select("share_token").eq("id", id).single());
  const matches = must("read matches", await c.from("matches").select("id").eq("tournament_id", id).order("position"));
  return { id, token: share_token, matchIds: matches.map((m) => m.id) };
}

async function createCup(c, { name, players }) {
  const id = must(
    `create_cup ${name}`,
    await c.rpc("create_cup", { p_name: name, p_players: players, p_bracket: cupBracket(players.length) }),
  );
  const { share_token } = must("read token", await c.from("tournaments").select("share_token").eq("id", id).single());
  const matches = must("read matches", await c.from("matches").select("id").eq("tournament_id", id).order("position"));
  // matchIds[position - 1], like a league.
  return { id, token: share_token, matchIds: matches.map((m) => m.id), format: "cup" };
}

/** The cup's slots as player names by position (index 0 = position 1); null = TBD. */
async function cupSlots(c, cup) {
  const players = must("read players", await c.from("players").select("id, name").eq("tournament_id", cup.id));
  const name = (id) => (id ? players.find((p) => p.id === id).name : null);
  const matches = must(
    "read matches",
    await c.from("matches").select("player_a_id, player_b_id").eq("tournament_id", cup.id).order("position"),
  );
  return matches.map((m) => [name(m.player_a_id), name(m.player_b_id)]);
}

async function submit(token, matchId, a, b) {
  const result = must(
    "submit_match_score",
    await client().rpc("submit_match_score", {
      p_token: token,
      p_match_id: matchId,
      p_score_a: a,
      p_score_b: b,
    }),
  );
  return result.status;
}

/** Deterministic but varied scores (draws included). */
const scoreFor = (i) => [(i * 7) % 5, (i * 3) % 4];

/** Everything an owner can read, as plain sorted rows, plus the anon view of each share link. */
async function readOwnerData(c, tokens, cupColumns) {
  // Cup columns only exist once the schema has them; an older schema must not be asked for them.
  const tournaments = must(
    "read tournaments",
    await c
      .from("tournaments")
      .select(`id, name, points_win, points_draw, points_loss, share_token${cupColumns ? ", format" : ""}`)
      .order("id"),
  );
  const players = must("read players", await c.from("players").select("id, tournament_id, name").order("id"));
  const matches = must(
    "read matches",
    await c
      .from("matches")
      .select(
        `id, tournament_id, position, player_a_id, player_b_id${cupColumns ? ", round, next_match_id, next_slot" : ""}`,
      )
      .order("id"),
  );
  const results = must("read results", await c.from("results").select("match_id, score_a, score_b").order("match_id"));
  const shared = {};
  for (const token of tokens) {
    shared[token] = must("get_shared_league", await client().rpc("get_shared_league", { p_token: token }));
  }
  return { tournaments, players, matches, results, shared };
}

/** `expected` is contained in `actual`: extra columns / JSON keys from an additive migration are fine. */
function isSubset(expected, actual) {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) && expected.length === actual.length && expected.every((e, i) => isSubset(e, actual[i]))
    );
  }
  if (expected && typeof expected === "object") {
    return (
      Boolean(actual) &&
      typeof actual === "object" &&
      Object.keys(expected).every((k) => isSubset(expected[k], actual[k]))
    );
  }
  return isDeepStrictEqual(expected, actual);
}

async function seed() {
  const owners = [];

  // Owner 1: a finished small league with a correction, and a partially played one with custom points.
  const o1 = await signUp("o1");
  const finished = await createLeague(o1.c, {
    name: "Friday Five-a-side",
    points: [3, 1, 0],
    players: ["Anna", "Bartek", "Celina", "Darek"],
  });
  for (const [i, m] of finished.matchIds.entries()) await submit(finished.token, m, ...scoreFor(i));
  must(
    "owner correction",
    await o1.c.from("results").update({ score_a: 9, score_b: 0 }).eq("match_id", finished.matchIds[0]).select(),
  );
  const custom = await createLeague(o1.c, {
    name: "Office Cup",
    points: [2, 1, 0],
    players: ["Ewa", "Franek", "Gosia", "Henryk", "Iza", "Janek"],
  });
  for (const [i, m] of custom.matchIds.slice(0, 5).entries()) await submit(custom.token, m, ...scoreFor(i + 1));
  const renamed = must(
    "update_tournament_settings",
    await o1.c.rpc("update_tournament_settings", {
      p_tournament_id: custom.id,
      p_name: "Office Cup 2026",
      p_points_win: null,
      p_points_draw: null,
      p_points_loss: null,
    }),
  );
  if (renamed.status !== "updated") throw new Error(`rename returned ${JSON.stringify(renamed)}`);
  owners.push({ ...o1.owner, leagues: [finished, custom] });

  // Owner 2: an unplayed league, and a league that is created then deleted.
  const o2 = await signUp("o2");
  const fresh = await createLeague(o2.c, {
    name: "Sunday League",
    points: [3, 1, 0],
    players: ["Kasia", "Leon", "Marta"],
  });
  const doomed = await createLeague(o2.c, {
    name: "Deleted League",
    points: [3, 1, 0],
    players: ["Ola", "Piotr", "Rafał"],
  });
  for (const [i, m] of doomed.matchIds.entries()) await submit(doomed.token, m, ...scoreFor(i));
  must("delete league", await o2.c.from("tournaments").delete().eq("id", doomed.id).select());
  owners.push({ ...o2.owner, leagues: [fresh], deleted: doomed });

  // Owner 3: the largest league (20 players, 190 matches), non-ASCII and mixed-case names, partially played.
  const o3 = await signUp("o3");
  const names = ["Łukasz", "Żaneta", "Ścibor", "Ćwirek", "Ąda", "józef", "Ēriks", "Zoë", "O'Brien", "Anne-Marie"];
  const big = await createLeague(o3.c, {
    name: "Wielka Liga — sezon 1",
    points: [3, 1, 0],
    players: [...names, ...Array.from({ length: 10 }, (_, i) => `Gracz ${i + 1}`)],
  });
  for (const [i, m] of big.matchIds.slice(0, 60).entries()) await submit(big.token, m, ...scoreFor(i));
  owners.push({ ...o3.owner, leagues: [big] });

  // Owner 4: cups (5 players = 3 byes, S = 8). Skipped when the schema predates the cup format.
  const cupSupported = await supportsCups();
  if (cupSupported) {
    const o4 = await signUp("o4");
    // Partial: Dan 2-1 Eve, corrected to 1-2 before round 2 is played, so Eve sits in position 2.
    const partial = await createCup(o4.c, { name: "Spring Cup", players: ["Ann", "Bob", "Cid", "Dan", "Eve"] });
    check("seed: first cup score is created", (await submit(partial.token, partial.matchIds[0], 2, 1)) === "created");
    const flipped = must(
      "cup correction",
      await o4.c.from("results").update({ score_a: 1, score_b: 2 }).eq("match_id", partial.matchIds[0]).select(),
    );
    check("seed: cup correction before round 2 is accepted", flipped.length === 1);
    check("seed: cup draw is refused", (await submit(partial.token, partial.matchIds[2], 1, 1)) === "draw_not_allowed");
    check(
      "seed: partial cup has Eve in position 2",
      isDeepStrictEqual((await cupSlots(o4.c, partial))[1], ["Ann", "Eve"]),
    );

    // Finished: Wes 2-1 Xan, Tom 0-1 Wes, Uma 3-0 Vic, final Wes 2-4 Uma -> Uma is the champion.
    const done = await createCup(o4.c, { name: "Autumn Cup", players: ["Tom", "Uma", "Vic", "Wes", "Xan"] });
    const finished = [
      [0, 2, 1],
      [1, 0, 1],
      [2, 3, 0],
      [3, 2, 4],
    ];
    for (const [i, a, b] of finished) {
      check(
        `seed: finished cup match ${i + 1} is created`,
        (await submit(done.token, done.matchIds[i], a, b)) === "created",
      );
    }
    const refused = await o4.c
      .from("results")
      .update({ score_a: 1, score_b: 2 })
      .eq("match_id", done.matchIds[0])
      .select();
    check("seed: flipping a winner after round 2 was played is refused", refused.error?.code === "55000");
    owners.push({ ...o4.owner, leagues: [partial, done] });
  } else {
    console.log("seed-db: schema has no create_cup, skipping cup seeding");
  }

  const snapshot = [];
  for (const o of owners) {
    const c = await signIn(o);
    snapshot.push({
      ...o,
      data: await readOwnerData(
        c,
        o.leagues.map((l) => l.token),
        cupSupported,
      ),
    });
  }
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  const count = (k) => snapshot.reduce((n, o) => n + o.data[k].length, 0);
  console.log(
    `seed-db: seeded ${owners.length} owners, ${count("tournaments")} tournaments, ${count("players")} players, ` +
      `${count("matches")} matches, ${count("results")} results → ${snapshotPath}`,
  );
}

async function verify() {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  console.log("seed-db: verifying seeded data after the upgrade");
  // The snapshot only holds cup columns when it was seeded on a cup-capable schema.
  const cupColumns = snapshot.some((o) => o.data.tournaments.some((t) => "format" in t));
  const cupSupported = await supportsCups();
  for (const o of snapshot) {
    const c = await signIn(o);
    const now = await readOwnerData(
      c,
      o.leagues.map((l) => l.token),
      cupColumns,
    );
    for (const k of ["tournaments", "players", "matches", "results", "shared"]) {
      check(`${o.email}: ${k} unchanged`, isSubset(o.data[k], now[k]), `expected ${o.data[k].length ?? ""} rows/keys`);
    }
    if (o.deleted) {
      const gone = must("read deleted", await c.from("tournaments").select("id").eq("id", o.deleted.id));
      check(`${o.email}: deleted league still gone`, gone.length === 0);
    }
  }

  // The write path still works on data that existed before the upgrade.
  const o3 = snapshot.find((o) => o.leagues[0]?.matchIds.length === 190);
  const big = o3.leagues[0];
  const unplayed = big.matchIds[100];
  check("anon submit on a seeded unplayed match is created", (await submit(big.token, unplayed, 2, 1)) === "created");
  check("second submit reports already_entered", (await submit(big.token, unplayed, 0, 0)) === "already_entered");
  const c3 = await signIn(o3);
  const corrected = must(
    "owner correction",
    await c3
      .from("results")
      .update({ score_a: 1, score_b: 1 })
      .eq("match_id", big.matchIds[0])
      .select("score_a, score_b"),
  );
  check("owner correction on a seeded result", corrected.length === 1 && corrected[0].score_a === 1);
  const locked = must(
    "points lock",
    await c3.rpc("update_tournament_settings", {
      p_tournament_id: big.id,
      p_name: "Wielka Liga — sezon 1",
      p_points_win: 2,
      p_points_draw: 1,
      p_points_loss: 0,
    }),
  );
  check("points stay locked on a seeded scored league", locked.status === "points_locked");

  // Leagues seeded before the cup format backfill to format = 'league'.
  if (cupSupported && !cupColumns) {
    const formats = must("read formats", await c3.from("tournaments").select("format"));
    check(
      "seeded leagues backfill to format league",
      formats.every((t) => t.format === "league"),
    );
  }

  const o4 = snapshot.find((o) => o.leagues.some((l) => l.format === "cup"));
  if (!o4) {
    console.log("seed-db: no seeded cups in the snapshot (schema had no create_cup when seeded), skipping cup checks");
  } else {
    const [partial, done] = o4.leagues;
    const c4 = await signIn(o4);
    // Partial cup: the final is not ready, a draw is refused, then the rest is played out.
    check("partial cup: final is not ready", (await submit(partial.token, partial.matchIds[3], 1, 0)) === "not_ready");
    check(
      "partial cup: a draw is refused",
      (await submit(partial.token, partial.matchIds[1], 2, 2)) === "draw_not_allowed",
    );
    check(
      "partial cup: Ann 3-0 Eve is created",
      (await submit(partial.token, partial.matchIds[1], 3, 0)) === "created",
    );
    check(
      "partial cup: Bob 2-1 Cid is created",
      (await submit(partial.token, partial.matchIds[2], 2, 1)) === "created",
    );
    check(
      "partial cup: Ann meets Bob in the final",
      isDeepStrictEqual((await cupSlots(c4, partial))[3], ["Ann", "Bob"]),
    );
    // Finished cup: the stored bracket is intact and a played next round still locks the winner.
    check(
      "finished cup: slots unchanged",
      isDeepStrictEqual(await cupSlots(c4, done), [
        ["Wes", "Xan"],
        ["Tom", "Wes"],
        ["Uma", "Vic"],
        ["Wes", "Uma"],
      ]),
    );
    const refused = await c4
      .from("results")
      .update({ score_a: 1, score_b: 2 })
      .eq("match_id", done.matchIds[0])
      .select();
    check("finished cup: flipping a played winner is refused", refused.error?.code === "55000");
    const kept = must(
      "read result",
      await c4.from("results").select("score_a, score_b").eq("match_id", done.matchIds[0]),
    );
    check("finished cup: refused correction left the score unchanged", kept[0].score_a === 2 && kept[0].score_b === 1);
  }
  console.log("seed-db: verify passed");
}

async function cleanup() {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  for (const o of snapshot) {
    const c = await signIn(o);
    for (const l of o.leagues) must(`delete ${l.id}`, await c.from("tournaments").delete().eq("id", l.id));
  }
  console.log("seed-db: seeded leagues and cups deleted (users remain; they go away on the next local db reset)");
}

try {
  await { seed, verify, cleanup }[mode]();
} catch (error) {
  console.error(`seed-db ${mode} failed:`, error);
  process.exit(1);
}
