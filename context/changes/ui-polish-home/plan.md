# Simpler animated start page and token score steppers — Implementation Plan

## Overview

Apply the practices from `research.md`: a shorter `/` with one primary CTA, a demo fixture card and reduced-motion-safe entrance animation, and one shared `ScoreInput` that replaces the native spinner arrows on every score form.

## Desired End State

- `/`: hero (eyebrow, H1, drawing dimension line, one-line lead, primary + ghost CTA, demo "Round 1" card), three step cards, one closing CTA. "What's in the name" and "Tolerances" sections removed. All motion behind `motion-safe:`.
- Score forms (share page, organizer corrections, cup bracket) use `ScoreInput.astro`: `− [n] +` segmented control on input tokens, no native spinners, ":" separator, pair never wraps apart, Save the same 40px height.
- Unit, lint, `check:ui`, `astro check`, E2E green; screenshots in `screens/`.

## What We're NOT Doing

- No change to submission logic, validation (still `min 0 / max 99 / required`), endpoints or E2E selectors.
- No new tokens or dependencies; no restructure of fixture rows into a 3-column result grid (follow-up).

## Phase 1: Shared score stepper

- `src/components/ScoreInput.astro` (new) + `no-spinner` utility in `src/styles/global.css`.
- Swap the 6 inputs in `Bracket.astro`, `OrganizerFixtureList.astro`, `t/[token].astro`; remove the dead local input classes; Save buttons to `size: "lg"` (40px) to align.

### Success Criteria

- Automated: `npm test`, `npm run lint`, `npm run check:ui`, `npx astro check`, `npm run test:e2e`.
- Manual: first "+" on empty → 1, "−" on empty → 0, clamps at 99; pair fits on a 375px screen.

## Phase 2: Simple animated start page

- Rewrite `src/components/home/HomeView.astro`; add `animate-draw` utility + `draw` keyframes in `global.css`.

### Success Criteria

- Automated: smoke home assertion still holds (H1 + "From sketch to standings"); lint/check:ui/astro check.
- Manual: computed `animation-name` is `enter` with staggered delays; `draw` on the dimension line; screenshot saved.

## Progress

### Phase 1: Shared score stepper

#### Automated

- [x] 1.1 Unit suite (466 tests), lint, check:ui, astro check pass
- [x] 1.2 E2E league + cup flows pass (3/3)

#### Manual

- [x] 1.3 Stepper behaviour verified in browser (1 / 0 / clamp 99); 375px fit — `screens/share-score-steppers-mobile.jpg`

### Phase 2: Simple animated start page

#### Automated

- [x] 2.1 Lint, check:ui, astro check pass

#### Manual

- [x] 2.2 Animations resolve (`enter` 0.7s, staggered delays; `draw` 0.3s) — `screens/home-anonymous-desktop.jpg`
