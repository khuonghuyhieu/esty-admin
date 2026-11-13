import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import { diagnoseRoleAuthority, inspectRolePrivilegeBaseline } from '../scripts/activation-diagnostic.js';
import { activationSchema } from '../src/config/schema-transition.js';
import target from '../config/hosted-target.example.json' with { type: 'json' };
import { inspectRecoveredAppRoles } from '../scripts/app-roles.js';
import type { AppRoleInputs } from '../scripts/app-roles.js';

const secret = 'synthetic-password-URL-query-server-value-must-not-escape';
function authority(): ClientConfig {
  return { host: target.SUPABASE_SESSION_HOST, port: 5432, user: target.SUPABASE_DATABASE_USER,
    database: target.SUPABASE_DATABASE_NAME, password: secret,
    ssl: { rejectUnauthorized: true, servername: target.SUPABASE_SESSION_HOST } };
}
function peer(t: TestContext, response?: (text: string) => unknown[] | Promise<unknown[]> | undefined) {
  const connections: Client[] = [], queries: string[] = [];
  let closed = 0;
  t.mock.method(Client.prototype, 'connect', async function(this: Client) { connections.push(this); return this; });
  t.mock.method(Client.prototype, 'end', async () => { closed++; });
  t.mock.method(Client.prototype, 'query', async (text: string) => {
    queries.push(text);
    const replacement = response?.(text);
    const rows = replacement !== undefined ? await replacement
      : text.startsWith('SELECT current_user') ? [{ user_matches: true, database_matches: true, read_only: true }]
      : text.startsWith('SELECT name') ? activationSchema.oldNames.map(name => ({ name }))
      : text.includes('AS can_create_roles') ? [{ can_create_roles: true, can_create_schema: true }]
      : text.includes('AS columns_match') ? [{ columns_match: true }]
      : [];
    return { rows };
  });
  return { connections, queries, closed: () => closed };
}
test('role diagnostic uses only authority and rolls back without any write or user-data query', async t => {
  const p = peer(t), result = await diagnoseRoleAuthority(authority(), new AbortController().signal);
  assert.deepEqual(result, { stage: 'complete', category: 'passed', sqlstate: null });
  assert.equal(p.connections.length, 1); assert.equal(p.connections[0]!.user, target.SUPABASE_DATABASE_USER);
  assert.equal(p.connections[0]!.host, target.SUPABASE_SESSION_HOST); assert.equal(p.connections[0]!.port, 5432);
  assert.equal(p.closed(), 1); assert.equal(p.queries[0], 'BEGIN READ ONLY'); assert.equal(p.queries.at(-1), 'ROLLBACK');
  assert.equal(p.queries.length, 6);
  for (const sql of p.queries) {
    assert.match(sql, /^(BEGIN READ ONLY|ROLLBACK|SELECT )/);
    assert.doesNotMatch(sql, /;\s*\S|FROM auth\.(sessions|users)|app_private\.|\b(set_config|dblink|lo_import)\s*\(/);
  }
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
});
test('role diagnostic refuses endpoint, role and TLS drift before connecting', async t => {
  const p = peer(t);
  for (const changed of [{ host: '127.0.0.1' }, { port: 6543 }, { database: 'other' }, { user: 'app_operator' },
    { user: 'app_runtime.eotmpaliqcxxcotrcols' }, { ssl: false }, { ssl: { rejectUnauthorized: false } },
    { ssl: { rejectUnauthorized: true, servername: 'other.example' } }, { password: undefined }]) {
    assert.deepEqual(await diagnoseRoleAuthority({ ...authority(), ...changed }, new AbortController().signal),
      { stage: 'configuration', category: 'refused', sqlstate: null });
  }
  assert.equal(p.connections.length, 0); assert.equal(p.closed(), 0);
});
test('role diagnostic refuses identity, non-OLD history and prerequisite differences', async t => {
  const cases: Array<[string, string, unknown[]]> = [
    ['identity', 'SELECT current_user', [{ user_matches: false, database_matches: true, read_only: true }]],
    ['identity', 'SELECT current_user', [{ user_matches: true, database_matches: true, read_only: false }]],
    ['identity', 'SELECT current_user', [{ user_matches: true, database_matches: false, read_only: true }]],
    ['history', 'SELECT name', []], ['history', 'SELECT name', [{ name: secret }]],
    ['history', 'SELECT name', activationSchema.targetNames.map(name => ({ name }))],
    ['privileges', 'SELECT (rolsuper', [{ can_create_roles: false, can_create_schema: true }]],
    ['privileges', 'SELECT (rolsuper', [{ can_create_roles: true, can_create_schema: false }]],
    ['auth_sessions', 'SELECT count', [{ columns_match: false }]],
    ['auth_sessions', 'SELECT count', [{ columns_match: null }]],
  ];
  for (const [stage, prefix, rows] of cases) await t.test(stage, async child => {
    const p = peer(child, sql => sql.startsWith(prefix) ? rows : undefined);
    assert.deepEqual(await diagnoseRoleAuthority(authority(), new AbortController().signal), { stage, category: 'refused', sqlstate: null });
    assert.equal(p.closed(), 1); assert.equal(p.queries.at(-1), 'ROLLBACK');
    assert.equal(p.connections.length, 1);
  });
});
test('role diagnostic allowlists error categories and SQLSTATE without invoking arbitrary getters', async t => {
  const cases: Array<[unknown, string, string | null]> = [
    [Object.assign(new Error(secret), { code: '28P01', detail: secret, query: secret }), 'authentication_error', '28P01'],
    [Object.assign(new Error(secret), { code: '42501' }), 'database_error', '42501'],
    [Object.assign(new Error(secret), { code: '57014' }), 'database_error', '57014'],
    [Object.assign(new Error(secret), { code: 'CERT_HAS_EXPIRED' }), 'tls_error', null],
    [Object.assign(new Error(secret), { code: 'ECONNREFUSED' }), 'connection_error', null],
    [Object.assign(new Error(secret), { code: 'P0001' }), 'unexpected_error', null],
    [Object.assign(new Error(secret), { code: '28P01\n' + secret }), 'unexpected_error', null],
    [Object.defineProperty({}, 'code', { get() { throw new Error(secret); } }), 'unexpected_error', null],
    [new Proxy({}, { getPrototypeOf() { throw new Error(secret); }, getOwnPropertyDescriptor() { throw new Error(secret); } }), 'unexpected_error', null],
    [secret, 'unexpected_error', null],
  ];
  for (const [error, category, sqlstate] of cases) await t.test(category, async child => {
    const p = peer(child);
    child.mock.method(Client.prototype, 'connect', async () => { throw error; });
    assert.deepEqual(await diagnoseRoleAuthority(authority(), new AbortController().signal), { stage: 'connect', category, sqlstate });
    assert.equal(p.closed(), 1); assert.deepEqual(p.queries, []);
  });
});
test('role diagnostic bounds connect and query stalls and closes after the deadline', async t => {
  for (const mode of ['connect', 'query'] as const) await t.test(mode, async child => {
    child.mock.timers.enable({ apis: ['setTimeout'] });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const p = peer(child, sql => {
      if (mode === 'query' && sql.startsWith('SELECT current_user')) { entered(); return new Promise(() => {}); }
      return undefined;
    });
    if (mode === 'connect') child.mock.method(Client.prototype, 'connect', () => { entered(); return new Promise(() => {}); });
    const result = diagnoseRoleAuthority(authority(), new AbortController().signal);
    await started; child.mock.timers.tick(mode === 'connect' ? 1000 : 12000);
    assert.deepEqual(await result, { stage: mode === 'connect' ? 'connect' : 'identity', category: 'timeout', sqlstate: null });
    assert.equal(p.closed(), 1);
    if (mode === 'query') assert.equal(p.queries.at(-1), 'ROLLBACK');
  });
});
test('role diagnostic aborts pending work without leaking the abort reason or reading further', async t => {
  const abort = new AbortController();
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const p = peer(t, sql => {
    if (sql.startsWith('SELECT name')) { entered(); return new Promise(() => {}); }
    return undefined;
  });
  const result = diagnoseRoleAuthority(authority(), abort.signal);
  await started; abort.abort(new Error(secret));
  assert.deepEqual(await result, { stage: 'history', category: 'aborted', sqlstate: null });
  assert.equal(p.queries.at(-1), 'ROLLBACK'); assert.equal(p.closed(), 1);
  assert.equal(p.queries.some(sql => sql.includes('AS can_create_roles')), false);
  assert.deepEqual(await diagnoseRoleAuthority(authority(), abort.signal), { stage: 'configuration', category: 'aborted', sqlstate: null });
  assert.equal(p.connections.length, 1);
});
test('role diagnostic never reports PASS if rollback or bounded close fails', async t => {
  await t.test('rollback', async child => {
    const p = peer(child, sql => { if (sql === 'ROLLBACK') throw Object.assign(new Error(secret), { code: '08006' }); return undefined; });
    assert.deepEqual(await diagnoseRoleAuthority(authority(), new AbortController().signal),
      { stage: 'rollback', category: 'database_error', sqlstate: '08006' });
    assert.equal(p.closed(), 1);
  });
  await t.test('close', async child => {
    child.mock.timers.enable({ apis: ['setTimeout'] });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), p = peer(child);
    child.mock.method(Client.prototype, 'end', () => { entered(); return new Promise(() => {}); });
    const result = diagnoseRoleAuthority(authority(), new AbortController().signal);
    await started; child.mock.timers.tick(1000);
    assert.deepEqual(await result, { stage: 'close', category: 'timeout', sqlstate: null });
    assert.equal(p.connections[0]!.connection.stream.destroyed, true);
  });
});

