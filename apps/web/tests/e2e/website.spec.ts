import { expect, test } from "@playwright/test";

for (const route of ["/", "/privacy"]) {
  test(`direct ${route} access has honest content, metadata and no overflow`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(route === "/" ? "Planned order workflow | Fulfillment Workspace" : "Privacy overview | Fulfillment Workspace");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toContainText(route === "/" ? "Integrations not active" : "not submission-ready");
    await expect(page.locator('form, input, a[href^="mailto:"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (route === "/privacy") {
      await expect(page.getByRole("main")).toContainText("no login, forms, analytics or advertising trackers");
      await expect(page.getByRole("main")).toContainText("support email have not been confirmed");
      await expect(page.getByRole("main")).toContainText("hosting provider may process technical request information");
    } else {
      await expect(page.getByRole("main")).toContainText("BurgerPrints is the only supplier");
      await expect(page.getByRole("main")).toContainText("consenting sellers");
    }
  });

  test(`${route} skip link and every link are keyboard reachable with visible focus`, async ({ page }) => {
    await page.goto(route);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.goto(route);
    const links = page.getByRole("link");
    for (let i = 0; i < await links.count(); i++) {
      await page.keyboard.press("Tab");
      await expect(links.nth(i)).toBeFocused();
      await expect(links.nth(i)).toBeInViewport();
      const focus = await links.nth(i).evaluate(element => {
        const style = getComputedStyle(element);
        return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor };
      });
      expect(focus.width).toBeGreaterThanOrEqual(3);
      expect(focus.style).toBe("solid");
      expect(focus.color).toBe("rgb(38, 61, 91)");
    }
  });

  test(`${route} reflows at 200% text size and honors reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const moving = await page.locator("body *").evaluateAll(elements => elements.filter(element => {
      const style = getComputedStyle(element);
      return style.animationName !== "none" || style.transitionDuration.split(",").some(duration => parseFloat(duration) > 0);
    }).length);
    expect(moving).toBe(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("home to privacy to home is a working visitor journey", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore the planned workflow" }).click();
  await expect(page).toHaveURL(/#workflow$/);
  await expect(page.getByRole("heading", { name: "The planned path" })).toBeInViewport();
  await page.getByRole("link", { name: "Read the privacy overview" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.getByRole("link", { name: "Return to home" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Before fulfillment");
});

test("legacy privacy links permanently redirect, preserving query strings", async ({ page, request }) => {
  const redirect = await request.get("/privacy.html?source=legacy", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/privacy?source=legacy");
  await page.goto("/privacy.html");
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy overview");
});

test("unknown routes return 404 and offer a working route home", async ({ page }) => {
  const response = await page.goto("/missing-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page is not here.");
  await page.getByRole("link", { name: "Return to home" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});
