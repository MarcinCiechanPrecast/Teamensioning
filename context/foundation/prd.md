---
project: "Teamensioning"
version: 3
status: draft
created: 2026-10-09
updated: 2026-11-12
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: false
---

# Teamensioning — Product Requirements

## Vision & Problem Statement

Office league organizers track matches in spreadsheets and chat, which wastes time. The pain shows up at three moments: building the schedule (who plays whom), collecting results from players over chat, and recalculating standings after every match. It is a mix of coordination overhead, repetitive manual workflow steps, and data scattered between chat history and a spreadsheet.

Insight: the organizer knows this domain first-hand, which makes it possible to judge whether fixtures and standings the product produces are correct. (Stated motivation: a learning project in a familiar domain; no claim of differentiation from existing tournament tools.) Each league is independent, so the domain rule does not change at 100× scale — scale adds more tournaments, not bigger ones.

## User & Persona

**Primary persona — League organizer:** a colleague who volunteers to run a single casual league inside a company. Reaches for the product when starting a league (building the schedule), while it runs (collecting results), and whenever the standings need updating.

## Success Criteria

### Primary

- The MVP flow works end to end:
  1. Organizer signs in and creates a new tournament.
  2. Organizer picks the format (league or cup), gives it a name, sets points for win/draw/loss (prefilled 3/1/0), and adds players by name.
  3. On save, the tournament is created and its fixtures are ready for results.
  4. Organizer shares the tournament link with players.
  5. A player opens the link and enters a match result.
  6. The leaderboard updates.

### Secondary

- Players check "who do I play next" themselves instead of asking the organizer in chat.

### Guardrails

- The leaderboard always matches the entered results (points and order never wrong or stale).
- Every player meets every other player exactly once in a league (no missing or duplicate pairings).
- A cup bracket is always consistent with the entered scores: no draw is stored, every winner sits in the correct next-round slot, and a played match is never rewritten by a later correction.

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
- FR-002: Organizer can create a tournament by picking a format, league or cup, and giving it a name; a league also takes points for win/draw/loss (prefilled 3/1/0). Priority: must-have
  > Socrates: Counter-argument considered: "a format picker with one option is UI
  > with no value." Resolution: revised in v3; the picker is back now that a second
  > format exists (league | cup). League is the default, and a cup has no points
  > settings. Testable: a form post without a format creates a league.
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
  > sufficient for an office league. Link rotation recorded as an MVP non-goal.
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
  > editable only until the first score is entered. A cup has no points, so only
  > its name is editable.
- FR-014: Organizer can create a cup with 3 to 20 players, seeded by the order in which they were entered; when the player count is not a power of two, the top seeds get a bye in round 1. Priority: must-have
  > Socrates: Counter-argument considered: "the organizer should set or randomize
  > the seeding." Resolution: rejected for now; entry order is the simplest rule and
  > the organizer already controls it. Byes go to seeds 1, 2, ... so the strongest
  > entries are rewarded. Testable: 2 and 21 players are refused; 5 players give
  > three byes, for seeds 1 to 3.
- FR-017: Organizer can correct an already-entered cup score until the winner has played the next round; after that the correction is refused and nothing changes. A correction must still not be a draw, and one that changes the winner moves the new winner into the next round's slot. Priority: must-have
  > Socrates: Counter-argument considered: "a late correction should rewrite the
  > later rounds too." Resolution: rejected; that silently rewrites matches that
  > were already played. The organizer corrects before the next round is played, or
  > recreates the cup. Testable: flipping a winner before the next round was played
  > rewrites the next slot; flipping it after is refused and the stored scores are
  > unchanged; a correction that keeps the winner is always allowed.

### System

- FR-007: System generates round-robin fixtures when a league is saved, as a list of all pairings (no rounds in MVP). Priority: must-have
  > Socrates: Counter-argument considered: "an odd number of players needs byes."
  > Resolution: revised; MVP has no rounds — fixtures are a list of every pairing,
  > played in any order, so odd player counts need no byes.
- FR-008: System calculates a league's leaderboard from entered results using the league's points settings; matches without a result give no points; players level on points are ordered by goal difference, then goals scored. Priority: must-have
  > Socrates: Counter-argument considered: "equal points with no tiebreaker gives an
  > arbitrary order from round one." Resolution: revised; MVP tiebreaker is goal
  > difference, then goals scored. Head-to-head stays for later.
