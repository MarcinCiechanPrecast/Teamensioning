# My Tournaments List Implementation Plan

## Overview

Give a signed-in organizer a way back to their tournaments (FR-004) and let them permanently delete one after an explicit confirmation (FR-012). Roadmap slice S-02; the list ships first as a read-only view, then the irreversible delete is added behind a server-rendered confirm page.

## Current State Analysis

- `/dashboard` is a placeholder: it shows the user's email, a "Create league" button and "Sign out" (`src/pages/dashboard.astro`). There is no list, so the only way back to a league is a bookmarked `/leagues/[id]` URL.
- `/leagues/[id]` (`src/pages/leagues/[id].astro`) already loads one league via the user-scoped Supabase client and treats "not found" and "not the owner" identically (404), because RLS only returns the owner's rows.
- RLS on `tournaments` has only `tournaments_select_own` and `tournaments_insert_own`. The create-league and link-score-entry migrations deliberately left UPDATE/DELETE policies to later slices.
- `players`, `matches` and `results` all reference their parent with `on delete cascade`, so deleting a `tournaments` row removes the whole league. Referential cascades are not subject to RLS, so no DELETE policies are needed on child tables.
- `/dashboard`, `/leagues` and `/api/leagues` are all in `PROTECTED_ROUTES` (`src/middleware.ts:4`); new pages and endpoints under those prefixes inherit the redirect for anonymous users.
- Form endpoints POST and redirect with `?error=` (`src/pages/api/leagues/index.ts`). Pages use the cosmic card layout.

## Desired End State

The dashboard lists the organizer's own tournaments, newest first, each linking to its league page; a new organizer sees a "Create your first league" call to action. The league page has a "Delete league" link that opens a confirm page naming the league; submitting "Delete permanently" removes it and everything under it, and returns to the dashboard. A different signed-in user can neither see nor delete someone else's league.

Verify: `npm run smoke` passes the new list, delete and cross-owner steps against a local Supabase.

### Key Discoveries:

- `src/pages/leagues/[id].astro:19-33` — owner-scoped load plus the `22P02` (malformed uuid) → not-found convention to reuse.
- `supabase/migrations/20261023120000_create_league_schema.sql` — policy style: `to authenticated`, `(select auth.uid())`, one policy per operation.
- `src/types.ts` — `TournamentDTO` already carries `id`, `name`, `created_at`; the list needs nothing new.
- `scripts/smoke.mjs` — single cookie jar, sequential step table; a second user needs the jar reset (sign out, then sign up/in).

## What We're NOT Doing

- No rename, points edit (S-07) or score correction (S-06).
- No soft delete, undo, trash or audit trail; deletion is permanent (PRD FR-012).
- No search, pagination or sorting controls on the list.
- No type-the-name dialog or client-side confirm; confirmation is a server-rendered page.
- No new UPDATE policy and no DELETE policy on `players`, `matches` or `results`.

## Implementation Approach

Two phases, read-only first. Phase 1 adds the list with no schema change. Phase 2 adds the `tournaments_delete_own` policy, the confirm page and the delete endpoint, then extends the smoke script — including a cross-owner delete attempt, which is the one real risk in this slice. The delete endpoint uses the user-scoped client with `.delete().eq("id", id).select("id")` so RLS decides ownership and zero returned rows means "not found / not yours".

## Phase 1: My tournaments list

### Overview

The dashboard shows the signed-in organizer's tournaments, newest first, linking to each league page.

### Changes Required:

#### 1. Dashboard list

**File**: `src/pages/dashboard.astro`

**Intent**: Load the organizer's tournaments through the user-scoped Supabase client and render them as a list of links, replacing the placeholder text. Keep "Create league" and "Sign out". Show an empty state with a "Create your first league" call to action when there are none, and a visible message when an `?error=` query param is present (used by Phase 2).

**Contract**: Query `tournaments` selecting `id, name, created_at` ordered by `created_at` descending then `id` descending (deterministic when two leagues share a timestamp). Each row links to `/leagues/{id}`. A query error throws, as `leagues/[id].astro` does. Supabase not configured renders the empty list rather than crashing (the `createClient` null case).

#### 2. Back link on the league page

**File**: `src/pages/leagues/[id].astro`

**Intent**: Add a "Back to dashboard" link so the list is reachable from a league, matching `leagues/new.astro`.

**Contract**: Link to `/dashboard`; no data changes.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Production build succeeds: `npm run build`
- Existing smoke steps still pass: `npm run smoke`

#### Manual Verification:

- A brand-new account sees the empty state with a working "Create your first league" link
- After creating two leagues, the dashboard lists both, newest first, and each opens its league page
- A second account's dashboard does not show the first account's leagues

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Delete with confirmation

### Overview

Add owner-only deletion: DB policy, confirm page, POST endpoint, a delete entry point on the league page, and smoke coverage.

### Changes Required:

#### 1. Delete policy migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_tournament_delete_policy.sql`

**Intent**: Allow an authenticated owner to delete their own tournament; nothing else changes. Child rows go via the existing `on delete cascade`.

**Contract**: `create policy "tournaments_delete_own" on public.tournaments for delete to authenticated using (owner_id = (select auth.uid()));` — header comment states the invariant (only the owner may delete; anon has no policy). Use the repo's `YYYYMMDDHHmmss_short_description.sql` naming and a timestamp after `20261025130000`.

