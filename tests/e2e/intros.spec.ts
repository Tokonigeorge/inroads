import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe.serial("Intro requests", () => {
  let user: { id: string; email: string };
  const tunde = randomUUID();
  const ifeoma = randomUUID();
  const goal = randomUUID();

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.intro.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Intro" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    await sql`insert into people (id, user_id, name, company, position) values (${tunde}, ${user.id}, 'Tunde Bakare', 'Kestrel Ventures', 'Partner')`;
    await sql`insert into people (id, user_id, name, company, phones) values (${ifeoma}, ${user.id}, 'Ifeoma Nwosu', 'Kestrel Ventures', ${["+2348031234567"]})`;
    for (const id of [tunde, ifeoma]) await sql`insert into person_spaces (user_id, person_id, space_id) values (${user.id}, ${id}, ${work.id})`;
    await sql`insert into goals (id, user_id, space_id, text, type) values (${goal}, ${user.id}, ${work.id}, 'Raise a pre-seed round', 'capital')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("ask someone you both know, consent first, and it's tracked", async ({ page }) => {
    await page.goto(`/people/${tunde}`);
    await page.getByRole("button", { name: "Ask for an intro" }).click();
    const sheet = page.getByRole("dialog", { name: "Ask for an intro to Tunde" });
    await sheet.getByRole("radio", { name: /Ifeoma Nwosu/ }).check();
    await expect(sheet.getByText("You haven't been in touch yet · Also at Kestrel Ventures")).toBeVisible();
    await sheet.getByLabel("For a goal").selectOption({ label: "Raise a pre-seed round" });
    await expect(sheet.getByLabel("Message to Ifeoma")).toHaveValue(/^Hi Ifeoma, hope you're well! I'd love to meet Tunde Bakare \(Partner at Kestrel Ventures\)\. I'm working on "Raise a pre-seed round"/);
    await expect(sheet.getByRole("link", { name: "Open in WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/2348031234567\?text=Hi%20Ifeoma/);
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "I've asked" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved. Ifeoma owes you the intro to Tunde" })).toBeVisible();
    await expect(page.getByText(/said they'd introduce you · by/)).toBeVisible();

    const { sql } = e2eDb();
    expect(await sql`select stage from goal_links where person_id = ${tunde}`).toEqual([{ stage: "warm_path" }]);
    await sql.end();
  });

  test("ticking it off on the connector's page records the intro", async ({ page }) => {
    await page.goto(`/people/${ifeoma}`);
    await page.getByRole("checkbox", { name: /Introduce you to Tunde Bakare/ }).click();
    await expect
      .poll(async () => {
        const { sql } = e2eDb();
        const [c] = await sql`select done_at from commitments where person_id = ${ifeoma} and kind = 'intro'`;
        await sql.end();
        return Boolean(c?.done_at);
      })
      .toBe(true);
    await page.goto(`/people/${tunde}`);
    await expect(page.getByText("introduced you")).toBeVisible();
    const { sql } = e2eDb();
    expect(await sql`select stage from goal_links where person_id = ${tunde}`).toEqual([{ stage: "introduced" }]);
    expect(await sql`select kind from person_links where from_person_id = ${tunde} and to_person_id = ${ifeoma}`).toEqual([{ kind: "introduced_by" }]);
    await sql.end();

    // Asking logged a touch with Ifeoma, so her page shows how strong that relationship is now.
    await page.goto(`/people/${ifeoma}`);
    await expect(page.getByText(/(Strong|Good) relationship \(\d+\/100\)/)).toBeVisible();

    // Goals tab: asked one, made one, not met yet.
    await page.goto("/goals");
    const intros = page.getByRole("region", { name: "Intros" });
    await expect(intros.getByRole("definition").filter({ hasText: /^1$/ })).toHaveCount(2);
    await expect(intros.getByText("you've since spoken to")).toBeVisible();
    await expectAccessible(page);
  });
});
