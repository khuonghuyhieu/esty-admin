import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { executableInventory, guardedOwnerCommand } from '../scripts/activation-input-launcher.mjs';
import { heldCorrection, heldCorrectionCapability } from '../scripts/activation-held-correction-contract.mjs';
import { heldD2, heldD2Sources } from '../scripts/activation-held-contract.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const runtimeHash = sha(readFileSync(process.execPath));
const source = fileURLToPath(new URL('../scripts/activation-input-launcher.mjs', import.meta.url));
function fixture(t) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'esty guarded helper-'))), root = join(parent, 'bundle');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const scripts = join(root, 'apps/api/build/scripts'), dependency = join(root, 'node_modules/fixture-dependency');
  mkdirSync(scripts, { recursive: true, mode: 0o700 }); mkdirSync(dependency, { recursive: true, mode: 0o700 });
  writeFileSync(join(root, 'apps/api/package.json'), '{"type":"module"}');
  writeFileSync(join(dependency, 'package.json'), '{"name":"fixture-dependency","main":"index.cjs"}');
  writeFileSync(join(dependency, 'index.cjs'), 'exports.marker="DEPENDENCY_BOUND";');
  writeFileSync(join(scripts, 'generated.js'), 'export const value="GENERATED_BOUND";');
  const entry = join(scripts, 'activation-input-helper.js');
  writeFileSync(entry, 'import {value} from "./generated.js"; import {createRequire} from "node:module"; const {marker}=createRequire(import.meta.url)("fixture-dependency"); export async function inputHelperMain(){console.log("HIDDEN_PROMPT:"+value+":"+marker);}');
  const launcher = join(root, 'launch.mjs'); cpSync(source, launcher);
  const manifestPath = join(parent, 'executable.json');
  const seal = (changes = {}) => {
    const manifest = { version: 2, entry: 'apps/api/build/scripts/activation-input-helper.js', launcher: 'launch.mjs',
      runtimes: [{ version: '24.22.1', platform: process.platform, arch: process.arch, sha256: runtimeHash }], ...executableInventory(root), ...changes };
    const bytes = JSON.stringify(manifest); writeFileSync(manifestPath, bytes);
    return { manifest, digest: sha(bytes) };
  };
  const approved = seal(), launcherHash = sha(readFileSync(launcher));
  const run = (digest = approved.digest) => spawnSync(process.execPath, [launcher, manifestPath, digest, 'prepare'], { encoding: 'utf8', env: {}, timeout: 10000 });
  const command = (runtime = process.execPath) => guardedOwnerCommand(runtime, launcher, runtimeHash, launcherHash, manifestPath, approved.digest, ['prepare']);
  return { parent, root, scripts, dependency, entry, launcher, manifestPath, approved, seal, run, command };
}
function refused(result) {
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /HIDDEN_PROMPT|UNREVIEWED_EXECUTED|WRONG_RUNTIME_EXECUTED/);
}
test('guarded owner command reaches only the fully bound generated and package dependency code', t => {
  const f = fixture(t), result = spawnSync('/bin/sh', ['-c', f.command()], { encoding: 'utf8', env: {}, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HIDDEN_PROMPT:GENERATED_BOUND:DEPENDENCY_BOUND/);
});
test('changed entry, generated import, package import or package metadata refuses before any helper code or prompt', t => {
  for (const path of ['apps/api/build/scripts/activation-input-helper.js', 'apps/api/build/scripts/generated.js',
    'node_modules/fixture-dependency/index.cjs', 'node_modules/fixture-dependency/package.json']) {
    const f = fixture(t);
    writeFileSync(join(f.root, path), 'console.log("UNREVIEWED_EXECUTED");');
    refused(f.run());
  }
});
test('missing, extra and symlinked executable records cannot hide behind an unchanged manifest', t => {
  for (const mutation of ['missing', 'extra', 'symlink']) {
    const f = fixture(t), path = join(f.scripts, 'generated.js');
    if (mutation === 'extra') writeFileSync(join(f.root, 'unreviewed.js'), 'console.log("UNREVIEWED_EXECUTED");');
    else { unlinkSync(path); if (mutation === 'symlink') symlinkSync(f.entry, path); }
    refused(f.run());
  }
});
test('manifest digest and exact runtime hash/version/platform/architecture mismatch refuse before TTY', t => {
  const f = fixture(t); refused(f.run(sha('wrong manifest')));
  for (const change of [{ sha256: sha('wrong binary') }, { version: '24.0.0' }, { platform: 'unknown' }, { arch: 'unknown' }]) {
    const changed = f.seal({ runtimes: [{ ...f.approved.manifest.runtimes[0], ...change }] });
    refused(f.run(changed.digest));
  }
});
test('runtime allowlist refuses missing current identity, duplicates, wildcard and legacy manifests', t => {
  const f = fixture(t), runtime = f.approved.manifest.runtimes[0];
  for (const changes of [{ version: 1 }, { runtimes: [] }, { runtimes: [runtime, runtime] },
    { runtimes: [{ ...runtime, platform: '*' }] }, { runtimes: [{ ...runtime, arch: '*' }] },
    { runtimes: [{ ...runtime, sha256: '' }] }]) {
    refused(f.run(f.seal(changes).digest));
  }
});
test('bootstrap hash check refuses modified launcher or wrong runtime before either executable runs', t => {
  const f = fixture(t);
  writeFileSync(f.launcher, 'console.log("UNREVIEWED_EXECUTED");');
  refused(spawnSync('/bin/sh', ['-c', f.command()], { encoding: 'utf8', env: {}, timeout: 10000 }));
  const g = fixture(t), fake = join(g.parent, 'wrong node');
  writeFileSync(fake, '#!/bin/sh\nprintf WRONG_RUNTIME_EXECUTED\n', { mode: 0o700 });
  refused(spawnSync('/bin/sh', ['-c', g.command(fake)], { encoding: 'utf8', env: {}, timeout: 10000 }));
});
test('an approved tree cannot execute an unbound external import through Node resolution fallback', t => {
  const f = fixture(t), external = join(f.parent, 'external.mjs');
  writeFileSync(external, 'console.log("UNREVIEWED_EXECUTED");');
  writeFileSync(f.entry, `import ${JSON.stringify(pathToFileURL(external).href)}; export async function inputHelperMain(){console.log("HIDDEN_PROMPT");}`);
  const changed = f.seal(); refused(f.run(changed.digest));
});

test('configuration capability permits bounded held, import and missing-five actions but rejects context or action substitution before entry', t => {
  const f = fixture(t), base = '/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports';
  const context = [
    `${base}/protected-real-transfer-state-vd3tg33z/ca-successor-36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed/successor.json`,
    '756f9802100c9c86a75f24d3e688e6a5f57d745b6f7f96b88555c2acd105d559',
    `${base}/bridge-reconciliation-fn1_56_z/receipt-copy/be-receipts`,
    `${base}/first-production-f162-h9czirsk/verified-transfer/artifact`,
  ];
  const capability = { selector: 'held-app-configuration', contextDigest: sha(JSON.stringify(context)), sourceDigests: {} };
  const sealed = f.seal({ heldAppCapability: capability });
  const run = (args, digest = sealed.digest) => spawnSync(process.execPath, [f.launcher, f.manifestPath, digest, ...args],
    { encoding: 'utf8', env: {}, timeout: 10000 });
  for (const args of [['held-app-configuration', 'create-held', ...context],
    ['held-app-configuration', 'attest-held', ...context],
    ['held-app-configuration', 'import-proof', '123', ...context],
    ['held-app-configuration', 'correct-missing-five', ...context]]) {
    const result = run(args); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /HIDDEN_PROMPT/);
  }
  for (const args of [
    ['prepare'], ['held-app-configuration', 'promote', ...context],
    ['held-app-configuration', 'create-held', ...context, 'https://caller.vercel.app'],
    ['held-app-configuration', 'create-held', ...context.slice(0, 3), '/different/artifact'],
    ['held-app-configuration', 'attest-held', ...context, 'dpl_CallerOverride'],
    ['held-app-configuration', 'attest-held', ...context.slice(0, 3), '/different/artifact'],
    ['held-app-configuration', 'import-proof', '0', ...context],
    ['held-app-configuration', 'import-proof', '123', ...context, 'caller-receipt.json'],
    ['held-app-configuration', 'correct-missing-five', ...context, 'upsert=true'],
    ['held-app-configuration', 'correct-missing-five', ...context.slice(0, 3), '/different/artifact'],
  ]) refused(run(args));
  const mixed = f.seal({ heldAppCapability: capability, diagnosticSelector: 'diagnose-app-schema-exposure',
    diagnosticContextDigest: capability.contextDigest });
  refused(run(['held-app-configuration', 'create-held', ...context], mixed.digest));
});

