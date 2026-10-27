import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "./global-setup";
import { expectAccessible } from "./support/a11y";

test.use({ storageState: STORAGE_STATE });

test.describe.serial("signed in", () => {
  test("Today greets the new account and points to example data", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Ada$/, level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Get started" }).getByRole("link", { name: "Load examples" })).toBeVisible();
    await expectAccessible(page);
  });

  test("a new account has the three built-in Spaces", async ({ page }) => {
    await page.goto("/settings");
    for (const name of ["Work", "Personal", "Dating"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText("Work · 0 people · Every month · Full research")).toBeVisible();
    await expectAccessible(page);
  });

  test("loading and removing the example network", async ({ page }) => {
    await page.goto("/goals");
    await page.getByRole("button", { name: "Load examples" }).click();
    await expect(page.getByRole("status")).toContainText("Example network loaded.");
    await expect(page.getByRole("button", { name: "Remove examples" })).toBeVisible();

    await page.goto("/people");
    await expect(page.getByText("Adaeze Okafor")).toBeVisible();
    await expect(page.getByText("Partner · Kestrel Ventures")).toBeVisible();
    await expectAccessible(page);

    await page.goto("/rooms");
    await expect(page.getByText("Founders Breakfast").first()).toBeVisible();
    await page.goto("/goals");
    await expect(page.getByText("Raise a $500k pre-seed round")).toBeVisible();

    await page.goto("/goals");
    await page.getByRole("button", { name: "Remove examples" }).click();
    await expect(page.getByRole("button", { name: "Load examples" })).toBeVisible();
    await page.goto("/people");
    await expect(page.getByText("No one here yet.")).toBeVisible();
  });

  test("navigation fits the device", async ({ page, isMobile }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Main" });
    if (isMobile) {
      await nav.getByRole("link", { name: "People" }).click();
      await expect(page).toHaveURL(/\/people$/);
      await page.getByRole("button", { name: "Capture" }).click();
      await expect(page.getByRole("dialog", { name: "Capture" })).toBeVisible();
      await expectAccessible(page);
    } else {
      await page.getByRole("banner").getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/settings$/);
      // Settings belongs to the Goals tab, as in the prototype.
      await expect(nav.getByRole("link", { name: "Goals" })).toHaveAttribute("aria-current", "page");
    }
  });

  test("signing out ends the session", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