#### 2. Confirm page

**File**: `src/pages/leagues/[id]/delete.astro` (new; the existing `src/pages/leagues/[id].astro` stays where it is — Astro routes the sibling folder fine)

**Intent**: Show the league name and what will be lost (players and matches count) with a warning that deletion is permanent, a "Delete permanently" POST form and a "Cancel" link back to the league. A non-owner or malformed id gets the same 404 page as `/leagues/[id]`.

**Contract**: GET only renders; the form POSTs to `/api/leagues/{id}/delete`. Reuse the `22P02` → not-found handling. The page makes no change itself.

#### 3. Delete endpoint

**File**: `src/pages/api/leagues/[id]/delete.ts`

**Intent**: Delete the league if (and only if) the caller owns it, then send them to the dashboard.

**Contract**: `POST` export only. Anonymous caller → redirect to `/auth/signin` (middleware already covers `/api/leagues`; keep the explicit `locals.user` check like `api/leagues/index.ts`). Run `delete().eq("id", id).select("id")` with the user-scoped client; success with one row → redirect to `/dashboard`; zero rows or `22P02` → redirect to `/dashboard?error=` with a "League not found" message; other errors → redirect to `/dashboard?error=` with the message, following the `failWith` pattern.

#### 4. Delete entry point on the league page

**File**: `src/pages/leagues/[id].astro`

**Intent**: Add a "Delete league" link (not a button that submits) to `/leagues/{id}/delete`, so a single click can never delete.

**Contract**: Plain anchor; styled as a destructive secondary action.

#### 5. Smoke coverage

**File**: `scripts/smoke.mjs`

**Intent**: Prove list, delete and cross-owner isolation end to end.

**Contract**: Add steps for: the dashboard HTML contains the created league's name; GET of the confirm page returns 200 for the owner; POST delete as a different signed-in user (sign out, sign up/in a second account, then attempt) does not delete — redirect with an error and the league still renders for the owner afterwards; POST delete as the owner redirects to `/dashboard` and the league page then returns 404; the dashboard no longer lists it; anonymous POST to the delete endpoint redirects to `/auth/signin`. Reset the cookie jar between users.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Unit tests pass: `npm test`
- Production build succeeds: `npm run build`
- Smoke passes including cross-owner delete: `npm run smoke`

#### Manual Verification:

- "Delete league" opens the confirm page; "Cancel" returns to the league untouched
- "Delete permanently" removes the league, lands on the dashboard and the league no longer appears
- A previously shared `/t/<token>` link for the deleted league shows not found
- Opening another user's `/leagues/<id>/delete` shows the not-found page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None planned: the slice adds no extracted business logic; behavior lives in a SQL policy and thin pages/endpoints.

### Integration Tests:

- `scripts/smoke.mjs` steps above — the cross-owner delete is the key assertion, since the PRD's FR-012 risk is an irreversible wipe.

### Manual Testing Steps:

1. Sign up a fresh account; confirm the empty state.
2. Create two leagues; confirm order and links.
3. Delete one via the confirm page; confirm it is gone and the other remains.
4. Hit the deleted league's share link; confirm not found.

## Performance Considerations

None; the list is a single indexed query (`tournaments_owner_id_idx`) with no pagination in MVP.

## Migration Notes

Additive: one policy. No data backfill. The delete is irreversible by design.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-02), PRD FR-004 and FR-012 in `context/foundation/prd.md`
- Owner-scoped load pattern: `src/pages/leagues/[id].astro:19-33`
- RLS policy style: `supabase/migrations/20261023120000_create_league_schema.sql`
- Form endpoint pattern: `src/pages/api/leagues/index.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: My tournaments list

#### Automated

- [x] 1.1 Type check passes: `npx astro check` — 78765b7
- [x] 1.2 Lint passes: `npm run lint` — 78765b7
- [x] 1.3 Production build succeeds: `npm run build` — 78765b7
- [x] 1.4 Existing smoke steps still pass: `npm run smoke` — 78765b7

#### Manual

- [x] 1.5 A brand-new account sees the empty state with a working "Create your first league" link — 78765b7
- [x] 1.6 After creating two leagues, the dashboard lists both, newest first, and each opens its league page — 78765b7
- [x] 1.7 A second account's dashboard does not show the first account's leagues — 78765b7

### Phase 2: Delete with confirmation

#### Automated

- [x] 2.1 Migration applies cleanly: `npx supabase db reset` — ddeb237
- [x] 2.2 Type check passes: `npx astro check` — ddeb237
- [x] 2.3 Lint passes: `npm run lint` — ddeb237
- [x] 2.4 Unit tests pass: `npm test` — ddeb237
- [x] 2.5 Production build succeeds: `npm run build` — ddeb237
- [x] 2.6 Smoke passes including cross-owner delete: `npm run smoke` — ddeb237

#### Manual

- [x] 2.7 "Delete league" opens the confirm page; "Cancel" returns to the league untouched — ddeb237
- [x] 2.8 "Delete permanently" removes the league, lands on the dashboard and the league no longer appears — ddeb237
- [x] 2.9 A previously shared `/t/<token>` link for the deleted league shows not found — ddeb237
- [x] 2.10 Opening another user's `/leagues/<id>/delete` shows the not-found page — ddeb237
