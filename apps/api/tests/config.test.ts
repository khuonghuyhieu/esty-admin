import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { parseConfig, parseMigrationConfig } from '../src/config/config.js';
import { migrationFiles, verifyMigrationFiles } from '../scripts/migration-files.mjs';

const valid = { DATABASE_URL: 'postgresql://fixture:secret%40value@127.0.0.1:55432/foundation_local' };

test('PostgreSQL URL decoding preserves credentials and database identity', () => {
  const config = parseConfig({ DATABASE_URL: 'postgresql://fixture%40local:secret%40value@127.0.0.1:55432/foundation%20local' });
  assert.equal(config.database.user, 'fixture@local');
  assert.equal(config.database.password, 'secret@value');
  assert.equal(config.database.database, 'foundation local');
});

test('malformed database URLs fail safely without exposing supplied credentials', () => {
  for (const value of [undefined, '', 'secret-value', 'http://fixture:secret-value@127.0.0.1:55432/db',
    'postgres://fixture:secret-value@remote.example:55432/db',
    'postgres://fixture:secret-value@127.0.0.1:55432/db?sslmode=disable',
    'postgres://fixture:secret-value@127.0.0.1:55432/db#secret-value',
    'postgres://fixture:secret-value@127.0.0.1:55432/',
    'postgres://fixture:secret-value@127.0.0.1/db',
    'postgres://fixture:secret-value@127.0.0.1:65536/db',
    'postgres://fixture:secret-value@127.0.0.1:55432/%00',
    'postgres://fixture:secret-value@127.0.0.1:55432/%ZZ']) {
    assert.throws(() => parseConfig({ DATABASE_URL: value }), (error: Error) => {
      assert.match(error.message, /^DATABASE_URL:/);
      assert.doesNotMatch(error.stack ?? '', /secret-value|remote\.example/);
      return true;
    });
  }
});

test('HTTP binding and origin boundaries reject unsafe or ambiguous input', () => {
  for (const port of ['0', '65536', '-1', '3e3', ' 3001', '3001 ', '3001.0', '']) {
    assert.throws(() => parseConfig({ ...valid, API_PORT: port }), /^ConfigurationError: API_PORT:/);
  }
  for (const host of ['0.0.0.0', '::', 'remote.example', '']) {
    assert.throws(() => parseConfig({ ...valid, API_HOST: host }), /API_HOST:/);
  }
  for (const origin of ['*', 'http://user:password@localhost:3000', 'http://localhost:3000/', 'null', 'https://example.com?x=1']) {
    assert.throws(() => parseConfig({ ...valid, BROWSER_ORIGIN: origin }), /BROWSER_ORIGIN:/);
  }
  assert.equal(parseConfig({ ...valid, API_PORT: '65535', BROWSER_ORIGIN: 'https://example.com' }).port, 65535);
});

