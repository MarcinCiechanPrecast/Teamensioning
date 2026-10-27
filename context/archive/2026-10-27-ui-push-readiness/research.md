---
date: 2026-10-27T15:34:40+01:00
researcher: Marcin Ciechan
git_commit: 51c13e204c5509e31ac861103da48fcc9e5dc03e
branch: chore/roadmap-handoff-refresh
repository: Teamensioning
topic: "UI audit of the whole project: can PR #23 merge to master, or are adjustments needed?"
tags: [research, ui, accessibility, mobile, design-tokens, pr-23]
status: complete
last_updated: 2026-10-27
last_updated_by: Marcin Ciechan
---

# Research: UI audit, can PR #23 merge to master?

**Date**: 2026-10-27T15:34:40+01:00
**Git Commit**: 51c13e204c5509e31ac861103da48fcc9e5dc03e
**Branch**: chore/roadmap-handoff-refresh (PR #23 into `master`)

## Research Question

Analyze the UI of the whole project and decide whether the branch can be pushed to master or needs adjustments first. Rule given: if only small warnings occur, push to master.

## Summary

**Decision: merge PR #23. No regression was found, and every defect measured is also present on `master`.** The warnings below are not caused by this PR; two of them are real mobile-layout defects worth fixing soon, listed under Follow-ups.

Basis (each point is bounded to what was inspected):

- **CI and deploy:** on head `51c13e2`, the three PR checks (`ci`, `smoke`, Workers Builds) all passed, the PR was `MERGEABLE` and `CLEAN`, and `master` has no branch protection (GitHub API `protected: false`).
- **Regression test:** none of the files holding the defects found below (`t/[token].astro`, `leagues/[id].astro`, `components/leagues/*`, `components/auth/*`, `Topbar.astro`, `Welcome.astro`) is in this PR's diff against `master` (`git diff 29206e6 HEAD --stat` on those paths is empty). The theme change is the only global effect.
- **Runtime audit:** nine pages were measured at 375px with normal-length names (`/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, `/leagues/new`, `/leagues/[id]`, `/leagues/[id]/delete`, `/t/[token]`). None had horizontal overflow, unlabeled inputs, or unnamed buttons/links, and the console had no errors on the share page.
- **Contrast:** the lowest text contrast per page was 9.28:1 (`/dashboard`), 5.54:1 (`/leagues/new`, `/auth/*`, `/`), 8.81:1 (`/auth/confirm-email`), 4.77:1 (delete page). Two pages have one element under 4.5:1: `15 matches` on `/leagues/[id]` and `15 to play` on `/t/[token]`, both 4.31:1.

## Detailed Findings

### CI and release state

- Checks on PR #23 at `51c13e2`: `ci` (46s), `smoke` (3m4s) and Workers Builds all passed (`gh pr checks 23`). This includes the Outfit font download on Cloudflare's build and the new `check:ui` step.
- `master` was at `29206e6` (merge of PR #22). The branch is 9 commits ahead and 2 behind (two earlier merge commits), and GitHub reports it mergeable.
- Merging with a merge commit, not a squash, keeps the commit SHAs recorded in `context/archive/2026-10-25-dashboard-ui-tokens/plan.md` valid on `master`.

### Was any warning caused by this PR?

- **`text-blue-100/50` contrast** (`src/pages/t/[token].astro:94,139`, `src/pages/leagues/[id].astro:81`, `src/components/auth/SignUpForm.tsx:59`): computed against the old gradient (`#0a0e1a`..`#0f1529`, `git show 29206e6:src/styles/global.css:113-115`) and the same `white/10` card, the text was 4.03:1 to 4.22:1 on the card and 3.70:1 to 3.90:1 on fixture rows before this PR. It measures 4.31:1 now, so the PR slightly improved it. Pre-existing, below AA either way.
- **Share-page score row overlap at 375px**: 11 of 15 fixture rows had a name text box overlapping a score input, worst case 64px, with Outfit and the same 11 with Arial and normal letter-spacing (measured in the browser on the production build). The cause is the markup at `src/pages/t/[token].astro:98-133`: the name `<span class="min-w-0 flex-1">` sits in a `flex flex-wrap` form, so with a flex basis of 0 it never wraps to its own line and long words spill over the inputs. Pre-existing and unchanged by this PR.
- **Unbroken long names**: a league named with 80 unbroken characters and players with 40 made `/dashboard`, `/leagues/[id]` and `/t/[token]` horizontally scrollable at 375px (document scroll width 1261, 2362 and 2362). Names with spaces wrap. The same markup existed before this PR. Names are limited to 80 and 40 characters (`src/lib/validation/league.ts`, per the static audit).
- **Topbar at 375px signed in**: "Sign out" stays inside the bar for emails up to 30 characters, leaves the bar at 35, and is off-screen (clipped by `overflow-hidden`, `Welcome.astro:5`) from 40 characters. Not in this PR's diff.

### Static audit (read-only agent over every file in `src/pages`, `src/components`, `Layout.astro`, `global.css`)

Not measured at runtime unless stated above; treat as leads, not confirmed defects:

- No `<main>` landmark or skip link in any page.
- Form errors are not associated or announced (`FormField.tsx:42-60`, `ServerError.tsx:11`, `PlayerListField.tsx:62`): no `aria-describedby`, `aria-invalid` or `role="alert"`; forms use `noValidate`.
- `outline-none` with a box-shadow ring only (`FormField.tsx:6`, `button.tsx:8`), so no focus indicator in Windows forced-colors mode. The dashboard row links use `outline-hidden` and are fine.
- Password toggle and player remove buttons are 16px icons (`PasswordToggle.tsx:13-16`, `PlayerListField.tsx:47-57`), below the 24px target size in WCAG 2.5.8.
- `?error=` free text is still shown on `/auth/signin`, `/auth/signup` and `/leagues/new` (content spoofing, no XSS; React escapes). `t/[token].astro:45-47` already maps codes to fixed messages.
- `placeholder-white/40` on `bg-white/10` (`FormField.tsx:6`) is estimated at about 3.2:1 and was not measured.
- Heading gradient text uses `bg-clip-text text-transparent`; behaviour under forced-colors was not tested.
- The landing page is still the starter boilerplate (`<title>` "10x Astro Starter", `Welcome.astro`), and signing in lands on `/` rather than `/dashboard` (`api/auth/signin.ts:19`).
- Migrated and unmigrated views now look different: the dashboard uses a token `Card`, every other page uses purple/blue glass on the same green-tinted background.

### Inspected scope and limits

- Runtime checks: production build on Chromium (the in-app browser) with a local Supabase and throwaway accounts (removed afterwards). Desktop width was the pane's 1024px, mobile was 375x812.
- Not tested: Firefox and Safari, forced-colors emulation, screen readers, the dashboard's real keyboard focus on a high-contrast theme. A negative result for those is "not tested", not "clean".

## Code References

- `src/pages/t/[token].astro:98-133` - fixture row; name span `min-w-0 flex-1` in a `flex flex-wrap` form (overlap cause)
- `src/pages/t/[token].astro:94,139`, `src/pages/leagues/[id].astro:81`, `src/components/auth/SignUpForm.tsx:59` - `text-blue-100/50` (4.31:1 now)
- `src/components/Topbar.astro:5-9` - no-wrap bar holding the full email and links
- `src/components/dashboard/DashboardView.astro:31-40` - league links without `break-words` (long unbroken names)
- `src/components/auth/FormField.tsx:6,42-60` - placeholder colour, error association, `focus:outline-none`
- `src/lib/validation/league.ts` - name length limits (80 league, 40 player)

## Architecture Insights

The migration was scoped to one view on purpose, so the project now has two visual dialects. Layout bugs in the unmigrated views are independent of the token layer, which is why swapping the theme could not fix or worsen them. The kitchen-sink approach caught one bug (the Alert grid) that text-based checks missed; the same visual check on the share page found the overlap above.

## Historical Context (from prior changes)

- `context/archive/2026-10-25-dashboard-ui-tokens/follow-ups/review-fixes.md` - queues the `[id].astro:81` contrast item for the league-view migration. This audit adds three more places with the same class and the layout items below.
- `context/archive/2026-10-25-dashboard-ui-tokens/reviews/impl-review.md` - the implementation review (APPROVED) whose F5 audit first measured the league pages.

## Related Research

`context/archive/2026-10-25-dashboard-ui-tokens/` (research.md, reviews/).

## Follow-ups (recommended order)

1. **Share-page fixture row on mobile** (`t/[token].astro:98-133`): let the name take its own line (for example a full-width basis below the `sm` breakpoint) so inputs never cover names. This is the page players use to enter scores on a phone.
2. **Unbroken long names**: add `break-words` to league names and links on the dashboard, league and share pages.
3. **Migrate the unmigrated views to tokens**, which also resolves the four `text-blue-100/50` literals, then add them to the `check:ui` guard.
4. **Accessibility pass on forms**: associate and announce errors, replace `outline-none` with `outline-hidden`, enlarge the 16px icon buttons.
5. **Topbar**: let the email truncate so "Sign out" always stays reachable.
6. **Product decision**: replace the starter landing page and title.

## Open Questions

- Whether the share-page overlap should be fixed before the next release, or together with the view migration (item 1 can ship independently).
- Placeholder contrast and forced-colors behaviour are unmeasured; a short browser pass would settle them.
