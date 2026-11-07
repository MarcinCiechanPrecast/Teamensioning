import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { assertLocalSupabaseUrl } from "./src/test/integration/supabase-test-env";

// Local env comes from the gitignored .env (Node build) and .dev.vars (what the Cloudflare preview reads).
// In CI the job writes both files from `supabase status`, exactly like the smoke job.
if (existsSync(".env")) process.loadEnvFile(".env");

// The run signs up a real user and creates leagues through the app, which cannot be undone without an
// admin key. Refuse to start unless every env file the app may read points at a local Supabase.
assertLocalSupabaseUrl(process.env.SUPABASE_URL);
if (existsSync(".dev.vars")) {
  const devVarsUrl = /^SUPABASE_URL=(.*)$/m.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim();
  assertLocalSupabaseUrl(devVarsUrl);
}

// 4400, not Astro's default 4321: a dev server or someone else's preview on 4321 would otherwise be
// reused silently by `reuseExistingServer` and the run would test the wrong build. E2E_PORT overrides it.
const PORT = Number(process.env.E2E_PORT ?? 4400);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    // Kept for every failed attempt (not only retries): local runs have no retries.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + preview (workerd via the Cloudflare adapter), on the port above.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Astro 7 moves `astro preview` into a background daemon when it detects an agent; keep it in the
    // foreground so Playwright owns (and stops) the server.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
