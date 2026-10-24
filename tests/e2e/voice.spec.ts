import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./support/a11y";
import { sessionCookie } from "./support/auth";
import { e2eDb } from "./support/db";

const SAID = "Met Tola Adeyemi at the Ikoyi mixer, she wants our deck by Friday";

/** A stand-in for the browser's speech recognition: hears SAID in two parts, then ends on stop(). */
function fakeSpeech(said: string) {
  class FakeRecognition {
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      const words = said.split(" ");
      const half = words.slice(0, 4).join(" ");
      const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal });
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [result(half, false)] }), 50);
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [result(said, true)] }), 150);
    }
    stop() {
      setTimeout(() => this.onend?.(), 20);
    }
    abort() {}
  }
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
}

async function openCapture(page: Page, isMobile: boolean) {
  await expect(async () => {
    if (isMobile) await page.getByRole("button", { name: "Capture" }).click();
    else {
      await page.locator("body").click();
      await page.keyboard.press("c");
    }
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe.serial("Voice debrief", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = { id: randomUUID(), email: `ada.voice.${randomUUID().slice(0, 8)}@example.test` };
    const { sql } = e2eDb();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Voice" })}::text::jsonb)`;
    await sql`update profiles set onboarding_state = '{"completedAt":"2026-10-01T00:00:00Z"}'::jsonb where user_id = ${user.id}`;
    await sql.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ ...sessionCookie(user), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  });

  test("record, see the words, stop: it's read and ready to check", async ({ page, isMobile }) => {
    await page.addInitScript(fakeSpeech, SAID);
    await page.goto("/today");
    await openCapture(page, isMobile);
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Record a voice note" }).click();
    await expect(sheet.getByRole("status").filter({ hasText: "Listening" })).toBeVisible();
    await expect(sheet.getByLabel("What happened?")).toHaveValue(SAID);
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Stop" }).click();

    const review = sheet.getByRole("form", { name: "Check what was read" });
    await expect(review.getByLabel("Name")).toHaveValue("Tola Adeyemi", { timeout: 15_000 });
    await expect(review.getByLabel("How")).toHaveValue("event");
    await expect(review.getByLabel("Promise 1")).toHaveValue("Send our deck");
    await review.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Tola Adeyemi", level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test("without speech recognition, there's no voice button and typing still works", async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    });
    await page.goto("/today");
    await openCapture(page, isMobile);
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByLabel("What happened?")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Record a voice note" })).toHaveCount(0);
  });
});
