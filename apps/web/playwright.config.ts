import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3100", colorScheme: "light", deviceScaleFactor: 1, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-chromium", use: { browserName: "chromium", viewport: { width: 360, height: 800 } } },
    { name: "mobile-390-chromium", testMatch: "application.spec.ts", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { SITE_MODE: "draft", SITE_URL: "", APP_NAME: "", OPERATOR_NAME: "", SUPPORT_EMAIL: "", PUBLICATION_CONFIRMED: "false", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
