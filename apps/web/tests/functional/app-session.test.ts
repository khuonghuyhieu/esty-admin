import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { NextRequest } from "next/server.js";
import { readSessionConfig, safeReturnPath } from "../../src/features/app-session/config.ts";
import { cookieHeader, newContext, openCookie, readAuthCookies, sealCookie } from "../../src/features/app-session/cookies.ts";
import { requireCsrf, requireGeneration } from "../../src/features/app-session/csrf.ts";
import { SessionFailure } from "../../src/features/app-session/errors.ts";
import { handleSessionRequest, type SessionOperation } from "../../src/features/app-session/handlers.ts";
import { currentAppMe } from "../../src/features/app-session/app-client.ts";
import { boundedJson, type Fetcher } from "../../src/features/app-session/transport.ts";
import type { AuthContext } from "../../src/features/app-session/cookies.ts";
import { SessionController, type SessionView } from "../../src/features/app-session/session-controller.ts";
import { proxy } from "../../src/proxy.ts";

const environment = {
  APP_SESSION_MODE: "local", APP_ORIGIN: "http://127.0.0.1:55444", APP_API_ORIGIN: "http://127.0.0.1:55443",
  APP_AUTH_URL: "http://127.0.0.1:55441", APP_API_TECHNICAL_KEY: "synthetic-api-key", APP_AUTH_API_KEY: "synthetic-auth-key",
  APP_SESSION_COOKIE_KEY: Buffer.alloc(32, 7).toString("base64url"),
};
const config = readSessionConfig(environment);
const fails = (status: number, code: string) => (error: unknown) => error instanceof SessionFailure && error.status === status && error.code === code;

function request(headers: Record<string, string> = {}): Request {
  return new Request(`${config.origin}/api/auth/begin`, { method: "POST", headers: {
    host: "127.0.0.1:55444", origin: config.origin, "sec-fetch-site": "same-origin", ...headers,
  } });
}

test("session configuration fails closed for missing secrets, hosted HTTP and nonliteral local destinations", () => {
  for (const key of ["APP_ORIGIN", "APP_API_ORIGIN", "APP_AUTH_URL", "APP_API_TECHNICAL_KEY", "APP_AUTH_API_KEY", "APP_SESSION_COOKIE_KEY"]) {
    assert.throws(() => readSessionConfig({ ...environment, [key]: "" }), fails(503, "upstream_unavailable"));
  }
  for (const delta of [{ APP_SESSION_MODE: "unknown" }, { VERCEL: "1" }, { SITE_MODE: "release" },
    { APP_ORIGIN: "http://localhost:55444" }, { APP_API_ORIGIN: "http://127.0.0.1:55443/evil" },
    { APP_AUTH_URL: "http://user@127.0.0.1:55441" }, { APP_AUTH_URL: "http://127.0.0.1:55441/?redirect=bad" },
    { APP_SESSION_MODE: "hosted" }, { APP_API_TECHNICAL_KEY: "bad\r\nkey" }, { APP_SESSION_COOKIE_KEY: "a".repeat(44) }]) {
    assert.throws(() => readSessionConfig({ ...environment, ...delta }), fails(503, "upstream_unavailable"));
  }
});

const hostedEnvironment = {
  ...environment, APP_SESSION_MODE: "hosted", APP_ORIGIN: "https://web.example.test",
  APP_API_ORIGIN: "https://api.example.test", APP_AUTH_URL: "https://abcdefghijklmnopqrst.supabase.co/auth/v1",
  APP_AUTH_API_KEY: "sb_publishable_synthetic_public_key",
};
const legacyKey = (header: unknown = { alg: "HS256", typ: "JWT" }, payload: unknown = { role: "anon", iss: "supabase", ref: "abcdefghijklmnopqrst" }) =>
  [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).concat(Buffer.alloc(32, 9).toString("base64url")).join(".");

