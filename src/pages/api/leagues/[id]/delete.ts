import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

// PostgREST answers a malformed uuid with 22P02; to the organizer that is simply "not found".
const INVALID_TEXT_REPRESENTATION = "22P02";

export const POST: APIRoute = async (context) => {
  const failWith = (message: string) => context.redirect(`/dashboard?error=${encodeURIComponent(message)}`);

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return failWith("Supabase is not configured");
  }

  // RLS decides ownership: a league that is not the caller's is invisible, so nothing is deleted or returned.
  const { data, error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", context.params.id ?? "")
    .select("id");

  if (error) {
    return failWith(error.code === INVALID_TEXT_REPRESENTATION ? "League not found" : error.message);
  }
  if (data.length === 0) {
    return failWith("League not found");
  }

  return context.redirect("/dashboard");
};
