---
date: 2026-11-13T19:40:00+01:00
researcher: Claude (Opus 5.5) for Marcin Ciechan
git_commit: 77defc215d34442985e7d3885d8c011cd7d237d6
branch: master
repository: Teamensioning
topic: "How to add structured server error logging and make middleware handle getUser() errors"
tags: [research, observability, middleware, supabase-auth, logging]
status: complete
last_updated: 2026-11-13
last_updated_by: Claude (Opus 5.5)
---

# Research: structured server error logging + middleware auth-error handling

**Date**: 2026-11-13T19:40+01:00
**Git Commit**: 77defc2 (dirty tree: only `.claude/launch.json`, unrelated)
**Branch**: master
**Repository**: Teamensioning

## Research Question

From `context/audits/observability/2026-11-13_share-link-scores-create-league.md`, the change needs:

1. A structured server error-log helper, called before every error redirect. Findings L1, S3, S5, S6, P3, P4, P2, P8.
2. The middleware reading `getUser()`'s error (P1). It should ignore "no session", log everything else, and return 503 on retryable errors for protected routes.

The work is bug-first, so it starts with a failing test that reproduces the middleware swallowing an auth outage. Questions:

- Q1. What error values does `getUser()` return, and how can "signed out" be told apart from "Auth is down"?
- Q2. How can the middleware's behaviour be tested, given the existing unit-test setup?
- Q3. Which call sites must the helper reach, and what fields do they have?
- Q4. What constraints do lint, conventions and prior decisions put on a logging helper?

## Summary

- **Q1:** a request with no session gets a _returned_ `AuthSessionMissingError` (`@supabase/auth-js/dist/module/GoTrueClient.js:2705-2707`), which is normal anonymous traffic. A network failure, or an Auth response with status in `{500–504, 520–530}`, becomes an `AuthRetryableFetchError` (`auth-js/dist/module/lib/fetch.js:22-24,28,36,42-44`). Other non-2xx responses become an `AuthApiError` carrying the HTTP status (`fetch.js:78`); an invalid or expired JWT returns 401/403 here. `getUser` returns all of these and doesn't throw (`GoTrueClient.js:2716-2724`); it throws only non-Auth errors. The type guards `isAuthSessionMissingError`, `isAuthRetryableFetchError` and `isAuthApiError` are re-exported from `@supabase/supabase-js` (`supabase-js/dist/index.d.mts:7`, `export * from "@supabase/auth-js"`).
- **Q2:** vitest has no Astro virtual-module support. `vitest.config.ts` doesn't use `getViteConfig`, and no unit test in `src` mocks `astro:*`. `src/middleware.ts` imports `astro:middleware`, and `src/lib/supabase.ts:3` imports `astro:env/server`. The repo's pattern is pure services in `src/lib/services/*.ts` with sibling `*.test.ts` (e.g. `score-submission.ts`/`.test.ts`, `dashboard-errors.ts`/`.test.ts`). The testable unit is therefore a pure decision function plus a logger with an injectable sink. The middleware becomes a thin caller.
- **Q3:** there are 11 error-branch call sites in API routes plus 1 in middleware (listed under Detailed Findings). All of them have a `PostgrestError` or `AuthError` in hand. None reads the response `status` from the PostgREST envelope today.
- **Q4:**
  - `no-console` is `warn` for `src/**` (`eslint.config.*:25`). The existing calls carry an `eslint-disable-next-line` with a reason (`src/pages/api/scores.ts:44,58`).
  - A helper module centralizes this into one disable.
  - Prior changes chose "fixed code in URL, raw error logged server-side" (`context/archive/2026-11-02-organizer-score-correction/plan.md:110`).
  - An earlier review flagged that the delete route's `server` branch is "neither shown nor logged" (`context/archive/2026-10-25-dashboard-ui-tokens/reviews/impl-review.md:111`). That gap was never closed and is finding P3.

## Detailed Findings

### Q1 — getUser() error taxonomy (auth-js as installed)

- `getUser()` → `_getUser()` (`GoTrueClient.js:2670-2689`).
- No access token → `return { data: { user: null }, error: new AuthSessionMissingError() }` (`:2705-2707`).
- Any `AuthError` thrown inside → caught, and `_removeSession()` is called **only** for a session-missing error. The result is returned, not thrown (`:2716-2724`). Non-Auth errors are rethrown (`:2725`). Astro would log those, per the audit's capture model.
- `handleError` (`lib/fetch.js:25-78`):
  - a non-Response value (fetch rejected, i.e. network) → `AuthRetryableFetchError(msg, 0)` (`:28`);
  - unparseable body with status in `NETWORK_ERROR_CODES` → retryable (`:34-37`);
  - parsed body with status in `NETWORK_ERROR_CODES` → retryable (`:42-44`);
  - otherwise `AuthApiError(msg, status, code)` (`:78`).
