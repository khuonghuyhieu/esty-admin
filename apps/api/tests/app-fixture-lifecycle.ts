import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, open, realpath, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Pool, type Client, type PoolClient } from 'pg';
import { parseConfig, parseMigrationConfig } from '../src/config/config.js';
import { runMigrations } from '../scripts/migrations.js';
import { fixtureProfile } from '../scripts/app-fixture-profile.mjs';
import { boundedText } from '../src/app-foundation/adapters/auth-http.js';
import type { components } from '../src/generated/api.js';
import { createApplication } from './helpers.js';

interface ProviderUser { id: string; email: string; created_at: string; user_metadata: Record<string, unknown> }
type AdminRequest = <T>(path: string, body?: object, method?: string) => Promise<{ status: number; body: T }>;
interface CreatedIdentity { id: string; email: string; allowedEmails: Set<string> }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export class OwnedFixtureLifecycle {
  readonly caseId = randomUUID();
  readonly metadata: Record<string, string>;
  private readonly began = Date.now();
  private readonly identities = new Map<string, CreatedIdentity>();
  private readonly intents = new Set<string>();
  private sequence = 0;
  private readonly emailPrefix: string;

  private constructor(private readonly nonce: string, private readonly database: string, private readonly client: Client | Pool,
    private readonly admin: AdminRequest, readonly reportDirectory: string) {
    this.metadata = { fixture_run_nonce: nonce, fixture_case_id: this.caseId };
    this.emailPrefix = `f005-${nonce.slice(0, 12)}-${this.caseId.replaceAll('-', '').slice(0, 12)}-`;
  }
  static async create(nonce: string, database: string, client: Client | Pool, admin: AdminRequest) {
    assert.match(nonce, /^[a-f0-9]{32}$/); assert.match(database, /^f005_[a-f0-9]{32}$/);
    const profile = fixtureProfile();
    let root = fileURLToPath(new URL('../../../../.openai/reports/', import.meta.url));
    if (profile.name === 'activation001') {
      const fixture = process.env.F005_FIXTURE_DIRECTORY;
      assert.ok(fixture && fixture.startsWith(join(await realpath(tmpdir()), profile.prefix))
        && basename(fixture) === (profile.timebox ? 'timebox' : 'fixture') && await realpath(fixture) === fixture);
      assert.equal((await lstat(fixture)).mode & 0o777, 0o700);
      assert.equal((await lstat(fixture)).uid, process.getuid!());
      root = join(dirname(fixture), 'reports');
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    assert.equal(await realpath(root), root.replace(/\/$/, ''));
    const directory = await mkdtemp(join(root, 'esty005-identities-'));
    const lifecycle = new OwnedFixtureLifecycle(nonce, database, client, admin, directory);
    await lifecycle.guard();
    await lifecycle.receipt({ action: 'execution', nonce, database, caseId: lifecycle.caseId });
    return lifecycle;
  }
  address(label: string): string {
    assert.match(label, /^[a-z][a-z0-9-]{0,30}$/);
    return `${this.emailPrefix}${label}@example.test`;
  }
  private ownsEmail(email: string) {
    return email.startsWith(this.emailPrefix) && /^[a-z0-9-]+@example\.test$/.test(email);
  }
  private async receipt(value: object) {
    const file = await open(join(this.reportDirectory, `${String(++this.sequence).padStart(3, '0')}.json`), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value) + '\n'); await file.sync(); } finally { await file.close(); }
    const directory = await open(this.reportDirectory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async guard(client: Client | Pool = this.client) {
    const actual = await client.query('SELECT nonce,current_database() AS database,current_user AS user_name FROM public.f005_fixture_marker');
    assert.deepEqual(actual.rows, [{ nonce: this.nonce, database: this.database, user_name: 'f005_fixture_admin' }]);
  }
  async intent(email: string) {
    assert.ok(this.ownsEmail(email), 'Only this run/case reserved synthetic address is allowed.');
    if ([...this.identities.values()].some(value => value.allowedEmails.has(email)) || this.intents.has(email)) return;
    assert.ok(this.intents.size < 32, 'Bound the provider identity count.');
    await this.receipt({ action: 'identity_create_intent', nonce: this.nonce, caseId: this.caseId, email });
    this.intents.add(email);
  }
  private validates(user: ProviderUser, email: string) {
    return uuid.test(user.id) && user.email === email && this.ownsEmail(email)
      && Number.isFinite(Date.parse(user.created_at)) && Date.parse(user.created_at) >= this.began - 1000
      && user.user_metadata?.fixture_run_nonce === this.nonce && user.user_metadata?.fixture_case_id === this.caseId;
  }
  async register(email: string, id: string) {
    assert.ok(this.intents.has(email) && uuid.test(id), 'A recorded creation intent and exact UUID are required.');
    const result = await this.admin<ProviderUser>(`/admin/users/${id}`);
    assert.equal(result.status, 200);
    assert.ok(this.validates(result.body, email), 'Provider creation identity/metadata must match this run.');
    assert.ok(!this.identities.has(id));
    await this.receipt({ action: 'identity_registered', nonce: this.nonce, caseId: this.caseId, id, email, createdAt: result.body.created_at });
    this.identities.set(id, { id, email, allowedEmails: new Set([email]) });
  }
  async registerInvitation(email: string) {
    if ([...this.identities.values()].some(value => value.allowedEmails.has(email))) return;
    assert.ok(this.intents.has(email) && this.ownsEmail(email));
    const list = await this.admin<{ users: ProviderUser[] }>('/admin/users?page=1&per_page=1000');
    assert.equal(list.status, 200);
    const matches = list.body.users.filter(user => user.email === email);
    assert.equal(matches.length, 1);
    const user = matches[0]!;
    assert.ok(uuid.test(user.id) && Date.parse(user.created_at) >= this.began - 1000, 'Never adopt an earlier identity.');
    const tagged = await this.admin(`/admin/users/${user.id}`, { user_metadata: { ...user.user_metadata, ...this.metadata } }, 'PUT');
    assert.equal(tagged.status, 200);
    await this.register(email, user.id);
  }
  async rememberEmail(id: string, email: string) {
    const registered = this.identities.get(id);
    assert.ok(registered && this.ownsEmail(email));
    const actual = await this.admin<ProviderUser>(`/admin/users/${id}`);
    assert.equal(actual.status, 200); assert.ok(this.validates(actual.body, email));
    await this.receipt({ action: 'identity_email_change', nonce: this.nonce, caseId: this.caseId, id, email });
    registered.allowedEmails.add(email);
  }
  async cleanup(workspaceId: string) {
    assert.match(workspaceId, uuid);
    const failures: Array<{ action: string; id?: string; outcome: string }> = [];
    let transaction: Client | PoolClient | undefined;
    try {
      transaction = this.client instanceof Pool ? await this.client.connect() : this.client;
      await this.guard(transaction);
      await transaction.query("BEGIN; SET LOCAL lock_timeout = '500ms'; SET LOCAL statement_timeout = '1000ms'");
      await transaction.query('DELETE FROM app_private.audit_events WHERE workspace_id=$1', [workspaceId]);
      await transaction.query('DELETE FROM app_private.invitations WHERE workspace_id=$1', [workspaceId]);
      await transaction.query('DELETE FROM app_private.memberships WHERE workspace_id=$1', [workspaceId]);
      await transaction.query('DELETE FROM app_private.workspaces WHERE id=$1', [workspaceId]);
      await transaction.query('DELETE FROM app_private.profiles WHERE user_id=ANY($1::uuid[])', [[...this.identities.keys()]]);
      await transaction.query('COMMIT');
      await this.receipt({ action: 'app_cleanup', nonce: this.nonce, caseId: this.caseId, workspaceId, outcome: 'committed' });
    } catch {
      await transaction?.query('ROLLBACK').catch(() => {});
      failures.push({ action: 'app_cleanup', outcome: 'unconfirmed' });
    } finally {
      if (transaction && 'release' in transaction) transaction.release(failures.length > 0);
    }
    const appCleanupConfirmed = failures.length === 0;
    for (const registered of this.identities.values()) {
      if (!appCleanupConfirmed) {
        failures.push({ action: 'identity_cleanup', id: registered.id, outcome: 'preserved_after_app_cleanup_failure' });
        continue;
      }
      try {
        const actual = await this.admin<ProviderUser>(`/admin/users/${registered.id}`);
        if (actual.status === 404) {
          await this.receipt({ action: 'identity_cleanup', id: registered.id, outcome: 'absence_confirmed' });
          continue;
        }
        if (actual.status !== 200 || actual.body.id !== registered.id || !registered.allowedEmails.has(actual.body.email)
          || !this.validates(actual.body, actual.body.email)) throw new Error('Unproven cleanup identity.');
        await this.receipt({ action: 'identity_delete_intent', nonce: this.nonce, caseId: this.caseId, id: registered.id, email: actual.body.email });
        const result = await this.admin(`/admin/users/${registered.id}`, undefined, 'DELETE');
        if (result.status !== 200 && result.status !== 204) throw new Error('Provider deletion unconfirmed.');
        await this.receipt({ action: 'identity_cleanup', id: registered.id, outcome: 'deletion_confirmed' });
      } catch { failures.push({ action: 'identity_cleanup', id: registered.id, outcome: 'unknown_or_identity_refused' }); }
    }
    for (const email of this.intents) {
      if (![...this.identities.values()].some(value => value.email === email)) failures.push({ action: 'unregistered_create_intent', outcome: 'unknown_not_deleted' });
    }
    await this.receipt({ action: 'cleanup_summary', nonce: this.nonce, caseId: this.caseId,
      outcome: failures.length ? 'incomplete' : 'confirmed', registeredIdentities: this.identities.size, failures });
    assert.equal(failures.length, 0, `Owned cleanup incomplete; retained sanitized receipts: ${this.reportDirectory}`);
  }
}

type SessionIdentity = 'owner' | 'member' | 'unadmitted' | 'disabled';
type SessionTokens = { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } };
type SessionMe = components['schemas']['AppMe'];
type SessionMember = components['schemas']['AppMemberResult'];
type SessionInvitation = components['schemas']['AppInvitationResult'];
type FixtureControl = Record<string, unknown>;

