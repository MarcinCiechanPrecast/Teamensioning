// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

import { randomUUID } from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const email2 = `smoke-other-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

// anonymous: send no cookies and ignore any Set-Cookie, so the jar is never touched.
async function request(path, { method = "GET", form, json, anonymous = false } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      ...(anonymous ? {} : { Cookie: cookieHeader() }),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json,
  });
  if (!anonymous) storeCookies(response);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    referrerPolicy: response.headers.get("referrer-policy") ?? "",
    body: await response.text(),
  };
}

// Entries array, not a plain object: repeated "players" keys must survive into URLSearchParams.
function leagueForm(players) {
  return [
    ["name", "Smoke League"],
    ["pointsWin", "3"],
    ["pointsDraw", "1"],
    ["pointsLoss", "0"],
    ...players.map((player) => ["players", player]),
  ];
}

let leagueLocation = "";
const leagueId = () => leagueLocation.slice("/leagues/".length);
let sharePath = "";
let matchId = "";
let sharedToken = "";
let foreignLeagueLocation = "";
let foreignSharePath = "";
let foreignMatchId = "";

// Takes only the path from the rendered share URL: its origin is the server's own view, not BASE_URL.
function extractSharePath(html) {
  const match = /data-share-url="[^"]*?(\/t\/[0-9a-f]{64})"/.exec(html);
  return match ? match[1] : "";
}

// Reads the hidden matchId input the share page renders for an unplayed match.
function extractMatchId(html) {
  const match = /name="matchId"[^>]*value="([0-9a-f-]{36})"|value="([0-9a-f-]{36})"[^>]*name="matchId"/.exec(html);
  return match ? (match[1] ?? match[2]) : "";
}

function scoreForm(overrides = {}) {
  return { token: sharedToken, matchId, scoreA: "2", scoreB: "1", ...overrides };
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["new league redirects anonymous user", () => request("/leagues/new"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  [
    "create league redirects to fixtures",
    async () => {
      const result = await request("/api/leagues", {
        method: "POST",
        form: leagueForm(["Anna", "Bartek", "Celina", "Darek"]),
      });
      leagueLocation = result.location;
      return result;
    },
    { status: 302, location: "/leagues/" },
  ],
  [
    "fixtures page renders for owner",
    async () => {
      const result = await request(leagueLocation);
      sharePath = extractSharePath(result.body);
      return result;
    },
    { status: 200 },
  ],
  [
    "owner page exposes a share link",
    async () => ({ status: /^\/t\/[0-9a-f]{64}$/.test(sharePath) ? 200 : 0, location: sharePath }),
    { status: 200 },
  ],
  ["share link renders without cookies", () => request(sharePath, { anonymous: true }), { status: 200 }],
  [
    "share page exposes a match to score",
    async () => {
      const result = await request(sharePath, { anonymous: true });
      matchId = extractMatchId(result.body);
      sharedToken = sharePath.slice("/t/".length);
      return { ...result, status: matchId ? result.status : 0 };
    },
    { status: 200 },
  ],
  [
    // no-referrer makes browsers send `Origin: null` on the score form POST, which Astro's origin check rejects.
    "share page keeps the token off other sites without breaking form posts",
    async () => {
      const result = await request(sharePath, { anonymous: true });
      return { ...result, status: result.referrerPolicy === "same-origin" ? result.status : 0 };
    },
    { status: 200 },
  ],
  [
    "anonymous score submit redirects to share page",
    () => request("/api/scores", { method: "POST", form: scoreForm(), anonymous: true }),
    { status: 302, location: sharePath },
  ],
  [
    "share page shows the stored score",
    async () => {
      const result = await request(sharePath, { anonymous: true });
      return { ...result, status: result.body.includes("2–1") ? result.status : 0 };
    },
    { status: 200 },
  ],
  [
    "second submit reports already entered",
    () => request("/api/scores", { method: "POST", form: scoreForm({ scoreA: "5", scoreB: "5" }), anonymous: true }),
    { status: 302, locationIncludes: "notice=already-entered" },
  ],
  [
    "already entered score is unchanged",
    async () => {
      const result = await request(sharePath, { anonymous: true });
      return { ...result, status: result.body.includes("2–1") && !result.body.includes("5–5") ? result.status : 0 };
    },
    { status: 200 },
  ],
  [
    "out-of-range score is rejected",
    () => request("/api/scores", { method: "POST", form: scoreForm({ scoreA: "100" }), anonymous: true }),
    { status: 302, locationIncludes: "error=invalid-score" },
  ],
  [
    "malformed token is not found",
    () => request("/api/scores", { method: "POST", form: scoreForm({ token: "x" }), anonymous: true }),
    { status: 404 },
  ],
  [
    "unknown token is rejected",
    () => request("/api/scores", { method: "POST", form: scoreForm({ token: "0".repeat(64) }), anonymous: true }),
    { status: 302, locationIncludes: "error=" },
  ],
  [
    "unknown match id is rejected",
    () => request("/api/scores", { method: "POST", form: scoreForm({ matchId: randomUUID() }), anonymous: true }),
    { status: 302, locationIncludes: "error=match-not-found" },
  ],
  [
    "second league is created for the tournament boundary check",
    async () => {
      const result = await request("/api/leagues", {
        method: "POST",
        form: leagueForm(["Ela", "Franek", "Gosia"]),
      });
      foreignLeagueLocation = result.location;
      return result;
    },
    { status: 302, location: "/leagues/" },
  ],
  [
    "second league exposes an unplayed match",
    async () => {
      const owner = await request(foreignLeagueLocation);
      foreignSharePath = extractSharePath(owner.body);
      const shared = await request(foreignSharePath, { anonymous: true });
      foreignMatchId = extractMatchId(shared.body);
      return { ...shared, status: foreignMatchId ? shared.status : 0 };
    },
    { status: 200 },
  ],
  [
    "match of another tournament is rejected for this link",
    () => request("/api/scores", { method: "POST", form: scoreForm({ matchId: foreignMatchId }), anonymous: true }),
    { status: 302, locationIncludes: "error=match-not-found" },
  ],
  [
    "other tournament's match stays unplayed",
    async () => {
      const result = await request(foreignSharePath, { anonymous: true });
      return { ...result, status: result.body.includes("Played (") ? 0 : result.status };
    },
    { status: 200 },
  ],
  [
    "share page ignores free text in the error parameter",
    async () => {
      const result = await request(
        `${sharePath}?error=${encodeURIComponent("Session expired, sign in at evil.example")}`,
        {
          anonymous: true,
        },
      );
      return { ...result, status: result.body.includes("evil.example") ? 0 : result.status };
    },
    { status: 200 },
  ],
  [
    "share page shows a fixed message for a known error code",
    async () => {
      const result = await request(`${sharePath}?error=invalid-score`, { anonymous: true });
      return { ...result, status: result.body.includes("whole number from 0 to 99") ? result.status : 0 };
    },
    { status: 200 },
  ],
  [
    "share page does not expose owner or tournament identifiers",
    async () => {
      const result = await request(sharePath, { anonymous: true });
      const leaks = /owner_id|tournament_id|share_token/.test(result.body);
      return { ...result, status: leaks ? 0 : result.status };
    },
    { status: 200 },
  ],
  [
    "non-form body is a bad request, not a server error",
    () => request("/api/scores", { method: "POST", json: '{"token":"x"}', anonymous: true }),
    { status: 400 },
  ],
  ["unknown share token is not found", () => request(`/t/${"0".repeat(64)}`, { anonymous: true }), { status: 404 }],
  [
    "owner page redirects without cookies",
    () => request(leagueLocation, { anonymous: true }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "create league rejects duplicate names",
    () => request("/api/leagues", { method: "POST", form: leagueForm(["Anna", "Bartek", "anna"]) }),
    { status: 302, location: "/leagues/new?error=" },
  ],
  [
    "dashboard lists the owner's leagues",
    async () => {
      const result = await request("/dashboard");
      return { ...result, status: result.body.includes(`href="${leagueLocation}"`) ? result.status : 0 };
    },
    { status: 200 },
  ],
  ["delete confirm page renders for owner", () => request(`${leagueLocation}/delete`), { status: 200 }],
  [
    "anonymous delete redirects to sign-in",
    () => request(`/api/leagues/${leagueId()}/delete`, { method: "POST", anonymous: true }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "owner signs out before the cross-owner check",
    () => request("/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],
  [
    "second account signs up",
    () => request("/api/auth/signup", { method: "POST", form: { email: email2, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "second account signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email: email2, password } }),
    { status: 302, location: "/" },
  ],
  ["other owner's delete confirm page is not found", () => request(`${leagueLocation}/delete`), { status: 404 }],
  [
    "other owner cannot delete the league",
    () => request(`/api/leagues/${leagueId()}/delete`, { method: "POST" }),
    { status: 302, locationIncludes: "/dashboard?error=" },
  ],
  ["second account signs out", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "owner signs back in",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["league survives the other owner's delete attempt", () => request(leagueLocation), { status: 200 }],
  [
    "owner deletes the league",
    async () => {
      const result = await request(`/api/leagues/${leagueId()}/delete`, { method: "POST" });
      return { ...result, status: result.location === "/dashboard" ? result.status : 0 };
    },
    { status: 302, location: "/dashboard" },
  ],
  ["deleted league is not found", () => request(leagueLocation), { status: 404 }],
  ["deleted league's share link is not found", () => request(sharePath, { anonymous: true }), { status: 404 }],
  [
    "dashboard no longer lists the deleted league",
    async () => {
      const result = await request("/dashboard");
      return { ...result, status: result.body.includes(`href="${leagueLocation}"`) ? 0 : result.status };
    },
    { status: 200 },
  ],
  [
    "deleting it again reports not found",
    () => request(`/api/leagues/${leagueId()}/delete`, { method: "POST" }),
    { status: 302, locationIncludes: "/dashboard?error=" },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.locationIncludes === undefined || actual.location.includes(expected.locationIncludes));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
