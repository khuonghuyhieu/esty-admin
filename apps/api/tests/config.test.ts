import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, rm, writeFile, readFile, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { ConfigurationError, parseConfig, parseEtsyConfig, parseMigrationConfig } from '../src/config/config.js';
import { migrationFiles, verifyMigrationFiles } from '../scripts/migration-files.mjs';
import { fixtureProfile } from '../scripts/app-fixture-profile.mjs';
import { activationBaseKeys, activationAppKeys, etsyRuntimeKeys, runtimeConfigDigest } from '../src/config/activation-config.js';
import { prepareEtsyConfiguration, saveEtsyConfiguration, saveEtsyKeyring } from '../scripts/etsy-setup.js';
import { assertAppManifest, readyHistory } from '../src/config/schema-transition.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { createHash } from 'node:crypto';

const valid = { DATABASE_URL: 'postgresql://fixture:secret%40value@127.0.0.1:55432/foundation_local' };

test('Etsy configuration is opt-in and enabled settings fail closed without leaking values', () => {
  assert.equal(parseEtsyConfig({}), undefined);
  assert.equal(parseEtsyConfig({ ETSY_ENABLED: 'false', ETSY_TOKEN_KEYRING: 'unused-secret' }), undefined);
  const enabled = {
    ETSY_ENABLED: 'true', APP_FOUNDATION_ENABLED: 'true',
    ETSY_CLIENT_ID: 'synthetic_app', ETSY_SHARED_SECRET: 'synthetic_secret',
    ETSY_CALLBACK_URL: 'https://api.lovora.us/integrations/etsy/callback',
    ETSY_RETURN_ORIGIN: 'https://website.example', ETSY_INVITATION_ORIGIN: 'https://invite.example',
    ETSY_INVITATION_TTL_SECONDS: '600', ETSY_RETENTION_SECONDS: '900',
    ETSY_TOKEN_ACTIVE_KEY_ID: 'test_key',
    ETSY_TOKEN_KEYRING: JSON.stringify({ test_key: Buffer.alloc(32, 7).toString('base64url') }),
  };
  const parsed = parseEtsyConfig(enabled)!;
  assert.equal(parsed.invitationTtlSeconds, 600);
  assert.equal(parsed.retentionSeconds, 900);
  assert.deepEqual(parsed.keyring.get('test_key'), Buffer.alloc(32, 7));
  for (const field of Object.keys(enabled).filter(key => key !== 'ETSY_ENABLED')) {
    assert.throws(() => parseEtsyConfig({ ...enabled, [field]: undefined }), ConfigurationError);
  }
  const invalid: Record<string, string[]> = {
    ETSY_ENABLED: ['yes', 'TRUE', ''],
    APP_FOUNDATION_ENABLED: ['false'],
    ETSY_SHARED_SECRET: ['private:value', 'private value', 'private\nvalue'],
    ETSY_CALLBACK_URL: ['https://evil.example/callback', `${enabled.ETSY_CALLBACK_URL}/`, `${enabled.ETSY_CALLBACK_URL}?private=value`],
    ETSY_RETURN_ORIGIN: ['http://website.example', 'https://website.example/', 'https://private:value@website.example', 'https://website.example#private'],
    ETSY_INVITATION_ORIGIN: ['null', 'https://invite.example/path', 'https://invite.example?private=value'],
    ETSY_INVITATION_TTL_SECONDS: ['299', '604801', '600.0', ' 600'],
    ETSY_RETENTION_SECONDS: ['0', '2592001', '1e3'],
    ETSY_TOKEN_ACTIVE_KEY_ID: ['missing', '../private'],
    ETSY_TOKEN_KEYRING: ['private-value', 'null', '[]', '{}', '{"test_key":"private-value"}',
      JSON.stringify({ test_key: Buffer.alloc(31).toString('base64url') })],
  };
  for (const [field, values] of Object.entries(invalid)) for (const value of values) {
    assert.throws(() => parseEtsyConfig({ ...enabled, [field]: value }), (error: Error) => {
      assert.ok(error instanceof ConfigurationError);
      assert.doesNotMatch(error.stack ?? '', /private-value|private:value|synthetic_secret/);
      return true;
    });
  }
});

