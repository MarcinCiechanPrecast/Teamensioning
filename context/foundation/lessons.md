# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Nie dodawaj lodash bez jawnego powodu

- **Context**: Implementacja funkcji w aplikacji TypeScript po stronie frontendu i backendu.
- **Problem**: Agent użył `_.filter()`, mimo że lodash nie jest częścią projektu. To dodałoby niepotrzebną zależność i rozjechało lokalną konwencję pracy z natywnymi API.
- **Rule**: Nie dodawaj lodash bez jasnego wskazania. Projekt preferuje natywne funkcje JS/TS w standardzie 2026+.
- **Applies to**: plan, implement, impl-review

## Use current Cloudflare Workers APIs, not outdated Astro/Pages tutorials

- **Context**: Any code or plan that reads environment variables/secrets, or runs dev/deploy commands, in this Astro 7 + `@astrojs/cloudflare` v14 app on Cloudflare Workers (`src/lib/`, `src/middleware.ts`, `astro.config.mjs`, `wrangler.jsonc`, `.github/workflows/ci.yml`).
- **Problem**: Many tutorials predate adapter v13 and Pages→Workers. Following them breaks at runtime (`Astro.locals.runtime.env` no longer exists), deploys to the wrong product (Pages commands don't apply to this Worker), or adds a redundant `wrangler dev` loop — the infrastructure.md pre-mortem estimates a lost day.
- **Rule**: Read env via `astro:env/server` or `cloudflare:workers` (never `Astro.locals.runtime`); deploy with `npx wrangler deploy` (Workers), never Pages commands; don't use `wrangler dev` — `astro dev` already runs on workerd.
- **Applies to**: research, plan, implement, impl-review
