import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe("Network map", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.map.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Map" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    for (const [name, daysAgo] of [
      ["Kemi Adebayo", 2],
      ["Kofi Mensah", 120],
      ["Tola Ade", null],
    ] as const) {
      const [row] = await sql`insert into people (user_id, name) values (${user.id}, ${name}) returning id`;
      await sql`insert into person_spaces (user_id, person_id, space_id) values (${user.id}, ${row.id}, ${work.id})`;
      if (daysAgo != null) {
        await sql`insert into interactions (user_id, person_id, space_id, occurred_on, type) values (${user.id}, ${row.id}, ${work.id}, current_date - ${daysAgo}::int, 'call')`;
        await sql`update people set last_touched_on = current_date - ${daysAgo}::int where id = ${row.id}`;
      }
    }
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("shows your people around you, closest first, and opens them", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("link", { name: "See your network map" }).click();
    await expect(page.getByRole("heading", { name: "Network map", level: 1 })).toBeVisible();
    // People you've been in touch with (or who are on a goal or connected) are on the map; the rest are counted.
    await expect(page.getByRole("group", { name: "Network map, 2 people" })).toBeVisible();
    await expect(page.getByText("1 more person isn't on the map: no contact logged, no goal and no connection yet.")).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();
    await expectAccessible(page);

    // The same people as a list, for keyboards and screen readers.
    await page.getByText("See them as a list").click();
    const list = page.getByRole("list", { name: "People on the map" });
    await expect(list.getByRole("link", { name: /^Kemi Adebayo: good \(\d+\/100\)$/ })).toBeVisible();
    await expect(list.getByRole("link", { name: /^Kofi Mensah: weak \(\d+\/100\)$/ })).toBeVisible();
    await list.getByRole("link", { name: /^Kemi Adebayo/ }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Kemi Adebayo", level: 1 })).toBeVisible();
  });
});