test('fixed correction launcher refuses unsealed publication and authority substitution before entry', t => {
  const f = fixture(t), base = '/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports';
  for (const name of ['activation-held-correction-contract.mjs', 'activation-held-contract.mjs'])
    cpSync(fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), join(f.scripts, name));
  const context = [
    `${base}/protected-real-transfer-state-vd3tg33z/ca-successor-36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed/successor.json`,
    '756f9802100c9c86a75f24d3e688e6a5f57d745b6f7f96b88555c2acd105d559',
    `${base}/bridge-reconciliation-fn1_56_z/receipt-copy/be-receipts`,
    `${base}/first-production-f162-h9czirsk/verified-transfer/artifact`,
  ];
  const capability = heldCorrectionCapability({ revision: 'a'.repeat(40), tree: 'c'.repeat(40) });
  const run = (changes, args = [heldCorrection.selector, 'create', ...context]) => {
    const sealed = f.seal(changes);
    return spawnSync(process.execPath, [f.launcher, f.manifestPath, sealed.digest, ...args],
      { encoding: 'utf8', env: {}, timeout: 10000 });
  };
  for (const args of [[heldCorrection.selector, 'create', ...context], [heldCorrection.selector, 'import-proof', '123', ...context]]) {
    const result = run({ heldCorrectionCapability: capability }, args);
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /HIDDEN_PROMPT/);
  }
  for (const invalid of [
    heldCorrectionCapability(null),
    { ...capability, controllerPublication: { revision: heldCorrection.sourceRevision, tree: heldCorrection.sourceTree } },
    { ...capability, controllerPublication: { ...capability.controllerPublication, unsealed: true } },
    { ...capability, sourceDigests: {} },
  ]) refused(run({ heldCorrectionCapability: invalid }));
  refused(run({}));
  refused(run({ heldCorrectionCapability: capability, heldAppCapability: { selector: 'held-app-configuration' } }));
  for (const args of [
    ['held-app-configuration', 'create-held', ...context],
    [heldCorrection.selector, 'correct-missing-five', ...context],
    [heldCorrection.selector, 'create', ...context, 'dpl_CallerOverride'],
    [heldCorrection.selector, 'create', ...context.slice(0, 3), '/different/artifact'],
    [heldCorrection.selector, 'import-proof', '0', ...context],
  ]) refused(run({ heldCorrectionCapability: capability }, args));
});

