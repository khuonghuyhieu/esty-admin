import { expect, test, type Locator, type Page } from "@playwright/test";

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
  await expect(page.getByRole("main")).not.toContainText(/UI preview|changes are not saved|unavailable|preview only/i);
  await expect(page.getByRole("main").locator('[disabled], [aria-disabled="true"]')).toHaveCount(0);
  for (const title of ["Project dashboard", "Canvas activity", "Recent board activity", "Whiteboard projects"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  const table = page.getByRole("table", { name: "Whiteboard projects", exact: true });
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
  const table = page.getByRole("table", { name: "Whiteboard projects", exact: true });
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

test("row menu stays in view, navigates items, dismisses and restores focus", async ({ page }) => {
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

test("cleanup sidebar exposes only useful routes and removes reference-only storage", async ({ page }) => {
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Application", exact: true }).filter({ visible: true });
  await expect(navigation.getByRole("link")).toHaveText(["Dashboard", "Team 3", "Settings"]);
  await expect(navigation.getByRole("button")).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("href", "#main-content");
  await expect(navigation.getByRole("link", { name: "Team 3", exact: true })).toHaveAttribute("href", "/settings/team");
  await expect(navigation.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("href", "/settings");
  await expect(page.getByRole("heading", { name: "Canvas storage", exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(navigation.locator('a[href="#"]')).toHaveCount(0);
});

test("mobile drawer traps focus, dismisses with Escape/backdrop and returns to trigger", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Open sidebar", exact: true });
  if (page.viewportSize()!.width >= 1024) {
    await expect(trigger).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Application", exact: true })).toBeVisible();
    return;
  }
  await trigger.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Application navigation", exact: true });
  await expect(drawer).toBeVisible();
  const close = drawer.getByRole("button", { name: "Close sidebar" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("link", { name: "Settings", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
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
  const first = page.getByRole("table", { name: "Whiteboard projects", exact: true }).getByRole("columnheader", { name: "Project", exact: true });
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

async function navigateFoundation(page: Page, name: "Dashboard" | "Team" | "Settings") {
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Application", exact: true }).filter({ visible: true });
  await navigation.getByRole("link", { name: name === "Team" ? "Team 3" : name, exact: true }).click();
}

test("foundation login validates and reveals sample input without authenticating", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/email address/i);
  await email.fill("not-an-email");
  await password.fill("sample-only");
  await submit.click();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/valid email/i);
  await email.fill("jordan@workspace.test");
  await password.fill("");
  await submit.click();
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAccessibleDescription(/password/i);
  await password.fill("sample-only");
  await page.getByRole("button", { name: "Show password", exact: true }).press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("sample-only");
  await page.getByRole("button", { name: "Hide password", exact: true }).press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await submit.press("Enter");
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  await page.reload();
  await expect(email).toHaveValue("");
  await expect(password).toHaveValue("");
});

test("foundation Team search and keyboard tabs show only illustrative accounts and permissions", async ({ page }) => {
  await navigateFoundation(page, "Team");
  await expect(page).toHaveURL(/\/settings\/team$/);
  const users = page.getByRole("tab", { name: "Users", exact: true });
  const roles = page.getByRole("tab", { name: "Roles", exact: true });
  await expect(users).toHaveAttribute("aria-selected", "true");
  const members = page.getByRole("table", { name: "Members", exact: true });
  await expect(members.getByRole("rowheader")).toContainText(["Jordan Kim", "Alex Rivera", "Maya Chen"]);
  await expect(members.getByRole("rowheader")).toHaveCount(3);
  const search = page.getByRole("searchbox", { name: "Search members", exact: true });
  await search.fill("  MAYA@WORKSPACE.TEST  ");
  await expect(members.getByRole("rowheader")).toContainText(["Maya Chen"]);
  await expect(members.getByRole("rowheader")).toHaveCount(1);
  await search.fill("nobody");
  await expect(members).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("0 members");
  await page.getByRole("button", { name: "Reset search", exact: true }).press("Enter");
  await expect(search).toBeFocused();
  await expect(members.getByRole("rowheader")).toContainText(["Jordan Kim", "Alex Rivera", "Maya Chen"]);
  await expect(members.getByRole("rowheader")).toHaveCount(3);
  await users.focus();
  await page.keyboard.press("ArrowRight");
  await expect(roles).toBeFocused();
  await expect(roles).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("table", { name: "Illustrative permissions", exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel").locator("input")).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect(users).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(roles).toBeFocused();
  await page.keyboard.press("End");
  await expect(roles).toBeFocused();
  await users.click();
});

test("foundation settings are transient and navigation preserves the dashboard", async ({ page }) => {
  await navigateFoundation(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  const displayName = page.getByRole("textbox", { name: "Display name", exact: true });
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  const workspaceName = page.getByRole("textbox", { name: "Workspace name", exact: true });
  await expect(displayName).toHaveValue("Jordan Kim");
  await expect(email).toHaveValue("jordan@workspace.test");
  await expect(workspaceName).toHaveValue("Sample Workspace");
  await displayName.fill("Temporary sample name");
  await email.fill("temporary@workspace.test");
  await workspaceName.fill("Temporary sample workspace");
  await expect(page.getByRole("status")).toContainText(/unsaved/i);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(displayName).toHaveValue("Temporary sample name");
  await expect(email).toHaveValue("temporary@workspace.test");
  await expect(workspaceName).toHaveValue("Temporary sample workspace");
  await expect(page.getByRole("status")).toContainText(/unsaved/i);
  await page.reload();
  await expect(displayName).toHaveValue("Jordan Kim");
  await expect(email).toHaveValue("jordan@workspace.test");
  await expect(workspaceName).toHaveValue("Sample Workspace");
  await expect(page.getByRole("status")).toBeEmpty();
  await navigateFoundation(page, "Team");
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await navigateFoundation(page, "Dashboard");
  await expect(page).toHaveURL(/\/application$/);
  await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true }).locator("tbody th")).toHaveText(initialTitles);
});

test("foundation profile menu is keyboard operable and cannot sign out", async ({ page }) => {
  const profile = page.getByRole("button", { name: "JK Jordan Kim", exact: true });
  await profile.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Profile", exact: true });
  const signout = menu.getByRole("menuitem", { name: "Sign out", exact: true });
  await expect(menu).toBeInViewport();
  await expect(signout).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\/application$/);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(profile).toBeFocused();
  await profile.click();
  await page.getByRole("heading", { name: "Project dashboard", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(profile).toBeFocused();
  await profile.press("ArrowUp");
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
});

test("foundation direct routes retain noindex, readable reflow and keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/login", "/settings/team", "/settings"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(page.getByRole("main")).not.toContainText(/UI preview|sample data|changes are not saved|unavailable|not an approved access policy|not a real account|preview settings/i);
    await expect(page.getByRole("main").locator('[disabled], [aria-disabled="true"]')).toHaveCount(0);
    await expect(page.getByRole("main")).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const field of await page.locator("main input").all()) {
      await field.focus();
      await expect(field).toBeInViewport();
      expect(await field.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(3);
    }
    if (route === "/settings/team") {
      await page.getByRole("tab", { name: "Roles", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const moving = await page.locator("body *").evaluateAll(elements => elements.some(element => {
      const style = getComputedStyle(element);
      return style.animationName !== "none" || style.transitionDuration.split(",").some(duration => parseFloat(duration) > 0);
    }));
    expect(moving).toBe(false);
  }
});

async function activateInert(page: Page, control: Locator, type = "button") {
  await expect(control).toBeEnabled();
  await expect(control).not.toHaveAttribute("aria-disabled");
  await expect(control).toHaveAttribute("type", type);
  const url = page.url();
  const main = page.getByRole("main");
  const content = await main.innerText();
  const fields = await main.locator("input").evaluateAll(inputs => inputs.map(element => {
    const input = element as HTMLInputElement;
    return { value: input.value, checked: input.checked };
  }));
  const requests: string[] = [];
  const recordRequest = (request: { method(): string; url(): string }) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  page.on("request", recordRequest);
  try {
    for (const action of ["click", "Enter", "Space"]) {
      if (action === "click") await control.click();
      else await control.press(action);
      await expect(page).toHaveURL(url);
      expect(await main.innerText()).toBe(content);
      expect(await main.locator("input").evaluateAll(inputs => inputs.map(element => {
        const input = element as HTMLInputElement;
        return { value: input.value, checked: input.checked };
      }))).toEqual(fields);
      await expect(main.getByRole("dialog")).toHaveCount(0);
      await expect(main.getByRole("alert")).toHaveCount(0);
    }
    expect(requests).toEqual([]);
  } finally {
    page.off("request", recordRequest);
  }
}

test("cleanup enabled placeholders remain inert by pointer and keyboard without API, auth, save, logout or persistence effects", async ({ page, context, baseURL }) => {
  test.setTimeout(60_000);
  const effects: string[] = [];
  page.on("download", () => effects.push("download"));
  page.on("dialog", async dialog => { effects.push("dialog"); await dialog.dismiss(); });
  page.on("console", message => {
    if (message.text().startsWith("cleanup-side-effect:")) effects.push(message.text());
  });
  await page.addInitScript(() => {
    window.print = () => console.debug("cleanup-side-effect:print");
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      console.debug("cleanup-side-effect:storage");
      return setItem.call(this, key, value);
    };
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
    Object.defineProperty(Document.prototype, "cookie", {
      ...cookie,
      set(value: string) {
        console.debug("cleanup-side-effect:cookie");
        cookie.set!.call(this, value);
      },
    });
  });
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== baseURL || request.method() !== "GET"
      || (["fetch", "xhr"].includes(request.resourceType()) && request.headers().rsc !== "1")) {
      effects.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });
  await page.goto("/application");
  await page.evaluate(() => document.fonts.ready);
  for (const name of ["Northwind Studio", "Notifications (3 unread)", "List view", "Export", "Filters", "Table settings", "New board", "Print", "Duplicate", "Export CSV"]) {
    await activateInert(page, page.getByRole("button", { name, exact: true }));
  }
  await page.getByRole("button", { name: `Actions for ${initialTitles[0]}`, exact: true }).click();
  const rowActions = page.getByRole("menu").getByRole("menuitem");
  await expect(rowActions).toHaveCount(4);
  for (const action of await rowActions.all()) await activateInert(page, action);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true }).locator("tbody th")).toHaveText(initialTitles);
  await navigateFoundation(page, "Team");
  const memberActions = page.getByRole("tabpanel").getByRole("button");
  await expect(memberActions).toHaveCount(8);
  for (const action of await memberActions.all()) await activateInert(page, action);
  await expect(page.getByRole("table", { name: "Members", exact: true }).getByRole("rowheader")).toContainText(["Jordan Kim", "Alex Rivera", "Maya Chen"]);
  await page.getByRole("tab", { name: "Roles", exact: true }).click();
  for (const name of ["Edit permissions", "Save role"]) await activateInert(page, page.getByRole("button", { name, exact: true }));
  await navigateFoundation(page, "Settings");
  await page.getByRole("textbox", { name: "Display name", exact: true }).fill("Unsaved sample");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("unsaved@workspace.test");
  await page.getByRole("textbox", { name: "Workspace name", exact: true }).fill("Unsaved workspace");
  await activateInert(page, page.getByRole("button", { name: "Save changes", exact: true }));
  await expect(page.getByRole("status")).toContainText(/unsaved/i);
  await page.getByRole("button", { name: "JK Jordan Kim", exact: true }).click();
  await activateInert(page, page.getByRole("menuitem", { name: "Sign out", exact: true }));
  await page.keyboard.press("Escape");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("sample@workspace.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-not-a-credential");
  await activateInert(page, page.getByRole("button", { name: "Sign in", exact: true }), "submit");
  expect(effects).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});
