---
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
---

## Why this stack

Teamensioning is a small web app for running office leagues, with a 3-week MVP and a hard deadline of 2026-11-04. The recommended default for a JavaScript/TypeScript web app is 10x-astro-starter, which clears all four agent-friendly gates and is the template the repository was already created from, so the standard path was taken. The only technology-forcing feature in the PRD is organizer sign-in (FR-001), which the starter ships out of the box; players reach tournaments through an unlisted link without accounts, and there are no payments, realtime, AI or background jobs in scope. That leaves the timeline for the domain logic: round-robin fixtures, standings with tiebreakers and link-based score entry. CI runs on GitHub Actions with auto-deploy on merge, and the project deploys to Cloudflare Workers, matching the starter repository's own Wrangler configuration. Scaffolding confidence is first-class; the repository already exists, created from the starter as a GitHub template.
