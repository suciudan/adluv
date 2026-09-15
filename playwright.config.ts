import path from "node:path";

import { defineConfig } from "@playwright/test";
import { config as loadDotEnv } from "dotenv";

loadDotEnv({ path: path.join(__dirname, ".env.local"), override: false, quiet: true });
loadDotEnv({ path: path.join(__dirname, ".env"), override: false, quiet: true });

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
const testEnv = {
  ...process.env,
  ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
  adluv_E2E_FIXTURE_MODE: "1",
  adluv_FAKE_RESEND: "1",
  APP_URL: baseUrl,
  AUTH_COOKIE_DOMAIN: "",
  AUTH_COOKIE_SECURE: "false",
  SITE_URL: baseUrl,
  SYNC_CADENCE_MINUTES: "0.01",
  SYNC_SCHEDULER_POLL_SECONDS: "1",
};

export default defineConfig({
  testDir: path.join(__dirname, "tests/e2e"),
  fullyParallel: false,
  globalSetup: path.join(__dirname, "tests/e2e/global-setup.ts"),
  globalTeardown: path.join(__dirname, "tests/e2e/global-teardown.ts"),
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: baseUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "yarn workspace @adluv/app dev --hostname 127.0.0.1 --port 3100",
    cwd: __dirname,
    env: testEnv,
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseUrl}/api/health`,
  },
  workers: 1,
});
