import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

// A 1×1 PNG, standing in for a photo of a business card (the fake Claude reads any image as the same card).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test.describe.serial("AI features (against a fake Claude)", () => {
  let user: { id: string; email: string };
  const ids = { adaeze: randomUUID(), sade: randomUUID() };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.ai.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada AI" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    const spaces = await sql`select id, kind from spaces where user_id = ${user.id}`;
    const work = spaces.find((s) => s.kind === "work")!.id;
    const dating = spaces.find((s) => s.kind === "dating")!.id;
    await sql`insert into goals (user_id, space_id, text, type) values (${user.id}, ${work}, 'Raise a pre-seed round', 'capital')`;
    await sql`insert into people (id, user_id, name, phones) values (${ids.adaeze}, ${user.id}, 'Adaeze Okafor', ${["+2348031234567"]})`;
    await sql`insert into person_spaces (user_id, person_id, space_id, where_met) values (${user.id}, ${ids.adaeze}, ${work}, 'Founders Breakfast')`;
    await sql`insert into people (id, user_id, name) values (${ids.sade}, ${user.id}, 'Sade Lawal')`;
    await sql`insert into person_spaces (user_id, person_id, space_id, where_met) values (${user.id}, ${ids.sade}, ${dating}, 'A friend''s party')`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("research a Work contact, then accept or discard what it found", async ({ page }) => {
    await page.goto(`/people/${ids.adaeze}`);
    await page.getByRole("button", { name: "Research Adaeze" }).click();
    await expect(page.getByText("Early-stage investor focused on West African fintech.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Ask how Kestrel thinks about B2B payments")).toBeVisible();

    const suggestions = page.getByRole("list", { name: "Suggestions" });
    await suggestions.getByRole("article", { name: "Company" }).getByRole("button", { name: "Accept" }).click();
    await expect(suggestions.getByRole("article", { name: "Company" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Adaeze Okafor", level: 1 }).locator("..")).toContainText("Kestrel Ventures");
    await suggestions.getByRole("article", { name: "City" }).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Edit: City").fill("Ikoyi, Lagos");
    await suggestions.getByRole("article", { name: "City" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("· Ikoyi, Lagos")).toBeVisible();
    await suggestions.getByRole("article", { name: "Profile: x" }).getByRole("button", { name: "Discard" }).click();
    await expect(suggestions.getByRole("article", { name: "Profile: x" })).toHaveCount(0);
    await expectAccessible(page);
  });

  test("draft a message, then log it as a touch", async ({ page }) => {
    await page.goto(`/people/${ids.adaeze}`);
    await page.getByRole("button", { name: "Draft message" }).click();
    const sheet = page.getByRole("dialog", { name: "Message Adaeze" });
    await sheet.getByRole("button", { name: "Write a draft" }).click();
    await expect(sheet.getByLabel("Message")).toHaveValue(/great to catch up/);
    await expect(sheet.getByRole("link", { name: "Open in WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/2348031234567\?text=/);
    await sheet.getByRole("button", { name: "Copy" }).click();
    await sheet.getByRole("button", { name: "Yes, log it" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Touch logged." })).toBeVisible();
  });

  test("a chat import becomes suggestions", async ({ page }) => {
    await page.goto(`/people/${ids.adaeze}`);
    await page.getByRole("button", { name: "Import chat history" }).click();
    const sheet = page.getByRole("dialog", { name: /Import a chat with Adaeze/ });
    await sheet.getByLabel("The chat", { exact: true }).fill("[12/10/2026, 09:14] Adaeze: Coffee next week?\n[12/10/2026, 09:20] Ada: Yes! I'll send the deck first.");
    await sheet.getByRole("button", { name: "Read conversation" }).click();
    // Step 2, as in the prototype: who's who, read from the export.
    await expect(sheet.getByText("2 messages from 12 Oct 2026 to 12 Oct 2026.")).toBeVisible();
    await expect(sheet.getByLabel("Which one is you?")).toHaveValue("Ada");
    await sheet.getByRole("button", { name: "Read the chat" }).click();
    await expect(sheet.getByText(/suggestions are ready/)).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByRole("region", { name: "Promises" })).toContainText("You owe:");
    await page.keyboard.press("Escape");
    await page.reload();
    const suggestions = page.getByRole("list", { name: "Suggestions" });
    await suggestions.getByRole("article", { name: "A promise you made" }).getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Send the pitch deck").first()).toBeVisible();
  });

  test("Dating: get to know, never full research", async ({ page }) => {
    await page.goto(`/people/${ids.sade}`);
    await expect(page.getByRole("button", { name: /^Research/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Get to know" }).click();
    await expect(page.getByText("Which gig was the best this year?", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Check they're real" }).click();
    await expect(page.getByText(/they check out/)).toBeVisible({ timeout: 20_000 });
  });

  test("look up a company and see who can introduce you", async ({ page }) => {
    await page.goto("/discover");
    // Click the visible label (the radio itself is visually hidden), retrying until the page has hydrated.
    await expect(async () => {
      await page.getByRole("group", { name: "Search type" }).getByText("Place", { exact: true }).click();
      await page.getByLabel("What to decode").fill("Kestrel Ventures");
      await expect(page.getByRole("radio", { name: "Place" })).toBeChecked({ timeout: 1000 });
      await expect(page.getByLabel("What to decode")).toHaveValue("Kestrel Ventures", { timeout: 1000 });
    }).toPass();
    await page.getByRole("button", { name: "Decode" }).click();
    await expect(page.getByRole("heading", { name: "Kestrel Ventures", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Adaeze Okafor" })).toBeVisible();
    await expectAccessible(page);
  });

  test("suggested rooms can be added as rooms", async ({ page }) => {
    await page.goto("/rooms#radar");
    await page.getByRole("button", { name: "Scan for this week" }).click();
    const idea = page.getByRole("article", { name: "Fintech Founders Mixer" });
    await expect(idea).toBeVisible({ timeout: 20_000 });
    await idea.getByRole("link", { name: "+ My events" }).click();
    await expect(page.getByRole("dialog", { name: "Add event" }).getByLabel("Title")).toHaveValue("Fintech Founders Mixer");
  });

  test("scoring says what it did and links the strong fits", async ({ page }) => {
    await page.goto("/goals");
    await page.getByRole("button", { name: /^Score \d+ people/ }).first().click();
    const done = page.getByRole("status").filter({ hasText: /^Scored \d+ (person|people)\./ });
    await expect(done).toBeVisible({ timeout: 20_000 });
    // Strong fits already waiting (from research earlier) aren't suggested twice.
    await expect(done).toHaveText(/Review \d+ strong fits? for your goals|No new strong fits for your goals this time\./);
  });

  test("today's brief, per Space", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("button", { name: "Write today's brief" }).first().click();
    await expect(page.getByText("Pricing review: remember the deck you owe.").first()).toBeVisible({ timeout: 20_000 });
  });

  test("scan a business card into the Add person form", async ({ page, isMobile }) => {
    await page.goto("/people");
    await expect(async () => {
      if (isMobile) await page.getByRole("button", { name: "Capture" }).click();
      else {
        await page.locator("body").click();
        await page.keyboard.press("c");
      }
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByRole("dialog").getByRole("button", { name: "Scan a business card" }).click();
    await page.getByLabel("Photo of a business card").setInputFiles({ name: "card.png", mimeType: "image/png", buffer: PNG });
    // The Add person sheet opens, filled in from the card.
    const form = page.getByRole("dialog", { name: "Add person" });
    await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Ngozi Eze", { timeout: 15_000 });
    await expect(page.getByText("Read from the card. Check the details, then add them.")).toBeVisible();
  });

  test("usage shows what was used today", async ({ page }) => {
    await page.goto("/settings/usage");
    await expect(page.getByRole("meter", { name: "Research today" })).toHaveAttribute("aria-valuetext", /^[1-5] of 5$/);
    await expectAccessible(page);
  });
});
