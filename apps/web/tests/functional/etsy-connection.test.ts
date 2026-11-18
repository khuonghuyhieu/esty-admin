import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { readSessionConfig } from "../../src/features/app-session/config.ts";
import { newContext, sealCookie } from "../../src/features/app-session/cookies.ts";
import { handleEtsyRequest } from "../../src/features/etsy-connection/handlers.ts";
import { isConnection, isCreatedInvitation, isLookup, isObservation, type Connection, type Lookup } from "../../src/features/etsy-connection/model.ts";

const environment = { APP_SESSION_MODE: "local", APP_ORIGIN: "http://127.0.0.1:55644", APP_API_ORIGIN: "http://127.0.0.1:55643", APP_AUTH_URL: "http://127.0.0.1:55641", APP_API_TECHNICAL_KEY: "synthetic-technical", APP_AUTH_API_KEY: "synthetic-auth", APP_SESSION_COOKIE_KEY: Buffer.alloc(32, 13).toString("base64url") };
const config = readSessionConfig(environment), context = newContext();
const uuid = "11111111-1111-4111-8111-111111111111", shopId = "9007199254740993";
const connection: Connection = { connectionId: null, state: "unconnected", revision: 0, shopId: null, etsyUserId: null, verifiedAt: null, observedAt: null, outcome: null, attemptPhase: null };
const lookup: Lookup = { query: "paper", outcome: "exact", items: [{ shopId, shopName: "Paper", shopUrl: "https://www.etsy.com/shop/Paper", match: "exact" }], page: { offset: 0, limit: 20, providerCount: "1", complete: true, hasMore: false, nextOffset: null, truncated: false }, ownershipVerified: false, observedAt: "2026-11-18T09:00:00.000Z" };
const cookie = `${config.names.context}=${sealCookie(config, "context", context)}; ${config.names.session}=${sealCookie(config, "session", { generation: context.generation, accessToken: "synthetic-caller", refreshToken: "must-never-forward", expiresAt: Date.now() + 300000 })}`;
function request(path = "", body?: Record<string, unknown>, headers: Record<string, string> = {}, method = body ? "POST" : "GET") {
  return new NextRequest(`${config.origin}/api/app/integrations/etsy${path}`, { method, headers: { host: "127.0.0.1:55644", origin: config.origin, "sec-fetch-site": "same-origin", "x-session-generation": context.generation, "x-csrf-token": context.csrf, "content-type": "application/json", cookie, ...headers }, ...(body ? { body: JSON.stringify({ generation: context.generation, ...body }) } : {}) });
}
const noUpstream = async (): Promise<Response> => assert.fail("Rejected request crossed the BFF boundary");
const createInput = { expectedShopId: shopId, expectedRevision: 0, idempotencyKey: uuid };

test("Etsy BFF rejects origin, CSRF, generation and stale-cookie authority before upstream work", async () => {
  for (const [headers, status, code] of [
    [{ host: "evil.test" }, 403, "csrf_denied"], [{ "sec-fetch-site": "cross-site" }, 403, "csrf_denied"],
    [{ origin: "https://evil.test" }, 403, "csrf_denied"], [{ "x-csrf-token": "invalid" }, 403, "csrf_denied"],
    [{ cookie: "" }, 401, "unauthenticated"],
  ] as [Record<string, string>, number, string][]) {
    const response = await handleEtsyRequest("create", request("/invitations", createInput, headers), undefined, environment, noUpstream);
    assert.equal(response.status, status); assert.equal((await response.json()).code, code); assert.deepEqual(response.headers.getSetCookie(), []);
  }
  const stale = await handleEtsyRequest("create", request("/invitations", { ...createInput, generation: "different" }), undefined, environment, noUpstream);
  assert.equal(stale.status, 409); assert.equal((await stale.json()).code, "session_changed");
  const read = await handleEtsyRequest("status", request("", undefined, { "x-session-generation": "different" }), undefined, environment, noUpstream);
  assert.equal(read.status, 409);
});

test("Etsy BFF accepts only exact fixed operation paths, bounded canonical queries and payloads", async () => {
  for (const path of ["/shops/lookup?shopName=https%3A%2F%2Fevil.test", "/shops/lookup?shopName=Paper&shopName=Other", "/shops/lookup?shopName=Paper&offset=01", "/shops/lookup?shopName=Paper&offset=100", "/shops/lookup?shopName=Paper&url=https://evil.test", "/shops/lookup?shopName=%ZZ", "/shops/lookup?shopName=" + "a".repeat(1025)]) {
    assert.equal((await handleEtsyRequest("lookup", request(path), undefined, environment, noUpstream)).status, 400);
  }
  for (const input of [{ ...createInput, expectedShopId: "9223372036854775808" }, { ...createInput, expectedShopId: 123 }, { ...createInput, expectedRevision: -1 }, { ...createInput, expectedRevision: 0.5 }, { ...createInput, idempotencyKey: "not-a-uuid" }, { ...createInput, accessToken: "attacker" }, { ...createInput, ignored: "a".repeat(17000) }]) {
    assert.equal((await handleEtsyRequest("create", request("/invitations", input), undefined, environment, noUpstream)).status, 400);
  }
  assert.equal((await handleEtsyRequest("status", request("/unexpected"), undefined, environment, noUpstream)).status, 400);
  assert.equal((await handleEtsyRequest("status", request("?extra=1"), undefined, environment, noUpstream)).status, 400);
  assert.equal((await handleEtsyRequest("create", request("/invitations"), undefined, environment, noUpstream)).status, 405);
  assert.equal((await handleEtsyRequest("cancel", request("/invitations/bad/cancel", { expectedRevision: 0, idempotencyKey: uuid }), "bad", environment, noUpstream)).status, 400);
});

