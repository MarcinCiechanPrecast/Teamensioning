<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Shared League Link

- **Plan**: context/changes/shared-league-link/plan.md
- **Scope**: Full plan (Phases 1-3 of 3)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automated criteria re-run on the final tree: `npm run test` 115 passed, `npm run lint` clean, `astro check` 0 errors, `npm run build` complete. Smoke passed 16/16 against the production preview before the epilogue commit. Anon boundary checked in local Postgres: anon sees 0 table rows, the RPC returns the league for a valid token and null for an unknown one, with no owner_id or share_token in the payload.

## Findings

### F1 — Small unplanned additions beyond the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/smoke.mjs, supabase/migrations/20261025120000_add_share_token.sql, src/pages/t/[token].astro:80
- **Detail**: Three small things the plan did not specify: an extra smoke step ("owner page exposes a share link") that prevents a false pass on an empty path; players in get_shared_league ordered by name then id; 404 copy "This link is not valid." instead of the owner page wording. All benign and consistent with the plan's intent.
- **Fix**: Accept; no code change. Optionally note them in the plan as addenda.
- **Decision**: SKIPPED (accepted: benign additions)

### F2 — Progress 1.1 checked without a from-scratch db reset

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/shared-league-link/plan.md (Progress 1.1)
- **Detail**: Criterion 1.1 says the migration applies on a fresh database via `npx supabase db reset`. It was applied to the existing local database instead (a reset would have wiped local data) and the row was checked on that basis. CI's smoke job starts a fresh local Supabase, which applies all migrations from scratch, so it covers this on the next push.
- **Fix**: Accept; confirm the CI smoke job is green after the push.
- **Decision**: SKIPPED (accepted: CI smoke job applies migrations from scratch)

### F3 — Anonymous boundary is verified only manually

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261025120000_add_share_token.sql (grants and RLS)
- **Detail**: Smoke proves that a valid token renders, an unknown token 404s and the owner route stays protected. "anon cannot select the tables directly" was checked in psql only; a future migration adding an anon policy would not fail CI. Test strategy is formally Module 3 territory.
- **Fix**: Accept for now; revisit with the Module 3 testing strategy (for example a SQL-level test or a PostgREST anon check).
- **Decision**: SKIPPED (accepted: revisit with Module 3 testing strategy)

### F4 — Share page has no noindex or referrer policy

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/t/[token].astro
- **Detail**: The token lives in the URL. The page has no external links, so Referer leakage is unlikely, and unlisted links are only indexed if they are published somewhere. Still, a `noindex` meta and `Referrer-Policy: no-referrer` are cheap hardening for a link that cannot be rotated.
- **Fix**: Add `<meta name="robots" content="noindex">` and a no-referrer policy to the page.
- **Decision**: FIXED (X-Robots-Tag: noindex and Referrer-Policy: no-referrer set in t/[token].astro; verified on 200 and 404)

### F5 — Owner page makes a separate query for share_token

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/leagues/[id].astro:33
- **Detail**: One extra round trip per owner page view. The plan asked for it to be selected separately so TournamentDTO never carries the token, so this is intended, not drift.
- **Fix**: None needed; merge it into the first select only if the page ever becomes latency-sensitive.
- **Decision**: SKIPPED (accepted: intended by the plan)
