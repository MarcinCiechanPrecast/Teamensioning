---
date: 2026-10-25T22:52:08+01:00
researcher: Marcin Ciechan
git_commit: eb4fc845ff9cb8739bdcbc2242a09193b139d13b
branch: chore/roadmap-handoff-refresh
repository: Teamensioning
topic: "Two-way design-system audit of src/pages/dashboard.astro"
tags: [research, ui, design-tokens, dashboard, global.css, shadcn]
status: complete
last_updated: 2026-10-25
last_updated_by: Marcin Ciechan
---

# Research: Two-way audit of `src/pages/dashboard.astro`

**Date**: 2026-10-25T22:52:08+01:00
**Git Commit**: eb4fc845ff9cb8739bdcbc2242a09193b139d13b (uncommitted: `context/changes/` only)
**Branch**: chore/roadmap-handoff-refresh

## Research Question

Source→views: which views read the tokens and `ui/` components, and what is `bg-cosmic` / `--primary`? View→source: which token or component should replace each literal in the dashboard? Do the agent rules invite one-off values? What do logged-out, empty and `?error=` arrivals look like?

## Summary

The token layer in `src/styles/global.css` is a complete shadcn block, but in the inspected `src/pages`, `src/components` and `src/layouts` files (23 files scanned) the only file using semantic token classes is `src/components/ui/button.tsx` (7 token-class lines). The other 22 files have 0. Every page uses the same hardcoded dark look: `bg-cosmic` (raw hex) plus `white/N` glass surfaces plus `purple`/`blue` palette classes.

There is a **blocker for the obvious fix**. No file in `src` applies the `dark` class (grep for `dark` outside `button.tsx` returned no hits in `.astro`/`.tsx`/`.ts`). So `:root` (light) values are what tokens resolve to today. Moving the dashboard to `bg-card`/`text-foreground` without deciding the theme would render a white card on a dark gradient. Phase 1 must decide how the dark look is expressed at the token layer (see Charge 1).

`AGENTS.md` contains no UI rule, and no rule inviting arbitrary values (grep for `arbitrary|one-off|[Npx]` in `AGENTS.md`/`CLAUDE.md` returned no hits). The drift comes from the absence of a rule, not from a bad one.

## Detailed Findings

### Source → views

- Token values: `:root` and `.dark` at `src/styles/global.css:6-73`, published via `@theme inline` at `:75-111`. `--primary` is neutral grey in both themes (`oklch(0.205 0 0)` light, `oklch(0.922 0 0)` dark, `:14`, `:48`). There is no purple/blue role in the system.
- `bg-cosmic` is a `@utility` with raw hex `#0a0e1a`, `#0f1529` (`global.css:113-115`). It is outside `:root`/`.dark`, so it does not respond to any theme. Used by 9 files: `Welcome.astro:5` and the 8 pages (`dashboard.astro:31`, `signin.astro:9`, `signup.astro:9`, `confirm-email.astro:22`, `leagues/new.astro:9`, `leagues/[id].astro:71`, `leagues/[id]/delete.astro:44`, `t/[token].astro:52`).
- Hardcoded-scan hits (lines matching the scan regex) per file, token-class lines in parentheses: `dashboard.astro` 11 (0), `t/[token].astro` 18 (0), `[id].astro` 9 (0), `Topbar.astro` 7 (0), `Banner.astro` 9 (0), `button.tsx` 2 (7: `white` in the destructive variant and `ring-[3px]`).
- Shared components: `src/components/ui/` holds `button.tsx` and `LibBadge.astro` only. No card, alert, input or link component exists. `buttonVariants` is imported by 4 files in the scan (`dashboard.astro`, `SubmitButton.tsx`, `CopyLinkField.tsx`, `PlayerListField.tsx`).
- `Topbar.astro:5-32` is a full nav with email, Dashboard link and Sign out, but its only consumer is `Welcome.astro:18`. The dashboard does not render it.

### View → source (`dashboard.astro`)

| Line   | Literal                                                              | Should be                                                             |
| ------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 31     | `bg-cosmic`                                                          | page background token (see Charge 1)                                  |
| 32     | `border-white/10 bg-white/10 text-white backdrop-blur-xl`            | `border-border bg-card text-card-foreground` (card)                   |
| 33     | `from-blue-200 to-purple-200` gradient text                          | `text-foreground` heading, or one `primary` accent                    |
| 36-37  | `text-blue-100/80`, `text-white`                                     | `text-muted-foreground`, `text-foreground`                            |
| 40     | `border-red-400/30 bg-red-500/10 text-red-200`                       | `border-destructive/30 bg-destructive/10 text-destructive` (alert)    |
| 51-52  | `border-white/10 bg-white/5`, `hover:bg-white/10`                    | `border-border bg-card`, `hover:bg-accent`                            |
| 62     | `text-blue-100/50`                                                   | `text-muted-foreground`                                               |
| 65, 74 | `bg-purple-600 text-white hover:bg-purple-500` on `buttonVariants()` | plain `buttonVariants()`; the accent comes from `--primary`           |
| 82     | hand-built `<button>` with `border-white/20 bg-white/10`             | `Button variant="outline"` (need a `Button` or `buttonVariants` call) |

### Arrival states

