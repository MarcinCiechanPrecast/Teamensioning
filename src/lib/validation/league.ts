import { z } from "zod";

/**
 * A points field arrives as a form string. Require it to be non-empty first:
 * `Number("")` is 0, so a bare coerce would silently accept an empty field.
 */
const points = z.string().trim().min(1, "Required").pipe(z.coerce.number<string>().int().min(0).max(99));

const playerName = z
  .string()
  .trim()
  .min(1, "Player name is required")
  .max(40, "Player name must be at most 40 characters");

/** Single source of truth for league input, shared by the API endpoint and the form island. */
export const createLeagueSchema = z
  .object({
    name: z.string().trim().min(1, "League name is required").max(80, "League name must be at most 80 characters"),
    pointsWin: points,
    pointsDraw: points,
    pointsLoss: points,
    players: z
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
      }),
  })
  .refine((data) => data.pointsWin >= data.pointsDraw && data.pointsDraw >= data.pointsLoss, {
    message: "Points must satisfy win ≥ draw ≥ loss",
    path: ["pointsWin"],
  });

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