test("hosted Auth keys admit only publishable or matching-project legacy anon classes", () => {
  for (const key of ["sb_publishable_a", "sb_publishable_A0-_", legacyKey(), `sb_publishable_${"a".repeat(8192 - 15)}`]) {
    assert.equal(readSessionConfig({ ...hostedEnvironment, APP_AUTH_API_KEY: key }).authApiKey, key);
  }
  assert.equal(readSessionConfig(environment).authApiKey, environment.APP_AUTH_API_KEY);
  const parts = legacyKey().split(".");
  const invalid = [
    environment.APP_AUTH_API_KEY, "sb_secret_synthetic", "service_role", "unknown", "sb_publishable_", "sb_publishable_bad!",
    "sb_publishable_has space", "sb_publishable_bad\n", "sb_publishable_é", `sb_publishable_${"a".repeat(8193 - 15)}`,
    legacyKey({ alg: "none", typ: "JWT" }), legacyKey({ alg: "RS256", typ: "JWT" }), legacyKey({ alg: "HS256" }),
    legacyKey([], {}), legacyKey(null, null), legacyKey(undefined, []),
    ...["service_role", "authenticated", "", null].map(role => legacyKey(undefined, { role, iss: "supabase", ref: "abcdefghijklmnopqrst" })),
    legacyKey(undefined, { role: "anon", iss: "other", ref: "abcdefghijklmnopqrst" }),
    legacyKey(undefined, { role: "anon", iss: "supabase", ref: "otherprojectabcdefghij" }),
    `${parts[0]}.${parts[1]}.`, `${parts[0]}=.${parts[1]}.${parts[2]}`, `${parts[0]}.${parts[1]}.AB`,
    `${parts[0]}.${parts[1]}.${parts[2]}.extra`, `bm90LWpzb24.${parts[1]}.${parts[2]}`,
  ];
  for (const key of invalid) {
    assert.throws(() => readSessionConfig({ ...hostedEnvironment, APP_AUTH_API_KEY: key }), fails(503, "upstream_unavailable"));
  }
  assert.throws(() => readSessionConfig({ ...hostedEnvironment, APP_AUTH_API_KEY: legacyKey(), APP_AUTH_URL: "https://auth.example.test/auth/v1" }), fails(503, "upstream_unavailable"));
  assert.throws(() => readSessionConfig({ ...hostedEnvironment, APP_API_TECHNICAL_KEY: "a".repeat(4097) }), fails(503, "upstream_unavailable"));
});

test("hosted privileged and unknown Auth keys fail before credential-bearing upstream requests", async () => {
  const hosted = readSessionConfig(hostedEnvironment);
  const context = newContext();
  for (const key of ["sb_secret_synthetic", environment.APP_AUTH_API_KEY, legacyKey(undefined, { role: "service_role", iss: "supabase", ref: "abcdefghijklmnopqrst" })]) {
    const request = new NextRequest(`${hosted.origin}/api/auth/login`, {
      method: "POST", headers: { host: "web.example.test", origin: hosted.origin, "sec-fetch-site": "same-origin",
        "content-type": "application/json", "x-csrf-token": context.csrf,
        cookie: `${hosted.names.context}=${sealCookie(hosted, "context", context)}` },
      body: JSON.stringify({ email: "synthetic@example.test", password: "synthetic-password", generation: context.generation }),
    });
    const response = await handleSessionRequest("login", request, { ...hostedEnvironment, APP_AUTH_API_KEY: key }, async () => assert.fail("Invalid key class reached Auth"));
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(JSON.parse(body).code, "upstream_unavailable");
    assert.equal(body.includes(key), false);
    assert.deepEqual(response.headers.getSetCookie(), []);
  }
});

