# Shared League Link Implementation Plan

## Overview

Give every league an unguessable share link. Anyone holding `/t/<token>` can, without signing in, view that one league's fixtures and filter them by player to see that player's unplayed matches. The organizer sees the link on their league page and can copy it. (Roadmap slice S-03; PRD US-01, FR-005, FR-010.)

## Current State Analysis

- Tournaments, players and matches are readable only by `authenticated` owners through RLS; there are no `anon` policies (`supabase/migrations/20261023120000_create_league_schema.sql`, RLS section).
- `src/middleware.ts:4` redirects anything under `/dashboard`, `/leagues`, `/api/leagues` to sign-in. The owner's league page is `src/pages/leagues/[id].astro`, loaded through the user's RLS-scoped client, rendering fixtures as a plain ordered list with no filter and no link.
- Tournament ids are `gen_random_uuid()` and are the owner's URL key, so they should not double as the public secret.
- Scores do not exist yet (S-04), so every match is currently "unplayed".
- Link rotation is a PRD non-goal: a weak token can never be repaired, so the token must be strong from day one.

## Desired End State

- `tournaments.share_token` exists, is unique, random and non-null for every tournament (existing ones backfilled).
- An anonymous request to `/t/<valid token>` renders the league name, points and fixtures; `?player=<player id>` narrows the list to that player's unplayed matches. An unknown or malformed token returns 404.
- Anonymous clients cannot select from `tournaments`, `players` or `matches` directly, and cannot enumerate tournaments; the only anon entry point is the token-keyed RPC.
- The organizer's `/leagues/<id>` page shows the full share URL in a read-only field with a working Copy button.

### Key Discoveries:

- `create_league` is `security invoker` and returns only the id, so a column default fills `share_token` with no RPC change (`...create_league_schema.sql`, create_league).
- `scripts/smoke.mjs` already creates a league through `/api/leagues` and tracks cookies, but `request()` returns only status and location, so it needs body access to find the token.
- Unit tests use vitest co-located with the code (`src/lib/services/fixtures.test.ts`), run by `npm run test`.
- `src/db/database.types.ts` is generated, so it must be regenerated after the migration (supabase CLI is a devDependency).

## What We're NOT Doing

- Score entry, played-match tracking, leaderboard (S-04 / S-05). The filter helper only takes a "played match ids" input so S-04 can feed it later.
- Link rotation or revocation (PRD non-goal).
- Tournaments list or deletion (S-02).
- Anon RLS policies on tables, a service-role key, or a client-side filter island.

## Implementation Approach

Token in a new column, access through a `security definer` RPC granted only to `anon` and `authenticated`, and a server-rendered public page. Three phases, each independently verifiable: data layer, public page, organizer UI plus end-to-end smoke.

## Phase 1: Data layer

### Overview

Add the secret and the single anonymous read path.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_add_share_token.sql` (naming `YYYYMMDDHHmmss_short_description.sql`, later than `20261023120000`)

**Intent**: Add `tournaments.share_token` and `get_shared_league(p_token)`, keeping tables closed to anon.

**Contract**:

- `share_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')` (64 hex chars from two uuid draws, no extension needed); adding the column with that default backfills existing rows. Add a check that the token is 64 lowercase hex chars.
- The existing `tournaments_select_own` policy already lets the owner select `share_token`; add no anon policies.
- `public.get_shared_league(p_token text) returns jsonb`, `security definer`, `set search_path = ''`, stable. Returns `null` when no tournament matches; otherwise `{ league: {name, points_win, points_draw, points_loss}, players: [{id, name}], matches: [{id, position, player_a_id, player_b_id}] }` ordered by `position`. Must not return `owner_id`, the tournament `id`, or `share_token`.
- `revoke execute ... from public`; `grant execute ... to anon, authenticated` (the existing function revokes from `public, anon`; here anon is the point).

#### 2. Types

**Files**: `src/db/database.types.ts` (regenerate), `src/types.ts`

**Intent**: Reflect the new column and give the shared view its own DTO.

**Contract**: Regenerate types with the supabase CLI after the migration. Add `SharedLeagueDTO` (`league`, `players: PlayerDTO[]`, `fixtures: FixtureDTO[]`) to `src/types.ts`; `TournamentDTO` stays unchanged, the organizer page selects `share_token` separately.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh local database: `npx supabase db reset`
- Types regenerate with the new column and function, and typecheck passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- As `anon` in psql or Studio, direct table selects return nothing or are denied, while `get_shared_league` returns JSON for a valid token and null for an invalid one
- Existing tournaments each have a distinct 64-char token after the migration

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Public page and filter

### Overview

Anonymous `/t/<token>` page with a server-side player filter.

### Changes Required:

#### 1. Filter helper

**File**: `src/lib/services/shared-league.ts` (+ `shared-league.test.ts`)

**Intent**: Pure functions to turn the RPC payload into `SharedLeagueDTO` and to filter fixtures.

**Contract**: `filterFixturesByPlayer(fixtures, playerId | null, playedMatchIds = new Set())` returns fixtures where the player is `playerA` or `playerB` and the match id is not in `playedMatchIds`; `null`, or a player id not present in the league, returns all unplayed fixtures (an unknown `?player=` is treated as no filter). Original `position` order is preserved.

#### 2. Public page

**File**: `src/pages/t/[token].astro`

