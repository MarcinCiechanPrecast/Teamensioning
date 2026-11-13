# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm test` — Vitest unit tests (no DB)
- `npm run test:integration` — DB-level suite (`src/**/*.integration.test.ts`) against local Supabase; run `npx supabase start` first. Refuses any non-local `SUPABASE_URL`. Patterns: `context/foundation/test-plan.md` §6.2–6.3
- `npm run test:e2e` — Playwright US-01 browser run (`tests/e2e/`). Builds and previews the app on port 4400 (`E2E_PORT` overrides) against local Supabase (`.env` + `.dev.vars`); signs up a fresh organizer each run and refuses a non-local `SUPABASE_URL`. Patterns: `context/foundation/test-plan.md` §6.5
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). Run after dependency upgrades; CI runs it against the production preview with a local Supabase.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`. Pre-push (`.husky/pre-push`): `npm test` + `npx astro check` (~30 s); a red run blocks the push.

Agent hooks (Claude Code, `.claude/settings.json`): after every `Write`/`Edit`, `.claude/hooks/post-edit.mjs` lints the edited file and runs its related unit tests; at end of turn, `.claude/hooks/end-of-turn.mjs` lints every changed file, runs the unit suite and `astro check`, and sends the agent back once on failure. Both report through exit 2 + stderr. Proven by `scripts/agent-hooks.test.ts` (part of `npm test`); change a hook, re-run it. Restart the session after editing hook config.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- `POST /api/scores` (`src/pages/api/scores.ts`) — the anonymous write endpoint: share token in a hidden form field, calls the `submit_match_score` RPC as anon, outside `PROTECTED_ROUTES`.
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports. zod is not installed yet — add it when a route first needs input validation.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### UI

- **Tokens** live in `src/styles/global.css`: values in `:root`/`.dark`, published through `@theme inline` (the Jamaica provenance comment explains the palette). Change a colour there, not in a view.
- **Components** live in `src/components/ui/`. Add missing ones with `npx shadcn@latest add <name>`; do not hand-build cards, alerts or buttons in views.
- **No literal colours or arbitrary values in views**: no hex/rgb/hsl/oklch, no palette classes like `bg-purple-600`, no `-[12px]`. Use token classes (`bg-card`, `text-muted-foreground`, `ring-ring`).
- **Page shell**: every view follows `src/components/dashboard/DashboardView.astro`: a `bg-cosmic flex min-h-screen items-center justify-center p-4` wrapper, a `Card` (`max-w-sm` for auth, `max-w-lg` otherwise), and a `text-foreground` heading (no gradient text). Links are `text-primary` (`text-destructive` for delete). Focus is `focus-visible:ring-ring outline-hidden focus-visible:ring-2`.
- **Landing page exception**: `/` (`src/components/home/HomeView.astro`) is a multi-section page, not a single-card view: `bg-cosmic` wrapper, a `max-w-5xl` column of sections, `Card`s per item. It keeps tokens, `buttonVariants` and the focus pattern. The `DimensionLine` ornament is the brand motif (Team + Dimensioning); reuse it instead of new decorative SVGs.
- **Forms**: fields use `src/components/auth/FormField.tsx` (shadcn `Input` + `Label`; `htmlFor` must equal the input `id`, E2E selects by label). Native inputs in `.astro` views copy the `inputClass` pattern in `src/components/cup/Bracket.astro`. Submit with `Button`/`buttonVariants`.
- **Messages**: errors are `<Alert variant="destructive">` (`role="alert"`). Confirmations are `<Alert variant="success" role="status">` on the `--success` token. Render at most one alert and one status per page state: E2E looks them up page-wide.
- **Spacing around React islands**: use `flex flex-col gap-*`, not `space-y-*`. `<astro-island>` is `display: contents`, so the margins `space-y` adds never apply to it.
- **Guard**: `npm run check:ui` scans every `.astro`/`.tsx` view under `src/pages`, `src/components` and `src/layouts`. It skips shadcn primitives in `src/components/ui/` and `*.test.tsx`. It runs in CI (`ci` job) and in lint-staged on staged views. Proof: `scripts/check-ui-literals.test.ts`.
- **Visual gate**: the kitchen sink `src/pages/dev/dashboard-states.astro` (dev only, 404 otherwise) shows the dashboard in every applicable state. For other views, a UI change saves screenshots of each touched page under its change folder's `screens/` (example: `context/changes/ui-unify-views/screens/`).

### Environment

- Node.js v22.23.3 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: Cloudflare Workers Builds deploys `master` automatically (manual fallback: `npx wrangler deploy`). Production migrations are applied by the CI `migrate` job, not by hand.
- Production Supabase project ref: `eortunvxkvspuuousnff`. Never run `npx supabase config push` against it: `supabase/config.toml` is the local config and would reset production auth settings.

## CI

Two workflows. Both use a read-only `GITHUB_TOKEN` (`permissions: contents: read`), set `timeout-minutes` on every job and take Node from `.nvmrc`.

`@.github/workflows/pr.yml` runs on every PR to master. A new push to the same PR cancels the superseded run. Branch protection on `master` requires `ci`, `smoke` and `migration-upgrade` to pass and the branch to be up to date before merging. `e2e` is optional. These checks do not run again after the merge.

- `ci`: lint, `check:ui`, unit tests, `astro check`, build. Needs the `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- `smoke`: local Supabase, `npm run test:integration`, production preview, `npm run smoke`. This also proves the migrations apply to a fresh database.
- `migration-upgrade` (risk #7, local Supabase only): fails if a released migration was edited, renamed or deleted, or a new one sorts before the newest released one. Then starts Supabase from a worktree of the previous release (the PR merge commit's first parent, i.e. the `master` tip), seeds realistic data with `scripts/seed-db.mjs seed`, applies the new migrations with `supabase migration up --local`, runs `seed-db.mjs verify` (seeded rows unchanged, write path still works), the **previous release's** smoke test against the new schema, and this change's integration suite. A red run means the migration breaks existing data or the still-deployed Worker. The previous release's copy of `seed-db.mjs` is used when it has one, so keep that script compatible with the deployed schema.
- `e2e` (optional): Playwright US-01 run against its own local Supabase; uploads the report on failure.

`@.github/workflows/migrate.yml` runs on every push to master:

- `migrate`: `supabase db push --linked` to production, then `migration list`. Needs the `SUPABASE_ACCESS_TOKEN` (personal access token, supabase.com/dashboard/account/tokens) and `SUPABASE_DB_PASSWORD` (production database password) repository secrets. Workers Builds deploys in parallel and does not wait for it, so migrations must stay backward compatible (add columns/tables first; drop or rename only in a later PR, once no deployed code uses them). If `migrate` fails, production code may already be running against the old schema: fix it and re-run the job.