- `NETWORK_ERROR_CODES` = 500, 501, 502, 503, 504, 520–530 (`:22-24`).
- `isAuthRetryableFetchError` checks `error.name === 'AuthRetryableFetchError'` (`lib/errors.js:222-224`). It is name-based, so a test can build the real class.
- **Implication for the design (inference):** the outcomes split into three groups, not two:
  - `session-missing`: anonymous; silent; user = null.
  - `retryable`: outage; log at error level; for protected routes respond 503 instead of redirecting to sign-in.
  - other `AuthApiError` (e.g. 401/403 bad or expired JWT): the user is effectively signed out. Redirecting is the right UX, but it should be logged at warn level, because a burst of these after a deploy (JWT secret or key change) is a real incident signal.

  Whether `AuthApiError` 4xx should be logged at all is a product choice for the plan.

### Q2 — testability

- `vitest.config.ts` defines `unit` (includes `src/**/*.test.ts`, `scripts/**/*.test.ts`, excludes integration) and `integration` projects. It has an `@` alias only and no Astro plugin.
- Searching `src` for `vi.mock` or `astro:` in `*.test.ts` found no matches (inspected via grep). Unit tests import pure modules only.
- `src/lib/supabase.ts:3` and `src/lib/config-status.ts:1` import `astro:env/server`. Any test importing those, or `src/middleware.ts`, would fail to resolve without `vi.mock`.
- Feasible test seams:
  1. A pure `classifyAuthResult(user, error)` → `"user" | "anonymous" | "auth-unavailable" | "auth-rejected"`, plus a `protectedRouteResponse(...)` decision, in `src/lib/services/auth-session.ts`, tested with real `AuthSessionMissingError` / `AuthRetryableFetchError` / `AuthApiError` instances imported from `@supabase/supabase-js`.
  2. A logger in `src/lib/observability.ts` with no `astro:*` imports, so it is unit-testable with `vi.spyOn(console, "error")`.
- **Red test for the bug:** feeding `{ user: null, error: new AuthRetryableFetchError("fetch failed", 0) }` to the decision function and expecting `auth-unavailable` (or a 503 decision for `/dashboard`) fails today, because no such function exists and the middleware treats it as anonymous (`src/middleware.ts:10-21`).
- An E2E/smoke reproduction would need to stop Auth on local Supabase; possible but heavy. Not required for the red test.

### Q3 — call sites for the helper (src, excluding tests)

| #   | Location                                                                          | Error in hand                                         | Logs today?          | Audit id |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------- | -------- |
| 1   | `src/middleware.ts:10-13`                                                         | `AuthError` (discarded)                               | no                   | P1       |
| 2   | `src/pages/api/leagues/index.ts:61-63`                                            | `PostgrestError` (`create_cup`)                       | no                   | L1       |
| 3   | `src/pages/api/leagues/index.ts:81-83`                                            | `PostgrestError` (`create_league`)                    | no                   | L1       |
| 4   | `src/pages/api/scores.ts:57-60`                                                   | `PostgrestError`                                      | `code, message` only | S5       |
| 5   | `src/pages/api/scores.ts:63-70` (`outcome.kind === "error"` from unknown status)  | raw `data` (discarded in `score-submission.ts:24,37`) | no                   | S3       |
| 6   | `src/pages/api/leagues/[id]/delete.ts:27-29`                                      | `PostgrestError`                                      | no                   | P3       |
| 7   | `src/pages/api/leagues/[id]/settings.ts:70-74`                                    | `PostgrestError`                                      | no                   | P4       |
| 8   | `src/pages/api/leagues/[id]/settings.ts:79` (unknown status → `league-not-found`) | raw `data`                                            | no                   | P4       |
| 9   | `src/pages/api/leagues/[id]/scores.ts:43,60`                                      | `PostgrestError`                                      | `code, message` only | S5-like  |
| 10  | `src/pages/api/auth/signin.ts:15-16`                                              | `AuthError`                                           | no                   | P2       |
| 11  | `src/pages/api/auth/signup.ts:15-16`                                              | `AuthError`                                           | no                   | P2       |
| 12  | `src/pages/api/auth/signout.ts:7`                                                 | `AuthError` (discarded)                               | no                   | P8       |

