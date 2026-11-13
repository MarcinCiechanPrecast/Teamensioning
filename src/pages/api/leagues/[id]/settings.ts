import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { errorFields, logServerEvent } from "@/lib/observability";
import type { DashboardErrorCode } from "@/lib/services/dashboard-errors";
import { leagueNameSchema, leagueSettingsSchema } from "@/lib/validation/league";

// PostgREST answers a malformed uuid with 22P02; to the organizer that is simply "not found".
const INVALID_TEXT_REPRESENTATION = "22P02";
// The tournaments_*_check constraints: the DB rejected values the schema let through.
const CHECK_VIOLATION = "23514";

const POINTS_LOCKED_MESSAGE = "A score was just entered — points are now locked";

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const failToDashboard = (code: DashboardErrorCode) => context.redirect(`/dashboard?error=${code}`);
  const failToForm = (message: string) =>
    context.redirect(`/leagues/${encodeURIComponent(id)}/edit?error=${encodeURIComponent(message)}`);

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  // A locked form does not submit the points fields at all: that means "leave points unchanged".
  const pointsSubmitted = form.has("pointsWin") || form.has("pointsDraw") || form.has("pointsLoss");

  let name: string;
  let points: { pointsWin: number; pointsDraw: number; pointsLoss: number } | null = null;

  if (pointsSubmitted) {
    const parsed = leagueSettingsSchema.safeParse({
      name: formString(form.get("name")),
      pointsWin: formString(form.get("pointsWin")),
      pointsDraw: formString(form.get("pointsDraw")),
      pointsLoss: formString(form.get("pointsLoss")),
    });
    if (!parsed.success) {
      return failToForm(parsed.error.issues[0]?.message ?? "Invalid league data");
    }
    name = parsed.data.name;
    points = parsed.data;
  } else {
    const parsed = leagueNameSchema.safeParse({ name: formString(form.get("name")) });
    if (!parsed.success) {
      return failToForm(parsed.error.issues[0]?.message ?? "Invalid league data");
    }
    name = parsed.data.name;
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return failToDashboard("supabase-not-configured");
  }

  const logContext = { leagueId: id, userId: context.locals.user.id };

  // The RPC checks ownership and the points lock atomically; nothing is written unless it returns "updated".
  // Generated RPC arg types are never nullable, but null points mean "leave unchanged" (see the migration).
  const unchanged = null as unknown as number;
  const {
    data,
    error,
    status: transportStatus,
  } = await supabase.rpc("update_tournament_settings", {
    p_tournament_id: id,
    p_name: name,
    p_points_win: points?.pointsWin ?? unchanged,
    p_points_draw: points?.pointsDraw ?? unchanged,
    p_points_loss: points?.pointsLoss ?? unchanged,
  });

  if (error) {
    if (error.code === INVALID_TEXT_REPRESENTATION) return failToDashboard("league-not-found");
    if (error.code === CHECK_VIOLATION) return failToForm("Invalid league settings");
    logServerEvent("error", "leagues.settings", { ...logContext, transportStatus, ...errorFields(error) });
    return failToDashboard("server");
  }

  const status = (data as { status?: unknown } | null)?.status;
  if (status === "updated") return context.redirect(`/leagues/${encodeURIComponent(id)}`);
  if (status === "points_locked") return failToForm(POINTS_LOCKED_MESSAGE);
  if (status !== "not_found") {
    // Anything but the known statuses is a code/schema drift: still shown as "not found", but never silently.
    logServerEvent("error", "leagues.settings.unexpected-status", {
      ...logContext,
      received: typeof status === "string" ? status : typeof data,
    });
  }
  return failToDashboard("league-not-found");
};
