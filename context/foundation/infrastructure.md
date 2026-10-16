---
project: teamensioning
researched_at: 2026-10-10
recommended_platform: Cloudflare Workers (with static assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 SSR (React 19 islands) + Supabase (external Postgres + auth)
  runtime: Cloudflare workerd via @astrojs/cloudflare 14.x, wrangler 4.x
---

## Recommendation

**Deploy on Cloudflare Workers (Workers + static assets, not Pages).**

Cloudflare is the only candidate that passed all five agent-friendly criteria (10/10). It is also the only one that needs no migration: the repo already ships `wrangler.jsonc` with `main: "@astrojs/cloudflare/entrypoints/server"`, an assets binding and `nodejs_compat`, and `src/lib/supabase.ts` already reads secrets through `astro:env/server`, the env API adapter v13+ expects. The interview answers did not change the ranking: no persistent connections, neutral on cost vs. DX, no prior platform familiarity, a single region (Poland/EU), and Supabase already fixed as an external database. The other five platforms would all need an adapter swap inside a 3-week MVP. Start on Workers Free and move to Workers Paid ($5/mo) as soon as CPU-time metrics show requests approaching the 10 ms cap (see Risk Register).

## Platform Comparison

Scoring: Pass = 2, Partial = 1, Fail = 0. Research checked on 2026-10-10. No platform was dropped by a hard filter: persistent connections are not required (PRD `has_realtime: false`), and every candidate can run Astro SSR, five of them after an adapter swap.

| Platform           | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total  |
| ------------------ | --------- | ------------------ | ------------------- | ----------------- | ----------------- | ------ |
| Cloudflare Workers | Pass      | Pass               | Pass                | Pass              | Pass              | **10** |
| Vercel             | Pass      | Pass               | Pass                | Pass              | Partial           | 9      |
| Render             | Partial   | Pass               | Pass                | Pass              | Pass              | 9      |
| Netlify            | Partial   | Pass               | Pass                | Pass              | Pass              | 9      |
| Railway            | Partial   | Pass               | Pass                | Pass              | Pass              | 9      |
| Fly.io             | Partial   | Partial            | Pass                | Pass              | Partial           | 7      |

**Cloudflare Workers.** The `wrangler` CLI covers the whole loop: `deploy`, `versions upload --preview-alias`, `rollback` (last 100 versions) and `tail`. There is no OS to manage. Docs are published as `llms.txt` per product, and there is an official Pages-to-Workers migration prompt. Cloudflare runs MCP servers for its API (`mcp.cloudflare.com/mcp`) and docs (no beta/GA labels on the docs page as of 2026-10-10; no dedicated observability MCP server is listed). Free tier: 100k requests/day and 10 ms CPU per request. Paid: $5/mo for 10M requests and 30M CPU-ms. Static asset requests are free.

**Vercel.** Strong CLI: `vercel deploy --prod`, `rollback`, `promote`, `logs`, plus `--non-interactive`. Every docs page is available as `.md`. `@astrojs/vercel` 11.0.13 supports Astro ^7. Its MCP server (`mcp.vercel.com`) launched as **Public Beta** on 2025-08-04, and I found no GA announcement (so: Partial). The free Hobby plan is limited to **non-commercial use**, which an in-company league arguably isn't, so in practice this means Pro at $20/seat/mo. New projects default to the `iad1` (US) region and must be pinned to `fra1`. Vercel's own Astro guide is out of date (it shows the removed `/serverless` import). WebSockets are **public beta** (since 2026-06-22).

**Render.** Native Node, Frankfurt region, `render.yaml` blueprints, CLI v2.28 with `-o json`, `--confirm` and `deploys create --wait`. **Rollback is not in the CLI**: it is available through the REST API (which leaves autodeploy on) or the dashboard (Partial). The MCP server has been **GA since 2025-08**, but its key reaches the whole account. Free web services cold-start in about 1 minute, so Starter at about $7/mo is the realistic tier. Newer CLI features sit under `render ea` (**early access**).

**Netlify.** Agent-readable docs (`llms.txt`, `.md` pages), `netlify logs --json` (2026-05-01), official MCP server. There is no rollback command; the workaround is `netlify api restoreSiteDeploy` (Partial). Disqualifying in practice: SSR functions run in **US-East (`cmh`) on Free/Personal**, and choosing an EU region is Pro-only. Under credit-based pricing (Sept 2025), each production deploy costs 15 of the Free tier's 300 credits, so auto-deploy on merge would pause the site after about 20 merges.

**Railway.** A good CLI (`railway up --ci --json` with deterministic exit codes), `llms.txt`, a remote and a local MCP server. **Rollback is dashboard-only**, within a 72h image retention window on Hobby (Partial). **Config as Code (`railway.toml`/`railway.json`) is deprecated, with a hard cutoff on 2026-12-01**, about four weeks after the MVP deadline. Nixpacks is deprecated in favour of Railpack.

**Fly.io.** Runs any container, costs about $0.50–3/mo with auto-stop, has `.md` docs and `llms.txt`. But there is no free tier for new orgs. You would own a Dockerfile (Partial on managed). Rollback means redeploying a previous image digest (Partial). `fly mcp` is **experimental** (Partial). The Warsaw region (`waw`) is **deprecated** (Region Consolidation, about Sept 2025).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Full marks on the criteria, zero migration cost, and the lowest running cost: $0 on Free, $5/mo on Paid. Version-based rollback and preview aliases can be scripted with `wrangler` alone. `astro dev` already runs on the workerd runtime through the Cloudflare Vite plugin, so local behaviour matches production apart from the CPU limit.

#### 2. Vercel

The most complete CLI among the alternatives (one-command rollback and promote) and good Astro 7 support. It loses on two practical points: the commercial-use restriction pushes it to $20/mo Pro, and switching means swapping the adapter, adding a `vercel.json` region pin, and rewiring secrets inside a 3-week timeline. Its MCP server is still beta.

#### 3. Render

A conventional Node web service in Frankfurt with a GA MCP server, at about $7/mo. It ranks behind Vercel because rollback isn't in the CLI (API/dashboard only, and an API rollback leaves autodeploy on), the free tier's 1-minute cold starts are unusable for auth redirects, and it needs the same adapter swap (`@astrojs/node`).

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **The Free plan's 10 ms CPU cap applies to every request.** SSR rendering, `@supabase/ssr` cookie parsing, session checks and computing standings in JS all count (network wait does not). Going over fails the request with error 1102. The leaderboard and fixtures pages are the most exposed as player counts grow (12 players → 66 fixtures).
2. **Every request makes at least one round trip to Supabase.** The middleware resolves the user on each request, and pages then make more Supabase calls one after another. Free allows 50 subrequests per request. Placing the Worker close to the database is only possible with Smart Placement (**beta**) or placement region hints (no stated status; host-based placement is **experimental**).
3. **`wrangler rollback` is code-only.** It does not revert Supabase migrations, bindings or data. Rolling back across a schema change leaves old code running against a new schema.
4. **Preview versions share production secrets.** A version uploaded with `--preview-alias` uses the same `SUPABASE_URL`/`SUPABASE_KEY` as production unless a separate Cloudflare environment is configured, so testing a preview writes to the production database. Preview URLs also don't appear in `wrangler tail` or Workers Logs.
5. **The adapter creates a `SESSION` KV namespace on deploy without asking.** It is eventually consistent (up to 60 s) and has free-tier write limits. It's harmless as long as `Astro.session` stays unused, but it is an unplanned resource on the account.

### Pre-Mortem — How This Could Fail

The team shipped on Workers Free because the starter "just deployed." In week two, a 12-player league had 66 fixtures, and the leaderboard page now parsed cookies, verified the session, fetched all matches and sorted standings in a single request. It intermittently returned error 1102. Nobody noticed in dev, because `astro dev` doesn't enforce the CPU cap. Players saw a blank error page just as the office tournament kicked off, decided "the link is broken," and went back to the chat thread. The organizer tried a preview deploy to debug, but the preview pointed at the production Supabase project, and a test score overwrote a real match result, breaking the "first submission wins" guarantee. A hurried `wrangler rollback` restored the code but not the migration that added a column, so score entry failed outright. Meanwhile, tutorials the agent pulled in suggested `Astro.locals.runtime.env`, which no longer exists in adapter v13+, and that cost a day. The real failures were assumptions: that free-tier limits are only about cost rather than correctness, that previews are isolated, and that rollback undoes migrations.

### Unknown Unknowns

- **Many tutorials are out of date for adapter v14.** `Astro.locals.runtime` was **removed in v13**; use `astro:env/server` (already in the repo) or `import { env } from "cloudflare:workers"`. The adapter **no longer supports Pages**, so "deploy Astro to Pages" guides don't apply. Pages itself is not officially deprecated, but new investment goes to Workers.
- **`astro dev` already runs in workerd**, so `wrangler dev` is redundant. But local dev doesn't enforce the production CPU limit, so it can't catch 1102 errors before deploy.
- **The secrets are declared `optional: true`** in `astro.config.mjs`. If `wrangler secret put` was never run, the app deploys successfully and only fails at runtime when the Supabase client is created. Nothing fails at build or deploy time.
- **`workers.dev` and preview URLs are public by default.** That's fine for unlisted tournaments, but it also exposes work-in-progress previews. Cloudflare Access can protect them if needed.
- **Wrangler minifies production output**, so stack traces in `wrangler tail` are hard to read. Use `vite.build.minify=false` while debugging, or upload source maps. Packages that ship CommonJS can also break on workerd (pre-bundle them with `optimizeDeps.include`).

## Operational Story

- **Preview deploys**: CI runs `npx wrangler versions upload --preview-alias pr-<number>`, which gives `pr-<number>-teamensioning.<subdomain>.workers.dev`. It needs `preview_urls = true` in `wrangler.jsonc` and works on workers.dev only. Previews must point at a separate Supabase project (a separate Cloudflare environment with its own secrets) so they never write to production data. CI in fork PRs has no access to repository secrets, so no preview is built for them.
- **Secrets**: production `SUPABASE_URL`/`SUPABASE_KEY` are stored with `npx wrangler secret put <NAME>` (Workers Secrets, encrypted, write-only once set). Local values go in `.dev.vars` (gitignored). CI gets `CLOUDFLARE_API_TOKEN` (scoped to _Workers Scripts: Edit_ for this account, no DNS or billing) and `CLOUDFLARE_ACCOUNT_ID` as GitHub Secrets. To rotate: run `wrangler secret put` with the new value, which takes effect on the next request. No redeploy is needed.
- **Rollback**: list versions with `npx wrangler deployments list`, then `npx wrangler rollback <version-id>` (or no ID for the previous version). Takes effect in seconds. Caveat: code only. Supabase migrations must be written to work with both the old and new code (add columns first, drop them later), because they are never rolled back automatically.
- **Approval**: a human merges to `master`, and CI's deploy job then runs `wrangler deploy` unattended. An agent may run unattended: preview uploads, `wrangler tail`, `deployments list`, and `rollback` to the immediately previous version. Human-only: rotating the production Supabase key, applying or reverting production database migrations, deleting the Worker or the Supabase project, upgrading the plan.
- **Logs**: `npx wrangler tail teamensioning --format json` streams runtime logs (production only, not preview aliases). Workers Logs is enabled (`observability.enabled: true`) for history in the dashboard, including CPU time per request, which is the metric to watch for the 10 ms cap. Pipeline logs: `gh run list` / `gh run view <id> --log`.

## Risk Register

| Risk                                                                                       | Source                              | Likelihood | Impact | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ----------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free plan's 10 ms CPU cap → error 1102 on leaderboard/fixtures pages                       | Devil's advocate                    | M          | H      | Watch CPU time in Workers Logs after the first deploy; move to Workers Paid ($5/mo) before the first real league, or straight away if p99 CPU > 5 ms                   |
| Preview deploy writes to production Supabase                                               | Devil's advocate / Pre-mortem       | M          | H      | Separate Supabase project for previews; separate Cloudflare environment with its own secrets; never put production keys in a preview environment                       |
| Rollback leaves code out of sync with the DB schema                                        | Devil's advocate / Pre-mortem       | M          | H      | Migrations that work with both old and new code; never rely on `wrangler rollback` alone after a migration                                                             |
| Agent follows out-of-date tutorials (`Astro.locals.runtime`, Pages deploy, `wrangler dev`) | Unknown unknowns / Pre-mortem       | H          | M      | Add a rule to `context/foundation/lessons.md`: env via `astro:env/server` or `cloudflare:workers`; deploy with `wrangler deploy` (Workers), never Pages                |
| Missing production secrets go unnoticed because env fields are `optional: true`            | Unknown unknowns                    | M          | M      | Run `npm run smoke` against the production URL after the first deploy; consider making the env fields required in production                                           |
| Supabase latency per request, and the 50-subrequest Free limit                             | Devil's advocate                    | L          | M      | Put the Supabase project in an EU region (e.g. Frankfurt); keep subrequests per page small; consider Smart Placement (**beta**) only if latency is measured to be high |
| Auto-created `SESSION` KV namespace (eventual consistency, write limits)                   | Devil's advocate / Research finding | L          | L      | Don't use `Astro.session` for state where staleness matters; leaderboard data comes from Supabase                                                                      |
| `preview_urls`/preview aliases unavailable once Durable Objects are added                  | Research finding                    | L          | L      | Not in MVP scope; revisit if realtime is added                                                                                                                         |
| Minified stack traces slow down production debugging                                       | Unknown unknowns                    | M          | L      | Upload source maps, or temporarily set `vite.build.minify=false`                                                                                                       |
| Over-broad API token in CI                                                                 | Research finding                    | L          | H      | Token limited to Workers Scripts: Edit for one account, no DNS or billing; stored only in GitHub Secrets                                                               |

## Getting Started

All commands use the versions pinned in the repo: `wrangler ^4.131`, `@astrojs/cloudflare ^14.3`, Astro 7. Local dev stays `npm run dev`; it already runs on the workerd runtime, so `wrangler dev` is not needed.

1. **Authenticate:** `npx wrangler login` locally (the repo's wrangler is used, so no global install is needed). Check with `npx wrangler whoami`.
2. **Set production secrets** (values from the production Supabase project, which should be in an EU region): `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. Wrangler prompts for each value, so nothing ends up in shell history.
3. **First deploy:** `npm run build && npx wrangler deploy`. Wrangler prints the `https://teamensioning.<subdomain>.workers.dev` URL. Then verify with `BASE_URL=<that-url> npm run smoke`. Add the production URL to Supabase Auth → URL Configuration (Site URL and redirect URLs) so sign-up and confirmation emails work.
4. **Wire CI auto-deploy:** add a `deploy` job to `.github/workflows/ci.yml` that runs on push to `master` after `ci` and `smoke` pass. It runs `npm ci && npm run build && npx wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from GitHub Secrets. The workflow currently has no deploy step.
5. **Previews (optional for the MVP):** set `"preview_urls": true` in `wrangler.jsonc`, add a Cloudflare environment that points at a separate Supabase project, and run `npx wrangler versions upload --preview-alias pr-<number>` on PRs.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (step 4 above only names the deploy job; the pipeline itself is configured in the deploy plan)
- Production-scale architecture (multi-region, HA, DR)
