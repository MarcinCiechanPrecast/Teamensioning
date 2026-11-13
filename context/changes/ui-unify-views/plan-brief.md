# Apply the Dashboard UI style to every remaining view — Plan Brief

> Full plan: `context/changes/ui-unify-views/plan.md`
> Research: `context/changes/ui-unify-views/research.md`

## What & Why

Only the dashboard uses the Jamaica design tokens and shadcn components. The other 18 view files still use the starter "cosmic glass" theme, so the app looks like two products, and the `check:ui` guard can't protect anything outside the dashboard. This change applies the Dashboard contract to every view and makes the guard enforce it app-wide.

## Starting Point

`check:ui` reports 116 literal lines in 18 files when run on all views (64eae1a). Four shared form parts (`FormField`, `ServerError`, `SubmitButton`, `PasswordToggle`) feed glass styling into four pages, including two that already use `Card`. `src/components/ui/` has only `alert`, `button` and `card`.

## Desired End State

Every page renders on `bg-cosmic` with a shadcn `Card`, token text, `Button`s, `Alert`s (destructive for errors, a new `success` variant for confirmations) and shadcn `Input`/`Label` fields. `npm run check:ui` scans all views (`.astro` + `.tsx`, except `ui/`) by default, in CI and pre-commit. All existing tests pass without assertion edits.

## Key Decisions Made

| Decision     | Choice                                                           | Why (1 sentence)                                                          | Source          |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------- |
| Status boxes | New `--success` token + Alert `success` variant, `role="status"` | Keeps confirmations visually distinct from errors without palette classes | Research (user) |
| Inputs       | Add shadcn `input` + `label`; `FormField` wraps them             | AGENTS.md says not to hand-build components                               | Research (user) |
| Landing      | Restyle only                                                     | Keeps the change bounded; content rewrite is a separate item              | Research (user) |
| Guard scope  | All views, `.astro` + `.tsx`, `ui/` excluded                     | New views are guarded automatically                                       | Research (user) |
| Visual gate  | Browser screenshots in `screens/`                                | Real pages with real data, no extra dev-only page                         | Plan            |
| Fixture rows | Restyle in place, no extraction                                  | Avoids touching Bracket and smoke's raw-HTML contracts                    | Plan            |
| Guard timing | Widen in Phase 5, after all views are clean                      | CI runs the default scan; widening early would break it                   | Plan            |

## Scope

**In scope:** 18 offending view files plus `LibBadge`; the `--success` token; shadcn `input`/`label`; Alert `success` variant; guard default scope, lint-staged glob and a guard unit test; AGENTS.md, test-plan.md and roadmap.md updates.

**Out of scope:** landing copy rewrite, `ScoreFixtureRow` extraction, a new kitchen sink, free-text `?error=` fix, theme toggle, dashboard files, test assertion changes.

## Architecture / Approach

Phase 1 owns every file that more than one view needs (tokens, `ui/`, shared form parts, Banner). Phases 2 (auth + landing), 3 (league forms) and 4 (league + share views) touch disjoint files and run in parallel. Phase 5 widens the guard and runs the full gate; Phase 6 updates the docs.

## Phases at a Glance

| Phase                   | What it delivers                                                   | Key risk                                              |
| ----------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| 1. Foundation           | `--success`, Input/Label, Alert success, shared form parts, Banner | Breaking `getByLabel` if `id`/`htmlFor` drift         |
| 2. Auth & landing (A)   | index, Welcome, Topbar, LibBadge, auth pages/forms                 | Exact "Password" label ambiguity                      |
| 3. League forms (B)     | new/edit/delete pages, Create/Edit forms, PlayerListField          | Native radio for format must stay                     |
| 4. League & share (C)   | leagues/[id], t/[token], OrganizerFixtureList, CopyLinkField       | Duplicate `role=status/alert`; smoke raw-HTML strings |
| 5. Guard & verification | App-wide `check:ui`, guard test, full gate + screenshots           | shadcn `ui/` arbitrary values tripping lint-staged    |
| 6. Documentation        | AGENTS.md UI, test-plan, roadmap                                   | —                                                     |

**Prerequisites:** Docker + `npx supabase start` for integration/smoke/E2E; network for `npx shadcn@latest add`.
**Estimated effort:** ~1 session: Phase 1 sequential, Phases 2–4 in parallel, then 5–6.

## Open Risks & Assumptions

- The `--success` value must reach ≥ 4.5:1 on `--card` in dark mode. Tune it if not.
- shadcn `label` may add a Radix dependency. Accepted.

## Success Criteria (Summary)

- Every page looks like the dashboard (screenshots).
- `npm run check:ui` passes over all views, and a literal added to any view fails CI and pre-commit.
- The unit, integration, smoke and E2E suites pass unchanged.
