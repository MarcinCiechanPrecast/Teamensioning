---
date: 2026-11-13T00:00:00+01:00
researcher: Claude (Opus 5.5) for Marcin Ciechan
git_commit: 64eae1a
branch: chore/close-cup-milestone
repository: Teamensioning
topic: "Apply the Dashboard UI style to every remaining view"
tags: [research, ui, design-tokens, shadcn, check-ui, auth, leagues, share-page]
status: complete
last_updated: 2026-11-13
last_updated_by: Claude (Opus 5.5)
---

# Research: Apply the Dashboard UI style to every remaining view

**Date**: 2026-11-13
**Researcher**: Claude (Opus 5.5) for Marcin Ciechan
**Git Commit**: 64eae1a (working tree: only `.claude/launch.json` modified)
**Branch**: chore/close-cup-milestone
**Repository**: Teamensioning

## Research Question

Inventory every view outside the cleaned Dashboard (`src/pages/**`, `src/components/**` except `dashboard/` and `ui/`, plus `src/layouts/`), define the Dashboard style contract, list per-view violations (literal colours, palette classes, arbitrary values, hand-built cards/alerts/buttons), and group the views into parallel work packages that share no files.

## Summary

- **Contract.** The Dashboard style means: Jamaica tokens from `src/styles/global.css` (dark by default), a `bg-cosmic` page wrapper, a shadcn `Card` shell, `buttonVariants()` for every button/CTA, shadcn `Alert` for messages, `text-muted-foreground` for secondary text, and the focus pattern `focus-visible:ring-ring outline-hidden focus-visible:ring-2`. No literals; enforced by `npm run check:ui` (`AGENTS.md` "### UI"; `src/components/dashboard/DashboardView.astro:17-56`).
- **Size of the gap.** Running the guard with explicit arguments over all 28 `.astro`/`.tsx` files in `src/pages`, `src/components` (excluding `ui/`) and `src/layouts` reports **116 literal lines in 18 files** (`node scripts/check-ui-literals.mjs <files>`, run at 64eae1a). Every hit comes from the old "cosmic glass" starter theme (`bg-white/10 backdrop-blur-xl`, `text-blue-100/80`, `text-purple-300`, `bg-purple-600`), except `Banner.astro`, which uses hex colours in a scoped `<style>` (`Banner.astro:28-40`).
- **Already compliant (0 hits):** `pages/index.astro`, `pages/leagues/[id]/edit.astro`, `layouts/Layout.astro`, `components/cup/Bracket.astro`, `SignInForm.tsx`, `EditLeagueSettingsForm.tsx`, plus the dashboard files. `edit.astro` and `EditLeagueSettingsForm.tsx` use shadcn `Card`/`Alert` but **inherit glass styling through `FormField`, `ServerError` and `SubmitButton`**. `SignInForm.tsx` does the same.
- **Shared form parts are the critical path.** `src/components/auth/{FormField,ServerError,SubmitButton,PasswordToggle}.tsx` are used by signin, signup, leagues/new and leagues/[id]/edit. Both the auth and league packages need them, so they must be migrated first and alone (Package 0).
- **Missing building blocks.** `src/components/ui/` has only `alert`, `button`, `card` and `LibBadge` (not compliant, `LibBadge.astro:10`). There is no `input`/`label`, no success/info/warning token and no `--destructive-foreground` (`global.css:11-120`). The blue "status" boxes (`role="status"`) have no token equivalent today.
- **Tests are mostly robust.** E2E tests and smoke select by role, label or text; none selects by CSS class. The constraints a restyle must keep are listed under "Test and script contracts".

## Detailed Findings

### The Dashboard style contract (the recipe)

- Page wrapper: `<div class="bg-cosmic flex min-h-screen items-center justify-center p-4">` (`src/pages/dashboard.astro:32`). `bg-cosmic` is a token gradient `@utility` (`src/styles/global.css:123-125`).
- Shell: `<Card className="w-full max-w-lg p-8 text-center">`. The heading is `text-foreground text-3xl font-bold` and secondary text is `text-muted-foreground` (`DashboardView.astro:17-20`).
- Row/link: `border-border bg-card text-card-foreground rounded-lg border px-4 py-2 transition-colors hover:bg-accent hover:text-accent-foreground` plus the focus pattern. User names get `min-w-0 break-words` (`DashboardView.astro:34-39`).
- Buttons and CTAs: `buttonVariants()` / `buttonVariants({ variant: "outline" })` on `<a>`/`<button>` (`DashboardView.astro:49,54`). Available variants are default, destructive, outline, secondary, ghost, link; sizes are default, sm, lg, icon (`src/components/ui/button.tsx:10-26`).
- Alerts: `<Alert variant="destructive"><AlertDescription>` (`DashboardView.astro:22-26`). `Alert` always renders `role="alert"` (`src/components/ui/alert.tsx:22`). Variants: `default`, `destructive` (`alert.tsx:9-13`).
- Inputs: there is no shadcn Input. `Bracket.astro:22-25` defines a local `inputClass = border-input bg-background text-foreground rounded-lg border px-2 py-1` plus the focus pattern.
- Focus: `outline-hidden`, not `outline-none`, so forced-colors mode keeps a focus indicator (`context/archive/2026-10-25-dashboard-ui-tokens/reviews/impl-review.md:41-49`).
- Guard patterns: hex, `rgb/hsl/oklch(`, arbitrary lengths, palette classes including `white`/`black`, and `style=` (`scripts/check-ui-literals.mjs:13-22`).
- Visual gate: `src/pages/dev/dashboard-states.astro` (dev only, 404 otherwise, `:8-9`) covers 7 states for the dashboard only.

