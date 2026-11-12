import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateBracket } from "@/lib/services/bracket";
import { generateFixtures } from "@/lib/services/fixtures";
import { createTournamentSchema } from "@/lib/validation/league";

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export const POST: APIRoute = async (context) => {
  const failWith = (message: string) => context.redirect(`/leagues/new?error=${encodeURIComponent(message)}`);

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  // A missing or unknown format means league, so a post from an old form keeps working.
  const format = formString(form.get("format")) === "cup" ? "cup" : "league";
  const parsed = createTournamentSchema.safeParse({
    format,
    name: formString(form.get("name")),
    pointsWin: formString(form.get("pointsWin")),
    pointsDraw: formString(form.get("pointsDraw")),
    pointsLoss: formString(form.get("pointsLoss")),
    players: form
      .getAll("players")
      .map(formString)
      .filter((player) => player.trim() !== ""),
  });

  if (!parsed.success) {
    return failWith(parsed.error.issues[0]?.message ?? "Invalid league data");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return failWith("Supabase is not configured");
  }

  const input = parsed.data;

  if (input.format === "cup") {
    // Re-map to the snake_case plain objects the RPC reads; BracketMatch is not assignable to the Json type.
    const bracket = generateBracket(input.players.length).map((match) => ({
      round: match.round,
      position: match.position,
      a: match.a,
      b: match.b,
      next_position: match.nextPosition,
      next_slot: match.nextSlot,
    }));

    const { data: cupId, error: cupError } = await supabase.rpc("create_cup", {
      p_name: input.name,
      p_players: input.players,
      p_bracket: bracket,
    });

    if (cupError) {
      return failWith(cupError.code === "23505" ? "Player names must be unique" : cupError.message);
    }

    return context.redirect(`/leagues/${cupId}`);
  }

  const { name, pointsWin, pointsDraw, pointsLoss, players } = input;
  // Re-map to plain object literals: the FixturePair interface is not assignable to the RPC's Json type.
  const fixtures = generateFixtures(players.length).map(({ a, b }) => ({ a, b }));

  const { data: tournamentId, error } = await supabase.rpc("create_league", {
    p_name: name,
    p_points_win: pointsWin,
    p_points_draw: pointsDraw,
    p_points_loss: pointsLoss,
    p_players: players,
    p_fixtures: fixtures,
  });

  if (error) {
    return failWith(error.code === "23505" ? "Player names must be unique" : error.message);
  }

  return context.redirect(`/leagues/${tournamentId}`);
};
