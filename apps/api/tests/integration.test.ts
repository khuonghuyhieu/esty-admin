import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
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
import { migrationStatus, runMigrations } from '../scripts/migrations.js';
import { saveMigrationReport } from '../scripts/migration-report.js';
import { manifestDigest } from '../scripts/migrations.js';
import { runRelease } from '../scripts/release-core.js';
import type { Deployment } from '../scripts/release-core.js';
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
  const statusCli = join(appRoot, 'build/scripts/migration-status.js');
  const statusBefore = spawnSync(process.execPath, [statusCli], { cwd: tmpdir(), env, encoding: 'utf8', timeout: 15000 });
  assert.equal(statusBefore.status, 0, statusBefore.stderr);
  assert.equal(JSON.parse(statusBefore.stdout).initialized, false);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /1 applied/);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /0 applied/);
  const statusAfter = spawnSync(process.execPath, [statusCli], { cwd: tmpdir(), env, encoding: 'utf8', timeout: 15000 });
  assert.equal(statusAfter.status, 0, statusAfter.stderr);
  assert.deepEqual(JSON.parse(statusAfter.stdout).applied, expectedMigrations);
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

test('read-only status never initializes history; action and SQL failures identify the exact rolled-back version', async t => {
  for (const failure of ['action', 'sql']) {
    await t.test(failure, async t => {
      const fixture = await databaseFixture(t);
      const directory = await mkdtemp(join(tmpdir(), 'esty-report-fixture-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      await cp(migrationsDirectory, directory, { recursive: true });
      const version = '1792972800001-failed-version';
      await writeFile(join(directory, `${version}.mjs`), failure === 'action'
        ? "export function up() { throw new Error('synthetic-password-do-not-log'); }\n"
        : "export function up(pgm) { pgm.sql(\"SELECT 'synthetic-password-do-not-log'::integer\"); }\n");
      const status = await migrationStatus(fixture.database, directory);
      assert.equal(status.initialized, false);
      assert.deepEqual(status.pending, ['1792972800000-foundation', version]);
      assert.equal((await fixture.client.query("SELECT to_regclass('public.foundation_migrations') AS name")).rows[0].name, null);
      const report = await runMigrations(fixture.database, { directory });
      assert.equal(report.result, 'failed');
      assert.equal(report.stage, 'migration');
      assert.equal(report.failed_version, version);
      assert.equal(report.database_outcome, 'rolled_back');
      assert.deepEqual(report.before, []);
      assert.deepEqual(report.after, []);
      assert.deepEqual(report.attempted.map(item => [item.name, item.outcome]),
        [['1792972800000-foundation', 'rolled_back'], [version, 'rolled_back']]);
      assert.doesNotMatch(JSON.stringify(report), /synthetic-password|SELECT|postgresql| at /);
      assert.equal((await fixture.client.query("SELECT to_regnamespace('foundation') AS name")).rows[0].name, null);
    });
  }
});

test('report-write failure preserves committed outcome and unexpected history blocks subsequent DDL', async t => {
  const fixture = await databaseFixture(t);
  const report = await runMigrations(fixture.database);
  assert.equal(report.database_outcome, 'committed');
  const directory = await mkdtemp(join(tmpdir(), 'esty-report-output-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const occupied = join(directory, 'file');
  await writeFile(occupied, 'keep');
  assert.equal(saveMigrationReport(report, occupied), false);
  assert.equal(report.reporting, 'failed');
  assert.equal(report.database_outcome, 'committed');
  assert.deepEqual((await migrationStatus(fixture.database)).applied, expectedMigrations);
  await fixture.client.query("INSERT INTO public.foundation_migrations(name, run_on) VALUES ('1792972800002-unexpected', now())");
  const failed = await runMigrations(fixture.database);
  assert.equal(failed.result, 'failed');
  assert.equal(failed.stage, 'lock/order');
  assert.equal(failed.database_outcome, 'not_started');
  assert.deepEqual(failed.attempted, []);
});

test('release serialization, failure boundaries and exact deployment identity use only disposable fixture databases', { timeout: 30000 }, async t => {
  for (const mode of ['migration-failure', 'deploy-failure', 'queued', 'wrong-commit', 'wrong-project', 'changed-id', 'domain-failure', 'provider-canceled', 'cancelled', 'timeout', 'success', 'locked']) {
    await t.test(mode, async t => {
      const fixture = await databaseFixture(t);
      const directory = await realpath(await mkdtemp(join(tmpdir(), 'esty-release-fixture-')));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const migrations = join(directory, 'migrations');
      await cp(migrationsDirectory, migrations, { recursive: true });
      if (mode === 'migration-failure') await writeFile(join(migrations, '1792972800001-failure.mjs'),
        "export function up() { throw new Error('synthetic-provider-secret'); }\n");
      const revision = 'a'.repeat(40);
      const controller = new AbortController();
      let deployCalls = 0;
      let smokeCalls = 0;
      let unlock!: () => void;
      let entered!: () => void;
      const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
      const blocked = new Promise<void>(resolve => { unlock = resolve; });
      const identity = { provider: 'vercel', project: 'prj_synthetic', owner: 'team_synthetic', target: 'production' };
      const deployment: Deployment = {
        identity,
        async preflight() {},
        async trigger() {
          deployCalls++;
          if (mode === 'cancelled') { controller.abort(); return new Promise(() => {}); }
          if (mode === 'locked') { entered(); await blocked; }
          return { ...identity, id: 'dpl_synthetic', revision: mode === 'wrong-commit' ? 'b'.repeat(40) : revision,
            project: mode === 'wrong-project' ? 'prj_other' : identity.project,
            status: mode === 'deploy-failure' ? 'failed' : mode === 'provider-canceled' ? 'canceled' : 'building' };
        },
        async inspect() { return { ...identity, id: mode === 'changed-id' ? 'dpl_other' : 'dpl_synthetic', revision,
          status: ['timeout', 'queued'].includes(mode) ? 'building' : 'ready' }; },
        async smoke() { smokeCalls++; if (mode === 'domain-failure') throw new Error('synthetic-provider-secret'); },
      };
      const input = { revision, digest: manifestDigest(migrationFiles(migrations)), target: 'local', database: fixture.database,
        directory: migrations, reportDirectory: join(directory, 'reports'), deployment, pollMs: 1, timeoutMs: ['timeout', 'queued'].includes(mode) ? 1000 : 5000,
        signal: controller.signal, verifySource: async () => {}, prepare: async () => {} };
      const pending = runRelease(input);
      if (mode === 'locked') {
        await enteredPromise;
        const concurrent = await runRelease(input);
        assert.equal(concurrent.result, 'failed');
        assert.equal(concurrent.deployment, 'not_started');
        assert.equal(deployCalls, 1);
        unlock();
      }
      const completed = await pending;
      const result = JSON.parse(await readFile(join(input.reportDirectory, `${completed.run_id}.json`), 'utf8')) as typeof completed;
      const lockPresent = await readFile(join(input.reportDirectory, 'operator.lock')).then(() => true, error => {
        assert.equal(error.code, 'ENOENT');
        return false;
      });
      assert.equal(lockPresent, result.lock_retained);
      assert.doesNotMatch(JSON.stringify(result), /synthetic-provider-secret|postgresql|SELECT|local_fixture_only/);
      if (mode === 'migration-failure') {
        assert.equal(deployCalls, 0);
        assert.equal(result.migration?.database_outcome, 'rolled_back');
      } else {
        assert.equal(result.migration?.database_outcome, 'committed');
        assert.deepEqual((await migrationStatus(fixture.database)).applied, expectedMigrations);
      }
      assert.equal(result.result, ['success', 'locked'].includes(mode) ? 'success' : 'failed');
      assert.equal(smokeCalls, ['success', 'locked', 'domain-failure'].includes(mode) ? 1 : 0);
      assert.equal(result.lock_retained, ['queued', 'wrong-commit', 'wrong-project', 'changed-id', 'domain-failure', 'provider-canceled', 'cancelled', 'timeout'].includes(mode));
      assert.equal(result.reporting, 'written');
    });
  }
});

test('compiled Vercel-mode package protects routes and verifies loopback TLS outside repository cwd; not native artifact proof', { timeout: 20000 }, async t => {
  const fixture = await databaseFixture(t);
  await migrate(fixture.database);
  const hostname = 'aws-0-ap-northeast-2.pooler.supabase.com';
  const peer = await tlsPostgres(t, hostname);
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'esty-vercel-mode-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL('../operator/', import.meta.url), directory, { recursive: true });
  // Test-only transport/DB identity remapping. The copied main/config/guard/TLS
  // code remains unchanged; no DNS or connection can reach the cloud tuple.
  const preload = join(directory, 'synthetic-transport.mjs');
  await writeFile(preload, `import {Client} from 'pg';
import net from 'node:net';
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const host = typeof args[0] === 'number' ? args[1] : args[0]?.host;
  if (host !== '127.0.0.1') throw new Error('Non-loopback test connection blocked');
  return socketConnect.apply(this, args);
};
const original=Client.prototype.connect;
Client.prototype.connect=function(...args) {
  if(this.connectionParameters.host!==${JSON.stringify(hostname)} || this.connectionParameters.port!==5432) throw new Error('Unapproved test transport');
  const transport = ${JSON.stringify({ host: '127.0.0.1', port: peer.port, user: fixture.database.user, password: fixture.database.password, database: fixture.name })};
  Object.assign(this.connectionParameters, transport);
  Object.assign(this, transport);
  return original.apply(this,args);
};\n`);
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const key = 'a'.repeat(64);
  const nodeArgs = ['--import', preload, join(directory, 'apps/api/build/src/main.js')];
  const executable = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : process.execPath;
  const childArgs = process.platform === 'darwin' ? ['-p', '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip \"localhost:*\"))', process.execPath, ...nodeArgs] : nodeArgs;
  const child = spawn(executable, childArgs, {
    cwd: tmpdir(), env: { PATH: process.env.PATH, API_RUNTIME: 'vercel', VERCEL: '1', PORT: String(port),
      BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: key, DATABASE_CA_PEM: peer.ca,
      SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: hostname,
      SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
      DATABASE_URL: `postgresql://postgres.eotmpaliqcxxcotrcols:synthetic-only@${hostname}:5432/postgres`,
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Vercel-mode package startup timed out.')), 5000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('API is listening')) { clearTimeout(timer); resolve(); } });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Vercel-mode package exited before startup.')); });
    });
    const origin = `http://127.0.0.1:${port}`;
    assert.equal((await get(origin, '/health/ready')).status, 401);
    assert.equal(peer.connections, 0);
    const headers = { Authorization: `Bearer ${key}` };
    for (const [path, status] of [['/health/live', 200], ['/health/ready', 200], ['/unknown', 404]] as const) {
      const response = await fetch(origin + path, { headers, signal: AbortSignal.timeout(4500) });
      assert.equal(response.status, status);
      await response.arrayBuffer();
    }
    assert.ok(peer.connections > 0);
    assert.doesNotMatch(output, /synthetic-only|postgresql|BEGIN CERTIFICATE/);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve, reject) => {
      if (child.exitCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Vercel-mode process shutdown timed out.')); }, 4000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
});

test('cancelled migration reports unknown safely; CLI report-write failure does not relabel a committed database', async t => {
  const fixture = await databaseFixture(t);
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'esty-cancel-report-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const migrations = join(directory, 'migrations');
  await cp(migrationsDirectory, migrations, { recursive: true });
  const event = `esty-migration-${randomUUID()}`;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once(event, cancel);
  t.after(() => process.removeListener(event, cancel));
  await writeFile(join(migrations, '1792972800001-cancelled.mjs'),
    `export async function up() { process.emit(${JSON.stringify(event)}); await new Promise(() => {}); }\n`);
  const report = await runMigrations(fixture.database, { directory: migrations, signal: controller.signal });
  assert.equal(report.result, 'failed');
  assert.equal(report.stage, 'migration');
  assert.equal(report.failed_version, '1792972800001-cancelled');
  assert.equal(report.database_outcome, 'unknown');
  assert.ok(report.attempted.every(item => item.outcome === 'unknown'));
  const occupied = join(directory, 'not-a-directory');
  await writeFile(occupied, 'preserve');
  const cli = new URL('../scripts/migrate.js', import.meta.url);
  const result = spawnSync(process.execPath, [cli.pathname, '--report-dir', occupied], {
    cwd: tmpdir(), env: { PATH: process.env.PATH, DATABASE_URL: fixture.url }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /database=committed; report=failed/);
  assert.doesNotMatch(result.stdout + result.stderr, /postgresql|local_fixture_only|SELECT/);
  assert.deepEqual((await migrationStatus(fixture.database)).applied, expectedMigrations);
});
