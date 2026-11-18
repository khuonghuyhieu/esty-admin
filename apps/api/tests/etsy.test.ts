import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { parseEtsyConfig } from '../src/config/config.js';
import { EtsyCredentials, EtsyFailure } from '../src/etsy/credentials.js';
import { etsyId, EtsyProvider } from '../src/etsy/provider.js';
import { etsyFixture } from './etsy-fixture.js';
import { EtsyService } from '../src/etsy/service.js';
import { AppDatabase } from '../src/app-foundation/adapters/postgres.js';
import { AppError } from '../src/app-foundation/application/errors.js';
import { callbackInput } from '../src/etsy/ingress.js';
import { EtsyOwnerClient, loadEtsyOwnerApproval, ownerSettings } from '../scripts/etsy-owner.js';
import type { EtsyOwnerSettings } from '../scripts/etsy-owner.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from './helpers.js';
import { parseConfig } from '../src/config/config.js';
import { etsyReleasePhases, runEtsyReleasePhase } from '../scripts/etsy-release.js';
import type { EtsyReleasePacket, EtsyReleaseOperations } from '../scripts/etsy-release.js';
import { manifestDigest, migrationStatus, migrationsDirectory, runMigrations } from '../scripts/migrations.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { assembleArtifact, canonical, sha256 } from '../scripts/artifact.js';
import { activationRuntimeKeys } from '../src/config/activation-config.js';
import { artifactFixture } from './artifact-fixture.js';
import { readEvidence, writeReleaseEvidence } from '../scripts/release-journal.js';

const config = parseEtsyConfig({ ETSY_ENABLED: 'true', APP_FOUNDATION_ENABLED: 'true', ETSY_CLIENT_ID: 'synthetic_app',
  ETSY_SHARED_SECRET: randomBytes(24).toString('hex'), ETSY_CALLBACK_URL: 'https://api.lovora.us/integrations/etsy/callback',
  ETSY_RETURN_ORIGIN: 'https://website.example', ETSY_INVITATION_ORIGIN: 'https://invite.example',
  ETSY_INVITATION_TTL_SECONDS: '600', ETSY_RETENTION_SECONDS: '900', ETSY_TOKEN_ACTIVE_KEY_ID: 'test',
  ETSY_TOKEN_KEYRING: JSON.stringify({ test: randomBytes(32).toString('base64url') }) })!;
const signal = (): AbortSignal => AbortSignal.timeout(8000);
const tokenResponse = { access_token: '9223372036854775807.synthetic', refresh_token: 'synthetic-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'shops_r' };

test('callback envelope rejects ambiguous, oversized and secret-reflecting inputs', () => {
  const stateValue = 'a'.repeat(43);
  assert.deepEqual(callbackInput(`state=${stateValue}&code=code`), { state: stateValue, code: 'code' });
  assert.deepEqual(callbackInput(`state=${stateValue}&error=access_denied&error_uri=https%3A%2F%2Fevil.example`), { state: stateValue, code: null });
  for (const value of ['', `state=${stateValue}`, `state=${stateValue}&code=`, `state=${stateValue}&code=code&error=denied`,
    `state=${stateValue}&state=${stateValue}&code=code`, `state=${stateValue}&code=code&workspace=x`,
    `state=${stateValue}&code=has+space`, `state=${stateValue}&code=%ZZ`, `state=${stateValue}&error=${'x'.repeat(4096)}`]) {
    assert.throws(() => callbackInput(value), { code: 'invalid_request' });
  }
});

test('credential envelopes reject tampering, row/purpose substitution and missing keys', () => {
  const cipher = new EtsyCredentials(config);
  const envelope = cipher.seal('private-token', 'workspace/connection/1/credential');
  assert.equal(cipher.open(envelope, 'workspace/connection/1/credential'), 'private-token');
  assert.throws(() => cipher.open(envelope, 'workspace/connection/2/credential'), EtsyFailure);
  assert.throws(() => cipher.open(envelope, 'workspace/connection/1/verifier'), EtsyFailure);
  for (const changed of [{ ...envelope, keyId: 'missing' }, { ...envelope, tag: randomBytes(16).toString('base64url') },
    { ...envelope, nonce: randomBytes(12).toString('base64url') }, { ...envelope, ciphertext: '' }]) {
    assert.throws(() => cipher.open(changed, 'workspace/connection/1/credential'), EtsyFailure);
  }
});

test('selected protocol sends exact form/header boundaries and preserves full int64 identity', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const provider = new EtsyProvider(config, async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith('/oauth/token')) return Response.json(tokenResponse);
    if (url.endsWith('/users/me')) return new Response('{"user_id":9223372036854775807,"shop_id":9007199254740993}');
    return new Response('{"shop_id":9007199254740993,"user_id":9223372036854775807,"shop_name":"Synthetic Shop","currency_code":"USD","private_field":"discard"}');
  });
  const auth = provider.authorization();
  const url = new URL(auth.url);
  assert.equal(url.origin, 'https://www.etsy.com');
  assert.equal(url.searchParams.get('scope'), 'shops_r');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.has('code_verifier'), false);
  const tokens = await provider.exchange('synthetic-code', auth.verifier, signal());
  const data = await provider.metadata(tokens, '9007199254740993', null, signal());
  assert.deepEqual(data, { etsyUserId: '9223372036854775807', shopId: '9007199254740993', shopName: 'Synthetic Shop', currencyCode: 'USD' });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[0]!.init.body as string)), {
    grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: config.callbackUrl,
    code: 'synthetic-code', code_verifier: auth.verifier,
  });
  for (const request of requests) {
    assert.equal(new URL(request.url).origin, 'https://api.etsy.com');
    assert.equal(new URL(request.url).search, '');
    assert.equal(request.init.redirect, 'error');
    assert.equal(new Headers(request.init.headers).get('x-api-key'), `${config.clientId}:${config.sharedSecret}`);
  }
  assert.equal(new Headers(requests[1]!.init.headers).get('authorization'), `Bearer ${tokens.accessToken}`);
  await provider.refresh(tokens.refreshToken, signal());
  assert.equal(new URLSearchParams(requests[3]!.init.body as string).get('grant_type'), 'refresh_token');
});