test("fixed Etsy transport strips browser credentials and generation, never follows redirects or retries", async () => {
  let calls = 0;
  const response = await handleEtsyRequest("create", request("/invitations", createInput, { authorization: "attacker", "x-app-access-token": "attacker", "x-forwarded-host": "evil.test" }), undefined, environment, async (url, init) => {
    calls++;
    assert.equal(url, `${config.apiOrigin}/v1/app/integrations/etsy/invitations`);
    const headers = new Headers(init!.headers);
    assert.equal(headers.get("authorization"), "Bearer synthetic-technical"); assert.equal(headers.get("x-app-access-token"), "synthetic-caller");
    assert.equal(headers.has("cookie"), false); assert.equal(headers.has("host"), false); assert.equal(headers.has("x-forwarded-host"), false);
    assert.deepEqual(JSON.parse(init!.body as string), createInput);
    assert.equal(init!.redirect, "manual"); assert.equal(init!.credentials, "omit"); assert.equal(init!.cache, "no-store");
    return Response.json({ code: "outcome_unknown", requestId: uuid }, { status: 503 });
  });
  assert.equal(calls, 1); assert.equal(response.status, 503); assert.equal((await response.json()).code, "outcome_unknown");
  let redirected = 0;
  const redirect = await handleEtsyRequest("status", request(), undefined, environment, async () => { redirected++; return Response.json({}, { status: 307, headers: { location: "https://evil.test/secret" } }); });
  assert.equal(redirected, 1); assert.equal(redirect.status, 503); assert.equal(redirect.headers.has("location"), false);
});

test("canonical rate limiting survives Etsy BFF while mismatched errors and secret-bearing shapes fail closed", async () => {
  const limited = await handleEtsyRequest("lookup", request("/shops/lookup?shopName=Paper"), undefined, environment, async () => Response.json({ code: "upstream_rate_limited", requestId: uuid, retryAfterSeconds: 60 }, { status: 429 }));
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60"); assert.match(limited.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await limited.json(), { code: "upstream_rate_limited", requestId: uuid, retryAfterSeconds: 60 });
  for (const [status, body] of [[200, { ...connection, refreshToken: "must-not-forward" }], [429, { code: "forbidden", requestId: uuid }], [429, { code: "upstream_rate_limited", requestId: uuid, retryAfterSeconds: "60" }]] as const) {
    const response = await handleEtsyRequest("status", request(), undefined, environment, async () => Response.json(body, { status }));
    assert.equal(response.status, 503); assert.equal((await response.text()).includes("must-not-forward"), false);
  }
});

test("Etsy request cancellation reaches upstream and cannot return a late success", async () => {
  const controller = new AbortController();
  const incoming = request();
  const cancellable = new Request(incoming, { signal: controller.signal });
  let cancelled = false;
  const result = handleEtsyRequest("status", cancellable, undefined, environment, async (_url, init) => {
    const { promise, reject } = Promise.withResolvers<Response>();
    init!.signal!.addEventListener("abort", () => { cancelled = true; reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
    controller.abort();
    return promise;
  });
  assert.equal((await result).status, 503); assert.equal(cancelled, true);
});

test("lookup boundary distinguishes complete exact identity from partial, ambiguous and unsafe results", () => {
  assert.equal(isLookup(lookup), true);
  assert.equal(isLookup({ ...lookup, ownershipVerified: true }), false);
  assert.equal(isLookup({ ...lookup, items: [{ ...lookup.items[0], shopUrl: "https://evil.test/shop/Paper" }] }), false);
  assert.equal(isLookup({ ...lookup, items: [{ ...lookup.items[0], shopId: "9223372036854775808" }] }), false);
  assert.equal(isLookup({ ...lookup, items: [...lookup.items, lookup.items[0]] }), false);
  assert.equal(isLookup({ ...lookup, page: { ...lookup.page, offset: 20, complete: false } }), false, "Later exact response cannot silently bind a shop");
  assert.equal(isLookup({ ...lookup, outcome: "choose", page: { ...lookup.page, offset: 20, complete: false, providerCount: "21" } }), true);
  assert.equal(isLookup({ ...lookup, outcome: "not_found", items: [], page: { ...lookup.page, offset: 20, providerCount: "0", complete: false } }), false);
  assert.equal(isLookup({ ...lookup, outcome: "incomplete", items: [], page: { ...lookup.page, offset: 20, providerCount: "20", complete: false } }), true);
  assert.equal(isConnection({ ...connection, state: ["active"] }), false);
  assert.equal(isObservation({ etsyUserId: "7", shopId, shopName: "Paper", currencyCode: "USD", connectionId: uuid, revision: 0, observedAt: lookup.observedAt }), false);
});

test("creation link accepts only exact first-party recipient fragments and may be absent on replay", () => {
  const receipt = { invitationId: uuid, revision: 1, expiresAt: lookup.observedAt };
  assert.equal(isCreatedInvitation(receipt, config.origin), true);
  assert.equal(isCreatedInvitation({ ...receipt, shareUrl: `${config.origin}/integrations/etsy/invite#${"a".repeat(43)}` }, config.origin), true);
  for (const shareUrl of [`https://evil.test/integrations/etsy/invite#${"a".repeat(43)}`, `${config.origin}/integrations/etsy/invite?token=secret#${"a".repeat(43)}`, `${config.origin}/integrations/etsy/invite#bad`, undefined]) assert.equal(isCreatedInvitation({ ...receipt, shareUrl }, config.origin), false);
});
