/**
 * Error codes the dashboard endpoints put in `?error=`. The dashboard maps a code to a fixed message,
 * so a crafted link can never make the page show arbitrary text or a raw database error.
 */
export const DASHBOARD_ERROR_MESSAGES = {
  "league-not-found": "League not found",
  "supabase-not-configured": "Supabase is not configured",
  server: "Something went wrong. Try again.",
} as const;

export type DashboardErrorCode = keyof typeof DASHBOARD_ERROR_MESSAGES;

export function isDashboardErrorCode(value: string | null | undefined): value is DashboardErrorCode {
  return value !== null && value !== undefined && Object.hasOwn(DASHBOARD_ERROR_MESSAGES, value);
}