test('malformed tokens, identities, scopes and oversized responses cannot authorize a connection', async () => {
  for (const response of [{ ...tokenResponse, scope: undefined }, { ...tokenResponse, scope: 'shops_r email_r' },
    { ...tokenResponse, refresh_token: '' }, { ...tokenResponse, token_type: 'bearer' }, { ...tokenResponse, expires_in: 3601 }]) {
    const provider = new EtsyProvider(config, async () => Response.json(response));
    await assert.rejects(provider.exchange('code', 'a'.repeat(43), signal()), EtsyFailure);
  }
  for (const id of [0, -1, 9007199254740992, '01', '9223372036854775808', '1e3']) assert.throws(() => etsyId(id));
  const oversized = new EtsyProvider(config, async () => new Response('x'.repeat(65537)));
  await assert.rejects(oversized.exchange('code', 'a'.repeat(43), signal()), { code: 'upstream_unavailable' });
  const wrong = new EtsyProvider(config, async () => Response.json({ user_id: 2, shop_id: 1 }));
  await assert.rejects(wrong.metadata({ accessToken: '2.token', refreshToken: 'refresh', tokenType: 'Bearer', scope: 'shops_r', expiresAt: Date.now() + 60000 }, '3', null, signal()), { code: 'reconnect_required' });
});

