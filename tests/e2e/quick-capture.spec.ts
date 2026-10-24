import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const sheet = (page: Page) => page.getByRole("dialog");

/** Opens the capture sheet with the + button (mobile) or the c key, retrying until the page has hydrated. */
async function openCapture(page: Page, isMobile: boolean) {
  await expect(async () => {
    if (isMobile) await page.getByRole("button", { name: "Capture" }).click();
    else {
      await page.locator("body").click();
      await page.keyboard.press("c");
    }
    await expect(sheet(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe.serial("Quick capture", () => {
  let user: { id: string; email: string };
  const ada = randomUUID();

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.quick.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Quick" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    await sql`insert into people (id, user_id, name, company) values (${ada}, ${user.id}, 'Ada Obi', 'Paystack')`;
    await sql`insert into person_spaces (user_id, person_id, space_id) values (${user.id}, ${ada}, ${work.id})`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("one line becomes a touch and promises for someone you know", async ({ page, isMobile }) => {
    await page.goto("/today");
    await openCapture(page, isMobile);
    await sheet(page).getByLabel("What happened?").fill("Met Ada, partnerships @ Paystack, wants intro to Tola, follow up tomorrow");
    await sheet(page).getByRole("button", { name: "Read it" }).click();
    const review = sheet(page).getByRole("form", { name: "Check what was read" });
    await expect(review.getByText(/Read with AI/)).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);
    await review.getByRole("radio", { name: /Ada Obi/ }).check();
    await expect(review.getByLabel("Promise 1")).toHaveValue("Intro to Tola");
    await expect(review.getByLabel("Follow up on")).not.toHaveValue("");
    await review.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { name: "Ada Obi", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Intro to Tola").first()).toBeVisible();
    await expect(page.getByText("Follow up with Ada").first()).toBeVisible();
  });

  test("someone new, from the command palette", async ({ page, isMobile }) => {
    await page.goto("/people");
    await expect(async () => {
      if (isMobile) await page.getByRole("button", { name: "Search", exact: true }).click();
      else {
        await page.locator("body").click();
        await page.keyboard.press("ControlOrMeta+k");
      }
      await expect(page.getByRole("combobox")).toBeVisible({ timeout: 1000 });
    }).toPass();
    const line = "Coffee with Kwame Mensah yesterday, I'll send the deck tomorrow";
    await page.getByRole("combobox").fill(line);
    await page.getByRole("option", { name: /^Capture “Coffee with Kwame Mensah/ }).click();
    await expect(sheet(page).getByLabel("What happened?")).toHaveValue(line);
    await sheet(page).getByRole("button", { name: "Read it" }).click();
    const review = sheet(page).getByRole("form", { name: "Check what was read" });
    await expect(review.getByLabel("Name")).toHaveValue("Kwame Mensah", { timeout: 15_000 });
    await expect(review.getByLabel("How")).toHaveValue("coffee");
    await review.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Kwame Mensah", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Send the deck").first()).toBeVisible();
  });

  test("works offline, read on the device and synced later", async ({ page, context, isMobile }) => {
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await context.setOffline(true);
    await openCapture(page, isMobile);
    await sheet(page).getByLabel("What happened?").fill("Called Bisi Akande, she'll send the contract by Monday");
    await sheet(page).getByRole("button", { name: "Read it" }).click();
    const review = sheet(page).getByRole("form", { name: "Check what was read" });
    await expect(review.getByText(/Read on this device/)).toBeVisible();
    await expect(review.getByLabel("Who owes it")).toHaveValue("them");
    await review.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved on this device. It will sync when you're back online.")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/changes? synced\./)).toBeVisible({ timeout: 15_000 });
    const { sql } = e2eDb();
    const [p] = await sql`select id from people where user_id = ${user.id} and name = 'Bisi Akande'`;
    expect(p).toBeTruthy();
    expect(await sql`select owner from commitments where person_id = ${p.id}`).toEqual([{ owner: "them" }]);
    await sql.end();
  });
});
