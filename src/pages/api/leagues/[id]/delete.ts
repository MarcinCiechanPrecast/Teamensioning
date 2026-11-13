import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { errorFields, logServerEvent } from "@/lib/observability";
import type { DashboardErrorCode } from "@/lib/services/dashboard-errors";

// PostgREST answers a malformed uuid with 22P02; to the organizer that is simply "not found".
const INVALID_TEXT_REPRESENTATION = "22P02";

export const POST: APIRoute = async (context) => {
  const failWith = (code: DashboardErrorCode) => context.redirect(`/dashboard?error=${code}`);

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return failWith("supabase-not-configured");
  }

  const leagueId = context.params.id ?? "";
  // RLS decides ownership: a league that is not the caller's is invisible, so nothing is deleted or returned.
  const {
    data,
    error,
    status: transportStatus,
  } = await supabase.from("tournaments").delete().eq("id", leagueId).select("id");

  if (error) {
    if (error.code === INVALID_TEXT_REPRESENTATION) return failWith("league-not-found");
    logServerEvent("error", "leagues.delete", {
      leagueId,
      userId: context.locals.user.id,
      transportStatus,
      ...errorFields(error),
    });
    return failWith("server");
  }
  if (data.length === 0) {
    return failWith("league-not-found");
  }

  return context.redirect("/dashboard");
};