**Intent**: Load the league through `supabase.rpc("get_shared_league")` with the existing `createClient` (no session needed, it runs as anon), and render name, points, filter form and fixture list in the visual style of `leagues/[id].astro`.

**Contract**: A token that is not 64 lowercase hex chars, or an RPC that returns `null`, sets status 404 with a "League not found" view and does not reveal whether the token ever existed. The filter is a plain `GET` form with a `player` select (one option per player plus "All players") and shows the count of matches displayed. `/t` is not in `PROTECTED_ROUTES`; no middleware change.

### Success Criteria:

#### Automated Verification:

- Filter unit tests pass (player on either side, no fixtures for the player, unknown player id returns all, played ids excluded, order preserved): `npm run test`
- Typecheck and lint pass: `npx astro check && npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- `/t/<token>` opens in a private window without signing in and shows all fixtures
- `?player=<id>` shows only that player's matches; a garbage `?player=` shows all
- A tampered token returns the 404 view; `/leagues/<id>` still redirects an anonymous visitor to sign-in

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Organizer link and smoke

### Overview

Let the organizer copy the link and verify the access boundary in CI.

### Changes Required:

#### 1. Copy-link island

**Files**: `src/components/leagues/CopyLinkField.tsx`, `src/pages/leagues/[id].astro`

**Intent**: Show the full share URL (`Astro.url.origin + "/t/" + token`) in a read-only input with a Copy button on the organizer page.

**Contract**: `CopyLinkField` takes a `url: string` prop, uses `navigator.clipboard.writeText`, shows a brief "Copied" state, and is built with the existing `Button` component. The owner query adds `share_token`. The input carries a `data-share-url` attribute as a stable hook for smoke.

#### 2. Smoke extension

**File**: `scripts/smoke.mjs`

**Intent**: Prove the unlisted-link boundary against a running server, as CI already does.

**Contract**: `request()` additionally returns the response body text. New steps after "fixtures page renders for owner": extract the share URL from the owner page; then `GET` it with no cookies expecting 200; `GET /t/<64 zeros>` expecting 404; `GET /leagues/<id>` with no cookies expecting 302 to `/auth/signin`. Anonymous steps must not send the cookie jar.

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm run test`
- Lint, typecheck and build pass: `npm run lint && npx astro check && npm run build`
- Smoke passes against a running local server: `npm run smoke`

#### Manual Verification:

- Copy button puts the full `/t/<token>` URL on the clipboard and it opens in a private window
- Organizer page for another user's league still shows "League not found"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `filterFixturesByPlayer`: player on either side, no matches for the player, unknown or `null` player, played ids excluded, order preserved.

### Integration Tests:

- `npm run smoke` extended as above (anonymous 200, unknown token 404, owner route still protected).

### Manual Testing Steps:

1. Create a league, copy the link, open it in a private window.
2. Filter by each player and check the match count equals players minus 1.
3. Alter one character of the token and confirm 404.
4. In Studio as `anon`, confirm direct table selects expose nothing.

## Performance Considerations

One RPC round trip per public page view; leagues are at most 20 players and 190 matches, so no caching is needed.

## Migration Notes

Adding a column with a volatile default rewrites the table and backfills a distinct token per row. Tournaments are few at this stage. Owner RLS is unchanged.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (US-01, FR-005, FR-010; non-goal: no link rotation)
- Owner page pattern: `src/pages/leagues/[id].astro`
- Test style: `src/lib/services/fixtures.test.ts`
- Lessons: `context/foundation/lessons.md` (read env via `astro:env/server`; no lodash)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 Migration applies on a fresh local database: `npx supabase db reset` — 0d2bc56
- [x] 1.2 Types regenerate with the new column and function, and typecheck passes: `npx astro check` — 0d2bc56
- [x] 1.3 Lint passes: `npm run lint` — 0d2bc56

#### Manual

- [x] 1.4 As `anon`, direct table selects return nothing or are denied, while `get_shared_league` returns JSON for a valid token and null for an invalid one — 0d2bc56
- [x] 1.5 Existing tournaments each have a distinct 64-char token after the migration — 0d2bc56

### Phase 2: Public page and filter

#### Automated

- [x] 2.1 Filter unit tests pass: `npm run test` — 8c6cd0e
- [x] 2.2 Typecheck and lint pass: `npx astro check && npm run lint` — 8c6cd0e
- [x] 2.3 Build succeeds: `npm run build` — 8c6cd0e

#### Manual

- [x] 2.4 `/t/<token>` opens in a private window without signing in and shows all fixtures — 8c6cd0e
- [x] 2.5 `?player=<id>` shows only that player's matches; a garbage `?player=` shows all — 8c6cd0e
- [x] 2.6 A tampered token returns the 404 view; `/leagues/<id>` still redirects an anonymous visitor to sign-in — 8c6cd0e

### Phase 3: Organizer link and smoke

#### Automated

- [x] 3.1 Full test suite passes: `npm run test` — dc7076d
- [x] 3.2 Lint, typecheck and build pass: `npm run lint && npx astro check && npm run build` — dc7076d
- [x] 3.3 Smoke passes against a running local server: `npm run smoke` — dc7076d

#### Manual

- [x] 3.4 Copy button puts the full `/t/<token>` URL on the clipboard and it opens in a private window — dc7076d
- [x] 3.5 Organizer page for another user's league still shows "League not found" — dc7076d
