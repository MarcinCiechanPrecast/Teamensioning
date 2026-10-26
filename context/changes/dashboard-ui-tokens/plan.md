# Dashboard UI on Design Tokens Implementation Plan

## Overview

Move `/dashboard` onto the tweakcn "Jamaica" token set and repo components. This change makes the existing shadcn token layer in `global.css` actually drive the view. Dark comes from `class="dark"` on `<html>`, and the shared `bg-cosmic` background becomes a token-driven gradient. Outfit loads through Astro's built-in Fonts API. `?error=` on the dashboard becomes fixed codes. The change ends with a visual gate and a UI rule in `AGENTS.md`.

## Current State Analysis

- `global.css:6-73` holds a complete shadcn `:root`/`.dark` block published through `@theme inline` (`:75-111`). In the 23 files scanned, only `ui/button.tsx` reads it (research.md, "Source → views").
- Nothing applies `.dark` (`Layout.astro:13` renders a bare `<html lang="en">`), so tokens resolve to light values.
- `bg-cosmic` (`global.css:113-115`) is raw hex and is used by 9 files (`Welcome.astro` plus the 8 pages).
- `dashboard.astro:31-86` has 11 scan-hit lines: palette classes, `white/N` surfaces, a purple override on `buttonVariants()`, a hand-built Sign out button, and a hand-built alert.
- `?error=` is rendered as free text (`dashboard.astro:27,39-43`). The only producer is `src/pages/api/leagues/[id]/delete.ts:8`. The repo's convention for fixed codes is `src/lib/services/score-submission.ts:2-17`, with a test in `score-submission.test.ts`.
- `AGENTS.md` has no UI rule. `lint-staged` in `package.json:61-67` runs `eslint --fix` on `*.{ts,tsx,astro}`.
- Theme values are deposited in `context/changes/dashboard-ui-tokens/theme-jamaica.md`.

## Desired End State

`/dashboard` renders with the Jamaica dark theme (green primary, Outfit, `1.25rem` radius), built only from token classes and `Card`, `Alert` and `Button`. The hardcoded-value scan on the dashboard files returns 0 lines. A dev-only kitchen-sink page shows the view in all seven states (two N/A with reasons). `AGENTS.md` tells the next agent where the tokens and components live. A crafted `/dashboard?error=anything` shows no message. Verify with the scan, `npm run lint`, `npm test`, `npm run build`, and screenshots at desktop and one mobile width.

### Key Discoveries:

- Astro ships a Fonts API (`fonts: [{ provider: fontProviders.google(), name, cssVariable }]` in `astro.config.mjs`, plus `<Font cssVariable=… />` from `astro:assets`), so no `@fontsource` dependency is needed. Mapping goes through `@theme inline { --font-sans: var(--font-outfit) }`.
- `Button` already has `focus-visible:ring-ring/50`, so moving Sign out and the CTAs onto `buttonVariants` fixes the missing focus styles. The row links need their own `focus-visible` classes built from the `ring` token.
- `bg-cosmic` and the default `Button` are shared, so phases 1 and 2 restyle all 9 pages. Their own literals stay as they are (deferred).
- `roadmap.md` has no item with Change ID `dashboard-ui-tokens`, so no roadmap sync applies.

## What We're NOT Doing

- Migrating the other 8 pages, `Topbar`, `Banner` or `Welcome` off literals. They inherit the contract later.
- Adding `Topbar` to the dashboard, or any layout change beyond the card.
- A theme toggle. `class="dark"` is static.
- Adding a dependency (`@fontsource`, a lint plugin). The guard is a small script.
- Updating or adding screenshot-test baselines. No screenshot tool exists in the repo, so the gate is the kitchen sink plus screenshots in the change folder.
- Changing `destructive-foreground` or the `--shadow-*` set from the preset. They stay in the registry JSON.

## Implementation Approach

Follow the skill's order: library and environment, token values, one view, then states and guard. Phases 1 and 2 are global and visible on every page, so each phase ends with a quick look at one other page (sign-in) to confirm nothing is unreadable. Phase 3 extracts the dashboard body into a presentational component so the kitchen sink can render the same markup with fixture props.

