import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { artifactTarget, assembleArtifact, builderConfig, canonical, finalRoutes, sha256, toolPins, removeArtifactTree } from '../scripts/artifact.js';
import type { FileRecord, SourceIdentity, ToolEvidence, VerifiedArtifact } from '../scripts/artifact.js';

// Synthetic packaging inputs: these prove rejection/consumption, not native execution.
export async function artifactFixture(mode: SourceIdentity['mode'] = 'release', migrationSource = 'export function up() {}\n') {
  const root = await mkdtemp(join(realpathSync(tmpdir()), 'esty-artifact-test-'));
  const raw = join(root, 'raw'), operator = join(root, 'operator');
  await mkdir(raw); await mkdir(operator);
  const put = async (base: string, path: string, value: string | object) => {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const config = { $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'nestjs', git: { deploymentEnabled: false }, functions: { 'src/main.ts': { maxDuration: 10, supportsCancellation: true } } };
  const migration = { name: '1792972800000-foundation', sha256: sha256(migrationSource) };
  const record = (path: string, bytes: string): FileRecord => ({ path, mode: 0o644, size: Buffer.byteLength(bytes), sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
  const files = [record('apps/api/vercel.json', JSON.stringify(config)), record(`apps/api/migrations/${migration.name}.mjs`, migrationSource)];
  const source: SourceIdentity = { mode, revision: 'a'.repeat(40), tree: 'b'.repeat(40), repository: 'https://github.com/synthetic/repository', files, digest: sha256(canonical(files)) };
  await put(raw, 'config.json', { version: 3, routes: [{ handle: 'error' }, { status: 404, src: '^(?!/api).*$', dest: '/404.html' }, ...finalRoutes], framework: { slug: 'nestjs', version: '12.2.0' } });
  const prefix = 'functions/index.func/';
  await put(raw, prefix + '.vc-config.json', { handler: 'apps/api/src/main.js', runtime: 'nodejs24.x', architecture: 'x86_64', environment: {}, framework: { slug: 'nestjs' },
    shouldDisableAutomaticFetchInstrumentation: false, launcherType: 'Nodejs', shouldAddHelpers: true, shouldAddSourcemapSupport: true, awsLambdaHandler: '' });
  for (const name of ['main.js', 'app.js', 'generated/migrations.js']) await put(raw, prefix + 'apps/api/src/' + name, 'export {};\n');
  await put(raw, prefix + 'apps/api/package.json', { type: 'module' });
  for (const name of ['@nestjs/core', 'pg', '@vercel/functions', 'reflect-metadata']) await put(raw, prefix + `node_modules/${name}/package.json`, { name });
  await put(operator, 'apps/api/build/scripts/migrate.js', 'export {};\n');
  await put(operator, `apps/api/migrations/${migration.name}.mjs`, migrationSource);
  const tools: ToolEvidence[] = Object.entries(toolPins).map(([name, pin]) => ({ name: name as keyof typeof toolPins, ...pin, filesDigest: sha256('synthetic-package') }));
  const artifact = await assembleArtifact({ raw, operator, destination: join(root, 'sealed'), source, config, migrations: [migration],
    build: { node: artifactTarget.node, nodeSha256: sha256('synthetic-node'), npm: '11.19.1', platform: 'linux', arch: 'x64', tools, builderConfigDigest: sha256(canonical(builderConfig(config))), metadata: artifactTarget } });
  return { artifact, root, raw, operator, config, dispose: () => removeArtifactTree(root) };
}

export function fileTree(current: VerifiedArtifact, decimalModes = false): any[] {
  const root: any[] = [];
  for (const file of current.manifest.files.filter(file => file.path.startsWith('.vercel/output/'))) {
    const parts = file.path.split('/'); let children = root;
    for (const name of parts.slice(0, -1)) {
      let directory = children.find(entry => entry.name === name);
      if (!directory) { directory = { name, type: 'directory', children: [] }; children.push(directory); }
      children = directory.children;
    }
    const mode = 0o100000 | file.mode;
    children.push({ name: parts.at(-1), type: 'file', mode: decimalModes ? String(mode) : mode, uid: file.sha1 });
  }
  return [
    { name: 'src', type: 'directory', mode: 0o40555, children: root },
    { name: 'out', type: 'directory', mode: 0o40555, children: [{ name: 'index', type: 'lambda', mode: 0o140666 }] },
  ];
}
