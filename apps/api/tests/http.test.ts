import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'node:http';
import test from 'node:test';
import { PostgresProbe } from '../src/connectivity/adapters/postgres.js';
import { assertContract, get, silentPeer, startApi } from './helpers.js';

function url(port: number) {
  return `postgresql://fixture:private-test-password@127.0.0.1:${port}/fixture`;
}

test('real HTTP distinguishes liveness from an unavailable DB; routes and CORS stay bounded', async t => {
  const portReservation = await silentPeer();
  const port = portReservation.port;
  await portReservation.close();
  const { app, origin } = await startApi(url(port));
  t.after(() => app.close());
  const live = await get(origin, '/health/live');
  assert.equal(live.status, 200);
  assertContract(live.body, 'Liveness');
  for (let attempt = 0; attempt < 3; attempt++) {
    const began = performance.now();
    const ready = await get(origin, '/health/ready');
    assert.equal(ready.status, 503);
    assertContract(ready.body, 'Degraded');
    assert.equal(ready.body.reason, 'database_unavailable');
    assert.ok(performance.now() - began < 4000);
    assert.doesNotMatch(JSON.stringify(ready.body), /private-test-password|127\.0\.0\.1|SELECT/);
  }
  assert.equal((await get(origin, '/unknown')).status, 404);
  const allowed = await fetch(origin + '/health/live', { headers: { Origin: 'http://127.0.0.1:3000' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  await allowed.arrayBuffer();
  const denied = await fetch(origin + '/health/live', { headers: { Origin: 'https://untrusted.example' } });
  assert.notEqual(denied.headers.get('access-control-allow-origin'), 'https://untrusted.example');
  await denied.arrayBuffer();
});

test('silent connections time out and saturated probes fail without abandoned clients', async t => {
  const peer = await silentPeer();
  t.after(() => peer.close());
  const { app, origin } = await startApi(url(peer.port));
  t.after(() => app.close());
  const probe = app.get(PostgresProbe);
  for (let round = 0; round < 2; round++) {
    const began = performance.now();
    const responses = await Promise.all(Array.from({ length: 12 }, () => get(origin, '/health/ready')));
    assert.ok(performance.now() - began < 4000);
    for (const response of responses) {
      assert.equal(response.status, 503);
      assertContract(response.body, 'Degraded');
      assert.ok(['database_timeout', 'database_unavailable'].includes(response.body.reason));
    }
    assert.ok(responses.some(response => {
      assertContract(response.body, 'Degraded');
      return response.body.reason === 'database_timeout';
    }));
    await delay(50);
    assert.equal(probe.pool.totalCount, 0);
    assert.equal(probe.pool.waitingCount, 0);
    assert.equal(peer.sockets.size, 0);
  }
  assert.equal((await get(origin, '/health/live')).status, 200);
});

test('HTTP disconnect and application shutdown release pending operations', async t => {
  const peer = await silentPeer();
  t.after(() => peer.close());
  const { app, origin } = await startApi(url(peer.port));
  let closed = false;
  t.after(async () => { if (!closed) await app.close(); });
  const probe = app.get(PostgresProbe);
  const pending = request(origin + '/health/ready');
  pending.on('error', () => {});
  pending.end();
  await delay(50);
  pending.destroy();
  const began = performance.now();
  await app.close();
  closed = true;
  assert.ok(performance.now() - began < 4000);
  await delay(50);
  assert.equal(probe.pool.totalCount, 0);
  assert.equal(probe.pool.waitingCount, 0);
  assert.equal(peer.sockets.size, 0);
});