### Per-view violations (guard output, 64eae1a)

| File                                            | Hits   | Notable patterns                                                                                                                                                                                               |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/t/[token].astro`                         | 27     | glass card :59, gradient h1 :62/:82, red alert :67/:155, blue status :72/:160, glass select :139 with `text-black` options :141/:145, fixture `<li>` + number inputs + glass Save :167-204, played `<li>` :212 |
| `components/Welcome.astro`                      | 20     | blobs with `-[350px]` + `blur-[120px]` :7-9, inline `style=` star field :14, gradient h1 :22, `bg-purple-600` CTA :31, 3 glass feature cards :46/:68/:91                                                       |
| `pages/leagues/[id].astro`                      | 13     | glass card :106, gradient h1 :109, `text-blue-100/50` :115/:122, red/blue boxes :132/:139, `text-purple-300` links :157/:160, `text-red-300` delete link :163                                                  |
| `components/Banner.astro`                       | 9      | hex colours for info/warning/error in `<style>` :28-40                                                                                                                                                         |
| `components/Topbar.astro`                       | 7      | glass bar :5, `text-blue-100/70` :8/:22, `text-purple-300` links :10/:14/:24/:27                                                                                                                               |
| `components/leagues/OrganizerFixtureList.astro` | 6      | red/blue boxes :15/:20, fixture `<li>` :26, glass inputs :43/:56, glass Save :58                                                                                                                               |
| `pages/leagues/[id]/delete.astro`               | 5      | glass card :45, hand-built `bg-red-600` button :56, `text-purple-300` link :60                                                                                                                                 |
| `components/auth/FormField.tsx`                 | 5      | `bg-white/10 … outline-none` input class :6, `text-blue-100/80` label :37, `red-400` error ring :53, `text-red-300` error :59                                                                                  |
| `pages/auth/{signin,signup}.astro`              | 5 each | glass card :10, gradient h1 :11, footer link :15-17                                                                                                                                                            |
| `pages/auth/confirm-email.astro`                | 4      | glass card :23, gradient h1 :25, link :29                                                                                                                                                                      |
| `pages/leagues/new.astro`                       | 4      | glass card :10, gradient h1 :11, link :15-16                                                                                                                                                                   |
| `components/leagues/PlayerListField.tsx`        | 4      | `text-blue-100/80` legend :31, glass remove icon :53, `text-red-300` :63, dashed add button :74                                                                                                                |
| `components/auth/SubmitButton.tsx`              | 2      | hand-built `bg-purple-600` button :18, spinner `border-white/30` :22                                                                                                                                           |
| `components/leagues/CopyLinkField.tsx`          | 2      | glass input :47, glass copy button :53                                                                                                                                                                         |
| `components/leagues/CreateLeagueForm.tsx`       | 2      | format legend :98, radio label :101                                                                                                                                                                            |
| `components/auth/PasswordToggle.tsx`            | 1      | `text-white/40` icon button :13                                                                                                                                                                                |
| `components/auth/ServerError.tsx`               | 1      | hand-built red alert :11                                                                                                                                                                                       |
| `components/auth/SignUpForm.tsx`                | 1      | `text-blue-100/50` hint :59                                                                                                                                                                                    |

Not caught by the guard: `src/components/ui/LibBadge.astro:10` (`blue-900/50`, `purple-500/30`). The guard skips `ui/`, and `LibBadge` is imported only by `Welcome.astro` (dependency worker report).

### Duplicated markup (should become one component each)

- **Glass card shell** (`rounded-2xl border border-white/10 bg-white/10 p-8 backdrop-blur-xl`) appears 7 times: confirm-email:23, signin:10, signup:10, new:10, delete:45, `[id]`:106, `[token]`:59. Replace each with shadcn `Card` (`max-w-sm` for auth, `max-w-lg` otherwise). `edit.astro:54-89` already does this.
- **Gradient h1** appears 7 times (same files). Replace with the Dashboard heading `text-foreground font-bold`.
- **Red alert box** appears 4 times plus `ServerError.tsx:11`. **Blue status box** appears 4 times (`[id]`:138, `[token]`:72/:160, `OrganizerFixtureList`:20).
- **Score-entry fixture row** appears 3 times: `[token].astro:167-204`, `OrganizerFixtureList.astro:26-61`, and `Bracket.astro:34-70` (already tokenized, with local `inputClass`).
- **"League not found" block**: delete:67-68, `[id]`:170-171, `[token]`:222-223 (glass), edit:81-85 (Card).

### Test and script contracts a restyle must keep

- Role uniqueness: `getByRole("status")` (us-01:127/134, cup:110) and `getByRole("alert")` (cup:124) are page-wide and strict. Do not add a second `status`/`alert` element on a page where one is rendered. shadcn `Alert` adds `role="alert"` (`alert.tsx:22`), so a blue status box needs `role="status"` that overrides the Alert's role, or a non-Alert element.
- Labels: "Email", "Password" (exact; `PasswordToggle.tsx:14` aria-label must not become "Password"), "Confirm password", "League name", "Win", "Draw", "Loss", `Player N`, "Cup name", "Share link" (a real `<input>` read with `.inputValue()`), `Score of X`. The format choice stays a native `role=radio` named "Cup" (`CreateLeagueForm.tsx:104`).
- Button names: "Create account", "Sign in", "Add player", "Create league", "Create cup", "Save", "Delete permanently".
- Structure: the `<table>` with `<caption>` "Standings", `<th scope=row>` + `<td>` cells in fixed order (`[token].astro:93`); `<ol aria-label="Round N">` (`Bracket.astro:32`); the "League not found" heading.
- Raw HTML in `scripts/smoke.mjs`: `data-share-url` (:73), `name="matchId"` in the same tag as its UUID value (:79), and the visible strings "Played (", "2–1", "Bye: Ann", "TBD", "Round N", "Result 1–1", "whole number from 0 to 99", "cannot end in a draw".
- The only style assertion: `tests/e2e/cup-flow.spec.ts:72` expects `margin-left: 8px` on "Bye:" (`ml-2` in Bracket). Leave Bracket's spacing alone.
- Native form POSTs and 302 redirects, and form field names (`email`, `password`, `name`, `pointsWin/Draw/Loss`, `players`, `format`, `token`, `matchId`, `scoreA`, `scoreB`), are posted directly by smoke.
- Hydration wait on `astro-island` without `ssr` (`tests/e2e/support/hydration.ts:13`). Keep React islands as islands.

### Guard wiring

- `check:ui` with no arguments scans `src/pages/dashboard.astro`, `src/components/dashboard/*.astro` and `src/components/cup/*.astro`, and only `*.astro` files (`check-ui-literals.mjs:24-37`). CI runs it without arguments (`.github/workflows/pr.yml:30`).
- The lint-staged glob is `src/{pages/dashboard.astro,components/dashboard/*.astro}` (`package.json:74-76`). It omits `components/cup` and all `.tsx` files.
- No unit test covers `check-ui-literals.mjs`. `scripts/agent-hooks.test.ts` covers only `.claude/hooks`.

## Code References

- `src/styles/global.css:11-81` - Jamaica token values (`:root`, `.dark`); `:83-120` `@theme inline`; `:123-125` `bg-cosmic`
- `src/components/dashboard/DashboardView.astro:17-56` - reference implementation of the contract
- `src/components/cup/Bracket.astro:22-25` - local tokenized `inputClass` and focus pattern
- `src/components/ui/alert.tsx:9-22` - Alert variants; hard-coded `role="alert"`
- `src/components/ui/button.tsx:8-26` - button variants (stock `outline-none` at :8)
- `scripts/check-ui-literals.mjs:13-25` - guard patterns and default scope
- `package.json:14,74-76` - `check:ui` script and lint-staged glob

## Architecture Insights

- The migration is mostly a **theme swap**: the same 6 glass patterns (card, h1, alert, status, input, link) cover nearly every hit. Fixing the shared parts and introducing 2-3 shared components removes most duplication before the per-view work starts.
- Two cleaned views (`edit.astro`, `EditLeagueSettingsForm.tsx`) still _look_ old because styling leaks in through shared child components. A per-file guard cannot see this. The fix order (shared parts first) matters more than the per-file count.
- The guard's `.astro`-only filter is a real blind spot. 9 of the 18 offending files are `.tsx` (the guard itself flags them when given explicit paths, so its patterns already work on `.tsx`).

## Historical Context (from prior changes)

- `context/archive/2026-10-25-dashboard-ui-tokens/plan.md:30-31` and `plan-brief.md:34`: the other pages, Topbar, Banner, Welcome and a theme toggle were explicitly out of scope and deferred. Supported: still unmigrated at 64eae1a.
- `context/archive/2026-10-25-dashboard-ui-tokens/research.md:76-78`: the remaining views "inherit the contract afterwards". Supported: this change.
- `context/archive/2026-10-25-dashboard-ui-tokens/follow-ups/review-fixes.md:5`: `leagues/[id].astro:81` `text-blue-100/50` → `text-muted-foreground`. Partial: the class still exists, but has moved to `:115`/`:122`.
- `context/archive/2026-10-27-ui-push-readiness/research.md:91-98`: a suggested order (mobile fixture row, `break-words`, migrate views + extend guard, a11y pass on forms with `outline-hidden` in `FormField.tsx:6`, Topbar truncation, replace the starter landing). Partial: the `outline-none` claim is still true at `FormField.tsx:6`; the mobile/`break-words` items were not re-verified here.
- `context/archive/2026-10-25-add-cup-format/plan.md:243-245`: `components/cup/*.astro` was added to the default guard scope. Supported (`check-ui-literals.mjs:25`). `AGENTS.md:56` was not updated (it still says dashboard only).
- `context/archive/2026-10-27-ui-push-readiness/research.md:58`: free text from `?error=` is still rendered on signin, signup and leagues/new. Not re-verified. It is a security/UX item, out of scope for a restyle.

## Related Research

- `context/archive/2026-10-25-dashboard-ui-tokens/research.md`
- `context/archive/2026-10-27-ui-push-readiness/research.md`

## Proposed work packages (no shared files)

- **Package 0 — foundation (sequential, first).** `src/styles/global.css` (only if a status token is added), `src/components/ui/*` (add shadcn `input`/`label` if chosen; `alert.tsx` status variant), `src/components/auth/{FormField,ServerError,SubmitButton,PasswordToggle}.tsx`, `src/components/Banner.astro`, any new shared component (e.g. `src/components/StatusMessage.astro`, `src/components/NotFoundCard.astro`), `scripts/check-ui-literals.mjs`, `package.json` lint-staged glob.
- **Package A — auth and landing.** `pages/index.astro`, `components/Welcome.astro`, `components/Topbar.astro`, `components/ui/LibBadge.astro`, `pages/auth/{signin,signup,confirm-email}.astro`, `components/auth/{SignInForm,SignUpForm}.tsx`.
- **Package B — league forms.** `pages/leagues/new.astro`, `pages/leagues/[id]/edit.astro`, `pages/leagues/[id]/delete.astro`, `components/leagues/{CreateLeagueForm,EditLeagueSettingsForm,PlayerListField}.tsx`.
- **Package C — league and share views.** `pages/leagues/[id].astro`, `pages/t/[token].astro`, `components/leagues/{OrganizerFixtureList.astro,CopyLinkField.tsx}`. `components/cup/Bracket.astro` is already compliant. Touch it only if a shared fixture row is extracted, and keep its `ml-2` (cup-flow:72).
- **Package D — docs and gates (after A-C).** `AGENTS.md` "### UI", `context/foundation/*` mentions, kitchen sink (optional).

## Decisions (user, 2026-11-13)

1. Status boxes → add a `--success` token and an Alert `success` variant, with `role="status"`.
2. Inputs → add shadcn `input` + `label`; `FormField` wraps them.
3. Landing → restyle only (tokens + Card/Button). Drop the inline-style star field and the arbitrary-size blobs.
4. Guard → the default scan covers all views, `.astro` + `.tsx`, under `src/pages/**` and `src/components/**` except `ui/`. The lint-staged glob widens to match.

## Open Questions (answered above)

1. **Blue status boxes.** Add a status token and Alert variant (`--info`), or map status to `Alert variant="default"` (card colours) with `role="status"`? This is a product/design choice.
2. **Inputs.** Add shadcn `input` + `label` (`npx shadcn@latest add input label`), or keep a shared tokenized class like `Bracket.astro:22`? Adding shadcn components matches the AGENTS.md rule ("do not hand-build").
3. **Landing page (`Welcome.astro`).** Restyle the starter landing as is, or replace it with a product landing (deferred item 6 in ui-push-readiness)? A restyle-only scope keeps this change bounded.
4. **Guard scope.** Make the default scan every view (`src/pages/**`, `src/components/**` except `ui/`, `.astro` + `.tsx`), and keep `dev/dashboard-states.astro` included? It uses `data-state` CSS, which needs a check.
