import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { checkConnectivity } from "../../src/lib/api/health-client.ts";

const origin = "http://127.0.0.1:4317";
const live = { status: "ok" };
const ready = { status: "ready", database: "up", migrations: "current" };
const signal = () => new AbortController().signal;
const reply = (body: unknown, status = 200) => Response.json(body, { status });

test("ready requires independent valid process and current database results", async () => {
  const calls: string[] = [];
  const result = await checkConnectivity(origin, signal(), async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    return reply(String(input).endsWith("/live") ? live : ready);
  });
  assert.deepEqual(calls.sort(), [`${origin}/health/live`, `${origin}/health/ready`]);
  assert.equal(result.state, "ready");
  assert.deepEqual(result.live, { kind: "success", data: live });
  assert.deepEqual(result.ready, { kind: "success", data: ready });
});

test("valid 503 reasons are degraded while liveness remains independently successful", async () => {
  for (const reason of ["database_unavailable", "database_timeout", "migrations_pending"] as const) {
    const result = await checkConnectivity(origin, signal(), async input => String(input).endsWith("/live") ? reply(live) : reply({ status: "degraded", reason }, 503));
    assert.equal(result.state, "degraded");
    assert.equal(result.live.kind, "success");
    assert.deepEqual(result.ready, { kind: "degraded", data: { status: "degraded", reason } });
  }
});

test("malformed, contradictory and unexpected responses never become readiness or leak raw data", async () => {
  const cases: Array<[unknown, number]> = [[ready, 503], [{ status: "degraded", reason: "secret-password" }, 503], [{ status: "ready", database: "down", migrations: "current" }, 200], [{ ...ready, secret: "private-canary" }, 200], [null, 200], [ready, 401], [ready, 500]];
  for (const [body, status] of cases) {
    const result = await checkConnectivity(origin, signal(), async input => String(input).endsWith("/live") ? reply(live) : reply(body, status));
    assert.equal(result.state, "unreachable");
    assert.equal(result.ready.kind, "failure");
    assert.doesNotMatch(JSON.stringify(result), /private-canary|secret-password/);
  }
  const result = await checkConnectivity(origin, signal(), async () => new Response("<html>private-canary</html>"));
  assert.equal(result.state, "unreachable");
  assert.doesNotMatch(JSON.stringify(result), /private-canary/);
});

test("network failure is not invented database degradation and fresh retry recovers", async () => {
  const failed = await checkConnectivity(origin, signal(), async () => { throw new Error("private-canary"); });
  assert.deepEqual(failed.live, { kind: "failure", reason: "network" });
  assert.equal(failed.state, "unreachable");
  const recovered = await checkConnectivity(origin, signal(), async input => reply(String(input).endsWith("/live") ? live : ready));
  assert.equal(recovered.state, "ready");
});

test("five-second deadline includes response bodies and releases a stalled reader", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let bodyCancelled = false;
  const pending = checkConnectivity(origin, signal(), async () => new Response(new ReadableStream({ cancel() { bodyCancelled = true; } }), { headers: { "content-type": "application/json" } }));
  await nextTurn();
  context.mock.timers.tick(5000);
  const result = await pending;
  assert.equal(result.state, "unreachable");
  assert.deepEqual(result.ready, { kind: "failure", reason: "timeout" });
  assert.equal(bodyCancelled, true);
});

test("cancellation rejects late success and oversized responses fail closed", async () => {
  const controller = new AbortController();
  const pending = checkConnectivity(origin, controller.signal, async input => {
    await nextTurn();
    return reply(String(input).endsWith("/live") ? live : ready);
  });
  controller.abort();
  const cancelled = await pending;
  assert.deepEqual(cancelled.live, { kind: "failure", reason: "cancelled" });
  assert.equal(cancelled.state, "unreachable");
  const oversized = await checkConnectivity(origin, signal(), async () => new Response(" ".repeat(5000), { headers: { "content-type": "application/json" } }));
  assert.deepEqual(oversized.ready, { kind: "failure", reason: "invalid_response" });
});
