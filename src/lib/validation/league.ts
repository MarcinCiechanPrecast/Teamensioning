import { z } from "zod";

/**
 * A points field arrives as a form string. Require it to be non-empty first:
 * `Number("")` is 0, so a bare coerce would silently accept an empty field.
 */
const points = z.string().trim().min(1, "Required").pipe(z.coerce.number<string>().int().min(0).max(99));

const leagueName = z
  .string()
  .trim()
  .min(1, "League name is required")
  .max(80, "League name must be at most 80 characters");

const playerName = z
  .string()
  .trim()
  .min(1, "Player name is required")
  .max(40, "Player name must be at most 40 characters");

const settingsShape = {
  name: leagueName,
  pointsWin: points,
  pointsDraw: points,
  pointsLoss: points,
};

const pointsOrdering = {
  check: (data: { pointsWin: number; pointsDraw: number; pointsLoss: number }) =>
    data.pointsWin >= data.pointsDraw && data.pointsDraw >= data.pointsLoss,
  params: { message: "Points must satisfy win ≥ draw ≥ loss", path: ["pointsWin"] },
};

/** Name, points and the win ≥ draw ≥ loss rule: shared by league create and edit-settings. */
export const leagueSettingsSchema = z.object(settingsShape).refine(pointsOrdering.check, pointsOrdering.params);

/** Name only, for saving a league whose points are locked. */
export const leagueNameSchema = z.object({ name: leagueName });

const playerList = z
  .array(playerName)
  .min(3, "Add at least 3 players")
  .max(20, "Add at most 20 players")
  .superRefine((players, ctx) => {
    const seen = new Set<string>();
    for (const player of players) {
      const key = player.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: `Duplicate player name: ${player}` });
        return;
      }
      seen.add(key);
    }
  });

/** Single source of truth for league input, shared by the API endpoint and the form island. */
export const createLeagueSchema = z
  .object({ ...settingsShape, players: playerList })
  .refine(pointsOrdering.check, pointsOrdering.params);

/** A cup has a name and players only: no points settings. */
export const createCupSchema = z.object({ name: leagueName, players: playerList });

/** Format-aware creation input: the form and the endpoint pick the schema by `format`. */
export const createTournamentSchema = z.discriminatedUnion("format", [
  z
    .object({ format: z.literal("league"), ...settingsShape, players: playerList })
    .refine(pointsOrdering.check, pointsOrdering.params),
  z.object({ format: z.literal("cup"), name: leagueName, players: playerList }),
]);

export type LeagueSettingsInput = z.infer<typeof leagueSettingsSchema>;
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export type CreateCupInput = z.infer<typeof createCupSchema>;
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
