import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { addDays, todayIn } from "../../src/domain/dates";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const today = todayIn("Africa/Lagos");

/** Opens the palette with ⌘K (desktop) or the header button (mobile), retrying until the page has hydrated. */
async function openPalette(page: Page, isMobile: boolean) {
  const box = page.getByRole("combobox", { name: "Search people, rooms, goals and commands" });
  await expect(async () => {
    if (!(await box.isVisible())) {
      if (isMobile) await page.getByRole("button", { name: "Search", exact: true }).click();
      else await page.keyboard.press("ControlOrMeta+k");
    }
    await expect(box).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  return box;
}

// Its own account per project, arranged directly in the database.
test.describe.serial("Today", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.today.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Today" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    const people = {
      adaeze: { id: randomUUID(), name: "Adaeze Okafor", company: "Kestrel Ventures", position: "Partner" },
      tunde: { id: randomUUID(), name: "Tunde Bakare", company: "Meridian Telecoms", position: null },
    };
    for (const p of Object.values(people)) {
      await sql`insert into people (id, user_id, name, company, position, created_at) values (${p.id}, ${user.id}, ${p.name}, ${p.company}, ${p.position}, now() - interval '60 days')`;
      await sql`insert into person_spaces (user_id, person_id, space_id, where_met, triage_state) values (${user.id}, ${p.id}, ${work.id}, 'Lagos Startup Week', 'done')`;
    }
    // Adaeze: last spoke 40 days ago, monthly reminder → due.
    await sql`insert into interactions (user_id, person_id, space_id, occurred_on, type, summary) values (${user.id}, ${people.adaeze.id}, ${work.id}, ${addDays(today, -40)}, 'coffee', 'Talked about the round')`;
    // Tunde: a promise you owe, overdue, and a meeting today.
    await sql`insert into interactions (user_id, person_id, space_id, occurred_on, type, summary) values (${user.id}, ${people.tunde.id}, ${work.id}, ${addDays(today, -3)}, 'call', 'Pricing questions')`;
    await sql`insert into commitments (user_id, person_id, space_id, text, owner, due_on) values (${user.id}, ${people.tunde.id}, ${work.id}, 'Send the pricing deck', 'me', ${addDays(today, -1)})`;
    const [room] = await sql`insert into events (user_id, space_id, title, kind, starts_on, start_time, tz) values (${user.id}, ${work.id}, 'Pricing review with Meridian', 'meeting', ${today}, '23:30', 'Africa/Lagos') returning id`;
    await sql`insert into event_people (event_id, person_id, user_id, role) values (${room.id}, ${people.tunde.id}, ${user.id}, 'attendee')`;
    await sql`insert into goals (user_id, space_id, text, type) values (${user.id}, ${work.id}, 'Win three enterprise clients', 'clients')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("the agenda preps you for today, and the feed lists what needs you", async ({ page }) => {
    await page.goto("/today");
    const agenda = page.getByRole("list", { name: "Who you'll see at Pricing review with Meridian" });
    await expect(agenda.getByRole("link", { name: "Tunde Bakare" })).toBeVisible();
    await expect(agenda).toContainText("Pricing questions");
    await expect(agenda).toContainText("You owe: Send the pricing deck");

    const feed = page.getByRole("list", { name: "Nudges" });
    await expect(feed.getByRole("heading", { name: "You said you'd send the pricing deck" })).toBeVisible();
    await expect(feed.getByRole("heading", { name: "40 days since you spoke with Adaeze" })).toBeVisible();
    await expect(feed.getByRole("heading", { name: /^You meet Tunde today at 11:30pm/ })).toBeVisible();
    await expectAccessible(page);
  });

  test("snooze with undo, and marking a promise done", async ({ page }) => {
    await page.goto("/today");
    const feed = page.getByRole("list", { name: "Nudges" });
    const due = feed.getByRole("article", { name: "40 days since you spoke with Adaeze" });
    await due.getByRole("button", { name: "Snooze" }).click();
    await expect(due).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(due).toBeVisible();

    await due.getByRole("button", { name: "Snooze" }).click();
    await expect(due).toHaveCount(0);
    await page.reload();
    await expect(feed.getByRole("article", { name: "40 days since you spoke with Adaeze" })).toHaveCount(0);

    const promise = feed.getByRole("article", { name: "You said you'd send the pricing deck" });
    await promise.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Marked done." })).toBeVisible();
    await page.reload();
    await expect(feed.getByRole("article", { name: "You said you'd send the pricing deck" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: /Who you'll see/ })).not.toContainText("You owe");
  });

  test("opening someone from a prep card", async ({ page }) => {
    await page.goto("/today");
    const prep = page.getByRole("article", { name: /^You meet Tunde today/ });
    await prep.getByRole("button", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name: "Tunde Bakare", level: 1 })).toBeVisible();
  });

  test("the command palette finds people, rooms and goals, and runs commands", async ({ page, isMobile }) => {
    await page.goto("/today");
    const box = await openPalette(page, isMobile);
    await expect(box).toBeFocused();
    await expectAccessible(page);

    await box.fill("tun");
    await expect(page.getByRole("option", { name: /Tunde Bakare/ })).toBeVisible();
    await box.press("Enter");
    await expect(page.getByRole("heading", { name: "Tunde Bakare", level: 1 })).toBeVisible();

    await openPalette(page, isMobile);
    await box.fill("enterprise");
    await page.getByRole("option", { name: "Win three enterprise clients" }).click();
    await expect(page.getByRole("heading", { name: "Win three enterprise clients", level: 1 })).toBeVisible();

    await openPalette(page, isMobile);
    await box.fill("add a room");
    await box.press("ArrowDown");
    await box.press("ArrowUp");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/rooms\/new$/);
  });

  test("keyboard: g sequences and the shortcut list", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard shortcuts are for desktop");
    await page.goto("/today");
    await expect(async () => {
      await page.keyboard.press("g");
      await page.keyboard.press("g");
      await expect(page).toHaveURL(/\/goals$/, { timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press("Shift+?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await expect(page.getByText("Go to Today, People, Rooms, Goals, Settings")).toBeVisible();
  });
});
