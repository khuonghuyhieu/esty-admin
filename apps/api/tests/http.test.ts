import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'node:http';
import test from 'node:test';
import type { TLSSocket } from 'node:tls';
import { PostgresProbe } from '../src/connectivity/adapters/postgres.js';
import { assertContract, createApplication, get, silentPeer, startApi } from './helpers.js';
import { parseConfig } from '../src/config/config.js';
import { tlsPostgres } from './tls.js';
import { expectedMigrations } from '../src/generated/migrations.js';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { syntheticAuthPeer } from './app-auth-fixture.js';
import { AuthVerifier } from '../src/app-foundation/adapters/auth-verifier.js';
import { AuthAdmin } from '../src/app-foundation/adapters/auth-admin.js';
import { AppError } from '../src/app-foundation/application/errors.js';
import { capabilities, capabilitiesFor, permits } from '../src/app-foundation/application/policy.js';
import { displayName, record, revision } from '../src/app-foundation/application/validation.js';

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

test('Vercel denies all unauthorized routes and unsafe preflights before any database connection', async () => {
  const peer = await silentPeer();
  const config = { ...parseConfig({ DATABASE_URL: url(peer.port) }), runtime: 'vercel' as const,
    browserOrigin: 'https://app.lovora.us', previewAccessKey: 'a'.repeat(64) };
  const app = await createApplication(config);
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const probe = app.get(PostgresProbe);
  try {
    for (const path of ['/health/live', '/health/ready', '/unknown']) {
      for (const key of [undefined, 'Bearer wrong', `Bearer ${'b'.repeat(64)}`, `bearer ${config.previewAccessKey}`]) {
        const response = await fetch(origin + path, { headers: key ? { Authorization: key } : {} });
        assert.equal(response.status, 401);
        assertContract(await response.json(), 'Unauthorized');
      }
    }
    for (const [requestOrigin, method, header, expected] of [
      [config.browserOrigin, 'GET', 'authorization', 204],
      ['https://untrusted.example', 'GET', 'authorization', 401],
      [config.browserOrigin, 'POST', 'authorization', 401],
      [config.browserOrigin, 'GET', 'x-unsafe', 401],
    ] as const) {
      const response = await fetch(origin + '/health/ready', { method: 'OPTIONS', headers: {
        Origin: requestOrigin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': header,
      } });
      assert.equal(response.status, expected);
      if (expected === 204) assert.equal(response.headers.get('access-control-allow-origin'), config.browserOrigin);
      await response.arrayBuffer();
    }
    const duplicate = await new Promise<number | undefined>((resolve, reject) => {
      const pending = request(origin + '/health/ready', { headers: { Authorization: [`Bearer ${config.previewAccessKey}`, `Bearer ${config.previewAccessKey}`] } }, response => {
        response.resume(); response.once('end', () => resolve(response.statusCode));
      });
      pending.once('error', reject); pending.end();
    });
    assert.equal(duplicate, 401);
    assert.equal(probe.pool.totalCount, 0);
    assert.equal(peer.sockets.size, 0);
    const headers = { Authorization: `Bearer ${config.previewAccessKey}` };
    const live = await fetch(origin + '/health/live', { headers });
    assert.equal(live.status, 200);
    assertContract(await live.json(), 'Liveness');
    const unknown = await fetch(origin + '/unknown', { headers });
    assert.equal(unknown.status, 404); await unknown.arrayBuffer();
    const ready = await fetch(origin + '/health/ready', { headers, signal: AbortSignal.timeout(4500) });
    assert.equal(ready.status, 503);
    assertContract(await ready.json(), 'Degraded');
    assert.equal(probe.pool.options.max, 2);
  } finally { await app.close(); await peer.close(); }
});

function packet(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeInt32BE(body.length + 4);
  return Buffer.concat([Buffer.from(type), length, body]);
}

function rows(fields: string[], values: readonly string[][]): Buffer {
  const count = Buffer.alloc(2);
  count.writeInt16BE(fields.length);
  const description = fields.map(name => {
    const metadata = Buffer.alloc(18);
    metadata.writeInt32BE(25, 6);
    metadata.writeInt16BE(-1, 10);
    metadata.writeInt32BE(-1, 12);
    return Buffer.concat([Buffer.from(name + '\0'), metadata]);
  });
  const data = values.map(value => packet('D', Buffer.concat([count, ...value.map(cell => {
    const bytes = Buffer.from(cell);
    const length = Buffer.alloc(4);
    length.writeInt32BE(bytes.length);
    return Buffer.concat([length, bytes]);
  })])));
  return Buffer.concat([packet('T', Buffer.concat([count, ...description])), ...data,
    packet('C', Buffer.from(`SELECT ${values.length}\0`)), packet('Z', Buffer.from('I'))]);
}

