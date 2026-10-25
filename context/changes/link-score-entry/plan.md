# Link Score Entry (S-04) Implementation Plan

## Overview

Let anyone holding a `/t/<token>` link enter the score of an unplayed match without signing in. The first submission wins; a later attempt is told the score is already entered and sees the stored score. This is the app's first anonymous write, so write-once and the tournament boundary are enforced in the database, not in application code.

## Current State Analysis

- The only anonymous path is the `get_shared_league` security-definer RPC. Tables have RLS and no anon policies (`supabase/migrations/20261025120000_add_share_token.sql:27-64`, `20261023120000_create_league_schema.sql:79-117`).
- Scores do not exist: `matches` has no score columns and `get_shared_league` returns no score data. `SharedLeagueDTO` / `FixtureDTO` carry none (`src/types.ts:19-31`).
- `/t/[token].astro` lists fixtures with a GET player filter; `filterFixturesByPlayer` already accepts `playedMatchIds` (`src/lib/services/shared-league.ts:91-101`).
- API routes use `POST` exports, zod `safeParse`, `supabase.rpc`, and redirect with `?error=` (`src/pages/api/leagues/index.ts:11-55`). Middleware protects only `/dashboard`, `/leagues`, `/api/leagues` (`src/middleware.ts:4`).
- Vitest and `scripts/smoke.mjs` (with an `anonymous` mode) exist.

## Desired End State

A link holder opens `/t/<token>`, sees each unplayed match with two score inputs and a submit button, and sees played matches with their stored score. Submitting a valid score stores it and redirects back to the page. Submitting for a match that already has a score changes nothing and shows an "already entered" notice with the stored score. Verified by Vitest (validation, parser), smoke (anonymous submit, second submit, bad token, foreign match) and a manual walkthrough.

### Key Discoveries:

- Write-once must be a database guarantee: `results.match_id` as primary key with `insert ... on conflict do nothing`; "no row inserted" means already entered (`research.md`, Concurrency).
- The RPC must resolve the tournament from the token and require `matches.tournament_id = tournament.id`; the client never sends a tournament id (`20261023120000_create_league_schema.sql:50-52`).
- Empty score fields must be rejected: `Number("")` is `0` (`src/lib/validation/league.ts:3-7`).
- Score bound 0–99 is mirrored in a DB check constraint, like `points_*` (`league.ts:7`, schema migration lines 16-18).
- Generated types must be regenerated after the migration (`src/db/database.types.ts:158`).

## What We're NOT Doing

- Editing or deleting a score (organizer correction is S-06). No `UPDATE`/`DELETE` policies are added.
- Score history or an audit trail (PRD Non-Goal).
- Leaderboard or standings (S-05); only a played/not-played signal and the raw score are exposed.
- Rate limiting, CAPTCHA or per-player identity for anonymous writers.
- Astro Actions, React islands or client-side JS for the form.
- A concurrency stress test; write-once under races is argued from the primary-key constraint.
- Preserving the `?player=` filter across the post-submit redirect.

## Implementation Approach

Extend the existing "closed tables, one narrow RPC per anonymous capability" model with a second RPC. Phase 1 builds and proves the database boundary; phase 2 adds the HTTP and parsing layer; phase 3 renders it and proves the anonymous flow end to end. The token travels in a hidden form field to a fixed route (`/api/scores`), so it never appears in the request URL of the write.

## Phase 1: Database

### Overview

