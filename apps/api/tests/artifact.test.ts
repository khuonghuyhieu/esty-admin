import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chmod, writeFile, readFile, unlink, symlink, cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { artifactFixture, routineIngressFixture } from './artifact-fixture.js';
import { assembleArtifact, canonical, inventory, readArtifactFile, sha256, snapshotArtifact, toolPins, verifyArtifact } from '../scripts/artifact.js';
import { verifyToolPackage } from '../scripts/build-artifact.js';
import { extractRoutineBundle, verifyRoutineBundle, verifyRoutineTransfer } from '../scripts/routine-retained.mjs';

test('L1 independently approved retained archive preserves exact operator and controller source closure', async t => {
  const f = await routineIngressFixture(); t.after(f.dispose);
  const transfer = verifyRoutineTransfer(f.transfer, f.selection, f.context);
  const destination = join(f.root, 'consumed');
  await extractRoutineBundle(transfer.archive, transfer.approval.archiveDigest, destination);
  const artifact = await verifyRoutineBundle(destination, transfer.approval, f.selection, f.context, f.sourceRoot);
  assert.equal(artifact.digest, f.artifact.digest);
  assert.deepEqual(inventory(join(destination, 'runner')), inventory(join(f.bundle, 'runner')));
  await assert.rejects(verifyRoutineBundle(destination, transfer.approval, f.selection, f.context, f.root));
  const wrongHashDestination = join(f.root, 'wrong-hash');
  await assert.rejects(extractRoutineBundle(transfer.archive, '0'.repeat(64), wrongHashDestination));
  assert.equal(existsSync(wrongHashDestination), false);
});

test('L1 retained transfer refuses circular approval, changed bytes, symlinks and extra files', async t => {
  for (const change of ['archive-bytes', 'sidecar', 'circular-approval', 'symlink', 'extra-file']) await t.test(change, async t => {
    const f = await routineIngressFixture(); t.after(f.dispose);
    const archive = join(f.transfer, 'be-release.tar.gz');
    if (change === 'archive-bytes' || change === 'circular-approval') await writeFile(archive, Buffer.concat([f.archive, Buffer.from('changed')]));
    if (change === 'sidecar') await writeFile(join(f.transfer, 'be-release-approval.json'), '{"private":"synthetic-canary"}');
    if (change === 'circular-approval') await writeFile(join(f.transfer, 'be-release-approval.json'),
      canonical({ ...f.approval, archiveDigest: sha256(await readFile(archive)) }) + '\n');
    if (change === 'symlink') { await unlink(archive); await symlink(join(f.transfer, 'be-release-approval.json'), archive); }
    if (change === 'extra-file') await writeFile(join(f.transfer, 'unexpected.mjs'), 'throw new Error("must not execute");');
    assert.throws(() => verifyRoutineTransfer(f.transfer, f.selection, f.context));
  });
});

test('L1 runtime operator and checks receipt cannot substitute altered or partial evidence', async t => {
  for (const change of ['operator-bytes', 'operator-mode', 'operator-extra', 'receipt-failed', 'receipt-development',
    'receipt-source', 'receipt-tree', 'receipt-missing']) await t.test(change, async t => {
    const f = await routineIngressFixture(); t.after(f.dispose);
    const runner = join(f.bundle, 'runner'), file = join(runner, 'apps/api/build/scripts/migrate.js');
    if (change === 'operator-bytes') { await chmod(file, 0o600); await writeFile(file, 'throw new Error("never execute");'); await chmod(file, 0o444); }
    if (change === 'operator-mode') await chmod(file, 0o555);
    if (change === 'operator-extra') { await chmod(runner, 0o700); await writeFile(join(runner, 'unexpected.mjs'), 'export {};'); }
    if (change.startsWith('receipt-')) {
      const path = join(f.bundle, 'receipt.json'), receipt = JSON.parse(await readFile(path, 'utf8'));
      if (change === 'receipt-failed') receipt.functional = 'failed';
      if (change === 'receipt-development') receipt.mode = 'development';
      if (change === 'receipt-source') receipt.source = '0'.repeat(64);
      if (change === 'receipt-tree') receipt.tree = '0'.repeat(40);
      if (change === 'receipt-missing') delete receipt.nativeHttpDatabase;
      await writeFile(path, JSON.stringify(receipt));
    }
    await assert.rejects(verifyRoutineBundle(f.bundle, f.approval, f.selection, f.context, undefined));
  });
});

