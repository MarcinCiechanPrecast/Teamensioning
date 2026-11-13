import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { errorFields, hashToken, logServerEvent } from "@/lib/observability";
import { isValidShareToken } from "@/lib/services/shared-league";
import { rpcErrorCode, toScoreOutcome, validationErrorCode } from "@/lib/services/score-submission";
import type { ScoreErrorCode } from "@/lib/services/score-submission";
import { submitScoreSchema } from "@/lib/validation/score";

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export const POST: APIRoute = async (context) => {
  // A body that is not a form (JSON, or none) is a client error, not a server fault.
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const token = formString(form.get("token"));

  if (!isValidShareToken(token)) {
    return new Response("Not found", { status: 404 });
  }

  const sharePage = `/t/${token}`;
  // Only a fixed code travels in the URL; the share page maps it to a message. Raw errors stay server-side.
  const failWith = (code: ScoreErrorCode) => context.redirect(`${sharePage}?error=${code}`);

  const parsed = submitScoreSchema.safeParse({
    token,
    matchId: formString(form.get("matchId")),
    scoreA: formString(form.get("scoreA")),
    scoreB: formString(form.get("scoreB")),
  });

  if (!parsed.success) {
    return failWith(validationErrorCode(parsed.error.issues));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logServerEvent("error", "supabase.not-configured", { route: "scores.submit" });
    return failWith("server");
  }

  const { matchId, scoreA, scoreB } = parsed.data;
  const {
    data,
    error,
    status: transportStatus,
  } = await supabase.rpc("submit_match_score", {
    p_token: token,
    p_match_id: matchId,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });

  if (error) {
    logServerEvent("error", "scores.submit", {
      matchId,
      tokenHash: await hashToken(token),
      transportStatus,
      ...errorFields(error),
    });
    return failWith(rpcErrorCode(error));
  }

  const outcome = toScoreOutcome(data);
  switch (outcome.kind) {
    case "created":
      return context.redirect(sharePage);
    case "already-entered":
      return context.redirect(`${sharePage}?notice=already-entered`);
    case "error":
      if (outcome.code === "server") {
        // The RPC answered with a status this code does not know: a code/schema drift, not a user mistake.
        const status = (data as { status?: unknown } | null)?.status;
        logServerEvent("error", "scores.submit.unexpected-status", {
          matchId,
          tokenHash: await hashToken(token),
          received: typeof status === "string" ? status : typeof data,
        });
      }
      return failWith(outcome.code);
  }
};