type PeerMode = 'current' | 'authentication' | 'schema_query' | 'history_query' | 'auth_error' | 'unknown_error';

// Real pg framing over a verified loopback TLS socket; no PostgreSQL instance or
// SQL mutation. Only the two fixed production reads are accepted by this peer.
function readinessPeer(socket: TLSSocket, mode: PeerMode): void {
  let buffered = Buffer.alloc(0);
  let startup = true;
  socket.on('data', chunk => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= (startup ? 4 : 5)) {
      const offset = startup ? 0 : 1;
      const length = buffered.readInt32BE(offset) + offset;
      if (buffered.length < length) return;
      const message = buffered.subarray(0, length);
      buffered = buffered.subarray(length);
      if (startup) {
        startup = false;
        if (mode === 'authentication') continue;
        if (mode === 'auth_error' || mode === 'unknown_error') {
          const code = mode === 'auth_error' ? '28P01' : 'private-code-marker';
          socket.write(packet('E', Buffer.from(`SFATAL\0C${code}\0Mpostgresql://private-user:private-password@private-host/private-db\0Dprivate-detail\0\0`)));
          continue;
        }
        socket.write(Buffer.concat([packet('R', Buffer.alloc(4)), packet('Z', Buffer.from('I'))]));
        continue;
      }
      if (message[0] === 88) { socket.end(); continue; }
      assert.equal(message[0], 81);
      const query = message.subarray(5, -1).toString();
      if (query === "SELECT to_regnamespace('foundation')::text AS schema, to_regclass('public.foundation_migrations')::text AS history") {
        if (mode !== 'schema_query') socket.write(rows(['schema', 'history'], [['foundation', 'foundation_migrations']]));
      } else {
        assert.equal(query, 'SELECT name FROM public.foundation_migrations ORDER BY id');
        if (mode !== 'history_query') socket.write(rows(['name'], expectedMigrations.map(name => [name])));
      }
    }
  });
}

test('readiness diagnostics distinguish verified TLS, authentication and each fixed query without disclosure', async t => {
  const logs: Record<string, unknown>[] = [];
  t.mock.method(console, 'info', (line: string) => logs.push(JSON.parse(line)));
  let mode: PeerMode = 'current';
  const peer = await tlsPostgres(t, 'localhost', socket => readinessPeer(socket, mode));
  for (const next of ['current', 'authentication', 'schema_query', 'history_query', 'auth_error', 'unknown_error'] as const) {
    await t.test(next, async () => {
      mode = next;
      logs.length = 0;
      const base = parseConfig({ DATABASE_URL: url(peer.port) });
      const config = { ...base, runtime: 'vercel' as const, previewAccessKey: 'a'.repeat(64),
        database: { ...base.database, host: 'localhost', ssl: { ca: peer.ca }, query_timeout: 150 } };
      const app = await createApplication(config);
      await app.listen(0, '127.0.0.1');
      try {
        const response = await get(await app.getUrl(), '/health/ready', { Authorization: `Bearer ${config.previewAccessKey}` });
        assert.equal(response.status, next === 'current' ? 200 : 503);
        assertContract(response.body, next === 'current' ? 'Ready' : 'Degraded');
        assert.equal(logs.length, 1);
        const event = logs[0]!;
        assert.equal(event.phase, next === 'current' ? 'history_query' : next.endsWith('error') ? 'authentication' : next);
        assert.equal(event.state, next === 'current' ? 'current' : next.endsWith('error') ? 'database_unavailable' : 'database_timeout');
        assert.equal(event.tls_verified_this_attempt, true);
        assert.equal(event.code, next === 'auth_error' ? '28P01' : undefined);
        const phases = event.phases_ms as Record<string, number>;
        for (const phase of ['pool_acquire', 'dns', 'tcp', 'ssl_request', 'tls_handshake', 'authentication']) {
          assert.equal(typeof phases[phase], 'number', phase);
        }
        const timings = Object.values(phases);
        assert.deepEqual(timings, [...timings].sort((a, b) => a - b));
        assert.ok((event.elapsed_ms as number) >= timings[timings.length - 1]!);
        assert.doesNotMatch(JSON.stringify(logs), /private-|postgresql|SELECT|CERTIFICATE|Authorization|stack|message|detail/);
      } finally { await app.close(); }
    });
  }
});

