import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/domain/dates";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const today = todayIn("Africa/Lagos");

// Its own account per project, arranged directly in the database.
test.describe.serial("Want to meet", () => {
  let user: { id: string; email: string };
  const wunmi = randomUUID();

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.meet.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Meet" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    // Wunmi: added to meet two months ago, with a weekly reminder; there's an event you'll both be at.
    await sql`insert into people (id, user_id, name, company, position, created_at) values (${wunmi}, ${user.id}, 'Wunmi Adeyemi', 'Kestrel Ventures', 'Partner', now() - interval '60 days')`;
    await sql`insert into person_spaces (user_id, person_id, space_id, triage_state, want_to_meet, cadence_days, cadence_anchor_on) values (${user.id}, ${wunmi}, ${work.id}, 'done', true, 7, ${addDays(today, -60)})`;
    const [room] = await sql`insert into events (user_id, space_id, title, kind, starts_on, start_time, tz) values (${user.id}, ${work.id}, 'Lagos Fintech Mixer', 'mixer', ${addDays(today, 5)}, '18:00', 'Africa/Lagos') returning id`;
    await sql`insert into event_people (event_id, person_id, user_id, role) values (${room.id}, ${wunmi}, ${user.id}, 'attendee')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("their own filter, the next step on their page, and no going-cold nudge", async ({ page }, info) => {
    await page.goto("/people");
    await page.getByRole("button", { name: "Want to meet", exact: true }).click();
    await expect(page.getByRole("link", { name: /Wunmi Adeyemi/ })).toContainText("Want to meet");
    await page.screenshot({ path: info.outputPath("people-want-to-meet.png") });

    await page.goto(`/people/${wunmi}`);
    const note = page.getByRole("note", { name: "Want to meet" });
    await expect(note).toContainText("You want to meet Wunmi.");
    await expect(note.getByRole("link", { name: /^Meet Wunmi at Lagos Fintech Mixer/ })).toBeVisible();
    await expect(page.getByText("No reminders until you've met")).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: info.outputPath("person-want-to-meet.png"), fullPage: true });

    await page.goto("/today");
    await expect(page.getByText(/since you spoke with Wunmi/)).toHaveCount(0);
  });

  test("not trying any more takes them off the list", async ({ page }) => {
    await page.goto(`/people/${wunmi}`);
    await page.getByRole("button", { name: "Not trying to meet them" }).click();
    await expect(page.getByRole("note", { name: "Want to meet" })).toHaveCount(0);
    await page.goto("/people");
    await page.getByRole("button", { name: "Want to meet", exact: true }).click();
    await expect(page.getByRole("link", { name: /Wunmi Adeyemi/ })).toHaveCount(0);
  });
});
