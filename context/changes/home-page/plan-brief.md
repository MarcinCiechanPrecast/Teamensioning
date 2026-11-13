# Branded home page — Plan Brief

> Full plan: `context/changes/home-page/plan.md`
> Research: `context/changes/home-page/research.md`

## What & Why

The home page still says "10x Astro Starter" and describes the template. Replace it with a Teamensioning landing page built on the name — **Team + Dimensioning** — and remove the remaining starter identity from the site and repo.

## Starting Point

`/` renders `Welcome.astro` (starter hero + "Authentication Ready / Modern Stack / Developer Experience" cards). The layout's default title, the config banner link, README and package name still point to the template.

## Desired End State

Visitors land on a page that explains what Teamensioning does in the language of technical drawings: dimension lines, "zero tolerance" standings, fixtures "measured out" exactly once. Every tab title ends in "· Teamensioning". A unit guard fails if starter text returns.

## Key Decisions Made

All choices are the recommended options; the user delegated them ("use all recommended answers").

| Decision                  | Choice                                                               | Why                                                    | Source   |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| Signed-in visitors on `/` | Stay on `/`, CTA becomes "Go to dashboard"                           | No auth-flow change; smoke redirects to `/` stay valid | Plan     |
| Visual metaphor           | Engineering dimension lines as SVG ornament (`currentColor`, tokens) | Ties the name to the UI and passes `check:ui`          | Research |
| Navigation                | Reuse `Topbar.astro`                                                 | Already handles both auth states                       | Research |
| Page titles               | `{title} · Teamensioning`, default tagline                           | Branded tabs without touching every page               | Plan     |
| Regression test           | Unit guard scanning `src/`, README, package files                    | Runs in pre-push and CI; snapshots are out of scope    | Research |
| Dead template code        | Delete `LibBadge.astro`, `template.png`, `Welcome.astro`             | No importers left                                      | Research |
| Language                  | English (app language)                                               | Matches every other view                               | Plan     |

## Scope

**In scope:** home view, layout titles, smoke brand check, config banner link, README identity, package name, dead starter files.

**Out of scope:** new tokens/light mode, auth changes, E2E for `/`, README technical sections.

## Architecture / Approach

`index.astro` → `HomeView.astro` (`signedIn` prop) composed of `Topbar`, `Card`s, `buttonVariants` and a reusable `DimensionLine.astro` SVG. Pure SSR, no client JS.

## Phases at a Glance

| Phase                          | What it delivers                              | Key risk                         |
| ------------------------------ | --------------------------------------------- | -------------------------------- |
| 1. Guard and branded home page | Red→green guard, new `/`, titles, smoke check | `check:ui` rejecting SVG styling |
| 2. Repo identity cleanup       | README, package name, banner link, dead files | Lockfile name drift              |

**Prerequisites:** local Supabase for smoke.
**Estimated effort:** one session.

## Open Risks & Assumptions

- Copy is written by the agent; tone can be iterated after merge.

## Success Criteria (Summary)

- `/` presents Teamensioning, not the template, in both auth states.
- No starter string anywhere the guard scans; all CI checks green.
