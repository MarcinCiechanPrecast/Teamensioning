import { z } from "zod";
import { isValidShareToken } from "@/lib/services/shared-league";

/**
 * A score field arrives as a form string. Require it to be non-empty first:
 * `Number("")` is 0, so a bare coerce would silently accept an empty field.
 */
const score = z
  .string()
  .trim()
  .min(1, "Score is required")
  .pipe(
    z.coerce
      .number<string>("Score must be a number")
      .int("Score must be a whole number")
      .min(0, "Score must be at least 0")
      .max(99, "Score must be at most 99"),
  );

/** Input of the anonymous score form posted to /api/scores. */
export const submitScoreSchema = z.object({
  token: z.string().refine(isValidShareToken, "Invalid share link"),
  matchId: z.uuid("Invalid match"),
  scoreA: score,
  scoreB: score,
});

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
