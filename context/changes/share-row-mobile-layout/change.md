---
change_id: share-row-mobile-layout
title: Fix score inputs overlapping player names on the share page at 375px
status: implemented
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Small fix, no plan. Follow-up 1 of `context/changes/ui-push-readiness/research.md`.

**Problem:** on `/t/[token]` at 375px the score inputs covered the player names in 11 of 15 fixture rows (worst 64px). The name `<span class="min-w-0 flex-1">` sits in a `flex flex-wrap` form; its flex basis of 0 means it never wraps to its own line, so it shrinks into the sliver beside the inputs and long words spill over them. It was identical with the old system font, so it predates the Jamaica theme.

**Fix (one line, `src/pages/t/[token].astro:101`):** `min-w-0 flex-1` becomes `min-w-0 basis-full break-words sm:flex-1`. Below 640px the match name takes its own line and long names wrap inside it; from 640px the original one-line layout is unchanged.

**Verified** on the production build with a local Supabase and throwaway accounts (removed):

- 375px, 15 normal rows: overlapping text boxes 11 → 0, no row or page overflow.
- 375px, 40-character unbroken player names: 0 overlaps, no row overflow, no horizontal page scroll (names wrap).
- 639px stacked, 640px one line, 1024px one line; no overlap at any width.
- `npm run lint`, `npm test` (159), `npx astro check`, `npm run check:ui`, `npm run build`, `npm run smoke` all pass.

**Not changed:** the 4.31:1 `text-blue-100/50` lines and unbroken long league names in headings (separate follow-ups in the research). The Save button measured 34px tall, so the static audit's "about 28px" estimate did not hold.
