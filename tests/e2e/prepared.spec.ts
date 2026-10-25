import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/domain/dates";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const today = todayIn("Africa/Lagos");

test.describe.serial("Walk in prepared, follow up in one tap (against a fake Claude)", () => {
  let user: { id: string; email: string };
  const ids = { kemi: randomUUID(), tunde: randomUUID(), room: randomUUID() };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.prepared.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Prepared" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    // Kemi: due for a touch (monthly, last spoke 40 days ago), with a phone for WhatsApp.
    await sql`insert into people (id, user_id, name, phones, created_at) values (${ids.kemi}, ${user.id}, 'Kemi Adebayo', ${["+2348031234567"]}, now() - interval '60 days')`;
    await sql`insert into person_spaces (user_id, person_id, space_id, triage_state) values (${user.id}, ${ids.kemi}, ${work.id}, 'done')`;
    await sql`insert into interactions (user_id, person_id, space_id, occurred_on, type, summary) values (${user.id}, ${ids.kemi}, ${work.id}, ${addDays(today, -40)}, 'coffee', 'Talked about the round')`;
    // Tunde: at a room today, not researched yet.
    await sql`insert into people (id, user_id, name, company) values (${ids.tunde}, ${user.id}, 'Tunde Bakare', 'Kestrel Ventures')`;
    await sql`insert into person_spaces (user_id, person_id, space_id, triage_state) values (${user.id}, ${ids.tunde}, ${work.id}, 'done')`;
    await sql`insert into events (id, user_id, space_id, title, kind, starts_on, start_time, tz) values (${ids.room}, ${user.id}, ${work.id}, 'Fintech Founders Mixer', 'meetup', ${today}, '23:30', 'Africa/Lagos')`;
    await sql`insert into event_people (event_id, person_id, user_id, role) values (${ids.room}, ${ids.tunde}, ${user.id}, 'attendee')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("no goals yet: Today asks, and set-up's goal step brings you back to Goals", async ({ page }) => {
    await page.goto("/today");
    const ask = page.getByRole("region", { name: "Set your goals" });
    await expect(ask).toBeVisible();
    await ask.getByRole("link", { name: "Set your goals" }).click();
    await expect(page.getByRole("heading", { name: "What are you working towards?", level: 1 })).toBeVisible();
    await expect(async () => {
      await page.getByRole("button", { name: "Raise capital" }).click();
      await expect(page.getByRole("button", { name: "Raise capital" })).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass();
    await page.getByLabel("Or in your own words").fill("Meet three seed investors");
    await page.getByRole("button", { name: "Save 2 goals" }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole("link", { name: "Raise a funding round" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Meet three seed investors" })).toBeVisible();
    await page.goto("/today");
    await expect(page.getByRole("region", { name: "Set your goals" })).toHaveCount(0);
  });

  test("Today: research someone before the room, then their talking points are on the agenda", async ({ page }) => {
    await page.goto("/today");
    const agenda = page.getByRole("region", { name: "Today's rooms" });
    await expect(agenda.getByRole("link", { name: "Prepare for this room" })).toBeVisible();
    await agenda.getByRole("button", { name: "Research Tunde before you go" }).click();
    await expect(agenda.getByRole("list", { name: "Talk to Tunde about" })).toBeVisible({ timeout: 20_000 });
    await expect(agenda.getByText("Ask how Kestrel thinks about B2B payments")).toBeVisible();
    await expectAccessible(page);
  });

  test("a card that's due offers a draft, ready for WhatsApp", async ({ page }) => {
    await page.goto("/today");
    const card = page.getByRole("article").filter({ hasText: "Last spoke with Kemi Adebayo" });
    await card.getByRole("button", { name: "Draft a message" }).click();
    const sheet = page.getByRole("dialog", { name: "Message Kemi" });
    await sheet.getByRole("button", { name: "Write a draft" }).click();
    await expect(sheet.getByLabel("Message")).toHaveValue(/great to catch up/);
    await expect(sheet.getByRole("link", { name: "Open in WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/2348031234567\?text=/);
  });

  test("a person's page: paste a bio for research, or look up their world", async ({ page }) => {
    await page.goto(`/people/${ids.tunde}`);
    await page.getByText("Give Inroads more to work with").click();
    await expect(page.getByLabel("More about Tunde")).toBeVisible();
    await page.getByRole("button", { name: "Look up their world" }).click();
    await expect(page.getByRole("heading", { name: "Kestrel Ventures", level: 1 })).toBeVisible({ timeout: 20_000 });
  });
});