- FR-015: System generates a single-elimination bracket when a cup is saved: N-1 matches for N players, no third-place match, with seeds 1 and 2 placed in opposite halves so they can only meet in the final. Priority: must-have
  > Socrates: Counter-argument considered: "a third-place match gives the losing
  > semi-finalists something to play for." Resolution: rejected; it adds a match
  > outside the bracket and the office cup does not need it. Testable: for every N
  > from 3 to 20 the bracket has N-1 matches, every player appears exactly once in
  > round 1 or as a bye, and seeds 1 and 2 are in different halves.

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
- FR-016: Link holder can enter the score of a cup match once, when both of its players are known. Scores must differ (no draws); the winner advances into their slot of the next round. If a score was already entered, they see that it is already entered. Priority: must-have
  > Socrates: Counter-argument considered: "a knockout match may need extra time or
  > penalties, so a draw should be possible." Resolution: rejected; the players
  > settle a tie off-app and enter the final score, because a draw leaves no winner
  > to advance. Same write-once rule as FR-009: the first submission wins.
  > Testable: a draw is refused and nothing is stored; a valid score fills the
  > winner's slot in the next match; a match with an unfilled slot refuses a score;
  > a second submission leaves the first unchanged.
- FR-018: Link holder can view a cup's bracket: one list per round, the match pairings, "TBD" for slots not yet decided, "Bye" for top seeds that skip round 1, and the champion once the final has a score. Priority: must-have
  > Socrates: Counter-argument considered: "a standings table is enough, as in a
  > league." Resolution: rejected; a cup has no standings, and the bracket is how
  > players see who they play next and where the cup stands. Testable: a 5-player
  > cup shows three byes, one round-1 match, TBD in the unfilled slots, and
  > "Champion: <name>" only after the final has a score.

## Non-Functional Requirements

- After a score is entered or corrected, the next view of the leaderboard by anyone reflects it — no stale standings.

## Business Logic

The system generates fixtures and calculates standings from entered scores. For a cup it generates a single-elimination bracket and advances winners from entered scores.

**Inputs:** the format (league or cup); player names (unique within a tournament); for a league, points for win/draw/loss set by the organizer (default 3/1/0, editable only before the first score); match scores entered by link holders or corrected by the organizer.

**Output:** a list of all pairings in which every pair of players meets exactly once (no rounds); and a leaderboard ordered by points, then goal difference, then goals scored, showing played, won/drawn/lost, goals for/against, goal difference and points. A match without a score gives no points to either player.

**Cup output:** a bracket of N-1 matches for N players (3 to 20), seeded by entry order, with byes for the top seeds when N is not a power of two and no third-place match. Seeds 1 and 2 can only meet in the final. A score must have a winner; the winner takes their slot in the next round. A correction is refused once the winner has played the next round.

**Where the user encounters it:** fixtures appear as soon as the tournament is saved; the leaderboard changes as soon as a score is entered or corrected. For a cup, the bracket appears as soon as it is saved and a winner shows in the next round as soon as a score is entered; the champion shows once the final has a score.

## Access Control

- **Organizer (tournament admin):** signs in with a login (email + password or OAuth). Creating a tournament makes the creator its admin. Only the admin manages the tournament: setup, players, name/points edits, score corrections, deletion.
- **Players:** no accounts. The organizer adds them by name.
- **Anyone with the tournament link:** can view the tournament (fixtures, results, leaderboard) and enter a match score without signing in. Once a score is entered, only the organizer can correct it.
- **Visibility:** tournaments are unlisted — reachable only via their link, not browsable or searchable.
- Flat role model for MVP: admin vs. link holder.

## Non-Goals

- **No player accounts or notifications** — players are names only; no emails or match reminders. Keeps link-based entry friction-free.
- **No head-to-head tiebreaker or score-change history** — MVP tiebreaker is goal difference then goals scored; an organizer correction overwrites the score.
- **No tournament link rotation** — a leaked link cannot be regenerated; the risk is accepted for an office league (FR-005).
- **No changes to the player list after creation** — a missing or extra player means recreating the tournament. Keeps the "every pair meets exactly once" guardrail tied to a fixed player list.
- **Only the league and single-elimination cup formats** — group→knockout, double elimination and Swiss remain later candidates.

## Open Questions

None open. Resolved on 2026-10-16: link rotation, player-list changes after creation and other formats are recorded under Non-Goals. Resolved on 2026-11-12 (v3): the cup format is in scope; draws, third-place match, seeding order, player range and late corrections are settled in FR-014 to FR-018.
