import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpsRequest } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { Client } from 'pg';
import { parseConfig } from '../src/config/config.js';
import type { EtsyConfig } from '../src/config/config.js';
import { migrate } from '../scripts/migrations.js';
import { expectedMigrations } from '../src/generated/migrations.js';
import { createApplication } from './helpers.js';
import { syntheticAuthPeer } from './app-auth-fixture.js';

export async function etsyFixture(t: TestContext, etsyConfig: EtsyConfig) {
  const directory = process.env.ETSY_TEST_FIXTURE_DIRECTORY ?? '';
  assert.ok(directory.startsWith(join(await realpath(tmpdir()), 'esty-etsy-local-')));
  assert.equal(await realpath(directory), directory);
  const owned = JSON.parse(await readFile(join(directory, 'fixture.json'), 'utf8')) as { name: string; id: string; port: number; password: string };
  assert.match(owned.name, /^esty-etsy-[a-f0-9]{16}$/);
  assert.match(owned.id, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(owned.port) && owned.port > 1024 && ![54322, 55432, 55433, 55440, 55441, 55442, 55443, 55444].includes(owned.port));
  const label = execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "esty.etsy.owner"}}', owned.id], { encoding: 'utf8' }).trim();
  assert.equal(label, owned.name);
  const mapping = execFileSync('docker', ['port', owned.id, '5432/tcp'], { encoding: 'utf8' }).trim();
  assert.equal(mapping, `127.0.0.1:${owned.port}`);
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
      } else assert.match(request.headers.authorization ?? '', /^Bearer 7\./);
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
          const chunks: Buffer[] = [];
          response.on('data', chunk => chunks.push(Buffer.from(chunk)));
          response.on('error', reject);
          response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode!, headers: response.headers as Record<string, string> })));
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
    return { status: response.status, body: bodyValue as Record<string, unknown> };
  }
  return { admin, app, origin, secondOrigin, api, owner, member, foreign, workspace, sessions, tokens, technical, state, calls, database,
    identity: { userId: owner, sessionId: sessions.owner, email: 'owner@example.invalid' },
    async start(secret: string) {
      return fetch(origin + '/integrations/etsy/invite/start', { method: 'POST', redirect: 'manual', headers: {
        Host: new URL(etsyConfig.invitationOrigin).host, Origin: etsyConfig.invitationOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) });
    },
    async callback(stateValue: string, code = 'synthetic-code') {
      return fetch(`${origin}/integrations/etsy/callback?state=${stateValue}&code=${code}`, { redirect: 'manual', headers: { Host: 'api.lovora.us' } });
    },
  };
}
