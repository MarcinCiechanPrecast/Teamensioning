import type { SharedLeagueDTO, StandingDTO } from "@/types";

type StandingsInput = Pick<SharedLeagueDTO, "league" | "players" | "fixtures">;

/** Points, then goal difference, then goals for; negative when `a` ranks ahead of `b`. */
function compareRecords(a: StandingDTO, b: StandingDTO): number {
  return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;
}

/**
 * Computes one standing per league player from the played fixtures (unplayed ones count for nothing).
 * Ordered by points, goal difference, goals for, then name; level players share a competition rank (1, 1, 3).
 */
export function computeStandings({ league, players, fixtures }: StandingsInput): StandingDTO[] {
  const rows = new Map<string, StandingDTO>(
    players.map((player) => [
      player.id,
      {
        rank: 0,
        player,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      },
    ]),
  );

  const record = (row: StandingDTO | undefined, goalsFor: number, goalsAgainst: number) => {
    if (!row) return;
    row.played += 1;
    row.goalsFor += goalsFor;
    row.goalsAgainst += goalsAgainst;
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    if (goalsFor > goalsAgainst) {
      row.won += 1;
      row.points += league.points_win;
    } else if (goalsFor < goalsAgainst) {
      row.lost += 1;
      row.points += league.points_loss;
    } else {
      row.drawn += 1;
      row.points += league.points_draw;
    }
  };

  for (const fixture of fixtures) {
    if (!fixture.score) continue;
    record(rows.get(fixture.playerA.id), fixture.score.a, fixture.score.b);
    record(rows.get(fixture.playerB.id), fixture.score.b, fixture.score.a);
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      compareRecords(a, b) || a.player.name.localeCompare(b.player.name) || a.player.id.localeCompare(b.player.id),
  );
  for (const row of sorted) {
    row.rank = 1 + sorted.filter((other) => compareRecords(other, row) < 0).length;
  }
  return sorted;
}
