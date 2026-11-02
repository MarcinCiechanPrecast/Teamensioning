# Edit Tournament Settings Implementation Plan

## Overview

Let an organizer rename their tournament at any time, and change its win/draw/loss points only while no match score has been entered (roadmap S-07, PRD FR-013). The points lock is enforced in the database so an anonymous score that lands while the edit form is open cannot slip past it.

## Current State Analysis

- `tournaments` has `select`, `insert` and `delete` policies for the owner, but **no UPDATE policy** — nothing can edit a tournament today (`supabase/migrations/20261023120000_create_league_schema.sql:78-84`, `supabase/migrations/20261025140000_add_tournament_delete_policy.sql:8-10`).
- The DB already enforces the settings invariants: name trimmed and 1–80 chars, each points value 0–99, and `win >= draw >= loss` (`20261023120000_create_league_schema.sql:22-26`).
- Scores are written only by `submit_match_score`, a `security definer` RPC callable by anon. It inserts into `results` without locking the tournament row (`supabase/migrations/20261025130000_add_match_results.sql:45-80`).
- Name/points validation lives inside `createLeagueSchema` together with the player rules (`src/lib/validation/league.ts:7,16-41`); the create form island validates client-side with the same schema (`src/components/leagues/CreateLeagueForm.tsx:37-46`).
- The league page shows W/D/L as read-only text and links to a separate delete page; the delete flow is a page plus a POST endpoint that redirects with `?error=` (`src/pages/leagues/[id].astro:78-100`, `src/pages/api/leagues/[id]/delete.ts`).
- `/leagues` and `/api/leagues` are already in `PROTECTED_ROUTES` (`src/middleware.ts:4`).

## Desired End State

- From the league page, the organizer opens **Edit settings** (`/leagues/[id]/edit`), changes the name and — if no score exists yet — the points, and saves. They land back on the league page showing the new values.
- Once any match of the tournament has a result, the edit form shows the points read-only with the note "Points are locked because a score has been entered"; only the name is editable.
- If a score lands between opening the form and saving changed points, nothing is written; the organizer is sent back to the edit form with "A score was just entered — points are now locked" and the form renders locked.
- No database role can change a tournament's points after its first result by any path: the only write path is `update_tournament_settings`, and it serializes against `submit_match_score`.

### Key Discoveries:

- `submit_match_score` is `security definer` and bypasses RLS, so an app-level "count results, then update" check races with it (`20261025130000_add_match_results.sql:51-72`).
- Row locks only serialize transactions that both lock: the new RPC's `FOR UPDATE` on the tournament row needs a matching `FOR SHARE` in `submit_match_score`.
- PostgREST answers a malformed uuid with `22P02`; existing code maps that to "not found" (`src/pages/api/leagues/[id]/delete.ts:5-6,27-29`).
- `database.types.ts` is regenerated with `npx supabase gen types typescript --local` and kept byte-identical (ignored by ESLint/Prettier) — precedent in `context/archive/2026-10-25-link-score-entry/plan.md:66`.

## What We're NOT Doing

- No editing of players, fixtures or the share token.
- No explicit "unlock points" feature. The lock is computed live from `results`; there is no result-deletion path today, so once a score exists the points stay locked.
- No owner `UPDATE` RLS policy on `tournaments`; direct table updates stay impossible.
- No change-history / audit of renamed tournaments or old points.
- No changes to the shared `/t/[token]` page beyond it naturally reflecting the new name/points.
- No migration of the league page's existing literal-colour styling (it stays outside `check:ui` scope).

## Implementation Approach

A single `security definer` RPC, `update_tournament_settings`, becomes the only way to modify a tournament. It checks ownership itself, locks the tournament row `FOR UPDATE`, decides whether the points change is allowed, and either writes everything or nothing. `submit_match_score` is replaced to take `FOR SHARE` on the same row so the two calls are ordered. The app layer extracts a shared `leagueSettingsSchema` (name + points + ordering) reused by create and edit, a POST endpoint maps RPC statuses to redirects, and a new edit page hosts a React form island following the create-form pattern.

## Critical Implementation Details

**Timing & lifecycle** — Under READ COMMITTED, an uncommitted result insert is invisible to the RPC's `exists(results)` check. `submit_match_score` must therefore lock the tournament row `FOR SHARE` in the same `select` that resolves the token and match, before inserting. `FOR SHARE` does not block other score submissions, only a concurrent settings edit (and vice versa).

**Points semantics** — Null points parameters mean "leave points unchanged". Points equal to the current values count as unchanged, so a name-only save, or an organizer resubmitting the same values, never returns `points_locked`.

**User experience spec** — The new edit page and form island use token classes and the existing `src/components/ui/` components (card, alert, button), not the literal-colour classes of the neighbouring league pages, per the AGENTS.md UI rules.

## Phase 1: DB lock and RPC

### Overview

Add the race-safe settings write path and make score submission participate in the lock.

### Changes Required:

