import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { errorFields, logServerEvent } from "@/lib/observability";
import { isUserCausedAuthError } from "@/lib/services/auth-session";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logServerEvent("error", "supabase.not-configured", { route: "auth.signup" });
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // A weak password or an existing account is not a fault; an Auth outage or a 5xx must be logged.
    if (!isUserCausedAuthError(error)) logServerEvent("error", "auth.signup", errorFields(error));
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
