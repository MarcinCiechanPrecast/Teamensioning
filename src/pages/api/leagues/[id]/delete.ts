import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
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

  // RLS decides ownership: a league that is not the caller's is invisible, so nothing is deleted or returned.
  const { data, error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", context.params.id ?? "")
    .select("id");

  if (error) {
    return failWith(error.code === INVALID_TEXT_REPRESENTATION ? "league-not-found" : "server");
  }
  if (data.length === 0) {
    return failWith("league-not-found");
  }

  return context.redirect("/dashboard");
};
