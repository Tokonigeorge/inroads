import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/domain/dates";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const today = todayIn("Africa/Lagos");

test.describe.serial("Always a next step (against a fake Claude)", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.next.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Next" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    await sql`insert into goals (user_id, space_id, text, type) values (${user.id}, ${work.id}, 'Raise a pre-seed round', 'capital')`;
    await sql`insert into events (user_id, space_id, title, kind, starts_on, start_time, tz) values (${user.id}, ${work.id}, 'Founders Breakfast', 'meetup', ${addDays(today, 3)}, '08:00', 'Africa/Lagos')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("Today lists the week's rooms with where each plan stands", async ({ page }) => {
    await page.goto("/today");
    const week = page.getByRole("region", { name: "Coming up this week" });
    await expect(week.getByRole("link", { name: /Founders Breakfast/ })).toContainText("Prepare for this room");
    await expect(page.getByText("Nothing on today. Your next rooms are below")).toBeVisible();
    await expectAccessible(page);
  });

  test("five tabs, as in the prototype: Today, People, Discover, Events, Goals", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    for (const name of ["Today", "People", "Discover", "Events", "Goals"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Discover" }).click();
    await expect(page.getByRole("heading", { name: "Know the room before you walk in", level: 1 })).toBeVisible();
  });

  test("look up an event: what to do next, add everyone, then add it as a room", async ({ page }) => {
    await page.goto("/rooms");
    await page.getByRole("link", { name: "Look something up" }).click();
    await expect(async () => {
      await page.getByRole("group", { name: "What is it" }).getByText("Event", { exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Moonshot");
      await expect(page.getByRole("radio", { name: "Event" })).toBeChecked({ timeout: 1000 });
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Moonshot", { timeout: 1000 });
    }).toPass();
    await page.getByRole("button", { name: "Look it up" }).click();
    await expect(page.getByRole("heading", { name: "Moonshot by TechCabal", level: 1 })).toBeVisible({ timeout: 20_000 });

    const next = page.getByRole("region", { name: "What to do next" });
    await expect(next.getByText("(0 of 2)")).toBeVisible();
    await page.getByRole("button", { name: "Add all 2" }).click();
    await expect(page.getByRole("link", { name: "In your people" })).toHaveCount(2);
    await expect(next.getByText("(0 of 2)")).toHaveCount(0);
    await expectAccessible(page);

    await page.getByRole("region", { name: "Going?" }).getByRole("link", { name: "Add as a room" }).click();
    await expect(page).toHaveURL(/\/rooms\/new\?prep=/);
    await expect(page.getByRole("heading", { name: "Add a room", level: 1 })).toBeVisible();
    // (The look-up page stays mounted but hidden, so match visible fields by role.)
    await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Moonshot by TechCabal");
    await expect(page.getByRole("textbox", { name: "Date" })).toHaveValue(addDays(today, 10));
    await expect(page.getByRole("textbox", { name: "Where" })).toHaveValue("Landmark Centre, Lagos");
    await page.getByRole("button", { name: "Add room" }).click();
    await expect(page.getByRole("heading", { name: "Moonshot by TechCabal", level: 1 })).toBeVisible();
    // The look-up became the room's plan, with what was kept.
    await expect(page.getByRole("region", { name: "Your plan" }).getByRole("link", { name: "In your people" }).first()).toBeVisible();
  });
});
