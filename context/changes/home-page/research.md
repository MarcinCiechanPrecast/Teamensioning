---
date: 2026-11-13
researcher: Claude (Opus 5.5)
git_commit: b38218f
branch: feat/home-page
repository: MarcinCiechanPrecast/Teamensioning
topic: "Where the Astro starter still shows, and what a branded home page must respect"
tags: [research, ui, home-page, branding]
status: complete
last_updated: 2026-11-13
last_updated_by: Claude
---

# Research: home-page

## Question

1. Which user-visible (and repo-identity) texts still come from the `10x-astro-starter` template?
2. What does the current `/` render, and which tests depend on it?
3. Which UI contract must a new home page follow?

## Answer

### 1. Starter leftovers (inspected: `src/`, `scripts/`, `tests/`, `README.md`, `package.json`)

| Where                                              | What                                                                                                                  | Visible to users?                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `src/components/Welcome.astro:18`                  | `<h1>10x Astro Starter</h1>`                                                                                          | yes — home page                   |
| `src/components/Welcome.astro:20`                  | "A production-ready starter with authentication, modern tooling, and a cosmic developer experience."                  | yes                               |
| `src/components/Welcome.astro:47-96`               | Feature cards "Authentication Ready", "Modern Stack", "Developer Experience" (describe the template, not the product) | yes                               |
| `src/layouts/Layout.astro:11`                      | default `<title>` = `"10x Astro Starter"` (used by `/`, which passes no title)                                        | yes — browser tab                 |
| `src/lib/config-status.ts:16`                      | config banner docs link → `github.com/przeprogramowani/10x-astro-starter#supabase-configuration`                      | only when Supabase env is missing |
| `README.md:1,3,5,26-27,181`                        | title, `template.png` screenshot, starter description, clone URL of the template, "the starter itself" note           | repo visitors                     |
| `package.json:2` (+ `package-lock.json` root name) | `"name": "10x-astro-starter"`                                                                                         | no (repo identity)                |
| `public/template.png`                              | starter screenshot, referenced only by `README.md:3`                                                                  | repo visitors                     |
| `src/components/ui/LibBadge.astro`                 | template "library badge"; no importer in `src/` (grep `LibBadge`)                                                     | no — dead code                    |

Not leftovers: "Welcome, {email}" in `src/components/dashboard/DashboardView.astro:20` (product text); the `10x-ui` comment in `scripts/check-ui-literals.mjs:13` (refers to the course skill, not the template).

### 2. Current `/`

`src/pages/index.astro` renders `Layout` (no title) + `Welcome.astro`. `Welcome` imports `Topbar.astro` (its only importer), which shows the signed-in email + Dashboard/Sign out, or Sign in/Sign up. Dependents:

- `scripts/smoke.mjs:97` — `"home renders"`: `GET /` → status 200 only, no body assertion. Several auth redirects target `/` (`smoke.mjs:113,307,317,325,329,452`), so `/` must keep rendering for anonymous users.
- No E2E under `tests/e2e/` visits `/` content (grep for `goto("/")` / heading lookups found none).

### 3. UI contract (AGENTS.md "UI", `context/foundation/test-plan.md:208`)

- Tokens only (`src/styles/global.css`); `npm run check:ui` rejects hex/rgb/oklch, palette classes and arbitrary `-[..]` values in every view under `src/pages|components|layouts`.
- Page shell: `bg-cosmic`, `Card`, `text-foreground` heading (no gradient text), links `text-primary`, focus ring pattern. The shell's `max-w-lg` card is written for form views; a landing page is a multi-section view, so it keeps `bg-cosmic`, tokens and `Card` but not the single-card width.
- Buttons via `buttonVariants`; no hand-built cards.
- UI snapshot tests are explicitly out of scope (`test-plan.md:208`); the visual gate is screenshots in the change folder's `screens/`.
- The `<html>` element has `class="dark"` (`Layout.astro:15`), so the home page renders on the dark tokens.

## Product facts for copy (`context/foundation/prd.md`)

Persona: an office-league organizer. Flow: sign in → create tournament (league or cup, name, 3/1/0 points, players) → fixtures generated → share link → players enter results → leaderboard updates. Guardrails: leaderboard always matches results; every player meets every other exactly once; cup bracket consistent with scores.

The name "Teamensioning" = **Team + Dimensioning**: dimensioning is the engineering-drawing practice of annotating exact measurements with dimension lines, arrows and tolerances. That gives a coherent visual and verbal metaphor: fixtures are "measured out", the leaderboard has "zero tolerance" for error, and the share link is "the blueprint".

## Regression guard options

- A unit test (`scripts/**/*.test.ts` is in the `unit` project, `vitest.config.ts`) that scans `src/`, `README.md` and `package.json` for the starter strings — runs in `npm test`, CI `ci` job and pre-push.
- Extend smoke `"home renders"` to assert the body contains the product name (pattern already used at `smoke.mjs:171`).

## Gaps

None material. Copy tone and illustration are product choices for the plan.
