import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const VCARD = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ngozi Eze\r\nTEL;TYPE=CELL:+2348035550101\r\nEND:VCARD\r\n";

/** Does what the phone does for a share target: a multipart POST navigation to /share. */
async function share(page: Page, fields: { title?: string; text?: string; url?: string }, file?: { name: string; type: string; body: string }) {
  await page.goto("/today");
  await page.evaluate(
    ({ fields, file }) => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/share";
      form.enctype = "multipart/form-data";
      for (const [k, v] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = v ?? "";
        form.append(input);
      }
      if (file) {
        const input = document.createElement("input");
        input.type = "file";
        input.name = "files";
        const dt = new DataTransfer();
        dt.items.add(new File([file.body], file.name, { type: file.type }));
        input.files = dt.files;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    },
    { fields, file },
  );
}

test.describe.serial("Sharing into Inroads", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.share.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Share" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("the installed app offers itself as a share target", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.share_target).toMatchObject({ action: "/share", method: "POST", enctype: "multipart/form-data", params: { url: "url", text: "text", title: "title" } });
  });

  test("a LinkedIn profile becomes a person; sharing it again opens them", async ({ page }) => {
    await share(page, { title: "Kemi Adebayo - Partner - Kestrel Ventures | LinkedIn", url: "https://www.linkedin.com/in/kemi-adebayo-77a1b2?utm_source=share_via" });
    await expect(page.getByRole("heading", { name: "Add this person", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("Kemi Adebayo");
    await expect(page.getByLabel("Company")).toHaveValue("Kestrel Ventures");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("heading", { name: "Kemi Adebayo", level: 1 })).toBeVisible({ timeout: 15_000 });

    await share(page, { url: "https://linkedin.com/in/kemi-adebayo-77a1b2/" });
    await expect(page.getByRole("heading", { name: "Already in Inroads", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Open Kemi" }).click();
    await expect(page.getByRole("heading", { name: "Kemi Adebayo", level: 1 })).toBeVisible();
  });

  test("shared text is read like a quick capture", async ({ page }) => {
    await share(page, { text: "Called Bisi Akande, she'll send the contract by Monday" });
    await expect(page.getByRole("heading", { name: "Capture what you shared", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Read it" }).click();
    const review = page.getByRole("form", { name: "Check what was read" });
    await expect(review.getByLabel("Name")).toHaveValue("Bisi Akande", { timeout: 15_000 });
    await review.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Bisi Akande", level: 1 })).toBeVisible({ timeout: 15_000 });
    const { sql } = e2eDb();
    expect(await sql`select 1 from imports where user_id = ${user.id} and type = 'share'`).toHaveLength(0);
    await sql.end();
  });

  test("a shared contact card goes to the import review", async ({ page }) => {
    await share(page, {}, { name: "Ngozi Eze.vcf", type: "text/vcard", body: VCARD });
    await expect(page.getByRole("heading", { name: "Review import", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Ngozi Eze", { exact: true })).toBeVisible();
  });
});
