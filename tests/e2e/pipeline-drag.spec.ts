import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe.serial("Goal pipeline: drag and fit", () => {
  let user: { id: string; email: string };
  const goal = randomUUID();
  const ada = randomUUID();
  const kwame = randomUUID();

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.drag.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Drag" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    await sql`insert into goals (id, user_id, space_id, text, type) values (${goal}, ${user.id}, ${work.id}, 'Raise a pre-seed round', 'capital')`;
    for (const [id, name] of [[ada, "Ada Obi"], [kwame, "Kwame Mensah"]]) {
      await sql`insert into people (id, user_id, name) values (${id}, ${user.id}, ${name})`;
      await sql`insert into person_spaces (user_id, person_id, space_id) values (${user.id}, ${id}, ${work.id})`;
      await sql`insert into goal_links (user_id, goal_id, person_id, stage) values (${user.id}, ${goal}, ${id}, 'identified')`;
    }
    await sql`insert into scores (user_id, person_id, goal_id, value, why) values (${user.id}, ${ada}, ${goal}, 86, 'Invests at your stage')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("fit is a hint with its reason, and you can sort by it", async ({ page }) => {
    await page.goto(`/goals/${goal}`);
    const adaCard = page.getByRole("article", { name: "Ada Obi, Identified" });
    await expect(adaCard.getByText("Fit 86")).toBeVisible();
    await expect(adaCard.getByText(/Invests at your stage/)).toBeVisible();
    await page.getByText("Best fit", { exact: true }).click();
    const names = page.getByRole("region", { name: /^Identified/ }).getByRole("article");
    await expect(names.first()).toHaveAccessibleName("Ada Obi, Identified");
    await expectAccessible(page);
  });

  test("drag someone to another stage (desktop)", async ({ page, isMobile }) => {
    test.skip(isMobile, "Dragging is a desktop interaction; phones use the stage picker.");
    await page.goto(`/goals/${goal}`);
    const card = page.getByRole("article", { name: "Kwame Mensah, Identified" });
    await expect(card).toBeVisible();
    await expect(async () => {
      await card.dragTo(page.locator('section[data-stage="met"]'));
      await expect(page.getByRole("article", { name: "Kwame Mensah, Met" })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect.poll(async () => {
      const { sql } = e2eDb();
      const [l] = await sql`select stage from goal_links where person_id = ${kwame}`;
      await sql.end();
      return l.stage;
    }).toBe("met");
  });
});