test('rate limits and body cancellation are bounded and never retried', async () => {
  for (const [header, expected] of [['9999999999', 86400], ['bad', 60], ['2', 2]] as const) {
    let calls = 0;
    const provider = new EtsyProvider(config, async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': header } }); });
    await assert.rejects(provider.exchange('code', 'a'.repeat(43), signal()), { code: 'upstream_rate_limited', retryAfterSeconds: expected });
    assert.equal(calls, 1);
  }
  let cancelled = false;
  const reading = Promise.withResolvers<void>();
  const provider = new EtsyProvider(config, async () => new Response(new ReadableStream({
    pull() { reading.resolve(); }, cancel() { cancelled = true; },
  })));
  const controller = new AbortController();
  const pending = provider.exchange('code', 'a'.repeat(43), controller.signal);
  await reading.promise;
  controller.abort();
  await assert.rejects(pending, { code: 'upstream_unavailable' });
  assert.equal(cancelled, true);
});

test('owned PostgreSQL and actual Nest HTTP enforce Etsy invitation, callback and lifecycle boundaries',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  const fixture = await etsyFixture(t, config);
  const { api, admin, state, calls } = fixture;
  const service = fixture.app.get(EtsyService);
  const db = fixture.app.get(AppDatabase);
  const originalTransaction = db.transaction.bind(db);
  let loseAck: ((sql: string) => boolean) | undefined;
  db.transaction = async (signalValue, work) => {
    let matched = false;
    const result = await originalTransaction(signalValue, async client => {
      const originalQuery = client.query.bind(client);
      client.query = new Proxy(client.query, {
        apply(target, _receiver, args: unknown[]) {
          if (typeof args[0] === 'string' && loseAck?.(args[0])) matched = true;
          return Reflect.apply(target, client, args);
        },
      });
      try { return await work(client); } finally { client.query = originalQuery; }
    });
    if (matched) { loseAck = undefined; throw new AppError('dependency_unavailable'); }
    return result;
  };
  async function current() {
    const result = await api('');
    assert.equal(result.status, 200);
    return result.body;
  }
  async function invite() {
    const status = await current();
    const result = await api('/invitations', 'owner', { expectedShopId: '8', expectedRevision: status.revision, idempotencyKey: randomUUID() });
    assert.equal(result.status, 200);
    assert.ok(typeof result.body.shareUrl === 'string');
    return { ...result.body, secret: new URL(result.body.shareUrl).hash.slice(1) };
  }
  async function start() {
    const offer = await invite();
    const response = await fixture.start(offer.secret);
    assert.equal(response.status, 303);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const authorization = new URL(response.headers.get('location')!);
    assert.equal(authorization.origin, 'https://www.etsy.com');
    return { ...offer, oauthState: authorization.searchParams.get('state')! };
  }
  async function connect() {
    const offer = await start();
    const response = await fixture.callback(offer.oauthState);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://website.example/');
    assert.equal((await current()).state, 'active');
    return offer;
  }
  async function disconnect() {
    const status = await current();
    assert.equal((await api('/disconnect', 'owner', { expectedRevision: status.revision, idempotencyKey: randomUUID() })).status, 200);
  }

  await t.test('Owner/Member/foreign scope, exact ingress and preview safety', async () => {
    assert.equal((await api('', 'member')).status, 403);
    assert.equal((await api('', 'foreign')).status, 403);
    assert.equal((await api('/invitations', 'member', { expectedShopId: '8', expectedRevision: 0, idempotencyKey: randomUUID() })).status, 403);
    for (const path of ['/integrations/etsy/invite', '/integrations/etsy/callback/', '/integrations/etsy/Callback?state=x',
      '/integrations/etsy/%63allback?state=x', '/integrations/etsy/invite/start/']) {
      const response = await fetch(fixture.origin + path, { headers: { Host: 'api.lovora.us' }, redirect: 'manual' });
      assert.equal(response.status, 401, path);
    }
    for (const method of ['HEAD', 'POST']) {
      assert.equal((await fetch(fixture.origin + '/integrations/etsy/callback?state=x', { method, headers: { Host: 'api.lovora.us' } })).status, 401);
    }
    const offer = await invite();
    const badOrigin = await fetch(fixture.origin + '/integrations/etsy/invite/start', { method: 'POST', headers: {
      Host: 'invite.example', Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: offer.secret }) });
    assert.equal(badOrigin.status, 400);
    assert.equal((await badOrigin.text()).includes(offer.secret), false);
    const emptyCallback = await fetch(fixture.origin + '/integrations/etsy/callback', { headers: { Host: 'api.lovora.us' } });
    assert.equal(emptyCallback.status, 400);
    const oversized = await fixture.start('x'.repeat(9000));
    assert.equal(oversized.status, 400);
    assert.equal((await api('/invitations?limit=101')).status, 400);
    assert.equal((await api(`/invitations?cursor=${randomUUID()}`)).status, 400);
    assert.equal(JSON.stringify((await api('/invitations')).body).includes(offer.secret), false);
    assert.equal((await admin.query("SELECT count(*)::integer AS count FROM app_private.etsy_authorization_attempts")).rows[0].count, 0);
    const starts = await Promise.all([fixture.start(offer.secret), fixture.start(offer.secret)]);
    assert.deepEqual(starts.map(response => response.status).sort(), [303, 400]);
    const consent = new URL(starts.find(response => response.status === 303)!.headers.get('location')!);
    const oauthState = consent.searchParams.get('state')!;
    const before = state.tokenCalls;
    const duplicate = await fetch(`${fixture.origin}/integrations/etsy/callback?state=${oauthState}&state=${oauthState}&code=code`, { headers: { Host: 'api.lovora.us' } });
    assert.equal(duplicate.status, 400);
    const callbacks = await Promise.all([fixture.callback(oauthState), fixture.callback(oauthState)]);
    assert.deepEqual(callbacks.map(response => response.status).sort(), [303, 400]);
    assert.equal(state.tokenCalls - before, 1);
    const count = calls.length;
    assert.equal((await current()).state, 'active');
    assert.equal((await api('/invitations')).status, 200);
    assert.equal(calls.length, count, 'Check status/list make zero provider requests');
    assert.equal((await api('?expectedRevision=1')).status, 400);
    const synced = await api('/read', 'owner', { expectedRevision: (await current()).revision });
    assert.equal(synced.status, 200);
    assert.deepEqual(Object.keys(synced.body).sort(), ['connectionId', 'currencyCode', 'etsyUserId', 'observedAt', 'revision', 'shopId', 'shopName']);
    assert.equal(synced.body.etsyUserId, '7');
    assert.equal(synced.body.shopId, '8');
    const ciphertext = await admin.query('SELECT envelope::text FROM app_private.etsy_credentials');
    assert.doesNotMatch(JSON.stringify(ciphertext.rows), /7\.synthetic|synthetic-refresh/);
  });

  await t.test('idempotent creation acknowledgement loss never reprints a link', async () => {
    await disconnect();
    const revision = (await current()).revision, idempotencyKey = randomUUID();
    loseAck = sql => sql.includes('INSERT INTO app_private.etsy_operation_receipts');
    const input = { expectedShopId: '8', expectedRevision: revision, idempotencyKey };
    const result = await api('/invitations', 'owner', input);
    assert.equal(result.status, 200);
    assert.equal(result.body.shareUrl, undefined);
    const replay = await api('/invitations', 'owner', input);
    assert.deepEqual(replay.body, result.body);
    assert.equal((await api(`/invitations/${result.body.invitationId}/cancel`, 'owner', {
      expectedRevision: result.body.revision, idempotencyKey: randomUUID() })).status, 200);
  });

  await t.test('candidate and activation lost acknowledgements reconcile exact receipts without exchanging twice', async () => {
    for (const match of ["SET state='verification_pending',candidate_version", "SET state='completed'"]) {
      const offer = await start(), before = state.tokenCalls;
      loseAck = sql => sql.includes(match);
      assert.equal((await fixture.callback(offer.oauthState)).status, 303);
      assert.equal((await current()).state, 'active');
      assert.equal(state.tokenCalls - before, 1);
      await disconnect();
    }
  });

  await t.test('metadata failure retains candidate for explicit verification without code replay', async () => {
    const offer = await start(), before = state.tokenCalls;
    state.handler = (request, response) => {
      if (request.url?.endsWith('/users/me')) { response.statusCode = 503; response.end('{}'); return true; }
      return false;
    };
    assert.equal((await fixture.callback(offer.oauthState)).status, 303);
    assert.equal((await current()).state, 'verification_pending');
    state.handler = undefined;
    const result = await api('/read', 'owner', { expectedRevision: (await current()).revision });
    assert.equal(result.status, 200);
    assert.equal((await current()).state, 'active');
    assert.equal(state.tokenCalls - before, 1);
  });

  await t.test('durable competing refresh and lost commit acknowledgement submit once and replace both tokens', async () => {
    await admin.query("UPDATE app_private.etsy_credentials SET expires_at=clock_timestamp()-interval '1 second'");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    state.handler = async (_request, response, body) => {
      if (body.get('grant_type') !== 'refresh_token') return false;
      entered.resolve(); await release.promise;
      response.end(JSON.stringify({ access_token: '7.rotated', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'shops_r' }));
      return true;
    };
    const revision = (await current()).revision, before = state.refreshCalls;
    loseAck = sql => sql.includes("SET state='committed',result_version");
    const first = api('/read', 'owner', { expectedRevision: revision });
    await Promise.race([entered.promise, first.then(() => { throw new Error('Refresh ended before provider submission.'); })]);
    const second = await api('/read', 'owner', { expectedRevision: revision }, fixture.secondOrigin);
    assert.equal(second.status, 409);
    release.resolve();
    assert.equal((await first).status, 200);
    assert.equal(state.refreshCalls - before, 1);
    assert.equal((await admin.query("SELECT count(*)::integer AS count FROM app_private.etsy_credentials WHERE state='active'")).rows[0].count, 1);
    state.handler = undefined;
  });

  await t.test('disconnect fences in-flight reads and removes every usable secret', async () => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    state.handler = async request => {
      if (request.url?.endsWith('/users/me')) { entered.resolve(); await release.promise; }
      return false;
    };
    const pending = api('/read', 'owner', { expectedRevision: (await current()).revision });
    await Promise.race([entered.promise, pending.then(() => { throw new Error('Read ended before provider observation.'); })]);
    await disconnect();
    release.resolve();
    assert.equal((await pending).status, 409);
    assert.equal((await current()).state, 'disconnected');
    assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_credentials')).rows[0].count, 0);
    state.handler = undefined;
  });

  await t.test('same-shop reconnect, creator demotion and wrong identity cannot silently relink', async () => {
    assert.equal((await api('/invitations', 'owner', { expectedShopId: '9', expectedRevision: (await current()).revision, idempotencyKey: randomUUID() })).status, 409);
    const offer = await start();
    // A second synthetic Owner permits demoting the creator without violating005's last-owner invariant.
    await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.member]);
    await admin.query("UPDATE app_private.memberships SET role_code='member',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
    const before = state.tokenCalls;
    assert.equal((await fixture.callback(offer.oauthState)).status, 400);
    assert.equal(state.tokenCalls, before);
    await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
    await disconnect();
    const wrong = await start();
    state.handler = (request, response) => {
      if (request.url?.endsWith('/users/me')) { response.end('{"user_id":9,"shop_id":8}'); return true; }
      return false;
    };
    assert.equal((await fixture.callback(wrong.oauthState)).status, 303);
    assert.equal((await current()).state, 'reconnect_required');
    state.handler = undefined;
  });

  await t.test('unknown refresh cannot replay after deadline; cooldown is durable and local status stays passive', async () => {
    await connect();
    await admin.query("UPDATE app_private.etsy_credentials SET expires_at=clock_timestamp()-interval '1 second'");
    state.handler = (_request, response, body) => {
      if (body.get('grant_type') === 'refresh_token') { response.statusCode = 429; response.setHeader('Retry-After', '3'); response.end('{}'); return true; }
      return false;
    };
    const before = state.refreshCalls;
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 429);
    assert.equal((await current()).state, 'refresh_unknown');
    await admin.query("UPDATE app_private.etsy_refresh_attempts SET deadline=clock_timestamp()-interval '1 second'");
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 429);
    assert.equal(state.refreshCalls - before, 1);
    assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_cooldowns WHERE retry_not_before>clock_timestamp()')).rows[0].count, 1);
    state.handler = undefined;
    await admin.query("UPDATE app_private.etsy_cooldowns SET retry_not_before=clock_timestamp()-interval '1 second'");
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 409);
  });

  await t.test('denial, expiry, cancellation, scope denial and credential corruption never activate', async () => {
    const denied = await start();
    const response = await fetch(`${fixture.origin}/integrations/etsy/callback?state=${denied.oauthState}&error=access_denied&error_description=private-synthetic`, {
      headers: { Host: 'api.lovora.us' }, redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://website.example/');
    assert.equal((await current()).state, 'reconnect_required');
    const expired = await start();
    await admin.query("UPDATE app_private.etsy_authorization_attempts SET created_at=created_at-interval '301 seconds',expires_at=expires_at-interval '301 seconds' WHERE state='pending'");
    assert.equal((await fixture.callback(expired.oauthState)).status, 400);
    await disconnect();
    const cancelled = await start();
    await disconnect();
    assert.equal((await fixture.callback(cancelled.oauthState)).status, 400);
    const missing = await start();
    state.handler = (request, response) => {
      if (request.url?.endsWith('/oauth/token')) { response.end('{"access_token":"7.synthetic","refresh_token":"synthetic-refresh","token_type":"Bearer","expires_in":3600}'); return true; }
      return false;
    };
    assert.equal((await fixture.callback(missing.oauthState)).status, 303);
    assert.notEqual((await current()).state, 'active');
    state.handler = undefined;
    await connect();
    await admin.query("UPDATE app_private.etsy_credentials SET envelope=jsonb_set(envelope,'{tag}','\"tampered\"')");
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 503);
    await disconnect();
  });

  await t.test('independent Nest workers serialize competing creates and fence a callback during exchange', async () => {
    const revision = (await current()).revision;
    const results = await Promise.all([api('/invitations', 'owner', { expectedShopId: '8', expectedRevision: revision, idempotencyKey: randomUUID() }),
      api('/invitations', 'owner', { expectedShopId: '8', expectedRevision: revision, idempotencyKey: randomUUID() }, fixture.secondOrigin)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    await disconnect();
    const offer = await start(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    state.handler = async request => {
      if (request.url?.endsWith('/oauth/token')) { entered.resolve(); await release.promise; }
      return false;
    };
    const callback = fixture.callback(offer.oauthState), before = state.tokenCalls;
    await Promise.race([entered.promise, callback.then(() => { throw new Error('Callback ended before exchange.'); })]);
    await disconnect();
    release.resolve();
    assert.equal((await callback).status, 400);
    assert.equal(state.tokenCalls - before, 1);
    assert.equal((await current()).state, 'disconnected');
    assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_credentials')).rows[0].count, 0);
    state.handler = undefined;
  });

  await t.test('refresh deadline and lost provider response never allow token resubmission', async () => {
    for (const fault of ['deadline', 'lost_response']) {
      await connect();
      await admin.query("UPDATE app_private.etsy_credentials SET expires_at=clock_timestamp()-interval '1 second'");
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      state.handler = async (_request, response, body) => {
        if (body.get('grant_type') !== 'refresh_token') return false;
        entered.resolve(); await release.promise;
        if (fault === 'lost_response') { response.destroy(); return true; }
        return false;
      };
      const before = state.refreshCalls;
      const pending = api('/read', 'owner', { expectedRevision: (await current()).revision });
      await Promise.race([entered.promise, pending.then(() => { throw new Error('Refresh ended before fault boundary.'); })]);
      if (fault === 'deadline') {
        await admin.query("UPDATE app_private.etsy_refresh_attempts SET deadline=clock_timestamp()-interval '1 second' WHERE state='submitted'");
        const beforeStatus = calls.length;
        const local = await current();
        assert.equal(local.state, 'refresh_unknown');
        assert.equal(local.attemptPhase, 'refresh_unknown');
        assert.equal(calls.length, beforeStatus);
        assert.equal((await admin.query('SELECT state FROM app_private.etsy_connections')).rows[0].state, 'active',
          'Check status classifies saved deadline without reconciliation writes');
      }
      release.resolve();
      assert.notEqual((await pending).status, 200);
      assert.equal((await current()).state, 'refresh_unknown');
      assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 409);
      assert.equal(state.refreshCalls - before, 1);
      state.handler = undefined;
      await disconnect();
    }
  });

  await t.test('invitation expiry and creator authority loss during exchange fence late tokens', async () => {
    for (const fault of ['expiry', 'demotion']) {
      const offer = await start(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      state.handler = async request => {
        if (request.url?.endsWith('/oauth/token')) { entered.resolve(); await release.promise; }
        return false;
      };
      const pending = fixture.callback(offer.oauthState);
      await Promise.race([entered.promise, pending.then(() => { throw new Error('Callback ended before fault boundary.'); })]);
      if (fault === 'expiry') await admin.query("UPDATE app_private.etsy_connection_invitations SET created_at=created_at-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE state='in_progress'");
      else await admin.query("UPDATE app_private.memberships SET role_code='member',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
      release.resolve();
      assert.equal((await pending).status, 400);
      if (fault === 'demotion') await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
      assert.notEqual((await current()).state, 'active');
      assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_credentials')).rows[0].count, 0);
      state.handler = undefined;
      await disconnect();
    }
  });

  await t.test('real TLS token timeout and real SQL lock failure stay bounded without provider replay', async () => {
    const offer = await start(), before = state.tokenCalls;
    state.handler = request => Boolean(request.url?.endsWith('/oauth/token'));
    // Exercise the actual transport's3s timer and socket cancellation, not a guessed sleep.
    const began = performance.now();
    assert.equal((await fixture.callback(offer.oauthState)).status, 303);
    assert.ok(performance.now() - began < 7000);
    assert.equal((await current()).state, 'refresh_unknown');
    assert.equal(state.tokenCalls - before, 1);
    state.handler = undefined;
    await disconnect();
    await admin.query('BEGIN; LOCK TABLE app_private.workspaces IN ACCESS EXCLUSIVE MODE');
    try {
      const callsBefore = calls.length, started = performance.now();
      const unavailable = await api('');
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.body.code, 'dependency_unavailable');
      assert.ok(performance.now() - started < 4000);
      assert.equal(calls.length, callsBefore);
    } finally { await admin.query('ROLLBACK'); }
  });


  await t.test('runtime direct managed data access and foreign-workspace service admission are denied', async () => {
    const foreignService = new EtsyService(randomUUID(), config, db, new EtsyProvider(config));
    await assert.rejects(foreignService.status(fixture.identity, signal()), { code: 'forbidden' });
    await assert.rejects(db.transaction(signal(), client => client.query('SELECT * FROM auth.sessions')), { code: 'dependency_unavailable' });
    assert.equal((await admin.query("SELECT has_table_privilege('public','app_private.etsy_credentials','SELECT') AS permitted")).rows[0].permitted, false);
    const audit = await admin.query("SELECT action,outcome FROM app_private.audit_events WHERE action LIKE 'etsy.%'");
    assert.ok(audit.rows.some(row => row.action === 'etsy.disconnect'));
    assert.doesNotMatch(JSON.stringify(audit.rows), /synthetic-refresh|7\.synthetic|code_verifier|shareUrl/);
  });
});

test('prune authority fails closed for operator and runtime despite known Owner identity',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 30000 }, async t => {
  const fixture = await etsyFixture(t, config);
  const { admin, api, workspace, owner, member, foreign } = fixture;
  const status = await api('');
  assert.equal(status.status, 200);
  const offer = await api('/invitations', 'owner', {
    expectedShopId: '8', expectedRevision: status.body.revision, idempotencyKey: randomUUID(),
  });
  assert.equal(offer.status, 200);
  await admin.query(`UPDATE app_private.etsy_connection_invitations SET state='cancelled',token_hash=NULL,
    created_at=created_at-interval '2 days',expires_at=expires_at-interval '2 days' WHERE id=$1`, [offer.body.invitationId]);
  assert.equal((await admin.query(`SELECT EXISTS(SELECT 1 FROM app_private.etsy_connection_invitations
    WHERE id=$1 AND state='cancelled' AND expires_at<clock_timestamp()-interval '900 seconds') AS eligible`,
  [offer.body.invitationId])).rows[0].eligible, true);
  const tables = ['etsy_connections', 'etsy_connection_invitations', 'etsy_authorization_attempts',
    'etsy_credentials', 'etsy_operation_receipts', 'etsy_refresh_attempts', 'audit_events'];
  const before: unknown[][] = [];
  for (const table of tables) {
    before.push((await admin.query(
      `SELECT to_jsonb(row_value) AS value FROM app_private.${table} row_value ORDER BY to_jsonb(row_value)::text`)).rows);
  }
  for (const role of ['public', 'app_runtime', 'app_operator']) {
    assert.equal((await admin.query(
      "SELECT has_function_privilege($1,'app_private.prune_etsy(uuid,uuid,uuid,integer,integer)','EXECUTE') AS permitted",
      [role])).rows[0].permitted, false, role);
  }
  const receipt = randomUUID();
  const attempts: Array<[string, string | null, string, number | null, number | null]> = [
    [workspace, owner, receipt, 900, 2],
    [workspace, owner, receipt, 900, 2], // Reusing a receipt cannot confer authority.
    [workspace, member, randomUUID(), 300, 1],
    [workspace, foreign, randomUUID(), 2592000, 100],
    [randomUUID(), owner, randomUUID(), 900, 2],
    [workspace, owner, randomUUID(), 0, 101],
    [workspace, null, randomUUID(), null, null],
  ];
  for (const role of ['app_operator', 'app_runtime']) {
    await admin.query(`SET ROLE ${role}`);
    try {
      for (const args of attempts) {
        await assert.rejects(admin.query('SELECT app_private.prune_etsy($1,$2,$3,$4,$5)', args), { code: '42501' });
      }
    } finally { await admin.query('RESET ROLE'); }
  }
  for (const [index, table] of tables.entries()) {
    const after = await admin.query(
      `SELECT to_jsonb(row_value) AS value FROM app_private.${table} row_value ORDER BY to_jsonb(row_value)::text`);
    assert.deepEqual(after.rows, before[index], table);
  }
  assert.equal((await admin.query("SELECT EXISTS(SELECT 1 FROM app_private.audit_events WHERE action='etsy.prune') AS spoofed")).rows[0].spoofed, false);
  assert.equal(fixture.calls.length, 0);
});

async function ownerApprovalFixture(t: TestContext, settings: EtsyOwnerSettings) {
  // Independently pinned synthetic approval, never a native/published artifact.
  const base = await artifactFixture(); t.after(base.dispose);
  const files = base.artifact.manifest.source.files.filter(file => !file.path.startsWith('apps/api/migrations/'));
  for (const entry of migrationManifest) {
    const path = `apps/api/migrations/${entry.name}.mjs`;
    const bytes = await readFile(new URL(`../../migrations/${entry.name}.mjs`, import.meta.url));
    await writeFile(join(base.operator, path), bytes);
    files.push({ path, size: bytes.length, mode: 0o644, sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
  }
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'owner-artifact'),
    config: base.config, source: { ...base.artifact.manifest.source, repository: 'https://github.com/khuonghuyhieu/esty-admin',
      files, digest: sha256(canonical(files)) }, migrations: [...migrationManifest], build: base.artifact.manifest.build });
  const packet: EtsyReleasePacket = { version: 1, runId: randomUUID(), ledgerRoot: base.root,
    revision: artifact.manifest.source.revision, tree: artifact.manifest.source.tree, sourceDigest: artifact.manifest.source.digest,
    artifactDigest: artifact.digest, runtimeDigest: 'e'.repeat(64), configBundleDigest: 'f'.repeat(64),
    migrationInputDigest: '1'.repeat(64), previousDigest: manifestDigest(migrationManifest.slice(0, 3)), targetDigest: manifestDigest(migrationManifest),
    target: 'supabase:abcdefghijklmnopqrst', driverDigest: '2'.repeat(64), nodeDigest: '3'.repeat(64), cliDigest: '4'.repeat(64), cliOwnFilesDigest: '5'.repeat(64),
    browserOrigin: 'https://app.lovora.us', runtimeKeys: [...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].sort(), metadataDigest: '6'.repeat(64),
    predecessor: { id: 'dpl_old', revision: '7'.repeat(40), tree: '8'.repeat(40), sourceDigest: '9'.repeat(64), artifactDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64) },
    window: { start: Date.now() - 1000, end: Date.now() + 600000 },
    grants: { exclusiveOwnerLease: 'synthetic-owner-only', automatedDelivery: 'disabled', maintenance: 'approved-readiness-interruption',
      recovery: 'approved-roll-forward-only', phases: [...etsyReleasePhases] } };
  const binding = { version: 1, packet, packetDigest: sha256(canonical(packet)), authUrl: settings.authUrl,
    authApiKeySha256: sha256(settings.authApiKey) };
  const path = join(base.root, 'owner-binding.json'); writeReleaseEvidence(path, binding);
  const digest = readEvidence(path).identity.sha256;
  return { artifact, path, digest, binding, approval: loadEtsyOwnerApproval(path, digest, artifact.root) };
}

