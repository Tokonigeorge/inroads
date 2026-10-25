import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addDays, todayIn } from "../../src/domain/dates";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe.serial("Proactive: rooms prepare themselves, people get researched (against a fake Claude)", () => {
  let user: { id: string; email: string };
  let goalId: string;
  const today = todayIn("Africa/Lagos");

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.prep.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Prep" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    const [g] = await sql`insert into goals (user_id, space_id, text, type) values (${user.id}, ${work.id}, 'Raise a pre-seed round', 'capital') returning id`;
    goalId = g.id;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("type a room's name, Find details fills the form, and the plan is there when you save", async ({ page }) => {
    await page.goto("/rooms/new");
    await expect(async () => {
      await page.getByLabel("Name", { exact: true }).fill("Moonshot");
      await expect(page.getByRole("button", { name: "Find details" })).toBeEnabled({ timeout: 1000 });
    }).toPass();
    await page.getByRole("button", { name: "Find details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Filled in the date, the venue, the event page." })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Moonshot by TechCabal");
    await expect(page.getByLabel("Date")).toHaveValue(addDays(today, 10));
    await expect(page.getByLabel("Starts")).toHaveValue("09:00");
    await expect(page.getByLabel("Where")).toHaveValue("Landmark Centre, Lagos");
    await expect(page.getByLabel("Event page")).toHaveValue("https://moonshot.example/tickets");
    await expect(page.getByLabel("Type")).toHaveValue("conference");
    // What it found is kept in the notes, and the goal its openings serve is picked.
    await expect(page.getByLabel("Notes")).toHaveValue(/Two days of Africa's tech founders[\s\S]*- Around 3,000 attendees/);
    await expect(page.getByLabel("Serves goal")).toHaveValue(goalId);
    await expect(page.getByText(/Who to meet: Tunde Bakare \(Partner at Kestrel, panel speaker\)/)).toBeVisible();
    await page.getByRole("button", { name: "Add room" }).click();

    await expect(page.getByRole("heading", { name: "Moonshot by TechCabal", level: 1 })).toBeVisible();
    const plan = page.getByRole("region", { name: "Your plan" });
    await expect(plan.getByText("Tunde Bakare")).toBeVisible();
    await expect(plan.getByText("A role to look for, not a name yet")).toBeVisible();
    await expectAccessible(page);

    // One tap: Tunde is saved, put on the goal, linked to the room as a speaker.
    await plan.getByRole("button", { name: 'Add to "Raise a pre-seed round"' }).click();
    await expect(plan.getByRole("link", { name: "In your people" })).toBeVisible();
    await expect(page.getByRole("region", { name: "People" }).getByRole("link", { name: /Tunde Bakare/ })).toBeVisible();
    await plan.getByRole("button", { name: "Add as a step" }).click();
    await expect(plan.getByText("Added as a step")).toBeVisible();

    await page.goto(`/goals/${goalId}`);
    await expect(page.getByText("Book an office-hours slot with Kestrel")).toBeVisible();
    await expect(page.getByText(/from a room's plan/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Tunde Bakare/ })).toBeVisible();
  });

  test("a goal can be made from the room form", async ({ page }) => {
    await page.goto("/rooms/new");
    await page.getByLabel("Name", { exact: true }).fill("Investor breakfast");
    await expect(async () => {
      await page.getByLabel("Serves goal").selectOption("__new");
      await expect(page.getByLabel("New goal")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByLabel("New goal").fill("Meet three seed investors");
    await page.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByLabel("Serves goal").locator("option:checked")).toHaveText("Meet three seed investors");
    await page.getByRole("button", { name: "Add room" }).click();
    await expect(page.getByText("Serves: Meet three seed investors")).toBeVisible();
  });

  test("someone you add by name is researched without asking; you keep what's right", async ({ page }) => {
    await page.goto("/people/new");
    await page.getByLabel("Name", { exact: true }).fill("Adaeze Okafor");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("heading", { name: "Adaeze Okafor", level: 1 })).toBeVisible();
    // No button pressed: the research started when she was added.
    const suggestions = page.getByRole("list", { name: "Suggestions" });
    await expect(async () => {
      await page.reload();
      await expect(suggestions.getByRole("article", { name: "Company" })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await suggestions.getByRole("article", { name: "Company" }).getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("heading", { name: "Adaeze Okafor", level: 1 }).locator("..")).toContainText("Kestrel Ventures");
  });

  test("Today: steps due and rooms found for your goals", async ({ page }) => {
    await page.goto(`/goals/${goalId}`);
    const steps = page.getByRole("form", { name: "Add a step" });
    await steps.getByLabel("New step").fill("Send Tunde the deck");
    await steps.getByLabel("Due (optional)").fill(today);
    await steps.getByRole("button", { name: "Add step" }).click();
    await expect(page.getByText("Send Tunde the deck")).toBeVisible();

    await page.goto("/today");
    const due = page.getByRole("region", { name: /Steps due/ });
    await expect(due.getByText("Send Tunde the deck")).toBeVisible();
    await page.getByRole("button", { name: "Find rooms for my goals" }).click();
    await expect(page.getByRole("article", { name: "Fintech Founders Mixer" })).toBeVisible({ timeout: 20_000 });
    await due.getByRole("checkbox", { name: "Done: Send Tunde the deck" }).check();
    await expect(page.getByRole("status").filter({ hasText: "Step done." })).toBeVisible();
    await expect(due.getByText("Send Tunde the deck")).toHaveCount(0);
  });
});