#### 1. Settings RPC and score-path lock

**File**: `supabase/migrations/20261102130000_add_update_tournament_settings.sql`

**Intent**: Create `update_tournament_settings` as the only write path for tournament name and points, enforcing ownership and the "points locked after first result" rule atomically. Replace `submit_match_score` so it takes a shared lock on the tournament row before inserting a result. Header comment lists the invariants, as in earlier migrations.

**Contract**:
- `public.update_tournament_settings(p_tournament_id uuid, p_name text, p_points_win int, p_points_draw int, p_points_loss int) returns jsonb`, `language plpgsql`, `security definer`, `set search_path = ''`.
- Returns `{"status": "updated" | "not_found" | "points_locked"}`.
  - `not_found`: no row with that id **and** `owner_id = auth.uid()` (also covers anon / no session).
  - `points_locked`: points are non-null, differ from the stored values, and any `results` row exists for the tournament's matches. Nothing is written.
  - `updated`: name set to `btrim(p_name)`; points set when non-null.
- Points must be all-null or all-non-null; otherwise raise `22023`. Out-of-range or mis-ordered values surface as the existing `tournaments_*_check` violations (`23514`), not swallowed.
- Row lock: `select … from public.tournaments where id = p_tournament_id and owner_id = auth.uid() for update`.
- Grants: `revoke execute … from public, anon; grant execute … to authenticated`.
- `submit_match_score`: `create or replace` with the same signature, return contract and grants; the only change is `for share of t` on its token/match lookup.

#### 2. Regenerated types

**File**: `src/db/database.types.ts`

**Intent**: Pick up the new RPC signature for typed `supabase.rpc` calls.

**Contract**: Output of `npx supabase gen types typescript --local`, byte-identical.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local database: `npx supabase db reset`
- Generated types are up to date: `npx supabase gen types typescript --local | diff - src/db/database.types.ts`
- Lint and type checks pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- In SQL (as an authenticated owner): renaming a tournament with results returns `updated`; changing its points returns `points_locked` and leaves the row unchanged; resubmitting identical points returns `updated`
- In SQL: calling the RPC as a different user or with an unknown id returns `not_found`; calling it as anon is denied
- Existing score entry via the share link still works (`npm run smoke` passes against the local preview)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Validation and endpoint

### Overview

Share the settings validation between create and edit, and add the server endpoint that calls the RPC.

### Changes Required:

#### 1. Shared settings schema

**File**: `src/lib/validation/league.ts`

**Intent**: Extract name + points + `win >= draw >= loss` into `leagueSettingsSchema` and build `createLeagueSchema` from it plus players, so the create form's behaviour and messages are unchanged.

**Contract**: Export `leagueSettingsSchema` (fields `name`, `pointsWin`, `pointsDraw`, `pointsLoss`; ordering issue on path `["pointsWin"]`) and `LeagueSettingsInput`. Also export a name-only schema (or `leagueSettingsSchema.pick({ name: true })`) for locked saves. `createLeagueSchema` keeps its exported name, input shape and error messages.

#### 2. Schema tests

**File**: `src/lib/validation/league.test.ts`

**Intent**: Pin the shared rules so create and edit can't drift.

**Contract**: Cases: valid settings; empty/whitespace and 81-char names; empty points field ("Required", not 0); 100 and negative points; `draw > win` and `loss > draw` rejected with the ordering message; `createLeagueSchema` still rejects duplicate players and fewer than 3.

#### 3. Settings endpoint

**File**: `src/pages/api/leagues/[id]/settings.ts`

**Intent**: Accept the edit form POST, validate, call `update_tournament_settings`, and redirect: `updated` → `/leagues/[id]`; validation failure, `points_locked` or DB check error → `/leagues/[id]/edit?error=<message>`; `not_found` or `22P02` → `/dashboard?error=league-not-found`.

**Contract**: `export const POST: APIRoute`. Form fields `name`, `pointsWin`, `pointsDraw`, `pointsLoss`; when the points fields are absent (locked form), validate with the name-only schema and pass null points. `points_locked` message: "A score was just entered — points are now locked". Unauthenticated → `/auth/signin`, as in sibling endpoints.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint and type checks pass: `npm run lint` and `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Creating a league still shows the same field errors as before (empty name, `draw > win`)
- A hand-crafted POST to `/api/leagues/<other user's id>/settings` redirects to the dashboard with "league not found" and changes nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Edit UI

### Overview

Give the organizer a page to edit settings, with the locked state visible.

### Changes Required:

#### 1. Edit page

**File**: `src/pages/leagues/[id]/edit.astro`

**Intent**: Load the owner's tournament (RLS-scoped, `22P02` → 404 like the league page) and whether any of its matches has a result, then render the form island with current values, the lock flag and the `?error=` message. Non-owner / unknown id renders the existing "League not found" state with status 404.

**Contract**: Reads `tournaments` (`id, name, points_win, points_draw, points_loss`) and a head count of `results` joined through `matches` for that tournament. Layout and styling use token classes and `src/components/ui/` components.

