# My Tournaments List — Plan Brief

> Full plan: `context/changes/my-tournaments-list/plan.md`

## What & Why

Organizers can create and share a league today, but after signing in there is no way back to it except a bookmarked URL. This slice adds a list of their own tournaments on the dashboard (FR-004) and a permanent delete behind an explicit confirmation step (FR-012).

## Starting Point

`/dashboard` is a placeholder with only "Create league" and "Sign out". RLS gives owners SELECT and INSERT on `tournaments` and no DELETE; players, matches and results all cascade from the tournament row.

## Desired End State

The dashboard lists the organizer's tournaments, newest first, with a "Create your first league" prompt when empty. A league page offers "Delete league", which opens a confirm page; "Delete permanently" removes the league and everything under it and returns to the dashboard. Another user can neither see nor delete it.

## Key Decisions Made

| Decision        | Choice                                        | Why (1 sentence)                                                      |
| --------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| List placement  | On `/dashboard`                               | Already the protected landing page; no new route or middleware.       |
| Confirmation    | Server-rendered confirm page                  | Works without JS and a misclick cannot delete.                        |
| Ordering        | `created_at` desc, `id` desc; empty-state CTA | Newest league on top, deterministic on ties, never a dead end.        |
| Testing         | Smoke steps incl. cross-owner delete          | The real risk is deleting someone else's league, which RLS must stop. |
| Ownership check | RLS delete policy + `.delete().select("id")`  | Zero returned rows means not found or not yours, with no extra query. |

## Scope

**In scope:** dashboard list, delete policy migration, confirm page, delete endpoint, league-page delete link, smoke steps.

**Out of scope:** rename and points edit (S-07), score correction (S-06), soft delete or undo, search and pagination, type-the-name dialog.

## Architecture / Approach

Reads reuse the owner-scoped RLS select. Delete adds one `tournaments_delete_own` policy; the user-scoped client deletes the row and cascades remove children. The confirm page is a plain GET that renders a POST form to `/api/leagues/[id]/delete`, which redirects to the dashboard.

## Phases at a Glance

| Phase                       | What it delivers                                  | Key risk                               |
| --------------------------- | ------------------------------------------------- | -------------------------------------- |
| 1. My tournaments list      | Dashboard list with empty state, back link        | Low; read-only                         |
| 2. Delete with confirmation | Policy, confirm page, endpoint, smoke cross-owner | Irreversible delete must be owner-only |

**Prerequisites:** S-01 done (it is); local Supabase for the smoke run.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- The smoke script uses one cookie jar, so the cross-owner step must reset it between users.
- Assumes local Supabase auto-confirms sign-ups (the existing smoke already signs in right after sign-up).
- The `add-cup-format` change may later add a format column; the list does not depend on it.

## Success Criteria (Summary)

- An organizer finds all their leagues from the dashboard and opens any of them.
- Deleting requires visiting a confirm page and is permanent.
- A second account cannot see or delete another account's league (smoke-verified).
