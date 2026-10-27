<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard UI on Design Tokens

- **Plan**: context/changes/dashboard-ui-tokens/plan.md
- **Scope**: Full plan (Phases 1-4 of 4)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Evidence: every automated criterion was re-run for this review and passes (components exist, no hex in `global.css`, scan and `check:ui` return 0, 159 tests, lint, `astro check` 0 errors, build, smoke test). A drift sweep found no DRIFT or MISSING items; `global.css` matches `theme-jamaica.md` value for value except the documented `--destructive` deviation. Manual rows 1.4, 2.4-2.5, 3.6-3.8 and 4.7-4.9 were verified by an agent, not by the user; each has observable evidence (screenshots in `screens/`, commit bodies stating the method).

## Findings

### F1 — Guard passes silently when it scans nothing, and CI never runs it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/check-ui-literals.mjs:27-47, .github/workflows/ci.yml:18-23
- **Detail**: If `src/pages/dashboard.astro` or `src/components/dashboard/` is renamed or moved, `defaultFiles()` returns `[]` and the script prints "No UI literals in 0 file(s)." and exits 0 (verified from an empty directory). `check:ui` is not in the CI `ci` job (lint, test, astro check, build), so the guard only runs in the lint-staged pre-commit hook, which `--no-verify` skips. A missing explicit path throws a raw ENOENT stack (still exit 1).
- **Fix**: Exit 1 with a clear message when no files were scanned, print `file: cannot read` for an unreadable file, and add `- run: npm run check:ui` to the `ci` job.
  - Strength: Turns a silently-passing guard into one that fails loudly and is enforced server-side.
  - Tradeoff: Small edits in the script and in the CI workflow; a legitimate rename of the dashboard view later needs the script's default paths updated.
  - Confidence: HIGH — behaviour reproduced.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix now: the guard exits 1 when it scans zero files and reports unreadable files, and CI runs `npm run check:ui` (verified with an empty directory and a missing path)

### F2 — Row links lose their focus indicator in forced-colors mode

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/dashboard/DashboardView.astro:34
- **Detail**: The league links use `outline-none focus-visible:ring-2 focus-visible:ring-ring`. In Tailwind 4, `outline-none` sets `outline-style: none`, so in Windows high-contrast / forced-colors mode the box-shadow ring is removed and the link has no focus indicator. (`button.tsx` uses the same `outline-none`, as stock shadcn does.)
- **Fix**: Replace `outline-none` with `outline-hidden` on the row links (transparent outline that forced-colors mode still paints).
- **Decision**: FIXED via Fix now: row links use `outline-hidden` (DashboardView.astro:36)

### F3 — Literal-scan regex has false negatives and false positives

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/check-ui-literals.mjs:9-10
- **Detail**: Misses named colours and inline styles (`style="color: red"`, `bg-[red]`) and arbitrary values with non-numeric content (`w-[calc(...)]`, `-[2em]`, `-[50%]`). Wrongly flags `#[0-9a-fA-F]{3,8}` in fragment links or ids such as `href="#add"` and `rgb(`/`oklch(` inside comments. Today the two guarded files have none of these.
- **Fix**: Add a `style=` check and `-\[[^\]]*\]` for arbitrary values, restrict the hex match to non-word-preceded `#`, or document these as known limits in the script header.
- **Decision**: FIXED via Fix now: patterns tightened (inline `style=`, more length units and `calc(`, no `#fragment`/entity false positives); verified on a 13-line scratch file: lines 1-7 flagged, 6 legitimate lines clean

### F4 — Manual criteria were verified by an agent, not the user

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/dashboard-ui-tokens/plan.md (rows 1.4, 2.4, 2.5, 3.6-3.8, 4.7-4.9)
- **Detail**: Manual rows are ticked because the user delegated them. Evidence exists (two screenshots, local-Supabase checks, real Tab presses, contrast measurements), and the commit bodies of p2-p4 say an agent ran them. A user who wants a human sign-off has not given one; `/dashboard` and `/leagues/*` were only exercised through a throwaway account.
- **Fix**: None required. Optionally eyeball `/dashboard` once with a real account before a PR.
- **Decision**: SKIPPED: agent verification is backed by screenshots and commit bodies; no action

