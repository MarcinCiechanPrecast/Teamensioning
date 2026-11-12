// Risk #8 (a score or correction corrupts a cup bracket: draw accepted, winner in the wrong or no slot, a
// correction after the next round was played) and risk #9 (a cup is stored or shown with a wrong bracket:
// missing match, byes not on the top seeds), cross-check in the browser. context/foundation/test-plan.md §2, §3 Phase 5.
// Signal over smoke + integration: those prove the status codes and the DB rules. Neither checks the rendered
// bracket (byes, TBD), that a winner shows up in the next round for ANOTHER visitor, or that the refusal
// reaches the organizer as a readable message.
//
// Expected values worked out by hand from the PRD cup rules (entry order = seed, S = smallest power of two >= N,
// the top S - N seeds get a bye):
//   N = 5 -> S = 8, byes = 3 for seeds 1..3 (Ann, Bob, Cid), N - 1 = 4 matches.
//   Round 1: seed 4 vs seed 5 (Dan vs Eve). Round 2: Ann vs winner(Dan/Eve), Bob vs Cid. Round 3: the final.
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForHydration } from "./support/hydration";

// A run id keeps names unique per run; the seed order is the entry order.
const RUN = randomUUID().slice(0, 8);
const [ANN, BOB, CID, DAN, EVE] = ["Ann", "Bob", "Cid", "Dan", "Eve"].map((name) => `${name} ${RUN}`);

function round(page: Page, number: number): Locator {
  return page.getByRole("list", { name: `Round ${number}`, exact: true });
}

function match(page: Page, roundNumber: number, label: string): Locator {
  return round(page, roundNumber).getByRole("listitem").filter({ hasText: label });
}

async function enterScore(row: Locator, scores: [string, string, string, string]): Promise<void> {
  const [playerA, scoreA, playerB, scoreB] = scores;
  await row.getByLabel(`Score of ${playerA}`, { exact: true }).fill(scoreA);
  await row.getByLabel(`Score of ${playerB}`, { exact: true }).fill(scoreB);
  await row.getByRole("button", { name: "Save" }).click();
}

