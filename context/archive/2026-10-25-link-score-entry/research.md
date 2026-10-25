---
date: 2026-10-25
researcher: Claude (Sonnet 5.5) for Marcin Ciechan
git_commit: 0e53a071f6380a96e26ffec4e805c82e1b52300b
branch: master
repository: Teamensioning
topic: "Is context/changes/link-score-entry/tooling-notes.md compatible with the codebase, for implementing S-04 link-score-entry?"
tags: [research, codebase, link-score-entry, supabase-rpc, astro-api-routes, zod, vitest, smoke]
status: complete
last_updated: 2026-10-25
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Is `tooling-notes.md` compatible with the codebase, for `link-score-entry` (S-04)?

**Date**: 2026-10-25
**Git Commit**: 0e53a071f6380a96e26ffec4e805c82e1b52300b (working tree: only `context/changes/link-score-entry/` untracked)
**Branch**: master
**Repository**: Teamensioning

## Research Question

Review the codebase and decide whether `context/changes/link-score-entry/tooling-notes.md` is compatible with it. The user wants to implement `link-score-entry` (S-04) from `context/foundation/roadmap.md`.

## Summary

**Verdict: compatible, with three corrections before planning.** On the inspected paths, every tool the notes recommend (Postgres `security definer` RPC, Astro API route `POST`, zod 4, plain SSR form with Post/Redirect/Get, Vitest plus smoke) matches an existing pattern or an already-installed dependency. No recommendation conflicts with `AGENTS.md`, `lessons.md` or the deployment target. The notes' stated assumption (that the change means "players enter results through `/t/<token>`") is confirmed by the roadmap (`roadmap.md:117-128`).

The corrections:

1. **The "Overwrites" design point is already decided.** The notes frame it as "write-once or editable (needs an audit trail)". The PRD and roadmap settle it: link holders write once, first submission wins, a later attempt sees "already entered" (`prd.md:116-119`, `roadmap.md:119`). Editing belongs to the organizer in S-06 (`roadmap.md:142-152`), and history is a Non-Goal (`prd.md:154`). The audit-trail concern does not apply.
2. **The notes never name the concurrency mechanism the roadmap requires.** "Concurrent submissions for the same match must resolve to exactly one stored score" (`roadmap.md:127`). A plain "check, then insert" inside the RPC would not guarantee this by itself; it needs a database-level uniqueness guarantee (see Detailed Findings, Concurrency).
3. **Two details the notes omit.** The valid score range is still an open user-owned unknown (`roadmap.md:125-126`), so the notes' `.max(...)` has no value yet. And the score route must be named outside the `PROTECTED_ROUTES` prefixes, or the middleware will demand sign-in from anonymous players (`src/middleware.ts:4`).

## Detailed Findings

### Write path: security definer RPC (compatible)

- The only existing anonymous path is `get_shared_league`: `security definer`, `set search_path = ''`, `revoke execute ... from public`, `grant execute ... to anon, authenticated` (`supabase/migrations/20261025120000_add_share_token.sql:30-70`). The notes' `submit_match_score` pattern mirrors it exactly.
- Tables have RLS enabled and, on the inspected migrations (2 files), no `anon` policies (`supabase/migrations/20261023120000_create_league_schema.sql:79-117`). Only SELECT and INSERT policies for `authenticated` exist; no UPDATE or DELETE policies yet (comment at line 77).
- `create_league` is `security invoker`, so the notes' `security definer` choice for the anon write is a deliberate, correct divergence (anon has no policy that could pass).
- The notes' grants line is right in substance. `create_league` revokes from `public, anon` then grants `authenticated` (`20261023120000_create_league_schema.sql:180-181`); `get_shared_league` revokes from `public` then grants to `anon` (`20261025120000_add_share_token.sql:69-70`). Either form is consistent with existing practice.
- Token check inside the RPC: `tournaments.share_token` is `unique`, constrained to `^[0-9a-f]{64}$` (`20261025120000_add_share_token.sql:17-22`), so a `where t.share_token = p_token` lookup is index-backed and unambiguous.
- Ownership of the match is enforceable in SQL: `matches` has `tournament_id` (`20261023120000_create_league_schema.sql:50-52`), so the RPC can require `m.tournament_id = t.id`, as the notes say ("client never passes a tournament id").

### Concurrency / write-once (gap in the notes)

- Roadmap risk for S-04: first anonymous write; concurrent submissions must resolve to exactly one stored score; link holders must never overwrite (`roadmap.md:127`).
- The schema has no score storage today (`matches` columns: id, tournament_id, position, player_a_id, player_b_id; `20261023120000_create_league_schema.sql:50-67`; `get_shared_league` returns no score field).
- The notes leave "a `results` table or columns on `matches`" open. Both can satisfy the requirement, but only if the guarantee is in the database: a `results` table with `match_id` as primary key / unique and `insert ... on conflict do nothing` (then report "already entered" when no row was inserted), or an `update matches set ... where id = ... and score_a is null` that reports whether a row changed. This is a recommendation from the roadmap requirement, not observed code.
- The existing schema already uses DB-level invariants as the primary defence (header comment, `20261023120000_create_league_schema.sql:1-9`), so this fits the project's style.
- Open choice for the plan: a separate table also serves S-06 (organizer correction needs UPDATE policy) and S-05 (aggregation), but the notes' mention of the S-03 helper `filterFixturesByPlayer(fixtures, playerId, playedMatchIds)` shows it already accepts a played-ids set (`src/lib/services/shared-league.ts:95-104`), so either shape works with the filter once `get_shared_league` returns which matches are played.

