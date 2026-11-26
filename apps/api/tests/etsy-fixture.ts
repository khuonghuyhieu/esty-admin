import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpsRequest } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { TestContext } from 'node:test';
import { Client, type Pool } from 'pg';
import { parseConfig } from '../src/config/config.js';
import type { EtsyConfig } from '../src/config/config.js';
import { migrate } from '../scripts/migrations.js';
import { expectedMigrations } from '../src/generated/migrations.js';
import { createApplication } from './helpers.js';
import { syntheticAuthPeer } from './app-auth-fixture.js';
import { setTimeout as delay } from 'node:timers/promises';

// Test-only011 extension of the owned006 Auth lifecycle. Etsy is simulated;
// Auth, application HTTP, current membership and persistence remain real.
export function etsyRecipientFixture(config: EtsyConfig, admin: Pool, workspace: string, authOrigin: string,
  ownerId: () => string | undefined, guard: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const apiOrigin = new URL(config.callbackUrl).origin;
  const codes = new Map<string, string>();
  const provider = { lookup: 0, token: 0, refresh: 0, getMe: 0, getShop: 0, callback: 0, activeLookup: 0 };
  let mode: 'exact' | 'ambiguous' | 'incomplete' | 'delay' | '429' = 'exact', delayMs = 2500;
  const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.origin !== 'https://api.etsy.com') {
      assert.ok([apiOrigin, authOrigin].includes(url.origin), 'Unintended fixture outbound HTTP refused.');
      assert.equal(new Headers(init?.headers).has('host'), false, 'Actual011 traffic must use native Host.');
      return originalFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-api-key'), `${config.clientId}:${config.sharedSecret}`);
    if (url.pathname === '/v3/application/shops') {
      provider.lookup++;
      const scenario = mode;
      assert.equal(headers.has('authorization'), false);
      if (scenario === '429') return json({}, 429, { 'Retry-After': '2' });
      if (scenario === 'delay') {
        provider.activeLookup++;
        try { await delay(delayMs, undefined, { signal: init?.signal ?? undefined }); }
        finally { provider.activeLookup--; }
      }
      const rows = [{ shop_id: 8, shop_name: 'SyntheticShop' }];
      if (scenario === 'ambiguous') rows.push({ shop_id: 9, shop_name: 'syntheticshop' });
      return json({ count: scenario === 'incomplete' ? 25 : rows.length,
        results: url.searchParams.get('offset') === '0' ? rows : [] });
    }
    if (url.pathname === '/v3/public/oauth/token') {
      provider.token++;
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('client_id'), config.clientId);
      if (body.get('grant_type') === 'refresh_token') {
        provider.refresh++;
        assert.equal(body.get('refresh_token'), 'synthetic011-refresh');
      } else {
        assert.equal(body.get('grant_type'), 'authorization_code');
        assert.equal(body.get('redirect_uri'), config.callbackUrl);
        const challenge = codes.get(body.get('code') ?? '');
        assert.ok(challenge);
        codes.delete(body.get('code')!);
        assert.equal(createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url'), challenge);
      }
      return json({ access_token: '7.synthetic011', refresh_token: 'synthetic011-refresh',
        token_type: 'Bearer', expires_in: 3600, scope: 'shops_r' });
    }
    assert.equal(headers.get('authorization'), 'Bearer 7.synthetic011');
    if (url.pathname === '/v3/application/users/me') { provider.getMe++; return json({ user_id: 7, shop_id: 8 }); }
    if (url.pathname === '/v3/application/shops/8') {
      provider.getShop++;
      return json({ user_id: 7, shop_id: 8, shop_name: 'SyntheticShop', currency_code: 'USD' });
    }
    throw new Error('Unapproved synthetic Etsy endpoint.');
  };
  async function membership(allowed: boolean) {
    const id = ownerId();
    assert.ok(id);
    const result = await admin.query(`UPDATE app_private.memberships SET role_code=$3,status='active',
      disabled_at=NULL,revision=revision+1 WHERE workspace_id=$1 AND user_id=$2 RETURNING role_code AS role,status,revision`,
    [workspace, id, allowed ? 'owner' : 'member']);
    assert.equal(result.rowCount, 1);
    return result.rows[0] as { role: string; status: string; revision: number };
  }
  async function reset() {
    await guard();
    assert.equal(provider.activeLookup, 0, 'Finish the active lookup before reset.');
    const client = await admin.connect();
    try {
      await client.query("BEGIN; SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='1000ms'");
      for (const table of ['etsy_operation_receipts', 'etsy_refresh_attempts', 'etsy_credentials',
        'etsy_authorization_attempts', 'etsy_connection_invitations', 'etsy_connections']) {
        await client.query(`DELETE FROM app_private.${table} WHERE workspace_id=$1`, [workspace]);
      }
      await client.query("DELETE FROM app_private.audit_events WHERE workspace_id=$1 AND action LIKE 'etsy.%'", [workspace]);
      await client.query('DELETE FROM app_private.etsy_cooldowns WHERE app_ref=$1', [config.clientId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    if (ownerId()) await membership(true);
    for (const key of Object.keys(provider) as Array<keyof typeof provider>) provider[key] = 0;
    mode = 'exact'; delayMs = 2500; codes.clear();
    return { reset: true };
  }
  async function counts() {
    const sql: Record<string, number> = {};
    for (const [field, table] of [['connections', 'etsy_connections'], ['invitations', 'etsy_connection_invitations'],
      ['attempts', 'etsy_authorization_attempts'], ['credentials', 'etsy_credentials'], ['receipts', 'etsy_operation_receipts']]) {
      sql[field!] = Number((await admin.query(`SELECT count(*) FROM app_private.${table} WHERE workspace_id=$1`, [workspace])).rows[0].count);
    }
    sql.cooldowns = Number((await admin.query('SELECT count(*) FROM app_private.etsy_cooldowns WHERE app_ref=$1', [config.clientId])).rows[0].count);
    sql.activeCredentials = Number((await admin.query("SELECT count(*) FROM app_private.etsy_credentials WHERE workspace_id=$1 AND state='active'", [workspace])).rows[0].count);
    sql.plaintextCredentials = Number((await admin.query(`SELECT count(*) FROM app_private.etsy_credentials
      WHERE workspace_id=$1 AND (envelope::text LIKE '%7.synthetic011%' OR envelope::text LIKE '%synthetic011-refresh%')`, [workspace])).rows[0].count);
    sql.authUsers = Number((await admin.query('SELECT count(*) FROM auth.users')).rows[0].count);
    sql.authSessions = Number((await admin.query('SELECT count(*) FROM auth.sessions')).rows[0].count);
    const owner = (await admin.query('SELECT role_code AS role,status,revision FROM app_private.memberships WHERE workspace_id=$1 AND user_id=$2',
      [workspace, ownerId()])).rows[0] as { role: string; status: string; revision: number };
    const connection = (await admin.query('SELECT state FROM app_private.etsy_connections WHERE workspace_id=$1', [workspace])).rows[0] as { state: string } | undefined;
    return { provider: { ...provider }, sql, owner, connectionState: connection?.state ?? null };
  }
  async function control(input: Record<string, unknown>) {
    await guard();
    const fields: Record<string, string[]> = { 'etsy-reset': [], 'etsy-counts': [], 'etsy-membership': ['allowed'],
      'etsy-lookup': ['mode', 'delayMs'], 'etsy-complete': ['state', 'codeChallenge'] };
    assert.ok(typeof input.operation === 'string' && Object.hasOwn(fields, input.operation));
    assert.ok(Object.keys(input).every(key => ['nonce', 'operation', ...fields[input.operation as string]!].includes(key)));
    if (input.operation === 'etsy-reset') return reset();
    if (input.operation === 'etsy-counts') return counts();
    if (input.operation === 'etsy-membership') {
      assert.equal(typeof input.allowed, 'boolean');
      return membership(input.allowed as boolean);
    }
    if (input.operation === 'etsy-lookup') {
      assert.ok(typeof input.mode === 'string' && ['exact', 'ambiguous', 'incomplete', 'delay', '429'].includes(input.mode));
      assert.ok(input.delayMs === undefined || (input.mode === 'delay' && Number.isInteger(input.delayMs)
        && Number(input.delayMs) >= 1 && Number(input.delayMs) <= 5000));
      mode = input.mode as typeof mode; delayMs = input.delayMs === undefined ? 2500 : Number(input.delayMs);
      return { mode, delayMs: mode === 'delay' ? delayMs : null };
    }
    assert.equal(typeof input.state, 'string'); assert.equal(typeof input.codeChallenge, 'string');
    assert.match(input.state as string, /^[A-Za-z0-9_-]{43}$/);
    assert.match(input.codeChallenge as string, /^[A-Za-z0-9_-]{43}$/);
    const code = randomBytes(24).toString('base64url');
    codes.set(code, input.codeChallenge as string);
    provider.callback++;
    try {
      const response = await fetch(`${config.callbackUrl}?${new URLSearchParams({ state: input.state as string, code, iss: 'https://openapi.etsy.com' })}`, {
        redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Connection: 'close' } });
      await response.body?.cancel();
      return { status: response.status, location: response.headers.get('location') };
    } finally { codes.delete(code); }
  }
  return { control, reset, async close() { try { await reset(); } finally { globalThis.fetch = originalFetch; } } };
}

export interface OwnedEtsyFixture { name: string; id: string; port: number; password: string }
export async function readOwnedEtsyFixture(): Promise<OwnedEtsyFixture> {
  const directory = process.env.ETSY_TEST_FIXTURE_DIRECTORY ?? '';
  assert.ok(directory.startsWith(join(await realpath(tmpdir()), 'esty-etsy-local-')));
  assert.equal(await realpath(directory), directory);
  const marker = join(directory, 'fixture.json'), directoryStat = await lstat(directory), markerStat = await lstat(marker);
  assert.ok(directoryStat.isDirectory() && directoryStat.uid === process.getuid?.() && (directoryStat.mode & 0o777) === 0o700);
  assert.ok(markerStat.isFile() && markerStat.uid === process.getuid?.() && (markerStat.mode & 0o777) === 0o600);
  const owned = JSON.parse(await readFile(marker, 'utf8')) as OwnedEtsyFixture;
  assert.match(owned.name, /^esty-etsy-[a-f0-9]{16}$/);
  assert.match(owned.id, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(owned.port) && owned.port > 1024 && ![54322, 55432, 55433, 55440, 55441, 55442, 55443, 55444,
    55532, 55540, 55541, 55542, 55543, 55544, 55644].includes(owned.port));
  assert.equal(execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "esty.etsy.owner"}}', owned.id],
    { encoding: 'utf8' }).trim(), owned.name);
  assert.equal(execFileSync('docker', ['port', owned.id, '5432/tcp'], { encoding: 'utf8' }).trim(), `127.0.0.1:${owned.port}`);
  return owned;
}

