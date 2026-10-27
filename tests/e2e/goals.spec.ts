import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "./global-setup";
import { expectAccessible } from "./support/a11y";
import { e2eDb } from "./support/db";

test.use({ storageState: STORAGE_STATE });

const tag = (p: string) => (p === "mobile" ? "M" : "D");

test.describe.serial("Goals", () => {
  test.afterAll(async () => {
    const { sql, userId } = e2eDb();
    await sql`delete from goals where user_id = ${userId} and text like 'Raise a pre-seed%'`;
    await sql`delete from people where user_id = ${userId} and name like 'Goal Investor %'`;
    await sql.end();
  });

  test("setting a goal and moving people through its pipeline", async ({ page, isMobile }, info) => {
    const goal = `Raise a pre-seed round ${tag(info.project.name)}`;
    const person = `Goal Investor ${tag(info.project.name)}`;

    await page.goto("/goals");
    await page.getByRole("link", { name: "Add a goal" }).click();
    await page.getByLabel("Goal", { exact: true }).fill(goal);
    await page.getByLabel("Space").selectOption({ label: "Work" });
    await page.getByLabel("Kind of goal").selectOption({ label: "Raise capital" });
    await page.getByLabel("Touches a week").fill("2");
    await page.getByRole("button", { name: "Add goal" }).click();

    await expect(page.getByRole("heading", { name: goal, level: 1 })).toBeVisible();
    await expect(page.getByText("0 of 2 · 2 to go")).toBeVisible();
    await expect(page.getByText(/No one on this goal yet/)).toBeVisible();
    await expectAccessible(page);

    // A new goal says what to do next.
    const start = page.getByRole("region", { name: "Start here" });
    await expect(start.getByRole("link", { name: "Open Radar" })).toBeVisible();
    await expect(start.getByRole("button", { name: "Find who fits" })).toBeVisible();

    // Someone you want to meet but haven't saved yet.
    await start.getByRole("link", { name: "Add people" }).click();
    const sheet = page.getByRole("dialog", { name: "Add people" });
    await sheet.getByLabel("Someone you want to meet").fill(person);
    await sheet.getByRole("button", { name: "Add new person" }).click();
    await expect(page.getByRole("status").filter({ hasText: `${person} added to Work and this goal.` })).toBeVisible();
    await page.keyboard.press("Escape");

    const card = page.getByRole("article", { name: new RegExp(`^${person}, `) });
    await expect(card).toHaveAccessibleName(`${person}, Identified`);
    await card.getByLabel(`Stage for ${person}`).selectOption({ label: "Met" });
    await expect(card).toHaveAccessibleName(`${person}, Met`);
    await expect(page.getByText(`${person} moved from Identified to Met`)).toBeVisible();
    await expect(page.getByText(/1 moved forward/)).toBeVisible();

    if (!isMobile) {
      // Keyboard: ] moves forward a stage, and focus follows the person.
      await card.focus();
      await page.keyboard.press("]");
      await expect(card).toHaveAccessibleName(`${person}, In conversation`);
      await expect(card).toBeFocused();
    }
    await expectAccessible(page);

    // The person's page shows the goal with its stage.
    await expect(page).not.toHaveURL(/add=1/);
    const goalUrl = page.url();
    await card.getByRole("link", { name: person }).click();
    await expect(page.getByRole("heading", { name: person, level: 1 })).toBeVisible();
    await expect(page.getByLabel(`Stage for ${person} in ${goal}`)).toHaveValue(isMobile ? "met" : "in_conversation");

    // A touch counts towards the week, and the goal shows the last weeks against its target.
    await page.getByRole("article").getByRole("button", { name: "Log a touch", exact: true }).click();
    await page.getByRole("dialog").getByLabel("What happened").fill("Coffee about the round");
    await page.getByRole("dialog").getByRole("button", { name: "Log it" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Logged with/ })).toBeVisible();
    await page.goto(goalUrl);
    const trend = page.getByRole("figure").filter({ hasText: "Last 8 weeks" });
    await expect(trend).toBeVisible();
    await expect(trend.getByRole("listitem", { name: "This week: 1 of 2" })).toBeAttached();
    await expectAccessible(page);

    await page.goto("/goals");
    const row = page.getByRole("link", { name: new RegExp(goal) });
    await expect(row).toContainText("1 person");
    await expect(row).toContainText("2 touches a week");
    await expectAccessible(page);
  });

  test("custom stages, pausing and archiving", async ({ page, isMobile }, info) => {
    const goal = `Raise a pre-seed round ${tag(info.project.name)}`;
    await page.goto("/goals");
    await page.getByRole("link", { name: new RegExp(goal) }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Its own stages").check();
    // Removing the stage someone is at is refused, with a reason.
    await page.getByRole("button", { name: `Remove ${isMobile ? "Met" : "In conversation"}` }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "1 person is at" })).toBeVisible();

    await page.getByLabel(/^Use Work's stages/).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: goal, level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Pause goal" }).click();
    await expect(page.getByText(/· Paused$/)).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Archive goal" }).click();
    await page.goto("/goals");
    await expect(page.getByRole("link", { name: new RegExp(goal) })).toHaveCount(0);
    await page.getByRole("link", { name: /Archived goals/ }).click();
    await expect(page.getByRole("link", { name: new RegExp(goal) })).toBeVisible();
  });
});
