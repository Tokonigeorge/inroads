import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const fixture = (name: string) => `tests/fixtures/files/${name}`;

test.describe.serial("Importing files and merging duplicates", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.files.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Files" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    // Someone already saved with the same name as a contact in the file, but a different number.
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    const [p] = await sql`insert into people (user_id, name, phones) values (${user.id}, 'Ifeoma Nwosú', ${["+2348000000001"]}) returning id`;
    await sql`insert into person_spaces (user_id, person_id, space_id, where_met) values (${user.id}, ${p.id}, ${work.id}, 'Lagos Startup Week')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("upload, review, import", async ({ page }) => {
    await page.goto("/settings/connections");
    await page.getByText("Other ways to add people").click();
    await expect(page.getByLabel("Choose files to import")).toBeEnabled();
    await page.getByLabel("Choose files to import").setInputFiles([fixture("iphone.vcf"), fixture("Connections.csv")]);
    await expect(page.getByRole("heading", { name: "Review import", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("6 new people, waiting for you to sort afterwards")).toBeVisible();
    await expect(page.getByText(/1 possible duplicate \(same name/)).toBeVisible();
    await expect(page.getByText("Kwame Mensah")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Import 6 people" }).click();
    await expect(page.getByRole("heading", { name: "Sort new people", level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Use suggested sort for/ }).click();
    await expect(page.getByText("Everyone is sorted.")).toBeVisible();
  });

  test("merge a possible duplicate, then undo", async ({ page }) => {
    await page.goto("/people/duplicates");
    const pair = page.getByRole("article", { name: "Possible duplicate: Ifeoma Nwosú" });
    await expect(pair).toBeVisible();
    await expectAccessible(page);
    await pair.getByRole("button", { name: "Merge into Ifeoma Nwosú" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Merged into Ifeoma Nwosú." })).toBeVisible();
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    // The undo refreshes the page's data: the merge leaves "Recent merges".
    await expect(page.getByText(/absorbed Ifeoma Nwosú/)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("article", { name: "Possible duplicate: Ifeoma Nwosú" })).toBeVisible();

    await page.getByRole("article", { name: "Possible duplicate: Ifeoma Nwosú" }).getByRole("button", { name: /^Merge into/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Merged into/ })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Nothing to review.")).toBeVisible();
    await expect(page.getByText(/absorbed Ifeoma Nwosú/)).toBeVisible();
  });
});