export async function strictDatabaseFixture(t: TestContext) {
  assert.ok(process.env.DOCKER_HOST?.startsWith('unix://'), 'Strict fixture requires an explicit local Unix Docker endpoint');
  assert.ok(process.env.DOCKER_CONFIG, 'Strict fixture requires its isolated empty Docker config');
  const dockerConfig = await lstat(process.env.DOCKER_CONFIG);
  assert.ok(dockerConfig.isDirectory() && dockerConfig.uid === process.getuid?.() && (dockerConfig.mode & 0o777) === 0o700);
  assert.deepEqual(await readdir(process.env.DOCKER_CONFIG), []);
  const owned = await readOwnedEtsyFixture();
  const base = { host: '127.0.0.1', port: owned.port, user: 'postgres', password: owned.password,
    database: 'etsy_fixture', connectionTimeoutMillis: 1000 };
  const control = new Client(base); await control.connect();
  const name = `l3_${randomBytes(12).toString('hex')}`;
  await control.query(`CREATE DATABASE "${name}"`);
  const database = { ...base, database: name }, client = new Client(database); await client.connect();
  t.after(async () => {
    await client.end();
    try { await control.query(`DROP DATABASE "${name}"`); } finally { await control.end(); }
  });
  return { database, client, name, owned };
}

