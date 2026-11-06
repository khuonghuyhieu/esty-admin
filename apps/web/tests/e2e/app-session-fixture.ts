import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import { readSessionConfig } from "../../src/features/app-session/config.ts";
import { readAuthCookies } from "../../src/features/app-session/cookies.ts";
import { isAppMe, type AppMe } from "../../src/features/app-session/model.ts";
import { sessionRunProfile } from "../../scripts/app-session-isolation.mjs";

type Identity = "owner" | "member" | "unadmitted" | "disabled";
interface Fixture {
  version: 1; nonce: string; purpose: "006-login-session" | "001-production-activation"; profile?: "006" | "activation001"; jwtExpirySeconds: number;
  webEnv: Record<string, string>;
  identities: Record<Identity, { email: string; password: string; userId: string }>;
  control: { socketPath: string; nonce: string };
}

export function sessionFixture(): Fixture {
  const path = process.env.APP_SESSION_FIXTURE_PATH;
  const nonce = process.env.APP_SESSION_E2E_RUN_ID;
  if (process.env.APP_SESSION_E2E !== "1" || !path || !/^[a-f0-9]{32}$/.test(nonce ?? "")) throw new Error("Real session E2E requires the approved synthetic fixture and isolated mode");
  const file = lstatSync(path);
  const directory = lstatSync(dirname(path));
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o777) !== 0o600 || file.uid !== process.getuid?.()
    || !directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o777) !== 0o700
    || realpathSync(path) !== path) throw new Error("Unsafe synthetic session handoff");
  const value = JSON.parse(readFileSync(path, "utf8")) as Fixture;
  const target = sessionRunProfile();
  if (value.version !== 1 || value.purpose !== target.purpose || (value.profile === undefined ? "006" : value.profile) !== target.profile || value.nonce !== nonce || value.control?.nonce !== nonce
    || value.control.socketPath !== join(dirname(path), "s006.sock") || value.jwtExpirySeconds !== 300) throw new Error("Mismatched synthetic fixture ownership");
  const config = readSessionConfig(value.webEnv);
  if (value.webEnv.APP_SESSION_MODE !== "local" || config.origin !== target.webOrigin || config.apiOrigin !== target.apiOrigin || config.authUrl !== target.authUrl || config.secure) throw new Error("Unexpected fixture destinations");
  for (const name of ["owner", "member", "unadmitted", "disabled"] as const) {
    const identity = value.identities?.[name];
    if (!identity || !identity.email.endsWith(".test") || !identity.password || !/^[0-9a-f-]{36}$/.test(identity.userId)) throw new Error("Incomplete run-owned browser identity");
  }
  return value;
}

export async function fixtureControl(operation: "status" | "set-member" | "register-session" | "issue-session" | "replay" | "fault", fields: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const fixture = sessionFixture();
  const socket = lstatSync(fixture.control.socketPath);
  if (!socket.isSocket() || socket.isSymbolicLink() || (socket.mode & 0o777) !== 0o600 || socket.uid !== process.getuid?.()) throw new Error("Unsafe private fixture socket");
  return new Promise((resolve, reject) => {
    const request = httpRequest({ socketPath: fixture.control.socketPath, path: "/", method: "POST", headers: { "content-type": "application/json" } }, response => {
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 65536) { response.destroy(); reject(new Error("Oversized fixture control response")); }
        else chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          if (response.statusCode !== 200) throw new Error("Private fixture control rejected the operation");
          const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid fixture control response");
          resolve(value as Record<string, unknown>);
        } catch { reject(new Error("Private fixture control failed")); }
      });
      response.on("error", () => reject(new Error("Private fixture control transport failed")));
    });
    request.setTimeout(10000, () => request.destroy(new Error("Private fixture control deadline")));
    request.on("error", () => reject(new Error("Private fixture control transport failed")));
    request.end(JSON.stringify({ ...fields, nonce: fixture.nonce, operation }));
  });
}

export async function currentMe(page: Page): Promise<AppMe> {
  const value: unknown = await page.evaluate(async () => {
    const response = await fetch("/api/app/me", { cache: "no-store" });
    return response.ok ? response.json() : null;
  });
  if (!isAppMe(value)) throw new Error("Browser did not receive current admitted identity");
  return value;
}

export async function enterPassword(page: Page, password: string): Promise<void> {
  // Evaluate's step title omits argument values; fill(secret) can disclose them in failure reports.
  await page.getByLabel("Password", { exact: true }).evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, password);
}

