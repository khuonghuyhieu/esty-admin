import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { Client, Pool } from 'pg';
import { parseConfig, parseMigrationConfig } from '../src/config/config.js';
import { runMigrations } from '../scripts/migrations.js';
import { expectedMigrations } from '../src/generated/migrations.js';
import { PostgresProbe } from '../src/connectivity/adapters/postgres.js';
import { AppDatabase } from '../src/app-foundation/adapters/postgres.js';
import { AppService } from '../src/app-foundation/application/service.js';
import { AuthAdmin } from '../src/app-foundation/adapters/auth-admin.js';
import { AuthVerifier } from '../src/app-foundation/adapters/auth-verifier.js';
import { AppError } from '../src/app-foundation/application/errors.js';
import type { components } from '../src/generated/api.js';
import { createApplication } from './helpers.js';
import { syntheticAuthPeer } from './app-auth-fixture.js';
import { createSessionSupport, OwnedFixtureLifecycle } from './app-fixture-lifecycle.js';
import { fixtureProfile } from '../scripts/app-fixture-profile.mjs';
import { inspectAppBootstrap } from '../scripts/bootstrap-app-owner.js';
import { inspectAppRoles, parseAppRoleInputs, AppRoleError } from '../scripts/app-roles.js';

type Me = components['schemas']['AppMe'];
type MemberResult = components['schemas']['AppMemberResult'];
type InvitationResult = components['schemas']['AppInvitationResult'];
type Tokens = { access_token: string; refresh_token: string; user: { id: string; email: string } };
const password = 'Synthetic-Password-005!safe';
const profile = fixtureProfile();
const authOrigin = `http://127.0.0.1:${profile.authPort}`;
const mailOrigin = `http://127.0.0.1:${profile.mailPort}`;

async function readOwnedFixture() {
  assert.equal(process.env.F005_ALLOW_OWNED_DB, 'true', 'Explicit isolated-resource agreement/opt-in required.');
  const directory = process.env.F005_FIXTURE_DIRECTORY ?? '';
  const prefix = join(await realpath(tmpdir()), profile.prefix);
  assert.ok(directory.startsWith(prefix) && await realpath(directory) === directory, 'Only the new fixture-owned directory may be read.');
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')) as { nonce: string; database: string; project: string };
  assert.equal(state.project, profile.project);
  if (profile.name === 'activation001') assert.equal(state.nonce, process.env.F001_RUN_NONCE);
  assert.match(state.nonce, /^[a-f0-9]{32}$/);
  assert.match(state.database, /^f005_[a-f0-9]{32}$/);
  const env = JSON.parse(await readFile(join(directory, 'test-env.json'), 'utf8')) as Record<string, string>;
  assert.equal(env.F005_RUN_NONCE, state.nonce);
  assert.equal(env.F005_DATABASE_URL, `postgresql://f005_fixture_admin:synthetic_f005_admin_only@127.0.0.1:${profile.databasePort}/${state.database}`);
  assert.equal(env.F005_FIXTURE_DIRECTORY, directory);
  const database = parseMigrationConfig({ DATABASE_URL: env.F005_DATABASE_URL });
  const admin = new Client(database);
  await admin.connect();
  try {
    const marker = await admin.query<{ nonce: string; database: string; user_name: string }>(
      'SELECT nonce, current_database() AS database, current_user AS user_name FROM public.f005_fixture_marker');
    assert.deepEqual(marker.rows, [{ nonce: state.nonce, database: state.database, user_name: 'f005_fixture_admin' }]);
  } catch (error) { await admin.end(); throw error; }
  return { database, admin, env, state };
}