test("protected document CSP replaces attacker headers with a fresh matching nonce and private policy", () => {
  const request = new NextRequest("https://web.example.test/login", { headers: {
    "x-nonce": "attacker-nonce", "content-security-policy": "script-src 'unsafe-inline'",
    "content-security-policy-report-only": "report-uri https://attacker.example.test",
  } });
  const first = proxy(request);
  const second = proxy(request);
  const policy = first.headers.get("content-security-policy")!;
  const nonce = first.headers.get("x-middleware-request-x-nonce")!;
  assert.match(nonce, /^[A-Za-z0-9+/]{43}=$/);
  assert.notEqual(nonce, second.headers.get("x-middleware-request-x-nonce"));
  assert.equal(first.headers.get("x-middleware-request-content-security-policy"), policy);
  assert.equal(first.headers.has("x-middleware-request-content-security-policy-report-only"), false);
  const scripts = policy.split("; ").find(value => value.startsWith("script-src "))!;
  assert.ok(scripts.includes(`'nonce-${nonce}'`));
  assert.ok(scripts.includes("'strict-dynamic'"));
  assert.equal(scripts.includes("'unsafe-inline'"), false);
  if (process.env.NODE_ENV !== "development") assert.equal(scripts.includes("'unsafe-eval'"), false);
  assert.ok(policy.includes(`style-src 'self' 'nonce-${nonce}'`));
  assert.ok(policy.includes("style-src-attr 'unsafe-inline'"));
  for (const restriction of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'", "connect-src 'self'"]) assert.ok(policy.includes(restriction));
  assert.equal(policy.includes("attacker"), false);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
});

test("hosted cookies are host-only HttpOnly Secure browser-session cookies; only explicit local mode relaxes Secure", () => {
  const hosted = readSessionConfig({ ...environment, APP_SESSION_MODE: "hosted", APP_ORIGIN: "https://web.example.test", APP_API_ORIGIN: "https://api.example.test", APP_AUTH_URL: "https://auth.example.test/auth/v1", APP_AUTH_API_KEY: "sb_publishable_synthetic" });
  assert.equal(hosted.authUrl, "https://auth.example.test/auth/v1");
  assert.equal(cookieHeader(hosted, "session", "sealed"), "__Host-lovora-session=sealed; Path=/; HttpOnly; SameSite=Lax; Secure");
  assert.equal(cookieHeader(config, "context", "sealed"), "lovora-local-auth-context=sealed; Path=/; HttpOnly; SameSite=Lax");
  assert.match(cookieHeader(config, "session", null), /; Max-Age=0$/);
});

test("encrypted envelopes reject tamper, wrong key, origin, purpose and noncanonical encoding", () => {
  const context = newContext();
  const encoded = sealCookie(config, "context", context);
  assert.deepEqual(openCookie(config, "context", encoded), context);
  assert.notEqual(encoded, sealCookie(config, "context", context));
  assert.equal(encoded.includes(context.csrf), false);
  assert.equal(openCookie(config, "session", encoded), null);
  assert.equal(openCookie({ ...config, origin: "http://127.0.0.1:55445" }, "context", encoded), null);
  assert.equal(openCookie(readSessionConfig({ ...environment, APP_SESSION_COOKIE_KEY: Buffer.alloc(32, 8).toString("base64url") }), "context", encoded), null);
  const bytes = Buffer.from(encoded.slice(3), "base64url");
  bytes[15] ^= 1;
  for (const bad of [`v1.${bytes.toString("base64url")}`, encoded + "=", "v2." + encoded.slice(3), encoded.slice(0, -3)]) {
    assert.equal(openCookie(config, "context", bad), null);
  }
});

test("session admission requires matching context generation; old cookie responses cannot restore a logged-out generation", () => {
  const old = newContext();
  const current = newContext();
  const session = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: 1000, generation: old.generation };
  const tokenCookie = `${config.names.session}=${sealCookie(config, "session", session)}`;
  const matching = `${config.names.context}=${sealCookie(config, "context", old)}; ${tokenCookie}`;
  assert.deepEqual(readAuthCookies(config, matching).session, session);
  assert.equal(readAuthCookies(config, tokenCookie).session, null);
  assert.equal(readAuthCookies(config, `${config.names.context}=${sealCookie(config, "context", current)}; ${tokenCookie}`).session, null);
  assert.equal(readAuthCookies(config, `${config.names.context}=tampered; ${tokenCookie}`).session, null);
  assert.throws(() => requireGeneration(current, old.generation), fails(409, "session_changed"));
});

test("duplicate protected cookies fail closed and oversized session envelopes never become truncated cookies", () => {
  for (const name of Object.values(config.names)) {
    assert.throws(() => readAuthCookies(config, `${name}=one; ${name}=two`), fails(400, "invalid_request"));
  }
  const context = newContext();
  assert.throws(() => sealCookie(config, "session", { accessToken: "a".repeat(3000), refreshToken: "refresh", expiresAt: 1000, generation: context.generation }), fails(503, "upstream_unavailable"));
  assert.equal(openCookie(config, "session", "a".repeat(3500)), null);
});

