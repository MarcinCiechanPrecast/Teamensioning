# Live Leaderboard (S-05) Implementation Plan

## Overview

Show a leaderboard on the shared link page `/t/<token>`: for every player, played, won/drawn/lost, goals for/against, goal difference and points, ordered by points, then goal difference, then goals scored. It is computed on each request from the scores `get_shared_league` already returns, so the next view after any score is entered reflects it. "Live" means exactly that (PRD NFR: no stale standings); there is no Realtime, polling or caching.

## Current State Analysis

- `get_shared_league` already returns the points settings, the player list (ordered by name, id) and every match with `score_a`/`score_b` (null when unplayed) (`supabase/migrations/20261025130000_add_match_results.sql:93-130`). No schema or RPC change is needed.
- `toSharedLeague` maps that payload to `SharedLeagueDTO` (`league`, `players`, `fixtures` with `score: {a, b} | null`) (`src/lib/services/shared-league.ts:44-90`, `src/types.ts:19-31`).
- `/t/[token].astro` is fully server-rendered per request, already derives `playedFixtures` from `shared.fixtures`, and has no caching (`src/pages/t/[token].astro:41-47`).
- Nothing computes standings. Business logic lives in `src/lib/services/*.ts` with a colocated `*.test.ts` (Vitest).
- AGENTS.md UI rules: new markup uses design tokens (`bg-card`, `text-muted-foreground`, …) and `src/components/ui/` pieces; no new literal colours, palette classes or `-[..]` values. `check:ui` does not scan `/t/[token].astro` yet, but new code in it must still comply.

## Desired End State

A link holder opens `/t/<token>` and sees a standings table above the fixtures. Every player appears (including players with no played matches, all zeros). After a score is saved through the existing form, the next view shows updated rows and order. Verified by Vitest on the calculation and a browser walkthrough.

### Key Discoveries:

- Points come from the tournament settings (`points_win/draw/loss`), not hard-coded 3/1/0 (`shared-league.ts:62-68`).
- A match with `score === null` contributes nothing, not even to "played" (PRD FR-008).
- The tiebreak ends at goals scored; the data's name/id order is not a decision, so full ties are given a shared rank (decision below).

## What We're NOT Doing

- Realtime, polling, auto-refresh or HTTP caching; "live" = next view reflects the score.
- The leaderboard on the organizer page `/leagues/[id]` (it loads data via RLS tables, a different path).
- Head-to-head tiebreaker, score history, or any schema/RPC/migration change.
- A separate `/leaderboard` route.
- Migrating the rest of `/t/[token].astro` to design tokens (out of scope; only the new markup complies).

## Implementation Approach

Keep the calculation a pure function over `SharedLeagueDTO` so it is unit-testable without Supabase, then render its result as a server-rendered table. Ordering: points desc, goal difference desc, goals for desc, then name ascending (then id, only to keep the sort stable). Rank is competition-style: a player's rank is 1 + the number of players strictly ahead on points, goal difference and goals for, so players level on all three share a rank (1, 1, 3).

## Phase 1: Standings calculation

### Overview

Add the pure standings function, its DTO and tests.

### Changes Required:

#### 1. Standing type

**File**: `src/types.ts`

**Intent**: Add the row type the table renders.

**Contract**: `StandingDTO { rank, player: PlayerDTO, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points }`, all numbers.

#### 2. Standings service

**File**: `src/lib/services/standings.ts`

**Intent**: Compute one `StandingDTO` per league player from the fixtures and points settings, sorted and ranked as described above.

**Contract**: `computeStandings(shared: Pick<SharedLeagueDTO, "league" | "players" | "fixtures">): StandingDTO[]`. Fixtures with `score === null` are ignored. A win adds `points_win`, a draw `points_draw`, a loss `points_loss` to the respective side. Every player in `players` is returned.

#### 3. Tests

**File**: `src/lib/services/standings.test.ts`

**Intent**: Pin the PRD rules and the roadmap's required cases.