## Phase 1: Environment and library

### Overview

Prepare the stack so later phases only edit values and markup: font loading, dark class, and the two missing components.

### Changes Required:

#### 1. Font configuration

**File**: `astro.config.mjs`

**Intent**: Register Outfit with the built-in Google font provider so Astro downloads and self-hosts it at build time.

**Contract**: Add a `fonts` entry with `provider: fontProviders.google()`, `name: "Outfit"`, `cssVariable: "--font-outfit"`. Check the exact weight and fallback options against the Astro docs when implementing.

#### 2. Layout head and theme class

**File**: `src/layouts/Layout.astro`

**Intent**: Load the font and switch the whole app to the dark token set.

**Contract**: Render `<Font cssVariable="--font-outfit" />` (from `astro:assets`) in `<head>`. Add `class="dark"` to `<html>`.

#### 3. Missing components

**File**: `src/components/ui/card.tsx`, `src/components/ui/alert.tsx`

**Intent**: Add the shadcn components the dashboard needs, through the stack's own path.

**Contract**: `npx shadcn@latest add card alert`. Do not run `shadcn init`. Review the generated files for lint compliance (no `"use client"`).

### Success Criteria:

#### Automated Verification:

- Components exist: `ls src/components/ui/card.tsx src/components/ui/alert.tsx`
- Linting passes: `npm run lint`
- Build passes with the font config: `npm run build`

#### Manual Verification:

- With the dev server, `/auth/signin` still renders readably under `class="dark"` (dark token values, existing white/N literals intact)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Token values

### Overview

Put the Jamaica values into the token layer and make the shared background follow the theme.

### Changes Required:

#### 1. Jamaica values

**File**: `src/styles/global.css`

**Intent**: Replace the `:root` and `.dark` values with the preset, keeping the existing variable names. Deposit provenance next to the block.

**Contract**: Values come from `context/changes/dashboard-ui-tokens/theme-jamaica.md`. Add a comment above `:root` with the tweakcn URL. Set `--radius: 1.25rem`. Add `--font-sans: var(--font-outfit)` to `@theme inline`. Apply `letter-spacing: var(--tracking-normal)` on `body` with `--tracking-normal: -0.02em`, as the preset does. Leave `--destructive-foreground` and `--shadow-*` out.

#### 2. Token-driven `bg-cosmic`

**File**: `src/styles/global.css`

**Intent**: Keep the utility name so the 9 pages need no edits, but build the gradient from tokens so it follows the theme.

**Contract**: `@utility bg-cosmic` uses a `linear-gradient` between `var(--background)` and `color-mix(in oklch, var(--background), var(--card))` (or equivalent), with no hex literal left.

### Success Criteria:

#### Automated Verification:

