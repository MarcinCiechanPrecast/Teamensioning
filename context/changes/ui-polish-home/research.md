# Research — ui-polish-home

## Question

Which repeatable UI practices from comparable "create league/cup → share link → enter scores" products should Teamensioning adopt for (a) the start page and (b) score entry?

## Comparable products (checked 2026-11-16 in the browser pane: DOM/CSS inspection + screenshots)

| Practice        | Tournify                      | LeagueLobster      | Challonge     | Kicktipp                  | start.gg          |
| --------------- | ----------------------------- | ------------------ | ------------- | ------------------------- | ----------------- |
| Hero CTAs       | 2 (1 primary)                 | 2 primary          | 3+            | 1                         | 1                 |
| Hero visual     | photo/mockups                 | live product card  | text + video  | static illustration       | minimal           |
| Entrance motion | fade-up 10px, 0.5s            | none               | some fades    | none                      | n/a               |
| Reduced motion  | yes (`motion-reduce`)         | yes                | not found     | n/a                       | n/a               |
| Score input     | "Score" action via role links | 2 text inputs, ":" | modal (login) | 2 boxes, ":" (unverified) | quick W/L + score |
| Native spinners | n/a                           | none               | n/a           | none                      | n/a               |
| Separator       | stacked                       | ":"                | stacked       | ":"                       | "-"               |

Score entry sits behind a login at every product; input findings come from LeagueLobster's public demo markup and help docs.

Sources: tournifyapp.com, tournifyapp.com/live/ptwss6/schedule, help.tournifyapp.com/en/articles/9144326-enter-scores, scheduler.leaguelobster.com, challonge.com, challonge.com/9vxf8xce, kicktipp.com, heise.de/-6112507, start.gg, help.start.gg/en/articles/13766247-reporting-match-results.

## Repeatable practices (ranked) and what we take

1. **One primary CTA in the hero, at most one quiet secondary.** → Taken: primary + ghost.
2. **Hero visual = a real fixture card** built like the product's rows (LeagueLobster). → Taken: decorative "Round 1" card, `name : score : name` grid.
3. **Small motion, off under reduced motion**: fade-up 400–700ms, staggered 60–80ms+, no marquees. → Taken: `tw-animate-css` `animate-in fade-in slide-in-from-bottom-4` behind `motion-safe:`, plus a `draw` keyframe on `DimensionLine`.
4. **":" as the score separator**, score centred. → Taken in all three score forms and the demo card.
5. **No native spinners**; centred `tabular-nums`, ≥40px targets. → Taken: `ScoreInput.astro` with token −/+ steppers, `no-spinner` utility, 40px height.
6. **Keep the pair together**: home : away never wraps apart. → Taken: pair wrapped in a `shrink-0` flex unit.
7. Swap input/result in one slot, sticky round headers, skip link → **not now** (separate change; touches row structure and E2E selectors).

## Codebase findings

- Score inputs duplicated in 3 places with local class strings: `src/components/cup/Bracket.astro`, `src/components/leagues/OrganizerFixtureList.astro`, `src/pages/t/[token].astro`.
- E2E selects score fields with `getByLabel("Score of X", { exact: true })` (`tests/e2e/cup-flow.spec.ts:31`) → steppers must not carry that name; they are `aria-hidden` + `tabindex=-1` (keyboard users step with arrow keys natively).
- Smoke asserts `<h1>Teamensioning</h1>` and "From sketch to standings" on `/` (`scripts/smoke.mjs:103`) → both kept.
- `tw-animate-css` (already imported in `global.css`) provides `delay-*` and `fill-mode-*`; no new dependency.
- `check:ui` forbids arbitrary values in views → spinner hiding and the draw keyframe live as `@utility` in `global.css`.
