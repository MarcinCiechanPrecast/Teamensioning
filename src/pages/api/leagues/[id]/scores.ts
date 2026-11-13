import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { errorFields, logServerEvent } from "@/lib/observability";
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
    logServerEvent("error", "supabase.not-configured", { route: "scores.correct" });
    return failWith("server");
  }

  const logContext = { leagueId, matchId: parsed.data.matchId, userId: context.locals.user.id };

  // The path id must own the match: otherwise an owner could correct a match of another of their leagues
  // through the wrong URL. RLS already hides matches of other owners.
  const {
    data: match,
    error: matchError,
    status: lookupStatus,
  } = await supabase
    .from("matches")
    .select("id")
    .eq("id", parsed.data.matchId)
    .eq("tournament_id", leagueId)
    .maybeSingle();
  // A malformed league id (22P02) or a match outside this league is simply "not found".
  const lookup = toCorrectionOutcome({ error: matchError, rowCount: 1, inTournament: match !== null });
  if (lookup.kind === "error") {
    // Only real faults are logged; "not found" and the organizer's own mistakes are ordinary outcomes.
    if (lookup.code === "server") {
      logServerEvent("error", "scores.correct.lookup", {
        ...logContext,
        transportStatus: lookupStatus,
        ...errorFields(matchError),
      });
    }
    return failWith(lookup.code);
  }

  // RLS decides ownership: a result of someone else's match is invisible, so nothing is updated or returned.
  const {
    data,
    error,
    status: updateStatus,
  } = await supabase
    .from("results")
    .update({ score_a: parsed.data.scoreA, score_b: parsed.data.scoreB })
    .eq("match_id", parsed.data.matchId)
    .select("match_id");

  const outcome = toCorrectionOutcome({ error, rowCount: data?.length ?? 0 });
  if (outcome.kind === "error" && outcome.code === "server") {
    logServerEvent("error", "scores.correct", { ...logContext, transportStatus: updateStatus, ...errorFields(error) });
  }
  return outcome.kind === "updated" ? back("notice=score-updated") : failWith(outcome.code);
};