test("Origin, Host, Fetch Metadata and constant-time CSRF checks all precede mutations", () => {
  const context = newContext();
  requireCsrf(request({ "x-csrf-token": context.csrf }), config, context);
  const invalidHeaders: Record<string, string>[] = [{ origin: "null" }, { origin: "https://other.example.test" }, { origin: `${config.origin}, ${config.origin}` },
    { host: "evil.example.test" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "same-origin, same-origin" },
    { "x-csrf-token": "bad" }, { "x-csrf-token": newContext().csrf }, { "x-csrf-token": `${context.csrf},${context.csrf}` }];
  for (const headers of invalidHeaders) {
    assert.throws(() => requireCsrf(request({ "x-csrf-token": context.csrf, ...headers }), config, context), fails(403, "csrf_denied"));
  }
  const missing = request({ "x-csrf-token": context.csrf });
  missing.headers.delete("origin");
  assert.throws(() => requireCsrf(missing, config, context), fails(403, "csrf_denied"));
  assert.throws(() => requireCsrf(request({ "x-csrf-token": context.csrf }), config, null), fails(403, "csrf_denied"));
});

test("return destinations cannot select external, encoded, query or fragment targets", () => {
  for (const path of ["/application", "/settings", "/settings/team"]) assert.equal(safeReturnPath(path), path);
  for (const unsafe of ["//evil.example.test", "https://evil.example.test", "/settings?next=evil", "/settings#x", "/%73ettings", "/settings/../login", null]) {
    assert.equal(safeReturnPath(unsafe), "/application");
  }
});

