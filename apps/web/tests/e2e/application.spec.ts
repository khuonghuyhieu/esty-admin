import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertBrowserCredentialIsolation, browserTransition, clearBrowserSession, currentMe, enterPassword, fetchInterceptedRoute, fixtureControl, registerBrowserSession, sessionFixture, signIn } from "./app-session-fixture";

declare global {
  interface Window {
    __sessionCspViolations?: string[];
    __sessionLifecycleStarts?: number;
    __navigationEvidence?: { header: Element | null; sidebar: Element | null; checking: number };
    __pageCacheEvidence?: { hides: { persisted: boolean; privateVisible: boolean }[]; shows: boolean[] };
  }
}

const initialTitles = ["Sprint retro — June", "Q2 Product Planning", "Design System v3", "User research synthesis", "Mobile UX — Checkout flow"];

test.beforeEach(async ({ page }, info) => {
  sessionFixture();
  await page.context().addInitScript(() => {
    const NativeChannel = window.BroadcastChannel;
    window.__sessionLifecycleStarts = 0;
    window.BroadcastChannel = class extends NativeChannel {
      constructor(name: string) {
        super(name);
        if (name === "lovora-app-session") window.__sessionLifecycleStarts!++;
      }
    };
    const violations: string[] = [];
    Object.defineProperty(window, "__sessionCspViolations", { value: violations });
    document.addEventListener("securitypolicyviolation", event => violations.push(event.effectiveDirective));
  });
  if (info.tags.includes("@display-freshness")) await page.clock.install();
  if (info.tags.includes("@signed-out")) await page.goto("/login");
  else await signIn(page);
  await page.evaluate(() => document.fonts.ready);
});

test.afterEach(async ({ context, page }, info) => {
  await clearBrowserSession(context);
  if (!info.tags.includes("@csp-injection")) {
    expect(await page.evaluate(() => window.__sessionCspViolations)).toEqual([]);
  }
});

test("admitted application is complete, separate from public chrome, and nonindexable", async ({ page }) => {
  await page.goto("/application");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator(".site-header, .site-footer, .draft-banner")).toHaveCount(0);
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

test("sign-in validates accessibly, reports generic invalid credentials and admits the actual owner", { tag: "@signed-out" }, async ({ page }) => {
  const account = sessionFixture().identities.owner;
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await expect(submit).toBeEnabled();
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
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
  await email.fill(account.email);
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
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Email or password is incorrect");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toHaveCount(0);
  await expect(password).toHaveValue("");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await enterPassword(page, account.password);
  await submit.click();
  await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toBeVisible();
  expect((await currentMe(page)).profile.userId).toBe(account.userId);
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
  await page.evaluate(() => { document.documentElement.dataset.navigationDocument = "application"; });
  await navigateFoundation(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  expect(await page.locator("html").getAttribute("data-navigation-document")).toBe("application");
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
  await page.evaluate(() => { document.documentElement.dataset.navigationDocument = "settings"; });
  await navigateFoundation(page, "Team");
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await navigateFoundation(page, "Dashboard");
  await expect(page).toHaveURL(/\/application$/);
  expect(await page.locator("html").getAttribute("data-navigation-document")).toBe("settings");
  await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true }).locator("tbody th")).toHaveText(initialTitles);
});

test("current profile menu is keyboard operable and local logout revokes only this actual browser session", async ({ page, context }) => {
  const browserSession = await registerBrowserSession(context);
  const independent = await fixtureControl("issue-session", { identity: "owner" });
  const profile = page.locator('header button[aria-haspopup="menu"]');
  await profile.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Profile", exact: true });
  const signout = menu.getByRole("menuitem", { name: "Sign out", exact: true });
  await expect(menu).toBeInViewport();
  await expect(signout).toBeFocused();
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
  await profile.click();
  await signout.press("Enter");
  await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("This session was revoked");
  expect(await fixtureControl("replay", { handle: browserSession.handle })).toEqual({ status: 401, code: "unauthenticated" });
  expect(await fixtureControl("replay", { handle: independent.handle })).toEqual({ status: 200 });
  await page.goto("/application");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fapplication$/);
});