function recoveredInputs(): AppRoleInputs {
  return { authority: authority(), runtime: { ...authority(), user: 'app_runtime.eotmpaliqcxxcotrcols', password: 'synthetic-runtime' },
    operator: { ...authority(), user: 'app_operator.eotmpaliqcxxcotrcols', password: 'synthetic-operator' },
    approvalId: '00000000-0000-4000-8000-000000000001', target: 'supabase:eotmpaliqcxxcotrcols' };
}
test('recovered role inspection distinguishes committed absent partial and unavailable without database writes', async t => {
  for (const scenario of ['committed', 'absent', 'partial', 'privilege', 'history', 'authentication', 'tls', 'cleanup'] as const) {
    await t.test(scenario, async sub => {
      const queries: string[] = [], connections: Client[] = [];
      sub.mock.method(Client.prototype, 'connect', async function(this: Client) {
        connections.push(this);
        if (scenario === 'tls') throw Object.assign(new Error(secret), { code: 'CERT_HAS_EXPIRED' });
        if (scenario === 'authentication' && this.user?.startsWith('app_')) throw Object.assign(new Error(secret), { code: '28P01' });
      });
      sub.mock.method(Client.prototype, 'end', async () => {});
      sub.mock.method(Client.prototype, 'query', async function(this: Client, text: string) {
        queries.push(text);
        assert.match(text, /^(SELECT |BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/);
        if (scenario === 'cleanup' && text === 'ROLLBACK') throw Object.assign(new Error(secret), { code: 'ECONNRESET' });
        let rows: unknown[] = [];
        if (text.startsWith('SELECT current_user')) rows = [{ name: this.user?.split('.')[0], database: 'postgres', read_only: 'on' }];
        else if (text.startsWith('SELECT name FROM')) rows = scenario === 'history' ? [] : activationSchema.oldNames.map(name => ({ name }));
        else if (text.startsWith('SELECT rolname')) rows = (scenario === 'absent' ? [] : scenario === 'partial' ? ['app_runtime'] : ['app_operator', 'app_runtime'])
          .map(rolname => ({ rolname, rolcanlogin: true, rolinherit: false, rolsuper: false, rolcreatedb: false,
            rolcreaterole: false, rolreplication: false, rolbypassrls: false, unlimited_validity: true }));
        else if (text.includes('FROM pg_namespace WHERE') && scenario === 'privilege') rows = [{ nspname: 'public', can_create: true }];
        else if (text.startsWith('SELECT has_database_privilege')) rows = [{ can_create: false, is_owner: false }];
        return { rows, rowCount: rows.length };
      });
      const result = await inspectRecoveredAppRoles(recoveredInputs(), AbortSignal.timeout(5000));
      const expected = scenario === 'committed' ? ['complete', 'passed', 'committed']
        : scenario === 'absent' ? ['complete', 'passed', 'absent']
        : scenario === 'partial' ? ['roles', 'refused', 'partial_or_unexpected']
        : scenario === 'privilege' ? ['privileges', 'refused', 'partial_or_unexpected']
        : scenario === 'history' ? ['history', 'refused', 'partial_or_unexpected']
        : scenario === 'authentication' ? ['credentials', 'authentication_error', 'unavailable']
        : scenario === 'tls' ? ['connect', 'tls_error', 'unavailable'] : ['rollback', 'connection_error', 'unavailable'];
      assert.deepEqual([result.stage, result.category, result.roles], expected);
      for (const client of connections) {
        const parameters = Reflect.get(client, 'connectionParameters') as { options: string };
        assert.equal(parameters.options, '-c search_path=pg_catalog -c default_transaction_read_only=on');
      }
      assert.equal(connections.length, scenario === 'committed' || scenario === 'cleanup' ? 3 : scenario === 'authentication' ? 2 : 1);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
      if (scenario !== 'tls') assert.equal(queries.at(-1), 'ROLLBACK');
    });
  }
});
test('recovered role inspection times out and classifies hostile errors without exposing their properties', async t => {
  for (const scenario of ['timeout', 'hostile'] as const) await t.test(scenario, async sub => {
    sub.mock.timers.enable({ apis: ['setTimeout'] });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    sub.mock.method(Client.prototype, 'connect', () => {
      entered();
      if (scenario === 'hostile') throw new Proxy({}, { getPrototypeOf() { throw new Error(secret); }, getOwnPropertyDescriptor() { throw new Error(secret); } });
      return new Promise(() => {});
    });
    sub.mock.method(Client.prototype, 'end', async () => {});
    const promise = inspectRecoveredAppRoles(recoveredInputs(), new AbortController().signal);
    await started; if (scenario === 'timeout') sub.mock.timers.tick(1000);
    assert.deepEqual(await promise, { stage: 'connect', category: scenario === 'timeout' ? 'timeout' : 'unexpected_error', roles: 'unavailable' });
  });
});

test('PUBLIC baseline preserves guard conflicts separately from future defaults and never claims historical attribution', async t => {
  for (const scenario of ['baseline', 'present', 'history', 'unknown-code', 'raw-field', 'oversized', 'duplicate', 'cleanup', 'sql-error'] as const) await t.test(scenario, async sub => {
    let baselineQueries = 0, connections = 0;
    sub.mock.method(Client.prototype, 'connect', async function(this: Client) {
      connections++;
      assert.equal((Reflect.get(this, 'connectionParameters') as { options: string }).options,
        '-c search_path=pg_catalog -c default_transaction_read_only=on');
    });
    sub.mock.method(Client.prototype, 'end', async () => {});
    const statements: string[] = [];
    sub.mock.method(Client.prototype, 'query', async (text: string) => {
      statements.push(text);
      assert.match(text, /^(SELECT |WITH namespaces AS|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/);
      let rows: unknown[] = [];
      if (text.startsWith('SELECT current_user')) rows = [{ name: authority().user!.split('.')[0], database: authority().database, read_only: 'on' }];
      else if (text.startsWith('SELECT name')) rows = scenario === 'history' ? [] : activationSchema.oldNames.map(name => ({ name }));
      else if (text.startsWith('SELECT to_regrole')) rows = [{ roles_absent: scenario !== 'present' }];
      else if (text.startsWith('WITH namespaces')) {
        baselineQueries++;
        if (scenario === 'sql-error') throw Object.assign(new Error(secret), { code: '42501', detail: secret });
        const item = { predicate: 'public_function_execute', scope: 'other_schema', schema_usage: false };
        rows = scenario === 'unknown-code' ? [{ ...item, predicate: secret }]
          : scenario === 'raw-field' ? [{ ...item, object_name: secret }]
          : scenario === 'oversized' ? Array(65).fill(item)
          : scenario === 'duplicate' ? [item, item]
          : [item, { predicate: 'future_function_grant', scope: 'global', schema_usage: null }];
      } else if (text === 'ROLLBACK' && scenario === 'cleanup') throw Object.assign(new Error(secret), { code: 'ECONNRESET' });
      return { rows, rowCount: rows.length };
    });
    const result = await inspectRolePrivilegeBaseline(authority(), AbortSignal.timeout(10000));
    assert.equal(result.basis, 'current-public-baseline'); assert.equal(result.historicalPredicate, 'unresolved');
    assert.equal(connections, 1); assert.equal(statements.at(-1), 'ROLLBACK');
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    if (scenario === 'baseline') {
      assert.equal(result.category, 'passed');
      assert.deepEqual(result.observations, [
        { predicate: 'public_function_execute', scope: 'other_schema', schemaUsage: false, kind: 'guard-conflict' },
        { predicate: 'future_function_grant', scope: 'global', schemaUsage: null, kind: 'future-default-only' },
      ]);
    } else {
      assert.deepEqual(result.observations, []);
      assert.equal(result.category, scenario === 'cleanup' ? 'connection_error' : scenario === 'sql-error' ? 'database_error' : 'refused');
      if (scenario === 'sql-error') assert.equal(result.sqlstate, '42501');
    }
    if (scenario === 'present' || scenario === 'history') assert.equal(baselineQueries, 0);
  });
});
