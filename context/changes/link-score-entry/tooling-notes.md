# Link score entry: tooling notes

Source: Context7 docs (Astro, Supabase, Zod 4.6) plus the existing repo code. Written 2026-10-25, before planning.

**Assumption:** `change.md` has no intent text. This assumes the change means "players enter match results through the shared `/t/<token>` link" (the score entry that S-03 deferred). The roadmap was not checked.

## Recommended tools

| Layer         | Tool                                                                                                    | Why                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Write path    | Postgres RPC `submit_match_score(p_token, p_match_id, ...)`, `security definer`, `set search_path = ''` | Same pattern as `get_shared_league`. Tables stay closed to anon and the token is checked inside the function.        |
| Grants        | `revoke execute ... from public`, then `grant execute ... to anon` for that one function                | A definer function runs as `postgres` (bypasses RLS) and any role can call it by default, per the Supabase docs.     |
| HTTP endpoint | Astro API route under `src/pages/api/` with a `POST` export                                             | Matches the existing auth routes and `AGENTS.md`.                                                                    |
| Validation    | `zod` v4.6 (already in `package.json`)                                                                  | `z.uuid()`, `z.coerce.number().int().min(0).max(...)`, `.refine(..., { path })`, `z.flattenError()` for form errors. |
| Form UI       | Plain SSR `<form method="POST">` on `/t/[token]`, Post/Redirect/Get                                     | No JS, matches the S-03 filter form, avoids double submits.                                                          |
| Tests         | Vitest for a pure `validateScore` helper, plus an extension of `scripts/smoke.mjs`                      | The smoke test proved the anon boundary in S-03.                                                                     |

## Design points to settle in the plan

- **Authorization:** the RPC looks up the tournament by `share_token`, confirms the match belongs to it, then writes. The client never passes a tournament id.
- **Overwrites:** write-once (simpler, safer default) or editable (needs an audit trail). A link holder can otherwise submit a result for any match.
- **Schema:** a `results` table or columns on `matches`, with a check constraint (scores >= 0) and RLS enabled with no anon policies. The S-03 helper `filterFixturesByPlayer` already accepts `playedMatchIds`.

## Astro Actions vs API route

`defineAction({ accept: "form", input: z.object(...) })` gives typed form parsing and `Astro.getActionResult()` for inline errors without JS. The repo has no `src/actions/` and every endpoint is an API route, so API routes stay consistent. Actions on the Cloudflare adapter in Astro 7 are unverified, so check before choosing them.

## References (via Context7)

- Astro Actions: `/withastro/docs` (guides/actions)
- Supabase function security (definer, `search_path`, function privileges): `/supabase/supabase` (guides/database/functions)
- Zod refine, paths and error formatting: `/colinhacks/zod/v4.6.5`