test('invalid startup exits before accepting work and prints only safe diagnostics', () => {
  const result = spawnSync(process.execPath, [new URL('../src/main.js', import.meta.url).pathname], {
    env: { ...hosted,
      DATABASE_URL: 'private-password-with-secret' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL:/);
  assert.doesNotMatch(result.stderr + result.stdout, /private-password-with-secret| at |postgresql:\/\//);
});

const hosted = {
  API_RUNTIME: 'vercel', VERCEL: '1', PORT: '3000',
  SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols',
  SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
  SUPABASE_DATABASE_NAME: 'postgres',
  SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
  DATABASE_URL: 'postgresql://postgres.eotmpaliqcxxcotrcols:synthetic-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
  BROWSER_ORIGIN: 'https://preview.example',
  PREVIEW_ACCESS_KEY: 'a'.repeat(64),
};

test('hosted startup requires explicit mode, platform binding and exact approved session target', () => {
  const config = parseConfig(hosted);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 3000);
  for (const field of ['VERCEL', 'SUPABASE_PROJECT_REF', 'SUPABASE_SESSION_HOST',
    'SUPABASE_DATABASE_NAME', 'SUPABASE_DATABASE_USER', 'DATABASE_URL', 'BROWSER_ORIGIN']) {
    assert.throws(() => parseConfig({ ...hosted, [field]: undefined }));
  }
  for (const changes of [
    { API_RUNTIME: 'unknown' }, { API_RUNTIME: 'local' }, { PORT: '3e3' },
    { API_HOST: 'localhost' }, { API_PORT: '3001' },
    { SUPABASE_SESSION_HOST: 'attacker.example' },
    { SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com.evil.example' },
    { SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com.' },
    { SUPABASE_SESSION_HOST: 'aws-1-ap-northeast-2.pooler.supabase.com' },
    { SUPABASE_PROJECT_REF: 'zyxwvutsrqponmlkjihgf' },
    { SUPABASE_DATABASE_USER: 'postgres.zyxwvutsrqponmlkjihgf' },
    { SUPABASE_DATABASE_NAME: 'different_database' },
    { DATABASE_URL: hosted.DATABASE_URL.replace(':5432', ':6543') },
    { DATABASE_URL: `${hosted.DATABASE_URL}?sslmode=disable` },
    { DATABASE_URL: `${hosted.DATABASE_URL}#synthetic-only` },
    { DATABASE_CA_PEM: 'not-a-certificate-private-value' },
    { BROWSER_ORIGIN: 'http://preview.example' },
  ]) {
    assert.throws(() => parseConfig({ ...hosted, ...changes }), (error: Error) => {
      assert.doesNotMatch(error.stack ?? '', /synthetic-only|private-value|postgresql:\/\//);
      return true;
    });
  }
  assert.throws(() => parseConfig({ DATABASE_URL: hosted.DATABASE_URL }), /DATABASE_URL:/);
});

test('hosted migrations require separate URL and exact project confirmation without platform login', () => {
  const operator = {
    ...hosted, API_RUNTIME: undefined, VERCEL: undefined, DATABASE_URL: undefined,
    MIGRATION_TARGET: 'supabase', MIGRATION_DATABASE_URL: hosted.DATABASE_URL,
    MIGRATION_CONFIRM_PROJECT_REF: hosted.SUPABASE_PROJECT_REF,
  };
  assert.equal(parseMigrationConfig(operator).user, hosted.SUPABASE_DATABASE_USER);
  for (const changes of [
    { MIGRATION_DATABASE_URL: undefined },
    { MIGRATION_CONFIRM_PROJECT_REF: undefined },
    { MIGRATION_CONFIRM_PROJECT_REF: 'different' },
    { MIGRATION_TARGET: 'other' },
    { MIGRATION_DATABASE_URL: hosted.DATABASE_URL.replace(':5432', ':6543') },
  ]) assert.throws(() => parseMigrationConfig({ ...operator, ...changes }));
  assert.throws(() => parseMigrationConfig({ ...hosted, MIGRATION_TARGET: 'local' }));
  assert.equal(parseMigrationConfig(valid).database, 'foundation_local');
});

test('migration manifest rejects ambiguous files and detects missing, added or changed release assets', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'esty-manifest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.throws(() => migrationFiles(directory), /empty/);
  const initial = join(directory, '1792972800000-initial.mjs');
  await writeFile(initial, 'export function up() {}\n');
  const expected = migrationFiles(directory);
  await writeFile(initial, 'export function up() { throw new Error(); }\n');
  assert.throws(() => verifyMigrationFiles(directory, expected), /differ/);
  await writeFile(join(directory, '1792972800000-duplicate.mjs'), 'export function up() {}\n');
  assert.throws(() => migrationFiles(directory), /unique/);
  await rm(join(directory, '1792972800000-duplicate.mjs'));
  await writeFile(join(directory, 'unsupported.sql'), 'SELECT 1;');
  assert.throws(() => migrationFiles(directory), /timestamp-name/);
  await rm(join(directory, 'unsupported.sql'));
  await writeFile(join(directory, '1792972800001-later.mjs'), 'export function up() {}\n');
  assert.throws(() => verifyMigrationFiles(directory, expected), /differ/);
  await rm(initial);
  assert.throws(() => verifyMigrationFiles(directory, expected), /differ/);
});

test('hosted loading ignores local env files and local package loading is cwd-independent', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'esty-config-package-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'build/src/config'), { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"name":"@esty-admin/api","type":"module"}');
  await cp(new URL('../src/config/config.js', import.meta.url), join(directory, 'build/src/config/config.js'));
  await cp(new URL('../config/', import.meta.url), join(directory, 'build/config'), { recursive: true });
  await writeFile(join(directory, '.env'), `DATABASE_URL=${valid.DATABASE_URL}\nAPI_PORT=3210\nSUPABASE_SESSION_HOST=${hosted.SUPABASE_SESSION_HOST}\n`);
  const moduleUrl = pathToFileURL(join(directory, 'build/src/config/config.js')).href;
  const program = `import {loadConfig} from ${JSON.stringify(moduleUrl)}; try {console.log(loadConfig().port)} catch(e) {console.error(e.message); process.exitCode=1}`;
  const local = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: tmpdir(), env: { API_PORT: '3211' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(local.status, 0);
  assert.equal(local.stdout.trim(), '3211');
  const remote = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: tmpdir(), env: { ...hosted, SUPABASE_SESSION_HOST: undefined }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(remote.status, 1);
  assert.match(remote.stderr, /^SUPABASE_SESSION_HOST:/);
  assert.doesNotMatch(remote.stderr, /synthetic-only|secret%40value/);
});

test('Vercel rejects retired modes and runtime/operator credential confusion', () => {
  assert.deepEqual(parseConfig(hosted).database.ssl, { rejectUnauthorized: true, servername: hosted.SUPABASE_SESSION_HOST });
  for (const changes of [
    { API_RUNTIME: 'render' }, { RENDER: 'true' }, { RENDER: 'false' }, { RENDER_SERVICE_ID: 'synthetic' },
    { PREVIEW_ACCESS_KEY: undefined }, { PREVIEW_ACCESS_KEY: 'wrong' },
    { MIGRATION_DATABASE_URL: 'synthetic-secret' }, { RENDER_API_KEY: 'synthetic-secret' },
    { VERCEL_TOKEN: 'synthetic-secret' }, { VERCEL_API_TOKEN: 'synthetic-secret' },
  ]) assert.throws(() => parseConfig({ ...hosted, ...changes }), (error: Error) => {
    assert.doesNotMatch(error.message, /synthetic-secret|synthetic-only|postgresql:\/\//);
    return true;
  });
  assert.throws(() => parseMigrationConfig({ ...valid, VERCEL: '1' }), /separately/);
  assert.throws(() => parseConfig({ ...valid, PREVIEW_ACCESS_KEY: 'a'.repeat(64) }), /Vercel/);
});