test('Etsy setup Owner approval rejects credential redirection and stale provenance before password submission', async t => {
  const settings = { authUrl: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1', authApiKey: 'sb_publishable_fixture',
    technicalKey: 'a'.repeat(64), invitationOrigin: config.invitationOrigin, clientId: config.clientId };
  const fixture = await ownerApprovalFixture(t, settings);
  let transports = 0, passwordReads = 0;
  const transport: typeof fetch = async () => { transports++; throw new Error('password must never reach transport'); };
  const credentials = { get password() { passwordReads++; return 'owner-password-canary'; } };
  for (const malicious of [
    { ...settings, authUrl: 'https://zyxwvutsrqponmlkjihgf.supabase.co/auth/v1', authApiKey: 'sb_publishable_attacker' },
    { ...settings, authApiKey: 'sb_publishable_wrong_same_project' },
  ]) {
    assert.throws(() => ownerSettings(malicious, fixture.approval), { outcome: 'refused' });
    await assert.rejects(async () => {
      const client = new EtsyOwnerClient(malicious, fixture.approval, transport);
      await client.login('owner@example.invalid', credentials.password);
    }, error => {
      assert.ok(error instanceof Error && 'outcome' in error);
      assert.equal(error.outcome, 'refused');
      assert.doesNotMatch(error.message, /owner-password-canary|supabase\.co|sb_publishable_/);
      return true;
    });
  }
  assert.throws(() => new EtsyOwnerClient(settings, { approved: true }, transport), { outcome: 'refused' });
  assert.equal(passwordReads, 0); assert.equal(transports, 0);

  const original = await readFile(fixture.path);
  for (const change of [
    { revision: '0'.repeat(40) }, { tree: '0'.repeat(40) }, { sourceDigest: '0'.repeat(64) },
    { artifactDigest: '0'.repeat(64) }, { runtimeDigest: '0'.repeat(64) }, { configBundleDigest: '0'.repeat(64) },
  ]) {
    const packet = { ...fixture.binding.packet, ...change };
    await writeFile(fixture.path, JSON.stringify({ ...fixture.binding, packet, packetDigest: sha256(canonical(packet)) }));
    assert.throws(() => loadEtsyOwnerApproval(fixture.path, fixture.digest, fixture.artifact.root), { outcome: 'refused' });
    assert.throws(() => new EtsyOwnerClient(settings, fixture.approval, transport), { outcome: 'refused' });
  }
  for (const value of [
    { ...fixture.binding, unexpected: true },
    { ...fixture.binding, authUrl: 'https://zyxwvutsrqponmlkjihgf.supabase.co/auth/v1' },
    ...[
      { revision: '0'.repeat(40) }, { tree: '0'.repeat(40) }, { sourceDigest: '0'.repeat(64) }, { artifactDigest: '0'.repeat(64) },
      { window: { start: Date.now() - 2000, end: Date.now() - 1000 } },
    ].map(change => { const packet = { ...fixture.binding.packet, ...change }; return { ...fixture.binding, packet, packetDigest: sha256(canonical(packet)) }; }),
  ]) {
    await writeFile(fixture.path, JSON.stringify(value));
    // Even an independently pinned receipt must satisfy schema/expiry/artifact provenance.
    assert.throws(() => loadEtsyOwnerApproval(fixture.path, readEvidence(fixture.path).identity.sha256, fixture.artifact.root), { outcome: 'refused' });
  }
  await writeFile(fixture.path, original);
  const client = new EtsyOwnerClient(settings, fixture.approval, transport);
  t.mock.method(Date, 'now', () => fixture.binding.packet.window.end + 1);
  await assert.rejects(client.login('owner@example.invalid', 'owner-password-canary'), { outcome: 'refused' });
  assert.equal(passwordReads, 0); assert.equal(transports, 0);
});