test('readiness observations preserve TLS rejection and identify pre-handshake timeout', async t => {
  const logs: Record<string, unknown>[] = [];
  t.mock.method(console, 'info', (line: string) => logs.push(JSON.parse(line)));
  const peer = await silentPeer();
  t.after(() => peer.close());
  const probe = new PostgresProbe({ ...parseConfig({ DATABASE_URL: url(peer.port) }).database, ssl: true }, undefined, 2, true);
  assert.equal(await probe.check(), 'database_timeout');
  await probe.onModuleDestroy();
  assert.equal(logs[0]?.phase, 'ssl_request');
  assert.equal(logs[0]?.tls_verified_this_attempt, false);
  const wrongHost = await tlsPostgres(t, 'wrong-host.example', socket => readinessPeer(socket, 'current'));
  const rejected = new PostgresProbe({ ...parseConfig({ DATABASE_URL: url(wrongHost.port) }).database,
    host: 'localhost', ssl: { ca: wrongHost.ca } }, undefined, 2, true);
  assert.equal(await rejected.check(), 'database_unavailable');
  await rejected.onModuleDestroy();
  assert.equal(logs[1]?.phase, 'tls_handshake');
  assert.equal(logs[1]?.tls_verified_this_attempt, false);
  assert.equal(logs[1]?.code, 'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.doesNotMatch(JSON.stringify(logs), /wrong-host|private-test-password|localhost|CERTIFICATE|SELECT/);
});

test('concurrent readiness observations stay isolated, cancellation is final and pooled reuse has no stale phases', async t => {
  const logs: Record<string, unknown>[] = [];
  t.mock.method(console, 'info', (line: string) => logs.push(JSON.parse(line)));
  let connection = 0;
  let connected!: () => void;
  const pendingConnection = new Promise<void>(resolve => { connected = resolve; });
  const peer = await tlsPostgres(t, 'localhost', socket => {
    readinessPeer(socket, connection++ === 0 ? 'authentication' : 'current');
    connected();
  });
  const probe = new PostgresProbe({ ...parseConfig({ DATABASE_URL: url(peer.port) }).database,
    host: 'localhost', ssl: { ca: peer.ca } }, undefined, 2, true);
  let closed = false;
  t.after(async () => { if (!closed) await probe.onModuleDestroy(); });
  const controller = new AbortController();
  const cancelled = probe.check(controller.signal);
  await pendingConnection;
  const current = probe.check();
  controller.abort();
  assert.equal(await cancelled, 'database_unavailable');
  assert.equal(await current, 'current');
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.phase, 'authentication');
  assert.equal(logs[1]?.phase, 'history_query');
  assert.equal(await probe.check(), 'current');
  assert.equal(logs.length, 3);
  assert.deepEqual(Object.keys(logs[2]!.phases_ms as object), ['pool_acquire', 'schema_query', 'history_query']);
  assert.equal(logs[2]?.tls_verified_this_attempt, false);
  await probe.onModuleDestroy();
  closed = true;
  assert.equal(logs.length, 3);
  assert.equal(probe.pool.totalCount, 0);
  assert.equal(probe.pool.waitingCount, 0);
});

test('fixed workspace policy denies unknown roles/status and settings reject privilege-bearing fields', () => {
  assert.deepEqual(capabilitiesFor('owner', 'active'), capabilities);
  assert.deepEqual(capabilitiesFor('member', 'active'), ['profile.read.self', 'profile.update.self', 'team.read', 'workspace.read']);
  for (const role of ['admin', 'Owner', '', undefined, { role: 'owner' }]) {
    for (const capability of capabilities) assert.equal(permits(role, 'active', capability), false);
  }
  for (const capability of capabilities) assert.equal(permits('owner', 'disabled', capability), false);
  assert.equal(displayName('  Hà Nội  '), 'Hà Nội');
  assert.equal(displayName('𐐀'.repeat(100)), '𐐀'.repeat(100));
  for (const value of ['', '  ', 'a'.repeat(101), '\ud800', 'line\nbreak']) assert.throws(() => displayName(value), AppError);
  assert.throws(() => record({ displayName: 'Name', revision: 1, role: 'owner' }, ['displayName', 'revision']), AppError);
  for (const value of [0, -1, 1.1, '1', 2147483647]) assert.throws(() => revision(value), AppError);
});