test('sealed private snapshots retain exact migration/runtime content independently of their source directory', async t => {
  const fixture = await artifactFixture(); t.after(fixture.dispose);
  const snapshot = await snapshotArtifact(fixture.artifact); t.after(snapshot.dispose);
  const file = fixture.artifact.manifest.files.find(file => file.path.endsWith('src/main.js'))!;
  await chmod(join(fixture.artifact.root, file.path), 0o600);
  await writeFile(join(fixture.artifact.root, file.path), 'changed');
  assert.throws(() => verifyArtifact(fixture.artifact.root, fixture.artifact.digest));
  assert.equal(readArtifactFile(snapshot.root, file.path).toString(), 'export {};\n');
  assert.equal(verifyArtifact(snapshot.root, snapshot.digest).manifest.migrationDigest, fixture.artifact.manifest.migrationDigest);
});
test('missing, extra, private, symlink, mode and content mutations invalidate approval', async t => {
  for (const change of ['missing', 'extra', 'private', 'symlink', 'mode', 'content']) await t.test(change, async t => {
    const fixture = await artifactFixture(); t.after(fixture.dispose);
    const path = join(fixture.artifact.root, '.vercel/output/functions/index.func/apps/api/src/main.js');
    await chmod(join(fixture.artifact.root, '.vercel/output/functions/index.func/apps/api/src'), 0o700);
    if (change === 'missing') await unlink(path);
    if (change === 'symlink') { await unlink(path); await symlink('/etc/hosts', path); }
    if (change === 'mode') await chmod(path, 0o666);
    if (change === 'content') { await chmod(path, 0o600); await writeFile(path, 'export const tampered = true;'); await chmod(path, 0o444); }
    if (change === 'private' || change === 'extra') await writeFile(join(fixture.artifact.root, '.vercel/output/functions/index.func/apps/api/src', change === 'private' ? '.env' : 'extra.js'), 'synthetic');
    assert.throws(() => verifyArtifact(fixture.artifact.root, fixture.artifact.digest));
  });
});
test('independent artifact/source approval rejects stale identity and development artifacts', async t => {
  const fixture = await artifactFixture('development'); t.after(fixture.dispose);
  const expected = { revision: fixture.artifact.manifest.source.revision, migrationDigest: fixture.artifact.manifest.migrationDigest, repository: fixture.artifact.manifest.source.repository };
  assert.throws(() => verifyArtifact(fixture.artifact.root, '0'.repeat(64)));
  for (const changes of [{ revision: 'c'.repeat(40) }, { migrationDigest: 'd'.repeat(64) }, { repository: 'https://github.com/other/repository' }, { release: true }]) {
    assert.throws(() => verifyArtifact(fixture.artifact.root, fixture.artifact.digest, { ...expected, ...changes }));
  }
  for (const path of ['../provenance.json', 'operator/../../secret', '.vercel/output/.env', '/etc/hosts', 'a\\b']) {
    assert.throws(() => readArtifactFile(fixture.artifact.root, path));
  }
});
test('assembly refuses wrong entrypoint, runtime, controls, private environment and external dependency maps', async t => {
  for (const change of [{ handler: 'apps/api/src/app.js' }, { runtime: 'nodejs22.x' }, { maxDuration: 60 },
    { supportsCancellation: false }, { environment: { PRIVATE_VALUE: 'synthetic' } }, { filePathMap: { './external.js': '/etc/hosts' } }]) {
    const fixture = await artifactFixture(); t.after(fixture.dispose);
    const path = join(fixture.raw, 'functions/index.func/.vc-config.json');
    await writeFile(path, JSON.stringify({ ...JSON.parse(await readFile(path, 'utf8')), ...change }));
    await assert.rejects(assembleArtifact({ raw: fixture.raw, operator: fixture.operator, destination: join(fixture.root, 'rejected'),
      source: fixture.artifact.manifest.source, build: fixture.artifact.manifest.build, config: fixture.config, migrations: fixture.artifact.manifest.migrations }));
  }
});
test('approval cannot override incompatible platform, target, tool pins or migration provenance', async t => {
  for (const change of ['platform', 'target', 'tools', 'config', 'migrations']) await t.test(change, async t => {
    const fixture = await artifactFixture(); t.after(fixture.dispose);
    const manifest = structuredClone(fixture.artifact.manifest);
    if (change === 'platform') manifest.build.platform = 'darwin';
    if (change === 'target') (manifest.target as { project: string }).project = 'prj_other';
    if (change === 'tools') manifest.build.tools[0]!.integrity = 'untrusted';
    if (change === 'config') manifest.configDigest = '0'.repeat(64);
    if (change === 'migrations') manifest.migrations[0]!.sha256 = '0'.repeat(64);
    const bytes = canonical(manifest) + '\\n';
    const path = join(fixture.artifact.root, 'provenance.json');
    await chmod(path, 0o600); await writeFile(path, bytes); await chmod(path, 0o444);
    assert.throws(() => verifyArtifact(fixture.artifact.root, sha256(bytes)));
  });
});

