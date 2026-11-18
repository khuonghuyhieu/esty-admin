import { defineConfig } from "@playwright/test";
import { lstatSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { sessionRunProfile } from "./scripts/app-session-isolation.mjs";
import { sessionFixture } from "./tests/e2e/app-session-fixture";

const session = process.env.APP_SESSION_E2E === "1";
const etsy = process.env.ETSY_INTEGRATION_E2E === "1";
if (etsy && !session) throw new Error("Etsy integration requires the isolated actual-session fixture");
// Pinned Playwright otherwise captures visible one-time link values in failure aria snapshots.
if (etsy) process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
const sessionTarget = sessionRunProfile();
if (session) {
  const nonce = process.env.APP_SESSION_E2E_RUN_ID ?? "";
  const cwd = process.cwd();
  if (!/^[a-f0-9]{32}$/.test(nonce) || !cwd.endsWith(`/apps/web/.openai/app-session-${nonce}/project`)
    || !lstatSync(cwd).isDirectory() || realpathSync(cwd) !== cwd) throw new Error("Session E2E requires the owned staged project");
}
const etsyFixture = etsy ? sessionFixture() : null;
const nextCli = createRequire(`${process.cwd()}/package.json`).resolve("next/dist/bin/next");

const connectivity = process.env.LOCAL_CONNECTIVITY_E2E === "1" || (session && sessionTarget.profile === "activation001");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: etsy ? ["etsy-connection.spec.ts"] : session ? ["application.spec.ts", "website.spec.ts"] : undefined,
  testIgnore: etsy ? undefined : ["etsy-connection.spec.ts"],
  fullyParallel: !session,
  forbidOnly: true,
  retries: 0,
  workers: session ? 1 : 2,
  outputDir: session ? "./test-results/session-run" : "./test-results/connectivity-run",
  reporter: [["list"], ["html", { open: "never", outputFolder: session ? "./playwright-report/session-run" : "./playwright-report/connectivity-run" }]],
  use: { baseURL: etsyFixture?.webEnv.APP_ORIGIN ?? (session ? sessionTarget.webOrigin : "http://127.0.0.1:3100"), channel: session ? "chromium" : undefined, colorScheme: "light", deviceScaleFactor: 1, trace: session ? "off" : "retain-on-failure", screenshot: session ? "off" : "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-chromium", grepInvert: session ? /@security-desktop/ : undefined, use: { browserName: "chromium", viewport: { width: 360, height: 800 } } },
    { name: "mobile-390-chromium", testMatch: etsy ? ["etsy-connection.spec.ts"] : session ? ["application.spec.ts", "website.spec.ts"] : ["application.spec.ts", "connectivity.spec.ts"], grepInvert: session ? /@security-desktop/ : undefined, use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: session ? `"${process.execPath}" "${nextCli}" start --hostname 127.0.0.1 --port ${etsy ? 55644 : sessionTarget.webPort}` : connectivity ? "npm run start -- --port 3100" : "npm run build && npm run start -- --port 3100",
    url: etsyFixture?.webEnv.APP_ORIGIN ?? (session ? sessionTarget.webOrigin : "http://127.0.0.1:3100"),
    reuseExistingServer: false,
    timeout: 120_000,
    env: { SITE_MODE: "draft", SITE_URL: "", APP_NAME: "", OPERATOR_NAME: "", SUPPORT_EMAIL: "", PUBLICATION_CONFIRMED: "false", NEXT_TELEMETRY_DISABLED: "1", LOCAL_CONNECTIVITY_ENABLED: connectivity ? "true" : "false", LOCAL_CONNECTIVITY_API_ORIGIN: "http://127.0.0.1:4317", ...(etsyFixture?.webEnv ?? {}) },
  },
});
