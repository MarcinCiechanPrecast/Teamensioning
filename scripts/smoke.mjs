// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
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
async function request(path, { method = "GET", form, anonymous = false } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      ...(anonymous ? {} : { Cookie: cookieHeader() }),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  if (!anonymous) storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
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
let sharePath = "";

// Takes only the path from the rendered share URL: its origin is the server's own view, not BASE_URL.
function extractSharePath(html) {
  const match = /data-share-url="[^"]*?(\/t\/[0-9a-f]{64})"/.exec(html);
  return match ? match[1] : "";
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
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
