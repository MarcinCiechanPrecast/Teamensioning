---
project: Teamensioning
version: 1
status: draft
created: 2026-10-16
updated: 2026-10-25
prd_version: 2
main_goal: speed
top_blocker: time
milestone_id: first-playable-league
milestone_seq: 1
milestone_status: open
---

# Roadmap: Teamensioning

> Derived from `context/foundation/prd.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First playable league** — Status: open

- **Intent:** An organizer can run a complete office league end to end: create it, share it, let players report scores, and trust the standings. This delivers the PRD's primary success flow.
- **Source materials:** `context/foundation/prd.md` (v2)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-013, US-01.

## Vision recap

Office league organizers track matches in spreadsheets and chat, which wastes time when building the schedule, collecting results and recalculating standings. Teamensioning lets a signed-in organizer create a league, generates every pairing automatically, and lets players enter scores through a shared link so the leaderboard stays correct without manual work.

## North star

**S-01: Organizer can create a league and immediately see its full fixture list** — the first slice to ship, because it proves the system can turn a list of players into a correct schedule (the "every pair meets exactly once" guardrail) with the fewest prerequisites, which suits the speed-to-deadline goal.

> "North star" here means the smallest end-to-end slice whose delivery proves the core of the product works; it is placed as early as its prerequisites allow because everything else builds on it.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                          | Prerequisites | PRD refs                              | Status   |
| ---- | --------------------------- | ----------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| S-01 | create-league-with-fixtures | organizer can create a league with players and see all its fixtures           | —             | US-01, FR-001, FR-002, FR-003, FR-007 | done     |
| S-02 | my-tournaments-list         | organizer can find their tournaments and delete one after confirming          | S-01          | FR-004, FR-012                        | proposed |
| S-03 | shared-league-link          | anyone with the link can view fixtures and filter a player's unplayed matches | S-01          | US-01, FR-005, FR-010                 | done     |
| S-04 | link-score-entry            | a link holder can enter a match score once                                    | S-03          | US-01, FR-009                         | proposed |
| S-05 | live-leaderboard            | a link holder can view a leaderboard that reflects every entered score        | S-04          | US-01, FR-008, FR-011                 | proposed |
| S-06 | organizer-score-correction  | organizer can correct an already-entered score                                | S-04          | US-01, FR-006                         | proposed |
| S-07 | edit-tournament-settings    | organizer can rename a tournament and change points before the first score    | S-01, S-04    | FR-013                                | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                             | Note                                                                    |
| ------ | ------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| A      | Organizer setup    | `S-01` → `S-02`                   | Shortest path to a usable league; S-02 is the organizer's way back.     |
| B      | Player result loop | `S-03` → `S-04` → `S-05` → `S-06` | Joins Stream A at `S-01`; carries the primary success flow (steps 4–6). |
| C      | Tournament admin   | `S-07`                            | Joins Stream B at `S-04` (the points lock depends on the first score).  |

## Baseline

What's already in place in the codebase as of `2026-10-16` (auto-researched + user-confirmed).
Slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR with React 19 islands, Tailwind 4, shadcn/ui (per tech-stack.md; `src/pages`, `src/components/ui`).
- **Backend / API:** partial — only auth endpoints (`src/pages/api/auth/*`); no domain routes.
- **Data:** absent — local Supabase config exists (`supabase/config.toml`), but there are no migrations or tables.
- **Auth:** present — Supabase SSR cookie sessions (`src/lib/supabase.ts`), route protection in `src/middleware.ts`, sign-in/sign-up pages.
- **Deploy / infra:** present — `wrangler.jsonc` (Workers + assets, SESSION KV), `.github/workflows/ci.yml` (lint, check, build, smoke), auto-deploy via Workers Builds.
- **Observability:** partial — Workers platform observability enabled in `wrangler.jsonc`; no app-level logging or error tracking.

## Foundations

None in this milestone. Auth and deploy are present per the Baseline. The absent data layer, the domain-logic test path and the link-based anonymous access are each introduced inside the first slice that needs them (S-01 for data and fixture tests, S-03 for link access, S-05 for standings tests). Under the speed goal, a standalone foundation would only delay the first usable slice.

## Slices

### S-01: Create a league with its fixtures

- **Outcome:** organizer can sign in, create a league with a name, win/draw/loss points (prefilled 3/1/0) and uniquely named players, and on save see the complete list of fixtures.
- **Change ID:** create-league-with-fixtures
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-007
- **Prerequisites:** — (sign-in already present per Baseline)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Minimum and maximum player count per league — Owner: user. Block: no.
- **Risk:** First slice to create tables and ownership rules from scratch; the fixture generator must be proven correct (every pair exactly once, odd counts included) by automated tests, since the guardrail depends on it.
- **Status:** done

### S-02: Find and delete my tournaments

- **Outcome:** organizer can see a list of their own tournaments, open one, and delete one after explicitly confirming.
- **Change ID:** my-tournaments-list
- **PRD refs:** FR-004, FR-012
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low; sequenced right after S-01 so the organizer is never stranded without a bookmark. Deletion is permanent, so the confirmation step must be reliable.
- **Status:** proposed

### S-03: Share the league link and browse fixtures

- **Outcome:** organizer can copy an unlisted tournament link; anyone with it, without signing in, can view the fixtures and filter them by player to see that player's unplayed matches.
- **Change ID:** shared-league-link
- **PRD refs:** US-01, FR-005, FR-010
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First anonymous access path into the app; the link must grant read access to one tournament only, and must not be guessable or listable — there is no rotation in MVP (PRD Non-Goal), so a weak link cannot be repaired later.
- **Status:** done

### S-04: Enter a match score through the link

- **Outcome:** a link holder can enter the score of an unplayed match; the first submission wins, and a later attempt shows that the score is already entered.
- **Change ID:** link-score-entry
- **PRD refs:** US-01, FR-009
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - What counts as a valid score (non-negative integers only? an upper bound?) — Owner: user. Block: no.
- **Risk:** First anonymous write; concurrent submissions for the same match must resolve to exactly one stored score, and link holders must never be able to overwrite one.
- **Status:** proposed

### S-05: See the live leaderboard

- **Outcome:** a link holder can view a leaderboard with played, won/drawn/lost, goals for/against, goal difference and points, ordered by points, then goal difference, then goals scored, reflecting every entered score on the next view.
- **Change ID:** live-leaderboard
- **PRD refs:** US-01, FR-008, FR-011
- **Prerequisites:** S-04
- **Parallel with:** S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Carries the "leaderboard always matches results" guardrail and the no-stale-standings NFR; the standings calculation needs automated tests covering ties and unplayed matches.
- **Status:** proposed

### S-06: Correct an entered score

- **Outcome:** organizer can change an already-entered match score, and the leaderboard reflects the correction on the next view.
- **Change ID:** organizer-score-correction
- **PRD refs:** US-01, FR-006
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Only the tournament's owner may overwrite a score; a correction overwrites without history (PRD Non-Goal).
- **Status:** proposed

### S-07: Edit tournament name and points

- **Outcome:** organizer can rename a tournament at any time, and change its win/draw/loss points only while no score has been entered.
- **Change ID:** edit-tournament-settings
- **PRD refs:** FR-013
- **Prerequisites:** S-01, S-04
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The points lock depends on knowing whether any score exists, so it is sequenced after S-04; small slice, safe to drop last if the deadline tightens.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Issue | Suggested issue title                             | Ready for `/10x-plan` | Notes                                       |
| ---------- | --------------------------- | ----- | ------------------------------------------------- | --------------------- | ------------------------------------------- |
| S-01       | create-league-with-fixtures | #7    | Organizer creates a league and sees all fixtures  | yes                   | Run `/10x-plan create-league-with-fixtures` |
| S-02       | my-tournaments-list         | #8    | Organizer lists and deletes their tournaments     | no                    | Waits for S-01                              |
| S-03       | shared-league-link          | #9    | Shared tournament link with player fixture filter | no                    | Waits for S-01                              |
| S-04       | link-score-entry            | #10   | Link holder enters a match score once             | no                    | Waits for S-03                              |
| S-05       | live-leaderboard            | #11   | Leaderboard with tiebreakers from entered scores  | no                    | Waits for S-04                              |
| S-06       | organizer-score-correction  | #12   | Organizer corrects an entered score               | no                    | Waits for S-04                              |
| S-07       | edit-tournament-settings    | #13   | Organizer edits tournament name and points        | no                    | Waits for S-01, S-04                        |

Issues live in GitHub milestone `M-1: First playable league` with labels `roadmap:slice`, `status:*` and `stream:*`. This file stays canonical; issue labels are a view.

## Open Roadmap Questions

None open. The three PRD v1 questions were resolved on 2026-10-16 and moved to `## Parked` (PRD v2 §Non-Goals).

## Parked

- **Player accounts and notifications** — Why parked: PRD §Non-Goals; players are names only.
- **Head-to-head tiebreaker and score-change history** — Why parked: PRD §Non-Goals; corrections overwrite.
- **Tournament link rotation** — Why parked: PRD §Non-Goals; leak risk accepted for an office league (FR-005).
- **Changing the player list after creation** — Why parked: PRD §Non-Goals; recreate the tournament instead, keeping fixtures tied to a fixed player list.
- **Other formats (cup, group→knockout, Swiss) and the format picker** — Why parked: PRD §Non-Goals; candidates for a later milestone, picker arrives with the cup format (FR-002).
- **App-level logging and error tracking** — Why parked: speed goal; Workers platform observability covers the MVP.

## Milestone History

## Done

- **S-01: organizer can sign in, create a league with a name, win/draw/loss points (prefilled 3/1/0) and uniquely named players, and on save see the complete list of fixtures.** — Archived 2026-10-23 → `context/archive/2026-10-16-create-league-with-fixtures/`. Lesson: —.
- **S-03: organizer can copy an unlisted tournament link; anyone with it, without signing in, can view the fixtures and filter them by player to see that player's unplayed matches.** — Archived 2026-10-25 → `context/archive/2026-10-25-shared-league-link/`. Lesson: —.