// Test-only support shared by focused BE acceptance and the separately leased browser phase.
// This is never imported by the application or exposed on an application HTTP route.
export async function createSessionSupport(directory: string, expectedNonce: string, publish = false) {
  assert.equal(process.env.F006_ALLOW_OWNED_FIXTURE, 'true', 'Explicit006 owned-resource opt-in required.');
  assert.match(expectedNonce, /^[a-f0-9]{32}$/);
  const profile = fixtureProfile();
  assert.ok(!publish || !profile.timebox, 'Timeboxed fixture cannot be leased to the normal browser journey.');
  const prefix = join(await realpath(tmpdir()), profile.prefix);
  assert.ok(directory.startsWith(prefix) && await realpath(directory) === directory);
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  async function privateJson(name: string) {
    const file = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      assert.ok(stat.isFile() && stat.uid === process.getuid!() && (stat.mode & 0o777) === 0o600 && stat.size < 65536);
      try { return JSON.parse(await file.readFile('utf8')) as Record<string, string>; }
      catch { throw new Error('Owned fixture JSON could not be parsed; contents suppressed.'); }
    } finally { await file.close(); }
  }
  const state = await privateJson('state.json');
  assert.equal(state.project, profile.project);
  assert.equal(state.profile ?? '006', profile.name);
  assert.equal(state.timebox ?? 'false', String(profile.timebox));
  assert.equal(state.nonce, expectedNonce);
  assert.match(state.database!, /^f005_[a-f0-9]{32}$/);
  const env = await privateJson('test-env.json');
  assert.equal(env.F005_RUN_NONCE, expectedNonce);
  assert.equal(env.F005_FIXTURE_DIRECTORY, directory);
  assert.ok(env.F005_DATABASE_URL === `postgresql://f005_fixture_admin:synthetic_f005_admin_only@127.0.0.1:${profile.databasePort}/${state.database}`,
    'Fixture database target does not match the owned marker.');
  const database = parseMigrationConfig({ DATABASE_URL: env.F005_DATABASE_URL });
  // Borrow short-lived connections: the owned tunnel deliberately bounds idle/total socket lifetime.
  const admin = new Pool({ ...database, max: 1, min: 0, idleTimeoutMillis: 1000 });
  let adminDisconnects = 0;
  admin.on('error', () => { adminDisconnects++; });
  const authOrigin = `http://127.0.0.1:${profile.authPort}`;
  const apiOrigin = `http://127.0.0.1:${profile.apiPort}`;
  const webOrigin = `http://127.0.0.1:${profile.webPort}`;
  const technicalKey = randomBytes(32).toString('hex');
  const workspaceId = randomUUID();
  const identities = {} as Record<SessionIdentity, { email: string; password: string; userId: string }>;
  const handles = new Map<string, string>();
  let stage = 'owned lifecycle guard';
  let lifecycle: OwnedFixtureLifecycle | undefined;
  let app: Awaited<ReturnType<typeof createApplication>> | undefined;
  let socket: ReturnType<typeof createServer> | undefined;
  let pausedAuth: string | undefined;
  let lockedDatabase = false;
  let lockClient: PoolClient | undefined;
  let wrongTechnicalKey = false;
  let closed = false;
  let published = false;
  const socketPath = join(directory, 's006.sock');
  const configPath = join(directory, 'fe-session.json');

  async function auth<T>(path: string, body?: object, bearer?: string, method?: string) {
    const response = await fetch(authOrigin + path, {
      method: method ?? (body ? 'POST' : 'GET'), redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Connection: 'close', apikey: 'synthetic-api-key', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = response.status === 204 ? '' : await boundedText(response, 65536);
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
  }
  // Fault tests deliberately restart the owned listener; do not reuse a socket from its previous lifetime.
  async function api<T>(path: string, tokens: SessionTokens, body?: object, method?: string) {
    const response = await fetch(apiOrigin + '/v1/app' + path, {
      method: method ?? (body ? 'POST' : 'GET'), redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Connection: 'close', Authorization: `Bearer ${technicalKey}`, 'X-App-Access-Token': tokens.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: JSON.parse(await boundedText(response, 65536)) as T };
  }
  async function login(label: SessionIdentity) {
    const identity = identities[label];
    assert.ok(identity, 'Unknown006 fixture identity.');
    const result = await auth<SessionTokens>('/token?grant_type=password', { email: identity.email, password: identity.password });
    assert.equal(result.status, 200, 'Synthetic password grant failed.');
    assert.equal(result.body.user.id, identity.userId);
    assert.equal(result.body.expires_in, 300, 'Record actual provider expiry; never forge a shorter JWT.');
    return result.body;
  }
  const runtime = {
    API_RUNTIME: 'local', DATABASE_URL: `postgresql://app_runtime:synthetic_f005_runtime_only@127.0.0.1:${profile.databasePort}/${state.database}`,
    APP_FOUNDATION_ENABLED: 'true', APP_WORKSPACE_ID: workspaceId, APP_AUTH_URL: authOrigin,
    APP_AUTH_API_KEY: 'synthetic-api-key', APP_EMAIL_ENABLED: 'true', APP_AUTH_ADMIN_KEY: env.F005_AUTH_ADMIN_KEY!,
    PREVIEW_ACCESS_KEY: technicalKey, BROWSER_ORIGIN: webOrigin,
  };
  async function startApi() {
    assert.ok(!app);
    const next = await createApplication(parseConfig({ ...runtime,
      PREVIEW_ACCESS_KEY: wrongTechnicalKey ? randomBytes(32).toString('hex') : technicalKey }));
    try { await next.listen(profile.apiPort, '127.0.0.1'); app = next; }
    catch (error) { await next.close(); throw error; }
  }
  function docker(args: string[]) {
    const host = process.env.DOCKER_HOST ?? 'unix:///var/run/docker.sock';
    assert.ok(host.startsWith('unix:///') && !host.includes('\n'));
    const result = spawnSync('docker', ['--config', join(directory, 'docker'), ...args], {
      env: { PATH: process.env.PATH, HOME: directory, DOCKER_HOST: host },
      encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 0, 'Owned fixture Docker operation failed; raw output suppressed.');
    return result.stdout.trim();
  }
  function authContainer() {
    const id = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${profile.project}`,
      '--filter', 'label=com.docker.compose.service=auth', '--filter', `label=esty005.run=${expectedNonce}`]);
    assert.match(id, /^[a-f0-9]{12,64}$/);
    const labels = JSON.parse(docker(['inspect', '--format', '{{json .Config.Labels}}', id])) as Record<string, string>;
    assert.equal(labels['esty005.run'], expectedNonce);
    assert.equal(labels['com.docker.compose.project'], profile.project);
    assert.equal(labels['com.docker.compose.service'], 'auth');
    return id;
  }
  async function fault(target: string, active: boolean) {
    if (target === 'database') {
      if (active && !lockedDatabase) {
        await lifecycle!.guard();
        const connection = await admin.connect();
        try {
          await connection.query("BEGIN; SET LOCAL lock_timeout='500ms'; LOCK TABLE app_private.workspaces IN ACCESS EXCLUSIVE MODE");
          lockClient = connection; lockedDatabase = true;
        } catch (error) {
          await connection.query('ROLLBACK').catch(() => {}); connection.release(true); throw error;
        }
      } else if (!active && lockedDatabase) {
        const connection = lockClient!;
        lockClient = undefined; lockedDatabase = false;
        try { await connection.query('ROLLBACK'); connection.release(); }
        catch (error) { connection.release(true); throw error; }
      }
    } else if (target === 'auth') {
      if (active && !pausedAuth) { const id = authContainer(); docker(['pause', id]); pausedAuth = id; }
      else if (!active && pausedAuth) {
        assert.equal(authContainer(), pausedAuth);
        docker(['unpause', pausedAuth]); pausedAuth = undefined;
      }
    } else if (target === 'api') {
      if (active && app) { const current = app; app = undefined; await current.close(); }
      else if (!active && !app) await startApi();
    } else if (target === 'technical-key') {
      if (wrongTechnicalKey !== active) {
        assert.ok(app, 'Restore API before changing its fixture key.');
        const current = app; app = undefined; await current.close();
        wrongTechnicalKey = active; await startApi();
      }
    } else throw new Error('Unsupported fixture fault.');
    return { target, active };
  }
  async function setMember(target: 'member' | 'disabled', change: { role?: 'owner' | 'member'; status?: 'active' | 'disabled' }) {
    const owner = await login('owner');
    const team = await api<components['schemas']['AppMemberPage']>('/team', owner);
    assert.equal(team.status, 200);
    const current = team.body.items.find(member => member.userId === identities[target].userId);
    assert.ok(current);
    const result = await api<SessionMember>(`/team/${current.userId}`, owner, { ...change, revision: current.revision }, 'PATCH');
    assert.equal(result.status, 200);
    return { role: result.body.member.role, status: result.body.member.status, revision: result.body.member.revision };
  }
  async function remember(token: string) {
    assert.ok(token.length <= 8192 && handles.size < 64);
    const user = await auth<{ id: string }>('/user', undefined, token);
    assert.equal(user.status, 200);
    assert.ok(Object.values(identities).some(identity => identity.userId === user.body.id), 'Only this run/case identities may be registered.');
    const handle = randomUUID(); handles.set(handle, token);
    return { handle };
  }
  async function control(input: FixtureControl) {
    assert.equal(input.nonce, expectedNonce, 'Wrong fixture nonce.');
    assert.ok(!closed, 'Fixture is closed.');
    const fields: Record<string, string[]> = {
      status: [], 'set-member': ['target', 'role', 'status'], 'register-session': ['accessToken'],
      'issue-session': ['identity'], replay: ['handle'], fault: ['target', 'active'],
    };
    const operation = input.operation;
    assert.ok(typeof operation === 'string' && Object.hasOwn(fields, operation));
    assert.ok(Object.keys(input).every(key => ['nonce', 'operation', ...fields[operation]!].includes(key)));
    if (operation === 'status') return { nonce: expectedNonce, purpose: profile.purpose, profile: profile.name, apiListening: Boolean(app),
      databaseFault: lockedDatabase, authFault: Boolean(pausedAuth), technicalKeyFault: wrongTechnicalKey,
      jwtExpirySeconds: 300, adminDisconnects, pid: process.pid };
    if (operation === 'set-member') {
      assert.ok(input.target === 'member' || input.target === 'disabled');
      assert.ok(input.role === undefined || input.role === 'owner' || input.role === 'member');
      assert.ok(input.status === undefined || input.status === 'active' || input.status === 'disabled');
      assert.ok(input.role !== undefined || input.status !== undefined);
      return setMember(input.target, { ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}) });
    }
    if (operation === 'register-session') {
      assert.equal(typeof input.accessToken, 'string');
      return remember(input.accessToken as string);
    }
    if (operation === 'issue-session') {
      assert.ok(typeof input.identity === 'string' && Object.hasOwn(identities, input.identity));
      return remember((await login(input.identity as SessionIdentity)).access_token);
    }
    if (operation === 'replay') {
      assert.equal(typeof input.handle, 'string');
      const token = handles.get(input.handle as string); assert.ok(token);
      const response = await fetch(apiOrigin + '/v1/app/me', { signal: AbortSignal.timeout(10000), redirect: 'error',
        headers: { Connection: 'close', Authorization: `Bearer ${technicalKey}`, 'X-App-Access-Token': token } });
      const body = JSON.parse(await boundedText(response, 65536)) as { code?: string };
      return { status: response.status, ...(typeof body.code === 'string' ? { code: body.code } : {}) };
    }
    assert.equal(typeof input.target, 'string'); assert.equal(typeof input.active, 'boolean');
    return fault(input.target as string, input.active as boolean);
  }
  let controlQueue = Promise.resolve();
  async function close() {
    if (closed) return;
    closed = true;
    if (socket) {
      const ended = once(socket, 'close'); socket.close(); socket.closeAllConnections(); await ended;
    }
    await controlQueue;
    try {
      if (pausedAuth) await fault('auth', false);
      if (lockedDatabase) await fault('database', false);
      if (app) { const current = app; app = undefined; await current.close(); }
    } finally {
      try { if (lifecycle) await lifecycle.cleanup(workspaceId); }
      finally {
        await admin.end(); handles.clear();
        if (published) await unlink(configPath);
      }
    }
  }
  try {
    lifecycle = await OwnedFixtureLifecycle.create(expectedNonce, state.database!, admin,
      <T>(path: string, body?: object, method?: string) => auth<T>(path, body, env.F005_AUTH_ADMIN_KEY!, method));
    stage = 'owned app migrations';
    const migrated = await runMigrations(database);
    assert.equal(migrated.database_outcome, 'committed');
    await admin.query('REVOKE SELECT(id,user_id,not_after) ON auth.sessions FROM app_runtime');
    stage = 'canonical API bind';
    await startApi();
    stage = 'owned provider identities';
    for (const label of ['owner', 'member', 'unadmitted', 'disabled'] as const) {
      const email: string = lifecycle.address(label);
      const password = 'Aa1!' + randomBytes(24).toString('base64url');
      await lifecycle.intent(email);
      const created: { status: number; body: { id: string } } = await auth('/admin/users', {
        email, password, email_confirm: true, user_metadata: lifecycle.metadata,
      }, env.F005_AUTH_ADMIN_KEY!);
      assert.equal(created.status, 200);
      await lifecycle.register(email, created.body.id);
      identities[label] = { email, password, userId: created.body.id };
    }
    stage = 'controlled owner bootstrap';
    const bootstrap = spawnSync(process.execPath, [new URL('../scripts/bootstrap-app-owner.js', import.meta.url).pathname, 'bootstrap'], {
      env: { APP_OPERATOR_TARGET: 'local',
        APP_OPERATOR_DATABASE_URL: `postgresql://app_operator:synthetic_f005_operator_only@127.0.0.1:${profile.databasePort}/${state.database}`,
        APP_OPERATOR_AUTH_KEY: env.F005_AUTH_ADMIN_KEY!, APP_OPERATOR_CONFIRM_WORKSPACE: workspaceId,
        APP_OPERATOR_APPROVAL_ID: randomUUID(), APP_OPERATOR_USER_ID: identities.owner.userId,
        APP_OPERATOR_PROFILE_NAME: 'Synthetic006 Owner', APP_OPERATOR_WORKSPACE_NAME: 'Synthetic006 Workspace',
        APP_WORKSPACE_ID: workspaceId, APP_AUTH_URL: authOrigin, APP_AUTH_API_KEY: 'synthetic-api-key', BROWSER_ORIGIN: webOrigin },
      encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(bootstrap.status, 0, 'Controlled synthetic bootstrap failed; raw output suppressed.');
    stage = 'browser membership seed';
    const owner = await login('owner');
    for (const label of ['member', 'disabled'] as const) {
      const offer = await api<SessionInvitation>('/invitations', owner,
        { email: identities[label].email, idempotencyKey: randomUUID() });
      assert.equal(offer.status, 200);
      const accepted = await api<SessionMember>(`/invitations/${offer.body.invitation.id}/accept`, await login(label),
        { displayName: `Synthetic006 ${label}` });
      assert.equal(accepted.status, 200);
    }
    await setMember('disabled', { status: 'disabled' });
    assert.equal((await api<SessionMe>('/me', owner)).status, 200);
    if (publish) {
      stage = 'private control and config handoff';
      assert.ok(Buffer.byteLength(socketPath) < 104, 'Owned control socket path exceeds the platform limit.');
      socket = createServer((request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        const work = async () => {
          try {
            assert.equal(request.method, 'POST'); assert.equal(request.url, '/');
            assert.equal(request.headers['content-type'], 'application/json');
            let body = '';
            for await (const chunk of request) {
              body += chunk.toString();
              assert.ok(Buffer.byteLength(body) <= 16384);
            }
            const input: unknown = JSON.parse(body);
            assert.ok(input && typeof input === 'object' && !Array.isArray(input));
            const result = await control(input as FixtureControl);
            response.end(JSON.stringify(result));
          } catch {
            response.statusCode = 400;
            response.end('{"code":"fixture_control_failed"}');
          }
        };
        controlQueue = controlQueue.then(work, work);
      });
      socket.requestTimeout = 15000; socket.headersTimeout = 5000;
      socket.listen(socketPath);
      await once(socket, 'listening');
      await chmod(socketPath, 0o600);
      const handoff = {
        version: 1, nonce: expectedNonce, purpose: profile.purpose, profile: profile.name, jwtExpirySeconds: 300,
        webEnv: { APP_ORIGIN: webOrigin, APP_API_ORIGIN: apiOrigin, APP_AUTH_URL: authOrigin, APP_SESSION_MODE: 'local',
          APP_API_TECHNICAL_KEY: technicalKey, APP_AUTH_API_KEY: 'synthetic-api-key',
          APP_SESSION_COOKIE_KEY: randomBytes(32).toString('base64url') },
        identities, control: { socketPath, nonce: expectedNonce },
      };
      const file = await open(configPath, 'wx', 0o600);
      published = true;
      try { await file.writeFile(JSON.stringify(handoff)); await file.sync(); } finally { await file.close(); }
    }
    return { nonce: expectedNonce, configPath: publish ? configPath : undefined, socketPath: publish ? socketPath : undefined,
      reportDirectory: lifecycle.reportDirectory, identities, login, auth, api, control, close };
  } catch (error) {
    try { await close(); }
    catch { throw new Error(`Owned006 fixture failed at ${stage}; cleanup unconfirmed, retain owned receipts.`); }
    throw new Error(`Owned006 fixture failed at ${stage}; owned cleanup completed; raw provider/credential output suppressed.`,
      { cause: error instanceof Error ? error.name : 'unknown' });
  }
}
