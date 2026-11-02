import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/domain/dates";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const today = todayIn("Africa/Lagos");

// Its own account per project, arranged directly in the database.
test.describe.serial("I'm going", () => {
  let user: { id: string; email: string };
  let room: string;

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.going.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Going" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    // Saved from a suggestion, not going yet, in three days.
    [{ id: room }] = await sql`insert into events (user_id, space_id, title, kind, starts_on, start_time, tz, going) values (${user.id}, ${work.id}, 'ArtX Lagos', 'conference', ${addDays(today, 3)}, '10:00', 'Africa/Lagos', false) returning id`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("Today asks, and the event page says yes", async ({ page }, info) => {
    await page.goto("/today");
    const card = page.getByRole("article", { name: "Going to ArtX Lagos?" });
    await expect(card.getByRole("button", { name: "I'm going" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("today-going.png") });

    await page.goto(`/rooms/${room}`);
    await expect(page.getByText(/Saved, not going yet/)).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: info.outputPath("room-not-going.png") });
    await page.getByRole("button", { name: "I'm going" }).click();
    await expect(page.getByRole("button", { name: "✓ Going" })).toBeVisible();
    await expect(page.getByText(/Saved, not going yet/)).toHaveCount(0);

    await page.goto("/today");
    await expect(page.getByRole("article", { name: "Going to ArtX Lagos?" })).toHaveCount(0);
  });
});
