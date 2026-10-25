import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isValidShareToken } from "@/lib/services/shared-league";
import { submitScoreSchema } from "@/lib/validation/score";

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Reads `status` from the submit_match_score payload without trusting its shape. */
function readStatus(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const status = (data as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const token = formString(form.get("token"));

  if (!isValidShareToken(token)) {
    return new Response("Not found", { status: 404 });
  }

  const sharePage = `/t/${token}`;
  const failWith = (message: string) => context.redirect(`${sharePage}?error=${encodeURIComponent(message)}`);

  const parsed = submitScoreSchema.safeParse({
    token,
    matchId: formString(form.get("matchId")),
    scoreA: formString(form.get("scoreA")),
    scoreB: formString(form.get("scoreB")),
  });

  if (!parsed.success) {
    return failWith(parsed.error.issues[0]?.message ?? "Invalid score");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return failWith("Supabase is not configured");
  }

  const { matchId, scoreA, scoreB } = parsed.data;
  const { data, error } = await supabase.rpc("submit_match_score", {
    p_token: token,
    p_match_id: matchId,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });

  if (error) {
    return failWith(error.message);
  }

  switch (readStatus(data)) {
    case "created":
      return context.redirect(sharePage);
    case "already_entered":
      return context.redirect(`${sharePage}?notice=already-entered`);
    case "not_found":
      return failWith("Match not found");
    default:
      return failWith("Unexpected response from the server");
  }
};
