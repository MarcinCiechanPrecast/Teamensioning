import { randomUUID } from "node:crypto";
import { expect, test as setup } from "@playwright/test";
import { waitForHydration } from "./support/hydration";

const authFile = "playwright/.auth/user.json";

// A fresh organizer per run instead of a fixed E2E_USERNAME/E2E_PASSWORD: local Supabase has email
// confirmation off (supabase/config.toml), so a sign-up is usable at once, CI needs no stored secret,
// and runs never share state. playwright.config.ts refuses to start unless SUPABASE_URL is local.
setup("organizer signs up and signs in through the UI", async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  const password = `E2e-${randomUUID()}`;

  await page.goto("/auth/signup");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/auth/confirm-email");

  await page.goto("/auth/signin");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/"));

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
