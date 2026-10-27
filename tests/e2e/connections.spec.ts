import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

// Each project gets its own account, so the imported people don't mix with other specs.
test.describe.serial("Connecting Google", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.connect.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Connect" })}::text::jsonb)`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("first run, as in the prototype: set your profile and goals, connect Google, watch the sync, sort people", async ({ page }) => {
    await page.goto("/today");
    const start = page.getByRole("region", { name: "Get started" });
    await expect(start.getByRole("heading", { name: "Start with the people you already know" })).toBeVisible();
    await expectAccessible(page);

    // "Set goals" opens the prototype's Profile & goals sheet.
    await start.getByRole("link", { name: "Set goals" }).click();
    const sheet = page.getByRole("dialog", { name: "Profile & goals" });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Your name").fill("Ada Connect");
    await sheet.getByLabel("Headline").fill("Founder, Lagos fintech");
    await sheet.getByLabel("Your email addresses").fill("ada.google@example.test");
    await sheet.getByRole("textbox", { name: "Goal", exact: true }).fill("Raise a pre-seed round");
    await sheet.getByLabel("Goal type").selectOption("capital");
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved. Here's your new goal." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Raise a pre-seed round", level: 1 })).toBeVisible();
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Ada Connect", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Raise a pre-seed round/ })).toBeVisible();

    await page.goto("/today");
    await page.getByRole("region", { name: "Get started" }).getByRole("link", { name: "Import from Google" }).click();
    await page.getByRole("link", { name: "Connect Google" }).click();

    // The fake Google approves straight away and sends us back; the first sync starts.
    await expect(page.getByText("Sync finished")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/3 new people/)).toBeVisible();
    await expect(page.getByText("ada.google@example.test")).toBeVisible();
    // A finished sync leaves the address, so a reload doesn't bring the card back.
    await expect(page).not.toHaveURL(/[?&]job=/);
    await page.getByRole("link", { name: "Sort new people" }).click();
    await expect(page.getByRole("heading", { name: "Sort new people", level: 1 })).toBeVisible();
    await page.goBack();
    await page.reload();
    await expect(page.getByText("ada.google@example.test")).toBeVisible();
    await expect(page.getByText("Sync finished")).toBeHidden();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Sort new people", level: 1 })).toBeVisible();

    // One at a time first: Ifeoma (three meetings in the calendar) is suggested as priority.
    const card = page.locator("article");
    await expect(card.getByText("Ifeoma Nwosu")).toBeVisible();
    await expectAccessible(page);
    await expect(card.getByText("Suggested: Priority.")).toBeVisible();
    await card.getByRole("button", { name: "Priority" }).click();
    await expect(card.getByText("Ifeoma Nwosu")).toHaveCount(0);

    // Then accept the rest as suggested.
    await page.getByRole("button", { name: /^Use suggested sort for/ }).click();
    await expect(page.getByText("Everyone is sorted.")).toBeVisible();
  });

  test("the connection shows in Settings and imports can be undone", async ({ page }) => {
    await page.goto("/settings/connections");
    await expect(page.getByText("ada.google@example.test")).toBeVisible();
    await expect(page.getByText(/Synced today/)).toBeVisible();

    await page.getByRole("button", { name: "Undo…" }).first().click();
    await page.getByRole("button", { name: "Undo import" }).click();
    await expect(page.getByText(/^Undone/).first()).toBeVisible();

    await page.getByRole("button", { name: "Disconnect…" }).click();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.getByText("ada.google@example.test")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Connect Google" })).toBeVisible();
  });
});
