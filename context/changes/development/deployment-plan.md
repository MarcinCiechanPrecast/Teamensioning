# First deployment of Teamensioning to Cloudflare Workers

## Context

`context/foundation/infrastructure.md` (2026-10-10) selected **Cloudflare Workers (Workers + static assets, not Pages)**. The repo is already set up for Workers: `wrangler.jsonc` (main `@astrojs/cloudflare/entrypoints/server`, `ASSETS` binding, `nodejs_compat`, `observability.enabled`), and secrets are read through `astro:env/server` in `src/lib/supabase.ts`. Still missing at planning time: a production Supabase project, a wrangler login (since done — see _Prerequisites → Status_), Worker secrets, a `deploy` job in CI, and this deployment plan as an artifact.

Agreed scope: first manual deploy + CI auto-deploy job on merge to `master`. Previews (separate environment + separate Supabase project) are out of scope for this iteration.

Legend: 🧑 = manual gate (you), 🤖 = performed by the agent.

## Prerequisites

### Status (verified 2026-10-10)

- [x] **Node.js** — v22.19.0 (22.x, matches `.nvmrc` major; `.nvmrc` pins 22.14.0)
- [x] **Wrangler CLI** — repo-pinned 4.149.0 via `npx wrangler --version`
- [x] **Cloudflare account + wrangler login** — `npx wrangler whoami`: OAuth login, the owner's personal Cloudflare account (single account, so no `CLOUDFLARE_ACCOUNT_ID` pin needed locally). No `teamensioning` Worker exists yet (expected before step 4).
- [x] **GitHub repo** — `MarcinCiechanPrecast/Teamensioning`, default branch `master`, viewer permission `ADMIN` (can manage secrets); `gh` logged in. No repository secrets set yet (`gh secret list` is empty — `CLOUDFLARE_*` are added in step 7).
- [x] **Supabase CLI installed** — repo-pinned 2.117.0
- [x] **Supabase CLI login** — `npx supabase projects list` succeeds
- [x] **Supabase cloud project** — ref `eortunvxkvspuuousnff` (URL `https://eortunvxkvspuuousnff.supabase.co`), name "MarcinCiechanPrecast's Project", region **`eu-west-1` (Ireland)**, Postgres 17, status `ACTIVE_HEALTHY`, created 2026-10-10, not linked locally. Deviations from the plan, accepted:
  - Region is `eu-west-1`, not `eu-central-1` (Frankfurt). Still EU; adds roughly 15–25 ms per Supabase round trip from Polish Workers edges vs. Frankfurt. Acceptable for the MVP — if latency is measured to be a problem, recreating the (still empty) project in Frankfurt is cheap _before_ real data exists.
  - Name is the default, not `teamensioning-prod` — cosmetic; can be renamed in Project Settings → General.
- [x] **Supabase Auth "Confirm email" = ON** — verified 2026-10-16 via read-only `npx supabase config diff --project-ref eortunvxkvspuuousnff` (remote `auth.email.enable_confirmations = true`)

### Local tooling

| Tool         | Required                                       | How                                                                               | Check                                                    |
| ------------ | ---------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Node.js      | 22.x (`.nvmrc` pins 22.14.0)                   | `nvm install` / `nvm use` (nvm-windows: `nvm install 22.14.0 && nvm use 22.14.0`) | `node -v`                                                |
| Project deps | —                                              | `npm ci`                                                                          | `npx wrangler --version` (4.x), `npx supabase --version` |
| Wrangler     | 4.x, **repo-pinned** devDependency             | no global install — always `npx wrangler …`                                       | `npx wrangler --version`                                 |
| Supabase CLI | repo-pinned devDependency                      | no global install — always `npx supabase …`                                       | `npx supabase --version`                                 |
| GitHub CLI   | any recent                                     | `winget install GitHub.cli`, then `gh auth login`                                 | `gh auth status`                                         |
| Docker       | only for local Supabase (`npx supabase start`) | Docker Desktop                                                                    | `docker --version`                                       |

Using the repo-pinned `wrangler`/`supabase` keeps local commands identical to CI (which runs `npm ci` then `npx`).