- **Logged out:** `/dashboard` is in `PROTECTED_ROUTES` (`src/middleware.ts:4`) and redirects to `/auth/signin` (`:18-22`). The view itself is never rendered logged out, so this is not a charge.
- **Empty:** a real empty state exists (`dashboard.astro:60-69`): text plus "Create your first league". It is built on literals, not tokens. The non-empty case shows a different "Create league" button (`:71-78`), so the primary action moves between two code paths.
- **`?error=`:** `dashboard.astro:27` renders any query string value in an alert (`:39-43`). The only in-repo producer is `src/pages/api/leagues/[id]/delete.ts:8`. Astro escapes the text, but any crafted `/dashboard?error=<text>` link shows attacker-chosen text in the app's error style to a logged-in user. The sibling share page maps codes to fixed messages (`src/lib/services/score-submission.ts:2`), so the repo already has a safer convention.
- **Loading:** inspected path is server-rendered with `await` before render (`dashboard.astro:26`), so there is no client loading state. Mark N/A in the 7-state matrix with that reason.
- **Navigation/sign-out:** there is no nav on the dashboard; Sign out is a card-footer button (`:79-86`). `signout.ts` redirects to `/` (`src/pages/api/auth/signout.ts:9`), which is fine.

### Agent rules

- `AGENTS.md` and `CLAUDE.md` (the latter only imports the former) contain no UI block. No other agent rules file exists (`.cursor`, `.windsurfrules`, `copilot-instructions.md` all absent).

## Charges

1. **Missing tokens: dark theme is not expressed at the token layer.** `global.css:113-115` hardcodes hex, and no file applies `.dark` (`Layout.astro:13-38` renders a bare `<html lang="en">`). Impact: any token-based restyle renders light, and the theme cannot be switched. Fix in phase 1: decide the theme source (recommended: add `class="dark"` to `<html>` in `Layout.astro`, or make dark the `:root` values), express the gradient as a themed token (e.g. a `--cosmic-*` pair or `bg-background`) inside the token layer, and choose the accent (`--primary`, currently grey) as a value in `:root`/`.dark`.
2. **Missing tokens: dashboard literals.** `dashboard.astro:31-82`, 11 scan-hit lines, mapped in the table above. Impact: the accent, muted text and error colours cannot change in one place, and the destructive/focus roles do not match the shadcn tokens.
3. **Missing shared component: card, alert, outline button.** The glass card (`:32`), the error alert (`:40`), the row link (`:48-54`) and the Sign out button (`:80-85`) are hand-built, and the card shell is repeated in the other 8 pages (`bg-cosmic ... min-h-screen items-center` at the lines listed above). Impact: focus-visible is missing on the row link and Sign out (no `focus-visible:` classes in `dashboard.astro`, so they get the browser default), while `buttonVariants` has `focus-visible:ring-ring/50`. Fix: use `Button`/`buttonVariants` (outline) for Sign out and `npx shadcn@latest add card alert` for the others.
4. **Accidental architecture: no nav, free-text `?error=`.** `Topbar.astro` exists but is only used on the landing page (`Welcome.astro:18`); the dashboard has Sign out inside the card, and `?error=` renders arbitrary text (`dashboard.astro:27`). Impact: the user cannot reach Sign out the same way on every page, and a crafted link can show fake errors. Fix: render Topbar (after it is moved to tokens) or keep the card footer, and map `?error=` to fixed codes like `score-submission.ts`.
5. **Missing rule (deferred item candidate): no UI block in `AGENTS.md`.** Impact: the next agent will repeat the literals. This is addressed by the "Make it stick" step, not a phase of its own.

**Deferred:**

- The other 8 pages and `Welcome`/`Topbar`/`Banner` literals (see counts above): out of scope per `change.md` ("one view plus global tokens"). They inherit the contract afterwards.
- Replacing the hardcoded Polish/English copy in `Layout.astro:24`: unrelated to the UI contract.

## Code References

- `src/styles/global.css:6-73` — `:root` and `.dark` token values; `:14` `--primary` grey
- `src/styles/global.css:75-111` — `@theme inline` publication
- `src/styles/global.css:113-115` — `bg-cosmic` raw hex
- `src/layouts/Layout.astro:13` — `<html>` without `dark` class
- `src/pages/dashboard.astro:31-86` — the view and its literals
- `src/components/ui/button.tsx:8-20` — the only token consumer; focus ring `focus-visible:ring-ring/50`
- `src/components/Topbar.astro:5-32` — unused-on-dashboard nav, 7 literal lines
- `src/middleware.ts:4,18-22` — logged-out redirect
- `src/pages/api/leagues/[id]/delete.ts:8` — the only producer of `/dashboard?error=`
- `src/lib/services/score-submission.ts:2` — error-code convention to reuse

## Architecture Insights

The starter shipped shadcn tokens and one component, and every feature view was built with its own literal glass style. The theme question (light `:root` vs the dark look every view shows) is the real phase-1 decision; the `.dark` block is dead today.

## Historical Context (from prior changes)

- `context/changes/live-leaderboard/` and `context/changes/add-cup-format/` are untracked and untouched by this research. No prior change addresses tokens or restyling (grep of `context/changes/*/change.md` found only this change).

## Related Research

Not applicable.

## Open Questions

1. Theme source: dark-by-default (`class="dark"` on `<html>`) vs redefining `:root` as dark? This changes how phase 1 is written.
2. Accent colour: keep purple (as `--primary`) or keep grey? A learner decision.
3. Should the dashboard get Topbar (nav) in this change, or stay out of scope as a layout change?