export async function signIn(page: Page, identity: Identity = "owner", returnTo = "/application"): Promise<AppMe> {
  const account = sessionFixture().identities[identity];
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await expect(submit).toBeEnabled();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await enterPassword(page, account.password);
  await submit.click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replaceAll("/", "\\/")}$`));
  await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();
  const me = await currentMe(page);
  expect(me.profile.userId).toBe(account.userId);
  return me;
}

export async function registerBrowserSession(context: BrowserContext): Promise<{ handle: string; expiresAt: number }> {
  const fixture = sessionFixture();
  const config = readSessionConfig(fixture.webEnv);
  const cookies = await context.cookies(config.origin);
  const header = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
  const session = readAuthCookies(config, header).session;
  if (!session) throw new Error("The actual browser session is required for replay proof");
  const result = await fixtureControl("register-session", { accessToken: session.accessToken });
  if (typeof result.handle !== "string") throw new Error("Missing opaque replay handle");
  return { handle: result.handle, expiresAt: session.expiresAt };
}

export async function clearBrowserSession(context: BrowserContext): Promise<void> {
  const fixture = sessionFixture();
  const headers = { origin: fixture.webEnv.APP_ORIGIN, "sec-fetch-site": "same-origin" };
  const response = await context.request.get(`${fixture.webEnv.APP_ORIGIN}/api/auth/context`, { headers });
  if (!response.ok()) throw new Error("Browser cleanup could not read its auth context");
  const value = await response.json() as { generation: string; csrf: string };
  const logout = await context.request.post(`${fixture.webEnv.APP_ORIGIN}/api/auth/logout`, { headers: { ...headers, "x-csrf-token": value.csrf }, data: { generation: value.generation } });
  if (!logout.ok() || (await logout.json()).localCleared !== true) throw new Error("Browser cleanup did not clear its owned session");
}

export async function browserTransition(page: Page, operation: "begin" | "refresh" | "logout"): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(async operation => {
    const contextResponse = await fetch("/api/auth/context", { cache: "no-store" });
    const context = await contextResponse.json();
    const response = await fetch(`/api/auth/${operation}`, {
      method: "POST", headers: { "content-type": "application/json", "x-csrf-token": context.csrf },
      body: JSON.stringify({ generation: context.generation }),
    });
    return { status: response.status, body: await response.json() };
  }, operation);
}

export async function fetchInterceptedRoute(route: Route, expectedStatus: 200 | 401 = 200) {
  const headers = await route.request().allHeaders();
  const origin = sessionFixture().webEnv.APP_ORIGIN;
  if (new URL(route.request().url()).origin !== origin || new URL(route.request().frame().url()).origin !== origin) {
    throw new Error("Fault injection is restricted to the owned same-origin frame");
  }
  // Chromium interception omits Fetch Metadata; Node route.fetch does not synthesize it.
  // Supply it only for this verified same-origin synthetic transport, never relax the BFF.
  headers["sec-fetch-site"] ??= "same-origin";
  let response;
  try {
    response = await route.fetch({ headers, timeout: 10000, maxRedirects: 0 });
  } catch {
    throw new Error("Owned intercepted request transport failed");
  }
  if (response.status() !== expectedStatus) {
    const body = await response.json().catch(() => ({}));
    const code = typeof body.code === "string" && /^[a-z_]{1,40}$/.test(body.code) ? body.code : "unexpected";
    throw new Error(`Owned intercepted request failed: status=${response.status()} code=${code} fetchSite=${headers["sec-fetch-site"] ?? "absent"} originPresent=${!!headers.origin}`);
  }
  return response;
}

export async function assertBrowserCredentialIsolation(page: Page, responseBodies: string[] = []): Promise<void> {
  const fixture = sessionFixture();
  const config = readSessionConfig(fixture.webEnv);
  const cookies = await page.context().cookies(config.origin);
  const auth = readAuthCookies(config, cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; "));
  if (!auth.session) throw new Error("Credential isolation requires an actual admitted browser session");
  for (const name of [config.names.session, config.names.context]) {
    const cookie = cookies.find(cookie => cookie.name === name);
    expect(!!cookie).toBe(true);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.secure).toBe(false);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.path).toBe("/");
    expect(cookie!.expires).toBe(-1);
    expect(Buffer.byteLength(cookie!.value)).toBeLessThan(3500);
  }
  const visible = await page.evaluate(() => ({
    html: document.documentElement.outerHTML, cookie: document.cookie, href: location.href,
    local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage),
    scripts: Array.from(document.scripts).map(script => script.src).filter(Boolean),
  }));
  expect(visible.cookie.includes(config.names.session)).toBe(false);
  expect(visible.cookie.includes(config.names.context)).toBe(false);
  expect(visible.local).toBe("{}");
  expect(visible.session).toBe("{}");
  const publicText = [JSON.stringify(visible), ...responseBodies];
  for (const url of visible.scripts) {
    if (new URL(url).origin !== config.origin) throw new Error("Unexpected external application script");
    publicText.push(await (await page.request.get(url)).text());
  }
  const protectedValues = [auth.session.accessToken, auth.session.refreshToken, config.technicalKey, fixture.webEnv.APP_SESSION_COOKIE_KEY, config.authApiKey];
  expect(publicText.some(text => protectedValues.some(value => text.includes(value)))).toBe(false);
}