test("cup: a link holder's winner advances, and a correction is refused once the next round was played", async ({
  page,
  browser,
  baseURL,
}) => {
  const cupName = `E2E Cup ${RUN}`;

  // --- Organizer creates a 5-player cup (signed in through the setup project's storageState).
  await page.goto("/leagues/new");
  await waitForHydration(page);
  await page.getByRole("radio", { name: "Cup", exact: true }).check();
  await page.getByLabel("Cup name").fill(cupName);
  // The form starts with 3 player rows.
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("button", { name: "Add player" }).click();
  for (const [index, name] of [ANN, BOB, CID, DAN, EVE].entries()) {
    await page.getByLabel(`Player ${index + 1}`, { exact: true }).fill(name);
  }
  await page.getByRole("button", { name: "Create cup" }).click();

  await expect(page.getByRole("heading", { name: cupName })).toBeVisible();
  const cupPath = new URL(page.url()).pathname;
  // N - 1 = 4 matches: one in round 1, two in round 2, the final.
  await expect(page.getByText("4 matches")).toBeVisible();
  const sharePath = new URL(await page.getByLabel("Share link").inputValue()).pathname;
  expect(sharePath).toMatch(/^\/t\/[0-9a-f]{64}$/);

  // Round 1 is only Dan vs Eve; Ann, Bob and Cid have byes into round 2 and the final is open.
  await expect(round(page, 1).getByRole("listitem")).toHaveCount(1);
  await expect(match(page, 1, `${DAN} vs ${EVE}`)).toHaveCount(1);
  await expect(round(page, 2).getByRole("listitem")).toHaveCount(2);
  await expect(match(page, 2, `${ANN} vs TBD`)).toContainText(`Bye: ${ANN}`);
  await expect(match(page, 2, `${BOB} vs ${CID}`)).toContainText(`Bye: ${BOB}`);
  await expect(match(page, 2, `${BOB} vs ${CID}`)).toContainText(`Bye: ${CID}`);
  await expect(match(page, 3, "TBD vs TBD")).toHaveCount(1);

  // --- A link holder with no session opens the share link.
  const anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const linkHolder = await anonymous.newPage();
    await linkHolder.goto(sharePath);
    await expect(linkHolder.getByRole("heading", { name: cupName })).toBeVisible();
    await expect(match(linkHolder, 2, `${ANN} vs TBD`)).toHaveCount(1);
    // Only Dan vs Eve can be scored now; round-2 slots are still open, so they offer no form.
    await expect(match(linkHolder, 1, `${DAN} vs ${EVE}`).getByRole("button", { name: "Save" })).toBeVisible();
    await expect(match(linkHolder, 2, `${ANN} vs TBD`).getByRole("button", { name: "Save" })).toHaveCount(0);

    // --- A draw is refused with a clear message and nothing is stored.
    await enterScore(match(linkHolder, 1, `${DAN} vs ${EVE}`), [DAN, "1", EVE, "1"]);
    await expect(linkHolder.getByRole("alert")).toHaveText("A cup match cannot end in a draw. Enter a winner.");
    await expect(match(linkHolder, 1, `${DAN} vs ${EVE}`).getByRole("button", { name: "Save" })).toBeVisible();
    await expect(linkHolder.getByText("Result")).toHaveCount(0);
    await expect(match(linkHolder, 2, `${ANN} vs TBD`)).toHaveCount(1);

    // --- Dan 2-1 Eve: Dan advances into the open slot of Ann's round-2 match.
    await enterScore(match(linkHolder, 1, `${DAN} vs ${EVE}`), [DAN, "2", EVE, "1"]);
    await expect(match(linkHolder, 1, `${DAN} vs ${EVE}`)).toContainText("Result 2–1");
    await expect(match(linkHolder, 2, `${ANN} vs ${DAN}`)).toHaveCount(1);

    // The organizer sees the same bracket, and the draw stored nothing: round 1 holds the 2-1 result only.
    await page.goto(cupPath);
    await expect(match(page, 2, `${ANN} vs ${DAN}`)).toHaveCount(1);
    await expect(match(page, 2, `${ANN} vs TBD`)).toHaveCount(0);
    const roundOne = match(page, 1, `${DAN} vs ${EVE}`);
    await expect(roundOne.getByLabel(`Score of ${DAN}`, { exact: true })).toHaveValue("2");
    await expect(roundOne.getByLabel(`Score of ${EVE}`, { exact: true })).toHaveValue("1");

    // --- The organizer flips the winner (Dan 1-2 Eve) before round 2 is played: accepted, Eve takes the slot.
    await enterScore(roundOne, [DAN, "1", EVE, "2"]);
    await expect(page.getByRole("status")).toHaveText("Score updated.");
    await expect(match(page, 2, `${ANN} vs ${EVE}`)).toHaveCount(1);
    await expect(match(page, 2, `${ANN} vs ${DAN}`)).toHaveCount(0);

    // --- The link holder plays that semifinal (Ann 0-2 Eve); Eve moves on to the final.
    await linkHolder.goto(sharePath);
    await expect(match(linkHolder, 2, `${ANN} vs ${EVE}`)).toHaveCount(1);
    await enterScore(match(linkHolder, 2, `${ANN} vs ${EVE}`), [ANN, "0", EVE, "2"]);
    await expect(match(linkHolder, 2, `${ANN} vs ${EVE}`)).toContainText("Result 0–2");
    await expect(match(linkHolder, 3, `${EVE} vs TBD`)).toHaveCount(1);

    // --- Flipping round 1 back (Dan 2-1 Eve) would change a winner who already played: refused, nothing changes.
    await page.goto(cupPath);
    await enterScore(match(page, 1, `${DAN} vs ${EVE}`), [DAN, "2", EVE, "1"]);
    await expect(page.getByRole("alert")).toHaveText(
      "The next round has already been played, so this score can no longer be changed.",
    );
    const keptRoundOne = match(page, 1, `${DAN} vs ${EVE}`);
    await expect(keptRoundOne.getByLabel(`Score of ${DAN}`, { exact: true })).toHaveValue("1");
    await expect(keptRoundOne.getByLabel(`Score of ${EVE}`, { exact: true })).toHaveValue("2");
    await expect(match(page, 2, `${ANN} vs ${EVE}`)).toHaveCount(1);
    await expect(match(page, 3, `${EVE} vs TBD`)).toHaveCount(1);

    // --- Cleanup through the UI, asserted: the cup is gone and its link stops working.
    await page.goto(`${cupPath}/delete`);
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForURL("**/dashboard");
    await linkHolder.goto(sharePath);
    await expect(linkHolder.getByRole("heading", { name: "League not found" })).toBeVisible();
  } finally {
    await anonymous.close();
  }
});
