import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request } from 'node:http';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { Client } from 'pg';
import { createApplication } from '../src/app.js';
import { parseConfig } from '../src/config/config.js';
import { PostgresProbe } from '../src/connectivity/adapters/postgres.js';
import { expectedMigrations, migrationManifest } from '../src/generated/migrations.js';
import { migrate, migrationsDirectory } from '../scripts/migrations.js';
import { migrationFiles } from '../scripts/migration-files.mjs';
import { assertContract, get, startApi } from './helpers.js';
import { tlsPostgres } from './tls.js';

// Destructive operations are limited to newly created, randomly named databases
// on the exact synthetic Compose fixture. Never accept an arbitrary database URL.
function fixtureConfig() {
  const raw = process.env.TEST_DATABASE_URL;
  assert.equal(raw, 'postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local',
    'Set TEST_DATABASE_URL to the documented synthetic local fixture; integration tests refuse all other targets.');
  return parseConfig({ DATABASE_URL: raw });
}

async function databaseFixture(t: TestContext) {
  const config = fixtureConfig();
  const admin = new Client(config.database);
  await admin.connect();
  const name = `foundation_test_${randomUUID().replaceAll('-', '')}`;
  try { await admin.query(`CREATE DATABASE "${name}"`); }
  catch (error) { await admin.end(); throw error; }
  const database = { ...config.database, database: name };
  const client = new Client({ ...database, application_name: 'esty-admin-fixture-control' });
  t.after(async () => {
    await client.end();
    try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
    finally { await admin.end(); }
  });
  await client.connect();
  const url = `postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/${name}`;
  return { admin, client, name, database, url };
}

test('fresh database, migrations twice, real HTTP readiness and dependency recovery', async t => {
  const fixture = await databaseFixture(t);
  const { app, origin } = await startApi(fixture.url);
  try {
    const pending = await get(origin, '/health/ready');
    assert.equal(pending.status, 503);
    assertContract(pending.body, 'Degraded');
    assert.equal(pending.body.reason, 'migrations_pending');
    assert.equal(await migrate(fixture.database), 1);
    assert.equal(await migrate(fixture.database), 0);
    const history = await fixture.client.query('SELECT name FROM public.foundation_migrations');
    assert.deepEqual(history.rows, expectedMigrations.map(name => ({ name })));
    const tables = await fixture.client.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename");
    assert.deepEqual(tables.rows, [{ schemaname: 'public', tablename: 'foundation_migrations' }]);
    const ready = await get(origin, '/health/ready');
    assert.equal(ready.status, 200);
    assertContract(ready.body, 'Ready');

    await fixture.admin.query(`ALTER DATABASE "${fixture.name}" ALLOW_CONNECTIONS false`);
    try {
      await fixture.admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND application_name = $2', [fixture.name, 'esty-admin-foundation']);
      const began = performance.now();
      const down = await get(origin, '/health/ready');
      assert.equal(down.status, 503);
      assertContract(down.body, 'Degraded');
      assert.ok(performance.now() - began < 4000);
      assert.equal((await get(origin, '/health/live')).status, 200);
    } finally {
      await fixture.admin.query(`ALTER DATABASE "${fixture.name}" ALLOW_CONNECTIONS true`);
    }
    const recovered = await get(origin, '/health/ready');
    assert.equal(recovered.status, 200);
    assertContract(recovered.body, 'Ready');
  } finally { await app.close(); }
});

test('pool saturation and blocked SQL have bounded failures and recover without leaked clients', async t => {
  const fixture = await databaseFixture(t);
  await migrate(fixture.database);
  const { app, origin } = await startApi(fixture.url);
  const probe = app.get(PostgresProbe);
  try {
    const held = await Promise.all(Array.from({ length: 4 }, () => probe.pool.connect()));
    try {
      const began = performance.now();
      const responses = await Promise.all(Array.from({ length: 8 }, () => get(origin, '/health/ready')));
      assert.ok(performance.now() - began < 4000);
      for (const response of responses) {
        assert.equal(response.status, 503);
        assertContract(response.body, 'Degraded');
        assert.equal(response.body.reason, 'database_unavailable');
      }
      assert.equal(probe.pool.waitingCount, 0);
    } finally { for (const client of held) client.release(); }
    assert.equal((await get(origin, '/health/ready')).status, 200);
    await fixture.client.query('BEGIN');
    await fixture.client.query('LOCK TABLE public.foundation_migrations IN ACCESS EXCLUSIVE MODE');
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const began = performance.now();
        const blocked = await get(origin, '/health/ready');
        assert.equal(blocked.status, 503);
        assertContract(blocked.body, 'Degraded');
        assert.equal(blocked.body.reason, 'database_timeout');
        assert.ok(performance.now() - began < 4000);
      }
    } finally { await fixture.client.query('ROLLBACK'); }
    assert.equal((await get(origin, '/health/ready')).status, 200);
    assert.equal(probe.pool.waitingCount, 0);
  } finally { await app.close(); }
  assert.equal(probe.pool.totalCount, 0);
});

