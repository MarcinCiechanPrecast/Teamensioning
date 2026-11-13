<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Structured server error logging and middleware auth-error handling

- **Plan**: context/changes/observability-error-logging/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Success criteria: the automated rows 1.1–1.4 and 2.1–2.5 ran green in the implementation session. Row 2.6 (CI) is pending on the PR. The manual rows 1.5 and 2.7 are unchecked and pending, because they need Docker with Auth or the DB stopped.

## Findings

### F1 — Raw share token logged via `path` in middleware

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:26,37
- **Detail**: Both `auth.getUser` events log `path` for every route, including `/t/<64-hex token>`. A visitor with a stale cookie opening a share link (warn), or any share-page view during an Auth outage (error), writes the raw share token into indexed log fields. This breaks the rule this change added to AGENTS.md.
- **Fix**: Add `redactPath()` to `@/lib/observability` that rewrites `/t/<token>` to `/t/:token`, use it in middleware, and add a unit test.
- **Decision**: FIXED

### F2 — Score correction logs organizer mistakes at error level

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/leagues/[id]/scores.ts:47,72
- **Detail**: Every lookup and update error is logged before `toCorrectionOutcome`. That includes 22P02 (malformed id), P0001 draw-not-allowed, 55000 next-round-played and 23514, which are all user outcomes (`src/lib/services/score-correction.ts:44-55`). Normal organizer actions produce error lines and drown real faults.
- **Fix**: Compute the outcome first and log only when `outcome.code === "server"` (same as scores.ts unexpected-status).
- **Decision**: FIXED

### F3 — `details` can carry a failing row containing the share token

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/observability.ts:22
- **Detail**: For 23xxx errors on `tournaments`, Postgres puts "Failing row contains (…)" in `details`, and that row includes `share_token`. `logCreateFailure` logs it verbatim. It is hard to reach today because zod pre-validates.
- **Fix**: In `errorFields`, mask 64-hex runs (the share-token shape) in every string field; add a test.
- **Decision**: FIXED

### F4 — "Supabase not configured" branches redirect with an error but don't log

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signin.ts:13, signup.ts:13, leagues/index.ts:40, leagues/[id]/delete.ts:18, leagues/[id]/settings.ts:57
- **Detail**: The new AGENTS.md rule says every error branch logs before it redirects with `?error=`. Only the two score routes log `supabase.not-configured`.
- **Fix**: Log `supabase.not-configured` with a `route` field in the five branches. This adds logging only; it does not fail loudly, which the plan keeps out of scope.
- **Decision**: FIXED

### F5 — AGENTS.md names the field `status`; the code uses `transportStatus`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:50
- **Detail**: Routes log the PostgREST envelope status as `transportStatus`. `errorFields().status` is the Auth HTTP status.
- **Fix**: Say `transportStatus` in the rule.
- **Decision**: FIXED

### F6 — Test case "Auth 500 API error" can't be produced by auth-js 2.116

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/auth-session.test.ts
- **Detail**: auth-js turns Auth 5xx into `AuthRetryableFetchError`. The case still pins the `>= 500` guard.
- **Fix**: Keep the case and add a comment explaining it guards the boundary.
- **Decision**: FIXED

### F7 — `errorFields` can throw on a BigInt (`JSON.stringify`)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/observability.ts:28
- **Detail**: Theoretical. Callers pass Supabase errors only.
- **Fix**: Handle non-object primitives without `JSON.stringify`.
- **Decision**: FIXED

### F8 — Rejected session warns on every request until re-sign-in

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:35-38
- **Detail**: auth-js removes the session only for session-missing errors, so a 401 `bad_jwt` cookie stays and warns on every request. It doesn't lock anyone out.
- **Fix**: Accept for now. A burst after a key rotation is exactly the signal the warn exists for. Clearing the cookie with `signOut({ scope: "local" })` changes auth behaviour and belongs in its own change.
  - Strength: Keeps this change logging-only.
  - Tradeoff: Noisy warn lines from stale browsers.
  - Confidence: MED — volume is unknown until production data exists.
  - Blind spot: Real stale-cookie volume.
- **Decision**: ACCEPTED (follow-up candidate)

### F9 — `stack` adds little for PostgREST errors; `cause` not kept

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/observability.ts:22,35
- **Detail**: The PostgREST stack points inside postgrest-js. `cause` and `originalError` are not serialized. auth-js keeps only the message for network failures anyway.
- **Fix**: Revisit if log size or the missing cause matters in practice.
- **Decision**: SKIPPED
