# Structured server error logging and middleware auth-error handling — Implementation Plan

## Overview

The 2026-11-13 observability audit found that server failures leave nothing in Workers Logs. Handled errors become 302 redirects with no log line, and middleware drops `getUser()`'s error, so a Supabase Auth outage looks like a wave of normal sign-in redirects. This plan adds one structured logging helper and a pure auth-outcome classifier. Middleware uses both, and every API error branch logs before it redirects.

## Current State Analysis

- `src/middleware.ts:10-13` destructures only `data.user`. All `getUser()` errors are dropped, including outages (`AuthRetryableFetchError`).
- 12 error sites in API routes either don't log or log only `code, message`. They are listed in `research.md` §Q3.
- No logging module exists. `no-console` is `warn`, so each existing call carries its own `eslint-disable`.
- Vitest cannot import `astro:*` modules (`vitest.config.ts` has no Astro plugin). Testable logic must sit in modules free of `astro:*`, following the `src/lib/services/*.ts` pattern.

## Desired End State

- An Auth outage on a protected route returns **503** and writes one `level:"error"` JSON log line. On a public route it writes the same log line and the page renders as anonymous.
- A rejected session (`AuthApiError`, e.g. an invalid or expired JWT) writes a `level:"warn"` log line and behaves as signed out, as it does today.
- No session (`AuthSessionMissingError`) is silent, as it is today.
- Each API error branch listed below writes one JSON log line with `op`, the error fields (`name`, `message`, `code`, `details`, `hint`, `status`) and safe context (user id, league id, match id, 8-hex token hash) before its existing redirect. User-facing behaviour (`?error=` codes, redirects) does not change.
- Unit tests prove the classifier and the logger. The classifier test is red before the change.

### Key Discoveries:

- `getUser()` returns `AuthSessionMissingError` when there is no token (`@supabase/auth-js/dist/module/GoTrueClient.js:2705-2707`). It returns `AuthRetryableFetchError` for network failures and statuses 500–504 and 520–530 (`lib/fetch.js:22-44`), and `AuthApiError` for other statuses (`lib/fetch.js:78`). Guards `isAuthSessionMissingError`, `isAuthRetryableFetchError` and `isAuthApiError` are re-exported by `@supabase/supabase-js` (`dist/index.d.mts:7`).
- The PostgREST transport `status` (0 = network) sits on the result envelope, not on the error (`@supabase/postgrest-js/dist/index.cjs:3617-3635`).
- The unknown-status payloads (S3 in `api/scores.ts`, P4 in `settings.ts:130-133`) are still in scope at the route, so they can be logged there without changing `toScoreOutcome`.
- Convention: a fixed code goes in the URL and the raw error is logged server-side (`context/archive/2026-11-02-organizer-score-correction/plan.md:110`).

## What We're NOT Doing

- Splitting "not found" from "malformed" in `toSharedLeague` or the share page (audit fix step 4, S2). That's a later change.
- Failing loudly on missing Supabase config (S1/P5), apart from routing the two existing "not configured" `console.error` lines through the helper.
- Fixed `?error=` codes for `/leagues/new`, sign-in and sign-up (L2, P2 UX side). The raw message in the URL stays for now.
- `500.astro`, the `version_metadata` binding, island error boundaries, SQL invariant checks (P7, P9, P10, S9, L8).
- A tracker or alerting. Picking a vendor is `/10x-infra-research`.
- Logging validation rejections, or wrong-password sign-ins (`AuthApiError` with status < 500 on sign-in and sign-up).

## Implementation Approach

Phase 1 is test-first. A failing unit test shows that an `AuthRetryableFetchError` result is treated as anonymous. Then the classifier and logger are added and middleware uses them. Phase 2 is mechanical: one log call per error branch, keeping each redirect.

## Critical Implementation Details

- **Middleware ordering:** classify before the protected-route check. On a protected route, `auth-unavailable` must return 503 **instead of** the sign-in redirect. Otherwise users who are signed in get sent to sign-in during an outage, which is the bug.
- **Privacy:** never log the raw share token, an email or a password. Log `user.id` and the token hash only.

## Phase 1: Logger, auth classifier, middleware (test-first)

### Overview

