import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "./global-setup";
import { expectAccessible } from "./support/a11y";
import { e2eDb } from "./support/db";

test.use({ storageState: STORAGE_STATE });

test.describe.serial("Spaces", () => {
  // Leave the shared e2e account as we found it for the next project's run.
  test.afterAll(async () => {
    const { sql, userId } = e2eDb();
    await sql`delete from people where user_id = ${userId} and name in ('Kemi Adebayo', 'Seun Bello')`;
    await sql.end();
  });

  test("adding a Space and editing its reminder and pipeline", async ({ page }, info) => {
    const name = `Alumni ${info.project.name}`;
    await page.goto("/settings");
    await page.getByRole("link", { name: "Add a Space" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel(/^Other/).check();
    await page.getByRole("button", { name: "Create Space" }).click();

    // Creating saves, then redirects to the new Space's page; allow for a slow CI runner.
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible({ timeout: 15_000 });
    // Only Work Spaces can use full research.
    await expect(page.getByLabel(/^Get to know/)).toBeChecked();
    await expect(page.getByLabel(/^Full research/)).toHaveCount(0);
    await expectAccessible(page);

    await page.getByLabel("Default reminder").selectOption({ label: "Every 2 months" });
    await page.getByLabel("Stage 2 name").fill("Met at a reunion");
    await page.getByRole("button", { name: "Add a stage" }).click();
    await page.getByLabel("Stage 5 name").fill("Mentor");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Default reminder")).toHaveValue("60");
    await expect(page.getByLabel("Stage 2 name")).toHaveValue("Met at a reunion");
    await expect(page.getByLabel("Stage 5 name")).toHaveValue("Mentor");
  });

  test("forms explain what's wrong", async ({ page }, info) => {
    await page.goto("/settings/spaces/new");
    await page.getByLabel("Name").fill(`alumni ${info.project.name}`);
    await page.getByRole("button", { name: "Create Space" }).click();
    await expect(page.getByText("You already have a Space with that name.")).toBeVisible();
  });

  test("Work offers full research", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: /^Work/ }).click();
    await expect(page.getByLabel(/^Full research/)).toBeChecked();
  });

  test("the Space switcher appears once two Spaces have people, and filters lists", async ({ page, isMobile }) => {
    const { sql, userId } = e2eDb();
    try {
      const switcher = page.getByRole("button", { name: /^Space: / });
      await page.goto("/people");
      // The new account has people in at most one Space, so no switcher yet.
      const [{ n }] = await sql`select count(distinct space_id)::int as n from person_spaces where user_id = ${userId}`;
      if (n < 2) {
        await expect(switcher).toHaveCount(0);
        const spaces = await sql`select id, kind from spaces where user_id = ${userId}`;
        const id = (k: string) => spaces.find((s) => s.kind === k)!.id;
        const [kemi] = await sql`insert into people (user_id, name, company) values (${userId}, 'Kemi Adebayo', 'Paystack') returning id`;
        const [seun] = await sql`insert into people (user_id, name) values (${userId}, 'Seun Bello') returning id`;
        await sql`insert into person_spaces (user_id, person_id, space_id) values
          (${userId}, ${kemi.id}, ${id("work")}), (${userId}, ${kemi.id}, ${id("personal")}), (${userId}, ${seun.id}, ${id("personal")})`;
        await page.reload();
      }

      const visible = switcher.locator("visible=true");
      await expect(visible).toHaveText("All spaces");
      await expect(page.getByText("Kemi Adebayo")).toBeVisible();
      await expect(page.getByText("Seun Bello")).toBeVisible();

      await visible.click();
      await page.getByRole("menuitem", { name: "Work" }).click();
      await expect(page.getByRole("list", { name: "People in Work" })).toBeVisible();
      await expect(page.getByText("Seun Bello")).toHaveCount(0);
      await expect(page.getByText("Kemi Adebayo")).toBeVisible();
      if (!isMobile) await expectAccessible(page);

      // The choice is remembered across pages.
      await page.goto("/rooms");
      await expect(switcher.locator("visible=true")).toHaveText("Work");
      await switcher.locator("visible=true").click();
      await page.getByRole("menuitem", { name: "All spaces" }).click();
      await expect(switcher.locator("visible=true")).toHaveText("All spaces");
    } finally {
      await sql.end();
    }
  });

  test("archiving hides a Space, and empty Spaces can be deleted", async ({ page }, info) => {
    const name = `Alumni ${info.project.name}`;
    await page.goto("/settings");
    await page.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("status")).toContainText(`${name} archived.`);
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  });

  test("a Space with people in it can't be deleted", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: /^Personal/ }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete Personal" }).click();
    await expect(page.getByText(/has people, goals or rooms in it\. Archive it instead/)).toBeVisible();
  });
});