test('Etsy setup Owner client completes explicit authenticated HTTP lifecycle and refuses stale authority',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  const nativeFetch = globalThis.fetch;
  const fixture = await etsyFixture(t, config);
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'esty-owner-client-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let signins = 0, logouts = 0;
  const peer = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      if (request.method === 'POST' && request.url === '/auth/v1/token?grant_type=password') {
        signins++;
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { email: string; password: string };
        assert.equal(request.headers.apikey, 'sb_publishable_fixture');
        if (body.password !== 'synthetic-password' || !['owner@example.invalid', 'member@example.invalid', 'foreign@example.invalid'].includes(body.email)) {
          response.writeHead(400, { 'Content-Type': 'application/json' }); response.end('{"error":"invalid_grant"}'); return;
        }
        const actor = body.email.split('@')[0] as 'owner' | 'member' | 'foreign';
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ access_token: fixture.tokens[actor], refresh_token: 'discarded-synthetic-refresh', token_type: 'bearer' }));
      } else if (request.method === 'POST' && request.url === '/auth/v1/logout?scope=local') {
        assert.equal(request.headers.authorization, `Bearer ${fixture.tokens.owner}`);
        logouts++; await fixture.admin.query('DELETE FROM auth.sessions WHERE id=$1', [fixture.sessions.owner]);
        response.writeHead(204); response.end();
      } else { response.writeHead(404); response.end(); }
    })().catch(() => response.destroy());
  });
  peer.listen(0, '127.0.0.1'); await once(peer, 'listening');
  t.after(async () => { const closed = once(peer, 'close'); peer.close(); peer.closeAllConnections(); await closed; });
  const address = peer.address(); assert.ok(address && typeof address !== 'string');
  const settings = { authUrl: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1', authApiKey: 'sb_publishable_fixture',
    technicalKey: fixture.technical, invitationOrigin: config.invitationOrigin, clientId: config.clientId };
  const { approval } = await ownerApprovalFixture(t, settings);
  let lostWrite = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.redirect, 'manual');
    if (url.origin === 'https://abcdefghijklmnopqrst.supabase.co') {
      return nativeFetch(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, init);
    }
    if (url.origin === 'https://api.lovora.us') {
      const response = await fetch(fixture.origin + url.pathname + url.search, init);
      if (lostWrite && init?.method === 'POST') { lostWrite = false; await response.body?.cancel(); throw new Error('synthetic lost acknowledgement'); }
      return response;
    }
    assert.equal(url.origin, config.invitationOrigin);
    assert.equal(url.pathname, '/integrations/etsy/invite/start');
    assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { 'content-type': 'application/json', origin: config.invitationOrigin });
    const body: unknown = JSON.parse(String(init?.body));
    assert.ok(body && typeof body === 'object' && 'secret' in body && typeof body.secret === 'string');
    return fixture.start(body.secret);
  };
  for (const actor of ['member', 'foreign']) {
    const denied = new EtsyOwnerClient(settings, approval, transport);
    await assert.rejects(denied.login(`${actor}@example.invalid`, 'synthetic-password'));
    await assert.rejects(denied.status());
  }
  const client = new EtsyOwnerClient(settings, approval, transport);
  await client.login('owner@example.invalid', 'synthetic-password');
  const count = fixture.calls.length;
  const initial = await client.status();
  await client.list(10);
  assert.equal(fixture.calls.length, count);
  const sharePath = join(directory, 'share.json');
  const receipt = await client.create({ expectedShopId: '8', expectedRevision: Number(initial.revision), idempotencyKey: randomUUID() }, sharePath, 'connect');
  assert.equal('shareUrl' in receipt, false);
  const share = JSON.parse(await readFile(sharePath, 'utf8')) as { shareUrl: string };
  const consentPath = join(directory, 'consent.json');
  await client.start(share.shareUrl, consentPath);
  const savedConsent: unknown = JSON.parse(await readFile(consentPath, 'utf8'));
  assert.ok(savedConsent && typeof savedConsent === 'object' && 'consentUrl' in savedConsent && typeof savedConsent.consentUrl === 'string');
  const consent = new URL(savedConsent.consentUrl);
  assert.equal((await fixture.callback(consent.searchParams.get('state')!)).status, 303);
  const connected = await client.status(); assert.equal(connected.state, 'active');
  const data = await client.read(Number(connected.revision));
  assert.equal(data.shopId, '8'); assert.equal(data.etsyUserId, '7');
  assert.equal(data.shopName, 'Synthetic Shop'); assert.equal(data.currencyCode, 'USD');
  const reconnect = await client.create({ expectedShopId: '8', expectedRevision: Number((await client.status()).revision),
    idempotencyKey: randomUUID() }, join(directory, 'reconnect.json'), 'reconnect');
  assert.equal((await fixture.admin.query('SELECT count(*)::integer AS n FROM app_private.etsy_credentials')).rows[0].n, 0);
  await client.cancel(String(reconnect.invitationId), { expectedRevision: Number(reconnect.revision), idempotencyKey: randomUUID() });
  await client.disconnect({ expectedRevision: Number((await client.status()).revision), idempotencyKey: randomUUID() });
  assert.equal((await client.status()).state, 'disconnected');
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='owner' WHERE user_id=$1", [fixture.member]);
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='member' WHERE user_id=$1", [fixture.owner]);
  await assert.rejects(client.status());
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='owner' WHERE user_id=$1", [fixture.owner]);
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='member' WHERE user_id=$1", [fixture.member]);
  const lost = new EtsyOwnerClient(settings, approval, transport); await lost.login('owner@example.invalid', 'synthetic-password');
  lostWrite = true;
  await assert.rejects(lost.create({ expectedShopId: '8', expectedRevision: Number((await lost.status()).revision), idempotencyKey: randomUUID() },
    join(directory, 'lost.json'), 'reconnect'), { outcome: 'unknown' });
  const before = fixture.calls.length;
  await assert.rejects(lost.status()); assert.equal(fixture.calls.length, before);
  assert.equal(await client.logout(), 'confirmed'); assert.equal(logouts, 1);
  const revoked = new EtsyOwnerClient(settings, approval, transport);
  await assert.rejects(revoked.login('owner@example.invalid', 'synthetic-password'));
  await assert.rejects(revoked.status());
  assert.equal(signins, 5);
});

