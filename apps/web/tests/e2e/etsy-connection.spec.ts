import { expect, test, type Page } from "@playwright/test";
import { assertBrowserCredentialIsolation, clearBrowserSession, fetchInterceptedRoute, fixtureControl, sessionFixture, signIn } from "./app-session-fixture";

const dialog = (page: Page) => page.locator("dialog[open]");
const createButton = (page: Page) => page.getByRole("button", { name: "Create invitation", exact: true });

interface FixtureCounts {
  provider: Record<"lookup" | "token" | "refresh" | "getMe" | "getShop" | "callback" | "activeLookup", number>;
  sql: Record<"connections" | "invitations" | "attempts" | "credentials" | "receipts" | "cooldowns" | "activeCredentials" | "plaintextCredentials" | "authUsers" | "authSessions", number>;
  connectionState: string | null;
}
async function counts(): Promise<FixtureCounts> {
  return await fixtureControl("etsy-counts") as unknown as FixtureCounts;
}
async function settleLookup() {
  await expect.poll(async () => (await counts()).provider.activeLookup, { timeout: 10_000 }).toBe(0);
}

async function openRecipient(page: Page, secret: string) {
  // Native document navigation, without putting the private fragment in a Playwright step title.
  await page.evaluate(secret => {
    const destination = new URL("/integrations/etsy/invite", window.location.origin);
    destination.hash = secret;
    window.location.assign(destination.href);
  }, secret);
}

async function findShop(page: Page) {
  const form = dialog(page);
  await form.getByLabel("Shop name or Etsy link").fill("SyntheticShop");
  await form.getByRole("button", { name: "Find shop", exact: true }).click();
  await expect(form.getByRole("radio").first()).toBeVisible();
  await expect(form.getByLabel("Expected shop ID", { exact: true })).toHaveValue("8");
  const shopId = await form.getByLabel("Expected shop ID", { exact: true }).inputValue();
  expect(/^[1-9][0-9]{0,18}$/.test(shopId)).toBe(true);
  await expect(form.getByLabel("Expected shop ID", { exact: true })).toHaveAttribute("readonly", "");
  await expect(form.getByRole("button", { name: "Create invitation", exact: true })).toBeDisabled();
  await form.getByRole("button", { name: "Confirm this shop", exact: true }).click();
  return shopId;
}

