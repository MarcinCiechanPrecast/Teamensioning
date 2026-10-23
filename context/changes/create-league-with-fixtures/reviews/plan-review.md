<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Create League with Fixtures

- **Plan**: context/changes/create-league-with-fixtures/plan.md
- **Mode**: Deep
- **Date**: 2026-10-23
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

11/11 paths ✓, 4/4 symbols ✓, brief↔plan ✓, Progress↔Phase 27/27 ✓

## Findings

### F1 — Generated DB types get reformatted, so the "matches" check can never pass

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §3 + criterion 2.2
- **Detail**: eslint.config.js applies strictTypeChecked and eslint-plugin-prettier to every .ts file. lint-staged runs `eslint --fix` on commit, and there is no .prettierignore. The generated file would be reformatted, so a byte comparison with fresh `gen types` output fails.
- **Fix**: Ignore src/db/database.types.ts in ESLint and a new .prettierignore, and make 2.2 `gen types | diff -`.
- **Decision**: FIXED

### F2 — Testing Strategy claims smoke covers DB invariants indirectly, but zod blocks the request first

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Testing Strategy → Integration Tests
- **Detail**: The smoke duplicate-name POST is rejected by zod before it reaches the DB, so the unique lower(name) index, the RPC pair-count check and RLS isolation have no automated coverage.
- **Fix A ⭐ Recommended**: Correct the claim and keep manual checks 2.6/2.7.
  - Strength: Zero new tooling; matches the speed goal.
  - Tradeoff: A later migration could weaken a constraint unnoticed.
  - Confidence: HIGH — a one-sentence change.
  - Blind spot: S-02/S-06 policies inherit the same gap.
- **Fix B**: Add pgTAP tests run by `supabase test db` in the CI smoke job.
  - Strength: Automated proof of RLS and constraints.
  - Tradeoff: New tooling plus a CI step; ~half a session.
  - Confidence: MED — untried in this repo.
  - Blind spot: JWT-claim impersonation in pgTAP.
- **Decision**: FIXED (Fix A)

### F3 — The smoke helper can't send repeated `players` fields

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §5 Smoke coverage
- **Detail**: scripts/smoke.mjs:27-32 uses `new URLSearchParams(form)` with a plain object, which collapses repeated keys.
- **Fix**: New steps pass an entries array or URLSearchParams; the helper stays unchanged.
- **Decision**: FIXED

### F4 — `z.coerce.number()` turns an empty points field into 0

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 Validation schema
- **Detail**: zod v4 coerces via Number(value) (zod/v4/core/schemas.js:619). Number("") and Number(null) are 0.
- **Fix**: `z.string().trim().min(1, "Required").pipe(z.coerce.number().int().min(0).max(99))`.
- **Decision**: FIXED

### F5 — The "/leagues" prefix will also cover S-03's public route

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §4 Route protection
- **Detail**: The middleware matches with startsWith, so an anonymous page under /leagues would redirect to sign-in.
- **Fix**: Note in "What We're NOT Doing" that S-03's route lives outside /leagues.
- **Decision**: FIXED

### F6 — Manual check 1.4 asks to read "printed" output that nothing prints

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 + criterion 1.4
- **Detail**: No step prints the 4-player order.
- **Fix**: Assert the exact 4-player order as a literal array; 1.4 reviews that literal.
- **Decision**: FIXED

### F7 — Vitest version isn't pinned to one that supports Vite 8

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 Test runner
- **Detail**: Astro 7.3.2 runs on Vite 8.3.0. vitest 5.x declares peer vite ^6.4 || ^7 || ^8.
- **Fix**: Specify `vitest@^5`.
- **Decision**: FIXED
