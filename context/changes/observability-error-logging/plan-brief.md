# Structured server error logging and middleware auth-error handling — Plan Brief

> Full plan: `context/changes/observability-error-logging/plan.md`
> Research: `context/changes/observability-error-logging/research.md`

## What & Why

The observability audit (2026-11-13) found that production failures leave nothing in Workers Logs. Handled errors become redirects with no log line, and middleware drops `getUser()` errors, so a Supabase Auth outage silently signs every organizer out. This change makes failures findable: one structured log line per failure, and a 503 instead of a fake sign-out.

## Starting Point

Middleware destructures only `data.user` (`src/middleware.ts:10-13`). 12 API error branches redirect with a fixed or raw code, and only 2 routes log, with `code, message` only. There is no logging module.

## Desired End State

- An Auth outage gives a 503 on protected routes, and the public pages render as anonymous. Both cases write one `level:"error"` JSON line.
- Every API error branch writes one JSON line with `op`, the Supabase error fields, transport status and safe ids before its unchanged redirect.
- Users see the same messages as today.

## Key Decisions Made

| Decision                       | Choice                                                                | Why (1 sentence)                                                                | Source             |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| Testable seam                  | Pure `classifyAuthResult` in `src/lib/services/auth-session.ts`       | Vitest can't load `astro:*`; matches the services-with-tests pattern            | Research           |
| Auth outage on protected route | Plain-text 503 + `Retry-After`; public routes continue as anonymous   | Stops the fake sign-out and lost form POSTs without a new page                  | Plan (recommended) |
| Rejected JWT (`AuthApiError`)  | `warn` log, behave as signed out                                      | A burst after a key change is a real signal; per-user expiry stays low-severity | Plan (recommended) |
| Share token in logs            | First 8 hex of SHA-256                                                | Groups by league without leaking the only secret                                | Plan (recommended) |
| Scope                          | Logging at all 12 sites + raw unknown status (S3/P4); no parser split | Largest blindness removed per edit; parser split is its own change              | Plan (recommended) |
| Test level                     | Unit tests only; existing smoke/integration in CI                     | Behaviour change is in pure functions; routes keep redirects                    | Plan (recommended) |
| Log shape                      | One object per `console.*` call                                       | Workers Logs indexes fields from a single object                                | Research           |

## Scope

**In scope:** `src/lib/observability.ts`, `src/lib/services/auth-session.ts` with tests, middleware, the 8 API route files, and an AGENTS.md convention bullet.

**Out of scope:** splitting the share-page parser (S2), loud missing-config handling (S1/P5), fixed error codes on sign-in, sign-up and new league (L2), `500.astro`, release id, island boundaries, SQL invariants, tracker/alerts.

## Architecture / Approach

`middleware → classifyAuthResult → logServerEvent`, and each `route error branch → logServerEvent(op, errorFields(error) + ids) → existing redirect`. One module owns `console.*`, so there is one lint disable and one log shape.

## Phases at a Glance

| Phase                                          | What it delivers                     | Key risk                                          |
| ---------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| 1. Logger, classifier, middleware (test-first) | Red→green proof of P1; 503 on outage | Wrong guard order would still redirect to sign-in |
| 2. Log every API error branch                  | 12 sites logging structured JSON     | Accidentally logging PII (email, raw token)       |

**Prerequisites:** none beyond the repo. Local Supabase is only needed for the optional manual checks.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Assumes Workers Logs parses a single object argument into fields (not verified against Cloudflare docs).
- `warn` on `AuthApiError` may be noisy if many users carry stale cookies; downgrade later if so.

## Success Criteria (Summary)

- An Auth outage shows users "temporarily unavailable" instead of signing them out, and leaves an error line.
- Any failed create, submit, delete, settings or sign-in leaves a searchable JSON log line with the cause.
