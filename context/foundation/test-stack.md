# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.65.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/us-01-league-flow.spec.ts
- full-suite command: npm run test:e2e
- base URL: http://localhost:4400
- port: 4400 (chosen e2e port, not Astro's preview default 4321, so a running dev server is never reused by mistake; override with E2E_PORT)
- web server command: npm run build && npm run preview -- --port $E2E_PORT (ASTRO_PREVIEW_BACKGROUND=1 keeps Astro 7 preview in the foreground); reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts) — signs up a fresh organizer through the UI each run (local Supabase has email confirmation off), no E2E_USERNAME / E2E_PASSWORD; the config refuses a non-local SUPABASE_URL in .env or .dev.vars
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/us-01-league-flow.spec.ts — protects risk #3 (leaderboard vs stored results, incl. after a correction) with a risk #1 cross-check (stale share tab cannot overwrite)
- browser CLI: --help only (not installed; the spec was written from the rendered markup and verified by runs)
- updated: 2026-11-07