test('strict application supports later versions only above the immutable activated prefix and still requires complete history', () => {
  const next = { name: `${Number(migrationManifest.at(-1)!.name.slice(0, 13)) + 1}-routine-extension`,
    sha256: createHash('sha256').update('reviewed fixture').digest('hex') };
  const target = [...migrationManifest, next], names = target.map(item => item.name);
  assertAppManifest(target);
  assert.equal(readyHistory(target, names, 'strict'), true);
  assert.equal(readyHistory(migrationManifest, names, 'strict'), false);
  assert.throws(() => readyHistory(target, names, 'activation-bridge'));
  for (const invalid of [migrationManifest.slice(0, 1), [migrationManifest[1]!, migrationManifest[0]!, migrationManifest[2]!],
    [...migrationManifest, migrationManifest[2]!], [...migrationManifest, { ...next, sha256: 'invalid' }],
    migrationManifest.map((entry, index) => index ? entry : { ...entry, sha256: next.sha256 })]) {
    assert.throws(() => assertAppManifest(invalid));
  }
});

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
  await cp(new URL('../src/config/', import.meta.url), join(directory, 'build/src/config'), { recursive: true });
  await mkdir(join(directory, 'build/src/generated'), { recursive: true });
  await cp(new URL('../src/generated/migrations.js', import.meta.url), join(directory, 'build/src/generated/migrations.js'));
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

const appLocal = {
  API_RUNTIME: 'local', DATABASE_URL: 'postgresql://app_runtime:synthetic-only@127.0.0.1:55440/f005_fixture',
  PREVIEW_ACCESS_KEY: 'a'.repeat(64), APP_FOUNDATION_ENABLED: 'true',
  APP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000005',
  APP_AUTH_URL: 'http://127.0.0.1:55441', APP_AUTH_API_KEY: 'synthetic-api-key',
};

test('app opt-in requires independent technical protection, fixed Auth origin and least-privilege DB identity', () => {
  const enabled = parseConfig(appLocal);
  assert.equal(enabled.appFoundation?.workspaceId, appLocal.APP_WORKSPACE_ID);
  assert.equal(enabled.appFoundation?.emailEnabled, false);
  assert.equal(enabled.previewAccessKey, appLocal.PREVIEW_ACCESS_KEY);
  for (const changes of [
    { PREVIEW_ACCESS_KEY: undefined }, { PREVIEW_ACCESS_KEY: 'private-invalid' },
    { APP_FOUNDATION_ENABLED: 'yes' }, { APP_WORKSPACE_ID: 'private-invalid' },
    { APP_AUTH_URL: 'https://remote.example/auth/v1' }, { APP_AUTH_URL: 'http://127.0.0.1:0' },
    { APP_AUTH_URL: 'http://127.0.0.1:55441/unsafe' }, { APP_AUTH_URL: 'http://user:private-invalid@127.0.0.1:55441' },
    { APP_AUTH_API_KEY: undefined }, { APP_EMAIL_ENABLED: 'yes' },
    { APP_EMAIL_ENABLED: 'true' }, { APP_AUTH_ADMIN_KEY: 'private-invalid' },
    { DATABASE_URL: appLocal.DATABASE_URL.replace('app_runtime:', 'postgres:') },
  ]) assert.throws(() => parseConfig({ ...appLocal, ...changes }), (error: Error) => {
    assert.doesNotMatch(error.message, /private-invalid|synthetic-only|remote\.example/);
    return true;
  });
  assert.equal(parseConfig({ ...appLocal, APP_EMAIL_ENABLED: 'true', APP_AUTH_ADMIN_KEY: 'synthetic-admin' }).appFoundation?.emailEnabled, true);
  assert.equal(parseConfig(valid).appFoundation, undefined);
});

