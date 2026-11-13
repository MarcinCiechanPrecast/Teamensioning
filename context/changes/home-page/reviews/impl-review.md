<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Branded home page and starter-leftover removal

- **Plan**: context/changes/home-page/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-13
- **Verdict**: NEEDS ATTENTION (all findings fixed in triage)
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Minor drift noted: `index.astro` passes no title. That is intended, because the layout's no-title fallback is the product tagline. `.claude/launch.json` (local dev launch entry) is uncommitted and stays out of the change.

## Findings

### F1 — Smoke brand check passes on any page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:97
- **Detail**: `body.includes("Teamensioning")` matches the `<title>` that `Layout` renders on every page, so a broken HomeView would still pass.
- **Fix**: Assert the landing `<h1>` plus the "From sketch to standings" section heading.
- **Decision**: FIXED. Verified that `/auth/signin` does not satisfy the new check.

### F2 — Landing page departs from the documented page shell

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/home/HomeView.astro:60
- **Detail**: AGENTS.md says every view follows the single-card shell, but the landing page has several sections.
- **Fix**: Document a landing-page exception in the AGENTS.md UI section.
- **Decision**: FIXED

### F3 — Topbar margin stacks with the parent gap

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/Topbar.astro:8
- **Fix**: Drop `mb-4`. Topbar is only used by HomeView.
- **Decision**: FIXED

### F4 — Name equation read before its heading

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (a11y)
- **Location**: src/components/home/HomeView.astro:104
- **Fix**: Move the h2 above the chips.
- **Decision**: FIXED

### F5 — Last section has no accessible name

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/home/HomeView.astro:169
- **Fix**: Add `aria-labelledby` to the hero and closing sections.
- **Decision**: FIXED

### F6 — Guard decodes every file under src/

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/no-starter-leftovers.test.ts:14
- **Fix**: Scan text extensions only.
- **Decision**: FIXED. The guard's protection was already proven by a deliberate-break run during implementation.

### F7 — "Create a tournament" vs "Create league"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/home/HomeView.astro:86,174
- **Fix**: Use "Create league", the wording on the dashboard and the `/leagues/new` heading.
- **Decision**: FIXED
