# Branded home page and starter-leftover removal — Implementation Plan

## Overview

Replace the `10x Astro Starter` landing page with a Teamensioning home page built on the name's own metaphor — **Team + Dimensioning** — and remove every remaining starter text from the site and the repo identity. A unit test keeps the starter strings from coming back.

## Current State Analysis

From `research.md`:

- `/` renders `Layout` + `src/components/Welcome.astro`, whose heading, tagline and three feature cards describe the starter template, not the product (`Welcome.astro:18-96`).
- `Layout.astro:11` defaults `<title>` to `10x Astro Starter`; other pages pass bare titles ("Sign in", "Dashboard").
- `config-status.ts:16` links the missing-config banner to the template repo.
- `README.md`, `package.json:2` (+ lockfile root name) and `public/template.png` still carry the starter identity; `src/components/ui/LibBadge.astro` is dead template code.
- Smoke only asserts `GET /` → 200 (`scripts/smoke.mjs:97`); no E2E reads home content.

## Desired End State

- `/` shows a branded landing: hero with the Teamensioning name and a dimension-line illustration, a "Team + Dimensioning" name explainer, a three-step "how it works", the product guarantees, and CTAs. Anonymous visitors get Sign up / Sign in; signed-in users get "Go to dashboard".
- Every page title ends in `· Teamensioning`; `/` uses the product tagline.
- No `10x Astro Starter` / `10x-astro-starter` / starter description anywhere in `src/`, `README.md`, `package.json`, `package-lock.json` (root name).
- `npm test`, `npm run lint`, `npm run check:ui`, `astro check`, build and smoke green; screenshots in `context/changes/home-page/screens/`.

### Key Discoveries:

- Topbar (`src/components/Topbar.astro`) already handles signed-in vs anonymous nav — reuse it.
- `check:ui` forbids literal colours/arbitrary values in views → the SVG uses `currentColor` with token text classes.
- `<html class="dark">` (`Layout.astro:15`) → design on dark tokens.
- Snapshot tests are out of scope by test-plan decision (`test-plan.md:208`); screenshots are the visual gate.

## What We're NOT Doing

- No new routes, no auth/redirect change for signed-in users on `/`.
- No light-mode toggle, no new tokens in `global.css`, no new fonts.
- No E2E test for the landing page (copy-only view; smoke + unit guard cover the regression).
- Not translating the Polish config banner message (product text, not a starter leftover — only its link changes).
- Not rewriting README technical sections (setup, scripts, CI) — only the identity parts.

## Implementation Approach

Test-first: add a unit guard that scans for the starter strings and fails on today's tree, then build the home page and clean identity until it passes. The page is split into small Astro components under `src/components/home/` following the dashboard folder pattern.

## Phase 1: Guard and branded home page

### Overview

Red guard → new home view → green guard; smoke asserts the brand on `/`.

### Changes Required:

#### 1. Starter-leftover guard

**File**: `scripts/no-starter-leftovers.test.ts`

**Intent**: Fail the unit suite when any starter identity text reappears, so a future copy-paste from the template is caught in pre-push and CI.

**Contract**: Scans every file under `src/` plus `README.md`, `package.json` and the lockfile's root `name` for the strings `10x Astro Starter`, `10x-astro-starter`, `production-ready starter`; reports offending `file:line`.

#### 2. Home view

**Files**: `src/components/home/HomeView.astro`, `src/components/home/DimensionLine.astro` (SVG ornament), `src/pages/index.astro`; delete `src/components/Welcome.astro`.

**Intent**: Branded landing built on the dimensioning metaphor: dimension lines with arrowheads and extension lines frame the hero, the name explainer, the steps (create → share → standings) and the guarantees ("zero tolerance" leaderboard, every pairing exactly once, consistent cup bracket).

**Contract**: `HomeView` props: `{ signedIn: boolean }`; uses `Card`, `buttonVariants`, token classes only; one `h1` ("Teamensioning"). `index.astro` passes `Boolean(Astro.locals.user)` and a page title.

#### 3. Page titles

**File**: `src/layouts/Layout.astro`

**Intent**: Brand every tab. **Contract**: `title` prop → `<title>{title} · Teamensioning</title>`; no prop → `Teamensioning — dimension your office league`. Add a `meta name="description"`.

#### 4. Smoke brand assertion

**File**: `scripts/smoke.mjs`

**Intent**: `"home renders"` also requires the body to contain `Teamensioning`, using the existing body-check pattern (`smoke.mjs:171`).

### Success Criteria:

#### Automated Verification:

- Guard fails before the cleanup and passes after: `npx vitest run --project unit scripts/no-starter-leftovers.test.ts`
- Unit suite passes: `npm test`
- Lint and UI guard pass: `npm run lint` and `npm run check:ui`
- Types pass: `npx astro check`

#### Manual Verification:

- `/` renders the branded page anonymous and signed in (screenshots in `screens/`)

---

## Phase 2: Repo identity cleanup

### Overview

Remove the remaining starter identity outside the home view.

### Changes Required:

#### 1. Config banner link

**File**: `src/lib/config-status.ts` — point `docsUrl` to `https://github.com/MarcinCiechanPrecast/Teamensioning#supabase-configuration`.

#### 2. README and package identity

**Files**: `README.md`, `package.json`, `package-lock.json`, `public/template.png` (delete), `src/components/ui/LibBadge.astro` (delete, no importers).

**Intent**: README opens with Teamensioning and what it does; clone URL points to this repo; the "starter itself" smoke note is rephrased for this app. Package name `teamensioning`.

### Success Criteria:

#### Automated Verification:

- Guard and unit suite pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Smoke passes against the production preview with local Supabase: `npm run smoke`

#### Manual Verification:

- README renders sensibly on GitHub (no broken image)

---

## Testing Strategy

### Unit Tests:

- `scripts/no-starter-leftovers.test.ts` — the regression guard (red first).

### Integration Tests:

- `npm run smoke` `"home renders"` with brand assertion.

### Manual Testing Steps:

1. Open `/` signed out: hero, explainer, steps, guarantees, Sign up / Sign in CTAs.
2. Sign in, open `/`: CTA reads "Go to dashboard".
3. Narrow to mobile width: sections stack, nothing overflows.

## Performance Considerations

Static SSR markup and inline SVG; no client JS added.

## Migration Notes

None — no schema change.

## References

- Research: `context/changes/home-page/research.md`
- Shell pattern: `src/components/dashboard/DashboardView.astro`
- Guard pattern: `scripts/check-ui-literals.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Guard and branded home page

#### Automated

- [x] 1.1 Guard fails before the cleanup and passes after
- [x] 1.2 Unit suite passes
- [x] 1.3 Lint and UI guard pass
- [x] 1.4 Types pass

#### Manual

- [x] 1.5 `/` renders the branded page anonymous and signed in

### Phase 2: Repo identity cleanup

#### Automated

- [ ] 2.1 Guard and unit suite pass
- [ ] 2.2 Lint passes
- [ ] 2.3 Build passes
- [ ] 2.4 Smoke passes against the production preview with local Supabase

#### Manual

- [ ] 2.5 README renders sensibly on GitHub
