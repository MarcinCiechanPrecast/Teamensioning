import { test as base } from "@playwright/test";

export interface Cleanup {
  /** Register a league/cup path (e.g. /leagues/<id>) to be deleted when the test ends, pass or fail. */
  track(path: string): void;
  /** The test already deleted it through the UI; teardown must not try again. */
  done(path: string): void;
}

/**
 * `test` with a `cleanup` fixture. Teardown runs after the test body even when an assertion failed,
 * so a red run does not leave its league behind. It deletes through the organizer's UI (no admin key
 * exists for the app's data) and fails loudly if it cannot, rather than hiding a leak.
 */
export const test = base.extend<{ cleanup: Cleanup }>({
  cleanup: async ({ context }, provide) => {
    const pending = new Set<string>();
    await provide({
      track: (path) => void pending.add(path),
      done: (path) => void pending.delete(path),
    });

    for (const path of pending) {
      const page = await context.newPage();
      try {
        await page.goto(`${path}/delete`);
        await page.getByRole("button", { name: "Delete permanently" }).click();
        await page.waitForURL("**/dashboard");
      } finally {
        await page.close();
      }
    }
  },
});

export { expect } from "@playwright/test";
