import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/domain/dates";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe.serial("After the room", () => {
  let user: { id: string; email: string };
  const mixer = randomUUID();
  const demo = randomUUID();
  const ada = randomUUID();
  const today = todayIn("Africa/Lagos");

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.after.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada After" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    await sql`insert into people (id, user_id, name, company) values (${ada}, ${user.id}, 'Ada Obi', 'Paystack')`;
    await sql`insert into person_spaces (user_id, person_id, space_id) values (${user.id}, ${ada}, ${work.id})`;
    await sql`insert into events (id, user_id, space_id, title, kind, starts_on, start_time, tz) values (${mixer}, ${user.id}, ${work.id}, 'Ikoyi Founders Mixer', 'mixer', ${addDays(today, -1)}, '18:00', 'Africa/Lagos')`;
    await sql`insert into events (id, user_id, space_id, title, kind, starts_on, tz) values (${demo}, ${user.id}, ${work.id}, 'Demo Day', 'conference', ${addDays(today, -2)}, 'Africa/Lagos')`;
    await sql`insert into event_people (event_id, person_id, user_id, role) values (${mixer}, ${ada}, ${user.id}, 'attendee')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("confirm who you met; follow-ups are lined up", async ({ page }) => {
    await page.goto("/today");
    const card = page.getByRole("article").filter({ hasText: "Who did you meet at Ikoyi Founders Mixer?" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Who I met" }).click();
    await expect(page.getByRole("heading", { name: "Who did you meet at Ikoyi Founders Mixer?", level: 1 })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("checkbox", { name: /Ada Obi/ }).check();
    await page.getByLabel("What you talked about with Ada").fill("Pricing for schools");
    await expect(page.getByRole("form", { name: "Add someone new" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add someone new" }).click();
    const add = page.getByRole("form", { name: "Add someone new" });
    await add.getByLabel("Name").fill("Tola Adeyemi");
    await add.getByLabel("Company").fill("Kuda");
    await add.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("checkbox", { name: /Tola Adeyemi/ })).toBeChecked();
    await page.getByText("In 2 days", { exact: true }).click();
    await page.getByRole("button", { name: "Save 2 people" }).click();

    await expect(page.getByRole("status").filter({ hasText: "2 people from Ikoyi Founders Mixer saved. Follow-ups are on Today in 2 days." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ikoyi Founders Mixer", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tola Adeyemi" })).toBeVisible();

    await page.goto("/today");
    await expect(page.getByText("Who did you meet at Ikoyi Founders Mixer?")).toHaveCount(0);
    const { sql } = e2eDb();
    const follow = await sql`select c.text, c.due_on::text as due from commitments c join people p on p.id = c.person_id where c.user_id = ${user.id} order by p.name`;
    expect(follow).toEqual([
      { text: "Follow up with Ada (met at Ikoyi Founders Mixer)", due: addDays(today, 2) },
      { text: "Follow up with Tola (met at Ikoyi Founders Mixer)", due: addDays(today, 2) },
    ]);
    await sql.end();
  });

  test("“I didn't go” clears the card", async ({ page }) => {
    await page.goto("/today");
    const card = page.getByRole("article").filter({ hasText: "Who did you meet at Demo Day?" });
    await card.getByRole("button", { name: "Who I met" }).click();
    await expect(page.getByText("No one is linked to this room yet.")).toBeVisible();
    await page.getByRole("button", { name: "I didn't go" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Noted that you didn't go." })).toBeVisible();
    // Role queries skip the debrief page Next keeps mounted (hidden) after navigating away.
    await expect(page.getByRole("article").filter({ hasText: "Who did you meet at Demo Day?" })).toHaveCount(0);
  });
});