### F5 — `class="dark"` now applies to every unmigrated page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/layouts/Layout.astro:15, src/styles/global.css:4
- **Detail**: The theme is global, so auth, landing and league pages now use the Jamaica dark tokens under their old literals. Checked: `/`, sign-in, sign-up, confirm-email and the share page pass AA text contrast (min 5.54:1); `/leagues/new`, `/leagues/[id]` and its delete page need a login and were not audited. Separately, `@custom-variant dark (&:is(.dark *))` matches descendants only, so a `dark:` utility on `<html>` itself would never apply (none exists today).
- **Fix**: Spot-check the three league pages with a logged-in session before a PR; if `dark:` utilities are ever added on `<html>`, change the variant to `(&:is(.dark, .dark *))`.
  - Strength: Catches readability regressions on the pages the plan deliberately deferred.
  - Tradeoff: A manual pass; no code change unless something is unreadable.
  - Confidence: MEDIUM — the audited pages are fine, the league pages are inferred.
  - Blind spot: `/leagues/*` contrast was never measured.
- **Decision**: FIXED via Fix now (audit): league pages checked with a throwaway account on the production build. `/dashboard` min 9.28:1, `/leagues/new` min 5.54:1, `/leagues/:id/delete` min 4.77:1, all pass. `/leagues/:id` has one miss: `[id].astro:81` `text-blue-100/50` at 4.31:1, a pre-existing literal on an unmigrated page, DEFERRED to the league-view migration (see follow-ups/review-fixes.md)

### F6 — Kitchen sink ships as a production route file

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dev/dashboard-states.astro:8-10
- **Detail**: The gate is sound: in a production build `import.meta.env.DEV` is false, so the route answers 404 with an empty body (verified on the production preview), `/dev` is outside `PROTECTED_ROUTES`, and the fixtures are fake. The file, its `is:global` CSS and a `getUser()` call per hit still exist in production. The sitemap is not a concern (integration is skipped without `site`; the route appears only as a server chunk). The page's hover/focus CSS mirrors the classes in `DashboardView.astro` by hand, so the two must be kept in sync.
- **Fix**: None required. Optional stricter gate: have the middleware return 404 for `/dev` outside DEV.
- **Decision**: SKIPPED: the 404 gate is verified in the production build; no action

### F7 — A long email can overflow the dashboard card

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/dashboard/DashboardView.astro:19-20
- **Detail**: The email `<span>` has no wrap rule, so an unbroken address of roughly 60+ characters can exceed the `max-w-lg` card. Reasoned from the markup, not reproduced.
- **Fix**: Add `break-words` to the email span.
- **Decision**: FIXED via Fix now: `break-words` on the email span (DashboardView.astro:20)

### F8 — Unexpected delete errors are no longer visible anywhere

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/leagues/[id]/delete.ts:28
- **Detail**: Any database error other than 22P02 now redirects with the generic `server` code, and the raw message is neither shown nor logged. That is the intended privacy fix, but a failing delete is now harder to diagnose. (`no-console` is a lint warning in this repo, so a plain `console.error` adds a warning.)
- **Fix**: Log the error server-side with whatever logging the repo prefers once one exists, or leave as is.
- **Decision**: SKIPPED: intended privacy behaviour; revisit when the repo has a logging approach

## Pattern and scope notes (no finding)

- `dashboard-errors.ts` and its test mirror `score-submission.ts` exactly; the test omits `__proto__`/`constructor` cases, which `Object.hasOwn` already rejects.
- `card.tsx`, `alert.tsx` follow `button.tsx` conventions; no new dependencies (lockfile untouched).
- Fonts API downloads Outfit at build time (network needed locally and in CI; not checked against CI). No lesson violations.
- Extras beyond plan wording are benign: change-folder docs, two extra AGENTS.md bullets, the `is:global` kitchen-sink CSS.

## Triage summary

- **Fixed (5):** F1, F2, F3, F5 (audit), F7
- **Skipped (3):** F4, F6, F8
- **Deferred follow-up (1):** `src/pages/leagues/[id].astro:81` `text-blue-100/50` is 4.31:1 on the new card colour. Fixes when the league view is migrated to tokens (`text-muted-foreground`).
