import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { FAKE_SUPABASE_PORT, FAKE_SUPABASE_URL } from "./tests/e2e/support/auth";

const PORT = 3100;
const admin = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const e2eDb = new URL(admin);
e2eDb.pathname = "/inroads_e2e";

// Locally we can reuse a pre-installed Chromium; CI installs Playwright's own.
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", launchOptions },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: [
    {
      command: "pnpm tsx tests/e2e/support/fake-supabase.ts",
      url: `${FAKE_SUPABASE_URL}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Run `pnpm build` first (CI does). Production mode is what users get.
      command: `pnpm start --port ${PORT}`,
      url: `http://localhost:${PORT}/sign-in`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: e2eDb.toString(),
        NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
        APP_URL: `http://localhost:${PORT}`,
        // Google is played by the fake services server; tokens are encrypted with a test-only key.
        TEST_FAKE_PROVIDERS_URL: FAKE_SUPABASE_URL,
        GOOGLE_CLIENT_ID: "e2e-google-client",
        GOOGLE_CLIENT_SECRET: "e2e-google-secret",
        TOKEN_ENC_KEYS: JSON.stringify({ e2e: Buffer.alloc(32, 7).toString("base64") }),
        TOKEN_ENC_CURRENT: "e2e",
        // Claude is played by the same server; nothing reaches the real API.
        ANTHROPIC_API_KEY: "e2e-anthropic-key",
        ANTHROPIC_BASE_URL: `${FAKE_SUPABASE_URL}/anthropic`,
      },
    },
  ],
});

export { FAKE_SUPABASE_PORT };
