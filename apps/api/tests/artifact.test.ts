import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, writeFile, readFile, unlink, symlink, cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { artifactFixture } from './artifact-fixture.js';
import { assembleArtifact, canonical, inventory, readArtifactFile, sha256, snapshotArtifact, toolPins, verifyArtifact } from '../scripts/artifact.js';
import { verifyToolPackage } from '../scripts/build-artifact.js';

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
