import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke suite for the pre-Alex-outreach launch.
 *
 * These tests intentionally stub the backend APIs that hit Anthropic / Voyage /
 * Supabase so the suite:
 *  - runs deterministically in <60s
 *  - doesn't burn live LLM budget on every PR
 *  - doesn't require .env.local to be populated on CI
 *
 * The goal is to catch hard UI regressions (blank tab, broken form, storage
 * error, smoke-level a11y), not to assess answer quality — that's what
 * `npm run eval` is for.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev -- --port 3001",
        url: "http://localhost:3001",
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
