// Risk #3 (leaderboard disagrees with stored results, incl. after a correction) and risk #1 cross-check
// (a link holder cannot change an entered score; the organizer can). context/foundation/test-plan.md §2, §3 Phase 3.
// Signal over smoke + integration: smoke only greps the share page for "2–1"; the integration suite stops at
// the database. Neither checks the rendered standings for a non-default points setting, nor that a correction
// reaches the next anonymous view.
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/cleanup";
import { waitForHydration } from "./support/hydration";

const PLAYERS = ["Anna", "Bartek", "Celina", "Darek"];
// Non-default points with loss > 0, so a loss and an unplayed match render differently (0 vs 1 point).
const POINTS = { win: "4", draw: "2", loss: "1" };

function standings(page: Page): Locator {
  return page.getByRole("table", { name: "Standings" });
}

function standingRow(page: Page, player: string): Locator {
  return standings(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: player, exact: true }) });
}

/** Rank, P, W, D, L, GF, GA, GD, Pts — the cells around the player's row header, as rendered. */
async function expectStanding(page: Page, player: string, cells: string[]): Promise<void> {
  await expect(standingRow(page, player).getByRole("cell")).toHaveText(cells);
}

function fixture(page: Page, label: string): Locator {
  return page.getByRole("listitem").filter({ hasText: label });
}

async function enterScore(row: Locator, scores: [string, string, string, string]): Promise<void> {
  const [playerA, scoreA, playerB, scoreB] = scores;
  await row.getByLabel(`Score of ${playerA}`).fill(scoreA);
  await row.getByLabel(`Score of ${playerB}`).fill(scoreB);
  await row.getByRole("button", { name: "Save" }).click();
}

test("US-01: leaderboard reflects a link holder's score and the organizer's correction", async ({
  page,
  browser,
  baseURL,
  cleanup,
}) => {
  const leagueName = `E2E League ${randomUUID().slice(0, 8)}`;

  // --- Organizer creates the league (signed in through the setup project's storageState).
  await page.goto("/leagues/new");
  await waitForHydration(page);
  await page.getByLabel("League name").fill(leagueName);
  await page.getByLabel("Win", { exact: true }).fill(POINTS.win);
  await page.getByLabel("Draw", { exact: true }).fill(POINTS.draw);
  await page.getByLabel("Loss", { exact: true }).fill(POINTS.loss);
  await page.getByRole("button", { name: "Add player" }).click();
  for (const [index, name] of PLAYERS.entries()) {
    await page.getByLabel(`Player ${index + 1}`, { exact: true }).fill(name);
  }
  await page.getByRole("button", { name: "Create league" }).click();

  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  const leaguePath = new URL(page.url()).pathname;
  cleanup.track(leaguePath);
  // US-01 AC: 4 players → 6 matches, every pair once.
  await expect(page.getByText("6 matches")).toBeVisible();
  const shareUrl = await page.getByLabel("Share link").inputValue();
  const sharePath = new URL(shareUrl).pathname;
  expect(sharePath).toMatch(/^\/t\/[0-9a-f]{64}$/);

  // --- A link holder with no session opens the share link in two tabs (the second goes stale).
  const anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const linkHolder = await anonymous.newPage();
    const staleTab = await anonymous.newPage();
    await linkHolder.goto(sharePath);
    await staleTab.goto(sharePath);
    await expect(linkHolder.getByRole("heading", { name: leagueName })).toBeVisible();
    await expect(linkHolder.getByText("No scores yet")).toBeVisible();

    await enterScore(fixture(linkHolder, "Anna vs Bartek"), ["Anna", "3", "Bartek", "1"]);

    // Hand-computed for W4/D2/L1 after Anna 3–1 Bartek. Unplayed players have 0 points, not the loss point.
    await expect(standings(linkHolder).getByRole("rowheader")).toHaveText(["Anna", "Bartek", "Celina", "Darek"]);
    await expectStanding(linkHolder, "Anna", ["1", "1", "1", "0", "0", "3", "1", "+2", "4"]);
    await expectStanding(linkHolder, "Bartek", ["2", "1", "0", "0", "1", "1", "3", "-2", "1"]);
    await expectStanding(linkHolder, "Celina", ["3", "0", "0", "0", "0", "0", "0", "0", "0"]);
    await expectStanding(linkHolder, "Darek", ["3", "0", "0", "0", "0", "0", "0", "0", "0"]);
    // The scored match no longer offers a form to the link holder.
    await expect(fixture(linkHolder, "Anna vs Bartek")).toHaveCount(0);

    // --- Risk #1 cross-check: the stale tab still shows the form; its submit must not overwrite.
    await enterScore(fixture(staleTab, "Anna vs Bartek"), ["Anna", "0", "Bartek", "5"]);
    await expect(staleTab.getByRole("status")).toHaveText(/A score was already entered for that match/);
    await expectStanding(staleTab, "Anna", ["1", "1", "1", "0", "0", "3", "1", "+2", "4"]);
    await expectStanding(staleTab, "Bartek", ["2", "1", "0", "0", "1", "1", "3", "-2", "1"]);

    // --- The organizer corrects the score to 1–2 (Bartek now wins).
    await page.goto(leaguePath);
    await enterScore(fixture(page, "Anna vs Bartek"), ["Anna", "1", "Bartek", "2"]);
    await expect(page.getByRole("status")).toHaveText("Score updated.");

    // --- The next anonymous view reflects the correction (no stale standings).
    await linkHolder.goto(sharePath);
    await expect(standings(linkHolder).getByRole("rowheader")).toHaveText(["Bartek", "Anna", "Celina", "Darek"]);
    await expectStanding(linkHolder, "Bartek", ["1", "1", "1", "0", "0", "2", "1", "+1", "4"]);
    await expectStanding(linkHolder, "Anna", ["2", "1", "0", "0", "1", "1", "2", "-1", "1"]);
    await expectStanding(linkHolder, "Celina", ["3", "0", "0", "0", "0", "0", "0", "0", "0"]);
    await expectStanding(linkHolder, "Darek", ["3", "0", "0", "0", "0", "0", "0", "0", "0"]);

    // --- Deleting through the UI is asserted: the league is gone and its link stops working.
    // (A failure above never reaches this line; the cleanup fixture deletes the league then.)
    await page.goto(`${leaguePath}/delete`);
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForURL("**/dashboard");
    cleanup.done(leaguePath);
    await linkHolder.goto(sharePath);
    await expect(linkHolder.getByRole("heading", { name: "League not found" })).toBeVisible();
  } finally {
    await anonymous.close();
  }
});
