---
project: "Teamensioning"
context_type: greenfield
created: 2026-10-09
updated: 2026-10-09
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: false
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona"
      decision: "volunteer colleague organizing one casual league inside a company"
    - topic: "pain category"
      decision: "coordination overhead, workflow friction, scattered data"
    - topic: "auth strategy"
      decision: "organizer logs in (email+password or OAuth); players have no accounts, added by name"
    - topic: "score entry & visibility"
      decision: "anyone with the tournament link can view and enter scores; tournaments are unlisted"
    - topic: "format picker in MVP"
      decision: "no picker in MVP (revised in Socrates round); league implicit, picker arrives with cup"
    - topic: "points configuration"
      decision: "set on create form, prefilled 3/1/0; editable only before any score is entered"
    - topic: "score correction"
      decision: "link holders enter a score once; only the organizer can correct it"
    - topic: "unplayed matches"
      decision: "implicit: a match without a result gives no points; no explicit unplayed status in MVP"
    - topic: "fixture structure"
      decision: "flat list of all pairings, no rounds, no byes in MVP"
    - topic: "MVP tiebreaker"
      decision: "goal difference, then goals scored; head-to-head later"
    - topic: "tournament management"
      decision: "organizer can delete (with confirmation) and edit name/points; no adding/removing players after creation"
  frs_drafted: 13
  quality_check_status: accepted
---

# Shape Notes

## Seed idea (verbatim)

Public web app for running tournaments, e.g. internal company leagues. A user creates a tournament (becoming its admin) and adds players; the system generates fixtures. Score entry is open; the system calculates results and the leaderboard.

MVP: league (round-robin) with leaderboard. Admin-defined points for win/draw/loss, default 3/1/0. Unplayed matches give both players 0 points.

Next: cup (single elimination) with bracket view; byes advance players without an opponent.
Later: group stage → knockout (World Cup style), Swiss system, tiebreakers (head-to-head, then goals scored/conceded).

Open questions: do players need accounts or can they be added by name; who exactly can enter or correct a score (any user vs. match participants); when a match counts as unplayed (admin closes the round vs. a deadline); the exact order of the goal-based tiebreakers.

## Vision & Problem Statement

Office league organizers track matches in spreadsheets and chat, which wastes time. The pain shows up at three moments: building the schedule (who plays whom), collecting results from players over chat, and recalculating standings after every match. It is a mix of coordination overhead, repetitive manual workflow steps, and data scattered between chat history and a spreadsheet.

Insight: the organizer knows this domain first-hand, which makes it possible to judge whether fixtures and standings the product produces are correct. (Stated motivation: a learning project in a familiar domain; no claim of differentiation from existing tournament tools.)

Scale note: each league is independent, so the domain rule does not change at 100× scale — scale adds more tournaments, not bigger ones.

## User & Persona

**Primary persona — League organizer:** a colleague who volunteers to run a single casual league inside a company. Reaches for the product when starting a league (building the schedule), while it runs (collecting results), and whenever the standings need updating.

## Success Criteria

### Primary
- The MVP flow works end to end:
  1. Organizer signs in and creates a new tournament.
  2. Organizer gives it a name (league format is implicit in MVP), sets points for win/draw/loss (prefilled 3/1/0), and adds players by name.
  3. On save, the tournament is created and its fixtures are ready for results.
  4. Organizer shares the tournament link with players.
  5. A player opens the link and enters a match result.
  6. The leaderboard updates.

### Secondary
- Players check "who do I play next" themselves instead of asking the organizer in chat.

### Guardrails
- The leaderboard always matches the entered results (points and order never wrong or stale).
- Every player meets every other player exactly once in a league (no missing or duplicate pairings).

## User Stories

### US-01: Organizer runs a league and players report results

- **Given** an organizer who is signed in
- **When** they create a league with a name, points (3/1/0) and 4 players, share the link, and a player enters the score of a match through that link
- **Then** the leaderboard shows the updated points for both players in that match

#### Acceptance Criteria
- Fixtures contain every pair of players exactly once (4 players → 6 matches)
- Leaderboard points match the entered results and the tournament's points settings
- A match without a result gives no points to either player
- A link holder cannot change a score once it has been entered; the organizer can

## Functional Requirements

### Organizer
- FR-001: Organizer can sign in. Priority: must-have
  > Socrates: Counter-argument considered: "a secret admin link would do — no
  > account system, less auth work in a 3-week MVP." Resolution: rejected; sign-in
  > kept for clear tournament ownership and a proper access-control mechanism.
- FR-002: Organizer can create a league tournament with a name and points for win/draw/loss (prefilled 3/1/0). Priority: must-have
  > Socrates: Counter-argument considered: "a format picker with one option is UI
  > with no value." Resolution: revised; picker dropped, league is implicit in MVP.
  > The picker arrives together with the cup format.
- FR-003: Organizer can add players to a tournament by name; names must be unique within a tournament. Priority: must-have
  > Socrates: Counter-argument considered: "duplicate names (two 'Tomek's) make the
  > leaderboard ambiguous." Resolution: revised; the system rejects a duplicate
  > name within the same tournament.
- FR-004: Organizer can see a list of their tournaments. Priority: must-have
  > Socrates: Counter-argument considered: "bookmarking the tournament link would
  > do." Resolution: rejected; after signing in the organizer needs a way back
  > without relying on a bookmark.