test('database-pair launcher admits only the sealed fixed repair and rejects publication, context or action substitution before entry', t => {
  const f = fixture(t), base = '/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports';
  for (const name of ['activation-held-correction-contract.mjs', 'activation-held-contract.mjs'])
    cpSync(fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), join(f.scripts, name));
  const context = [
    `${base}/protected-real-transfer-state-vd3tg33z/ca-successor-36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed/successor.json`,
    '756f9802100c9c86a75f24d3e688e6a5f57d745b6f7f96b88555c2acd105d559',
    `${base}/bridge-reconciliation-fn1_56_z/receipt-copy/be-receipts`,
    `${base}/first-production-f162-h9czirsk/verified-transfer/artifact`,
  ];
  const capability = { selector: 'held-db-config-repair-01', contextDigest: heldCorrection.contextDigest,
    controllerPublication: { revision: 'a'.repeat(40), tree: 'c'.repeat(40) } };
  const run = (changes, args = [capability.selector, ...context]) => {
    const sealed = f.seal(changes);
    return spawnSync(process.execPath, [f.launcher, f.manifestPath, sealed.digest, ...args],
      { encoding: 'utf8', env: {}, timeout: 10000 });
  };
  const valid = run({ heldDatabaseRepairCapability: capability });
  assert.equal(valid.status, 0, valid.stderr); assert.match(valid.stdout, /HIDDEN_PROMPT/);
  for (const publication of [null, { revision: 'f5d330c9784ec9d87df197ff780d30fde7073060', tree: 'c'.repeat(40) },
    { revision: '4c2c5a2a7834905d3942880acc3fbebbb0f2751d', tree: 'c'.repeat(40) },
    { revision: heldCorrection.sourceRevision, tree: heldCorrection.sourceTree },
    { ...capability.controllerPublication, extra: true }]) {
    refused(run({ heldDatabaseRepairCapability: { ...capability, controllerPublication: publication } }));
  }
  refused(run({}));
  refused(run({ heldDatabaseRepairCapability: { ...capability, keys: ['DATABASE_URL'] } }));
  refused(run({ heldDatabaseRepairCapability: capability, heldCorrectionCapability: heldCorrectionCapability(capability.controllerPublication) }));
  refused(run({ heldDatabaseRepairCapability: capability, heldAppCapability: { selector: 'held-app-configuration' } }));
  for (const args of [
    [capability.selector, 'create', ...context], [capability.selector, ...context, 'SUPABASE_DATABASE_USER'],
    [capability.selector, ...context.slice(0, 3), '/different/artifact'],
    ['held-config-correction-01', 'create', ...context], ['held-app-configuration', 'correct-missing-five', ...context],
    ['prepare', ...context],
  ]) refused(run({ heldDatabaseRepairCapability: capability }, args));
});

