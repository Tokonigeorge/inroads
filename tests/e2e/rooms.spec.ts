import { expect, test, type Page } from "@playwright/test";
import { addDays, formatLongDate, todayIn, weekday } from "../../src/domain/dates";
import { STORAGE_STATE } from "./global-setup";
import { expectAccessible } from "./support/a11y";
import { e2eDb } from "./support/db";

test.use({ storageState: STORAGE_STATE });

const today = todayIn("Africa/Lagos");
const tag = (p: string) => (p === "mobile" ? "M" : "D");

async function fillRoom(page: Page, f: { title: string; date: string; time?: string; repeats?: string; tz?: string; location?: string }) {
  await page.goto("/rooms/new");
  await page.getByLabel("Title").fill(f.title);
  await page.getByLabel(/^(Date|First date)$/).fill(f.date);
  if (f.time) await page.getByLabel("Starts").fill(f.time);
  if (f.tz) await page.getByLabel("Time zone").selectOption(f.tz);
  if (f.repeats) await page.getByLabel("Repeats").selectOption({ label: f.repeats });
  if (f.location) await page.getByLabel("Location").fill(f.location);
}

test.describe.serial("Rooms", () => {
  test.afterAll(async () => {
    const { sql, userId } = e2eDb();
    await sql`delete from events where user_id = ${userId}`;
    await sql`delete from people where user_id = ${userId} and name like 'Room Guest %'`;
    await sql.end();
  });

  test("adding a one-off room", async ({ page }, info) => {
    const title = `Fintech mixer ${tag(info.project.name)}`;
    const date = addDays(today, 3);
    await fillRoom(page, { title, date, time: "18:30", location: "Victoria Island" });
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByText(`${formatLongDate(date, today)} · 6:30pm`)).toBeVisible();
    await expect(page.getByRole("article").getByText("Victoria Island")).toBeVisible();
    await expectAccessible(page);

    await page.goto("/rooms");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  });

  test("a monthly room on the nth weekday", async ({ page }, info) => {
    const title = `Founders breakfast ${tag(info.project.name)}`;
    // First date: the 2nd weekday of next month that matches today's weekday.
    const [y, m] = today.split("-").map(Number);
    const firstOfNext = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`;
    let second = firstOfNext;
    while (weekday(second) !== weekday(today)) second = addDays(second, 1);
    second = addDays(second, 7);
    await fillRoom(page, { title, date: second, time: "08:00", repeats: "Every month" });
    const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${second}T00:00:00Z`));
    await page.getByLabel(`On the second ${dayName}`).check();
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByText(`Every month on the second ${dayName}`)).toBeVisible();

    await page.goto("/rooms");
    await expect(page.getByRole("list", { name: "Recurring" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
  });

  test("a room in another time zone shows in yours", async ({ page }, info) => {
    const title = `NY investor call ${tag(info.project.name)}`;
    const date = addDays(today, 2);
    await fillRoom(page, { title, date, time: "20:00", tz: "America/New_York" });
    await page.getByRole("button", { name: "Add event" }).click();
    // 8pm in New York is 1am the next day in Lagos (outside US daylight-saving changes this week).
    await expect(page.getByText(/1am \(8pm New York\)|2am \(8pm New York\)/)).toBeVisible();
    await expect(page.getByText("Times shown in your time zone. The event is in New York time.")).toBeVisible();
  });

  test("adding people and tracking attendance", async ({ page }, info) => {
    const { sql, userId } = e2eDb();
    const guest = `Room Guest ${tag(info.project.name)}`;
    const [work] = await sql`select id from spaces where user_id = ${userId} and kind = 'work'`;
    const [p] = await sql`insert into people (user_id, name, company) values (${userId}, ${guest}, 'Lumen Health') returning id`;
    await sql`insert into person_spaces (user_id, person_id, space_id) values (${userId}, ${p.id}, ${work.id})`;
    await sql.end();

    const title = `Run club ${tag(info.project.name)}`;
    await fillRoom(page, { title, date: addDays(today, -21), time: "07:00", repeats: "Every week" });
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Add people" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox", { name: "Search people" }).fill(guest);
    await dialog.getByRole("button", { name: new RegExp(guest) }).click();
    await expect(page.getByRole("status").filter({ hasText: `${guest} added.` })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: new RegExp(guest) })).toBeVisible();

    const lastWeek = formatLongDate(addDays(today, -7), today);
    const group = page.getByRole("group", { name: `Did you go on ${lastWeek}?` });
    await group.getByRole("button", { name: "Went" }).click();
    await expect(group.getByRole("button", { name: "Went" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByText(/You went to 1 of the last 3 sessions/)).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: new RegExp(guest) }).click();
    await expect(page.getByRole("region", { name: "Events" })).toBeVisible();
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("deleting a room can be undone, and capture links to it", async ({ page, isMobile }, info) => {
    const title = `Fintech mixer ${tag(info.project.name)}`;
    await page.goto("/rooms");
    await page.getByRole("link", { name: new RegExp(title) }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete event" }).click();
    await expect(page).toHaveURL(/\/rooms$/);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    // It's back, as a sheet; close it before opening capture.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(async () => {
      if (isMobile) await page.getByRole("button", { name: "Capture" }).click();
      else {
        await page.locator("body").click();
        await page.keyboard.press("c");
      }
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByRole("dialog").getByRole("link", { name: "Add event" }).click();
    await expect(page.getByRole("dialog", { name: "Add event" }).getByLabel("Title")).toBeVisible();
  });
});