### Accounts

| Account                 | Needed for                                                                   | Create                                                                                                                                                                                                  | Plan                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare**          | Hosting the Worker, `wrangler` login, CI API token                           | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)                                                                                                                                      | Free to start; Workers Paid ($5/mo) is a later, human-only decision                                                                                       |
| **Supabase**            | Production Postgres + Auth, `supabase` CLI login                             | [supabase.com/dashboard/sign-up](https://supabase.com/dashboard/sign-up) — an organization is created during onboarding (or later via [supabase.com/dashboard/new](https://supabase.com/dashboard/new)) | Free (2 active projects; inactive Free projects pause after 7 days without traffic)                                                                       |
| **GitHub**              | Repo, Actions CI, repository secrets                                         | [github.com/signup](https://github.com/signup) — already in place (`MarcinCiechanPrecast`)                                                                                                              | Free                                                                                                                                                      |
| **Docker** _(optional)_ | Only local Supabase (`npx supabase start`); not needed for the deploy itself | Docker Desktop installs without an account; Docker account at [app.docker.com/signup](https://app.docker.com/signup) only if your org requires sign-in                                                  | Docker Desktop is free for personal use / small businesses; companies with >250 employees or >$10M revenue need a paid subscription — check with your org |

Pages you will use once the accounts exist:

- Cloudflare API tokens (step 7): [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
- Cloudflare Workers overview (logs, CPU time): [dash.cloudflare.com → Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
- Supabase new project: [supabase.com/dashboard/new](https://supabase.com/dashboard/new)
- GitHub repository secrets: [Teamensioning → Settings → Secrets → Actions](https://github.com/MarcinCiechanPrecast/Teamensioning/settings/secrets/actions)

Repository access: your GitHub account needs admin (or "manage secrets") permission on `MarcinCiechanPrecast/Teamensioning` to set `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.

### Configure the Cloudflare CLI (wrangler)

1. 🧑 `npx wrangler login` — opens a browser for OAuth; the token is stored in your user profile, not in the repo.
2. 🤖 `npx wrangler whoami` — confirms the login and prints the **Account ID** (needed for CI in step 7).
3. If you belong to several Cloudflare accounts, pin the right one by setting `CLOUDFLARE_ACCOUNT_ID` in your shell (not in `wrangler.jsonc`, to keep the repo account-agnostic).
4. CI does **not** use `wrangler login`; it authenticates with a scoped API token (`CLOUDFLARE_API_TOKEN`) — see step 7.

### Configure the Supabase CLI and the production project

1. 🧑 `npx supabase login` — opens a browser and stores a personal access token locally.
2. Create the production project — **either**:
   - Dashboard: supabase.com → New project → name `teamensioning-prod`, region **Central EU (Frankfurt)**, generate a strong DB password and keep it in your password manager; **or**
   - CLI: `npx supabase orgs list` (get the org ID), then
     `npx supabase projects create teamensioning-prod --org-id <org-id> --region eu-central-1`
     (omit `--db-password` so it isn't saved in shell history; the CLI prompts for it).
3. 🤖 `npx supabase projects list` — note the **project ref** (`<ref>`); the project URL is `https://<ref>.supabase.co`.
4. Optional: `npx supabase link --project-ref <ref>` — links the local repo to the remote project for future `db push` of migrations (none exist yet). Linking is local-only state in `supabase/.temp/`.
5. API key: dashboard → Project Settings → API Keys → copy the **anon / publishable** key. This becomes `SUPABASE_KEY`. Avoid `npx supabase projects api-keys`, which prints the `service_role` key to the terminal too.
6. 🧑 Auth settings in the dashboard (Authentication → Sign In / Providers → Email):
   - keep **Confirm email = ON** in production (local `supabase/config.toml` has it off for dev/CI only);
   - Site URL / Redirect URLs are set in step 5, once the Worker URL is known.
7. ⚠️ Do **not** run `npx supabase config push` against production: `supabase/config.toml` is the _local_ config (`site_url = http://127.0.0.1:3000`, `enable_confirmations = false`) and would overwrite the production auth settings.

### Local dev env (optional, for parity checks)

- `.dev.vars` (gitignored) holds local `SUPABASE_URL`/`SUPABASE_KEY` for `npm run dev`; values come from `npx supabase start` → `npx supabase status -o env` (`API_URL`, `ANON_KEY`). Never put production values there.

## Steps

### 0. ✅ Save the plan as an artifact _(done)_

Save this plan to `context/changes/development/deployment-plan.md` (audit trail of "what was supposed to happen"); fill in the "Result" section at the end (URL, version ID, date).

### 1. ✅ Production Supabase project _(done — verified 2026-10-10)_

Follow _Prerequisites → Configure the Supabase CLI and the production project_. Outcome: project `eortunvxkvspuuousnff` in `eu-west-1` (see _Status_ for the region deviation); for step 3 you need its URL `https://eortunvxkvspuuousnff.supabase.co` and the anon/publishable key from the dashboard. Note: there is no `supabase/migrations/` — nothing to migrate; the `auth.*` tables exist by default.

### 2. ✅ Cloudflare login _(done — verified 2026-10-10)_

Follow _Prerequisites → Configure the Cloudflare CLI_. Outcome: `npx wrangler whoami` shows the account and its Account ID.

### 3. ✅ Production Worker secrets _(done — verified 2026-10-16)_

`npx wrangler secret list --name teamensioning` → `SUPABASE_KEY`, `SUPABASE_URL` (both `secret_text`). `secret put` created the Worker on 2026-10-11 with a placeholder `Upload` version followed by two `Secret Change` versions — no application code is deployed yet.

Prompted, values never land in shell history or the conversation:

```
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

If the Worker doesn't exist yet, wrangler offers to create it — confirm. 🤖 Verification: `npx wrangler secret list` (shows names only).

### 4. ✅ First deploy (Workers command, NOT Pages) _(done 2026-10-16)_

Attempt 2: user ran `npx wrangler deploy` interactively, registered workers.dev subdomain `marcin-ciechan`, published to `https://teamensioning.marcin-ciechan.workers.dev` (version `4f25a208-7b23-45f4-935c-92c46e12d990`, 100%).

```
npm run build
npx wrangler deploy
```

- Expected: URL `https://teamensioning.<subdomain>.workers.dev` and a version ID. The adapter may auto-create a `SESSION` KV namespace — expected (risk register, L/L).
- Build check (2026-10-11): `npm run build` passes. `astro build` redirects wrangler to the generated `dist/server/wrangler.json` (via `.wrangler/deploy/config.json`), which adds two bindings not present in `wrangler.jsonc`: `SESSION` (KV, no ID → auto-provisioned on first deploy) and `IMAGES` (Cloudflare Images binding, enabled by the adapter by default). Non-blocking warning: `@astrojs/sitemap` is skipped because `site` is not set in `astro.config.mjs` — set it to the Worker URL once known.
- If the account has no workers.dev subdomain yet, wrangler asks to register one → 🧑.
- **Attempt 1 (2026-10-16): partially done.** Build OK, 8 assets uploaded, Worker uploaded (startup 22 ms). `SESSION` was auto-provisioned as KV namespace `teamensioning-session` (`076b524e2f714076ae4157d91b3aaf3e`). Bindings: `SESSION`, `IMAGES`, `ASSETS`. **Not published:** the account has no workers.dev subdomain, and in a non-interactive shell wrangler defaulted to "no". 🧑 Register a subdomain at `https://dash.cloudflare.com/<account-id>/workers/onboarding`, then 🤖 re-run `npx wrangler deploy`.

### 5. ✅ Supabase Auth → URL Configuration _(done — verified 2026-10-16)_

Verified with read-only `npx supabase config diff --project-ref eortunvxkvspuuousnff`: remote `auth.site_url = https://teamensioning.marcin-ciechan.workers.dev`, `auth.additional_redirect_urls = [https://teamensioning.marcin-ciechan.workers.dev/**]`. The same diff confirms why `config push` must never be used here: it would revert both to `127.0.0.1:3000` and turn email confirmation off.

Site URL = the Worker URL; Redirect URLs += `https://teamensioning.<subdomain>.workers.dev/**`.

### 6. 🤖 Production verification _(automated part done 2026-10-16; manual sign-up pending step 5)_

Results: `/` 200 (0.30 s), `/dashboard` 302 → `/auth/signin`, `/auth/signin` 200, `/auth/signup` 200, `/favicon.png` 200, `/does-not-exist` 404. Non-mutating Supabase check: `POST /api/auth/signin` with a non-existent account → 302 `/auth/signin?error=Invalid login credentials` — Supabase's own error, which proves both Worker secrets are set and the project is reachable.

- Non-mutating: `curl -sI <URL>/` → 200; `curl -sI <URL>/dashboard` → 302 `Location: /auth/signin`.
- Do **not** run the full `npm run smoke` against production: it creates `smoke-*@example.com` accounts, and production Supabase requires email confirmation by default (signin would fail, and bounced mail to example.com hurts the project's sending reputation).
- 🧑 Manually: sign up with your own email → confirm → sign in → `/dashboard` returns 200. This also proves the secrets are set (the env fields are `optional: true`, so a missing secret only surfaces at runtime).
- 🤖 `npx wrangler tail teamensioning --format json` during the manual test → check for errors; note CPU time in Workers Logs (risk register threshold: p99 > 5 ms → Workers Paid).

### 7. `deploy` job in CI — `.github/workflows/ci.yml` _(configured 2026-10-16; first CI run pending)_

GitHub secrets set by the user: `CLOUDFLARE_API_TOKEN` (2026-10-16T10:20:32Z), `CLOUDFLARE_ACCOUNT_ID` (2026-10-16T10:21:53Z) — names verified with `gh secret list`; values are write-only and get validated by the first CI deploy. Condition implemented: `if: github.event_name == 'push' && github.ref == 'refs/heads/master'`.

🧑 First:

- Cloudflare → API Tokens → Custom token: _Account → Workers Scripts: Edit_ + _Workers KV Storage: Edit_ (for the `SESSION` binding), this account only, no DNS/billing. Because the build also emits an `IMAGES` binding, confirm on the first CI run that the token is sufficient; if `wrangler deploy` fails with an authorization error on Images, add the narrowest Images permission rather than widening the token.
- GitHub secrets (prompted, no values in history): `gh secret set CLOUDFLARE_API_TOKEN`, `gh secret set CLOUDFLARE_ACCOUNT_ID`.

🤖 Add the job (on branch `ci/deploy-job`, PR to `master`):

```yaml
  deploy:
    needs: [ci, smoke]
    if: <condition: push to master only>   # TODO(human) — written by you
    runs-on: ubuntu-latest
    concurrency: { group: production-deploy, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

The `if` condition (without it, PRs would deploy to production) is left to you as a TODO(human) under Learning mode.

Verification: on a PR → the `deploy` job is _skipped_; after merge → `gh run list` / `gh run view <id> --log` shows a successful `wrangler deploy`; `npx wrangler deployments list` shows the new version.

**Finding (2026-10-16, Unknown unknowns):** PR #5 showed an extra failing check, `Workers Builds: teamensioning` (Cloudflare's Git integration, app `cloudflare-workers-and-pages`). The repo had been connected to the Worker in the Cloudflare dashboard during onboarding, creating a **second, ungated production deploy path** that would race the GitHub Actions `deploy` job and skip `ci`/`smoke`. The user disconnected it in the dashboard, but the next push (`d20c344`) still produced a Workers Builds check that again failed instantly (0 s, nothing deployed). _(Superseded — see "Step 7 revised" below: Workers Builds became the single deploy path instead.)_ Rule: after any dashboard setup, check for platform-side Git integrations, and keep exactly one deploy path.

**Step 7 revised (2026-10-16): auto-deploy via Cloudflare Workers Builds, not GitHub Actions.** At the user's request, the GitHub Actions `deploy` job was removed (`ci.yml` back to `ci` + `smoke` only) so Workers Builds is the single deploy path. Trade-off accepted: Workers Builds deploys on merge without waiting for `ci`/`smoke` — mitigate with branch protection on `master` (require PR + passing `ci` and `smoke` before merge). 🧑 Dashboard settings (Workers & Pages → `teamensioning` → Settings → Build → Connect):

- Git repository: `MarcinCiechanPrecast/Teamensioning`; production branch: `master`
- Build command: `npm run build`; deploy command: `npx wrangler deploy`; root directory: `/`
- Non-production branch builds: **off** (preview versions would use the production Supabase secrets — risk register)
- Node version: Workers Builds reads `.nvmrc` automatically — no `NODE_VERSION` build variable needed (remove it if set). `.nvmrc` bumped 22.14.0 → **22.23.3** on 2026-10-16: the first Workers Build warned `EBADENGINE` (`undici@8` needs `>=22.19.0`, `eslint-plugin-astro`/`astro-eslint-parser` need `^22.22.3`).
- First Workers Build on PR #5 (2026-10-16) failed: non-production builds were on and ran `npx wrangler preview` (**beta**), which cannot auto-provision KV → `binding SESSION of type kv_namespace must have a namespace_id specified [code: 10021]`. Fix: pin `SESSION` to `076b524e2f714076ae4157d91b3aaf3e` in `wrangler.jsonc` (verified: the adapter keeps the ID in `dist/server/wrangler.json`; `wrangler deploy --dry-run` binds it), and turn non-production builds off.
- Worker name in `wrangler.jsonc` (`teamensioning`) must match the connected Worker, or the build fails.
- Runtime secrets stay as set in step 3 (Workers Builds does not touch them); `SUPABASE_*` are not needed at build time.
- The GitHub secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are now unused; Workers Builds creates its own build token. Remove them (and revoke the scoped token) when convenient.

PR #5 checks on the first commit: `ci` pass, `smoke` pass, `deploy` skipped (the push-to-master condition works on PRs).

### 8. ✅ Lesson from the risk register _(done 2026-10-16 — appended to `context/foundation/lessons.md` as "Use current Cloudflare Workers APIs, not outdated Astro/Pages tutorials")_

`/10x-lesson`: "read env via `astro:env/server` or `cloudflare:workers` (never `Astro.locals.runtime`); deploy with `wrangler deploy` (Workers), never Pages; `wrangler dev` is redundant" → `context/foundation/lessons.md`.

### 9. 🤖 Commit

`context/foundation/infrastructure.md`, `context/changes/development/deployment-plan.md`, `lessons.md` + the `ci.yml` change — in the PR from step 7.

## Permission boundaries (human-only)

Rotating the Supabase key, deleting the Worker/project, upgrading to the Paid plan, production migrations — manual only. The agent may: deploy, `tail`, `deployments list`, `rollback` to the previous version.

## Rollback

`npx wrangler deployments list` → `npx wrangler rollback [<version-id>]` (code only, not the database).

## Files

- `.github/workflows/ci.yml` — new `deploy` job
- `context/changes/development/deployment-plan.md` — new
- `context/foundation/lessons.md` — new rule
- unchanged: `wrangler.jsonc`, `astro.config.mjs`, `src/lib/supabase.ts`

## Result

- **URL:** https://teamensioning.marcin-ciechan.workers.dev
- **Version:** `4f25a208-7b23-45f4-935c-92c46e12d990` (100% traffic)
- **Deployed:** 2026-10-16T07:49:03Z, manually by the repo owner (`wrangler deploy`, interactive)
- **workers.dev subdomain:** `marcin-ciechan` (account-wide)
- **Provisioned resources:** KV namespace `teamensioning-session` (`076b524e2f714076ae4157d91b3aaf3e`); bindings `SESSION`, `IMAGES`, `ASSETS`
- **Supabase:** `eortunvxkvspuuousnff` (`eu-west-1`)
- **Manual sign-up test:** passed 2026-10-16 (user confirmed sign-up → email confirmation → sign-in → `/dashboard`).
- **Open:** step 9 (commit/PR) and the first CI deploy run after merge; optionally set `site` in `astro.config.mjs` to the URL above to enable the sitemap.