const appMe = {
  profile: { userId: "11111111-1111-4111-8111-111111111111", displayName: "Synthetic Member", revision: 1 },
  email: "member@example.test",
  workspace: { id: "22222222-2222-4222-8222-222222222222", displayName: "Synthetic Workspace", revision: 1 },
  membership: { userId: "11111111-1111-4111-8111-111111111111", displayName: "Synthetic Member", role: "member", status: "active", revision: 1 },
  capabilities: ["profile.read.self", "team.read"],
};
const appRequestId = "33333333-3333-4333-8333-333333333333";
const tokenResult = { access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 300, token_type: "bearer" };
function authRequest(operation: SessionOperation, context: AuthContext, options: { cookie?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {}): Request {
  const method = operation === "context" || operation === "me" ? "GET" : "POST";
  return new NextRequest(`${config.origin}/api/${operation === "me" ? "app/me" : `auth/${operation}`}`, {
    method, headers: {
      host: "127.0.0.1:55444", origin: config.origin, "sec-fetch-site": "same-origin", "content-type": "application/json",
      "x-csrf-token": context.csrf, cookie: options.cookie ?? `${config.names.context}=${sealCookie(config, "context", context)}`, ...options.headers,
    },
    ...(method === "POST" ? { body: JSON.stringify({ generation: context.generation, ...options.body }) } : {}),
  });
}
const noUpstream: Fetcher = async () => { assert.fail("Rejected/local operation must not reach an upstream"); };
function sealedSession(context: AuthContext): string {
  return `${config.names.session}=${sealCookie(config, "session", { accessToken: tokenResult.access_token, refreshToken: tokenResult.refresh_token, expiresAt: Date.now() + 300000, generation: context.generation })}`;
}

test("context initialization and begin acknowledge a fresh signed-out generation without provider work", async () => {
  const context = newContext();
  const existing = await handleSessionRequest("context", authRequest("context", context), environment, noUpstream);
  assert.deepEqual(await existing.json(), context);
  assert.deepEqual(existing.headers.getSetCookie(), []);
  for (const cookie of ["", `${config.names.context}=tampered; ${sealedSession(context)}`]) {
    const reset = await handleSessionRequest("context", authRequest("context", context, { cookie }), environment, noUpstream);
    const next = await reset.json();
    assert.notEqual(next.generation, context.generation);
    assert.equal(reset.headers.getSetCookie().filter(value => value.includes("Max-Age=0")).length, 3);
    assert.equal(readAuthCookies(config, reset.headers.getSetCookie().map(value => value.split(";")[0]).join("; ")).session, null);
  }
  const begin = await handleSessionRequest("begin", authRequest("begin", context), environment, noUpstream);
  assert.notEqual((await begin.json()).generation, context.generation);
  assert.equal(begin.headers.getSetCookie().filter(value => value.includes("Max-Age=0")).length, 3);
});

test("boundary failures reject before Auth, never set cookies, and remain private/no-store", async () => {
  const context = newContext();
  const cases: { options: NonNullable<Parameters<typeof authRequest>[2]>; status: number; code: string }[] = [
    { options: { headers: { origin: "null" } }, status: 403, code: "csrf_denied" },
    { options: { headers: { "x-csrf-token": "bad" } }, status: 403, code: "csrf_denied" },
    { options: { body: { generation: newContext().generation } }, status: 409, code: "session_changed" },
    { options: { body: { accessToken: "caller-selected" } }, status: 400, code: "invalid_request" },
    { options: { body: { password: "x".repeat(17000) } }, status: 400, code: "invalid_request" },
    { options: { headers: { "content-type": "text/plain" } }, status: 400, code: "invalid_request" },
    { options: { cookie: `${config.names.context}=one; ${config.names.context}=two` }, status: 400, code: "invalid_request" },
  ];
  for (const { options, status, code } of cases) {
    const response = await handleSessionRequest("login", authRequest("login", context, {
      ...options, body: { email: "member@example.test", password: "synthetic-password", ...options.body },
    }), environment, noUpstream);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.deepEqual(response.headers.getSetCookie(), []);
  }
});

test("login admits only validated current me and seals credentials without rotating context or leaking provider fields", async () => {
  const context = newContext();
  const calls: string[] = [];
  const transport: Fetcher = async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.redirect, "manual");
    if (String(input).startsWith(config.authUrl)) return Response.json({ ...tokenResult, user: { private_provider_field: "must-not-leak" } }, { headers: { "set-cookie": "upstream-secret=never-forward" } });
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${config.technicalKey}`);
    assert.equal(headers.get("x-app-access-token"), tokenResult.access_token);
    assert.equal(headers.has("cookie"), false);
    return Response.json(appMe);
  };
  const response = await handleSessionRequest("login", authRequest("login", context, { body: { email: "member@example.test", password: "synthetic-password", returnTo: "//evil.test" }, headers: { authorization: "Bearer caller-choice" } }), environment, transport);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [`${config.authUrl}/token?grant_type=password`, `${config.apiOrigin}/v1/app/me`]);
  const body = await response.json();
  assert.deepEqual(body, { me: appMe, returnTo: "/application" });
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].startsWith(`${config.names.session}=`), true);
  const session = openCookie(config, "session", cookies[0].split(";")[0].slice(config.names.session.length + 1));
  assert.equal(session?.generation, context.generation);
  assert.equal(session?.refreshToken, tokenResult.refresh_token);
  assert.equal(JSON.stringify(body).includes("synthetic-access"), false);
  assert.equal(cookies.some(cookie => cookie.includes("upstream-secret")), false);
});

test("unadmitted Auth retains only the sealed logout session while technical401 and invalid upstream data stay unavailable", async () => {
  const context = newContext();
  for (const [status, body, expected, retainsSession] of [
    [403, { code: "forbidden", requestId: appRequestId }, 403, true],
    [401, { status: "unauthorized" }, 503, false],
    [503, { code: "dependency_unavailable", requestId: appRequestId }, 503, false],
    [200, { ...appMe, accessToken: "must-not-serialize" }, 503, false],
    [200, { ...appMe, membership: { ...appMe.membership, status: "disabled" } }, 503, false],
  ] as const) {
    const transport: Fetcher = async input => String(input).startsWith(config.authUrl) ? Response.json(tokenResult) : Response.json(body, { status });
    const response = await handleSessionRequest("login", authRequest("login", context, { body: { email: "member@example.test", password: "synthetic-password" } }), environment, transport);
    assert.equal(response.status, expected);
    assert.equal(response.headers.getSetCookie().length, retainsSession ? 1 : 0);
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ["code", "requestId"]);
    if ("requestId" in body) assert.equal(result.requestId, appRequestId);
    assert.equal(result.code, status === 403 ? "forbidden" : status === 503 ? "dependency_unavailable" : "upstream_unavailable");
  }
});

test("refresh keeps its generation, rejects browser token selection, and leaves cookies unchanged on provider failure", async () => {
  const context = newContext();
  const cookie = `${config.names.context}=${sealCookie(config, "context", context)}; ${sealedSession(context)}`;
  let calls = 0;
  const transport: Fetcher = async (input, init) => {
    calls++;
    if (String(input).startsWith(config.authUrl)) {
      assert.deepEqual(JSON.parse(String(init?.body)), { refresh_token: tokenResult.refresh_token });
      return Response.json({ ...tokenResult, refresh_token: "synthetic-rotated-refresh" });
    }
    return Response.json(appMe);
  };
  const response = await handleSessionRequest("refresh", authRequest("refresh", context, { cookie }), environment, transport);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { me: appMe });
  assert.equal(calls, 2);
  const saved = response.headers.getSetCookie();
  assert.equal(saved.length, 1);
  assert.equal(openCookie(config, "session", saved[0].split(";")[0].slice(config.names.session.length + 1))?.generation, context.generation);
  const rejected = await handleSessionRequest("refresh", authRequest("refresh", context, { cookie, body: { refreshToken: "caller-token" } }), environment, noUpstream);
  assert.equal(rejected.status, 400);
  const expired = await handleSessionRequest("refresh", authRequest("refresh", context, { cookie }), environment, async () => Response.json({ error_code: "refresh_token_not_found", private_detail: "never-return" }, { status: 400 }));
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).code, "unauthenticated");
  assert.deepEqual(expired.headers.getSetCookie(), []);
});

test("logout clears browser admission regardless of provider outcome but only successful local revocation is confirmed", async () => {
  for (const available of [true, false]) {
    const context = newContext();
    const cookie = `${config.names.context}=${sealCookie(config, "context", context)}; ${sealedSession(context)}`;
    let calls = 0;
    const transport: Fetcher = async (input, init) => {
      calls++;
      assert.equal(String(input), `${config.authUrl}/logout?scope=local`);
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${tokenResult.access_token}`);
      if (!available) throw new Error("synthetic provider outage with secret detail");
      return new Response(null, { status: 204 });
    };
    const response = await handleSessionRequest("logout", authRequest("logout", context, { cookie }), environment, transport);
    assert.deepEqual(await response.json(), { localCleared: true, providerOutcome: available ? "confirmed" : "unknown" });
    assert.equal(calls, 1);
    const currentCookies = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const current = readAuthCookies(config, currentCookies);
    assert.notEqual(current.context?.generation, context.generation);
    assert.equal(current.session, null);
    assert.equal(readAuthCookies(config, `${currentCookies.replace(`${config.names.session}=; `, "")}; ${sealedSession(context)}`).session, null);
  }
});

