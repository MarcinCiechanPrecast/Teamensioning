import type { Page } from "@playwright/test";

/**
 * Resolves once every Astro island on the page has hydrated. React islands drop input typed before
 * hydration and their onSubmit validation never runs, so wait for this before filling a React form
 * whose submit must not be retried (it creates data).
 *
 * Fails closed: it requires at least one island to exist, so a renamed `astro-island` element or `ssr`
 * attribute times out instead of silently skipping the wait.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector("astro-island") !== null && !document.querySelector("astro-island[ssr]"),
  );
}