### HTTP endpoint: Astro API route (compatible)

- API routes live in `src/pages/api/` with uppercase `POST` exports (`src/pages/api/leagues/index.ts:11`, `src/pages/api/auth/signin.ts:4`). The pattern: parse `formData`, validate with zod `safeParse`, call `supabase.rpc(...)`, `context.redirect(...)` with an `?error=` query on failure (`src/pages/api/leagues/index.ts:11-55`). Post/Redirect/Get is therefore already the project idiom.
- Middleware protects only `/dashboard`, `/leagues`, `/api/leagues` (`src/middleware.ts:4`). A new route outside those prefixes (for example `/api/scores`, or `/api/t/...`) is anonymous by default; naming it under `/api/leagues` would wrongly force sign-in. This is a naming constraint the notes do not mention.
- The share page reads with the anon client via `createClient(...)`; no session is needed (`src/pages/t/[token].astro:12-20`). The write route can use the same `createClient` and call the RPC as `anon`.
- Existing page headers `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer` (`src/pages/t/[token].astro:26-27`) apply to the page only; an API redirect back to `/t/<token>` should carry the token without leaking it. The token will be in the form's hidden field or the route path; it should not appear in a query string that reaches logs. (Observation of the page; the endpoint design is a plan decision.)
- Astro form-POST origin checking: `astro.config.mjs` sets no `security` option (`astro.config.mjs:10-25`), so Astro's default applies. The smoke test sends an `Origin` header on every request (`scripts/smoke.mjs:30-33`), so any new smoke step should do the same. Not verified against Astro 7 docs in this research.

### Validation: zod 4 (compatible)

- `zod ^4.6.7` is a dependency (`package.json`, dependencies), and the repo already uses the exact styles the notes suggest: string-trim-min then `pipe(z.coerce.number<string>().int().min(0).max(99))` and an object-level `.refine(..., { path })` (`src/lib/validation/league.ts:6-45`). The comment there warns that `Number("")` is `0`, so a bare coerce accepts an empty field. A score field is a natural place for the same trap: an empty score input must be rejected, not stored as 0. This is worth carrying into the plan.
- The notes' `z.flattenError()` is not used in the repo; existing code shows only `parsed.error.issues[0]?.message` (`src/pages/api/leagues/index.ts:26-28`). Using the same first-issue style is more consistent. Not a compatibility problem.
- The upper bound on a score is an open user decision (`roadmap.md:125-126`, owner: user, blocking: no). The notes use `.max(...)` with no value. The league schema's own convention is a DB check constraint mirroring the zod bound (for example `points_*` between 0 and 99, `20261023120000_create_league_schema.sql:16-18` and `src/lib/validation/league.ts:6`), so the score bound should be mirrored in a check constraint too.

### Form UI (compatible)

- `/t/[token].astro` is a server-rendered page whose filter is a plain `<form method="get">` with no JavaScript (`src/pages/t/[token].astro:46-65`). A `<form method="POST">` per unplayed fixture fits. React islands are only for interactivity, per `AGENTS.md`; none is needed.
- Page response status for an invalid token is 404 via `isValidShareToken` before any database call (`src/pages/t/[token].astro:12-14, 31-33`, `src/lib/services/shared-league.ts:6-8`). The score endpoint should reuse the same guard.
- `get_shared_league` currently returns matches without any score data, and `toSharedLeague` builds `FixtureDTO`s from `id, position, player_a_id, player_b_id` only (`src/lib/services/shared-league.ts:55-75`). Showing "already entered" and feeding `playedMatchIds` requires extending both the RPC payload and the parser. A new migration should replace the function rather than edit the applied one (migrations are timestamped; two exist).
- `src/db/database.types.ts` is generated and contains `get_shared_league: { Args: { p_token: string }; Returns: Json }` (`src/db/database.types.ts:158`); it must be regenerated after the migration, as the S-03 plan did (`context/archive/2026-10-25-shared-league-link/plan.md:27`).

### Tests (compatible)

