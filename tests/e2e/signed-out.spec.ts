import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";

test.describe("signed out", () => {
  test("app pages send you to sign in, and come back after", async ({ page }) => {
    await page.goto("/people");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fpeople$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  test("the sign-in page is accessible in light and dark", async ({ page }) => {
    await page.goto("/sign-in");
    await expectAccessible(page);
  });

  test("the app can be installed", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "Inroads", display: "standalone", start_url: "/today" });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["cache-control"]).toContain("no-cache");
  });
});