test("upstream streamed byte limits, malformed JSON and cancellation remain bounded without provider disclosure", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(boundedJson(new Response("x".repeat(65537), { headers: { "content-type": "application/json" } }), 65536, signal), fails(503, "upstream_unavailable"));
  await assert.rejects(boundedJson(new Response("{private-provider-body", { headers: { "content-type": "application/json" } }), 65536, signal), fails(503, "upstream_unavailable"));
  const controller = new AbortController();
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } });
  const reading = boundedJson(new Response(body, { headers: { "content-type": "application/json" } }), 65536, controller.signal);
  controller.abort();
  await assert.rejects(reading, fails(503, "upstream_unavailable"));
  assert.equal(cancelled, true);
  await assert.rejects(currentAppMe(config, "synthetic-access", signal, async () => Response.json({ status: "unauthorized" }, { status: 401 })), fails(503, "upstream_unavailable"));
});

test("Auth invalid credentials, throttling, redirects and malformed or oversized sessions never disclose provider details or write admission", async () => {
  const context = newContext();
  const cases = [
    { status: 400, body: { error_code: "invalid_credentials", detail: "private-provider-detail" }, expectedStatus: 401, expectedCode: "invalid_credentials" },
    { status: 429, body: { detail: "private-provider-detail" }, expectedStatus: 429, expectedCode: "rate_limited" },
    { status: 401, body: { error_code: "invalid_api_key", detail: "private-provider-detail" }, expectedStatus: 503, expectedCode: "upstream_unavailable" },
    { status: 302, body: { redirect: "https://foreign.example.test" }, expectedStatus: 503, expectedCode: "upstream_unavailable" },
    { status: 200, body: { ...tokenResult, expires_in: "300" }, expectedStatus: 503, expectedCode: "upstream_unavailable" },
    { status: 200, body: { ...tokenResult, access_token: "a".repeat(3000) }, expectedStatus: 503, expectedCode: "upstream_unavailable" },
    { status: 200, body: { ...tokenResult, private_metadata: "x".repeat(65536) }, expectedStatus: 503, expectedCode: "upstream_unavailable" },
  ];
  for (const value of cases) {
    let calls = 0;
    const transport: Fetcher = async (input, init) => {
      calls++;
      assert.equal(String(input), `${config.authUrl}/token?grant_type=password`);
      assert.equal(init?.redirect, "manual");
      return Response.json(value.body, { status: value.status });
    };
    const response = await handleSessionRequest("login", authRequest("login", context, { body: { email: "member@example.test", password: "synthetic-password" } }), environment, transport);
    assert.equal(response.status, value.expectedStatus);
    const body = await response.json();
    assert.equal(body.code, value.expectedCode);
    assert.deepEqual(Object.keys(body).sort(), ["code", "requestId"]);
    assert.deepEqual(response.headers.getSetCookie(), []);
    assert.equal(calls, 1);
  }
});