#### 2. Edit form island

**File**: `src/components/leagues/EditLeagueSettingsForm.tsx`

**Intent**: Pre-filled form posting to `/api/leagues/[id]/settings`, validated client-side with `leagueSettingsSchema` (or the name-only schema when locked), reusing `FormField`, `ServerError` and `SubmitButton`. When locked, points are shown read-only with "Points are locked because a score has been entered" and are not submitted.

**Contract**: Props `{ leagueId: string; name: string; pointsWin: number; pointsDraw: number; pointsLoss: number; pointsLocked: boolean; serverError?: string | null }`. Locked mode must omit the points inputs from the form body (disabled inputs are not submitted, which the endpoint relies on).

#### 3. Entry link

**File**: `src/pages/leagues/[id].astro`

**Intent**: Add an "Edit settings" link to `/leagues/[id]/edit` next to the existing footer links; no other changes to this page (it is also touched by S-06).

**Contract**: One anchor, inserted as its own lines between the existing "Back to dashboard" and "Delete league" anchors in the footer `<p>`. Touch nothing else in the file: S-06 (`organizer-score-correction`) edits this page's imports, loader and fixture list, and the two changes must merge without a conflict. Do not reformat or re-indent surrounding lines.

### Success Criteria:

#### Automated Verification:

- Lint, type checks and build pass: `npm run lint`, `npx astro check`, `npm run build`
- UI literal guard still passes: `npm run check:ui`

#### Manual Verification:

- On a league with no scores: rename and change points to 2/1/0, save, and the league page and the shared `/t/[token]` page both show the new name and W 2 / D 1 / L 0
- After entering one score via the share link, the edit page shows points read-only with the lock note; a rename still saves
- Race: open the edit form on an unscored league, enter a score in another tab, then save changed points — the form returns locked with "A score was just entered — points are now locked" and the points are unchanged
- Client-side errors show for an empty name and `draw > win` without a round-trip
- Visiting `/leagues/<other user's id>/edit` shows "League not found"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `leagueSettingsSchema` and `createLeagueSchema` boundaries in `src/lib/validation/league.test.ts` (see Phase 2).

### Integration Tests:

- `npm run smoke` after Phase 1 confirms score submission still works with the new `FOR SHARE` lock.

### Manual Testing Steps:

1. Create a league, edit name and points before any score, and confirm both pages reflect it.
2. Enter a score via the share link, reopen edit, and confirm points are locked and the rename still works.
3. Reproduce the race in two tabs and confirm the whole save is rejected.
4. As a second user, try the edit page and the endpoint for the first user's league.

## Performance Considerations

The `FOR SHARE` lock in `submit_match_score` is held only for the length of one insert and conflicts only with a concurrent settings edit of the same tournament; score submissions do not block each other.

## Migration Notes

The migration only adds a function and replaces another with the same signature; no data changes and no backfill. Rollback is a migration restoring the previous `submit_match_score` body and dropping `update_tournament_settings`.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-07)
- PRD requirement: `context/foundation/prd.md` FR-013
- Score write path: `supabase/migrations/20261025130000_add_match_results.sql:45-83`
- Similar endpoint pattern: `src/pages/api/leagues/[id]/delete.ts`
- Similar form island: `src/components/leagues/CreateLeagueForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB lock and RPC

#### Automated

- [ ] 1.1 Migration applies cleanly on a fresh local database: `npx supabase db reset`
- [ ] 1.2 Generated types are up to date: `npx supabase gen types typescript --local | diff - src/db/database.types.ts`
- [ ] 1.3 Lint and type checks pass: `npm run lint` and `npx astro check`

#### Manual

- [ ] 1.4 In SQL: rename with results returns `updated`; changed points return `points_locked` unchanged; identical points return `updated`
- [ ] 1.5 In SQL: other user or unknown id returns `not_found`; anon is denied
- [ ] 1.6 Existing score entry via the share link still works (`npm run smoke` passes)

### Phase 2: Validation and endpoint

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Lint and type checks pass: `npm run lint` and `npx astro check`
- [ ] 2.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Creating a league still shows the same field errors as before
- [ ] 2.5 POST to another user's settings endpoint redirects with "league not found" and changes nothing

### Phase 3: Edit UI

#### Automated

- [ ] 3.1 Lint, type checks and build pass: `npm run lint`, `npx astro check`, `npm run build`
- [ ] 3.2 UI literal guard still passes: `npm run check:ui`

#### Manual

- [ ] 3.3 Unscored league: rename and points 2/1/0 save and show on league and shared pages
- [ ] 3.4 After one score: points read-only with lock note; rename still saves
- [ ] 3.5 Race in two tabs rejects the whole save with the "just entered" message
- [ ] 3.6 Client-side errors for empty name and draw > win without a round-trip
- [ ] 3.7 Another user's edit page shows "League not found"
