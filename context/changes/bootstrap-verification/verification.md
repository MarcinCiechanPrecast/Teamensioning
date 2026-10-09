---
bootstrapped_at: 2026-10-09T11:22:45Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: teamensioning
language_family: js
package_manager: npm
cwd_strategy: manual
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

# Bootstrap verification — teamensioning

## Hand-off

Copied from `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: teamensioning
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

> Teamensioning is a small web app for running office leagues, with a 3-week MVP and a hard deadline of 2026-11-04. The recommended default for a JavaScript/TypeScript web app is 10x-astro-starter, which clears all four agent-friendly gates and is the template the repository was already created from, so the standard path was taken. The only technology-forcing feature in the PRD is organizer sign-in (FR-001), which the starter ships out of the box; players reach tournaments through an unlisted link without accounts, and there are no payments, realtime, AI or background jobs in scope. That leaves the timeline for the domain logic: round-robin fixtures, standings with tiebreakers and link-based score entry. CI runs on GitHub Actions with auto-deploy on merge, and the project deploys to Cloudflare Workers, matching the starter repository's own Wrangler configuration. Scaffolding confidence is first-class; the repository already exists, created from the starter as a GitHub template.

## Pre-scaffold verification

| Signal      | Value                                                       | Severity | Notes                                                       |
| ----------- | ----------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| npm package | not run                                                     | —        | `cmd_template` starts with `git clone`; no npm CLI to check |
| GitHub repo | `przeprogramowani/10x-astro-starter` last pushed 2026-09-12 | fresh    | from card `docs_url`; 27 days before this run               |
| Local Node  | v22.19.0 (`.nvmrc` pins 22.14.0)                            | —        | same major version; informational only                      |

## Scaffold log

**Resolved invocation**: none — scaffold step skipped at the user's request
**Strategy**: manual
**Exit code**: n/a
**Reason**: the repository was already created from `przeprogramowani/10x-astro-starter` via GitHub "Use this template" (initial commit `de68b6f`). Running the card's `git clone` template would have produced ~50 `.scaffold` siblings identical to existing files. The user's own files are the scaffold.
**Files moved**: 0
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: unchanged (no scaffold to merge)
**.bootstrap-scaffold cleanup**: not created
**Dependency install**: `npm install` run in the project root, exit 0; `package-lock.json` unchanged

## Post-scaffold audit

**Tool**: `npm audit --json` (exit 1 — vulnerabilities present; informational)
**Summary**: 0 CRITICAL, 9 HIGH, 2 MODERATE, 0 LOW
**Direct vs transitive**: 0/1/0/0 direct of total 0/9/2/0 — the only direct finding is `wrangler` (dev tooling); all others are transitive. Dependency tree: 804 packages (377 prod, 269 dev, 167 optional). Every finding reports a non-breaking fix available (`npm audit fix`).

#### CRITICAL findings

None.

#### HIGH findings

- **wrangler** (direct) — affected range `4.16.0 - 4.148.0`; vulnerable via `miniflare`. Fix available.
- **miniflare** (transitive, via wrangler / @cloudflare/vite-plugin) — vulnerable via `sharp` and `undici`. Fix available.
- **@cloudflare/vite-plugin** (transitive) — vulnerable via `miniflare` and `wrangler`. Fix available.
- **sharp** — `<0.35.5`; librsvg dependency CVE-2026-96889 (GHSA-wq5f-xc86-pv6w). Fix available.
- **undici** — `7.0.0 - 7.29.0`; DoS via unhandled error in WebSocket permessage-deflate decompression (GHSA-3wwx-pv8p-q78v). Fix available.
- **devalue** — `<=5.9.2`; `stringify`/`uneval` shared-memory serialization and sparse-array CPU amplification (GHSA-j22f-vq7h-c4qm). Fix available.
- **brace-expansion** — `<=1.1.20 || 4.0.0 - 5.0.11`; quadratic-time expansion CPU DoS (GHSA-q2hr-2g5m-vwhr). Fix available.
- **http-cache-semantics** — `<=4.2.0`; max-stale handling can disclose cross-user cached responses (GHSA-ch52-4w7c-c8xp). Fix available.
- **source-map-js** — `1.0.0 - 1.2.1`; event-loop DoS through indexed source-map section offsets (GHSA-68fv-2mgg-jv7q). Fix available.

#### MODERATE findings

- **fast-uri** — `3.0.0 - 3.1.7`; inconsistent host case normalization via percent-encoded octets (GHSA-hrr3-gc8f-f4qj). Fix available.
- **smol-toml** — `<=1.8.0`; quadratic-time `parse()` (GHSA-r4xh-jqrq-34v2). Fix available.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-workers   |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- Git history already exists (repository created from the template); no `git init` needed.
- No `.scaffold` siblings were created, so there is nothing to reconcile.
- Address audit findings per your project's risk tolerance — every finding has a non-breaking fix via `npm audit fix`; the full breakdown is above.
- Husky pre-commit hooks are not active yet (`package.json` has no `prepare` script); run `npx husky` once to enable lint-staged on commit.
