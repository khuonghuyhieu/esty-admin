import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { executableInventory, guardedOwnerCommand } from '../scripts/activation-input-launcher.mjs';

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