test('overall readiness deadline destroys a blocked query when driver timeouts cannot finish it', async t => {
  const fixture = await databaseFixture(t);
  await migrate(fixture.database);
  const config = parseConfig({ DATABASE_URL: fixture.url });
  // Raise driver limits only in this test to independently exercise the outer deadline.
  const app = await createApplication({
    ...config, database: { ...config.database, statement_timeout: 10000, query_timeout: 10000 },
  });
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const probe = app.get(PostgresProbe);
  try {
    await fixture.client.query('BEGIN');
    await fixture.client.query('LOCK TABLE public.foundation_migrations IN ACCESS EXCLUSIVE MODE');
    try {
      const began = performance.now();
      const expired = await get(origin, '/health/ready');
      assert.equal(expired.status, 503);
      assertContract(expired.body, 'Degraded');
      assert.equal(expired.body.reason, 'database_timeout');
      assert.ok(performance.now() - began < 4000);
      assert.equal(probe.pool.totalCount, 0);
      assert.equal(probe.pool.waitingCount, 0);
    } finally { await fixture.client.query('ROLLBACK'); }
    assert.equal((await get(origin, '/health/ready')).status, 200);
  } finally { await app.close(); }
});

test('a failed migration rolls back schema and history, stays unready and can recover', async t => {
  const fixture = await databaseFixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'esty-foundation-migrations-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(migrationsDirectory, directory, { recursive: true });
  await writeFile(join(directory, '1792972800001-failure.mjs'),
    "export function up(pgm) { pgm.createSchema('rollback_probe'); pgm.sql('SELECT 1 / 0'); }\n");
  await assert.rejects(migrate(fixture.database, directory), /Migration failed/);
  const schemas = await fixture.client.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('foundation', 'rollback_probe')");
  assert.deepEqual(schemas.rows, []);
  const history = await fixture.client.query("SELECT to_regclass('public.foundation_migrations') AS history");
  if (history.rows[0].history) {
    assert.deepEqual((await fixture.client.query('SELECT name FROM public.foundation_migrations')).rows, []);
  }
  const { app, origin } = await startApi(fixture.url);
  try {
    const pending = await get(origin, '/health/ready');
    assert.equal(pending.status, 503);
    assertContract(pending.body, 'Degraded');
    assert.equal(pending.body.reason, 'migrations_pending');
    assert.equal(await migrate(fixture.database), 1);
    assert.equal((await get(origin, '/health/ready')).status, 200);
  } finally { await app.close(); }
});