Reproduce P1 as a red unit test, then add the two modules and make middleware use them.

### Changes Required:

#### 1. Auth outcome classifier

**File**: `src/lib/services/auth-session.ts` (+ `auth-session.test.ts`)

**Intent**: A pure function that turns `getUser()`'s `{ user, error }` into one of four outcomes, so middleware stops treating outages as signed-out users. Also move `PROTECTED_ROUTES` and its path check here so they can be tested.

**Contract**: `classifyAuthResult(user: User | null, error: unknown): { kind: "user"; user } | { kind: "anonymous" } | { kind: "auth-unavailable"; error } | { kind: "auth-rejected"; error }`. Mapping:

- user present → `user`;
- `isAuthSessionMissingError` or no error → `anonymous`;
- `isAuthRetryableFetchError` → `auth-unavailable`;
- any other error → `auth-rejected`.

Also `isProtectedPath(pathname: string): boolean`, with the same prefixes as today: `/dashboard`, `/leagues`, `/api/leagues`. Tests build real error instances imported from `@supabase/supabase-js`.

#### 2. Structured logger

**File**: `src/lib/observability.ts` (+ `observability.test.ts`)

**Intent**: The single place that writes server logs. It writes one JSON object per call, so Workers Logs can index the fields, and it pulls the diagnostic fields out of Supabase errors. It has no `astro:*` imports.

**Contract**:

- `logServerEvent(level: "error" | "warn", op: string, fields?: Record<string, unknown>)` calls `console[level]` with **one object** `{ level, op, ...fields }`.
- `errorFields(error: unknown)` returns `{ name?, message?, code?, details?, hint?, status?, stack? }`. It reads `status` from an AuthError, and leaves out undefined or empty-string values.
- `hashToken(token: string): Promise<string>` returns the first 8 hex characters of the token's SHA-256 (`crypto.subtle`, available in Workers and Node 22).

This module carries the only `no-console` disable, with a justification.

#### 3. Middleware

**File**: `src/middleware.ts`

**Intent**: Read the `getUser()` error and act on the classified outcome.

**Contract**:

- `auth-unavailable` → `logServerEvent("error", "auth.getUser", { path, ...errorFields })`. On a protected path, return `new Response("Sign-in service is temporarily unavailable. Try again shortly.", { status: 503, headers: { "Retry-After": "30" } })`. Otherwise continue with `user = null`.
- `auth-rejected` → `logServerEvent("warn", "auth.getUser", { path, ...errorFields })`, then `user = null`, keeping the existing redirect behaviour.
- `anonymous` → silent.

### Success Criteria:

#### Automated Verification:

- The new classifier test fails before `auth-session.ts` exists (red), proving the outage case: `npm test -- auth-session`
- Unit suite passes: `npm test`
- Lint passes with no new warnings in changed files: `npm run lint`
- Types check: `npx astro check`

#### Manual Verification:

- With local Supabase running and the Auth container stopped, `GET /dashboard` with a stale session cookie returns 503 and the preview log shows one `"level":"error","op":"auth.getUser"` line. This check is optional and needs Docker.

---

## Phase 2: Log every API error branch

### Overview

Call the helper at each error site from `research.md` §Q3, keeping redirects and user-facing codes.

### Changes Required:

#### 1. League creation

**File**: `src/pages/api/leagues/index.ts`

**Intent**: L1. Log `create_cup`/`create_league` failures before the redirect.

**Contract**: destructure `status` from the RPC result. Then call `logServerEvent("error", "leagues.create", { format, userId, playerCount, transportStatus: status, ...errorFields(error) })`.

#### 2. Anonymous score submission

**File**: `src/pages/api/scores.ts`

**Intent**: S5 and S3. Replace the two `console.error` calls with the helper, adding `matchId`, the token hash and the transport status. When `toScoreOutcome` yields `server` from an unexpected payload, log the raw `status` value.

**Contract**:

- `op: "scores.submit"` for RPC errors.
- `op: "scores.submit.unexpected-status"` for the default branch, with `received: typeof status === "string" ? status : typeof data`.
- `op: "supabase.not-configured"` for the null client.

#### 3. Organizer routes