test('post-repair launcher binds only the new sealed generation and preserves old capability isolation', {
  skip: !process.env.HELD_POST_REPAIR_TEST_HELPER,
}, t => {
  const f = fixture(t), helper = process.env.HELD_POST_REPAIR_TEST_HELPER;
  const entry = readFileSync(f.entry);
  cpSync(join(helper, 'apps/api/build'), join(f.root, 'apps/api/build'), { recursive: true });
  cpSync(join(helper, 'node_modules'), join(f.root, 'node_modules'), { recursive: true });
  writeFileSync(f.entry, entry);
  const base = '/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports';
  const context = [
    `${base}/protected-real-transfer-state-vd3tg33z/ca-successor-36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed/successor.json`,
    '756f9802100c9c86a75f24d3e688e6a5f57d745b6f7f96b88555c2acd105d559',
    `${base}/bridge-reconciliation-fn1_56_z/receipt-copy/be-receipts`,
    `${base}/first-production-f162-h9czirsk/verified-transfer/artifact`,
  ];
  const capability = { ...heldCorrectionCapability({ revision: 'a'.repeat(40), tree: 'c'.repeat(40) }), selector: 'held-post-db-repair-01' };
  const run = (changes, args = [capability.selector, 'create', ...context]) => {
    const sealed = f.seal(changes);
    return spawnSync(process.execPath, [f.launcher, f.manifestPath, sealed.digest, ...args],
      { encoding: 'utf8', env: {}, timeout: 30000 });
  };
  for (const action of [['create'], ['import-proof', '123']]) {
    const result = run({ heldPostRepairCapability: capability }, [capability.selector, ...action, ...context]);
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /HIDDEN_PROMPT/);
  }
  for (const publication of [null,
    { revision: 'bd9e2611a3b0338aa8b7d3678a31e8d6cbeefdd3', tree: 'c'.repeat(40) },
    { revision: '4c2c5a2a7834905d3942880acc3fbebbb0f2751d', tree: 'c'.repeat(40) }]) {
    refused(run({ heldPostRepairCapability: { ...capability, controllerPublication: publication } }));
  }
  refused(run({}));
  refused(run({ heldPostRepairCapability: { ...capability, namespace: 'caller-generation' } }));
  refused(run({ heldPostRepairCapability: capability, heldCorrectionCapability: heldCorrectionCapability(capability.controllerPublication) }));
  refused(run({ heldCorrectionCapability: heldCorrectionCapability(capability.controllerPublication) }));
  for (const args of [
    ['held-config-correction-01', 'create', ...context], ['held-db-config-repair-01', ...context],
    [capability.selector, 'correct-missing-five', ...context], [capability.selector, 'create', ...context, 'dpl_Override'],
    [capability.selector, 'create', ...context.slice(0, 3), '/different/artifact'],
    [capability.selector, 'import-proof', '0', ...context],
  ]) refused(run({ heldPostRepairCapability: capability }, args));
});

test('D2 launcher rejects CREATE, mixed authority, stale publication and caller target before entry', t => {
  const f = fixture(t);
  cpSync(new URL('../scripts/activation-held-contract.mjs', import.meta.url), join(f.scripts, 'activation-held-contract.mjs'));
  const base = '/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports';
  const context = [
    `${base}/protected-real-transfer-state-vd3tg33z/ca-successor-36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed/successor.json`,
    '756f9802100c9c86a75f24d3e688e6a5f57d745b6f7f96b88555c2acd105d559',
    `${base}/bridge-reconciliation-fn1_56_z/receipt-copy/be-receipts`,
    `${base}/first-production-f162-h9czirsk/verified-transfer/artifact`,
  ];
  const capability = { selector: heldD2.selector, contextDigest: heldD2.contextDigest,
    controllerPublication: { revision: 'b'.repeat(40), tree: 'c'.repeat(40) },
    sourceDigests: Object.fromEntries(heldD2Sources.map(path => [path, sha(path)])) };
  const run = (changes, args = [heldD2.selector, 'prepare-candidate', ...context]) => {
    const seal = f.seal(changes);
    return spawnSync(process.execPath, [f.launcher, f.manifestPath, seal.digest, ...args], { env: {}, encoding: 'utf8', timeout: 10000 });
  };
  for (const action of [['prepare-candidate'], ['accept-candidate', '123'], ['promote'], ['accept-final', '456']]) {
    const result = run({ heldD2Capability: capability }, [heldD2.selector, ...action, ...context]);
    assert.equal(result.status, 0, result.stderr);
  }
  for (const publication of [null, { revision: '927be7af6c46722615fe8f9f356fffb1e7424dd7', tree: 'c'.repeat(40) }])
    refused(run({ heldD2Capability: { ...capability, controllerPublication: publication } }));
  refused(run({}));
  refused(run({ heldD2Capability: capability, heldPostRepairCapability: {} }));
  for (const args of [[heldD2.selector, 'create', ...context], [heldD2.selector, 'promote', ...context, 'dpl_Override'],
    [heldD2.selector, 'accept-final', '0', ...context], [heldD2.selector, 'prepare-candidate', ...context.slice(0, 3), '/other'],
    ['held-post-db-repair-01', 'create', ...context], ['prepare']]) refused(run({ heldD2Capability: capability }, args));
});