test('hosted app activation binds reviewed project, verified Session TLS and explicit retention policy', () => {
  const appHosted = { ...hosted, APP_FOUNDATION_ENABLED: 'true', APP_WORKSPACE_ID: appLocal.APP_WORKSPACE_ID,
    SUPABASE_DATABASE_USER: 'app_runtime.eotmpaliqcxxcotrcols',
    DATABASE_URL: hosted.DATABASE_URL.replace('postgres.eotmpaliqcxxcotrcols:', 'app_runtime.eotmpaliqcxxcotrcols:'),
    APP_AUTH_URL: 'https://eotmpaliqcxxcotrcols.supabase.co/auth/v1', APP_AUTH_API_KEY: 'sb_publishable_synthetic-only',
    APP_RETENTION_POLICY_ID: 'synthetic-approved-policy' };
  const enabled = parseConfig(appHosted);
  assert.deepEqual(enabled.database.ssl, { rejectUnauthorized: true, servername: hosted.SUPABASE_SESSION_HOST });
  assert.equal(enabled.appFoundation?.retentionPolicyId, appHosted.APP_RETENTION_POLICY_ID);
  for (const changes of [
    { APP_RETENTION_POLICY_ID: undefined }, { APP_RETENTION_POLICY_ID: '' },
    { APP_AUTH_URL: 'http://127.0.0.1:55441' },
    { APP_AUTH_URL: 'https://zyxwvutsrqponmlkjihgf.supabase.co/auth/v1' },
    { APP_AUTH_URL: `${appHosted.APP_AUTH_URL}?override=1` },
    { DATABASE_URL: hosted.DATABASE_URL, SUPABASE_DATABASE_USER: hosted.SUPABASE_DATABASE_USER },
    { APP_OPERATOR_AUTH_KEY: 'private-operator-key' }, { APP_OPERATOR_TARGET: 'supabase' },
    { APP_ROLES_RUNTIME_DATABASE_URL: 'private-role-key' }, { ACTIVATION_PACKET: 'private-activation-input' },
  ]) assert.throws(() => parseConfig({ ...appHosted, ...changes }));
  const jwt = (header: unknown, payload: unknown) => [header, payload]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).concat(Buffer.alloc(32, 1).toString('base64url')).join('.');
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { role: 'anon', iss: 'supabase', ref: hosted.SUPABASE_PROJECT_REF };
  assert.equal(parseConfig({ ...appHosted, APP_AUTH_API_KEY: jwt(header, payload) }).appFoundation?.apiKey, jwt(header, payload));
  for (const key of ['sb_secret_private-key-canary', 'synthetic-api-key', 'sb_publishable_', 'sb_publishable_bad/key',
    jwt(header, { ...payload, role: 'service_role' }), jwt(header, { ...payload, role: 'authenticated' }),
    jwt({ ...header, alg: 'none' }, payload), jwt({ alg: 'HS256' }, payload), jwt(header, null),
    jwt(header, { ...payload, ref: 'zyxwvutsrqponmlkjihgf' }), jwt(header, { ...payload, iss: 'other' }),
    `${jwt(header, payload)}=`, `${jwt(header, payload)}.extra`]) {
    assert.throws(() => parseConfig({ ...appHosted, APP_AUTH_API_KEY: key }), (error: Error) => {
      assert.match(error.message, /^APP_AUTH_API_KEY:/);
      assert.ok(!error.message.includes(key));
      return true;
    });
  }
});