- FR-005: Organizer can share the tournament link with players. Priority: must-have
  > Socrates: Counter-argument considered: "a leaked link lets anyone enter scores
  > and can't be revoked." Resolution: risk accepted for MVP; an unlisted link is
  > sufficient for an office league. Link rotation recorded as an open question.
- FR-006: Organizer can correct an already-entered match score. Priority: must-have
  > Socrates: Counter-argument considered: "the organizer becomes a bottleneck
  > again for every typo." Resolution: kept; corrections are expected to be rare —
  > accepted trade-off.
- FR-012: Organizer can delete a tournament after explicitly confirming the deletion. Priority: must-have
  > Socrates: Counter-argument considered: "a misclick wipes out a whole season of
  > results." Resolution: revised; deletion requires explicit confirmation and
  > remains permanent.
- FR-013: Organizer can edit a tournament's name at any time, and its points for win/draw/loss only before any score has been entered. Priority: must-have
  > Socrates: Counter-argument considered: "changing points mid-league reshuffles the
  > table retroactively and invites disputes." Resolution: revised; points are
  > editable only until the first score is entered.

### System
- FR-007: System generates round-robin fixtures when the tournament is saved, as a list of all pairings (no rounds in MVP). Priority: must-have
  > Socrates: Counter-argument considered: "an odd number of players needs byes."
  > Resolution: revised; MVP has no rounds — fixtures are a list of every pairing,
  > played in any order, so odd player counts need no byes.
- FR-008: System calculates the leaderboard from entered results using the tournament's points settings; matches without a result give no points; players level on points are ordered by goal difference, then goals scored. Priority: must-have
  > Socrates: Counter-argument considered: "equal points with no tiebreaker gives an
  > arbitrary order from round one." Resolution: revised; MVP tiebreaker is goal
  > difference, then goals scored. Head-to-head stays for later.

### Link holder (player)
- FR-009: Link holder can enter a match score once; if a score was already entered, they see that it is already entered. Priority: must-have
  > Socrates: Counter-argument considered: "two players may submit different scores
  > at the same time." Resolution: revised; the first submission wins, the second
  > sees "already entered"; the organizer corrects if needed (FR-006).
- FR-010: Link holder can view fixtures and filter them by player to see that player's unplayed matches. Priority: must-have
  > Socrates: Counter-argument considered: "with no rounds, a flat list doesn't
  > answer 'who do I play next'." Resolution: revised; per-player filter showing
  > remaining matches — delivers the secondary success criterion.
- FR-011: Link holder can view the leaderboard with played, won/drawn/lost, goals for/against, goal difference and points. Priority: must-have
  > Socrates: Counter-argument considered: "a table with points only gives players
  > no way to verify it." Resolution: revised; full football-style columns, which
  > also expose the tiebreaker inputs.

## Non-Functional Requirements

- After a score is entered or corrected, the next view of the leaderboard by anyone reflects it — no stale standings.

## Business Logic

The system generates fixtures and calculates standings from entered scores.

**Inputs:** player names (unique within a tournament); points for win/draw/loss set by the organizer (default 3/1/0, editable only before the first score); match scores entered by link holders or corrected by the organizer.

**Output:** a list of all pairings in which every pair of players meets exactly once (no rounds); and a leaderboard ordered by points, then goal difference, then goals scored, showing played, won/drawn/lost, goals for/against, goal difference and points. A match without a score gives no points to either player.

**Where the user encounters it:** fixtures appear as soon as the tournament is saved; the leaderboard changes as soon as a score is entered or corrected.

## Access Control

- **Organizer (tournament admin):** signs in with a login (email + password or OAuth). Creating a tournament makes the creator its admin. Only the admin manages the tournament: setup, players, name/points edits, score corrections, deletion.
- **Players:** no accounts. The organizer adds them by name.
- **Anyone with the tournament link:** can view the tournament (fixtures, results, leaderboard) and enter a match score without signing in. Once a score is entered, only the organizer can correct it.
- **Visibility:** tournaments are unlisted — reachable only via their link, not browsable or searchable.
- Flat role model for MVP: admin vs. link holder.

## Non-Goals

- **No player accounts or notifications** — players are names only; no emails or match reminders. Keeps link-based entry friction-free.
- **No head-to-head tiebreaker or score-change history** — MVP tiebreaker is goal difference then goals scored; an organizer correction overwrites the score.

## Open Questions

1. **Tournament link rotation** — should the organizer be able to regenerate a leaked link? Risk accepted for MVP (FR-005 Socrates). Owner: user.
2. **Adding or removing players after creation** — offered in the cross-check follow-up but not selected as an FR, and not ruled out as a non-goal. Today a missing player means recreating the tournament. Owner: user.
3. **Other formats as explicit non-goals** — cup, group→knockout and Swiss are listed as "Next/Later" in the seed idea but were not selected as MVP non-goals. Owner: user.

## Forward: tech-stack

Informational — not part of the PRD schema. For the tech-stack selection step.

- Decided on 2026-10-09: the project starts from the `przeprogramowani/10x-astro-starter` template (repo created from it: `MarcinCiechanPrecast/Teamensioning`). Treat its stack as the baseline rather than an open choice.