test('tool package integrity gates provenance on complete own-package contents and metadata', async t => {
  for (const change of ['unchanged', 'separate dependencies', 'extra module', 'extra executable', 'missing', 'changed',
    'executable mode', 'symlink file', 'symlink directory', 'symlink dependencies', 'dangling dependencies',
    'nested node_modules', 'extra directory', 'special mode']) await t.test(change, async t => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'esty-tool-integrity-')));
    t.after(() => rm(root, { recursive: true, force: true }));
    const published = join(root, 'published'), installed = join(root, 'installed');
    await mkdir(join(published, 'dist'), { recursive: true });
    await writeFile(join(published, 'package.json'), JSON.stringify({ name: 'vercel', version: toolPins.vercel.version }), { mode: 0o644 });
    await writeFile(join(published, 'dist/vc.js'), 'export const synthetic = true;\n', { mode: 0o755 });
    await cp(published, installed, { recursive: true });
    const entry = join(installed, 'dist/vc.js');
    if (change === 'separate dependencies' || change === 'nested node_modules') {
      const boundary = join(installed, change === 'separate dependencies' ? 'node_modules' : 'dist/node_modules');
      await mkdir(join(boundary, 'dependency'), { recursive: true });
      await writeFile(join(boundary, 'dependency/index.js'), 'export const dependency = true;\n');
    }
    if (change === 'extra module') await writeFile(join(installed, 'dist/extra.js'), 'export const extra = true;\n');
    if (change === 'extra executable') await writeFile(join(installed, 'extra'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    if (change === 'missing') await unlink(entry);
    if (change === 'changed') await writeFile(entry, 'export const altered = true;\n');
    if (change === 'executable mode') await chmod(entry, 0o644);
    if (change === 'special mode') await chmod(entry, 0o4755);
    if (change === 'symlink file') { await unlink(entry); await symlink(join(published, 'dist/vc.js'), entry); }
    if (change === 'symlink directory') { await rm(join(installed, 'dist'), { recursive: true }); await symlink(join(published, 'dist'), join(installed, 'dist')); }
    if (change === 'symlink dependencies' || change === 'dangling dependencies') {
      await symlink(join(root, change === 'symlink dependencies' ? 'published' : 'absent'), join(installed, 'node_modules'));
    }
    if (change === 'extra directory') await mkdir(join(installed, 'extra'));
    if (change === 'unchanged' || change === 'separate dependencies') {
      assert.equal(verifyToolPackage('vercel', installed, published).filesDigest, sha256(canonical(inventory(published).files)));
    } else {
      assert.throws(() => verifyToolPackage('vercel', installed, published));
    }
  });
});

