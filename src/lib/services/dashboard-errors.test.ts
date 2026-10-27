import { describe, expect, it } from "vitest";

import { DASHBOARD_ERROR_MESSAGES, isDashboardErrorCode } from "@/lib/services/dashboard-errors";

describe("isDashboardErrorCode", () => {
  it("accepts every known code", () => {
    for (const code of Object.keys(DASHBOARD_ERROR_MESSAGES)) expect(isDashboardErrorCode(code)).toBe(true);
  });

  it("rejects an unknown code", () => {
    expect(isDashboardErrorCode("Session expired, sign in at evil.example")).toBe(false);
    expect(isDashboardErrorCode("hello")).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isDashboardErrorCode(null)).toBe(false);
    expect(isDashboardErrorCode(undefined)).toBe(false);
  });

  it("rejects an inherited key", () => {
    expect(isDashboardErrorCode("toString")).toBe(false);
  });
});