**Files**: `src/pages/api/leagues/[id]/delete.ts`, `src/pages/api/leagues/[id]/settings.ts`, `src/pages/api/leagues/[id]/scores.ts`

**Intent**: P3 and P4, and make the score correction route follow the same convention.

- **delete:** log errors other than 22P02.
- **settings:** log errors other than 22P02 and 23514. Also log an unknown RPC status (anything other than `updated` or `points_locked`) as `settings.update.unexpected-status` before the existing `league-not-found` redirect.
- **score correction:** replace its 3 `console.error` calls with the helper.

**Contract**: ops `leagues.delete`, `leagues.settings`, `leagues.settings.unexpected-status`, `scores.correct.lookup`, `scores.correct`, plus `supabase.not-configured`. Fields include `leagueId`, `userId` and `matchId` where in scope.

#### 4. Auth endpoints

**Files**: `src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts`

**Intent**: P2 log side and P8. Sign-in and sign-up log only when the error is **not** an `AuthApiError` with status < 500, which leaves out wrong passwords and weak-password rejections. Sign-out reads and logs its error.

**Contract**: ops `auth.signin`, `auth.signup`, `auth.signout`. Never log the email or password.

#### 5. Convention note

**File**: `AGENTS.md` (Key conventions)

**Intent**: Tell future agents to log through `@/lib/observability`, not raw `console.*`.

**Contract**: one bullet under "Key conventions".

### Success Criteria:

#### Automated Verification:

- No raw `console.` calls remain in `src/pages` and `src/middleware.ts`: `grep -rn "console\." src/pages src/middleware.ts` returns nothing
- Unit suite passes: `npm test`
- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Build passes: `npm run build`
- CI `ci`, `smoke` (integration + smoke against the preview) and `migration-upgrade` pass on the PR

#### Manual Verification:

- Submitting a score in the local preview with the DB stopped writes one JSON `scores.submit` line containing `transportStatus` and `tokenHash`, and no raw token

---

## Testing Strategy

### Unit Tests:

- `auth-session.test.ts`: one case per outcome, using real `AuthSessionMissingError`, `AuthRetryableFetchError` (status 0 and 503) and `AuthApiError` (401). Covers user present, no error, and `isProtectedPath` boundaries (`/leagues`, `/leagues/x`, `/api/leagues/x/delete` protected; `/`, `/t/abc`, `/auth/signin` not).
- `observability.test.ts`:
  - `logServerEvent` calls `console.error`/`console.warn` once with a single object;
  - `errorFields` on a PostgrestError-like object and on an AuthError keeps code, details, hint and status and leaves out empty values;
  - `hashToken` is deterministic, 8 hex characters, and does not contain the input.

### Integration Tests:

- None new. The existing `smoke` job proves the auth and score paths still work against real Supabase.

### Manual Testing Steps:

1. Optional: stop Supabase Auth locally, load `/dashboard` and see the 503, then check the log line.

## Performance Considerations

`hashToken` adds one SHA-256 of about 40 bytes, and only on error paths. Negligible.

## Migration Notes

None. No schema change.

## References

- Research: `context/changes/observability-error-logging/research.md`
- Audit: `context/audits/observability/2026-11-13_share-link-scores-create-league.md`
- Existing convention: `src/pages/api/scores.ts:44-45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logger, auth classifier, middleware (test-first)

#### Automated

- [x] 1.1 The new classifier test fails before `auth-session.ts` exists (red), proving the outage case
- [x] 1.2 Unit suite passes
- [x] 1.3 Lint passes with no new warnings in changed files
- [x] 1.4 Types check

#### Manual

- [ ] 1.5 Auth container stopped → protected route returns 503 with one error log line

### Phase 2: Log every API error branch

#### Automated

- [ ] 2.1 No raw `console.` calls remain in `src/pages` and `src/middleware.ts`
- [ ] 2.2 Unit suite passes
- [ ] 2.3 Lint passes
- [ ] 2.4 Types check
- [ ] 2.5 Build passes
- [ ] 2.6 CI `ci`, `smoke` and `migration-upgrade` pass on the PR

#### Manual

- [ ] 2.7 DB stopped → score submit writes one JSON `scores.submit` line with `transportStatus` and `tokenHash`, no raw token
