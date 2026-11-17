import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { parseEtsyConfig } from '../src/config/config.js';
import { EtsyCredentials, EtsyFailure } from '../src/etsy/credentials.js';
import { etsyId, EtsyProvider } from '../src/etsy/provider.js';
import { etsyFixture } from './etsy-fixture.js';
import { EtsyService } from '../src/etsy/service.js';
import { AppDatabase } from '../src/app-foundation/adapters/postgres.js';
import { AppError } from '../src/app-foundation/application/errors.js';
import { callbackInput } from '../src/etsy/ingress.js';

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