test('isolated real GoTrue → protected Nest → app DB foundation journey', { timeout: 180000 }, async t => {
  const fixture = await readOwnedFixture();
  const workspaceId = randomUUID();
  let lifecycle: OwnedFixtureLifecycle | undefined;
  let closeApp: (() => Promise<void>) | undefined;
  let closeOperator: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      try { await closeApp?.(); } finally { await closeOperator?.(); }
    } finally {
      try { await lifecycle?.cleanup(workspaceId); } finally { await fixture.admin.end(); }
    }
  });
  const key = fixture.env.F005_AUTH_ADMIN_KEY!;
  async function auth<T>(path: string, body?: object, bearer?: string, method?: string) {
    assert.ok(path.startsWith('/') && !path.startsWith('//'));
    const response = await fetch(authOrigin + path, { method: method ?? (body ? 'POST' : 'GET'), redirect: 'error',
      signal: AbortSignal.timeout(5000), headers: { apikey: key, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
  }
  const owned = await OwnedFixtureLifecycle.create(fixture.state.nonce, fixture.state.database, fixture.admin,
    <T>(path: string, body?: object, method?: string) => auth<T>(path, body, key, method));
  lifecycle = owned;
  const address = (label: string) => owned.address(label);
  await assert.rejects(owned.register('unregistered@external.example', randomUUID()));
  await assert.rejects(owned.rememberEmail(randomUUID(), address('owner')));
  async function identity(email: string) {
    await owned.intent(email);
    const result = await auth<{ id: string }>('/admin/users', { email, password, email_confirm: true,
      user_metadata: { role: 'owner', ...owned.metadata } }, key);
    assert.equal(result.status, 200);
    await owned.register(email, result.body.id);
    return result.body.id;
  }
  async function login(email: string, secret = password) {
    const result = await auth<Tokens>('/token?grant_type=password', { email, password: secret });
    assert.equal(result.status, 200);
    return result.body;
  }
  const seenMail = new Set<string>();
  async function challenge(email: string, type: 'invite' | 'magiclink' | 'recovery') {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const response = await fetch(mailOrigin + '/api/v1/messages?limit=100', { signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 200);
      const list = await response.json() as { messages: Array<{ ID: string; To: Array<{ Address: string }> }> };
      for (const message of list.messages) {
        if (seenMail.has(message.ID) || !message.To.some(recipient => recipient.Address === email)) continue;
        const html = await (await fetch(`${mailOrigin}/view/${message.ID}.html`, { signal: AbortSignal.timeout(2000) })).text();
        for (const link of html.match(/https?:\/\/[^"<>\s]+/g) ?? []) {
          const url = new URL(link.replaceAll('&amp;', '&'));
          if (url.origin === authOrigin && url.pathname === '/verify' && url.searchParams.get('type') === type) {
            seenMail.add(message.ID);
            assert.ok(url.searchParams.get('token'));
            return url.searchParams.get('token')!;
          }
        }
      }
      await delay(30);
    }
    throw new Error('Synthetic capture did not receive the expected real Auth challenge.');
  }
  async function verify(email: string, type: 'invite' | 'magiclink' | 'recovery') {
    const token_hash = await challenge(email, type);
    const response = await auth<Tokens>('/verify', { token_hash, type });
    assert.equal(response.status, 200);
    return { tokens: response.body, token_hash };
  }

  const migration = await runMigrations(fixture.database);
  assert.equal(migration.database_outcome, 'committed');
  assert.deepEqual(migration.after, expectedMigrations);
  const replay = await runMigrations(fixture.database);
  assert.equal(replay.database_outcome, 'committed');
  assert.deepEqual(replay.attempted, []);
  // Revoke only this fixture run's superseded column grant; preserve managed Auth DDL/RLS.
  await fixture.admin.query('REVOKE SELECT(id,user_id,not_after) ON auth.sessions FROM app_runtime');
  const technicalKey = 'd'.repeat(64);
  const config = parseConfig({ API_RUNTIME: 'local',
    DATABASE_URL: `postgresql://app_runtime:synthetic_f005_runtime_only@127.0.0.1:${profile.databasePort}/${fixture.state.database}`,
    APP_FOUNDATION_ENABLED: 'true', APP_WORKSPACE_ID: workspaceId, APP_AUTH_URL: authOrigin,
    APP_AUTH_API_KEY: 'synthetic-api-key', APP_EMAIL_ENABLED: 'true', APP_AUTH_ADMIN_KEY: key,
    PREVIEW_ACCESS_KEY: technicalKey, BROWSER_ORIGIN: `http://127.0.0.1:${profile.apiPort}` });
  const app = await createApplication(config);
  closeApp = () => app.close();
  await app.listen(profile.apiPort, '127.0.0.1');
  const origin = await app.getUrl();
  async function api<T>(path: string, tokens: Tokens, body?: object, method?: string) {
    const response = await fetch(origin + '/v1/app' + path, { method: method ?? (body ? 'POST' : 'GET'),
      signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${technicalKey}`, 'X-App-Access-Token': tokens.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    return { status: response.status, body: await response.json() as T };
  }
  const initialOwnerId = await identity(address('owner'));
  let owner = await login(address('owner'));
  const approvalId = randomUUID();
  const operatorEnv = { APP_OPERATOR_TARGET: 'local', APP_OPERATOR_DATABASE_URL: `postgresql://app_operator:synthetic_f005_operator_only@127.0.0.1:${profile.databasePort}/${fixture.state.database}`,
    APP_OPERATOR_AUTH_KEY: key, APP_OPERATOR_CONFIRM_WORKSPACE: workspaceId, APP_OPERATOR_APPROVAL_ID: approvalId,
    APP_OPERATOR_USER_ID: initialOwnerId, APP_OPERATOR_PROFILE_NAME: 'Synthetic Owner', APP_OPERATOR_WORKSPACE_NAME: 'Synthetic Workspace',
    APP_WORKSPACE_ID: workspaceId, APP_AUTH_URL: authOrigin, APP_AUTH_API_KEY: 'synthetic-api-key', BROWSER_ORIGIN: `http://127.0.0.1:${profile.apiPort}` };
  function operator(extra: NodeJS.ProcessEnv = {}, action = 'bootstrap') {
    return spawnSync(process.execPath, [new URL('../scripts/bootstrap-app-owner.js', import.meta.url).pathname, action], {
      env: { ...operatorEnv, ...extra }, encoding: 'utf8', timeout: 10000 });
  }
  const operatorPool = new Pool({ ...fixture.database, user: 'app_operator', password: 'synthetic_f005_operator_only', max: 1 });
  operatorPool.on('error', () => {});
  const operatorDatabase = new AppDatabase(operatorPool, 'app_operator');
  const operatorService = new AppService(config.appFoundation!, operatorDatabase, new AuthAdmin(config.appFoundation!, key));
  closeOperator = async () => { operatorDatabase.onModuleDestroy(); await operatorPool.end(); };

  await t.test('effective role preflight rejects extra table and inherited-role authority', async () => {
    const inputs = parseAppRoleInputs({ DATABASE_URL: fixture.env.F005_DATABASE_URL,
      APP_ROLES_CONFIRM_TARGET: 'local', APP_ROLES_APPROVAL_ID: randomUUID(),
      APP_ROLES_RUNTIME_DATABASE_URL: config.database.user === 'app_runtime'
        ? `postgresql://app_runtime:synthetic_f005_runtime_only@127.0.0.1:${profile.databasePort}/${fixture.state.database}` : '',
      APP_ROLES_OPERATOR_DATABASE_URL: operatorEnv.APP_OPERATOR_DATABASE_URL });
    await inspectAppRoles(inputs, true, AbortSignal.timeout(20000));
    await fixture.admin.query('GRANT DELETE ON app_private.workspaces TO app_runtime');
    try { await assert.rejects(inspectAppRoles(inputs, true, AbortSignal.timeout(20000)), AppRoleError); }
    finally { await fixture.admin.query('REVOKE DELETE ON app_private.workspaces FROM app_runtime'); }
    await fixture.admin.query('GRANT app_operator TO app_runtime');
    try { await assert.rejects(inspectAppRoles(inputs, true, AbortSignal.timeout(20000)), AppRoleError); }
    finally { await fixture.admin.query('REVOKE app_operator FROM app_runtime'); }
    await inspectAppRoles(inputs, true, AbortSignal.timeout(20000));
  });

  await t.test('trusted CLI bootstrap is atomic/idempotent; public admission and managed-schema privileges remain closed', async () => {
    assert.equal((await api('/me', owner)).status, 403);
    assert.equal(await inspectAppBootstrap(operatorEnv), 'absent');
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = operator();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { status: 'complete', action: 'bootstrap' });
    }
    const inspected = operator({}, 'inspect-bootstrap');
    assert.equal(inspected.status, 0);
    assert.deepEqual(JSON.parse(inspected.stdout), { status: 'complete', action: 'inspect-bootstrap', outcome: 'committed' });
    assert.equal(await inspectAppBootstrap({ ...operatorEnv, APP_OPERATOR_APPROVAL_ID: randomUUID() }), 'conflict');
    await fixture.admin.query("UPDATE app_private.audit_events SET request_id=$1 WHERE workspace_id=$2 AND action='workspace.bootstrap'",
      [randomUUID(), workspaceId]);
    try {
      assert.equal(await inspectAppBootstrap(operatorEnv), 'conflict');
      assert.equal(operator().status, 1, 'Matching bootstrap input must not repair a conflicting audit record.');
    } finally {
      await fixture.admin.query("UPDATE app_private.audit_events SET request_id=$1 WHERE workspace_id=$2 AND action='workspace.bootstrap'",
        [approvalId, workspaceId]);
    }
    assert.equal(await inspectAppBootstrap(operatorEnv), 'committed');
    assert.equal(operator({ APP_OPERATOR_WORKSPACE_NAME: 'Conflicting Workspace' }).status, 1);
    assert.equal((await api('/bootstrap', owner, {})).status, 404);
    const me = await api<Me>('/me', owner);
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.profile, { userId: initialOwnerId, displayName: 'Synthetic Owner', revision: 1 });
    assert.equal(me.body.email, address('owner'));
    assert.equal(me.body.membership.role, 'owner');
    assert.equal((await fixture.admin.query("SELECT count(*)::integer AS count FROM app_private.audit_events WHERE action = 'workspace.bootstrap'")).rows[0].count, 1);
    const permissions = await fixture.admin.query(`SELECT has_schema_privilege('anon','app_private','USAGE') AS anon,
      has_schema_privilege('authenticated','app_private','USAGE') AS authenticated,
      has_table_privilege('app_runtime','app_private.audit_events','UPDATE') AS audit_update,
      has_table_privilege('app_runtime','app_private.audit_events','DELETE') AS audit_delete,
      has_table_privilege('app_runtime','auth.users','SELECT') AS auth_users,
      has_column_privilege('app_runtime','auth.sessions','id','SELECT') AS session_id,
      has_column_privilege('app_runtime','auth.sessions','refresh_token_hmac_key','SELECT') AS session_secret`);
    assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, audit_update: false, audit_delete: false,
      auth_users: false, session_id: false, session_secret: false });
    await fixture.admin.query('BEGIN');
    try {
      await fixture.admin.query('DELETE FROM app_private.memberships WHERE workspace_id = $1 AND user_id = $2', [workspaceId, initialOwnerId]);
      await assert.rejects(fixture.admin.query('COMMIT'), (error: Error) => error.message === 'last_owner');
    } finally { await fixture.admin.query('ROLLBACK'); }
    assert.equal((await api<Me>('/me', owner)).body.membership.role, 'owner');
    await identity(address('unadmitted'));
    assert.equal((await api('/me', await login(address('unadmitted')))).status, 403);
  });

  await t.test('bounded session definer has exact ACLs; mismatch/direct reads fail closed and bad ownership is safe 503', async () => {
    const definition = await fixture.admin.query(`SELECT owner.rolname AS owner,p.prosecdef,p.proconfig
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
      WHERE p.oid='app_private.has_current_session(uuid,uuid)'::regprocedure`);
    assert.deepEqual(definition.rows, [{ owner: 'f005_fixture_admin', prosecdef: true, proconfig: ['search_path=pg_catalog'] }]);
    const grants = await fixture.admin.query(`SELECT COALESCE(r.rolname,'PUBLIC') AS role,a.privilege_type AS privilege
      FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
      LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
      WHERE p.oid='app_private.has_current_session(uuid,uuid)'::regprocedure ORDER BY role`);
    assert.deepEqual(grants.rows, [{ role: 'app_runtime', privilege: 'EXECUTE' }, { role: 'f005_fixture_admin', privilege: 'EXECUTE' }]);
    const runtime = app.get(PostgresProbe).pool;
    await assert.rejects(runtime.query('SELECT id FROM auth.sessions LIMIT 1'), (error: { code?: string }) => error.code === '42501');
    const sessionId = JSON.parse(Buffer.from(owner.access_token.split('.')[1]!, 'base64url').toString()).session_id as string;
    const active = (session: string, user: string) => runtime.query('SELECT app_private.has_current_session($1::uuid,$2::uuid) AS active', [session, user]);
    assert.equal((await active(sessionId, owner.user.id)).rows[0].active, true);
    assert.equal((await active(sessionId, randomUUID())).rows[0].active, false);
    assert.equal((await active(randomUUID(), owner.user.id)).rows[0].active, false);
    await fixture.admin.query('ALTER FUNCTION app_private.has_current_session(uuid,uuid) OWNER TO app_runtime');
    try {
      const unavailable = await api('/me', owner);
      assert.equal(unavailable.status, 503);
      assert.doesNotMatch(JSON.stringify(unavailable.body), /auth\\.sessions|session_reader|42501|SELECT|postgres/i);
    } finally {
      await fixture.admin.query('ALTER FUNCTION app_private.has_current_session(uuid,uuid) OWNER TO f005_fixture_admin');
      await fixture.admin.query('GRANT EXECUTE ON FUNCTION app_private.has_current_session(uuid,uuid) TO app_runtime');
    }
    assert.equal((await api('/me', owner)).status, 200);
  });

  async function offer(email: string, inviter = owner) {
    const input = { email, idempotencyKey: randomUUID() };
    await owned.intent(email);
    const result = await api<InvitationResult>('/invitations', inviter, input);
    assert.equal(result.status, 200);
    assert.equal(result.body.invitation.delivery, 'confirmed');
    await owned.registerInvitation(email);
    return { result: result.body.invitation, input };
  }
  async function accepted(email: string, name: string) {
    const invitation = await offer(email);
    const verified = await verify(email, 'invite');
    assert.equal((await auth('/user', { password }, verified.tokens.access_token, 'PUT')).status, 200);
    const outcomes = await Promise.all([
      api<MemberResult>(`/invitations/${invitation.result.id}/accept`, verified.tokens, { displayName: name }),
      api<MemberResult>(`/invitations/${invitation.result.id}/accept`, verified.tokens, { displayName: name }),
    ]);
    assert.deepEqual(outcomes.map(result => result.status), [200, 200]);
    assert.deepEqual(outcomes[0]!.body.member, outcomes[1]!.body.member);
    return { tokens: verified.tokens, invitation, member: outcomes[0]!.body.member };
  }
  const colleague = await accepted(address('colleague'), 'Synthetic Member');
  let other = colleague.tokens;

  await t.test('real captured invitation grants once; current capability and settings revisions control persistence', async () => {
    const replay = await api<InvitationResult>('/invitations', owner, colleague.invitation.input);
    assert.equal(replay.body.invitation.id, colleague.invitation.result.id);
    assert.equal((await api('/invitations', owner, { ...colleague.invitation.input, email: address('different') })).status, 409);
    assert.equal((await api(`/invitations/${colleague.invitation.result.id}/accept`, other, { displayName: 'Ignored replay' })).status, 200);
    assert.equal((await fixture.admin.query('SELECT count(*)::integer AS count FROM app_private.memberships WHERE user_id = $1', [other.user.id])).rows[0].count, 1);
    assert.equal((await fixture.admin.query("SELECT count(*)::integer AS count FROM app_private.audit_events WHERE workspace_id=$1 AND action='invitation.accept'", [workspaceId])).rows[0].count, 1);
    assert.equal((await api('/workspace', other, { displayName: 'Unauthorized', revision: 1 }, 'PATCH')).status, 403);
    assert.equal((await api('/audit', other)).status, 403);
    assert.equal((await api('/invitations', other)).status, 403);
    assert.equal((await api('/me', other, { displayName: 'Name', revision: 1, userId: owner.user.id }, 'PATCH')).status, 400);
    const profile = await api<components['schemas']['AppProfileResult']>('/me', other, { displayName: '  Hà Nội  ', revision: 1 }, 'PATCH');
    assert.equal(profile.status, 200);
    assert.equal(profile.body.profile.displayName, 'Hà Nội');
    assert.equal((await api('/me', other, { displayName: 'Stale', revision: 1 }, 'PATCH')).status, 409);
    assert.equal((await api<Me>('/me', other)).body.profile.displayName, 'Hà Nội');
    assert.equal((await api(`/team/${randomUUID()}`, owner, { role: 'owner', revision: 1 }, 'PATCH')).status, 404);
    assert.equal((await api(`/invitations/${randomUUID()}/accept`, other, { displayName: 'Foreign' })).status, 404);
    const before = (await api<Me>('/me', owner)).body.profile;
    await fixture.admin.query('REVOKE INSERT ON app_private.audit_events FROM app_runtime');
    try {
      assert.equal((await api('/me', owner, { displayName: 'Must Roll Back', revision: before.revision }, 'PATCH')).status, 503);
    } finally { await fixture.admin.query('GRANT INSERT ON app_private.audit_events TO app_runtime'); }
    assert.deepEqual((await api<Me>('/me', owner)).body.profile, before);
    assert.equal((await api('/workspace', owner, { displayName: 'Saved Workspace', revision: 1 }, 'PATCH')).status, 200);
    assert.equal((await api<Me>('/me', other)).body.workspace.displayName, 'Saved Workspace');
  });

  await t.test('simultaneous owner demotions preserve an owner and stale inviter authority grants nothing', async () => {
    assert.equal((await api(`/team/${other.user.id}`, owner, { role: 'owner', revision: 1 }, 'PATCH')).status, 200);
    const ownerRevision = (await api<Me>('/me', owner)).body.membership.revision;
    const otherRevision = (await api<Me>('/me', other)).body.membership.revision;
    const outcomes = await Promise.all([
      api(`/team/${owner.user.id}`, owner, { role: 'member', revision: ownerRevision }, 'PATCH'),
      api(`/team/${other.user.id}`, other, { role: 'member', revision: otherRevision }, 'PATCH'),
    ]);
    assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
    if (outcomes[0]!.status === 200) [owner, other] = [other, owner];
    const memberRevision = (await api<Me>('/me', other)).body.membership.revision;
    assert.equal((await api(`/team/${other.user.id}`, owner, { role: 'owner', revision: memberRevision }, 'PATCH')).status, 200);
    const invitation = await offer(address('issuer-change'), other);
    const recipient = (await verify(address('issuer-change'), 'invite')).tokens;
    const currentRevision = (await api<Me>('/me', other)).body.membership.revision;
    assert.equal((await api(`/team/${other.user.id}`, owner, { role: 'member', revision: currentRevision }, 'PATCH')).status, 200);
    assert.equal((await api(`/invitations/${invitation.result.id}/accept`, recipient, { displayName: 'Denied' })).status, 409);
    assert.equal((await fixture.admin.query('SELECT count(*)::integer AS count FROM app_private.memberships WHERE user_id = $1', [recipient.user.id])).rows[0].count, 0);
  });

  await t.test('wrong identity, changed verified email, revoked and expired app offers cannot create membership', async () => {
    const invitation = await offer(address('revoked'));
    const recipient = (await verify(address('revoked'), 'invite')).tokens;
    assert.equal((await api(`/invitations/${invitation.result.id}/accept`, owner, { displayName: 'Wrong' })).status, 404);
    assert.equal((await auth(`/admin/users/${recipient.user.id}`, { email: address('changed'), email_confirm: true }, key, 'PUT')).status, 200);
    await owned.rememberEmail(recipient.user.id, address('changed'));
    assert.equal((await api(`/invitations/${invitation.result.id}/accept`, recipient, { displayName: 'Changed' })).status, 404);
    assert.equal((await auth(`/admin/users/${recipient.user.id}`, { email: address('revoked'), email_confirm: true }, key, 'PUT')).status, 200);
    await owned.rememberEmail(recipient.user.id, address('revoked'));
    assert.equal((await api(`/invitations/${invitation.result.id}/revoke`, owner, { revision: invitation.result.revision })).status, 200);
    assert.equal((await api(`/invitations/${invitation.result.id}/accept`, recipient, { displayName: 'Revoked' })).status, 409);
    const expired = await offer(address('expired-offer'));
    const expiredRecipient = (await verify(address('expired-offer'), 'invite')).tokens;
    await fixture.admin.query("UPDATE app_private.invitations SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day' WHERE id = $1", [expired.result.id]);
    assert.equal((await api(`/invitations/${expired.result.id}/accept`, expiredRecipient, { displayName: 'Expired' })).status, 409);
    for (const userId of [recipient.user.id, expiredRecipient.user.id]) {
      assert.equal((await fixture.admin.query('SELECT count(*)::integer AS count FROM app_private.memberships WHERE user_id = $1', [userId])).rows[0].count, 0);
    }
    await identity(address('existing'));
    const existing = await offer(address('existing'));
    const verified = (await verify(address('existing'), 'magiclink')).tokens;
    assert.equal((await api(`/invitations/${existing.result.id}/accept`, verified, { displayName: 'Existing Identity' })).status, 200);
  });

  await t.test('synthetic lost provider acknowledgement fences real SQL reservation and explicit reconciliation', async () => {
    const peer = await syntheticAuthPeer();
    const database = new AppDatabase(app.get(PostgresProbe).pool);
    try {
      const service = new AppService(config.appFoundation!, database, new AuthAdmin(peer.config));
      const verified = await new AuthVerifier(config.appFoundation!).verify(owner.access_token, AbortSignal.timeout(5000));
      const input = { email: address('uncertain'), idempotencyKey: randomUUID() };
      peer.state.loseInviteAcknowledgement = true;
      const first = await service.createInvitation(verified, input, randomUUID(), AbortSignal.timeout(8000));
      assert.equal(first.invitation.delivery, 'unknown');
      assert.equal((await service.createInvitation(verified, input, randomUUID(), AbortSignal.timeout(8000))).invitation.id, first.invitation.id);
      await assert.rejects(service.createInvitation(verified, { ...input, idempotencyKey: randomUUID() }, randomUUID(), AbortSignal.timeout(8000)),
        (error: unknown) => error instanceof AppError && error.code === 'invitation_conflict');
      await assert.rejects(service.createInvitation(verified, { idempotencyKey: randomUUID(), revision: first.invitation.revision }, randomUUID(), AbortSignal.timeout(8000), first.invitation.id), AppError);
      assert.equal(peer.state.inviteCalls, 1);
      assert.equal(peer.state.otpCalls, 0);
      const reconciled = await operatorService.reconcileInvitation({ userId: owner.user.id, invitationId: first.invitation.id,
        outcome: 'failed', approvalId: randomUUID() }, AbortSignal.timeout(8000));
      peer.state.loseInviteAcknowledgement = false;
      const replacement = await service.createInvitation(verified, { idempotencyKey: randomUUID(), revision: reconciled.invitation.revision },
        randomUUID(), AbortSignal.timeout(8000), first.invitation.id);
      assert.notEqual(replacement.invitation.id, first.invitation.id);
      assert.equal(replacement.invitation.delivery, 'confirmed');
      assert.equal(peer.state.inviteCalls, 2);
    } finally { database.onModuleDestroy(); await peer.close(); }
  });

  await t.test('real refresh/logout and recovery enforce current session without reactivating a disabled member', async () => {
    const refreshed = await auth<Tokens>('/token?grant_type=refresh_token', { refresh_token: owner.refresh_token });
    assert.equal(refreshed.status, 200); owner = refreshed.body;
    const second = await login(owner.user.email);
    assert.equal((await auth('/logout?scope=local', undefined, owner.access_token, 'POST')).status, 204);
    assert.equal((await api('/me', owner)).status, 401);
    assert.equal((await api('/me', second)).status, 200);
    assert.notEqual((await auth('/token?grant_type=refresh_token', { refresh_token: owner.refresh_token })).status, 200);
    owner = second;
    const memberRevision = (await api<Me>('/me', other)).body.membership.revision;
    assert.equal((await api(`/team/${other.user.id}`, owner, { status: 'disabled', revision: memberRevision }, 'PATCH')).status, 200);
    assert.equal((await api('/me', other)).status, 403);
    assert.equal((await auth('/recover', { email: address('not-registered') })).status, 200);
    assert.equal((await auth('/recover', { email: other.user.email })).status, 200);
    const recovered = await verify(other.user.email, 'recovery');
    const replacementPassword = 'Synthetic-Recovered-005!safe';
    assert.equal((await auth('/user', { password: replacementPassword }, recovered.tokens.access_token, 'PUT')).status, 200);
    assert.equal((await auth('/logout?scope=global', undefined, recovered.tokens.access_token, 'POST')).status, 204);
    assert.equal((await api('/me', recovered.tokens)).status, 401);
    assert.equal((await api('/me', other)).status, 401);
    other = await login(other.user.email, replacementPassword);
    assert.equal((await api('/me', other)).status, 403);
    assert.notEqual((await auth('/verify', { token_hash: recovered.token_hash, type: 'recovery' })).status, 200);
    assert.notEqual((await auth('/token?grant_type=password', { email: other.user.email, password })).status, 200);
    assert.equal((await api('/reset-owner', owner, {})).status, 404);
    await identity(address('expired-challenge'));
    assert.equal((await auth('/recover', { email: address('expired-challenge') })).status, 200);
    const expiredHash = await challenge(address('expired-challenge'), 'recovery');
    await delay(11000);
    assert.notEqual((await auth('/verify', { token_hash: expiredHash, type: 'recovery' })).status, 200);
  });

  await t.test('audit pagination preserves tied timestamp rows; blocked SQL is bounded and recovers', async () => {
    const expected = (await fixture.admin.query('SELECT id FROM app_private.audit_events WHERE workspace_id = $1 ORDER BY occurred_at DESC,id DESC', [workspaceId])).rows.map(row => row.id as string);
    const actual: string[] = [];
    let cursor: string | null = null;
    do {
      const result: { status: number; body: components['schemas']['AppAuditEventPage'] } = await api(`/audit?limit=1${cursor ? `&cursor=${cursor}` : ''}`, owner);
      assert.equal(result.status, 200);
      actual.push(...result.body.items.map(row => row.id));
      assert.doesNotMatch(JSON.stringify(result.body), /access_token|refresh_token|synthetic_f005|password|token_hash|@example\.test/);
      cursor = result.body.nextCursor;
    } while (cursor);
    assert.deepEqual(actual, expected);
    await fixture.admin.query('BEGIN; LOCK TABLE app_private.workspaces IN ACCESS EXCLUSIVE MODE');
    try {
      const began = performance.now();
      assert.equal((await api('/me', owner)).status, 503);
      assert.ok(performance.now() - began < 4000);
    } finally { await fixture.admin.query('ROLLBACK'); }
    assert.equal((await api('/me', owner)).status, 200);
    assert.equal(app.get(PostgresProbe).pool.waitingCount, 0);
    const live = await fetch(origin + '/health/live', { headers: { Authorization: `Bearer ${technicalKey}` } });
    assert.equal(live.status, 200); await live.arrayBuffer();
  });
});

