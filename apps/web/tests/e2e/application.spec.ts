import { expect, test } from "@playwright/test";

const initialTitles = ["Sprint retro — June", "Q2 Product Planning", "Design System v3", "User research synthesis", "Mobile UX — Checkout flow"];

test.beforeEach(async ({ page }) => {
  await page.goto("/application");
  await page.evaluate(() => document.fonts.ready);
});

test("direct preview is complete, separate from public chrome, and nonindexable", async ({ page }) => {
  await expect(page).toHaveTitle("SketchPad — Project dashboard preview");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator(".site-header, .site-footer, .draft-banner")).toHaveCount(0);
  await expect(page.getByText("UI preview — sample data. Changes are not saved.")).toBeVisible();
  for (const title of ["Project dashboard", "Canvas activity", "Recent board activity", "Whiteboard projects"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  const table = page.getByRole("table", { name: "Sample whiteboard projects" });
  await expect(table.locator("tbody th")).toHaveText(initialTitles);
  await expect(page.getByRole("status")).toHaveText("Projects in view5Strokes in view17,540");
  await expect(page.getByRole("heading", { name: "Boards active", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("synchronized search, AND filters, numeric/date sort and reset form a working journey", async ({ page }) => {
  const headerSearch = page.getByRole("searchbox", { name: "Search boards", exact: true });
  const tableSearch = page.getByRole("searchbox", { name: "Search projects, owners", exact: true });
  const table = page.getByRole("table", { name: "Sample whiteboard projects" });
  await headerSearch.fill("  JORDAN  ");
  await expect(tableSearch).toHaveValue("  JORDAN  ");
  await page.getByRole("radio", { name: "Active", exact: true }).check();
  await expect(table.locator("tbody th")).toHaveText(["Q2 Product Planning"]);
  await expect(page.getByRole("status")).toHaveText("Projects in view1Strokes in view4,280");
  await tableSearch.fill("maya");
  await expect(headerSearch).toHaveValue("maya");
  await expect(page.getByText("No projects match your search and status.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Projects in view0Strokes in view0");
  await page.getByRole("radio", { name: "In review", exact: true }).check();
  await expect(table.locator("tbody th")).toHaveText(["Mobile UX — Checkout flow"]);
  await page.getByRole("button", { name: "Reset table", exact: true }).click();
  await expect(headerSearch).toHaveValue("");
  await expect(table.locator("thead [aria-sort]")).toHaveCount(0);
  const strokes = page.getByRole("button", { name: "Strokes", exact: true });
  await strokes.focus();
  await page.keyboard.press("Enter");
  await expect(table.locator("tbody th")).toHaveText([initialTitles[3], initialTitles[0], initialTitles[4], initialTitles[1], initialTitles[2]]);
  await expect(table.getByRole("columnheader", { name: "Strokes" })).toHaveAttribute("aria-sort", "ascending");
  await page.keyboard.press("Space");
  await expect(table.locator("tbody th")).toHaveText([initialTitles[2], initialTitles[1], initialTitles[4], initialTitles[0], initialTitles[3]]);
  await page.getByRole("button", { name: "Updated", exact: true }).click();
  await expect(table.locator("tbody th")).toHaveText([initialTitles[3], initialTitles[0], initialTitles[2], initialTitles[4], initialTitles[1]]);
  await expect(table.getByRole("columnheader", { name: "Updated" })).toHaveAttribute("aria-sort", "ascending");
  await expect(table.getByRole("columnheader", { name: "Strokes" })).not.toHaveAttribute("aria-sort");
  await page.getByRole("button", { name: "Updated", exact: true }).click();
  await expect(table.locator("tbody th")).toHaveText([initialTitles[1], initialTitles[4], initialTitles[2], initialTitles[0], initialTitles[3]]);
  await tableSearch.fill("not present");
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(table.locator("tbody th")).toHaveText(initialTitles);
  await expect(page.getByRole("status")).toHaveText("Projects in view5Strokes in view17,540");
});

test("row menu stays in view, navigates disabled items, dismisses and restores focus", async ({ page }) => {
  const trigger = page.getByRole("button", { name: `Actions for ${initialTitles[4]}`, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitem");
  await expect(items).toHaveText(["Share board", "Edit project", "Archive project", "Delete project"]);
  await expect(items.first()).toBeFocused();
  const bounds = await menu.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("e");
  await expect(items.nth(1)).toBeFocused();
  for (const item of await items.all()) {
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await item.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
  }
  await expect(page.getByRole("status")).toHaveText("Projects in view5Strokes in view17,540");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(4, viewport.height - 8);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await page.mouse.wheel(0, -200);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("unavailable controls cannot navigate, mutate, download, print or call services", async ({ page }) => {
  const effects: string[] = [];
  page.on("download", () => effects.push("download"));
  page.on("dialog", async (dialog) => { effects.push("dialog"); await dialog.dismiss(); });
  page.on("request", (request) => {
    if (request.resourceType() === "fetch" || request.resourceType() === "xhr") effects.push(request.url());
  });
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printCalled = "true"; }; });
  for (const name of [/Northwind Studio.*Team/, "Notifications (3 unread)", /Jordan Kim/, "List view", "Export", "Filters", "Table settings", "New board", "Print", "Duplicate", "Export CSV"]) {
    const control = page.getByRole("button", { name, exact: true });
    await expect(control).toBeDisabled();
    await expect(control).toHaveAttribute("aria-describedby", /unavailable/);
    await control.evaluate((button) => (button as HTMLButtonElement).click());
  }
  await expect(page).toHaveURL(/\/application$/);
  await expect(page.getByRole("status")).toHaveText("Projects in view5Strokes in view17,540");
  expect(effects).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, print: document.documentElement.dataset.printCalled }))).toEqual({ local: 0, session: 0, print: undefined });
});

test("mobile drawer traps focus, dismisses with Escape/backdrop and returns to trigger", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Open sidebar", exact: true });
  if (page.viewportSize()!.width >= 1024) {
    await expect(trigger).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Application", exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Sample canvas storage used" })).toHaveAttribute("value", "68");
    return;
  }
  await trigger.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Application navigation", exact: true });
  await expect(drawer).toBeVisible();
  const close = drawer.getByRole("button", { name: "Close sidebar" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("link", { name: "Dashboard", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await expect(drawer.getByRole("button", { name: "Boards 8", exact: true })).toBeDisabled();
  await expect(drawer.getByRole("progressbar")).toHaveAttribute("value", "68");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(page.viewportSize()!.width - 8, 100);
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("chart values and every table column are reachable without page overflow", async ({ page }) => {
  const chart = page.getByRole("img", { name: "Sample canvas activity, June 9–22" });
  await expect(chart).toBeVisible();
  await page.getByText("View chart data", { exact: true }).focus();
  await page.keyboard.press("Enter");
  const data = page.getByRole("table", { name: "Sample canvas activity", exact: true });
  await expect(data.getByRole("row", { name: "Jun 15 860 21", exact: true })).toBeVisible();
  await expect(data.getByRole("row", { name: "Jun 22 1,842 47", exact: true })).toBeVisible();
  const scroll = page.getByRole("region", { name: "Whiteboard projects table, scroll for all columns" });
  await scroll.focus();
  expect(await scroll.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(3);
  const first = page.getByRole("table", { name: "Sample whiteboard projects" }).getByRole("columnheader", { name: "Project", exact: true });
  await expect(first).toBeInViewport();
  await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect(page.getByRole("button", { name: `Actions for ${initialTitles[0]}`, exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("200% text, reduced motion and long labels preserve usable controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    const heading = document.querySelector("h1")!;
    heading.textContent = "Project dashboard with a very long sample workspace label";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText("View chart data", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Sample canvas activity", exact: true }).getByRole("row", { name: "Jun 22 1,842 47", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const search of await page.getByRole("searchbox").all()) {
    await search.focus();
    await expect(search).toBeInViewport();
    const bounds = await search.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.getByRole("searchbox", { name: "Search projects, owners", exact: true }).fill("maya");
  await expect(page.getByRole("status")).toHaveText("Projects in view1Strokes in view2,140");
  const trigger = page.getByRole("button", { name: `Actions for ${initialTitles[4]}`, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  const moving = await page.locator("body *").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return style.animationName !== "none" || style.transitionDuration.split(",").some((duration) => parseFloat(duration) > 0);
  }).length);
  expect(moving).toBe(0);
});
