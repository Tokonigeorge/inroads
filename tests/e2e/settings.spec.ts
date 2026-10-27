import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe.serial("Settings", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.settings.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Settings" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const [work] = await sql`select id from spaces where user_id = ${user.id} and kind = 'work'`;
    const [p] = await sql`insert into people (user_id, name, emails) values (${user.id}, 'Kemi Adebayo', ${["kemi@example.test"]}) returning id`;
    await sql`insert into person_spaces (user_id, person_id, space_id, where_met, notes) values (${user.id}, ${p.id}, ${work.id}, 'Lagos Startup Week', 'Said "call me", then left')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("edit your profile", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Edit profile" }).click();
    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await page.getByLabel("What you do").fill("Founder at Ledgerly");
    await page.getByLabel("Industries").fill("Fintech, Payments");
    await page.getByLabel("Time zone").selectOption("Europe/London");
    await page.getByLabel("Brief time").fill("08:15");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/settings");
    await expect(page.getByText("Founder at Ledgerly")).toBeVisible();
    await expect(page.getByText("Europe/London")).toBeVisible();
    await expect(page.getByText("08:15")).toBeVisible();
  });

  test("download a backup, as in the prototype's Goals tab", async ({ page }) => {
    await page.goto("/goals");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.getByRole("button", { name: "Download backup" }).click()]);
    const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["inroads.json", "people.csv"]));
    expect(strFromU8(files["people.csv"])).toContain('Kemi Adebayo,Work,kemi@example.test');
    expect(strFromU8(files["people.csv"])).toContain('"Said ""call me"", then left"');
    await expectAccessible(page);
  });

  test("delete your account by typing your email", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete account…" }).click();
    const confirm = page.getByLabel(`Type ${user.email} to confirm`);
    await confirm.fill("someone@else.test");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("Type your email exactly as shown to confirm.")).toBeVisible();
    await confirm.fill(user.email.toUpperCase());
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Your account and everything in it has been deleted.")).toBeVisible();

    const { sql } = e2eDb();
    expect(await sql`select 1 from auth.users where id = ${user.id}`).toHaveLength(0);
    expect(await sql`select 1 from people where user_id = ${user.id}`).toHaveLength(0);
    await sql.end();
  });
});
