import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const canary = 'synthetic-startup-secret-never-log';
const main = new URL('../src/main.js', import.meta.url).href;
const app = new URL('../src/app.js', import.meta.url).href;
const config = new URL('../src/config/config.js', import.meta.url).href;
const hosted = {
  API_RUNTIME: 'vercel', VERCEL: '1', PREVIEW_ACCESS_KEY: 'a'.repeat(64),
  SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
  SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
  DATABASE_URL: `postgresql://postgres.eotmpaliqcxxcotrcols:${canary}@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
  BROWSER_ORIGIN: 'https://app.lovora.us',
};

async function runStartup(mode: 'managed' | 'import' | 'initializer' | 'hang' | 'bind' | 'config' | 'unknown-config',
  overrides: NodeJS.ProcessEnv = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'esty-startup-test-'));
  const fixture = join(directory, 'invoke.mjs');
  // The permanent regression models the public import/capture/bind contract.
  // A separate smoke runs the unchanged pinned official bridge, not this model.
  // Deliberate process/real-clock integration: prove the production startup
  // watchdog exits a hung initializer and does not kill a managed live server.
  const source = `
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { registerHooks } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
const mode = ${JSON.stringify(mode)};
const canary = ${JSON.stringify(canary)};
// No accidental DB or other outbound connection can escape this child.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = args[0];
  const host = typeof options === 'object' ? (options.host ?? options[0]?.host) : args[1];
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('OUTBOUND_FORBIDDEN');
  return Reflect.apply(connect, this, args);
};
registerHooks({
  resolve(specifier, context, next) {
    if (mode === 'import' && context.parentURL === ${JSON.stringify(app)} && specifier === './platform/vercel.js') {
      const error = new Error(canary); error.code = 'ERR_MODULE_NOT_FOUND'; throw error;
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (mode === 'unknown-config' && url === ${JSON.stringify(config)}) {
      return { format: 'module', shortCircuit: true, source: \`
        import { ConfigurationError } from ${JSON.stringify(config + '?original')};
        export { ConfigurationError };
        export function loadConfig() { throw new ConfigurationError(${JSON.stringify(canary)}, ${JSON.stringify(canary)}); }
      \` };
    }
    if (mode === 'bind' && url === ${JSON.stringify(config)}) {
      return { format: 'module', shortCircuit: true, source: \`
        export { ConfigurationError } from ${JSON.stringify(config + '?original')};
        import { loadConfig as original } from ${JSON.stringify(config + '?original')};
        export function loadConfig() { return { ...original(), host: '127.0.0.1' }; }
      \` };
    }
    if ((mode === 'initializer' || mode === 'hang') && url === ${JSON.stringify(app)}) {
      return { format: 'module', shortCircuit: true, source: \`
        import { Module } from '@nestjs/common';
        export function createApplicationModule() {
          class FailingModule {}
          Module({ providers: [{ provide: 'startup-fixture', useFactory: () => {
            \${mode === 'hang' ? 'return Promise.withResolvers().promise;' : 'const error = new TypeError(' + JSON.stringify(canary) + '); error.name = error.code = ' + JSON.stringify(canary) + '; throw error;'}
          } }] })(FailingModule);
          return FailingModule;
        }
        export function configureApplication() {}
      \` };
    }
    return next(url, context);
  },
});
let captured;
const capture = Promise.withResolvers();
const original = http.Server.prototype.listen;
if (mode === 'managed') {
  http.Server.prototype.listen = function () {
    captured = this;
    capture.resolve();
    http.Server.prototype.listen = original;
    return this;
  };
} else if (mode === 'bind') {
  const occupied = http.createServer();
  const listening = once(occupied, 'listening');
  occupied.listen(0, '127.0.0.1');
  await listening;
  process.env.PORT = String(occupied.address().port);
}
if (mode === 'managed') {
  let imported = false;
  const loading = import(${JSON.stringify(main)}).then(() => { imported = true; });
  await Promise.race([loading, delay(2500)]);
  if (!imported) {
    console.info(JSON.stringify({ regression: 'import_waits_for_managed_listen', captured: Boolean(captured) }));
    process.exit(2);
  }
  await Promise.race([capture.promise, delay(1000)]);
  assert.ok(captured, 'Canonical startup must supply an HTTP server');
  const listening = once(captured, 'listening');
  captured.listen(0, '127.0.0.1');
  await listening;
  const origin = 'http://127.0.0.1:' + captured.address().port;
  const denied = await fetch(origin + '/health/ready');
  assert.equal(denied.status, 401); await denied.arrayBuffer();
  const live = await fetch(origin + '/health/live', { headers: { Authorization: 'Bearer ' + process.env.PREVIEW_ACCESS_KEY } });
  assert.equal(live.status, 200);
  assert.equal((await live.json()).status, 'ok');
  // Nest's callback is intentionally discarded by managed interception. The
  // actual listening event, not that unresolved callback, must cancel the bound.
  await delay(8250);
  const stillLive = await fetch(origin + '/health/live', { headers: { Authorization: 'Bearer ' + process.env.PREVIEW_ACCESS_KEY } });
  assert.equal(stillLive.status, 200); await stillLive.arrayBuffer();
  console.info(JSON.stringify({ journey: 'managed_live_denial_survives_startup_deadline' }));
  process.kill(process.pid, 'SIGTERM');
} else {
  await import(${JSON.stringify(main)});
}
`;
  await writeFile(fixture, source);
  try {
    const began = performance.now();
    const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; signal: string | null; text: string; killed: boolean }>();
    const child = spawn(process.execPath, [fixture], {
      cwd: directory, env: { ...hosted, ...(mode === 'config' ? { DATABASE_URL: canary } : {}), ...overrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let text = '', killed = false;
    const timeout = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, 16000);
    child.stdout.on('data', chunk => { text += chunk; });
    child.stderr.on('data', chunk => { text += chunk; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, text, killed }); });
    const result = await promise;
    assert.equal(result.killed, false, 'Startup must terminate or serve within its own bound');
    assert.ok(!result.text.includes(canary), 'Startup output disclosed the secret sentinel');
    const events = result.text.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    return { ...result, events, elapsed: performance.now() - began };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('canonical entrypoint resolves under managed listener interception and preserves protected HTTP and shutdown', async () => {
  const result = await runStartup('managed');
  assert.equal(result.signal, 'SIGTERM');
  assert.ok(result.events.some(event => event.journey === 'managed_live_denial_survives_startup_deadline'), 'Managed HTTP journey must finish before shutdown');
});

for (const [mode, stage, errorClass, code] of [
  ['import', 'module-import', 'Error', 'ERR_MODULE_NOT_FOUND'],
  ['initializer', 'NestFactory', 'TypeError', undefined],
  ['hang', 'NestFactory', undefined, 'STARTUP_TIMEOUT'],
  ['bind', 'listen', 'Error', 'EADDRINUSE'],
  ['config', 'config', 'ConfigurationError', undefined],
] as const) {
  test(`startup ${mode} failure exits bounded without disclosing import/provider/config secrets`, async () => {
    const result = await runStartup(mode);
    assert.equal(result.code, 1);
    assert.ok(result.elapsed < 12000);
    const failure = result.events.find(event => event.event === 'startup_failure');
    assert.ok(failure, 'Failure must be diagnosable without raw errors');
    assert.equal(failure.stage, stage);
    assert.equal(failure.errorClass, errorClass);
    assert.equal(failure.code, code);
    if (mode === 'config') assert.equal(failure.field, 'DATABASE_URL');
    assert.ok(!result.events.some(event => event.stage === 'listening'), 'Failed startup must not claim serving');
  });
}

test('startup config rejects identify only fixed app and Etsy fields without values', async t => {
  const enabled: NodeJS.ProcessEnv = {
    API_RUNTIME: 'local', VERCEL: undefined,
    APP_FOUNDATION_ENABLED: 'true', APP_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
    APP_AUTH_URL: 'http://127.0.0.1:54321', APP_AUTH_API_KEY: canary, APP_EMAIL_ENABLED: 'false',
    APP_RETENTION_POLICY_ID: 'synthetic-policy',
    DATABASE_URL: `postgresql://app_runtime:${canary}@127.0.0.1:55432/postgres`,
    ETSY_ENABLED: 'true', ETSY_CLIENT_ID: canary, ETSY_SHARED_SECRET: canary,
    ETSY_CALLBACK_URL: 'https://api.lovora.us/integrations/etsy/callback',
    ETSY_RETURN_ORIGIN: 'https://app.lovora.us', ETSY_INVITATION_ORIGIN: 'https://app.lovora.us',
    ETSY_INVITATION_TTL_SECONDS: '300', ETSY_RETENTION_SECONDS: '300',
    ETSY_TOKEN_ACTIVE_KEY_ID: 'synthetic', ETSY_TOKEN_KEYRING: JSON.stringify({ synthetic: Buffer.alloc(32, 1).toString('base64url') }),
  };
  for (const [field, value] of [
    ['APP_SCHEMA_MODE', canary], ['APP_FOUNDATION_ENABLED', canary], ['APP_WORKSPACE_ID', canary],
    ['APP_AUTH_URL', canary], ['APP_AUTH_API_KEY', `${canary} `], ['APP_EMAIL_ENABLED', canary],
    ['APP_AUTH_ADMIN_KEY', canary], ['APP_RETENTION_POLICY_ID', `${canary} `],
    ['APP_ACTIVATION_CONFIG_DIGEST', '0'.repeat(64)],
    ['ETSY_ENABLED', canary], ['ETSY_CLIENT_ID', `${canary} `], ['ETSY_SHARED_SECRET', `${canary} `],
    ['ETSY_CALLBACK_URL', canary], ['ETSY_RETURN_ORIGIN', canary], ['ETSY_INVITATION_ORIGIN', canary],
    ['ETSY_INVITATION_TTL_SECONDS', canary], ['ETSY_RETENTION_SECONDS', canary],
    ['ETSY_TOKEN_ACTIVE_KEY_ID', `${canary} `], ['ETSY_TOKEN_KEYRING', canary],
  ] as const) await t.test(field, async () => {
    const result = await runStartup('config', { ...enabled, [field]: value,
      ...(field === 'APP_FOUNDATION_ENABLED' ? { PREVIEW_ACCESS_KEY: undefined } : {}) });
    assert.equal(result.code, 1);
    const failure = result.events.find(event => event.event === 'startup_failure');
    assert.equal(failure?.stage, 'config');
    assert.equal(failure?.errorClass, 'ConfigurationError');
    assert.equal(failure?.field, field);
    assert.ok(!result.text.includes('0'.repeat(64)), 'Runtime digest values must not leave startup diagnostics');
    assert.deepEqual(result.events.filter(event => event.event === 'startup_stage').map(event => event.stage), ['entry', 'config']);
  });
  await t.test('unknown field and remedy stay omitted', async () => {
    const result = await runStartup('unknown-config');
    assert.equal(result.code, 1);
    const failure = result.events.find(event => event.event === 'startup_failure');
    assert.equal(failure?.errorClass, 'ConfigurationError');
    assert.equal(failure?.field, undefined);
    assert.equal(failure?.message, undefined);
    assert.equal(failure?.stack, undefined);
  });
});
