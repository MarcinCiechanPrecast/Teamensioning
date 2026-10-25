# Dashboard UI on Design Tokens — Plan Brief

> Full plan: `context/changes/dashboard-ui-tokens/plan.md`
> Research: `context/changes/dashboard-ui-tokens/research.md`

## What & Why

Make `/dashboard` read the shadcn token layer that already exists in `global.css`, using the tweakcn "Jamaica" theme (green primary, Outfit, large radius). Today the view is built from literal classes (11 scan-hit lines), so the theme, accent and focus styles can't change in one place.

## Starting Point

`global.css` has a complete token block, but only `ui/button.tsx` reads it. Nothing applies `.dark`, and `bg-cosmic` is raw hex shared by 9 files. The dashboard hand-builds its card, alert and Sign out button, and prints any `?error=` text.

## Desired End State

`/dashboard` renders in the Jamaica dark theme from tokens and `Card`, `Alert` and `Button` only, with visible focus rings. A crafted `?error=` shows nothing. A dev-only kitchen sink shows the view's states, and `AGENTS.md` plus a scoped check keep the next agent on the contract.

## Key Decisions Made

| Decision         | Choice                                                | Why (1 sentence)                                                            | Source   |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| Contract variant | Existing design system with a dead token file         | The tokens exist, so the view should read them instead of a second palette. | Research |
| Theme            | tweakcn "Jamaica", values saved in `theme-jamaica.md` | The user chose it, and values must live in the repo.                        | Plan     |
| Theme source     | `class="dark"` on `<html>`                            | Every view is dark today, and a future toggle only flips the class.         | Plan     |
| Background       | Keep `bg-cosmic` name, build it from tokens           | The 9 pages inherit the theme without edits.                                | Plan     |
| Font             | Astro Fonts API for Outfit                            | No new dependency, and the font is self-hosted.                             | Plan     |
| `?error=`        | Fixed codes mapped to messages                        | A crafted link can't show arbitrary text, matching `score-submission.ts`.   | Plan     |
| Guard            | Small script in `lint-staged`, no new dependency      | A failing check beats a rule the agent forgot.                              | Plan     |

## Scope

**In scope:** token values, font, dark class, `card`/`alert` components, dashboard view, delete-endpoint error codes, kitchen sink, screenshots, `AGENTS.md` rule, scoped check.

**Out of scope:** migrating the other 8 pages, Topbar, a theme toggle, new dependencies, screenshot-test baselines.

## Architecture / Approach

Library and environment first, then token values, then one view, then states and guard. The dashboard body moves into `DashboardView.astro` (props in, markup out) so the page and the kitchen sink render the same markup. Phases 1-2 change every page's look through the shared tokens and `bg-cosmic`, so each ends with a spot-check of another page.

## Phases at a Glance

| Phase                      | What it delivers                              | Key risk                                          |
| -------------------------- | --------------------------------------------- | ------------------------------------------------- |
| 1. Environment and library | Font config, dark class, `card` and `alert`   | Dark class changes all 9 pages at once            |
| 2. Token values            | Jamaica values and a token-driven `bg-cosmic` | Contrast on pages that still use white/N literals |
| 3. Dashboard view          | Token-only view, fixed error codes            | Delete endpoint contract change                   |
| 4. States, gate and guard  | Kitchen sink, screenshots, rule, check        | Forcing hover/focus states in a static page       |

**Prerequisites:** local dev server; network for the Google Fonts fetch at build.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- Other pages keep their literals, so they may look slightly mismatched next to Jamaica until migrated.
- The Fonts API option names should be checked against the Astro docs when implementing.
- No screenshot-test tool exists, so the visual gate is manual evidence rather than CI.

## Success Criteria (Summary)

- The dashboard scan returns 0 hardcoded lines, and lint, tests and build pass.
- The dashboard looks right in Jamaica dark at desktop and 375px, with a visible focus ring on every control.
- `/dashboard?error=hello` shows no message, and `AGENTS.md` names the token and component locations.