test('real signature verification through synthetic JWKS rejects unsafe claims and current-user failure', async t => {
  const peer = await syntheticAuthPeer();
  t.after(() => peer.close());
  const userId = randomUUID(), sessionId = randomUUID();
  peer.users.set(userId, 'member@example.test');
  const verifier = new AuthVerifier(peer.config), signal = AbortSignal.timeout(10000);
  const token = await peer.token(userId, sessionId, { user_metadata: { role: 'owner' } });
  assert.deepEqual(await verifier.verify(token, signal), { userId, sessionId, email: 'member@example.test' });
  const denied = (error: unknown) => error instanceof AppError && error.code === 'unauthenticated';
  for (const claims of [
    { iss: 'https://attacker.example' }, { aud: 'another-project' }, { exp: 1 }, { exp: undefined },
    { sub: 'not-a-user' }, { session_id: 'not-a-session' }, { session_id: undefined },
    { role: 'service_role' }, { is_anonymous: true }, { is_anonymous: undefined },
  ]) await assert.rejects(verifier.verify(await peer.token(userId, sessionId, claims), signal), denied);
  for (const header of [{ kid: 'unknown-key' }, { jku: 'https://attacker.example/keys' }, { jwk: { kty: 'oct', k: 'AAAA' } }]) {
    await assert.rejects(verifier.verify(await peer.token(userId, sessionId, {}, header), signal), denied);
  }
  const symmetric = await new SignJWT({ sub: userId, session_id: sessionId, role: 'authenticated', is_anonymous: false })
    .setProtectedHeader({ alg: 'HS256', kid: peer.kid }).setIssuer(peer.config.authUrl).setAudience('authenticated')
    .setExpirationTime('5m').sign(new TextEncoder().encode('synthetic-only-secret-at-least-32-characters'));
  await assert.rejects(verifier.verify(symmetric, signal), denied);
  await assert.rejects(verifier.verify('unsigned.payload.', signal), denied);
  peer.state.userStatus = 401;
  await assert.rejects(verifier.verify(token, signal), denied);
  peer.state.userStatus = 503;
  await assert.rejects(verifier.verify(token, signal), (error: unknown) => error instanceof AppError && error.code === 'dependency_unavailable');
  peer.state.jwksStatus = 503;
  await assert.rejects(new AuthVerifier(peer.config).verify(token, signal),
    (error: unknown) => error instanceof AppError && error.code === 'dependency_unavailable');
});

test('invitation transport never falls through from unknown delivery into an extra email action', async t => {
  const peer = await syntheticAuthPeer();
  t.after(() => peer.close());
  const adapter = new AuthAdmin(peer.config), signal = AbortSignal.timeout(10000);
  peer.state.loseInviteAcknowledgement = true;
  assert.equal(await adapter.sendInvitation('member@example.test', randomUUID(), signal), 'unknown');
  assert.equal(peer.state.inviteCalls, 1);
  assert.equal(peer.state.otpCalls, 0);
  peer.state.loseInviteAcknowledgement = false;
  peer.state.inviteStatus = 422; peer.state.inviteCode = 'email_exists';
  assert.equal(await adapter.sendInvitation('existing@example.test', randomUUID(), signal), 'confirmed');
  assert.equal(peer.state.otpCalls, 1);
  peer.state.inviteStatus = 503;
  assert.equal(await adapter.sendInvitation('uncertain@example.test', randomUUID(), signal), 'unknown');
  assert.equal(peer.state.otpCalls, 1);
  const disabled = new AuthAdmin({ ...peer.config, emailEnabled: false, adminKey: undefined });
  await assert.rejects(disabled.sendInvitation('member@example.test', randomUUID(), signal),
    (error: unknown) => error instanceof AppError && error.code === 'delivery_unavailable');
  assert.equal(peer.state.inviteCalls, 3);
});

test('app-enabled local HTTP enforces both credential boundaries before DB and keeps responses uncached', async t => {
  const auth = await syntheticAuthPeer(), database = await silentPeer();
  t.after(() => auth.close()); t.after(() => database.close());
  const key = 'c'.repeat(64);
  const config = parseConfig({ DATABASE_URL: `postgresql://app_runtime:synthetic-only@127.0.0.1:${database.port}/fixture`,
    APP_FOUNDATION_ENABLED: 'true', APP_WORKSPACE_ID: auth.config.workspaceId, APP_AUTH_URL: auth.config.authUrl,
    APP_AUTH_API_KEY: 'synthetic-key', PREVIEW_ACCESS_KEY: key });
  const app = await createApplication(config);
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  for (const path of ['/health/live', '/v1/app/me', '/unknown']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: 'unauthorized' });
  }
  const noUser = await fetch(origin + '/v1/app/me', { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(noUser.status, 401);
  assert.match(noUser.headers.get('cache-control') ?? '', /no-store/);
  assert.equal((await noUser.json() as { code: string }).code, 'unauthenticated');
  const malformed = await fetch(origin + '/v1/app/me', { headers: { Authorization: `Bearer ${key}`, 'X-App-Access-Token': 'invalid' } });
  assert.equal(malformed.status, 401); await malformed.arrayBuffer();
  assert.equal(app.get(PostgresProbe).pool.totalCount, 0);
  assert.equal(database.sockets.size, 0);
  const live = await fetch(origin + '/health/live', { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(live.status, 200); await live.arrayBuffer();
  const userId = randomUUID(); auth.users.set(userId, 'member@example.test');
  const token = await auth.token(userId, randomUUID());
  const unavailable = await fetch(origin + '/v1/app/me', { headers: { Authorization: `Bearer ${key}`, 'X-App-Access-Token': token } });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json() as { code: string }).code, 'dependency_unavailable');
  assert.equal(app.get(PostgresProbe).pool.totalCount, 0);
});