test("request disconnect cancels the in-flight Auth grant before current admission or a cookie write", async () => {
  const context = newContext();
  const controller = new AbortController();
  const started = Promise.withResolvers<void>();
  let aborted = false;
  let calls = 0;
  const transport: Fetcher = async (_input, init) => new Promise((_resolve, reject) => {
    calls++;
    init!.signal!.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    started.resolve();
  });
  const request = new NextRequest(authRequest("login", context, { body: { email: "member@example.test", password: "synthetic-password" } }), { signal: controller.signal });
  const pending = handleSessionRequest("login", request, environment, transport);
  await started.promise;
  controller.abort();
  const response = await pending;
  assert.equal(aborted, true);
  assert.equal(calls, 1);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "upstream_unavailable");
  assert.deepEqual(response.headers.getSetCookie(), []);
});

function clientSessionHarness(t: TestContext, refresh: () => Promise<Response>, beforeDelivery?: (operation: SessionOperation) => Promise<void>) {
  const cookies = new Map<string, string>();
  const operations: Record<string, SessionOperation> = {
    "/api/auth/context": "context", "/api/auth/begin": "begin", "/api/auth/refresh": "refresh", "/api/app/me": "me",
  };
  const requests: SessionOperation[] = [];
  const controllers: SessionController[] = [];
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  const header = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  function replaceSession() {
    const context = newContext();
    cookies.set(config.names.context, sealCookie(config, "context", context));
    const [name, value] = sealedSession(context).split("=");
    cookies.set(name, value);
    return context;
  }
  replaceSession();
  const provider: Fetcher = async input => String(input).startsWith(config.authUrl)
    ? refresh()
    : Response.json({ code: "unauthenticated", requestId: appRequestId }, { status: 401 });
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const operation = operations[String(input)];
    assert.ok(operation, "Only the fixed session operations are allowed");
    assert.equal((await navigator.locks.query()).held?.length, 1, "Every session request remains under the native Web Lock");
    requests.push(operation);
    const headers = new Headers(init?.headers);
    headers.set("cookie", header());
    headers.set("host", "127.0.0.1:55444");
    headers.set("origin", config.origin);
    headers.set("sec-fetch-site", "same-origin");
    const response = await handleSessionRequest(operation, new NextRequest(`${config.origin}${input}`, { ...init, headers, signal: init?.signal ?? undefined }), environment, provider);
    if (operation === "refresh" && response.status !== 200) assert.deepEqual(response.headers.getSetCookie(), []);
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(";")[0].split("=");
      if (cookie.includes("Max-Age=0")) cookies.delete(name);
      else cookies.set(name, value);
    }
    await beforeDelivery?.(operation);
    return response;
  });
  t.after(() => {
    for (const controller of controllers) controller.stop();
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });
  function mount() {
    const settled = Promise.withResolvers<SessionView>();
    const views: SessionView[] = [];
    const controller = new SessionController({ restore: !!readAuthCookies(config, header()).session }, view => {
      views.push(view);
      if (view.phase !== "checking") settled.resolve(view);
    });
    controllers.push(controller);
    controller.start();
    return { controller, views, settled: settled.promise };
  }
  return { mount, header, requests, replaceSession };
}