- Supabase-not-configured branches (`api/scores.ts:45`, `api/leagues/[id]/scores.ts:29`, `leagues/index.ts:38-40`, `signin.ts:10-12`, `signup.ts:10-12`) are finding P5. They are out of this change's stated scope, but the helper would serve them too.
- PostgREST `status` (0 = network) sits on the result envelope (`{ data, error, status }`), not on the error. Callers must destructure it to log it. Evidence: `@supabase/postgrest-js/dist/index.cjs:3617-3635` (`toTransportFailure` puts `status` on the envelope; error `details` is `""` and `message` is `"<name>: <message>"`).
- Fixing S3 and P4 needs the raw payload kept. `toScoreOutcome` currently returns `{ kind: "error", code: "server" }` and drops it (`score-submission.ts:24,37`). A contract change, such as adding an optional `raw`/`reason`, touches `score-submission.test.ts`.

### Q4 — constraints

- **Lint:** `no-console: "warn"` for app code. It is turned off only for `scripts/**/*.mjs` and `.claude/hooks/**/*.mjs` (`eslint.config.*:72-78`). A single helper module with one justified disable keeps routes clean.
- **Privacy:** the share token is the only secret and appears in `/t/<token>` URLs (`src/pages/t/[token].astro:33-34` comment). The audit's fix order requires a token hash instead of the raw value, and a user id instead of an email. Workers' `crypto.subtle.digest` is async. A short non-cryptographic prefix (first 6 chars) is an alternative; this is a plan choice.
- **Runtime:** per `context/foundation/lessons.md` (Cloudflare Workers lesson), don't use `Astro.locals.runtime`. The helper needs no env access, and `console.*` is the Workers Logs sink.
- **Workers Logs structured fields** need one JSON object per call (assumption from the audit, §2 Assumptions; not verified against Cloudflare docs in this research). Passing a plain object to `console.error` is the conventional form.
- **Response for retryable errors on protected routes:** today middleware returns `context.redirect("/auth/signin")` (`src/middleware.ts:18-21`). A 503 needs a body. There is no `500.astro`/`503` page (audit P7). A plain `new Response("Service temporarily unavailable", { status: 503 })` or a small page is a plan choice.

## Code References

- `src/middleware.ts:6-25`: the whole middleware; `error` from `getUser()` is never destructured.
- `src/lib/supabase.ts:8-10`: `null` client when env missing.
- `src/lib/services/score-submission.ts:24,37,46`: payload → outcome mapping that drops raw data.
- `src/pages/api/scores.ts:44-45,58-59`: existing `console.error` convention with eslint-disable justification.
- `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2670-2727`: `getUser` / `_getUser`.
- `node_modules/@supabase/auth-js/dist/module/lib/fetch.js:22-78`: error classification.
- `node_modules/@supabase/auth-js/dist/module/lib/errors.js:100-108,217-224`: error classes and guards.
- `node_modules/@supabase/supabase-js/dist/index.d.mts:7`: re-export of auth-js.
- `vitest.config.ts`: unit/integration projects, no Astro plugin.

## Architecture Insights

- Routes are thin; logic that needs tests lives in `src/lib/services/` as pure functions. The new decision logic should follow that pattern.
- The error UX contract (fixed `?error=` codes) is deliberate and should be kept. The change adds a log step _before_ each redirect and doesn't replace the redirect, except for the 503 on retryable auth for protected routes.
- One helper covering both `PostgrestError` and `AuthError` must handle different shapes: `{code, details, hint, message}` vs `{name, status, code, message}`.

## Historical Context (from prior changes)

- `context/archive/2026-11-02-organizer-score-correction/plan.md:110` set the convention "Raw database errors are logged server-side only (same `console.error` convention as `src/pages/api/scores.ts`)". **Supported:** the score-correction route does log (`api/leagues/[id]/scores.ts:43,60`). **Partial:** the convention was not applied to delete, settings, leagues/index or auth.
- `context/archive/2026-10-25-dashboard-ui-tokens/reviews/impl-review.md:111` noted that the delete `server` branch is "neither shown nor logged", with `no-console` as the reason it stayed unlogged. **Still accurate** at 77defc2 (`delete.ts:27-29`).

## Related Research

- `context/audits/observability/2026-11-13_share-link-scores-create-league.md`: source audit (findings and fix order).

## Open Questions (for /10x-plan)

1. Should `AuthApiError` 4xx from `getUser()` (expired/invalid JWT) be logged at warn level or stay silent? It is high volume for normal session expiry.
2. What should a protected route return when Auth is unavailable: a plain-text 503, or a 503 page following the page-shell convention? And should public pages just log and continue as anonymous?
3. How should the token be hashed for logs: async SHA-256 prefix or a raw prefix?
4. Scope: should this change also close S3/P4 (raw payload preserved through `toScoreOutcome` and settings status), or only add logging at the 12 sites and leave the parser split (audit fix step 4) to a later change?
