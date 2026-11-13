import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { errorFields, logServerEvent } from "@/lib/observability";
import { classifyAuthResult, isProtectedPath } from "@/lib/services/auth-session";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const path = context.url.pathname;
  const isProtected = isProtectedPath(path);

  context.locals.user = null;
  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    const outcome = classifyAuthResult(user, error);

    switch (outcome.kind) {
      case "user":
        context.locals.user = outcome.user;
        break;
      case "anonymous":
        break;
      case "auth-unavailable":
        logServerEvent("error", "auth.getUser", { path, ...errorFields(outcome.error) });
        // The organizer may well be signed in: sending them to sign-in would lose their form and hide the outage.
        if (isProtected) {
          return new Response("Sign-in service is temporarily unavailable. Try again shortly.", {
            status: 503,
            headers: { "Retry-After": "30", "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        break;
      case "auth-rejected":
        // Invalid or expired session: behave as signed out, but a burst of these is a signal (e.g. a key change).
        logServerEvent("warn", "auth.getUser", { path, ...errorFields(outcome.error) });
        break;
    }
  }

  if (isProtected && !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  return next();
});