export async function etsyFixture(t: TestContext, etsyConfig: EtsyConfig) {
  const owned = await readOwnedEtsyFixture();
  const base = { host: '127.0.0.1', port: owned.port, user: 'postgres', password: owned.password, database: 'etsy_fixture', connectionTimeoutMillis: 1000 };
  const control = new Client(base);
  await control.connect();
  const name = `etsy_${randomBytes(16).toString('hex')}`, password = randomBytes(24).toString('hex');
  // The freshly owned container is the only role authority. Collisions reject; no adoption.
  await control.query(`CREATE ROLE app_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await control.query(`CREATE ROLE app_operator LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await control.query(`CREATE DATABASE "${name}"`);
  const database = { ...base, database: name }, admin = new Client(database);
  await admin.connect();
  let closeApp: (() => Promise<void>) | undefined;
  let closePeer: (() => Promise<void>) | undefined;
  let closeTls: (() => Promise<void>) | undefined;
  const originalFetch = globalThis.fetch;
  const tlsDirectory = await mkdtemp(join(tmpdir(), 'esty-etsy-tls-'));
  t.after(async () => {
    globalThis.fetch = originalFetch;
    try { await closeApp?.(); } finally {
      try { await closePeer?.(); } finally {
        try { await closeTls?.(); } finally {
          await admin.end();
          await control.query(`DROP DATABASE "${name}"`);
          await control.query('DROP ROLE app_runtime; DROP ROLE app_operator');
          await control.end();
          await rm(tlsDirectory, { recursive: true });
        }
      }
    }
  });
  assert.equal(await migrate(database), expectedMigrations.length);
  assert.equal(await migrate(database), 0);
  await admin.query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz)');
  const peer = await syntheticAuthPeer();
  closePeer = () => peer.close();
  const workspace = peer.config.workspaceId, owner = randomUUID(), member = randomUUID(), foreign = randomUUID();
  const sessions = { owner: randomUUID(), member: randomUUID(), foreign: randomUUID() };
  await admin.query('BEGIN');
  await admin.query("INSERT INTO app_private.profiles(user_id,display_name) VALUES($1,'Owner'),($2,'Member'),($3,'Foreign')", [owner, member, foreign]);
  await admin.query("INSERT INTO app_private.workspaces(id,bootstrap_request_id,bootstrap_fingerprint,display_name) VALUES($1,$2,$3,'Synthetic Etsy Workspace')", [workspace, randomUUID(), 'a'.repeat(64)]);
  await admin.query("INSERT INTO app_private.memberships(workspace_id,user_id,role_code,status) VALUES($1,$2,'owner','active'),($1,$3,'member','active')", [workspace, owner, member]);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4),($5,$6)', [sessions.owner, owner, sessions.member, member, sessions.foreign, foreign]);
  await admin.query('COMMIT');
  for (const [id, email] of [[owner, 'owner@example.invalid'], [member, 'member@example.invalid'], [foreign, 'foreign@example.invalid']]) peer.users.set(id!, email!);
  const tokens = { owner: await peer.token(owner, sessions.owner), member: await peer.token(member, sessions.member), foreign: await peer.token(foreign, sessions.foreign) };
  await writeFile(join(tlsDirectory, 'certificate.cnf'), '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\nCN=etsy.test\n[extensions]\nsubjectAltName=DNS:etsy.test\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', 'key.pem', '-out', 'cert.pem', '-config', 'certificate.cnf'], { cwd: tlsDirectory, stdio: 'ignore', timeout: 10000 });
  const ca = await readFile(join(tlsDirectory, 'cert.pem'));
  const calls: string[] = [];
  const state: { handler?: (request: IncomingMessage, response: ServerResponse, body: URLSearchParams) => Promise<boolean> | boolean; tokenCalls: number; refreshCalls: number } = { tokenCalls: 0, refreshCalls: 0 };
  const tls = createServer({ cert: ca, key: await readFile(join(tlsDirectory, 'key.pem')) }, (request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      calls.push(request.url ?? '');
      assert.equal(request.headers['x-api-key'], `${etsyConfig.clientId}:${etsyConfig.sharedSecret}`);
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/v3/public/oauth/token') {
        state.tokenCalls++;
        if (body.get('grant_type') === 'refresh_token') state.refreshCalls++;
      } else if (request.url?.startsWith('/v3/application/shops?')) assert.equal(request.headers.authorization, undefined);
      else assert.match(request.headers.authorization ?? '', /^Bearer 7\./);
      if (state.handler && await state.handler(request, response, body)) return;
      if (request.url === '/v3/public/oauth/token') response.end(JSON.stringify({ access_token: '7.synthetic', refresh_token: 'synthetic-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'shops_r' }));
      else if (request.url === '/v3/application/users/me') response.end('{"user_id":7,"shop_id":8}');
      else if (request.url === '/v3/application/shops/8') response.end('{"user_id":7,"shop_id":8,"shop_name":"Synthetic Shop","currency_code":"USD"}');
      else { response.statusCode = 404; response.end('{}'); }
    })().catch(() => { response.destroy(); });
  });
  tls.listen(0, '127.0.0.1');
  await once(tls, 'listening');
  const address = tls.address();
  assert.ok(address && typeof address !== 'string');
  closeTls = async () => { const closed = once(tls, 'close'); tls.close(); tls.closeAllConnections(); await closed; };
  const allowed = new Set([peer.config.authUrl]);
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.origin === 'https://api.etsy.com') {
      return new Promise<Response>((resolve, reject) => {
        const headers = Object.fromEntries(new Headers(init?.headers));
        const request = httpsRequest({ hostname: '127.0.0.1', port: address.port, servername: 'etsy.test', ca, rejectUnauthorized: true,
          path: url.pathname + url.search, method: init?.method ?? 'GET', headers, signal: init?.signal ?? undefined }, response => {
          resolve(new Response(Readable.toWeb(response), { status: response.statusCode!, headers: response.headers as Record<string, string> }));
        });
        request.on('error', reject);
        request.end(init?.body as string | undefined);
      });
    }
    assert.ok(allowed.has(url.origin), 'Unintended outbound application HTTP denied.');
    // Node fetch does not preserve a caller-supplied Host. Raw loopback HTTP tests
    // the real exact-host ingress rather than weakening the application guard.
    if (new Headers(init?.headers).has('host')) {
      return new Promise<Response>((resolve, reject) => {
        const request = httpRequest(url, { method: init?.method ?? 'GET',
          headers: Object.fromEntries(new Headers(init?.headers)), signal: init?.signal ?? undefined }, response => {
          const chunks: Buffer[] = [];
          response.on('data', chunk => chunks.push(Buffer.from(chunk)));
          response.on('error', reject);
          response.on('end', () => resolve(new Response(init?.method === 'HEAD' ? null : Buffer.concat(chunks),
            { status: response.statusCode!, headers: response.headers as Record<string, string> })));
        });
        request.on('error', reject);
        request.end(init?.body as string | undefined);
      });
    }
    return originalFetch(input, init);
  };
  const technical = randomBytes(32).toString('hex');
  const config = parseConfig({ DATABASE_URL: `postgresql://app_runtime:${password}@127.0.0.1:${owned.port}/${name}`, APP_FOUNDATION_ENABLED: 'true',
    APP_WORKSPACE_ID: workspace, APP_AUTH_URL: peer.config.authUrl, APP_AUTH_API_KEY: 'synthetic-api-key', PREVIEW_ACCESS_KEY: technical });
  config.etsy = etsyConfig;
  const app = await createApplication(config);
  closeApp = () => app.close();
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  allowed.add(origin);
  const secondApp = await createApplication(config);
  closeApp = async () => { try { await app.close(); } finally { await secondApp.close(); } };
  await secondApp.listen(0, '127.0.0.1');
  const secondOrigin = await secondApp.getUrl();
  allowed.add(secondOrigin);
  async function api(path: string, actor: keyof typeof tokens = 'owner', body?: object, target = origin) {
    const response = await fetch(target + '/v1/app/integrations/etsy' + path, { method: body ? 'POST' : 'GET', redirect: 'manual',
      signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${technical}`, 'X-App-Access-Token': tokens[actor], ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const bodyValue: unknown = await response.json();
    assert.ok(bodyValue && typeof bodyValue === 'object' && !Array.isArray(bodyValue));
    return { status: response.status, body: bodyValue as Record<string, unknown>, headers: response.headers };
  }
  return { admin, app, origin, secondOrigin, api, owner, member, foreign, workspace, sessions, tokens, technical, state, calls, database,
    identity: { userId: owner, sessionId: sessions.owner, email: 'owner@example.invalid' },
    async start(secret: string) {
      return fetch(origin + '/integrations/etsy/invite/start', { method: 'POST', redirect: 'manual', headers: {
        Host: new URL(etsyConfig.callbackUrl).host, Authorization: `Bearer ${technical}`,
        Origin: etsyConfig.invitationOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) });
    },
    async callback(stateValue: string, code = 'synthetic-code') {
      return fetch(`${origin}/integrations/etsy/callback?${new URLSearchParams({ state: stateValue, code, iss: 'https://openapi.etsy.com' })}`, { redirect: 'manual', headers: { Host: 'api.lovora.us' } });
    },
  };
}
