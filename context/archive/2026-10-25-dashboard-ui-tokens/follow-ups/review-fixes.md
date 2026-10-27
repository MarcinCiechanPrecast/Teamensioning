# Review follow-ups: dashboard-ui-tokens

Queued from `reviews/impl-review.md` (F5 audit). Not part of this change's scope.

- **League view contrast**: `src/pages/leagues/[id].astro:81` uses `text-blue-100/50` for "N matches", measured 4.31:1 (AA needs 4.5:1) on the Jamaica dark card. Replace with `text-muted-foreground` when `/leagues/[id]` is migrated to tokens, and add that view to the `check:ui` guard at the same time.
