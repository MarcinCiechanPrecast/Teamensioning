<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Link Score Entry (S-04)

- **Plan**: context/changes/link-score-entry/plan.md
- **Scope**: Full plan (3 of 3 phases)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automated criteria re-run during review: `npm test` 140 passed, `npx astro check` 0 errors, `npm run lint` clean, `npm run build` succeeds. Progress: 23 of 23 rows checked. `npm run smoke` was not re-run by the review (it passed at the end of Phase 3).

## Findings

### F1 — Raw DB errors and free-text `?error=` shown to anonymous users

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/scores.ts:52-54, src/pages/t/[token].astro:45,82-86
- **Detail**: `failWith(error.message)` puts raw PostgREST/Postgres text (constraint names, network errors) into the redirect, and the share page renders any `?error=` verbatim. Astro escapes it, so there is no XSS, but anyone holding a valid token can craft `/t/<token>?error=Session expired, sign in at evil.example` and circulate it; it renders as a red alert on the real site. The sibling leagues route does the same, but its caller is authenticated.
- **Fix**: Replace free text with short codes (`?error=invalid-score`, `?error=match-not-found`, `?error=server`), map RPC errors to fixed codes server-side (log the raw error only), and have the page map known codes to fixed strings and ignore unknown ones.
  - Strength: Same shape as the existing `?notice=already-entered`; removes both the leak and the injected-text vector.
  - Tradeoff: Zod messages must also be mapped to codes (or kept fixed and shown via a code), a few more lines in route and page.
  - Confidence: HIGH — mirrors the notice mechanism already in the page.
  - Blind spot: Whether Zod's per-field messages should stay specific; a code per rule is more code.
- **Decision**: FIXED — fixed error codes (invalid-score, match-not-found, server) mapped to messages on the page; raw errors logged server-side only

### F2 — Non-form POST to /api/scores returns 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/scores.ts:18
- **Detail**: `await context.request.formData()` is unguarded. Verified in review: a JSON body and a bodyless POST both return HTTP 500. No write happens, but anyone can trigger error noise anonymously.
- **Fix**: Wrap `formData()` in try/catch and return a 400 response for non-form bodies.
- **Decision**: FIXED — formData() guarded, non-form POST returns 400 (smoke step added)

### F3 — Referrer-Policy deviation is not recorded in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/link-score-entry/plan.md:153
- **Detail**: The plan says the `no-referrer` header is kept, but the share page now sends `same-origin` (src/pages/t/[token].astro:27-31). The deviation is justified (no-referrer makes browsers send `Origin: null`, which Astro's origin check rejects, and it was found only in the browser), commented in code, pinned by a smoke step, and does not weaken S-03's guarantee against cross-origin Referer leaks. The plan, the source of truth for later reviews, still contradicts the code.
- **Fix**: Add a short addendum to the plan under Phase 3 recording the header change and its reason.
- **Decision**: FIXED — addendum recorded in plan.md Phase 3

### F4 — Smoke "other tournament" case does not exercise the tournament boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs ("match from another tournament is rejected")
- **Detail**: The step posts a random uuid, which proves only "unknown match". The plan's key guarantee (a token can only write matches of its own tournament, enforced by the join in submit_match_score) is covered only by the manual SQL check in Phase 1 (step 1.6), so there is no automated regression coverage for it.
- **Fix**: Create a second league in smoke and submit its real match id with the first league's token, expecting `error=`.
  - Strength: Tests the exact guarantee the roadmap names for this first anonymous write.
  - Tradeoff: Smoke gets one more league creation and match-id extraction, slightly longer run.
  - Confidence: HIGH — smoke already creates leagues and extracts ids from the page.
  - Blind spot: Smoke leaves more data behind per run.
- **Decision**: FIXED — smoke creates a second league and posts its real match id with the first league's token

### F5 — Deploy-order coupling is undocumented

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/shared-league.ts:73-74
- **Detail**: `toSharedLeague` treats missing `score_a`/`score_b` keys as malformed and returns null. If the new app code runs against the old `get_shared_league`, every valid share link renders "This link is not valid". The old app against the new database is fine. The migration must therefore be applied before or with the deploy.
- **Fix**: Add a deploy-order note to the plan's Migration Notes (apply migration first).
- **Decision**: FIXED — deploy-order note added to plan.md Migration Notes

### F6 — No unit test for the route's status mapping

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/api/scores.ts (readStatus and the switch)
- **Detail**: `readStatus` and each status arm are covered only by smoke. Extracting the status-to-redirect mapping into src/lib/services/ would make it unit-testable. Becomes cheaper to do together with F1.
- **Fix**: Extract readStatus and the mapping into a pure helper with Vitest tests, ideally together with F1.
- **Decision**: FIXED — mapping extracted to src/lib/services/score-submission.ts with 12 Vitest tests

### F7 — Optional hardening

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261025130000_add_match_results.sql:13-36, src/lib/validation/score.ts:8-18
- **Detail**: (a) `results` has no table-level revoke for anon/authenticated; RLS already denies, and earlier tables follow the same convention. (b) check violation 23514 is unreachable from the app today. (c) `Number()` coercion accepts "1e1", "0x10" and "+5" as 10, 16 and 5, still integers in 0-99 and harmless, but looser than the HTML input. (d) Smoke never asserts that the share page leaks no owner_id or share_token beyond the URL.
- **Fix**: Optional: add a table revoke in a follow-up migration, add `.regex(/^\d{1,2}$/)` before the pipe, and add a no-leak assertion to smoke.
- **Decision**: FIXED (b, c, d) — 23514 mapped to invalid-score, plain-decimal regex on scores, smoke asserts no owner_id/tournament_id/share_token in the page; (a) table revoke intentionally skipped (needs a new migration)
