import { expect, test } from "@playwright/test";
import { localApiFixture } from "./connectivity-fixture";

const enabled = process.env.LOCAL_CONNECTIVITY_E2E === "1";
const live = { status: "ok" };
const ready = { status: "ready", database: "up", migrations: "current" };
const api = "http://127.0.0.1:4317";

test("connectivity route is absent by default and public navigation does not expose it", async ({ page }) => {
  test.skip(enabled);
  const response = await page.goto("/connectivity");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page is not here." })).toBeVisible();
  await page.goto("/");
  await expect(page.locator('a[href="/connectivity"]')).toHaveCount(0);
});

test("owned browser to Nest to Supabase-local journey distinguishes failure and fresh recovery", async ({ page }, info) => {
  test.skip(!enabled || info.project.name !== "desktop-chromium");
  test.setTimeout(150_000);
  const fixture = await localApiFixture();
  try {
    await page.goto("/connectivity");
    await expect(page.getByRole("status")).toContainText("Not checked");
    await page.getByRole("button", { name: "Check connection" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Connection ready");
    await expect(page.getByRole("region", { name: "API process" })).toContainText("Running");
    await expect(page.getByRole("region", { name: "Database readiness", exact: true })).toContainText("Ready · migrations current");
    await fixture.startApi(true);
    await page.getByRole("button", { name: "Retry check" }).press("Space");
    await expect(page.getByRole("status")).toContainText("Database readiness degraded");
    await expect(page.getByRole("region", { name: "API process" })).toContainText("Running");
    await expect(page.getByRole("region", { name: "Database readiness", exact: true })).toContainText("could not reach its database");
    await fixture.stopApi();
    await page.getByRole("button", { name: "Retry check" }).press("Enter");
    await expect(page.getByRole("status")).toContainText("Connection unconfirmed");
    await expect(page.getByRole("region", { name: "API process" })).toContainText("Unconfirmed");
    await fixture.startApi();
    await page.getByRole("button", { name: "Retry check" }).press("Enter");
    await expect(page.getByRole("status")).toContainText("Connection ready");
    await expect(page.locator("time")).toHaveAttribute("datetime", /^\d{4}-/);
    await info.attach("real-local-ready", { body: await page.screenshot(), contentType: "image/png" });
  } finally { await fixture.cleanup(); }
});

test("local diagnostics are idle, keyboard accessible, mobile-safe and nonindexable", async ({ page }) => {
  test.skip(!enabled);
  const requests: string[] = [];
  page.on("request", request => { if (request.url().startsWith(api)) requests.push(request.url()); });
  await page.route(`${api}/health/**`, route => route.fulfill({ json: route.request().url().endsWith("/live") ? live : ready }));
  await page.goto("/connectivity");
  await expect(page).toHaveTitle("Local connectivity");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByRole("status")).toContainText("Not checked");
  expect(requests).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const button = page.getByRole("button", { name: "Check connection" });
  await button.focus();
  expect(await button.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Connection ready");
  await expect(page.getByRole("button", { name: "Retry check" })).toBeFocused();
  expect(requests.sort()).toEqual([`${api}/health/live`, `${api}/health/ready`]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Retry check" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Retry check" })).toBeInViewport();
});

test("retry clears old success, blocks duplicate clicks and rejects malformed readiness", async ({ page }) => {
  test.skip(!enabled);
  let mode: "ready" | "malformed" | "waiting" = "ready";
  let count = 0;
  const release = Promise.withResolvers<void>();
  await page.route(`${api}/health/**`, async route => {
    count++;
    if (mode === "waiting") await release.promise;
    await route.fulfill({ status: route.request().url().endsWith("/ready") && mode !== "ready" ? 503 : 200,
      json: route.request().url().endsWith("/live") ? live : mode === "ready" ? ready : { status: "degraded", reason: "private-canary" } });
  });
  await page.goto("/connectivity");
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("status")).toContainText("Connection ready");
  mode = "waiting";
  await page.getByRole("button", { name: "Retry check" }).click();
  const checking = page.getByRole("button", { name: "Checking…" });
  await expect(checking).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("status")).toContainText("Previous results are cleared");
  await expect(page.locator("time")).toHaveCount(0);
  await expect(page.getByText("Ready · migrations current", { exact: true })).toHaveCount(0);
  await checking.press("Enter");
  await expect.poll(() => count).toBe(4);
  mode = "malformed";
  release.resolve();
  await expect(page.getByRole("status")).toContainText("Connection unconfirmed");
  await expect(page.getByRole("region", { name: "Database readiness" })).toContainText("did not match the health contract");
  await expect(page.getByRole("main")).not.toContainText("private-canary");
});

test("timeout releases checking and navigating away prevents stale completion", async ({ page }) => {
  test.skip(!enabled);
  const release = Promise.withResolvers<void>();
  await page.route(`${api}/health/**`, async route => {
    await release.promise;
    await route.fulfill({ json: route.request().url().endsWith("/live") ? live : ready }).catch(() => {});
  });
  await page.goto("/connectivity");
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("status")).toContainText("Connection unconfirmed", { timeout: 7000 });
  await expect(page.getByRole("region", { name: "API process" })).toContainText("within five seconds");
  await page.getByRole("button", { name: "Retry check" }).click();
  await page.getByRole("link", { name: "Application preview" }).click();
  await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toBeVisible();
  release.resolve();
  await page.goto("/connectivity");
  await expect(page.getByRole("status")).toContainText("Not checked");
  await expect(page.locator("time")).toHaveCount(0);
});