test('Etsy setup exact three-to-four migration switches actual old and target strict HTTP readiness',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  const nativeFetch = globalThis.fetch;
  const fixture = await etsyFixture(t, config);
  await t.test('owned strict history cutover', async t => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'esty-setup-sql-'));
  const databaseName = `setup_${randomBytes(12).toString('hex')}`;
  await fixture.admin.query(`CREATE DATABASE "${databaseName}"`);
  const database = { ...fixture.database, database: databaseName }, beforeDirectory = join(directory, 'before');
  await mkdir(beforeDirectory);
  for (const entry of migrationManifest.slice(0, 3)) await cp(join(migrationsDirectory, `${entry.name}.mjs`), join(beforeDirectory, `${entry.name}.mjs`));
  const initial = await runMigrations(database, { directory: beforeDirectory });
  assert.equal(initial.result, 'success');
  assert.deepEqual(initial.after, migrationManifest.slice(0, 3).map(entry => entry.name));
  const baseConfig = parseConfig({ DATABASE_URL: `postgresql://postgres:${database.password}@127.0.0.1:${database.port}/${databaseName}` });
  const old = await createApplication(baseConfig, migrationManifest.slice(0, 3).map(entry => entry.name));
  const target = await createApplication(baseConfig, migrationManifest.map(entry => entry.name));
  await old.listen(0, '127.0.0.1'); await target.listen(0, '127.0.0.1');
  const oldOrigin = await old.getUrl(), targetOrigin = await target.getUrl();
  t.after(async () => { await old.close(); await target.close(); await fixture.admin.query(`DROP DATABASE "${databaseName}"`); await rm(directory, { recursive: true, force: true }); });
  const packet: EtsyReleasePacket = { version: 1, runId: randomUUID(), ledgerRoot: directory,
    revision: 'a'.repeat(40), tree: 'b'.repeat(40), sourceDigest: 'c'.repeat(64), artifactDigest: 'd'.repeat(64),
    runtimeDigest: 'e'.repeat(64), configBundleDigest: 'f'.repeat(64), migrationInputDigest: '1'.repeat(64),
    previousDigest: manifestDigest(migrationManifest.slice(0, 3)), targetDigest: manifestDigest(migrationManifest),
    target: 'local', driverDigest: '2'.repeat(64), nodeDigest: '3'.repeat(64), cliDigest: '4'.repeat(64), cliOwnFilesDigest: '5'.repeat(64),
    metadataDigest: '6'.repeat(64), browserOrigin: 'https://app.lovora.us', runtimeKeys: [...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].sort(),
    predecessor: { id: 'dpl_old', revision: '7'.repeat(40), tree: '8'.repeat(40), sourceDigest: '9'.repeat(64), artifactDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64) },
    window: { start: Date.now() - 1000, end: Date.now() + 600000 },
    grants: { exclusiveOwnerLease: 'owned-local-fixture', automatedDelivery: 'disabled', maintenance: 'approved-readiness-interruption',
      recovery: 'approved-roll-forward-only', phases: [...etsyReleasePhases] } };
  const observed: Array<{ origin: string; status: number; body: unknown }> = [];
  async function readiness(origin: string, pending: boolean) {
    const response = await nativeFetch(origin + '/health/ready', { signal: AbortSignal.timeout(5000) });
    const body: unknown = await response.json(); observed.push({ origin, status: response.status, body });
    assert.equal(response.status, pending ? 503 : 200);
    assert.deepEqual(body, pending ? { status: 'degraded', reason: 'migrations_pending' } : { status: 'ready', database: 'up', migrations: 'current' });
  }
  let creates = 0, promotes = 0, alias = 'dpl_old';
  const operations: EtsyReleaseOperations = {
    verify() { assert.equal(manifestDigest(migrationManifest), packet.targetDigest); },
    async currentMain() { return { revision: packet.revision, tree: packet.tree }; },
    async history() { const status = await migrationStatus(database); assert.equal(status.ordered, true); assert.deepEqual(status.unexpected, []); return status.applied; },
    async predecessor(pending) { assert.equal(alias, 'dpl_old'); await readiness(oldOrigin, pending); },
    async create() { creates++; return { code: 0, aborted: false, stdout: '{"deployment":{"id":"dpl_target"}}' }; },
    async candidate(id, pending) { assert.equal(id, 'dpl_target'); await readiness(targetOrigin, pending); },
    migrate: () => runMigrations(database, { sourceRevision: packet.revision, target: 'local', expectedBefore: migrationManifest.slice(0, 3).map(entry => entry.name) }),
    async promote(id) { assert.equal(id, 'dpl_target'); promotes++; alias = id; return { code: 0, aborted: false, stdout: '' }; },
    async alias(id) { assert.equal(alias, id); },
  };
  const packetDigest = sha256(canonical(packet));
  for (const phase of etsyReleasePhases) await runEtsyReleasePhase({ packet, packetDigest, phase, operations, signal: AbortSignal.timeout(30000) });
  assert.equal(creates, 1); assert.equal(promotes, 1);
  assert.ok(observed.some(row => row.origin === oldOrigin && row.status === 200));
  assert.ok(observed.some(row => row.origin === oldOrigin && row.status === 503));
  assert.ok(observed.some(row => row.origin === targetOrigin && row.status === 503));
  assert.ok(observed.some(row => row.origin === targetOrigin && row.status === 200));
  const after = await migrationStatus(database);
  assert.deepEqual(after.applied, migrationManifest.map(entry => entry.name)); assert.deepEqual(after.pending, []);
  });
});
