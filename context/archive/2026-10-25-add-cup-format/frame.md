# Frame Brief: Cup (knockout) format

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

The app only supports round-robin leagues. The user asks: "what should I do to add cup system to app?"

## Initial Framing (preserved)

- **User's stated cause or approach**: A "cup system" is a missing feature to be added to the existing app (no stated theory of how it fits the current model).
- **User's proposed direction**: Add a cup format.
- **Pre-dispatch narrowing**:
  - Shape: pure knockout bracket (single elimination), not group→knockout.
  - Timing: after the league milestone (M-1) is done.
  - Motivation: players want "elimination drama" (league standings feel flat).

## Dimension Map

The "add a cup" ask could break the current system at any of these dimensions:

1. **Product scope / PRD** — cup is a declared Non-Goal for MVP; the format picker (FR-002) was deferred "together with the cup format".
2. **Data model** — `matches` assumes two known players and a round-robin pair set; no format, round, or bracket-slot concept.
3. **Domain logic** — fixture generation, result semantics and standings are league-only.
4. **Write path and trust model** — anonymous write-once score entry; a cup adds winner propagation (a derived write).
5. **UI / flow** — create form, organizer page, shared page all assume a league.

## Hypothesis Investigation

| Hypothesis                                    | Evidence                                                                                                                                                                                                                                                          | Verdict                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Scope: cup is already planned and parked      | `prd.md` Non-Goals ("No formats other than league in MVP … picker arrives with the cup format"); `roadmap.md` Parked list; M-1 still open (S-04 in progress, S-02/05/06/07 proposed)                                                                              | STRONG                   |
| Data model cannot hold a bracket as-is        | `20261023120000_create_league_schema.sql:49-68`: `matches.player_a_id/player_b_id` NOT NULL with composite FKs, so later-round slots ("winner of match 3") cannot exist; no `round`/format column; `tournaments` has no format field (`src/db/database.types.ts`) | STRONG                   |
| Domain logic reusable                         | `src/lib/services/fixtures.ts:13` is a pure round-robin circle generator; `create_league` RPC hard-codes 3–20 players and n(n−1)/2 matches (`...schema.sql:139-149`). Not reusable for brackets (byes, seeding, power-of-two).                                    | STRONG (needs new logic) |
| Results semantics fit knockout                | `20261025130000_add_match_results.sql`: scores 0–99, draws allowed, write-once via `submit_match_score`. A cup needs a decisive winner (no draws or a tiebreak rule) and advancing the winner into the next match.                                                | STRONG                   |
| Leaderboard/standings are the thing to extend | Standings (S-05) are not built yet and are meaningless for a bracket; the cup replaces them with a bracket view, not an extension of them.                                                                                                                        | WEAK as a dependency     |
| UI reuse                                      | `CreateLeagueForm.tsx`, `/leagues/[id].astro`, `/t/[token].astro` are league-specific; share link and fixture list concepts partly reusable.                                                                                                                      | WEAK (cosmetic)          |

## Narrowing Signals

- User wants a pure single-elimination bracket, not group→knockout: the round-robin machinery is not reused as a stage.
- User wants it after M-1: no need to disturb the in-flight `link-score-entry` schema.
- Motivation is engagement ("elimination drama"), not scale: bracket must be simple and visible to link holders.

## Cross-System Convention

Single elimination is conventionally modelled as matches with a round number and a bracket slot, where later-round matches reference their feeder matches (winner-of). Open-slot rows must be allowed, with byes for non-power-of-two player counts. This matches the finding that the current `matches` shape is the blocker.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the app's tournament model is hard-wired to "a league = a fixed set of pairings between known players with draws allowed". A cup is a second tournament _format_ whose matches are produced progressively from earlier results, so the work is introducing a format concept in the data model and write path, not adding a bracket screen.

The initial framing ("add a cup system") was directionally correct, but it understates the work: it is not an additive feature. It touches the schema, the score-entry RPC (winner advancement, no draws), fixture generation (byes, seeding) and every view. It is also already acknowledged in the PRD as deferred, which is consistent with the "after M-1" timing.

## Confidence

**MEDIUM** — strong code and PRD evidence for the model mismatch; open product decisions remain (listed below) that evidence cannot settle.

Decisions to settle before /10x-plan:

- Draws in a cup: forbidden (score must differ), or allowed with a tiebreak field?
- Non-power-of-two player counts: byes for top seeds, or a play-in round?
- Seeding: order of entry, random draw, or organizer-set?
- Third-place match: yes/no.
- Does an organizer score correction after later rounds were played invalidate downstream matches (S-06 interaction)?

## What Changes for /10x-plan

Plan around "introduce a tournament format (league | cup) and a bracket-capable match model", sequenced after M-1, with the cup generator and winner-advancement logic as the core new domain code. Start from a PRD amendment (FR-002 format picker, new FRs for cup) rather than from UI.

## References

- `context/foundation/prd.md` (Non-Goals, FR-002, FR-007, FR-009)
- `context/foundation/roadmap.md` (Parked, M-1 slices)
- `supabase/migrations/20261023120000_create_league_schema.sql:49-68, 139-149`
- `supabase/migrations/20261025130000_add_match_results.sql`
- `src/lib/services/fixtures.ts:13`
- Investigation: inline file reads, no sub-agents (surface small)
