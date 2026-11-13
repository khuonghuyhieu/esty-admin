import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { AppRoleError, inspectAppRoles } from '../scripts/app-roles.js';
import type { AppRoleInputs } from '../scripts/app-roles.js';

test('PostgreSQL17 role ACL reachability preserves private policies and sequence controls', {
  skip: !process.env.ROLE_REACHABILITY_POSTGRES_BIN, timeout: 60000,
}, async t => {
  const bin = process.env.ROLE_REACHABILITY_POSTGRES_BIN!;
  // A private short Unix-socket path avoids TCP listeners and every shared fixture.
  const root = mkdtempSync(join(realpathSync('/tmp'), 'esty-role-reachability-'));
  const data = join(root, 'data');
  const env = { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, LC_ALL: 'C' };
  let started = false;
  let admin: Client | undefined, runtime: Client | undefined;
  const command = (name: string, args: string[]) => {
    const result = spawnSync(join(bin, name), args, { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `Owned PostgreSQL ${name} operation failed; output withheld.`);
    return result.stdout;
  };
  t.after(async () => {
    try { await runtime?.end(); } finally {
      try { await admin?.end(); } finally {
        if (started) command('pg_ctl', ['-D', data, '-w', '-t', '10', '-m', 'fast', 'stop']);
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
  assert.match(command('postgres', ['--version']), /^postgres \(PostgreSQL\) 17\./);
  command('initdb', ['-D', data, '--username=fixture', '--auth=trust', '--no-locale', '--encoding=UTF8', '--no-sync']);
  command('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-w', '-t', '10',
    '-o', `-c listen_addresses='' -c unix_socket_directories=${root} -p 55432`, 'start']);
  started = true;
  const config = { host: root, port: 55432, database: 'postgres', user: 'fixture',
    connectionTimeoutMillis: 1000, statement_timeout: 3000, query_timeout: 5000 };
  admin = new Client(config); await admin.connect();
  assert.deepEqual((await admin.query("SELECT current_setting('listen_addresses') AS listeners")).rows, [{ listeners: '' }]);
  await admin.query(`CREATE ROLE app_runtime LOGIN NOINHERIT;
    CREATE ROLE app_operator LOGIN NOINHERIT;
    CREATE SCHEMA reachability_fixture;
    CREATE TABLE reachability_fixture.sample(value integer);
    CREATE SEQUENCE reachability_fixture.counter;
    CREATE FUNCTION reachability_fixture.definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
    REVOKE EXECUTE ON FUNCTION reachability_fixture.definer() FROM PUBLIC`);
  const inputs: AppRoleInputs = { authority: config, runtime: { ...config, user: 'app_runtime' },
    operator: { ...config, user: 'app_operator' }, approvalId: '00000000-0000-4000-8000-000000000000', target: 'local' };
  runtime = new Client(inputs.runtime); await runtime.connect();
  const inspect = (target = false) => inspectAppRoles(inputs, target, AbortSignal.timeout(10000));
  const rejected = (target = false) => assert.rejects(inspect(target), AppRoleError);
  const schemaAccess = async (expected: boolean) => assert.equal((await admin!.query(
    "SELECT has_schema_privilege('app_runtime','reachability_fixture','USAGE') AS allowed")).rows[0].allowed, expected);
  const denied = (sql: string) => assert.rejects(runtime!.query(sql), (error: { code?: string }) => error.code === '42501');

  for (const [kind, grant, revoke, sql] of [
    ['table', 'GRANT SELECT ON reachability_fixture.sample TO PUBLIC',
      'REVOKE SELECT ON reachability_fixture.sample FROM PUBLIC', 'SELECT value FROM reachability_fixture.sample'],
    ['column', 'GRANT SELECT(value) ON reachability_fixture.sample TO PUBLIC',
      'REVOKE SELECT(value) ON reachability_fixture.sample FROM PUBLIC', 'SELECT value FROM reachability_fixture.sample'],
    ['function', 'GRANT EXECUTE ON FUNCTION reachability_fixture.definer() TO PUBLIC',
      'REVOKE EXECUTE ON FUNCTION reachability_fixture.definer() FROM PUBLIC', 'SELECT reachability_fixture.definer()'],
  ]) await t.test(`${kind}: inaccessible PUBLIC grant passes; either role-specific USAGE rejects`, async () => {
    await admin!.query(grant!);
    try {
      await schemaAccess(false); await denied(sql!); await inspect();
      for (const role of ['app_runtime', 'app_operator']) {
        await admin!.query(`GRANT USAGE ON SCHEMA reachability_fixture TO ${role}`);
        try { await rejected(); }
        finally { await admin!.query(`REVOKE USAGE ON SCHEMA reachability_fixture FROM ${role}`); }
      }
    } finally { await admin!.query(revoke!); }
  });
  await t.test('inherited schema and forbidden object authority still rejects', async () => {
    await admin!.query(`CREATE ROLE reachability_parent;
      GRANT USAGE ON SCHEMA reachability_fixture TO reachability_parent;
      GRANT SELECT ON reachability_fixture.sample TO reachability_parent;
      GRANT reachability_parent TO app_runtime WITH INHERIT TRUE`);
    try {
      await schemaAccess(true);
      assert.equal((await admin!.query("SELECT has_table_privilege('app_runtime','reachability_fixture.sample','SELECT') AS allowed")).rows[0].allowed, true);
      await rejected();
    } finally {
      await admin!.query('REVOKE reachability_parent FROM app_runtime; DROP OWNED BY reachability_parent; DROP ROLE reachability_parent');
    }
  });
  await t.test('sequence OID operations remain reachable without schema USAGE', async () => {
    const oid = (await admin!.query("SELECT 'reachability_fixture.counter'::regclass::oid AS oid")).rows[0].oid;
    for (const [privilege, sql, expected] of [
      ['USAGE', 'SELECT nextval($1::regclass) AS value', '1'],
      ['SELECT', 'SELECT currval($1::regclass) AS value', '1'],
      ['UPDATE', 'SELECT setval($1::regclass,7) AS value', '7'],
    ]) {
      await admin!.query(`GRANT ${privilege} ON SEQUENCE reachability_fixture.counter TO PUBLIC`);
      try {
        await schemaAccess(false);
        assert.equal((await runtime!.query(sql!, [oid])).rows[0].value, expected);
        await rejected();
      } finally { await admin!.query(`REVOKE ${privilege} ON SEQUENCE reachability_fixture.counter FROM PUBLIC`); }
    }
  });
  for (const object of ['TABLE reachability_fixture.sample', 'FUNCTION reachability_fixture.definer()']) {
    await t.test(`${object}: ownership rejects even without schema USAGE`, async () => {
      await admin!.query(`ALTER ${object} OWNER TO app_runtime`);
      try { await schemaAccess(false); await rejected(); }
      finally { await admin!.query(`ALTER ${object} OWNER TO fixture`); }
    });
  }

  await admin.query(`CREATE TABLE public.foundation_migrations(id integer,name text);
    GRANT SELECT ON public.foundation_migrations TO app_runtime;
    CREATE SCHEMA app_private;
    GRANT USAGE ON SCHEMA app_private TO app_runtime,app_operator;
    CREATE TABLE app_private.profiles(display_name text,revision integer,updated_at timestamptz);
    CREATE TABLE app_private.workspaces(display_name text,revision integer,updated_at timestamptz);
    CREATE TABLE app_private.memberships(role_code text,status text,revision integer,updated_at timestamptz,disabled_at timestamptz);
    CREATE TABLE app_private.invitations(status text,delivery_state text,revision integer,accepted_at timestamptz,
      accepted_by_user_id uuid,revoked_at timestamptz,superseded_by_id uuid);
    CREATE TABLE app_private.audit_events(id uuid);
    GRANT SELECT ON ALL TABLES IN SCHEMA app_private TO app_runtime,app_operator;
    GRANT INSERT ON app_private.profiles,app_private.memberships,app_private.invitations,app_private.audit_events TO app_runtime;
    GRANT INSERT ON app_private.profiles,app_private.workspaces,app_private.memberships,app_private.audit_events TO app_operator;
    GRANT UPDATE(display_name,revision,updated_at) ON app_private.profiles,app_private.workspaces TO app_runtime;
    GRANT UPDATE(role_code,status,revision,updated_at,disabled_at) ON app_private.memberships TO app_runtime;
    GRANT UPDATE(status,delivery_state,revision,accepted_at,accepted_by_user_id,revoked_at,superseded_by_id) ON app_private.invitations TO app_runtime;
    GRANT UPDATE(display_name) ON app_private.workspaces TO app_operator;
    GRANT UPDATE(delivery_state,revision) ON app_private.invitations TO app_operator;
    CREATE FUNCTION app_private.has_current_session(session_uuid uuid,user_uuid uuid) RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT false';
    CREATE FUNCTION app_private.lock_membership_workspace() RETURNS integer LANGUAGE sql AS 'SELECT 1';
    CREATE FUNCTION app_private.require_active_owner() RETURNS integer LANGUAGE sql AS 'SELECT 1';
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app_private.has_current_session(uuid,uuid) TO app_runtime;
    GRANT EXECUTE ON FUNCTION app_private.lock_membership_workspace(),app_private.require_active_owner() TO app_runtime,app_operator`);
  await t.test('valid app_private target passes beside inaccessible other-schema PUBLIC grants', async () => {
    await admin!.query('GRANT SELECT ON reachability_fixture.sample TO PUBLIC');
    try { await inspect(true); }
    finally { await admin!.query('REVOKE SELECT ON reachability_fixture.sample FROM PUBLIC'); }
  });
  for (const [label, grant, revoke] of [
    ['extra private DELETE', 'GRANT DELETE ON app_private.workspaces TO app_runtime', 'REVOKE DELETE ON app_private.workspaces FROM app_runtime'],
    ['private PUBLIC exposure', 'GRANT SELECT ON app_private.workspaces TO PUBLIC', 'REVOKE SELECT ON app_private.workspaces FROM PUBLIC'],
    ['extra private column grant', 'GRANT UPDATE(display_name) ON app_private.profiles TO app_operator', 'REVOKE UPDATE(display_name) ON app_private.profiles FROM app_operator'],
    ['private definer path', 'ALTER FUNCTION app_private.has_current_session(uuid,uuid) SET search_path=public',
      'ALTER FUNCTION app_private.has_current_session(uuid,uuid) SET search_path=pg_catalog'],
    ['foundation operator access', 'GRANT SELECT ON public.foundation_migrations TO app_operator', 'REVOKE SELECT ON public.foundation_migrations FROM app_operator'],
  ]) await t.test(`${label} rejects without weakening target policy`, async () => {
    await admin!.query(grant!);
    try { await rejected(true); }
    finally { await admin!.query(revoke!); }
    await inspect(true);
  });
  await t.test('foundation policy remains strict when PUBLIC schema USAGE is absent', async () => {
    await admin!.query('REVOKE USAGE ON SCHEMA public FROM PUBLIC; GRANT DELETE ON public.foundation_migrations TO app_runtime');
    try { await rejected(true); }
    finally { await admin!.query('REVOKE DELETE ON public.foundation_migrations FROM app_runtime; GRANT USAGE ON SCHEMA public TO PUBLIC'); }
    await inspect(true);
  });
});
