# Shared League Link — Plan Brief

> Full plan: `context/changes/shared-league-link/plan.md`

## What & Why

Players need to see their league without an account. We give each league an unguessable link: anyone holding it can view the fixtures and filter them by player, and the organizer copies it from their league page. This is roadmap slice S-03 and the first anonymous access path in the app.

## Starting Point

Leagues are owner-only: RLS has no anon policies, `/leagues` is a protected route, and the owner page lists fixtures with no filter or link. Tournament ids are random uuids but are also the owner's URL key. No scores exist yet.

## Desired End State

`/t/<token>` works in a private window and lists fixtures, filterable by player; unknown tokens return 404. Anonymous clients cannot read tables or list tournaments. The organizer sees and copies the link.

## Key Decisions Made

| Decision       | Choice                                            | Why                                                                  | Source |
| -------------- | ------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| Link secret    | Separate `share_token` column, route `/t/<token>` | Owner id and public secret stay distinct; `/leagues` stays protected | Plan   |
| Anon access    | Security-definer RPC `get_shared_league(token)`   | Tables stay closed; a token cannot enumerate other leagues           | Plan   |
| Player filter  | Server-side `?player=` GET form                   | No JS, bookmarkable, matches the SSR style                           | Plan   |
| Organizer UI   | Read-only URL field + Copy button island          | Directly meets "organizer can copy the link"                         | Plan   |
| Testing        | Vitest for the filter helper + extended smoke     | Verifies the unlisted boundary end-to-end in CI                      | Plan   |
| Unknown player | Treated as no filter (all unplayed matches)       | Harmless for a hand-edited URL; avoids an error state                | Plan   |
| "Unplayed"     | Helper takes played ids; empty until S-04         | S-04 plugs in without rework                                         | Plan   |

## Scope

**In scope:** token column + backfill, anon RPC, `/t/[token]` page with filter, copy-link field, unit + smoke tests.

**Out of scope:** score entry, leaderboard, link rotation, tournament list/delete, anon RLS policies, service-role key.

## Architecture / Approach

A migration adds `share_token` and a `security definer` function granted to `anon`. The Astro page calls it, validates the token shape, filters with a pure helper, and returns 404 on null. The organizer page reads `share_token` through existing owner RLS and renders a React copy field.

## Phases at a Glance

| Phase                     | What it delivers                          | Key risk                                                 |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| 1. Data layer             | column, backfill, RPC, regenerated types  | RPC leaking fields (owner id, token) or too-broad grants |
| 2. Public page and filter | `/t/[token]`, filter helper + tests       | Token handling; 404 must not reveal existence            |
| 3. Organizer link + smoke | Copy field, smoke checks for the boundary | Smoke needs body access and cookie-less requests         |

**Prerequisites:** S-01 done (it is); local Supabase running via Docker.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- No rotation: a leaked token is permanent (accepted in PRD FR-005).
- Assumes PostgREST can call the definer function as `anon` with the project's key.

## Success Criteria (Summary)

- A player opens the link without signing in and finds their unplayed matches.
- Direct anonymous table access returns nothing; the smoke test proves it in CI.