test('an already applied initial migration cannot hide a pending or failed later migration', async t => {
  const fixture = await databaseFixture(t);
  await migrate(fixture.database);
  const directory = await mkdtemp(join(tmpdir(), 'esty-foundation-pending-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(migrationsDirectory, directory, { recursive: true });
  const laterMigration = join(directory, '1792972800001-later.mjs');
  await writeFile(laterMigration, "export function up(pgm) { pgm.sql('SELECT 1 / 0'); }\n");
  const app = await createApplication(parseConfig({ DATABASE_URL: fixture.url }), migrationFiles(directory).map(entry => entry.name));
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  try {
    const pending = await get(origin, '/health/ready');
    assert.equal(pending.status, 503);
    assertContract(pending.body, 'Degraded');
    assert.equal(pending.body.reason, 'migrations_pending');
    await assert.rejects(migrate(fixture.database, directory), /Migration failed/);
    const failed = await get(origin, '/health/ready');
    assert.equal(failed.status, 503);
    assertContract(failed.body, 'Degraded');
    assert.equal(failed.body.reason, 'migrations_pending');
    assert.deepEqual((await fixture.client.query('SELECT name FROM public.foundation_migrations')).rows,
      expectedMigrations.map(name => ({ name })));
    // A corrected release uses a new path; the v9 loader caches modules per process.
    const corrected = await mkdtemp(join(tmpdir(), 'esty-foundation-corrected-'));
    t.after(() => rm(corrected, { recursive: true, force: true }));
    await cp(migrationsDirectory, corrected, { recursive: true });
    await writeFile(join(corrected, '1792972800001-later.mjs'), "export function up(pgm) { pgm.sql('SELECT 1'); }\n");
    assert.equal(await migrate(fixture.database, corrected), 1);
    assert.equal((await get(origin, '/health/ready')).status, 200);
  } finally { await app.close(); }
});

test('real connection ignores conflicting ambient PG configuration', async t => {
  const fixture = await databaseFixture(t);
  const configModule = new URL('../operator/apps/api/build/src/config/config.js', import.meta.url).href;
  const program = `
    import { Client } from 'pg';
    import { loadConfig } from ${JSON.stringify(configModule)};
    const client = new Client(loadConfig().database);
    try {
      await client.connect();
      const result = await client.query('SELECT current_database() AS database, current_user AS username');
      console.log(JSON.stringify(result.rows));
    } finally { await client.end(); }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: new URL('../../', import.meta.url),
    env: {
      PATH: process.env.PATH, API_RUNTIME: 'local', DATABASE_URL: fixture.url,
      PGHOST: 'unexpected.invalid', PGPORT: '1', PGUSER: 'wrong',
      PGPASSWORD: 'wrong', PGDATABASE: 'wrong', PGSSLMODE: 'require',
      PGOPTIONS: '-c default_transaction_read_only=on -c search_path=missing',
    },
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, 'Explicit application configuration must win over ambient pg defaults.');
  assert.deepEqual(JSON.parse(result.stdout), [{ database: fixture.name, username: 'foundation_local' }]);
});

test('hosted TLS verifies trust and hostname; warm pool pressure, timeout, abort and recovery stay bounded', { timeout: 20000 }, async t => {
  const fixture = await databaseFixture(t);
  await migrate(fixture.database);
  const hostname = 'aws-0-ap-northeast-2.pooler.supabase.com';
  const peer = await tlsPostgres(t, hostname);
  const wrongHost = await tlsPostgres(t, 'wrong-host.example');
  const env = {
    API_RUNTIME: 'vercel', VERCEL: '1', BROWSER_ORIGIN: 'https://test.example',
    SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_SESSION_HOST: hostname,
    SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.abcdefghijklmnopqrst',
    DATABASE_URL: `postgresql://postgres.abcdefghijklmnopqrst:synthetic-secret@${hostname}:5432/postgres`,
  };
  for (const [label, server, ca, expected] of [
    ['trusted', peer, peer.ca, 200],
    ['untrusted', peer, undefined, 503],
    ['wrong hostname', wrongHost, wrongHost.ca, 503],
  ] as const) {
    await t.test(label, async () => {
      const config = parseConfig({ ...env, DATABASE_CA_PEM: ca });
      // Only the test redirects transport and DB identity to the local fixture;
      // production TLS identity/trust settings remain intact.
      const app = await createApplication({
        ...config, database: { ...fixture.database, port: server.port, ssl: config.database.ssl },
      });
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      const probe = app.get(PostgresProbe);
      try {
        const began = performance.now();
        const result = await get(origin, '/health/ready');
        assert.equal(result.status, expected);
        assert.ok(performance.now() - began < 4000);
        assert.equal((await get(origin, '/health/live')).status, 200);
        assert.doesNotMatch(JSON.stringify(result.body), /synthetic-secret|pooler|certificate|SELECT/);
        if (expected === 503) {
          assertContract(result.body, 'Degraded');
          assert.equal(result.body.reason, 'database_unavailable');
          assert.equal(probe.pool.totalCount, 0);
          return;
        }
        assertContract(result.body, 'Ready');
        const initialConnections = server.connections;
        assert.equal((await get(origin, '/health/ready')).status, 200);
        assert.equal(server.connections, initialConnections, 'warm requests reuse the same TLS connection');
        const held = await Promise.all([probe.pool.connect(), probe.pool.connect()]);
        try {
          const saturated = await get(origin, '/health/ready');
          assert.equal(saturated.status, 503);
          assertContract(saturated.body, 'Degraded');
          assert.equal(saturated.body.reason, 'database_unavailable');
          assert.equal(probe.pool.totalCount, 2);
          assert.equal(probe.pool.waitingCount, 0);
        } finally { held.forEach(client => client.release()); }
        await fixture.client.query('BEGIN');
        await fixture.client.query('LOCK TABLE public.foundation_migrations IN ACCESS EXCLUSIVE MODE');
        try {
          const began = performance.now();
          const blocked = await get(origin, '/health/ready');
          assert.equal(blocked.status, 503);
          assertContract(blocked.body, 'Degraded');
          assert.equal(blocked.body.reason, 'database_timeout');
          assert.ok(performance.now() - began < 4000);
          const acquired = once(probe.pool, 'acquire');
          const pending = request(origin + '/health/ready');
          pending.on('error', () => {});
          pending.end();
          await acquired;
          const removed = once(probe.pool, 'remove');
          pending.destroy();
          await removed;
          assert.equal(probe.pool.totalCount - probe.pool.idleCount, 0);
          assert.equal(probe.pool.waitingCount, 0);
        } finally { await fixture.client.query('ROLLBACK'); }
        assert.equal((await get(origin, '/health/ready')).status, 200);
        // Exercise the real pg idle timer with live sockets; await removal, not a guessed sleep.
        while (probe.pool.totalCount > 0) await once(probe.pool, 'remove');
        assert.equal(probe.pool.totalCount, 0, 'idle hosted sessions drain without process shutdown');
        assert.equal((await get(origin, '/health/ready')).status, 200);
      } finally { await app.close(); }
      assert.equal(probe.pool.totalCount, 0);
    });
  }
});

test('portable operator and compiled HTTP entrypoint work outside the repository; asset drift prevents DDL', { timeout: 30000 }, async t => {
  const fixture = await databaseFixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'esty-operator-artifact-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL('../operator/', import.meta.url), directory, { recursive: true });
  const appRoot = join(directory, 'apps/api');
  const cli = join(appRoot, 'build/scripts/migrate.js');
  const env = { PATH: process.env.PATH, HOME: directory, DATABASE_URL: fixture.url, API_RUNTIME: 'local' };
  const run = () => spawnSync(process.execPath, [cli], { cwd: tmpdir(), env, encoding: 'utf8', timeout: 15000 });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /1 applied/);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /0 applied/);
  const migrationPath = join(appRoot, 'migrations', `${migrationManifest[0].name}.mjs`);
  await writeFile(migrationPath, (await readFile(migrationPath, 'utf8')) + '\nexport const changed = true;\n');
  const drift = run();
  assert.equal(drift.status, 1);
  assert.doesNotMatch(drift.stderr, /postgresql|local_fixture_only| at /);
  assert.deepEqual((await fixture.client.query('SELECT name FROM public.foundation_migrations')).rows,
    expectedMigrations.map(name => ({ name })));

  // Reserve an OS-selected local port, then launch the real staged entrypoint.
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const child = spawn(process.execPath, [join(appRoot, 'build/src/main.js')], {
    cwd: tmpdir(), env: { ...env, API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    // Real child-process startup/shutdown needs bounded wall-clock guards.
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Staged API did not start.')), 5000);
      const check = (chunk: Buffer) => {
        if (chunk.toString().includes('API is listening')) { clearTimeout(deadline); resolve(); }
      };
      child.stdout.on('data', check);
      child.once('exit', () => { clearTimeout(deadline); reject(new Error('Staged API exited before startup.')); });
    });
    const origin = `http://127.0.0.1:${port}`;
    assert.equal((await get(origin, '/health/live')).status, 200);
    assert.equal((await get(origin, '/health/ready')).status, 200);
    assert.equal((await get(origin, '/unknown')).status, 404);
    // The web artifact reads its static manifest, not modified operator files.
    assert.doesNotMatch(output, /local_fixture_only|postgresql:\/\//);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve, reject) => {
      if (child.exitCode !== null) { resolve(); return; }
      const deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Staged API failed to shut down.')); }, 4000);
      child.once('exit', () => { clearTimeout(deadline); resolve(); });
    });
  }
});
