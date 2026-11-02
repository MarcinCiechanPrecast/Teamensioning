import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toCorrectionOutcome, type CorrectionErrorCode } from "@/lib/services/score-correction";
import { validationErrorCode } from "@/lib/services/score-submission";
import { correctScoreSchema } from "@/lib/validation/score";

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const leagueId = context.params.id ?? "";
  const back = (query: string) => context.redirect(`/leagues/${encodeURIComponent(leagueId)}?${query}`);
  const failWith = (code: CorrectionErrorCode) => back(`error=${code}`);

  const form = await context.request.formData();
  const parsed = correctScoreSchema.safeParse({
    matchId: form.get("matchId"),
    scoreA: form.get("scoreA"),
    scoreB: form.get("scoreB"),
  });
  if (!parsed.success) {
    return failWith(validationErrorCode(parsed.error.issues));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    // eslint-disable-next-line no-console -- server-side log; the user only gets a fixed error code
    console.error("score correction: Supabase is not configured");
    return failWith("server");
  }

  // RLS decides ownership: a result of someone else's match is invisible, so nothing is updated or returned.
  const { data, error } = await supabase
    .from("results")
    .update({ score_a: parsed.data.scoreA, score_b: parsed.data.scoreB })
    .eq("match_id", parsed.data.matchId)
    .select("match_id");

  if (error) {
    // eslint-disable-next-line no-console -- server-side log; the user only gets a fixed error code
    console.error("score correction failed:", error.code, error.message);
  }

  const outcome = toCorrectionOutcome({ error, rowCount: data?.length ?? 0 });
  return outcome.kind === "updated" ? back("notice=score-updated") : failWith(outcome.code);
};
