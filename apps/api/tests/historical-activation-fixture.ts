import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import { mock } from 'node:test';
import { fileURLToPath } from 'node:url';

const cases = new Set([
  'activation preserves known IDs and refuses promotion after unknown acknowledgement or runtime attestation failure',
  'provider runtime configuration attestation cannot be replaced by deployment metadata or leaked on denial',
  'manual CLI partition attestation preserves exact runtime bytes and rejects unsupported transport evidence',
  'unknown Secret writes stay fenced across restart and cannot be reconciled from metadata',
  'transferred receipts permit only the untouched FE gate after separately approved inventory and remote confirmation',
  'Secret configuration accepts one-way201 acknowledgement without decrypting saved values',
  'Secret metadata respects authoritative visibility and binds both runtime phases',
  'Secret configuration fences incomplete or changed acknowledgements and metadata without readback or retry',
  'lost remote acknowledgement after a durable Secret receipt is read-only recoverable without another write',
  'missing or substituted durable Secret receipts prevent candidate execution after restart',
  'configuration receipt persistence failure cannot be repaired by replaying the Secret write',
  'configuration refuses privileged credential aliases before mutation or decryption and fences post-write discovery',
  'held CLI awaits readonly stage disposal, preserves outside symlinks and retains primary read errors',
  'post-repair and fixed correction native CREATE preserve forced prebuilt staging and capability isolation',
  'journal mode and event tampering prevent all later phase effects',
  'failed-preflight archive proves intact reservation and rejects events, initial proof, changed lock and incomplete inventory',
]);
const selected = process.env.ESTY_TEST_ACTIVATION_CASE;
if (selected !== undefined) {
  assert.ok(cases.has(selected), 'Only explicitly authorized historical test cases may use this fixture');
  // Test-only historical compilation fixture, installed before application imports.
  // Never derive this identity from the current generated migration module.
  const migrationManifest = Object.freeze([
    Object.freeze({ name: '1792972800000-foundation', sha256: 'c3374f370c42d8543bde5771d4cddd91990e643e8969fcaf4bf1c5ffe3e4e851' }),
    Object.freeze({ name: '1792972800001-app-foundation', sha256: '4416736cb809720359dd0d650a3d530e6c3836be683f7c1700a8da8138df9608' }),
    Object.freeze({ name: '1792972800002-app-session-check', sha256: '49316100a5c98a852ef28ccb99d6e2a4306da9d5baf9631d4643a26d9d1c82f2' }),
  ]);
  const expectedMigrations = Object.freeze([
    '1792972800000-foundation', '1792972800001-app-foundation', '1792972800002-app-session-check',
  ]);
  assert.equal(createHash('sha256').update(JSON.stringify(migrationManifest)).digest('hex'),
    '149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3');
  assert.deepEqual(migrationManifest.map(entry => entry.name), expectedMigrations);
  const options = { cache: true, exports: { migrationManifest, expectedMigrations } };
  mock.module(new URL('../src/generated/migrations.js', import.meta.url).href, options);
  let networkAttempts = 0;
  const deny = () => { networkAttempts++; throw new Error('Historical fixture has no network or listener authority'); };
  net.Socket.prototype.connect = deny; net.Server.prototype.listen = deny; tls.connect = deny;
  dgram.createSocket = deny; globalThis.fetch = deny;
  process.on('exit', () => { if (networkAttempts) process.exitCode = 97; });
}

export function historicalActivationChild(name: string): boolean {
  assert.ok(cases.has(name), 'Historical child selection must be explicit');
  if (selected !== undefined) { assert.equal(selected, name); return false; }
  const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import', import.meta.url, '--test', '--test-reporter=tap',
    '--test-name-pattern=^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
    fileURLToPath(new URL('./ci.test.js', import.meta.url))], {
    env: { PATH: '/usr/bin:/bin', ESTY_TEST_ACTIVATION_CASE: name }, encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const count = child.stdout.match(/^# tests (\d+)$/m), skipped = child.stdout.match(/^# skipped (\d+)$/m);
  assert.ok(count && Number(count[1]) > 0, 'The selected historical assertions must execute');
  assert.equal(skipped?.[1], '0', 'Historical isolation must not skip assertions');
  console.info(JSON.stringify({ event: 'historical_fixture', case: name, tests: Number(count[1]), skipped: 0 }));
  return true;
}
