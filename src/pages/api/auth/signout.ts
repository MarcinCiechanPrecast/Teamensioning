import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { errorFields, logServerEvent } from "@/lib/observability";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    // A failed sign-out can leave the session in place while the user believes they are signed out.
    if (error) logServerEvent("error", "auth.signout", errorFields(error));
  }
  return context.redirect("/");
};
