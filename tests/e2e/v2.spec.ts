import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

// Inroads 2, step 1: the new frame at /v2, reached from Settings, on the same data.
test.describe.serial("Inroads 2", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.v2.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Azeez Ileyemi" })}::text::jsonb)`;
    await sql`update profiles set name = 'Azeez Ileyemi', onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    const [p] = await sql`insert into people (user_id, name) values (${user.id}, 'Tunde Bakare') returning id`;
    await sql`insert into person_spaces (user_id, person_id, space_id, triage_state) values (${user.id}, ${p.id}, ${work.id}, 'done')`;
    await sql`insert into commitments (user_id, person_id, space_id, text, owner, due_on) values (${user.id}, ${p.id}, ${work.id}, 'Send the pricing deck', 'me', current_date)`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("Settings opens Inroads 2: greeting, what needs you, and the way back", async ({ page }, info) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Try Inroads 2" }).click();
    await expect(page).toHaveURL(/\/v2$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/(Morning|Afternoon|Evening),\s*Azeez\./);
    await expect(page.getByRole("link", { name: /^\d+ things? needs? you today/ })).toHaveAttribute("href", "/today");
    await expect(page.getByRole("navigation", { name: "Inroads 2" }).getByRole("link", { name: "Brief" })).toHaveAttribute("aria-current", "page");
    await expectAccessible(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({ path: info.outputPath("v2-brief.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: info.outputPath("v2-brief-dark.png") });
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByRole("link", { name: "Back to the current app" }).click();
    await expect(page).toHaveURL(/\/today$/);
  });

  test("tabs not moved yet say so and link to the same place in the current app", async ({ page }) => {
    await page.goto("/v2");
    await page.getByRole("navigation", { name: "Inroads 2" }).getByRole("link", { name: "Inbox" }).click();
    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Today in the current app" })).toHaveAttribute("href", "/today");
    await expectAccessible(page);
    // Unknown sections are not found (streamed, so the status stays 200; the page says so).
    await page.goto("/v2/nope");
    await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  });

  test("the one input hands what you typed to quick capture", async ({ page }) => {
    await page.goto("/v2");
    const input = page.getByLabel("Tell Inroads what happened");
    await input.fill("Met Ada from Paystack at the mixer");
    await input.press("Enter");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("textbox").first()).toHaveValue("Met Ada from Paystack at the mixer");
  });
});