**Contract**: Cases: no scores (all zeros, everyone rank 1, alphabetical); unplayed matches add no played/points; custom points (e.g. 2/1/0 and a non-zero loss value); order by points, then goal difference, then goals for; two players level on all three share a rank and the next rank skips (1, 1, 3) with name order inside the tie; draw increments `drawn` for both sides.

### Success Criteria:

#### Automated Verification:

- Standings tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- The test names read as the PRD rules (points, tiebreakers, unplayed, shared rank)

**Implementation Note**: After this phase and its automated checks pass, pause for manual confirmation before Phase 2.

---

## Phase 2: Render on the share page

### Overview

Show the table above the fixtures, with an empty state, and verify the "next view reflects it" behaviour.

### Changes Required:

#### 1. Leaderboard section

**File**: `src/pages/t/[token].astro` (or a small `src/components/leagues/Leaderboard.astro` it imports, if the markup is long)

**Intent**: Call `computeStandings(shared)` in the frontmatter and render a table directly under the title/points line, before the player filter: columns Rank, Player, P, W, D, L, GF, GA, GD, Pts. Goal difference shows an explicit sign for positive values. When no match has a score, show a short "No scores yet" note instead of a misleading all-zero ranking.

**Contract**: Semantic `<table>` with `<caption>`/headers for accessibility; horizontal overflow allowed inside the `max-w-lg` card so it works on mobile. New markup uses token classes only (`text-muted-foreground`, `border-border`, …), no palette classes, literal colours or `-[..]` values; reuse `src/components/ui/` pieces if one fits. The existing page markup is left as is.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check and build pass: `npx astro check` and `npm run build`
- UI literal guard passes: `npm run check:ui`
- Unit tests pass: `npm test`

#### Manual Verification:

- Open a seeded league link: the table lists all players above the fixtures
- Save a score via the form: the next view (the redirect) shows updated P/W/D/L/GF/GA/GD/Pts and order
- Two players level on all three tiebreakers show the same rank and the next rank is skipped
- A league with no scores shows the "No scores yet" state, not a ranked table
- The table is readable (contrast) on the page background and does not break a narrow mobile viewport

---

## Testing Strategy

### Unit Tests:

- `computeStandings`: ties, unplayed matches, custom points, shared rank numbering (Phase 1).

### Integration Tests:

- None added; the existing smoke test is unchanged since no endpoint changes.

### Manual Testing Steps:

1. Create a league with 3-4 players, open its share link.
2. Enter a few scores, including a draw and a level-on-everything pair, and check the table after each save.

## Performance Considerations

Standings are O(matches + players) per request over data already fetched; no extra query.

## References

- Roadmap: `context/foundation/roadmap.md` (S-05)
- PRD: `context/foundation/prd.md` (FR-008, FR-011, NFR no stale standings)
- Similar service + test pattern: `src/lib/services/shared-league.ts`, `src/lib/services/shared-league.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Standings calculation

#### Automated

- [x] 1.1 Standings tests pass: `npm test` — 743a984
- [x] 1.2 Lint passes: `npm run lint` — 743a984
- [x] 1.3 Type check passes: `npx astro check` — 743a984

#### Manual

- [x] 1.4 The test names read as the PRD rules (points, tiebreakers, unplayed, shared rank) — 743a984

### Phase 2: Render on the share page

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 5a31d1e
- [x] 2.2 Type check and build pass: `npx astro check` and `npm run build` — 5a31d1e
- [x] 2.3 UI literal guard passes: `npm run check:ui` — 5a31d1e
- [x] 2.4 Unit tests pass: `npm test` — 5a31d1e

#### Manual

- [x] 2.5 Open a seeded league link: the table lists all players above the fixtures — 5a31d1e
- [x] 2.6 Save a score via the form: the next view (the redirect) shows updated P/W/D/L/GF/GA/GD/Pts and order — 5a31d1e
- [ ] 2.7 Two players level on all three tiebreakers show the same rank and the next rank is skipped
- [x] 2.8 A league with no scores shows the "No scores yet" state, not a ranked table — 5a31d1e
- [x] 2.9 The table is readable (contrast) on the page background and does not break a narrow mobile viewport — 5a31d1e