test('retired activation bridge refuses the additive application manifest', () => {
  const bridge = { ...valid, APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false', PREVIEW_ACCESS_KEY: 'a'.repeat(64) };
  assert.throws(() => parseConfig(bridge));
  for (const changes of [{ APP_FOUNDATION_ENABLED: undefined }, { APP_FOUNDATION_ENABLED: 'true' },
    { APP_SCHEMA_MODE: 'arbitrary-history' }, { PREVIEW_ACCESS_KEY: undefined }]) {
    assert.throws(() => parseConfig({ ...bridge, ...changes }));
  }
  assert.equal(parseConfig(appLocal).schemaMode, 'strict');
});

test('owned fixture profiles reject cross-lane ports and normal-session timeboxing', () => {
  const selected = fixtureProfile({ APP_SESSION_E2E_PROFILE: 'activation001' });
  assert.equal(selected.authPort, 55541);
  assert.equal(selected.webPort, 55544);
  for (const env of [
    { APP_SESSION_E2E_PROFILE: 'unknown' },
    { APP_SESSION_E2E_PROFILE: 'activation001', F005_AUTH_PORT: '55441' },
    { APP_SESSION_E2E_PROFILE: 'activation001', F005_WEB_PORT: '3000' },
    { APP_SESSION_E2E_PROFILE: '006', F001_AUTH_TIMEBOX: 'true' },
    { APP_SESSION_E2E_PROFILE: 'activation001', F001_AUTH_TIMEBOX: '30' },
  ]) assert.throws(() => fixtureProfile(env));
  assert.equal(fixtureProfile({ APP_SESSION_E2E_PROFILE: 'activation001', F001_AUTH_TIMEBOX: 'true' }).timebox, true);
  const owned011 = { APP_SESSION_E2E_PROFILE: '011', F011_RUN_NONCE: 'a'.repeat(32),
    F005_DB_PORT: '51001', F005_AUTH_PORT: '51002', F005_MAIL_PORT: '51003', F005_API_PORT: '51004' };
  assert.notEqual(fixtureProfile(owned011).project, fixtureProfile({ ...owned011, F011_RUN_NONCE: 'b'.repeat(32) }).project);
  for (const changes of [{ F011_RUN_NONCE: undefined }, { F005_AUTH_PORT: '55441' },
    { F005_AUTH_PORT: owned011.F005_DB_PORT }, { F005_API_PORT: '55644' }, { F005_DB_PORT: '65536' },
    { F005_WEB_PORT: '3000' }, { F001_AUTH_TIMEBOX: 'true' }, { APP_SESSION_E2E_PROFILE: '006' }]) {
    assert.throws(() => fixtureProfile({ ...owned011, ...changes }));
  }
});

test('runtime attestation rejects changed private configuration and unprotected disclosure', () => {
  const values = { ...appLocal, APP_SCHEMA_MODE: 'strict' };
  const digest = runtimeConfigDigest(values);
  const bound = { ...values, APP_ACTIVATION_CONFIG_DIGEST: digest };
  assert.equal(parseConfig(bound).activationConfigDigest, digest);
  assert.equal(runtimeConfigDigest({ ...values, VERCEL_REGION: 'icn1', PORT: '4199' }), digest);
  for (const changes of [
    { DATABASE_URL: valid.DATABASE_URL.replace('secret%40value', 'changed-secret-canary') },
    { PREVIEW_ACCESS_KEY: 'b'.repeat(64) }, { BROWSER_ORIGIN: 'http://127.0.0.1:55544' },
    { APP_AUTH_API_KEY: 'unexpected-public-key' }, { APP_AUTH_ADMIN_KEY: 'private-admin-canary' },
    { APP_ACTIVATION_CONFIG_DIGEST: 'not-a-digest' },
  ]) assert.throws(() => parseConfig({ ...bound, ...changes }), error => {
    assert.ok(error instanceof ConfigurationError);
    assert.doesNotMatch(error.message, /changed-secret-canary|private-admin-canary|unexpected-public-key/);
    return true;
  });
  assert.throws(() => parseConfig({ ...valid, APP_ACTIVATION_CONFIG_DIGEST: runtimeConfigDigest(valid) }),
    ConfigurationError);
});

const setupRuntime = () => ({
  ...hosted, VERCEL: undefined, PORT: undefined, APP_SCHEMA_MODE: 'strict', APP_FOUNDATION_ENABLED: 'true',
  SUPABASE_DATABASE_USER: `app_runtime.${hosted.SUPABASE_PROJECT_REF}`,
  DATABASE_URL: hosted.DATABASE_URL.replace('postgres.eotmpaliqcxxcotrcols:', 'app_runtime.eotmpaliqcxxcotrcols:'),
  APP_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
  APP_AUTH_URL: `https://${hosted.SUPABASE_PROJECT_REF}.supabase.co/auth/v1`,
  APP_AUTH_API_KEY: 'sb_publishable_synthetic', APP_EMAIL_ENABLED: 'false',
  APP_RETENTION_POLICY_ID: 'synthetic-explicit-retention',
  ETSY_ENABLED: 'false', ETSY_CLIENT_ID: 'fixture_app', ETSY_SHARED_SECRET: 'secret_canary',
  ETSY_CALLBACK_URL: 'https://api.lovora.us/integrations/etsy/callback',
  ETSY_RETURN_ORIGIN: 'https://return.example', ETSY_INVITATION_ORIGIN: 'https://invite.example',
  ETSY_INVITATION_TTL_SECONDS: '600', ETSY_RETENTION_SECONDS: '900',
  ETSY_TOKEN_ACTIVE_KEY_ID: 'fixture', ETSY_TOKEN_KEYRING: JSON.stringify({ fixture: Buffer.alloc(32, 9).toString('base64url') }),
});
function setupInput() {
  return { backupPolicy: 'synthetic-backup-policy', runtime: Object.fromEntries(
    Object.entries(setupRuntime()).filter(([, value]) => value !== undefined)) };
}
test('Etsy setup binds every explicit field while preserving absent-key legacy digest', () => {
  const legacy = Object.fromEntries([...activationBaseKeys, ...activationAppKeys].sort()
    .flatMap(key => hosted[key as keyof typeof hosted] === undefined ? [] : [[key, hosted[key as keyof typeof hosted]]]));
  assert.equal(runtimeConfigDigest(hosted), createHash('sha256').update(JSON.stringify(legacy)).digest('hex'));
  const input = setupInput(), output = prepareEtsyConfiguration(input);
  assert.equal(output.runtime.ETSY_ENABLED, 'false');
  assert.equal(output.runtimeDigest, runtimeConfigDigest(input.runtime));
  assert.notEqual(output.runtimeDigest, output.enabledValidationDigest);
  for (const field of etsyRuntimeKeys) {
    assert.notEqual(runtimeConfigDigest({ ...input.runtime, [field]: 'changed' }), output.runtimeDigest, field);
    const missing = { ...input.runtime }; delete missing[field];
    assert.throws(() => prepareEtsyConfiguration({ ...input, runtime: missing }), /setup input/);
  }
  for (const runtime of [
    { ...input.runtime, ETSY_TOKEN_KEYRING: 'secret_canary' },
    { ...input.runtime, APP_ACTIVATION_CONFIG_DIGEST: 'a'.repeat(64) },
    { ...input.runtime, VERCEL_TOKEN: 'secret_canary' },
    { ...input.runtime, APP_SCHEMA_MODE: 'activation-bridge' },
    { ...input.runtime, ETSY_INVITATION_TTL_SECONDS: '299' },
  ]) assert.throws(() => prepareEtsyConfiguration({ ...input, runtime }), error => {
    assert.doesNotMatch(String(error), /secret_canary/); return true;
  });
});
test('Etsy setup outputs are durable private no-clobber files and reject symlink paths', async t => {
  const directory = await mkdtemp(join(await import('node:fs/promises').then(fs => fs.realpath(tmpdir())), 'esty-setup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'prepared.json');
  saveEtsyConfiguration(setupInput(), output);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).runtime.ETSY_ENABLED, 'false');
  const before = await readFile(output);
  assert.throws(() => saveEtsyConfiguration(setupInput(), output));
  assert.deepEqual(await readFile(output), before);
  const alias = join(directory, 'alias'); await symlink(directory, alias);
  assert.throws(() => saveEtsyConfiguration(setupInput(), join(alias, 'unsafe.json')));
  const key = Buffer.alloc(32, 7), keyOutput = join(directory, 'key.json');
  saveEtsyKeyring(key, 'fixture', 'fixture-backup', keyOutput);
  assert.deepEqual(key, Buffer.alloc(32));
  assert.equal(JSON.parse(await readFile(keyOutput, 'utf8')).keyring.fixture, Buffer.alloc(32, 7).toString('base64url'));
  assert.equal((await stat(keyOutput)).mode & 0o777, 0o600);
  const result = spawnSync(process.execPath, [new URL('../scripts/etsy-setup.js', import.meta.url).pathname],
    { env: {}, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /secret_canary|fixture_app|postgresql:| at /);
});