test('staged operator imports and no-input CLIs remain closed over the isolated package', { timeout: 90000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'esty-staged-operator-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'), isolated = join(root, 'package');
  await mkdir(home);
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home };
  const api = fileURLToPath(new URL('../../', import.meta.url));
  const staged = spawnSync(process.execPath, [join(api, 'scripts/stage-operator.mjs')], {
    cwd: root, env, encoding: 'utf8', timeout: 45000,
  });
  assert.equal(staged.status, 0, staged.stderr);
  await cp(join(api, 'build/operator'), isolated, { recursive: true });
  const before = inventory(isolated);
  const scripts = join(isolated, 'apps/api/build/scripts');
  const guard = join(root, 'no-network.mjs'), probe = join(root, 'probe.mjs');
  await writeFile(guard, `
    import net from 'node:net';
    import tls from 'node:tls';
    import dgram from 'node:dgram';
    let attempts = 0;
    const deny = () => { attempts++; throw new Error('Unexpected network attempt'); };
    globalThis.fetch = deny;
    net.Socket.prototype.connect = deny;
    tls.connect = deny;
    dgram.createSocket = deny;
    process.on('exit', () => { if (attempts) process.exitCode = 97; });
  `);
  await writeFile(probe, `
    import assert from 'node:assert/strict';
    // Exercise runtime-selected isolated package boundaries, never checkout imports.
    const migration = await import(${JSON.stringify(pathToFileURL(join(scripts, 'ci-migrations.js')).href)});
    const delivery = await import(${JSON.stringify(pathToFileURL(join(scripts, 'ci-delivery.js')).href)});
    assert.throws(() => migration.approvedSchema(undefined));
    assert.throws(() => delivery.deliveryContext({}, 'a'.repeat(40)));
    const setup = await import(${JSON.stringify(pathToFileURL(join(scripts, 'etsy-setup.js')).href)});
    const release = await import(${JSON.stringify(pathToFileURL(join(scripts, 'etsy-release.js')).href)});
    const owner = await import(${JSON.stringify(pathToFileURL(join(scripts, 'etsy-owner.js')).href)});
    assert.throws(() => setup.prepareEtsyConfiguration({ runtime: { ETSY_ENABLED: 'false' } }));
    assert.throws(() => release.validateEtsyReleasePacket({}, 'a'.repeat(64)));
    assert.throws(() => new owner.EtsyOwnerClient({}));
    console.log(JSON.stringify({ unapprovedSchema: 'refused', unapprovedDelivery: 'refused' }));
  `);
  // No checkout reads, writes, child processes, addons or ambient module/auth paths.
  const permissions = ['--permission', `--allow-fs-read=${isolated}`, `--allow-fs-read=${guard}`,
    `--allow-fs-read=${probe}`, '--import', pathToFileURL(guard).href];
  const imported = spawnSync(process.execPath, [...permissions, probe], {
    cwd: isolated, env, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(imported.status, 0, imported.stderr);
  assert.deepEqual(JSON.parse(imported.stdout), { unapprovedSchema: 'refused', unapprovedDelivery: 'refused' });
  const buildCli = spawnSync(process.execPath, [...permissions, join(scripts, 'build-artifact.js')], {
    cwd: isolated, env, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(buildCli.status, 0, buildCli.stderr);
  assert.match(buildCli.stdout, /^ARTIFACT_BUILD_INPUT_REQUIRED:/);
  const deliveryCli = spawnSync(process.execPath, [...permissions, join(scripts, 'ci-delivery.js')], {
    cwd: isolated, env, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(deliveryCli.status, 1, deliveryCli.stderr);
  for (const name of ['etsy-setup.js', 'etsy-release.js', 'etsy-owner.js']) {
    const result = spawnSync(process.execPath, [...permissions, join(scripts, name)], {
      cwd: isolated, env, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, / at |postgresql:|Bearer /);
  }
  assert.deepEqual(inventory(isolated), before);
});