- Vitest is installed (`vitest ^5.0.5`), configured for `src/**/*.test.ts` with the `@` alias (`vitest.config.ts:4-10`), and `npm test` runs it (`package.json` scripts). Existing pure-helper tests sit beside the code (`src/lib/services/fixtures.test.ts`, `shared-league.test.ts`). A pure `validateScore`-style helper or zod schema test fits this layout.
- `scripts/smoke.mjs` already has an `anonymous` request mode (`scripts/smoke.mjs:28-39`) and share-path extraction (`scripts/smoke.mjs:63-66`); AGENTS.md says CI runs it against the production preview with a local Supabase. The notes' plan to extend it for an anon submit, a second submit that reports "already entered", and a no-cookie boundary check is directly implementable. Concurrency itself is not testable by this serial script; a DB-level test or reasoning from the constraint is needed.
- Note: the notes say "Vitest for a pure `validateScore` helper". `AGENTS.md` does not list `npm test` in its Commands section, but the script exists; this is a documentation gap, not an incompatibility.

### Astro Actions vs API route (the notes' reasoning holds)

- No `src/actions/` directory exists on the inspected tree; every endpoint is an API route (`src/pages/api/auth/*`, `src/pages/api/leagues/index.ts`). The notes' recommendation to stay with API routes is consistent. Their statement that Actions on the Cloudflare adapter in Astro 7 are unverified is accurate for this research too: not checked here.

### Repo rules (no conflicts)

- `lessons.md` has two rules: no lodash without a stated reason, and Cloudflare Workers APIs (env via `astro:env/server`, deploy with `wrangler deploy`, no `wrangler dev`) (`context/foundation/lessons.md:5-17`). The notes add no new dependency and use `createClient`, which already reads `astro:env/server` (`src/lib/supabase.ts:3`).
- `AGENTS.md` conventions satisfied by the notes: uppercase `POST` export, services in `src/lib/` (`src/lib/services/`), validation with zod "when a route first needs input validation" (zod is in fact already installed, so that AGENTS.md line is stale on its premise; `src/lib/validation/league.ts` uses it), migrations named `YYYYMMDDHHmmss_short_description.sql`, RLS on any new table with granular per-operation, per-role policies.

## Code References

- `supabase/migrations/20261025120000_add_share_token.sql:30-70` - `get_shared_league`, the model for the new anon RPC (definer, empty search_path, grants)
- `supabase/migrations/20261023120000_create_league_schema.sql:50-67` - `matches` columns; no score storage yet
- `supabase/migrations/20261023120000_create_league_schema.sql:79-117` - RLS, no anon policies
- `src/pages/api/leagues/index.ts:11-55` - API route idiom: form parse, zod, RPC, redirect
- `src/middleware.ts:4` - `PROTECTED_ROUTES`; the new route must stay outside `/api/leagues`
- `src/lib/validation/league.ts:6-45` - zod 4 idioms and the empty-string coerce pitfall
- `src/lib/services/shared-league.ts:6-8, 55-75, 95-104` - token guard, payload parser to extend, filter that already takes `playedMatchIds`
- `src/pages/t/[token].astro:12-33, 46-65` - anon RPC call, noindex/no-referrer, GET filter form
- `scripts/smoke.mjs:28-39, 63-66` - anonymous mode and share-path extraction to reuse
- `vitest.config.ts:4-10` - test setup
- `src/db/database.types.ts:158` - generated types to regenerate

## Architecture Insights

- The project's security model is "closed tables, one narrow RPC per anonymous capability". S-04 adds the first anonymous write by extending that model with a second RPC, not by opening a table.
- DB constraints are the source of truth for invariants; application code mirrors them for messages. The score range and write-once should follow that, and the notes' "check constraint (scores >= 0)" is consistent.
- Data flow is server-rendered pages plus POST-redirect API routes; no client islands are needed for the share page.

## Historical Context (from prior changes)

- `context/archive/2026-10-25-shared-league-link/plan.md:12` - "Scores do not exist yet (S-04), so every match is currently 'unplayed'"; supported (still true at `get_shared_league`, which returns no score data).
- `context/archive/2026-10-25-shared-league-link/plan.md:31` - the filter helper takes "played match ids" so S-04 can feed it; supported (`shared-league.ts:95-104`).
- `context/archive/2026-10-25-shared-league-link/plan.md:27` - generated types must be regenerated after a migration; still applies.
- `context/archive/2026-10-25-shared-league-link/reviews/impl-review.md` was not read in this research.

## Related Research

None under `context/changes/**/research.md`. The archived changes contain `plan.md` and `plan-brief.md` only; their research was not inspected.

## Open Questions

1. **Valid score range** (user-owned, non-blocking per `roadmap.md:125-126`): non-negative integers only? Upper bound? Needed for the zod schema and the DB check constraint.
2. **Storage shape**: `results` table versus columns on `matches`. Both can meet write-once if the guarantee is in the database; choose in `/10x-plan`.
3. **Response when a match is already entered**: PRD says the second submitter "sees already entered" (`prd.md:116-119`). Whether it shows the stored score is not specified.
4. **Astro Actions on `@astrojs/cloudflare` v14 / Astro 7** and the default form-origin check were not verified; API routes avoid the question.
5. Whether `get_shared_league` should gain score fields now (needed to render "already entered" and to feed `playedMatchIds`) or in S-05 is a planning decision; S-04's outcome needs at least a played/not-played signal.
