import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { requestEtsy } from "../../src/features/etsy-connection/client.ts";
import { SessionFailure } from "../../src/features/app-session/errors.ts";

const generation = "g".repeat(43), csrf = "c".repeat(43), uuid = "11111111-1111-4111-8111-111111111111";
const input = { expectedShopId: "9007199254740993", expectedRevision: 7, idempotencyKey: uuid };
function browserOrigin(context: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://127.0.0.1:55644" } } });
  context.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
}

test("queued Etsy mutation rechecks context after the shared session lock and rejects a changed generation", async context => {
  browserOrigin(context);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const held = navigator.locks.request("lovora-app-session", async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (path: string) => {
    calls++; assert.equal(path, "/api/auth/context");
    return Response.json({ generation: "n".repeat(43), csrf });
  });
  try {
    const mutation = requestEtsy("create", input, generation, new AbortController().signal);
    assert.equal(calls, 0, "No context or business request may race the session lock");
    const rejected = assert.rejects(mutation, (error: unknown) => error instanceof SessionFailure && error.code === "session_changed");
    release.resolve(); await held; await rejected;
    assert.equal(calls, 1, "A changed context prevents the business mutation entirely");
  } finally { release.resolve(); await held; }
});

test("an uncertain mutation preserves its one explicit revision/key and is never automatically submitted twice", async context => {
  browserOrigin(context);
  const mutations: unknown[] = [];
  context.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/auth/context") return Response.json({ generation, csrf });
    mutations.push(JSON.parse(init.body as string));
    return Response.json({ code: "outcome_unknown", requestId: uuid }, { status: 503 });
  });
  await assert.rejects(requestEtsy("create", input, generation, new AbortController().signal), (error: unknown) => error instanceof SessionFailure && error.code === "outcome_unknown");
  assert.deepEqual(mutations, [{ ...input, generation }]);
});

test("abandoning a queued mutation cancels it without reading context or sending a mutation", async context => {
  browserOrigin(context);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const held = navigator.locks.request("lovora-app-session", async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  context.mock.method(globalThis, "fetch", async () => assert.fail("Cancelled lock waiter reached the network"));
  const controller = new AbortController();
  try {
    const mutation = requestEtsy("create", input, generation, controller.signal);
    const rejected = assert.rejects(mutation, { name: "AbortError" });
    controller.abort(); await rejected;
  } finally { release.resolve(); await held; }
});

test("lookup cannot bind a valid response for a different query or page", async context => {
  browserOrigin(context);
  const result = { query: "other", outcome: "exact", items: [{ shopId: input.expectedShopId, shopName: "Other", shopUrl: "https://www.etsy.com/shop/Other", match: "exact" }], page: { offset: 0, limit: 20, providerCount: "1", complete: true, hasMore: false, nextOffset: null, truncated: false }, ownershipVerified: false, observedAt: "2026-11-18T09:00:00.000Z" };
  context.mock.method(globalThis, "fetch", async () => Response.json(result));
  await assert.rejects(requestEtsy("lookup", { shopName: "paper", offset: 0 }, generation, new AbortController().signal), (error: unknown) => error instanceof SessionFailure && error.code === "upstream_unavailable");
  await assert.rejects(requestEtsy("lookup", { shopName: "other", offset: 20 }, generation, new AbortController().signal), (error: unknown) => error instanceof SessionFailure && error.code === "upstream_unavailable");
});