Add score storage, the anonymous write RPC and score-aware read payload in one new migration, then regenerate types.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261025130000_add_match_results.sql`

**Intent**: Create the `results` table, the `submit_match_score` RPC, and replace `get_shared_league` so its payload includes scores. A new migration replaces the function; the applied one is not edited.

**Contract**:

- `public.results(match_id uuid primary key references public.matches(id) on delete cascade, score_a int not null, score_b int not null, created_at timestamptz not null default now())`, checks `score_a`/`score_b` between 0 and 99. RLS enabled; no anon policy. An authenticated owner-only `select` policy (via the match's tournament) for later slices; no insert/update/delete policies.
- `submit_match_score(p_token text, p_match_id uuid, p_score_a int, p_score_b int) returns jsonb`, `security definer`, `set search_path = ''`. Resolves the tournament by `share_token`; requires the match to belong to it. Returns `{"status": "created" | "already_entered" | "not_found"}`; `already_entered` is derived from `on conflict (match_id) do nothing` inserting no row. `revoke execute ... from public`, `grant execute ... to anon, authenticated`.
- `get_shared_league` (replaced) adds `score_a`, `score_b` (null when unplayed) to each match object; all other fields and ordering unchanged. Grants re-applied.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local database: `npx supabase db reset`
- Regenerated types include `results` and `submit_match_score`: `npx supabase gen types typescript --local` (output written to `src/db/database.types.ts`)
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- In SQL as `anon`, a first `submit_match_score` returns `created` and a second for the same match returns `already_entered` with the first score kept
- A match id from another tournament, or an unknown token, returns `not_found` and writes nothing
- Direct `select`/`insert` on `public.results` as `anon` is denied
- `get_shared_league` shows `score_a`/`score_b` after a submit and `null` before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Server logic

### Overview

Validation, the API route, and the DTO/parser changes, with unit tests.

### Changes Required:

#### 1. Score validation

**File**: `src/lib/validation/score.ts`

**Intent**: One zod schema for the score form, reusing the project's "non-empty string first, then coerce" idiom so an empty field is rejected, not stored as 0.

**Contract**: `submitScoreSchema` parses `{ token, matchId, scoreA, scoreB }`: `token` passes `isValidShareToken`, `matchId` is `z.uuid()`, each score is an integer 0–99 from a form string. Error messages are human-readable; the route uses the first issue like `api/leagues/index.ts`.

#### 2. API route

**File**: `src/pages/api/scores.ts`

**Intent**: Anonymous `POST` that validates the form, calls `submit_match_score` as anon, and redirects back to the share page with the outcome. Stays outside `PROTECTED_ROUTES`.

**Contract**: `export const POST: APIRoute`. Reads `token`, `matchId`, `scoreA`, `scoreB` from `formData`. Invalid token → 404-style redirect to `/t/<token>` is not attempted; respond 404. Invalid scores → redirect `/t/<token>?error=<message>`. RPC `created` → redirect `/t/<token>`; `already_entered` → `/t/<token>?notice=already-entered`; `not_found` → `/t/<token>?error=...`; RPC error → redirect with `?error=`. Response never echoes the token anywhere except the redirect target to the same share page.

#### 3. DTO and parser

**Files**: `src/types.ts`, `src/lib/services/shared-league.ts`

**Intent**: Carry the stored score on each fixture and let the existing played-ids filter be fed from it.

**Contract**: `FixtureDTO` gains `score: { a: number; b: number } | null`. `toSharedLeague` reads `score_a`/`score_b` (both null or both numbers; anything else makes the payload malformed → `null`). A small pure helper derives the played id set from fixtures for `filterFixturesByPlayer`.

#### 4. Unit tests

**Files**: `src/lib/validation/score.test.ts`, `src/lib/services/shared-league.test.ts`

**Intent**: Cover the validation edges and the parser changes.

**Contract**: Validation cases: empty, whitespace, negative, `100`, non-integer, valid `0`/`99`, malformed token, non-uuid match id. Parser cases: played and unplayed fixtures, mismatched null scores rejected, played ids helper, filter hides played matches.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `POST /api/scores` with no cookies and a valid token and match stores a score and redirects to `/t/<token>`
- The same request repeated redirects with `notice=already-entered` and does not change the stored score

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Share page UI and smoke

### Overview

Render score forms and results on the share page and extend the smoke test.

### Changes Required:

#### 1. Share page

**File**: `src/pages/t/[token].astro`

**Intent**: Show unplayed matches (respecting the player filter) each with a `<form method="POST" action="/api/scores">` carrying hidden `token` and `matchId` and two number inputs; show played matches with their stored score; surface `?error=` and the already-entered notice.

**Contract**: Number inputs `required`, `min=0`, `max=99`, `step=1`, names `scoreA`/`scoreB`. Existing `noindex` and `no-referrer` headers kept. The already-entered notice appears next to the fixtures and the matching match shows its stored score because the page re-reads `get_shared_league`. Query-param text is rendered escaped by Astro, never as HTML.

#### 2. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove the anonymous write boundary the way S-03 proved the read boundary.

**Contract**: After the share link step, anonymous requests: valid submit redirects to `/t/<token>`; the share page then shows the stored score; second submit redirects with `notice=already-entered`; out-of-range score redirects with `error=`; unknown token returns 404; match id not in this tournament redirects with `error=`. The match id is extracted from the share page HTML. All requests send `Origin` as existing steps do.

#### 3. Documentation

**File**: `AGENTS.md`

**Intent**: Add `npm test` to the Commands list and mention `/api/scores` as the anonymous write endpoint.

**Contract**: Edit the Commands and Auth flow sections only.

### Success Criteria:

#### Automated Verification:

- Smoke test passes against a running server with local Supabase: `npm run smoke`
- Unit tests pass: `npm test`
- Linting and formatting pass: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- In a private window with no session, opening the link, entering `2` and `1` on an unplayed match shows it as played with 2–1
- Submitting the same match from a second browser shows "already entered" and the stored 2–1
- A 0–0 submit is accepted and shown as played
- Empty, negative and `100` inputs are rejected with a readable message
- The player filter still lists only that player's unplayed matches and hides played ones

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `submitScoreSchema`: empty, negative, over 99, non-integer, boundaries 0 and 99, bad token, bad uuid
- `toSharedLeague` score parsing and played-ids helper; filter excludes played matches

### Integration Tests:

- Smoke: anonymous submit, second submit rejected as already entered, out-of-range, unknown token, foreign match id

### Manual Testing Steps:

1. Create a league as organizer and copy the link
2. In a private window, enter a score for one match and verify it shows as played
3. Resubmit the same match from another browser and verify the notice and unchanged score
4. Try empty, negative, 100 and a 0–0 score

## Performance Considerations

None material: one extra lookup by primary key per submit and a left join on `results` in `get_shared_league`, for leagues of at most 20 players.

## Migration Notes

New table only; no backfill. Existing tournaments simply have no results, so every match renders as unplayed.

## References

- Related research: `context/changes/link-score-entry/research.md`
- Tooling notes: `context/changes/link-score-entry/tooling-notes.md`
- Similar implementation: `supabase/migrations/20261025120000_add_share_token.sql:27-64`, `src/pages/api/leagues/index.ts:11-55`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local database: `npx supabase db reset` — b6e9566
- [x] 1.2 Regenerated types include `results` and `submit_match_score`: `npx supabase gen types typescript --local` (output written to `src/db/database.types.ts`) — b6e9566
- [x] 1.3 Type checking passes: `npx astro check` — b6e9566
- [x] 1.4 Linting passes: `npm run lint` — b6e9566

#### Manual

- [x] 1.5 In SQL as `anon`, a first `submit_match_score` returns `created` and a second for the same match returns `already_entered` with the first score kept — b6e9566
- [x] 1.6 A match id from another tournament, or an unknown token, returns `not_found` and writes nothing — b6e9566
- [x] 1.7 Direct `select`/`insert` on `public.results` as `anon` is denied — b6e9566
- [x] 1.8 `get_shared_league` shows `score_a`/`score_b` after a submit and `null` before — b6e9566

### Phase 2: Server logic

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 229628c
- [x] 2.2 Type checking passes: `npx astro check` — 229628c
- [x] 2.3 Linting passes: `npm run lint` — 229628c
- [x] 2.4 Production build succeeds: `npm run build` — 229628c

#### Manual

- [x] 2.5 `POST /api/scores` with no cookies and a valid token and match stores a score and redirects to `/t/<token>` — 229628c
- [x] 2.6 The same request repeated redirects with `notice=already-entered` and does not change the stored score — 229628c

### Phase 3: Share page UI and smoke

#### Automated

- [x] 3.1 Smoke test passes against a running server with local Supabase: `npm run smoke` — f0b9f85
- [x] 3.2 Unit tests pass: `npm test` — f0b9f85
- [x] 3.3 Linting and formatting pass: `npm run lint` — f0b9f85
- [x] 3.4 Production build succeeds: `npm run build` — f0b9f85

#### Manual

- [x] 3.5 In a private window with no session, opening the link, entering `2` and `1` on an unplayed match shows it as played with 2–1 — f0b9f85
- [x] 3.6 Submitting the same match from a second browser shows "already entered" and the stored 2–1 — f0b9f85
- [x] 3.7 A 0–0 submit is accepted and shown as played — f0b9f85
- [x] 3.8 Empty, negative and `100` inputs are rejected with a readable message — f0b9f85
- [x] 3.9 The player filter still lists only that player's unplayed matches and hides played ones — f0b9f85
