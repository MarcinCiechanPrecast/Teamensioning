---
date: 2026-11-07T15:30:00Z
researcher: Claude (Opus 5.5) for Marcin Ciechan
git_commit: a5eb251
branch: testing-critical-flow-e2e
repository: Teamensioning
topic: "Ground test-plan Phase 3: US-01 in the browser (risk #3, risk #1 cross-check)"
tags: [research, testing, e2e, playwright, leaderboard, standings, score-correction, share-link]
status: complete
last_updated: 2026-11-07
last_updated_by: Claude (Opus 5.5)
---

# Research: Ground test-plan Phase 3 — critical flow in the browser

## Research Question

For risk #3 (leaderboard disagrees with stored results, including after a correction) and the risk #1 cross-check, where does a browser run add signal that `scripts/smoke.mjs` and the Phase 1 integration suite do not already give? What does the US-01 path look like in the running app, and what is the cheapest Playwright setup that drives it against the local Supabase?

## Summary

- **The leaderboard exists only on the share page** (`src/pages/t/[token].astro`). It is computed on every request: `get_shared_league` RPC → `toSharedLeague` → `computeStandings(shared)` → a `<table>` with caption "Standings", one `rowheader` per player and cells Rank, P, W, D, L, GF, GA, GD, Pts. There is no cache between a write and the next view (SSR, no `Cache-Control`, no KV read on this path).
- **The organizer page has no leaderboard.** It lists fixtures; a played fixture renders a correction form (`OrganizerFixtureList.astro`) that posts to `/api/leagues/[id]/scores`, which redirects with `?notice=score-updated` ("Score updated.").
- **What smoke already proves:** the share page renders the stored score text "2–1", a second submit returns `notice=already-entered` and the text stays "2–1", and the tournament boundary (`scripts/smoke.mjs:147-231`). It never reads the standings table and never corrects a score.
- **What the integration suite already proves:** write-once at the database, simultaneous submits, organizer-only correction (`src/test/integration/*.integration.test.ts`). It stops at the database and never renders anything.
- **What only a browser run proves (the gap):**
  1. the rendered standings for a **non-default** points setting equal hand-computed values (risk #3 anti-pattern: "only testing 3/1/0 defaults");
  2. an organizer correction reaches the **next anonymous view** of the leaderboard (risk #3 "no stale standings");
  3. a **stale share tab** (loaded before the first score) still shows the form, and its submit does not change the leaderboard (risk #1 cross-check through the real form, not a crafted POST);
  4. the React create-league form and the plain-HTML score forms work together end to end (hydration, form posts with the browser's `Origin`, `Referrer-Policy: same-origin` on the share page).
- **Cheapest setup:** Playwright Test with `webServer` running `npm run build && npm run preview` (workerd via `@astrojs/cloudflare`), a `setup` project that signs up a fresh organizer through the UI and saves `storageState`, and one spec. The anonymous link holder is a second browser context with an empty storage state.

## Detailed Findings

### Path from stored rows to the rendered table

- `src/pages/t/[token].astro:16-27` loads the league through `get_shared_league` (the only anonymous read, `supabase/migrations/20261025120000_add_share_token.sql`), maps it with `toSharedLeague`, then `computeStandings(shared)` (`:42`). The tournament's own `points_win/draw/loss` are part of `shared.league`, so a regression that ignores them (e.g. a hard-coded default) is invisible to `standings.test.ts` (it passes explicit settings) and to the integration suite (it never renders).
- `src/lib/services/standings.ts`: points, then goal difference, then goals for, then name; level players share a competition rank (1, 1, 3). Unplayed fixtures (`score === null`) count for nothing.
- Every unplayed fixture renders a form with hidden `token`/`matchId` and inputs labelled `Score of <player>`; played fixtures move to a "Played (n)" list without a form.

### Correction path

- `src/pages/api/leagues/[id]/scores.ts` checks the match belongs to the path league, then updates `results` under RLS and maps 0 rows to an error. Success redirects to `/leagues/<id>?notice=score-updated`.

### Fixture order (for locating rows, not for expectations)

- `generateFixtures(4)` emits `(0,3) (1,2) (0,2) (1,3) (0,1) (2,3)`. With players Anna, Bartek, Celina, Darek the fixture "Anna vs Bartek" exists exactly once; the test locates fixtures by that text, not by position.

### Auth for the browser run

- `supabase/config.toml` has `enable_confirmations = false`: a sign-up through `/auth/signup` is usable at once (the same fact smoke and Phase 1 rely on). Sign-up redirects to `/auth/confirm-email`; sign-in redirects to `/`.
- Sign-up and sign-in forms are React islands (`SignUpForm.tsx`, `SignInForm.tsx`) with `noValidate` + client validation; so is `CreateLeagueForm.tsx`. Input typed before hydration is lost, so the test waits for `astro-island[ssr]` to disappear before filling a non-idempotent form.

### Environment

- The preview server (workerd) reads `.dev.vars`; the build and Node tooling read `.env`. CI's smoke job writes both from `supabase status` (`.github/workflows/ci.yml`).
- `astro preview` on Astro 7 backgrounds itself when it detects an agent; `ASTRO_PREVIEW_BACKGROUND=1` keeps it in the foreground so Playwright owns the process.
- Port 4321 (Astro default) may be in use by a dev server or another agent's preview; `reuseExistingServer` would then silently test the wrong build.

## Corrections to the test plan

- §2 risk #3 guidance says "one integration for stored-rows → leaderboard". The leaderboard is computed in the page, not in SQL, so the integration layer cannot see it; the stored-rows → rendered-table step is exactly what the browser run covers. The pure calculation edges stay in unit tests (Phase 2).
- Risk #1 needs no new browser coverage beyond a cross-check: it is enforced in the database (Phase 1). The browser adds only the stale-tab case, which smoke cannot express.

## Open Questions (resolved by assumption — delegated run)

- **Fixed E2E user vs fresh user per run:** fresh user per run (no secret to store, CI needs nothing extra, runs never collide). Leftover users and leagues from failed runs stay in the local DB until a `db reset`.
- **Seed:** the US-01 spec is the seed; a separate trivial seed would duplicate smoke (§1 cost × signal).
- **Port:** 4400 by default, `E2E_PORT` overrides.
