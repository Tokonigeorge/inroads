import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe.serial("Ask your network", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.ask.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Ask" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    const people = [
      { name: "Kemi Adebayo", city: "Accra", notes: "Led a payments seed round; big on fintech" },
      { name: "Kofi Mensah", city: "Accra", notes: "Product designer" },
    ];
    for (const p of people) {
      const [row] = await sql`insert into people (user_id, name, city) values (${user.id}, ${p.name}, ${p.city}) returning id`;
      await sql`insert into person_spaces (user_id, person_id, space_id, notes) values (${user.id}, ${row.id}, ${work.id}, ${p.notes})`;
    }
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("ask in your own words and get people with reasons", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("link", { name: "Ask your network a question" }).click();
    await expect(page.getByRole("heading", { name: "Ask your network", level: 1 })).toBeVisible();
    await page.getByLabel("Your question").fill("Who do I know in fintech in Accra?");
    await page.getByRole("button", { name: "Ask" }).click();
    const results = page.getByRole("region", { name: "1 person" });
    await expect(results).toBeVisible({ timeout: 15_000 });
    await expect(results.getByRole("link", { name: "Kemi Adebayo" })).toBeVisible();
    await expect(results.getByText(/Your notes on Kemi mention fintech/)).toBeVisible();
    await expect(results.getByText("Ranked with AI from what you've recorded. Only this Space was searched.")).toBeVisible();
    await expectAccessible(page);
  });
});