- No hex colours remain in the token utility: `grep -nE '#[0-9a-fA-F]{3,8}\b' src/styles/global.css` returns no lines
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `/auth/signin` and `/dashboard` show the green-tinted dark background and Outfit font
- No page is unreadable (contrast still acceptable on the 9 pages that use `bg-cosmic`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard view

### Overview

Rebuild the dashboard from tokens and shared components, and replace free-text `?error=` with fixed codes.

### Changes Required:

#### 1. Error codes

**File**: `src/lib/services/dashboard-errors.ts` (new), `src/lib/services/dashboard-errors.test.ts` (new)

**Intent**: Map known error codes to fixed messages so a crafted link cannot show arbitrary text, following the existing score-submission convention.

**Contract**: Export `DASHBOARD_ERROR_MESSAGES` (`as const`), `DashboardErrorCode`, and `isDashboardErrorCode(value)` using `Object.hasOwn`. Codes: `league-not-found`, `supabase-not-configured`, `server` (the generic fallback for any other database error). Tests cover a known code, an unknown code, `null`, and an inherited key such as `toString`.

#### 2. Delete endpoint

**File**: `src/pages/api/leagues/[id]/delete.ts`

**Intent**: Redirect with a code instead of a message, with no raw database error text reaching the page.

**Contract**: `failWith(code: DashboardErrorCode)` redirects to `/dashboard?error=<code>`. The 22P02 and empty-result paths use `league-not-found`; the missing-client path uses `supabase-not-configured`; any other error uses `server`.

#### 3. View component

**File**: `src/components/dashboard/DashboardView.astro` (new)

**Intent**: Hold the dashboard markup as a presentational component so the page and the kitchen sink share one source.

**Contract**: Props `{ email: string; tournaments: { id: string; name: string }[]; errorCode?: DashboardErrorCode }`. Built only from token classes (`bg-card`, `text-card-foreground`, `border-border`, `text-muted-foreground`, `hover:bg-accent`, `ring-ring`, `destructive`) and `Card`, `Alert`, `buttonVariants`. Row links get `focus-visible` styles from the ring token. Sign out is an outline `buttonVariants` button. The empty and non-empty "Create league" actions share one markup path (same placement, same label "Create league"; the empty state adds its message above it).

#### 4. Page

**File**: `src/pages/dashboard.astro`

**Intent**: Keep data loading and render the view component.

**Contract**: Keep `loadTournaments()` unchanged. Replace the `error` query value with `isDashboardErrorCode(param) ? param : undefined`. Render `DashboardView` inside `Layout` with `bg-cosmic`. The page file keeps no colour or arbitrary-value classes.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Hardcoded-value scan returns 0 lines on `src/pages/dashboard.astro` and `src/components/dashboard/DashboardView.astro`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- `/dashboard` with leagues, and with none, renders from tokens with the green accent and rounded card
- Deleting a league that does not exist shows "League not found" (code-mapped); `/dashboard?error=hello` shows no alert
- Tab order reaches every row link, Create league and Sign out, each with a visible ring

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: States, gate and guard

### Overview

Prove the seven states, record screenshots, and leave a rule and a check for the next agent.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/dashboard-states.astro` (new)

**Intent**: Render `DashboardView` in every applicable state side by side, as the visual gate.

**Contract**: Returns 404 unless `import.meta.env.DEV` is true, and is not in `PROTECTED_ROUTES` (so it renders without a login). States shown with fixture props: default (with leagues), hover and focus-visible (forced via a static `data-state` wrapper class or documented manual hover), error (a known `errorCode`), empty (no leagues). `disabled` and `loading` are N/A: the dashboard has no disabled control, and the page is server-rendered with data awaited before render (`dashboard.astro:26`). Record the N/A reasons on the page.

#### 2. Screenshots

**File**: `context/changes/dashboard-ui-tokens/screens/` (new)

**Intent**: Keep the review evidence.

**Contract**: Desktop and one mobile width (375) screenshots of the kitchen sink, taken with the browser pane.

#### 3. Rule

**File**: `AGENTS.md`

**Intent**: Keep the next agent on the contract, outside any 10x-cli managed block.

**Contract**: Add a short "UI" block: tokens live in `src/styles/global.css` (values in `:root`/`.dark`, published through `@theme inline`; Jamaica provenance comment); components live in `src/components/ui/`, add missing ones with `npx shadcn@latest add <name>`; no literal colours or arbitrary values in views, use tokens; the kitchen sink is `src/pages/dev/dashboard-states.astro`.

#### 4. Check

**File**: `scripts/check-ui-literals.mjs` (new), `package.json`

**Intent**: Fail a commit that reintroduces literals into the cleaned view, with no new dependency.

**Contract**: The script takes file paths and applies the scan regex from the 10x-ui skill, exiting 1 with file:line output on any hit. Wire it in `lint-staged` for `src/pages/dashboard.astro` and `src/components/dashboard/*.astro` only, and expose it as `npm run check:ui`.

### Success Criteria:

#### Automated Verification:

- Guard passes on the cleaned view: `npm run check:ui`
- Guard fails on a literal: a temporary `bg-purple-600` in the view makes `npm run check:ui` exit non-zero (then revert)
- Tests pass: `npm test`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Smoke test passes against the running server: `npm run smoke`

#### Manual Verification:

- Kitchen sink shows default, hover, focus-visible, error and empty with tokens only; disabled and loading are marked N/A with reasons
- Screenshots exist for desktop and 375px width and match the Jamaica look in both
- The focus ring is visible on every control and uses `--ring`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `dashboard-errors.test.ts`: known code, unknown code, `null`/`undefined`, inherited key (`toString`).

### Integration Tests:

- `npm run smoke` against the running server (auth flow unchanged).

### Manual Testing Steps:

1. Open `/dashboard` with and without leagues; check card, accent, font and radius.
2. Delete a nonexistent league id via the form; confirm the fixed message. Open `/dashboard?error=hello`; confirm no alert.
3. Tab through the page and confirm a visible focus ring.
4. Open `/dev/dashboard-states` at desktop and 375px and compare against the matrix.
5. Spot-check `/auth/signin` and `/leagues/new` for readability after the global token change.

## Performance Considerations

The Fonts API self-hosts Outfit, so there is no third-party request at runtime. The build needs network access to Google Fonts (CI included).

## Migration Notes

No data changes. The delete endpoint's redirect format changes from a message to a code. Old bookmarked `?error=<text>` URLs simply show no alert.

## References

- Related research: `context/changes/dashboard-ui-tokens/research.md`
- Theme values: `context/changes/dashboard-ui-tokens/theme-jamaica.md`
- Error-code convention: `src/lib/services/score-submission.ts:2-17`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Environment and library

#### Automated

- [x] 1.1 Components exist: `ls src/components/ui/card.tsx src/components/ui/alert.tsx` — cfd462d
- [x] 1.2 Linting passes: `npm run lint` — cfd462d
- [x] 1.3 Build passes with the font config: `npm run build` — cfd462d

#### Manual

- [x] 1.4 With the dev server, `/auth/signin` still renders readably under `class="dark"` (dark token values, existing white/N literals intact) — cfd462d

### Phase 2: Token values

#### Automated

- [x] 2.1 No hex colours remain in the token utility: `grep -nE '#[0-9a-fA-F]{3,8}\b' src/styles/global.css` returns no lines — 32339ad
- [x] 2.2 Linting passes: `npm run lint` — 32339ad
- [x] 2.3 Build passes: `npm run build` — 32339ad

#### Manual

- [x] 2.4 `/auth/signin` and `/dashboard` show the green-tinted dark background and Outfit font — 32339ad
- [x] 2.5 No page is unreadable (contrast still acceptable on the 9 pages that use `bg-cosmic`) — 32339ad

### Phase 3: Dashboard view

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — 529b21f
- [x] 3.2 Hardcoded-value scan returns 0 lines on `src/pages/dashboard.astro` and `src/components/dashboard/DashboardView.astro` — 529b21f
- [x] 3.3 Linting passes: `npm run lint` — 529b21f
- [x] 3.4 Type check passes: `npx astro check` — 529b21f
- [x] 3.5 Build passes: `npm run build` — 529b21f

#### Manual

- [x] 3.6 `/dashboard` with leagues, and with none, renders from tokens with the green accent and rounded card — 529b21f
- [x] 3.7 Deleting a league that does not exist shows "League not found" (code-mapped); `/dashboard?error=hello` shows no alert — 529b21f
- [x] 3.8 Tab order reaches every row link, Create league and Sign out, each with a visible ring — 529b21f

### Phase 4: States, gate and guard

#### Automated

- [x] 4.1 Guard passes on the cleaned view: `npm run check:ui`
- [x] 4.2 Guard fails on a literal: a temporary `bg-purple-600` in the view makes `npm run check:ui` exit non-zero (then revert)
- [x] 4.3 Tests pass: `npm test`
- [x] 4.4 Linting passes: `npm run lint`
- [x] 4.5 Build passes: `npm run build`
- [x] 4.6 Smoke test passes against the running server: `npm run smoke`

#### Manual

- [x] 4.7 Kitchen sink shows default, hover, focus-visible, error and empty with tokens only; disabled and loading are marked N/A with reasons
- [x] 4.8 Screenshots exist for desktop and 375px width and match the Jamaica look in both
- [x] 4.9 The focus ring is visible on every control and uses `--ring`
