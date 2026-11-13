---
change_id: observability-error-logging
title: Structured server error logging and middleware auth-error handling
status: impl_reviewed
created: 2026-11-13
updated: 2026-11-13
archived_at: null
---

## Notes

Fix the top findings of context/audits/observability/2026-11-13_share-link-scores-create-league.md: add a structured server error-log helper (src/lib/observability.ts) called before every error redirect (L1, S3, S5, S6, P3, P4, P2, P8), and make middleware read getUser()'s error (P1: ignore AuthSessionMissingError, log others, 503 on retryable errors for protected routes). Bug-first: start with a failing test reproducing the middleware swallowing an auth outage.