async function createInvitation(page: Page) {
  await createButton(page).click();
  const shopId = await findShop(page);
  // Two same-turn submit events must still represent one intent and one server mutation.
  await dialog(page).locator("form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect(dialog(page).getByRole("heading", { name: "Invitation created", exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog(page).getByRole("button", { name: "Done", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
  const link = dialog(page).getByLabel("Private invitation link");
  expect(await link.count()).toBe(1);
  const shareUrl = await link.first().inputValue();
  const parsed = new URL(shareUrl);
  expect(parsed.origin === sessionFixture().webEnv.APP_ORIGIN && parsed.pathname === "/integrations/etsy/invite" && !parsed.search && /^[A-Za-z0-9_-]{43}$/.test(parsed.hash.slice(1))).toBe(true);
  return { shopId, secret: parsed.hash.slice(1) };
}

async function closeReceipt(page: Page, secret: string) {
  await dialog(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Private invitation link")).toHaveCount(0);
  expect((await page.content()).includes(secret)).toBe(false);
}

test.beforeEach(async ({ context }) => {
  if (process.env.ETSY_INTEGRATION_E2E !== "1") throw new Error("Actual Etsy integration requires its explicit owned fixture mode");
  sessionFixture();
  await settleLookup();
  await fixtureControl("etsy-reset");
  await fixtureControl("etsy-membership", { allowed: true });
  await fixtureControl("etsy-lookup", { mode: "exact" });
  await context.route("**/*", async route => {
    if (new URL(route.request().url()).origin !== sessionFixture().webEnv.APP_ORIGIN) await route.abort();
    else await route.continue();
  });
});

test.afterEach(async ({ context }) => {
  await fixtureControl("etsy-membership", { allowed: true });
  await clearBrowserSession(context);
  await settleLookup();
});

test("actual Owner creates once, recipient explicitly consents, then Owner checks, syncs and disconnects", async ({ page, context, browser }, info) => {
  let creates = 0, syncs = 0;
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/app/integrations/etsy/invitations") creates++;
    if (request.method() === "POST" && path === "/api/app/integrations/etsy/read") syncs++;
  });
  await signIn(page, "owner", "/connections/etsy");
  await expect(page.getByText("No shop connection yet", { exact: true })).toBeVisible();
  const created = await createInvitation(page);
  expect(creates).toBe(1); expect(syncs).toBe(0);
  const afterCreate = await counts();
  expect(afterCreate.sql.invitations).toBe(1);
  expect(afterCreate.sql.connections).toBe(1);
  expect(afterCreate.sql.credentials).toBe(0);
  expect(afterCreate.provider).toEqual({ lookup: 1, token: 0, refresh: 0, getMe: 0, getShop: 0, callback: 0, activeLookup: 0 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: sessionFixture().webEnv.APP_ORIGIN });
  await dialog(page).getByRole("button", { name: "Copy invitation link", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toContainText("Invitation link copied");
  expect(await page.evaluate(async secret => {
    const copied = (await navigator.clipboard.readText()).endsWith(`#${secret}`);
    await navigator.clipboard.writeText("");
    return copied;
  }, created.secret)).toBe(true);
  await closeReceipt(page, created.secret);
  await expect(page.getByRole("table", { name: "Shop connection", exact: true })).toContainText("Pending consent");
  await expect(page.getByRole("table", { name: "Shop connection", exact: true })).toContainText("Intended ID · unverified");

  const recipientContext = await browser.newContext({ baseURL: sessionFixture().webEnv.APP_ORIGIN, viewport: page.viewportSize()! });
  await recipientContext.route("**/*", async route => {
    if (new URL(route.request().url()).origin !== sessionFixture().webEnv.APP_ORIGIN) await route.abort();
    else await route.continue();
  });
  const recipient = await recipientContext.newPage();
  const consent = Promise.withResolvers<{ state: string; codeChallenge: string }>();
  let starts = 0, recipientCookieSent = false, consentNavigations = 0;
  recipient.on("request", request => {
    if (new URL(request.url()).pathname === "/api/integrations/etsy/invite/start") { starts++; recipientCookieSent ||= "cookie" in request.headers(); }
  });
  await recipient.route("https://www.etsy.com/**", async route => {
    consentNavigations++;
    const url = new URL(route.request().url());
    if (url.pathname !== "/oauth/connect" || url.searchParams.get("client_id") !== sessionFixture().webEnv.ETSY_CLIENT_ID || url.searchParams.get("redirect_uri") !== `${sessionFixture().webEnv.APP_API_ORIGIN}/integrations/etsy/callback`) {
      consent.reject(new Error("Unexpected synthetic consent destination")); await route.abort(); return;
    }
    consent.resolve({ state: url.searchParams.get("state")!, codeChallenge: url.searchParams.get("code_challenge")! });
    await route.fulfill({ status: 200, contentType: "text/html", body: "<title>Owned synthetic consent interception</title><p>No live Etsy request was made.</p>" });
  });
  try {
    await recipient.goto("/privacy");
    await openRecipient(recipient, created.secret);
    await expect(recipient.getByRole("button", { name: "Continue to Etsy", exact: true })).toBeDisabled();
    await expect.poll(() => recipient.url() === `${sessionFixture().webEnv.APP_ORIGIN}/integrations/etsy/invite`).toBe(true);
    expect(starts).toBe(0);
    expect((await recipient.content()).includes(created.secret)).toBe(false);
    const storage = await recipient.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
    expect(storage).toEqual({ local: "{}", session: "{}" });
    expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await recipient.screenshot({ path: `test-results/etsy-integration-evidence/${info.project.name}-recipient.png`, fullPage: true });
    await recipient.getByRole("checkbox").check();
    await recipient.getByRole("button", { name: "Continue to Etsy", exact: true }).click();
    const authorization = await consent.promise;
    expect(starts).toBe(1);
    await recipient.goto("/privacy");
    await fixtureControl("etsy-complete", authorization);
    expect(recipientCookieSent).toBe(false);
    await openRecipient(recipient, created.secret);
    await recipient.getByRole("checkbox").check();
    await recipient.getByRole("button", { name: "Continue to Etsy", exact: true }).click();
    await expect(recipient.getByRole("main").getByRole("alert")).toContainText("This request could not be completed");
    expect(starts).toBe(2); expect(consentNavigations).toBe(1);
  } finally { await recipientContext.close(); }

  const afterConsent = await counts();
  expect(afterConsent.provider).toEqual({ lookup: 1, token: 1, refresh: 0, getMe: 1, getShop: 1, callback: 1, activeLookup: 0 });
  expect(afterConsent.sql.attempts).toBe(1);
  expect(afterConsent.sql.activeCredentials).toBe(1);
  expect(afterConsent.sql.plaintextCredentials).toBe(0);
  await page.getByRole("button", { name: "Check saved status", exact: true }).click();
  await expect(page.getByRole("table", { name: "Shop connection", exact: true })).toContainText("Connected");
  expect(syncs).toBe(0);
  expect((await counts()).provider).toEqual(afterConsent.provider);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Sync shop info", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toContainText("Authenticated shop information observed");
  expect(syncs).toBe(1);
  const afterSync = await counts();
  expect(afterSync.provider).toEqual({ ...afterConsent.provider, getMe: 2, getShop: 2 });
  await dialog(page).getByRole("button", { name: "Disconnect", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Confirm disconnect", exact: true }).click();
  await expect(page.getByRole("table", { name: "Shop connection", exact: true })).toContainText("Disconnected locally");
  await expect(page.getByRole("status")).toContainText("Revocation on Etsy is not confirmed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await assertBrowserCredentialIsolation(page);
  await page.screenshot({ path: `test-results/etsy-integration-evidence/${info.project.name}-disconnected.png`, fullPage: true });
  const afterDisconnect = await counts();
  expect(afterDisconnect.sql.activeCredentials).toBe(0);
  expect(afterDisconnect.sql.credentials).toBe(0);
  expect(afterDisconnect.sql.plaintextCredentials).toBe(0);
  expect(afterDisconnect.provider).toEqual(afterSync.provider);
  await info.attach("independent-provider-sql-readbacks", { body: JSON.stringify({ nonce: sessionFixture().nonce, afterCreate, afterConsent, afterSync, afterDisconnect }), contentType: "application/json" });
});

test("cancel preserves exact intended identity and history never recovers a creation link", async ({ page }) => {
  await signIn(page, "owner", "/connections/etsy");
  const created = await createInvitation(page);
  await closeReceipt(page, created.secret);
  await page.getByRole("button", { name: "Cancel invitation", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  const connection = page.getByRole("table", { name: "Shop connection", exact: true });
  await expect(connection).toContainText("Reconnect required"); await expect(connection).toContainText(created.shopId);
  await expect(page.getByRole("table", { name: "Invitations", exact: true })).toContainText("cancelled");
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await expect(dialog(page)).toContainText("History never reveals or reconstructs an invitation link");
  await expect(dialog(page).getByRole("button", { name: /Copy/ })).toHaveCount(0);
  expect((await page.content()).includes(created.secret)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(createButton(page)).toBeEnabled();
});

test("current Member is denied by actual BE and Owner revocation conceals in-flight lookup", async ({ page }) => {
  await signIn(page, "member", "/connections/etsy");
  await expect(page.getByRole("heading", { name: "Owner access required" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Invitations", exact: true })).toHaveCount(0);
  const denied = await page.evaluate(async () => {
    const { generation } = await (await fetch("/api/auth/context")).json();
    const result = await fetch("/api/app/integrations/etsy", { headers: { "x-session-generation": generation } });
    const body = await result.json(); return { status: result.status, code: body.code, keys: Object.keys(body).sort() };
  });
  expect(denied.status).toBe(403); expect(denied.code).toBe("forbidden"); expect(denied.keys).toEqual(["code", "requestId"]);
  await clearBrowserSession(page.context());
  await signIn(page, "owner", "/connections/etsy");
  await fixtureControl("etsy-lookup", { mode: "delay" });
  await createButton(page).click();
  await dialog(page).getByLabel("Shop name or Etsy link").fill("SyntheticShop");
  const sent = page.waitForRequest(request => new URL(request.url()).pathname.endsWith("/shops/lookup"));
  await dialog(page).getByRole("button", { name: "Find shop", exact: true }).click(); await sent;
  await fixtureControl("etsy-membership", { allowed: false });
  await expect(page.getByRole("heading", { name: "Current access unavailable" })).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Invitations", exact: true })).toHaveCount(0);
});

test("lookup ambiguity, incomplete results, rate limits and edited inputs never silently select a shop", async ({ page }) => {
  await signIn(page, "owner", "/connections/etsy");
  await createButton(page).click();
  const form = dialog(page), query = form.getByLabel("Shop name or Etsy link");
  await query.fill("SyntheticShop");
  await fixtureControl("etsy-lookup", { mode: "ambiguous" });
  await form.getByRole("button", { name: "Find shop", exact: true }).click();
  await expect(form.getByRole("radio")).toHaveCount(2);
  await expect(form.getByLabel("Expected shop ID", { exact: true })).toHaveValue("");
  await expect(form.getByRole("button", { name: "Create invitation", exact: true })).toBeDisabled();
  await fixtureControl("etsy-lookup", { mode: "incomplete" });
  await form.getByRole("button", { name: "Find shop", exact: true }).click();
  await expect(form.getByLabel("Expected shop ID", { exact: true })).toHaveValue("");
  await form.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(form).toContainText("This does not mean the shop is absent");
  await fixtureControl("etsy-lookup", { mode: "429" });
  await form.getByRole("button", { name: "Find shop", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Etsy is rate limiting requests");
  await expect(form.getByLabel("Expected shop ID", { exact: true })).toHaveValue("");
  await fixtureControl("etsy-reset");
  await fixtureControl("etsy-lookup", { mode: "delay" });
  const sent = page.waitForRequest(request => new URL(request.url()).pathname.endsWith("/shops/lookup"));
  await form.getByRole("button", { name: "Find shop", exact: true }).click(); await sent;
  const aborted = page.waitForEvent("requestfailed", { predicate: request => new URL(request.url()).pathname.endsWith("/shops/lookup") });
  await query.fill("AnotherShop"); await aborted;
  await expect(form.getByLabel("Expected shop ID", { exact: true })).toHaveValue("");
  await expect(form.getByRole("radio")).toHaveCount(0);
});

test("lost creation acknowledgement never retries and saved history cannot recover its link @security-desktop", async ({ page }) => {
  await signIn(page, "owner", "/connections/etsy");
  await createButton(page).click(); await findShop(page);
  let mutations = 0;
  await page.route("**/api/app/integrations/etsy/invitations", async route => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    mutations++;
    await fetchInterceptedRoute(route);
    await route.abort();
  });
  await dialog(page).getByRole("button", { name: "Create invitation", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("could not be confirmed");
  expect(mutations).toBe(1);
  await expect(createButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Check saved status", exact: true }).click();
  await expect(page.getByRole("table", { name: "Invitations", exact: true })).toContainText("pending");
  expect(mutations).toBe(1);
  await expect(page.getByLabel("Private invitation link")).toHaveCount(0);
});

test("cross-tab sign-out removes the currently open one-time creation result @security-desktop", async ({ page, context }) => {
  await signIn(page, "owner", "/connections/etsy");
  const created = await createInvitation(page);
  const other = await context.newPage();
  try {
    await other.goto("/application");
    await other.locator('header button[aria-haspopup="menu"]').click();
    await other.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByLabel("Private invitation link")).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Shop connection", exact: true })).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Invitations", exact: true })).toHaveCount(0);
    expect((await page.content()).includes(created.secret)).toBe(false);
  } finally { await other.close(); }
});

test("another tab changing the revision rejects the old explicit creation intent without replay @security-desktop", async ({ page, context }) => {
  await signIn(page, "owner", "/connections/etsy");
  await createButton(page).click(); await findShop(page);
  const other = await context.newPage();
  try {
    await other.goto("/connections/etsy");
    const created = await createInvitation(other);
    await closeReceipt(other, created.secret);
    let attempted = 0;
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/app/integrations/etsy/invitations") attempted++; });
    const rejected = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/app/integrations/etsy/invitations");
    await dialog(page).getByRole("button", { name: "Create invitation", exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page.getByRole("status")).toContainText("The connection changed");
    expect(attempted).toBe(1);
    await page.getByRole("button", { name: "Check saved status", exact: true }).click();
    await expect(page.getByRole("table", { name: "Invitations", exact: true }).locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("table", { name: "Invitations", exact: true })).toContainText("pending");
    await expect(createButton(page)).toBeDisabled();
    expect((await page.content()).includes(created.secret)).toBe(false);
  } finally { await other.close(); }
});

test("recipient without a valid fragment stays public but never starts consent or Auth", async ({ page }) => {
  const effects: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) effects.push(path);
  });
  const response = await page.goto("/integrations/etsy/invite#invalid");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("This invitation is unavailable");
  await expect(page).toHaveURL(`${sessionFixture().webEnv.APP_ORIGIN}/integrations/etsy/invite`);
  await expect(page.getByRole("button", { name: "Continue to Etsy", exact: true })).toHaveCount(0);
  expect(effects).toEqual([]);
  expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response!.headers()["cache-control"]).toContain("no-store");
  expect(response!.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});