test("foundation direct routes retain noindex, readable reflow and keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/settings/team", "/settings"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(response!.headers()["content-security-policy"]).toContain("script-src 'nonce-");
    expect(response!.headers()["cache-control"]).toContain("private");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
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

async function activateInert(page: Page, control: Locator) {
  await expect(control).toBeEnabled();
  await expect(control).not.toHaveAttribute("aria-disabled");
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

test("sample project, Team and Settings controls remain local and do not create business writes or persistence effects", async ({ page, baseURL }) => {
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
      || (["fetch", "xhr"].includes(request.resourceType()) && request.headers().rsc !== "1" && !["/api/auth/context", "/api/app/me"].includes(url.pathname))) {
      effects.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });
  await page.goto("/application");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
  const me = await currentMe(page);
  for (const name of [me.workspace.displayName, "Notifications (3 unread)", "List view", "Export", "Filters", "Table settings", "New board", "Print", "Duplicate", "Export CSV"]) {
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
  expect(effects).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("real Auth without current membership remains unadmitted and can sign out", { tag: "@signed-out" }, async ({ page, context }) => {
  for (const identity of ["unadmitted", "disabled"] as const) {
    const account = sessionFixture().identities[identity];
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await enterPassword(page, account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Access is unavailable");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/app/me", { cache: "no-store" });
      return { status: response.status, body: await response.json() };
    });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe("forbidden");
    expect(Object.keys(result.body).sort()).toEqual(["code", "requestId"]);
    const registered = await registerBrowserSession(context);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("This session was revoked");
    expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(401);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  }
});

test("direct protected requests and unsafe return destinations cannot bypass admission", { tag: "@signed-out" }, async ({ page }) => {
  for (const path of ["/application", "/settings", "/settings/team"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=${encodeURIComponent(path)}$`));
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  }
  const account = sessionFixture().identities.owner;
  await page.goto("/login?returnTo=%2F%2Fevil.example.test");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await enterPassword(page, account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/application$/);
  await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
});

test("current identity uses HttpOnly bounded cookies without browser-visible protected credentials", { tag: ["@signed-out", "@security-desktop"] }, async ({ page }) => {
  const bodies: Promise<string>[] = [];
  const forbiddenHeaders: boolean[] = [];
  const unexpectedOrigins: string[] = [];
  page.on("response", response => {
    if (new URL(response.url()).origin === sessionFixture().webEnv.APP_ORIGIN && /json|javascript|text\/html/.test(response.headers()["content-type"] ?? "")) {
      bodies.push(response.text().catch(() => ""));
    }
  });
  page.on("request", request => {
    if (new URL(request.url()).origin !== sessionFixture().webEnv.APP_ORIGIN) unexpectedOrigins.push(new URL(request.url()).origin);
    const headers = request.headers();
    forbiddenHeaders.push(["authorization", "x-app-access-token", "apikey"].some(name => name in headers));
  });
  await signIn(page);
  const response = await page.request.get(`${sessionFixture().webEnv.APP_ORIGIN}/api/app/me`, { headers: { "sec-fetch-site": "same-origin" } });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("private");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers().pragma).toBe("no-cache");
  expect(response.headers().vary).toContain("Cookie");
  await assertBrowserCredentialIsolation(page, await Promise.all(bodies));
  expect(forbiddenHeaders.some(Boolean)).toBe(false);
  expect(unexpectedOrigins).toEqual([]);
});

test("real BFF rejects forged boundaries and duplicate or tampered cookies without a recovery loop", { tag: ["@signed-out", "@security-desktop"] }, async ({ page, context }) => {
  const origin = sessionFixture().webEnv.APP_ORIGIN;
  for (const [path, method, allowed] of [["/api/auth/logout", "GET", "POST"], ["/api/app/me", "POST", "GET"]] as const) {
    const denied = await context.request.fetch(`${origin}${path}`, { method });
    expect(denied.status()).toBe(405);
    expect(denied.headers()["allow"]).toBe(allowed);
    expect(denied.headers()["cache-control"]).toBe("private, no-store");
    expect(denied.headers()["pragma"]).toBe("no-cache");
    expect(denied.headers()["vary"]).toContain("Cookie");
    expect(denied.headers()["set-cookie"]).toBeUndefined();
    expect(await denied.json()).toEqual({ code: "invalid_request", requestId: denied.headers()["x-request-id"] });
  }
  const state = await page.evaluate(async () => (await fetch("/api/auth/context")).json()) as { csrf: string; generation: string };
  for (const headers of [
    { origin: "null", "sec-fetch-site": "same-origin", "x-csrf-token": state.csrf },
    { origin: "https://foreign.example.test", "sec-fetch-site": "same-origin", "x-csrf-token": state.csrf },
    { origin, "sec-fetch-site": "cross-site", "x-csrf-token": state.csrf },
    { origin, "sec-fetch-site": "same-origin", "x-csrf-token": "wrong" },
  ]) {
    const denied = await context.request.post(`${origin}/api/auth/begin`, { headers, data: { generation: state.generation } });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe("csrf_denied");
    expect(denied.headers()["set-cookie"]).toBeUndefined();
  }
  const extra = await context.request.post(`${origin}/api/auth/refresh`, {
    headers: { origin, "sec-fetch-site": "same-origin", "x-csrf-token": state.csrf },
    data: { generation: state.generation, refreshToken: "caller-selected-token" },
  });
  expect(extra.status()).toBe(400);
  const duplicate = await context.request.get(`${origin}/api/auth/context`, { headers: { "sec-fetch-site": "same-origin", cookie: "lovora-local-auth-context=one; lovora-local-auth-context=two" } });
  expect(duplicate.status()).toBe(400);
  expect(duplicate.headers()["set-cookie"]).toBeUndefined();
  try {
    await context.addCookies([{ name: "lovora-local-session", value: "v1.tampered", url: origin, httpOnly: true, sameSite: "Lax" }]);
    const denied = await context.request.get(`${origin}/api/app/me`, { headers: { "sec-fetch-site": "same-origin" } });
    expect(denied.status()).toBe(401);
    await context.addCookies([{ name: "lovora-local-auth-context", value: "duplicate", domain: "127.0.0.1", path: "/api", httpOnly: true, sameSite: "Lax" }]);
    await page.reload();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Clear this site's cookies");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  } finally { await context.clearCookies(); }
});

test("current role and disabled membership are enforced without waiting for JWT expiry", { tag: "@security-desktop" }, async ({ page, context }) => {
  await clearBrowserSession(context);
  await fixtureControl("set-member", { target: "member", role: "owner", status: "active" });
  try {
    const elevated = await signIn(page, "member");
    expect(elevated.membership.role).toBe("owner");
    expect(elevated.capabilities.includes("workspace.update")).toBe(true);
    await fixtureControl("set-member", { target: "member", role: "member" });
    const demoted = await currentMe(page);
    expect(demoted.membership.role).toBe("member");
    expect(demoted.capabilities.includes("workspace.update")).toBe(false);
    expect(demoted.capabilities.includes("audit.read")).toBe(false);
    await fixtureControl("set-member", { target: "member", status: "disabled" });
    await page.reload();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Access is unavailable");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  } finally { await fixtureControl("set-member", { target: "member", role: "member", status: "active" }); }
});

test("real database, API and technical-key faults fail unavailable without password or refresh loops", { tag: "@security-desktop" }, async ({ page }) => {
  test.setTimeout(90000);
  const userId = (await currentMe(page)).profile.userId;
  let refreshes = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/auth/refresh") refreshes++; });
  for (const target of ["database", "api", "technical-key"]) {
    try {
      await fixtureControl("fault", { target, active: true });
      await page.reload();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable", { timeout: 15000 });
      await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toHaveCount(0);
      expect(refreshes).toBe(0);
    } finally { await fixtureControl("fault", { target, active: false }); }
    await page.getByRole("button", { name: "Check session", exact: true }).click();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
    expect((await currentMe(page)).profile.userId).toBe(userId);
  }
});

test("real Auth outage clears this browser but never claims provider revocation", { tag: "@security-desktop" }, async ({ page, context }) => {
  const registered = await registerBrowserSession(context);
  try {
    await fixtureControl("fault", { target: "auth", active: true });
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Provider revocation could not be confirmed");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  } finally { await fixtureControl("fault", { target: "auth", active: false }); }
  expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(200);
  const response = await context.request.get(`${sessionFixture().webEnv.APP_ORIGIN}/api/app/me`, { headers: { "sec-fetch-site": "same-origin" } });
  expect(response.status()).toBe(401);
});

test("synthetic dropped logout acknowledgement stays unconfirmed despite actual provider revocation", { tag: "@security-desktop" }, async ({ page, context }) => {
  const registered = await registerBrowserSession(context);
  await page.route("**/api/auth/logout", async route => {
    await fetchInterceptedRoute(route);
    await route.abort("failed");
  });
  try {
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Sign-out was not confirmed");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(401);
  } finally { await page.unroute("**/api/auth/logout"); }
});

test("two user contexts and two tabs discard a synthetically delayed old read during actual logout", { tag: "@security-desktop" }, async ({ page, context, browser, baseURL }) => {
  const independent = await browser.newContext({ baseURL, viewport: page.viewportSize(), colorScheme: "light" });
  const memberPage = await independent.newPage();
  const second = await context.newPage();
  const captured = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let held = false;
  try {
    const member = await signIn(memberPage, "member");
    expect(member.profile.userId).not.toBe(sessionFixture().identities.owner.userId);
    expect(member.membership.role).toBe("member");
    expect(member.membership.status).toBe("active");
    const owner = await currentMe(page);
    const [ownerDocument, memberDocument] = await Promise.all([page.goto("/application"), memberPage.goto("/application")]);
    for (const response of [ownerDocument!, memberDocument!]) {
      expect(response.headers()["cache-control"]).toContain("private");
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    expect(ownerDocument!.headers()["content-security-policy"]).not.toBe(memberDocument!.headers()["content-security-policy"]);
    const [ownerHtml, memberHtml] = await Promise.all([ownerDocument!.text(), memberDocument!.text()]);
    for (const html of [ownerHtml, memberHtml]) {
      expect([owner.profile.userId, member.profile.userId, owner.email, member.email].some(value => html.includes(value))).toBe(false);
    }
    await expect(page.locator('header button[aria-haspopup="menu"]')).toContainText(owner.profile.displayName);
    await expect(memberPage.locator('header button[aria-haspopup="menu"]')).toContainText(member.profile.displayName);
    await second.goto("/application");
    await expect(second.locator('header button[aria-haspopup="menu"]')).toBeVisible();
    const registered = await registerBrowserSession(context);
    await page.route("**/api/app/me", async route => {
      if (held) { await route.continue(); return; }
      held = true;
      try {
        const response = await fetchInterceptedRoute(route);
        captured.resolve();
        await release.promise;
        await route.fulfill({ response });
      } catch (error) { captured.reject(error); }
    });
    await page.reload();
    await captured.promise;
    await second.locator('header button[aria-haspopup="menu"]').click();
    await second.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(second.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    release.resolve();
    await expect(second.getByRole("status")).toContainText("This session was revoked");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(401);
    expect((await currentMe(memberPage)).profile.userId).toBe(member.profile.userId);
    await page.goto("/privacy");
    await page.goBack();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapplication$/);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  } finally {
    release.resolve();
    await page.unroute("**/api/app/me");
    await second.close();
    await clearBrowserSession(independent);
    await independent.close();
  }
});

test("synthetic late real refresh response cannot adopt a newer begin or display the old identity", { tag: "@security-desktop" }, async ({ page, context }) => {
  const second = await context.newPage();
  const captured = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route("**/api/auth/refresh", async route => {
    try {
      const response = await fetchInterceptedRoute(route);
      captured.resolve();
      await release.promise;
      await route.fulfill({ response });
    } catch (error) { captured.reject(error); }
  });
  try {
    // Deliberately bypass the client Web Lock to inject an out-of-protocol late cookie response.
    const late = browserTransition(page, "refresh");
    await captured.promise;
    await second.goto("/privacy");
    expect((await browserTransition(second, "begin")).status).toBe(200);
    const member = await signIn(second, "member");
    release.resolve();
    expect((await late).status).toBe(200);
    const me = await second.evaluate(async () => {
      const response = await fetch("/api/app/me", { cache: "no-store" });
      return { status: response.status, body: await response.json() };
    });
    expect(me.status).toBe(401);
    expect(me.body.code).toBe("unauthenticated");
    await expect(second.locator('header button[aria-haspopup="menu"]')).toContainText(member.profile.displayName);
    await second.reload();
    await expect(second).toHaveURL(/\/login\?returnTo=%2Fapplication$/);
    await expect(second.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  } finally {
    release.resolve();
    await page.unroute("**/api/auth/refresh");
    await second.close();
  }
});

test("revoked refresh and replayed old sealed cookies never restore admission or retry across reload and protected navigation", { tag: "@security-desktop" }, async ({ page, context }, info) => {
  const origin = sessionFixture().webEnv.APP_ORIGIN;
  const prior = await context.cookies(origin);
  const registered = await registerBrowserSession(context);
  await page.locator('header button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("This session was revoked");
  expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(401);
  // Synthetic cookie replay uses the real revoked provider session, not a forged JWT.
  await context.addCookies(prior);
  let refreshes = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/auth/refresh") refreshes++; });
  await page.goto("/application");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fapplication$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  expect(refreshes).toBe(1);
  expect((await context.cookies(origin)).some(cookie => cookie.name === "lovora-local-session")).toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  for (const path of ["/application", "/settings", "/settings/team"]) {
    await page.goto(path);
    await expect(page).toHaveURL(`${origin}/login?returnTo=${encodeURIComponent(path)}`);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  }
  expect(refreshes).toBe(1);
  await page.screenshot({ path: info.outputPath("definitive-refresh-signed-out.png"), fullPage: true });
});

test("unsupported browser coordination fails explicitly without blocking public pages", { tag: ["@signed-out", "@security-desktop"] }, async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "locks", { configurable: true, value: undefined }));
  await page.reload();
  await expect(page.getByRole("status")).toContainText("cannot safely manage sessions");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /privacy/i }).first()).toBeVisible();
});

test("current application and sign-in surfaces preserve readable keyboard/mobile layout", async ({ page, context }, info) => {
  for (const [route, name] of [["/application", "application"], ["/settings/team", "team"], ["/settings", "settings"]]) {
    await page.goto(route);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  }
  await clearBrowserSession(context);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("login.png"), fullPage: true });
});

test("actual300s expiry coordinates one refresh across two tabs and SSR before confirmed logout", { tag: "@security-desktop" }, async ({ page, context }) => {
  test.setTimeout(420000);
  const before = await currentMe(page);
  const registered = await registerBrowserSession(context);
  const second = await context.newPage();
  try {
    await second.goto("/application");
    await expect(second.locator('header button[aria-haspopup="menu"]')).toBeVisible();
    // GoTrue and Nest use their real external clocks: fake timers would not exercise actual JWT expiry.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, registered.expiresAt - Date.now() + 1000)));
    const expired = await context.request.get(`${sessionFixture().webEnv.APP_ORIGIN}/api/app/me`, { headers: { "sec-fetch-site": "same-origin" } });
    expect(expired.status()).toBe(401);
    expect(expired.headers()["set-cookie"]).toBeUndefined();
    let refreshes = 0;
    const count = (request: { url(): string }) => { if (new URL(request.url()).pathname === "/api/auth/refresh") refreshes++; };
    page.on("request", count);
    second.on("request", count);
    await Promise.all([page.reload(), second.reload()]);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
    await expect(second.locator('header button[aria-haspopup="menu"]')).toBeVisible();
    expect(refreshes).toBe(1);
    const after = await currentMe(page);
    expect(after.profile.userId).toBe(before.profile.userId);
    expect(after.membership.role).toBe(before.membership.role);
    expect(after.capabilities).toEqual(before.capabilities);
    const refreshed = await registerBrowserSession(context);
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("This session was revoked");
    await expect(second.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    expect((await fixtureControl("replay", { handle: refreshed.handle })).status).toBe(401);
  } finally { await second.close(); }
});

test("synthetic blocked logout stays concealed on page return until an explicit successful retry", { tag: "@security-desktop" }, async ({ page, context }) => {
  const registered = await registerBrowserSession(context);
  await page.route("**/api/auth/logout", route => route.abort("failed"));
  try {
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Sign-out was not confirmed");
    let reads = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/app/me") reads++; });
    await page.evaluate(async () => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      await navigator.locks.request("lovora-app-session", () => undefined);
    });
    expect(reads).toBe(0);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Sign-out was not confirmed");
    expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(200);
    await page.unroute("**/api/auth/logout");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("This session was revoked");
    expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(401);
  } finally { await page.unroute("**/api/auth/logout"); }
});

test("late definitive refresh401 cannot clear a newer actual Member generation", { tag: "@security-desktop" }, async ({ page, context, browser, baseURL }) => {
  const origin = sessionFixture().webEnv.APP_ORIGIN;
  const independent = await browser.newContext({ baseURL, viewport: page.viewportSize(), colorScheme: "light" });
  const memberPage = await independent.newPage();
  const captured = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let begins = 0;
  try {
    const member = await signIn(memberPage, "member");
    const newerCookies = await independent.cookies(origin);
    const prior = await context.cookies(origin);
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("This session was revoked");
    await context.addCookies(prior);
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/auth/begin") begins++; });
    await page.route("**/api/auth/refresh", async route => {
      try {
        const response = await fetchInterceptedRoute(route, 401);
        expect(response.headers()["set-cookie"]).toBeUndefined();
        captured.resolve();
        await release.promise;
        await route.fulfill({ response });
      } catch (error) { captured.reject(error); }
    });
    await page.goto("/application");
    await captured.promise;
    // Deliberate out-of-protocol cookie delivery uses an independently admitted real Member session.
    await context.addCookies(newerCookies);
    release.resolve();
    await expect(page.getByRole("status")).toContainText("session changed in another tab");
    expect(begins).toBe(0);
    expect(JSON.stringify(await context.cookies(origin)) === JSON.stringify(newerCookies)).toBe(true);
    await page.getByRole("button", { name: "Check session", exact: true }).click();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toContainText(member.profile.displayName);
    expect((await currentMe(page)).profile.userId).toBe(member.profile.userId);
    await page.reload();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toContainText(member.profile.displayName);
    expect(begins).toBe(0);
  } finally {
    release.resolve();
    await page.unroute("**/api/auth/refresh");
    await clearBrowserSession(independent);
    await independent.close();
  }
});

test("transient refresh503 preserves actual cookies without cleanup or retry", { tag: "@security-desktop" }, async ({ page, context }) => {
  const origin = sessionFixture().webEnv.APP_ORIGIN;
  const userId = (await currentMe(page)).profile.userId;
  const original = JSON.stringify(await context.cookies(origin));
  let refreshes = 0;
  let begins = 0;
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/refresh") refreshes++;
    if (path === "/api/auth/begin") begins++;
  });
  // A labeled expired-me response triggers refresh immediately; Auth outage itself is real.
  await page.route("**/api/app/me", route => route.fulfill({
    status: 401, json: { code: "unauthenticated", requestId: "33333333-3333-4333-8333-333333333333" },
  }));
  try {
    await fixtureControl("fault", { target: "auth", active: true });
    // A paired page-cache boundary discards display freshness before the synthetic expired-me response.
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable", { timeout: 15000 });
    await page.evaluate(() => navigator.locks.request("lovora-app-session", () => undefined));
    expect(refreshes).toBe(1);
    expect(begins).toBe(0);
    expect(JSON.stringify(await context.cookies(origin)) === original).toBe(true);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
  } finally {
    await fixtureControl("fault", { target: "auth", active: false });
    await page.unroute("**/api/app/me");
  }
  await page.getByRole("button", { name: "Check session", exact: true }).click();
  await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
  expect((await currentMe(page)).profile.userId).toBe(userId);
});

test("nonce CSP overrides untrusted document headers, blocks injected elements and permits existing style attributes", { tag: ["@signed-out", "@csp-injection"] }, async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-nonce": "untrusted-nonce", "content-security-policy": "script-src 'unsafe-inline'" });
  // Inject into parsed document HTML, not a privileged DevTools evaluation.
  await page.route("**/login", async route => {
    const documentResponse = await route.fetch();
    const body = (await documentResponse.text()).replace(
      "</head>",
      "<script data-untrusted-injection>document.documentElement.dataset.untrustedScript = 'executed'</script></head>",
    );
    await route.fulfill({ response: documentResponse, body });
  }, { times: 1 });
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  const policy = response!.headers()["content-security-policy"];
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  expect(policy).not.toContain("untrusted");
  expect(policy.split(";").find(value => value.trim().startsWith("script-src"))).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(response!.headers()["cache-control"]).toContain("private");
  expect(response!.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(await page.locator("script:not([data-untrusted-injection])").evaluateAll((scripts, expected) => scripts.every(script => script instanceof HTMLScriptElement && script.nonce === expected), nonce)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__sessionCspViolations ?? [])).toEqual(["script-src-elem"]);
  await page.evaluate(expected => {
    const blocked = document.createElement("style");
    blocked.textContent = "body { --untrusted-style: applied; }";
    document.head.append(blocked);
    const trusted = document.createElement("style");
    trusted.nonce = expected!;
    trusted.textContent = "body { --trusted-style: applied; }";
    document.head.append(trusted);
    document.querySelector("main")!.setAttribute("style", "--allowed-attribute: applied");
  }, nonce);
  await expect.poll(() => page.evaluate(() => (window.__sessionCspViolations ?? []).slice().sort())).toEqual(["script-src-elem", "style-src-elem"]);
  expect(await page.locator("html").getAttribute("data-untrusted-script")).toBeNull();
  expect(await page.locator("body").evaluate(element => getComputedStyle(element).getPropertyValue("--untrusted-style"))).toBe("");
  expect((await page.locator("body").evaluate(element => getComputedStyle(element).getPropertyValue("--trusted-style"))).trim()).toBe("applied");
  expect((await page.locator("main").evaluate(element => getComputedStyle(element).getPropertyValue("--allowed-attribute"))).trim()).toBe("applied");
  const account = sessionFixture().identities.owner;
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await enterPassword(page, account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/application$/);
  expect((await currentMe(page)).profile.userId).toBe(account.userId);
  const nextDocument = await page.reload();
  expect(/'nonce-([^']+)'/.exec(nextDocument!.headers()["content-security-policy"])?.[1]).not.toBe(nonce);
  await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
  expect(await page.evaluate(() => window.__sessionCspViolations ?? [])).toEqual([]);
});

test("public connectivity entry creates a protected document and public exit removes its nonce policy", async ({ page }) => {
  test.skip(process.env.APP_SESSION_E2E_PROFILE !== "activation001", "Requires the separately owned activation local connectivity surface");
  const publicDocument = await page.goto("/connectivity");
  expect(publicDocument?.status()).toBe(200);
  expect(publicDocument!.headers()["content-security-policy"]).toBeUndefined();
  await page.evaluate(() => { document.documentElement.dataset.navigationDocument = "public"; });
  const [protectedDocument] = await Promise.all([
    page.waitForResponse(response => response.request().isNavigationRequest() && new URL(response.url()).pathname === "/application"),
    page.getByRole("link", { name: "Application preview", exact: true }).click(),
  ]);
  expect(protectedDocument.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
  expect(await page.locator("html").getAttribute("data-navigation-document")).toBeNull();
  expect((await currentMe(page)).membership.role).toBe("owner");
  expect(await page.evaluate(() => window.__sessionCspViolations ?? [])).toEqual([]);
  // The current application has no public-exit product link; direct document navigation preserves that boundary.
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  expect(home!.headers()["content-security-policy"]).toBeUndefined();
  await page.getByRole("link", { name: "Read the privacy overview", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy overview");
});

test("persistent protected navigation keeps chrome and controller through delayed content and stale history", { tag: "@display-freshness" }, async ({ page }, info) => {
  const starts = await page.evaluate(() => {
    window.__navigationEvidence = { header: document.querySelector("header"), sidebar: document.querySelector("aside"), checking: 0 };
    new MutationObserver(() => {
      if (document.body.innerText.includes("Checking your session")) window.__navigationEvidence!.checking++;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    return window.__sessionLifecycleStarts;
  });
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  await page.route("**/settings?*", async route => {
    if (route.request().headers().rsc !== "1") return route.continue();
    reached.resolve();
    await release.promise;
    await route.continue();
  });
  try {
    await navigateFoundation(page, "Settings");
    await reached.promise;
    await expect(page).toHaveURL(/\/application$/);
    await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true })).toBeVisible();
    await expect(page.locator("[data-route-pending=true]")).toHaveAttribute("inert", "");
    await expect(page.getByRole("status", { name: "", exact: true }).filter({ hasText: /^Loading…$/ })).toBeVisible();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
    await expect(page.getByText("Checking your session…", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("navigation-pending.png"), fullPage: true });
  } finally { release.resolve(); }
  await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toBeVisible();
  await page.unroute("**/settings?*");
  for (const [name, path, heading] of [
    ["Team", "/settings/team", "Your team"], ["Dashboard", "/application", "Whiteboard projects"],
    ["Settings", "/settings", "Account"],
  ] as const) {
    await navigateFoundation(page, name);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator("aside").getByRole("link", { name: name === "Team" ? "Team 3" : name, exact: true, includeHidden: true })).toHaveAttribute("aria-current", "page");
    if (page.viewportSize()!.width < 1024) {
      await expect(page.getByRole("dialog", { name: "Application navigation" })).not.toBeVisible();
      await expect(page.getByRole("button", { name: "Open sidebar", exact: true })).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`navigation-${name.toLowerCase()}.png`), fullPage: true });
  }
  for (const direction of ["back", "forward"] as const) {
    // Synthetic elapsed display time; Auth/BFF/Nest responses remain real.
    await page.clock.fastForward(60000);
    const contextReached = Promise.withResolvers<void>(), releaseContext = Promise.withResolvers<void>();
    await page.route("**/api/auth/context", async route => {
      const response = await fetchInterceptedRoute(route);
      contextReached.resolve(); await releaseContext.promise;
      await route.fulfill({ response });
    });
    try {
      if (direction === "back") await page.goBack();
      else await page.goForward();
      await contextReached.promise;
      await expect(page.getByRole("heading", { name: direction === "back" ? "Account" : "Whiteboard projects", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: direction === "back" ? "Settings" : "Project dashboard", exact: true })).toBeVisible();
      await expect(page.locator("[data-route-pending=true]")).toHaveAttribute("inert", "");
      await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`history-${direction}-pending.png`), fullPage: true });
    } finally {
      releaseContext.resolve();
      await page.unrouteAll({ behavior: "wait" });
    }
    await expect(page).toHaveURL(new RegExp(direction === "back" ? "/application$" : "/settings$"));
    await expect(page.getByRole("heading", { name: direction === "back" ? "Whiteboard projects" : "Account", exact: true })).toBeVisible();
    await expect(page.locator("[data-route-pending=true]")).toHaveCount(0);
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
  }
  const evidence = await page.evaluate(() => ({
    headerRetained: window.__navigationEvidence!.header === document.querySelector("header"),
    sidebarRetained: window.__navigationEvidence!.sidebar === document.querySelector("aside"),
    checkingObserved: window.__navigationEvidence!.checking,
    controllerStarts: window.__sessionLifecycleStarts,
  }));
  expect(evidence).toEqual({ headerRetained: true, sidebarRetained: true, checkingObserved: 0, controllerStarts: starts });
  await info.attach("navigation-transition", { body: JSON.stringify(evidence), contentType: "application/json" });
  await assertBrowserCredentialIsolation(page);
});

test("persistent route admission propagates real current membership denial and API outage before held context", { tag: ["@security-desktop", "@display-freshness"] }, async ({ page, context }, testInfo) => {
  await clearBrowserSession(context);
  await signIn(page, "member");
  await fixtureControl("set-member", { target: "member", status: "disabled" });
  await page.clock.fastForward(60000);
  let currentMeReads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/app/me") currentMeReads++; });
  const deniedContext = Promise.withResolvers<void>(), releaseDeniedContext = Promise.withResolvers<void>();
  await page.route("**/api/auth/context", async route => {
    const response = await fetchInterceptedRoute(route);
    deniedContext.resolve();
    await releaseDeniedContext.promise;
    await route.fulfill({ response });
  });
  try {
    await navigateFoundation(page, "Settings");
    await deniedContext.promise;
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Access is unavailable");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toHaveCount(0);
    expect(currentMeReads).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("membership-denial-context-held.png") });
    releaseDeniedContext.resolve();
  } finally {
    releaseDeniedContext.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await fixtureControl("set-member", { target: "member", status: "active" });
  }
  await page.getByRole("link", { name: "Go to sign in" }).click();
  await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toBeVisible();
  await fixtureControl("fault", { target: "api", active: true });
  await page.clock.fastForward(60000);
  const outageContext = Promise.withResolvers<void>(), releaseOutageContext = Promise.withResolvers<void>();
  await page.route("**/api/auth/context", async route => {
    const response = await fetchInterceptedRoute(route);
    outageContext.resolve();
    await releaseOutageContext.promise;
    await route.fulfill({ response });
  });
  try {
    await navigateFoundation(page, "Team");
    await outageContext.promise;
    await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your team", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("api-outage-context-held.png") });
    releaseOutageContext.resolve();
  } finally {
    releaseOutageContext.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await fixtureControl("fault", { target: "api", active: false });
  }
  await page.getByRole("button", { name: "Check session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your team", exact: true })).toBeVisible();
});

test("delayed protected route payload cannot resurrect admission after real local logout", { tag: "@security-desktop" }, async ({ page, context }) => {
  const registered = await registerBrowserSession(context);
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  await page.route("**/settings?*", async route => {
    if (route.request().headers().rsc !== "1") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    reached.resolve();
    await release.promise;
    await route.fulfill({ response });
  });
  try {
    await navigateFoundation(page, "Settings");
    await reached.promise;
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("This session was revoked");
    release.resolve();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toHaveCount(0);
    expect((await fixtureControl("replay", { handle: registered.handle })).status).toBe(401);
  } finally { release.resolve(); await page.unroute("**/settings?*"); }
});

test("rapid fresh sample navigation never refetches admission or exposes stale controls", { tag: "@security-desktop" }, async ({ page }) => {
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const reads: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/app/me") reads.push(request.url()); });
  await page.route("**/settings?*", async route => {
    if (route.request().headers().rsc !== "1") return route.continue();
    reached.resolve(); await release.promise; await route.continue();
  });
  try {
    await navigateFoundation(page, "Settings");
    await reached.promise;
    await expect(page).toHaveURL(/\/application$/);
    await navigateFoundation(page, "Team");
    release.resolve();
    await expect(page).toHaveURL(/\/settings\/team$/);
    await expect(page.getByRole("heading", { name: "Your team", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toHaveCount(0);
    await expect(page.locator("[data-route-pending=true]")).toHaveCount(0);
    expect(reads).toEqual([]);
  } finally { release.resolve(); await page.unrouteAll({ behavior: "wait" }); }
});

test("sample RSC delivery never serializes actual private identity before current admission", { tag: "@security-desktop" }, async ({ page, context }) => {
  await clearBrowserSession(context);
  const me = await signIn(page, "member");
  await fixtureControl("set-member", { target: "member", status: "disabled" });
  try {
    for (const path of ["/application", "/settings", "/settings/team"]) {
      const response = await context.request.get(path, { headers: { RSC: "1", "sec-fetch-site": "same-origin" } });
      expect(response.status()).toBe(200);
      const payload = await response.text();
      for (const secret of [me.profile.userId, me.email, me.profile.displayName, me.workspace.id, me.workspace.displayName]) {
        expect(payload).not.toContain(secret);
      }
    }
    await page.goto("/settings");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Access is unavailable");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toHaveCount(0);
  } finally { await fixtureControl("set-member", { target: "member", status: "active" }); }
});

test("navigation indicator waits150ms and a fast completed transition cancels it", { tag: "@security-desktop" }, async ({ page }) => {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  await page.route("**/settings?*", async route => {
    if (route.request().headers().rsc !== "1") return route.continue();
    reached.resolve(); await release.promise; await route.continue();
  });
  try {
    await page.locator('aside a[href="/settings"]').evaluate((link: HTMLAnchorElement) => link.click());
    await reached.promise;
    await page.clock.runFor(149);
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/application$/);
    await page.clock.runFor(1);
    await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
    await page.locator('aside a[href="/settings"]').evaluate((link: HTMLAnchorElement) => link.click());
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
    await page.clock.runFor(149);
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
    release.resolve();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator("[data-route-pending=true]")).toHaveCount(0);
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
  } finally { release.resolve(); await page.unrouteAll({ behavior: "wait" }); }
  // Browser timer is paused: real Auth/BFF/Nest still run; no cached/mock admission.
  // Completing before advancing150ms must cancel the pending visual timer.
  await page.locator('aside a[href="/settings/team"]').evaluate((link: HTMLAnchorElement) => link.click());
  await expect(page).toHaveURL(/\/settings\/team$/);
  await expect(page.getByRole("heading", { name: "Your team", exact: true })).toBeVisible();
  await expect(page.locator("[data-route-pending=true]")).toHaveCount(0);
  await page.clock.runFor(150);
  await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
});

test("fresh sample menus and tab returns avoid reads while stale focus and menus share background verification", { tag: "@display-freshness" }, async ({ page }, info) => {
  const identity = (await page.locator('header button[aria-haspopup="menu"]').getAttribute("aria-label"))!;
  const requests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requests.push(path);
  });
  const starts = await page.evaluate(() => {
    window.__navigationEvidence = { header: document.querySelector("header"), sidebar: document.querySelector("aside"), checking: 0 };
    new MutationObserver(() => {
      if (document.body.innerText.includes("Checking your session")) window.__navigationEvidence!.checking++;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    return window.__sessionLifecycleStarts;
  });
  await page.getByRole("searchbox", { name: "Search boards", exact: true }).fill("maya");
  await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true }).locator("tbody th")).toHaveText(["Mobile UX — Checkout flow"]);
  for (const [name, heading] of [["Settings", "Account"], ["Team", "Your team"], ["Dashboard", "Whiteboard projects"]] as const) {
    await navigateFoundation(page, name);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  // Deterministic visibility events, not a claim that headless Chromium switched OS tabs.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveAccessibleName(identity);
  await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("fresh-hidden-retains-display.png"), fullPage: true });
  await page.evaluate(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    await navigator.locks.request("lovora-app-session", () => undefined);
  });
  expect(requests).toEqual([]);
  await expect(page.getByText("Checking your session…", { exact: true })).toHaveCount(0);
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  await page.route("**/api/app/me", async route => {
    const response = await fetchInterceptedRoute(route);
    reached.resolve(); await release.promise;
    await route.fulfill({ response });
  });
  try {
    await page.clock.fastForward(60000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await reached.promise;
    await expect(page.locator("[data-session-revalidating=true]")).toHaveAttribute("inert", "");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveAccessibleName(identity);
    await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true })).toBeVisible();
    await expect(page.getByText("Checking for session updates…", { exact: true })).toBeVisible();
    await expect(page.getByText("Checking your session…", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("stale-focus-retains-display.png"), fullPage: true });
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await navigateFoundation(page, "Settings");
    await navigateFoundation(page, "Team");
    await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toBeVisible();
    expect(requests.filter(path => path === "/api/auth/context")).toHaveLength(1);
    expect(requests.filter(path => path === "/api/app/me")).toHaveLength(1);
    expect(requests.filter(path => path === "/api/auth/refresh")).toHaveLength(0);
    release.resolve();
    await expect(page.getByRole("heading", { name: "Your team", exact: true })).toBeVisible();
    await expect(page.locator("[data-session-revalidating=true], [data-route-pending=true]")).toHaveCount(0);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveAccessibleName(identity);
    const retained = await page.evaluate(() => ({
      header: window.__navigationEvidence!.header === document.querySelector("header"),
      sidebar: window.__navigationEvidence!.sidebar === document.querySelector("aside"),
      checking: window.__navigationEvidence!.checking,
      starts: window.__sessionLifecycleStarts,
    }));
    expect(retained).toEqual({ header: true, sidebar: true, checking: 0, starts });
    expect(requests.filter(path => path === "/api/app/me")).toHaveLength(1);
    await info.attach("display-freshness-counts", { body: JSON.stringify({ fresh: { context: 0, me: 0 }, stale: requests, retained, clock: "synthetic60000ms", visibility: "synthetic events", transport: "real local Auth/BFF/Nest/DB" }), contentType: "application/json" });
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await page.evaluate(() => Reflect.deleteProperty(document, "visibilityState"));
  }
  await fixtureControl("fault", { target: "api", active: true });
  try {
    await page.clock.fastForward(60000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your team", exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("stale-focus-unavailable.png"), fullPage: true });
  } finally { await fixtureControl("fault", { target: "api", active: false }); }
  const beforeRecovery = requests.length;
  await page.getByRole("button", { name: "Check session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your team", exact: true })).toBeVisible();
  expect(requests.slice(beforeRecovery).filter(path => path === "/api/app/me")).toHaveLength(1);
  await assertBrowserCredentialIsolation(page);
});

test("stale display uses one real coordinated refresh after a labeled expired-me response", { tag: ["@security-desktop", "@display-freshness"] }, async ({ page }, info) => {
  const identity = (await page.locator('header button[aria-haspopup="menu"]').getAttribute("aria-label"))!;
  const requests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requests.push(path);
  });
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  // Only the expired-me response is synthetic; refresh and its confirmed me use real Auth/Nest/DB.
  await page.route("**/api/app/me", route => route.fulfill({
    status: 401, json: { code: "unauthenticated", requestId: "33333333-3333-4333-8333-333333333333" },
  }), { times: 1 });
  await page.route("**/api/auth/refresh", async route => {
    const response = await fetchInterceptedRoute(route);
    reached.resolve(); await release.promise;
    await route.fulfill({ response });
  });
  try {
    await page.clock.fastForward(60000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await reached.promise;
    await expect(page.getByText("Checking your session…", { exact: true })).toBeVisible();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("expired-display-concealed.png") });
    release.resolve();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveAccessibleName(identity);
    await expect(page.getByRole("heading", { name: "Project dashboard", exact: true })).toBeVisible();
    await navigateFoundation(page, "Settings");
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    expect(requests.filter(path => path === "/api/app/me")).toHaveLength(1);
    expect(requests.filter(path => path === "/api/auth/refresh")).toHaveLength(1);
    expect(requests.filter(path => path === "/api/auth/context")).toHaveLength(2);
    expect(requests.filter(path => path === "/api/auth/begin")).toHaveLength(0);
  } finally { release.resolve(); await page.unrouteAll({ behavior: "wait" }); }
});

test("page-cache restoration conceals before freezing and rejects a different real account generation", { tag: "@security-desktop" }, async ({ page, context, browser, baseURL }, info) => {
  test.setTimeout(60000);
  await page.evaluate(() => {
    window.__pageCacheEvidence = { hides: [], shows: [] };
    window.addEventListener("pagehide", event => window.__pageCacheEvidence!.hides.push({
      persisted: event.persisted, privateVisible: !!document.querySelector('header button[aria-haspopup="menu"]')?.checkVisibility(),
    }));
    window.addEventListener("pageshow", event => window.__pageCacheEvidence!.shows.push(event.persisted));
  });
  await page.goto("/privacy");
  await page.goBack();
  await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
  const native = await page.evaluate(() => window.__pageCacheEvidence ?? null);
  if (native) {
    expect(native.hides.every(event => !event.privateVisible)).toBe(true);
    expect(native.shows).toContain(true);
  }
  await info.attach("native-page-cache", { body: JSON.stringify({ restoredHeap: native !== null, events: native, limitation: native ? null : "Chromium restored a fresh document rather than BFcache; persisted-event boundary exercised separately below." }), contentType: "application/json" });
  const independent = await browser.newContext({ baseURL, viewport: page.viewportSize(), colorScheme: "light" });
  const memberPage = await independent.newPage();
  try {
    const member = await signIn(memberPage, "member");
    // Explicit lifecycle/cookie-delivery injection; both account sessions are real, separate local logins.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await context.addCookies(await independent.cookies(sessionFixture().webEnv.APP_ORIGIN));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(page.getByRole("status")).toContainText("session changed in another tab");
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("page-cache-account-change-concealed.png"), fullPage: true });
    await page.getByRole("button", { name: "Check session", exact: true }).click();
    await expect(page.locator('header button[aria-haspopup="menu"]')).toContainText(member.profile.displayName);
    await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true })).toBeVisible();
    expect((await currentMe(page)).profile.userId).toBe(member.profile.userId);
    await assertBrowserCredentialIsolation(page);
  } finally {
    await clearBrowserSession(independent);
    await independent.close();
  }
});

test("stale display fails closed after the real9-second deadline behind a held session lock", { tag: ["@security-desktop", "@display-freshness"] }, async ({ page }, info) => {
  const requests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requests.push(path);
  });
  await page.evaluate(() => {
    void navigator.locks.request("lovora-app-session", async () => {
      document.documentElement.dataset.ownedTestLock = "held";
      await new Promise<void>(resolve => window.addEventListener("release-test-lock", () => resolve(), { once: true }));
      delete document.documentElement.dataset.ownedTestLock;
    });
  });
  await page.waitForFunction(() => document.documentElement.dataset.ownedTestLock === "held");
  try {
    await page.clock.fastForward(60000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("[data-session-revalidating=true]")).toHaveAttribute("inert", "");
    await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true })).toBeVisible();
    // The elapsed display clock is synthetic; AbortSignal's9-second deadline and Web Lock are native.
    await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable", { timeout: 12000 });
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(0);
    expect(requests).toEqual([]);
    await page.screenshot({ path: info.outputPath("stale-lock-deadline-unavailable.png"), fullPage: true });
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event("release-test-lock")));
    await page.waitForFunction(() => !document.documentElement.dataset.ownedTestLock);
  }
  await page.getByRole("button", { name: "Check session", exact: true }).click();
  await expect(page.getByRole("table", { name: "Whiteboard projects", exact: true })).toBeVisible();
  expect(requests.filter(path => path === "/api/auth/context")).toHaveLength(1);
  expect(requests.filter(path => path === "/api/app/me")).toHaveLength(1);
});
