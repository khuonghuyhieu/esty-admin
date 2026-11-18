import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { NextRequest } from "next/server.js";
import { handleInvitationStart, readRecipientConfig } from "../../src/features/etsy-connection/recipient-handler.ts";
import { validConsentUrl } from "../../src/features/etsy-connection/recipient-model.ts";
import { RecipientSecret } from "../../src/features/etsy-connection/recipient-secret.ts";

const environment = { APP_SESSION_MODE: "local", APP_ORIGIN: "http://127.0.0.1:55644", APP_API_ORIGIN: "http://127.0.0.1:55643", APP_AUTH_URL: "http://127.0.0.1:55641", APP_API_TECHNICAL_KEY: "synthetic-technical", APP_AUTH_API_KEY: "synthetic-auth", APP_SESSION_COOKIE_KEY: Buffer.alloc(32, 13).toString("base64url"), ETSY_CLIENT_ID: "synthetic-client" };
const secret = "s".repeat(43), callback = `${environment.APP_API_ORIGIN}/integrations/etsy/callback`;
function consent(overrides: Record<string, string> = {}) {
  return `https://www.etsy.com/oauth/connect?${new URLSearchParams({ client_id: environment.ETSY_CLIENT_ID, code_challenge: "c".repeat(43), code_challenge_method: "S256", redirect_uri: callback, response_type: "code", scope: "shops_r", state: "a".repeat(43), ...overrides })}`;
}
function request(body: unknown = { secret }, headers: Record<string, string> = {}, method = "POST", path = "/api/integrations/etsy/invite/start") {
  return new NextRequest(`${environment.APP_ORIGIN}${path}`, { method, headers: { host: "127.0.0.1:55644", origin: environment.APP_ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
}
const noUpstream = async (): Promise<Response> => assert.fail("Rejected recipient input reached upstream");

test("recipient consent URL binds exact client, callback, scope, PKCE and unique keys", () => {
  assert.equal(validConsentUrl(consent(), environment.ETSY_CLIENT_ID, callback), true);
  const bad = [consent({ client_id: "other" }), consent({ redirect_uri: "https://evil.test/callback" }), consent({ scope: "shops_r transactions_r" }), consent({ response_type: "token" }), consent({ code_challenge_method: "plain" }), consent({ state: "short" }), consent({ code_challenge: "short" }), consent({ extra: "value" }), `${consent()}&state=${"b".repeat(43)}`, `${consent()}#fragment`, consent().replace("www.etsy.com", "www.etsy.com.evil.test"), consent().replace("www.etsy.com", "user@www.etsy.com"), consent().replace("www.etsy.com", "www.etsy.com:443"), consent().replace("/oauth/connect?", "/other/../oauth/connect?")];
  for (const value of bad) assert.equal(validConsentUrl(value, environment.ETSY_CLIENT_ID, callback), false);
  assert.throws(() => readRecipientConfig({ ...environment, ETSY_CLIENT_ID: undefined }), /configuration_unavailable/);
  assert.throws(() => readRecipientConfig({ ...environment, ETSY_CLIENT_ID: "client\nheader" }), /configuration_unavailable/);
});

test("recipient bridge requires no Lovora login and forwards only exact capability plus technical protection", async () => {
  let calls = 0;
  const response = await handleInvitationStart(request({ secret }, { cookie: "untrusted=browser-cookie", authorization: "Bearer caller", "x-app-access-token": "caller-token", "x-forwarded-host": "evil.test" }), environment, async (url, init) => {
    calls++;
    assert.equal(url, `${environment.APP_API_ORIGIN}/integrations/etsy/invite/start`);
    assert.deepEqual(Object.fromEntries(new Headers(init!.headers)), { authorization: "Bearer synthetic-technical", "content-type": "application/json", origin: environment.APP_ORIGIN });
    assert.deepEqual(JSON.parse(init!.body as string), { secret });
    assert.equal(init!.redirect, "manual"); assert.equal(init!.credentials, "omit"); assert.equal(init!.cache, "no-store");
    return new Response("untrusted-private-provider-body", { status: 303, headers: { location: consent(), "set-cookie": "upstream-secret=value" } });
  });
  assert.equal(calls, 1); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { consentUrl: consent() });
  assert.deepEqual(response.headers.getSetCookie(), []); assert.equal(response.headers.has("location"), false);
  assert.match(response.headers.get("cache-control")!, /no-store/); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("recipient bridge rejects foreign origin/metadata, malformed bodies, queries and methods before transport", async () => {
  const cases: Record<string, string>[] = [{ host: "evil.test" }, { origin: "https://evil.test" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "none" }];
  for (const headers of cases) assert.equal((await handleInvitationStart(request({ secret }, headers), environment, noUpstream)).status, 403);
  for (const body of [{}, { secret: "short" }, { secret, generation: "not-allowed" }, { secret: 123 }, [secret], { secret: "a".repeat(9000) }]) assert.equal((await handleInvitationStart(request(body), environment, noUpstream)).status, 400);
  assert.equal((await handleInvitationStart(request({ secret }, {}, "POST", "/api/integrations/etsy/invite/start?extra=1"), environment, noUpstream)).status, 400);
  const wrongMethod = await handleInvitationStart(request(undefined, {}, "GET"), environment, noUpstream);
  assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.get("allow"), "POST");
});

test("recipient bridge never follows unsafe redirects or exposes provider errors, cookies or retry affordances", async () => {
  for (const [status, location, expected] of [[303, consent({ client_id: "other" }), 503], [302, consent(), 503], [303, "https://evil.test/private", 503], [400, "", 400], [401, "", 503], [503, "", 503]] as const) {
    let calls = 0;
    const response = await handleInvitationStart(request(), environment, async () => {
      calls++; return new Response("secret-private-upstream-body", { status, headers: { location, "set-cookie": "secret=value" } });
    });
    assert.equal(calls, 1); assert.equal(response.status, expected);
    assert.deepEqual(await response.json(), { code: expected === 400 ? "invitation_unavailable" : "temporarily_unavailable" });
    assert.deepEqual(response.headers.getSetCookie(), []); assert.equal(response.headers.has("location"), false);
  }
});

function fakeWindow(context: TestContext, href: string) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let url = new URL(href);
  const events = new EventTarget();
  const value = {
    get location() { return url; },
    history: { state: { next: "preserved" }, replaceState(state: unknown, _title: string, path: string) { assert.deepEqual(state, { next: "preserved" }); url = new URL(path, url); } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  context.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
  return { url: () => url, event: (type: string) => events.dispatchEvent(new Event(type)), navigate: (href: string) => { url = new URL(href); } };
}

test("recipient fragment is scrubbed before readiness and can be claimed only once across resubscription", context => {
  const browser = fakeWindow(context, `${environment.APP_ORIGIN}/integrations/etsy/invite#${secret}`);
  const state = new RecipientSecret();
  const stop = state.subscribe(() => assert.equal(browser.url().hash, ""));
  assert.equal(state.snapshot(), "ready"); assert.equal(browser.url().href, `${environment.APP_ORIGIN}/integrations/etsy/invite`);
  stop();
  const stopAgain = state.subscribe(() => {});
  assert.equal(state.claim(), secret); assert.equal(state.claim(), null); assert.equal(state.snapshot(), "unavailable");
  stopAgain();
});

test("page lifecycle destroys the invitation without recapturing changed fragments or damaging another route", context => {
  const browser = fakeWindow(context, `${environment.APP_ORIGIN}/integrations/etsy/invite#${secret}`);
  const state = new RecipientSecret(), stop = state.subscribe(() => {});
  browser.event("pagehide"); assert.equal(state.claim(), null);
  browser.navigate(`${environment.APP_ORIGIN}/integrations/etsy/invite#${"n".repeat(43)}`);
  browser.event("hashchange"); assert.equal(browser.url().hash, ""); assert.equal(state.claim(), null);
  browser.navigate(`${environment.APP_ORIGIN}/login?returnTo=%2Fapplication`);
  browser.event("popstate"); assert.equal(browser.url().search, "?returnTo=%2Fapplication");
  stop();
});

test("query-carried and malformed recipient capabilities are scrubbed but never admitted", context => {
  const browser = fakeWindow(context, `${environment.APP_ORIGIN}/integrations/etsy/invite?secret=untrusted#${secret}`);
  const state = new RecipientSecret(), stop = state.subscribe(() => {});
  assert.equal(state.snapshot(), "unavailable"); assert.equal(state.claim(), null); assert.equal(browser.url().search, ""); assert.equal(browser.url().hash, "");
  stop();
});

test("unmounted recipient state cannot retain a capability in a route cache", async context => {
  fakeWindow(context, `${environment.APP_ORIGIN}/integrations/etsy/invite#${secret}`);
  const state = new RecipientSecret(), stop = state.subscribe(() => {});
  assert.equal(state.snapshot(), "ready");
  stop();
  await Promise.resolve();
  const restored = state.subscribe(() => {});
  assert.equal(state.snapshot(), "unavailable");
  assert.equal(state.claim(), null);
  restored();
});
