import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE } from "./global-setup";
import { expectAccessible } from "./support/a11y";
import { e2eDb } from "./support/db";

test.use({ storageState: STORAGE_STATE });

const sheet = (page: Page) => page.getByRole("dialog");

test.describe.serial("People", () => {
  let name: string;
  test.beforeAll(({}, info) => {
    name = `Ada Obi ${info.project.name}`;
  });
  test.afterAll(async () => {
    const { sql, userId } = e2eDb();
    await sql`delete from people where user_id = ${userId} and (name like '% desktop' or name like '% mobile')`;
    await sql.end();
  });

  test("adding a person with everything you know", async ({ page }) => {
    await page.goto("/people/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Role").fill("Head of partnerships");
    await page.getByLabel("Company").fill("Paystack");
    await page.getByLabel("Phone 1").fill("0803 123 4567");
    await page.getByLabel("Email 1").fill("ADA@Paystack.example");
    await page.getByLabel("Where you met").fill("Lagos Startup Week");
    await page.getByLabel("Tags").fill("Fintech, Partner");
    await page.getByRole("button", { name: "Add person" }).click();

    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByText("Head of partnerships at Paystack")).toBeVisible();
    await expect(page.getByRole("link", { name: "+234 803 123 4567" })).toBeVisible();
    await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/2348031234567");
    await expect(page.getByRole("link", { name: "ada@paystack.example" })).toBeVisible();
    await expect(page.getByText("#fintech #partner")).toBeVisible();
    await expectAccessible(page);
  });

  test("bad details are explained, not saved", async ({ page }) => {
    await page.goto("/people/new");
    await page.getByLabel("Name", { exact: true }).fill("Wrong Number");
    await page.getByLabel("Phone 1").fill("12");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText(`"12" doesn't look like a phone number.`)).toBeVisible();
  });

  test("finding people with search and filters", async ({ page, isMobile }) => {
    await page.goto("/people");
    await page.getByRole("searchbox", { name: "Search people" }).fill("partnerships");
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search people" }).fill("803123");
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search people" }).fill("");
    await page.getByLabel("Show").selectOption({ label: "No touches yet" });
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    if (!isMobile) {
      // Keyboard: / focuses search.
      await page.locator("body").click();
      await page.keyboard.press("/");
      await expect(page.getByRole("searchbox", { name: "Search people" })).toBeFocused();
    }
  });

  test("logging a touch with a promise, then keeping it", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("searchbox", { name: "Search people" }).fill(name);
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.getByRole("article").getByRole("button", { name: "Log a touch" }).click();

    const dialog = sheet(page);
    await dialog.getByText("Call", { exact: true }).click();
    await dialog.getByLabel("What happened").fill("Talked about the partnership pilot");
    await dialog.getByLabel("Someone promised something").check();
    await dialog.getByLabel("What was promised").fill("Send the pilot deck");
    await dialog.getByRole("button", { name: "Log it" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Logged with Ada/ })).toBeVisible();

    await expect(page.getByText("Talked about the partnership pilot")).toBeVisible();
    await expect(page.getByText("Last spoke today")).toBeVisible();
    const owe = page.getByText("Send the pilot deck");
    await expect(owe).toBeVisible();
    await page.getByRole("checkbox", { name: 'Mark "Send the pilot deck" as done' }).check();
    await expect(page.getByText("1 done")).toBeVisible();
  });

  test("quick capture from anywhere", async ({ page, isMobile }) => {
    await page.goto("/today");
    // Retry the first tap: on a slow device it can land before the page is interactive.
    await expect(async () => {
      if (isMobile) await page.getByRole("button", { name: "Capture" }).click();
      else {
        await page.locator("body").click();
        await page.keyboard.press("c");
      }
      await expect(sheet(page)).toBeVisible({ timeout: 1000 });
    }).toPass();
    await sheet(page).getByRole("button", { name: "Add a person" }).click();
    await sheet(page).getByLabel("Name").fill(`Tobi Quick ${isMobile ? "mobile" : "desktop"}`);
    await sheet(page).getByLabel("Phone or email").fill("+44 20 7946 0958");
    await sheet(page).getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("heading", { name: /Tobi Quick/, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "+44 20 7946 0958" })).toBeVisible();
  });

  test("being in two Spaces, then leaving one", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("searchbox", { name: "Search people" }).fill(name);
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Add to another Space" }).click();
    await page.getByLabel("Space").selectOption({ label: "Personal" });
    await page.getByLabel("Notes").fill("Goes to the same church");
    await page.getByRole("button", { name: "Add to Space" }).click();

    await expect(page.getByRole("heading", { name: "Personal", level: 2, exact: true })).toBeVisible();
    await expect(page.getByText("Goes to the same church")).toBeVisible();
    await page.getByRole("button", { name: "Remove from Personal" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("Goes to the same church")).toHaveCount(0);
  });

  test("archive and delete can both be undone", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("searchbox", { name: "Search people" }).fill(name);
    await page.getByRole("link", { name: new RegExp(name) }).click();
    const url = page.url();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(page.getByRole("article").getByText("Archived", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("article").getByText("Archived", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/people$/);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  });

  test("capture works offline and syncs when the connection returns", async ({ page, context }) => {
    await page.goto("/people");
    await page.getByRole("searchbox", { name: "Search people" }).fill(name);
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("article").getByRole("button", { name: "Log a touch" }).click();
    await sheet(page).getByText("Message", { exact: true }).click();
    await sheet(page).getByLabel("What happened").fill("Sent a voice note from the bus");
    await sheet(page).getByRole("button", { name: "Log it" }).click();
    await expect(page.getByText("Saved on this device. It will sync when you're back online.")).toBeVisible();
    await expect(page.getByText("1 change saved on this device, waiting to sync")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText("1 change synced.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Sent a voice note from the bus")).toBeVisible();
  });
});