test('006 current-session support with actual GoTrue and current membership', {
  timeout: 120000, skip: process.env.F006_ALLOW_OWNED_FIXTURE !== 'true',
}, async t => {
  const support = await createSessionSupport(process.env.F005_FIXTURE_DIRECTORY ?? '', process.env.F005_RUN_NONCE ?? '');
  t.after(() => support.close());
  t.diagnostic(JSON.stringify({ nonce: support.nonce, ownedIdentityReceipts: support.reportDirectory }));
  const invoke = (operation: string, fields: Record<string, unknown> = {}) =>
    support.control({ nonce: support.nonce, operation, ...fields });

  await t.test('confirmed local logout rejects the same old JWT while an independent same-user session survives', async () => {
    const original = await support.login('owner');
    const independent = await support.login('owner');
    assert.equal(original.user.id, independent.user.id);
    assert.equal((await support.api<Me>('/me', original)).status, 200);
    assert.equal((await support.api<Me>('/me', independent)).status, 200);
    const old = await invoke('register-session', { accessToken: original.access_token });
    const other = await invoke('register-session', { accessToken: independent.access_token });
    assert.ok('handle' in old && 'handle' in other);
    assert.equal((await support.auth('/logout?scope=local', undefined, original.access_token, 'POST')).status, 204);
    assert.deepEqual(await invoke('replay', { handle: old.handle }), { status: 401, code: 'unauthenticated' });
    assert.deepEqual(await invoke('replay', { handle: other.handle }), { status: 200 });
    const refresh = await support.auth('/token?grant_type=refresh_token', { refresh_token: original.refresh_token });
    assert.ok([400, 401, 403].includes(refresh.status), 'Revoked refresh must be rejected, not merely unavailable.');
  });

  await t.test('current disable denies an unchanged valid session and explicit reactivation restores admission', async () => {
    const member = await support.login('member');
    assert.equal((await support.api<Me>('/me', member)).status, 200);
    try {
      await invoke('set-member', { target: 'member', status: 'disabled' });
      const denied = await support.api<components['schemas']['AppError']>('/me', member);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.code, 'forbidden');
    } finally { await invoke('set-member', { target: 'member', status: 'active' }); }
    assert.equal((await support.api<Me>('/me', member)).status, 200);
    assert.equal((await support.api('/me', await support.login('unadmitted'))).status, 403);
    assert.equal((await support.api('/me', await support.login('disabled'))).status, 403);
  });

  await t.test('demotion removes Owner capability without denying a still-active Member current me', async () => {
    const member = await support.login('member');
    const baseline = await support.api<Me>('/me', member);
    assert.equal(baseline.status, 200);
    try {
      await invoke('set-member', { target: 'member', role: 'owner' });
      assert.equal((await support.api('/audit', member)).status, 200);
      await invoke('set-member', { target: 'member', role: 'member' });
      const current = await support.api<Me>('/me', member);
      assert.equal(current.status, 200);
      assert.equal(current.body.membership.role, 'member');
      assert.deepEqual(new Set(current.body.capabilities), new Set(baseline.body.capabilities));
      assert.equal((await support.api('/audit', member)).status, 403);
      const workspaceWrite = await support.api('/workspace', member,
        { displayName: 'Not Authorized', revision: current.body.workspace.revision }, 'PATCH');
      assert.equal(workspaceWrite.status, 403);
    } finally { await invoke('set-member', { target: 'member', role: 'member' }); }
  });

  await t.test('owned dependency faults and technical guard restore without losing the current session', async faultTest => {
    const owner = await support.login('owner');
    for (const target of ['database', 'auth', 'technical-key']) {
      await faultTest.test(target, async () => {
        try {
          await invoke('fault', { target, active: true });
          const result = await support.api('/me', owner);
          assert.equal(result.status, target === 'technical-key' ? 401 : 503);
        } finally { await invoke('fault', { target, active: false }); }
        assert.equal((await support.api('/me', owner)).status, 200);
      });
    }
    const wrongNonce = (support.nonce[0] === '0' ? '1' : '0') + support.nonce.slice(1);
    await assert.rejects(support.control({ nonce: wrongNonce, operation: 'set-member', target: 'member', status: 'disabled' }),
      /Wrong fixture nonce/);
    assert.equal((await support.api<Me>('/me', await support.login('member'))).body.membership.status, 'active');
  });
});