const deniedRefresh = () => Promise.resolve(Response.json({ error_code: "refresh_token_not_found" }, { status: 400 }));
const drainSessionLock = () => navigator.locks.request("lovora-app-session", () => {});

test("definitive refresh rejection clears through locked begin and controller recreation never retries the invalid grant", async t => {
  let grants = 0;
  const client = clientSessionHarness(t, () => { grants++; return deniedRefresh(); });
  const before = readAuthCookies(config, client.header()).context!;
  const first = client.mount();
  assert.equal((await first.settled).phase, "signed-out");
  await drainSessionLock();
  assert.equal(readAuthCookies(config, client.header()).session, null);
  assert.notEqual(readAuthCookies(config, client.header()).context!.generation, before.generation);
  assert.equal(client.requests.filter(operation => operation === "begin").length, 1);
  first.controller.stop();
  const reloaded = client.mount();
  assert.equal((await reloaded.settled).phase, "signed-out");
  await drainSessionLock();
  assert.equal(grants, 1);
});

test("transient refresh unavailability preserves cookies and never attempts begin or an automatic grant retry", async t => {
  let grants = 0;
  const client = clientSessionHarness(t, async () => { grants++; return Response.json({}, { status: 503 }); });
  const original = client.header();
  const mounted = client.mount();
  assert.equal((await mounted.settled).phase, "unavailable");
  await drainSessionLock();
  assert.equal(client.header(), original);
  assert.equal(client.requests.includes("begin"), false);
  assert.equal(grants, 1);
});

test("late definitive refresh rejection cannot reset a newer cookie generation and requires explicit checking", async t => {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const client = clientSessionHarness(t, async () => { reached.resolve(); await release.promise; return deniedRefresh(); });
  const mounted = client.mount();
  await reached.promise;
  client.replaceSession();
  const newer = client.header();
  release.resolve();
  assert.equal((await mounted.settled).phase, "changed");
  await mounted.controller.revalidate();
  await drainSessionLock();
  assert.equal(client.header(), newer);
  assert.equal(client.requests.includes("begin"), false);
  assert.equal(client.requests.filter(operation => operation === "refresh").length, 1);
});

for (const boundary of ["refresh response", "context reread"] as const) {
  test(`newer client intent during ${boundary} prevents stale rejection cleanup`, async t => {
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    t.after(() => release.resolve());
    let contextReads = 0;
    const client = clientSessionHarness(t, async () => {
      if (boundary === "refresh response") { reached.resolve(); await release.promise; }
      return deniedRefresh();
    }, async operation => {
      if (operation === "context" && ++contextReads === 2 && boundary === "context reread") {
        reached.resolve(); await release.promise;
      }
    });
    const mounted = client.mount();
    const original = client.header();
    await reached.promise;
    const otherTab = new BroadcastChannel("lovora-app-session");
    t.after(() => otherTab.close());
    otherTab.postMessage({ type: "invalidate" });
    assert.equal((await mounted.settled).phase, "changed");
    release.resolve();
    await drainSessionLock();
    await mounted.controller.revalidate();
    assert.equal(client.header(), original);
    assert.equal(client.requests.includes("begin"), false);
    assert.equal(mounted.views.at(-1)?.phase, "changed");
  });
}
