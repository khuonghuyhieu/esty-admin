import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyMigrationFiles } from './migration-files.mjs';
import { migrationManifest } from '../build/src/generated/migrations.js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = resolve(appRoot, '../..');
const output = join(appRoot, 'build/operator');
let staging;
try {
  verifyMigrationFiles(join(appRoot, 'migrations'), migrationManifest);
  staging = await mkdtemp(join(appRoot, 'build/operator-stage-'));
  const targetApp = join(staging, 'apps/api');
  await mkdir(join(targetApp, 'build/scripts'), { recursive: true });
  await cp(join(appRoot, 'build/src'), join(targetApp, 'build/src'), { recursive: true });
  await cp(join(appRoot, 'build/config'), join(targetApp, 'build/config'), { recursive: true });
  for (const name of ['migrate.js', 'migrations.js', 'migration-files.mjs', 'migration-status.js', 'migration-report.js', 'private-files.mjs', 'bounded.js']) {
    await cp(join(appRoot, 'build/scripts', name), join(targetApp, 'build/scripts', name));
  }
  await mkdir(join(targetApp, 'migrations'));
  for (const { name } of migrationManifest) {
    await cp(join(appRoot, 'migrations', `${name}.mjs`), join(targetApp, 'migrations', `${name}.mjs`));
  }
  const pkg = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
  await writeFile(join(targetApp, 'package.json'), JSON.stringify({
    name: pkg.name, private: true, type: 'module', engines: pkg.engines, dependencies: pkg.dependencies,
  }, null, 2) + '\n');

  // Preserve installed resolution paths, including nested versions, without copying
  // the FE workspace, dev dependencies, environment files or any auth state.
  const copied = new Set();
  async function copyDependency(name, from, optional = false) {
    let cursor = from;
    let source;
    while (cursor.startsWith(repoRoot)) {
      const candidate = join(cursor, 'node_modules', name);
      try { await readFile(join(candidate, 'package.json')); source = candidate; break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (cursor === repoRoot) break;
      cursor = dirname(cursor);
    }
    if (!source) {
      if (optional) return;
      throw new Error('An installed operator dependency is missing; use the approved workspace install.');
    }
    if (copied.has(source)) return;
    copied.add(source);
    const dependency = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    await cp(source, join(staging, relative(repoRoot, source)), {
      recursive: true, filter: path => path === source || !relative(source, path).split('/').includes('node_modules'),
    });
    const required = { ...dependency.dependencies };
    for (const [peer, metadata] of Object.entries(dependency.peerDependenciesMeta ?? {})) {
      if (!metadata.optional && dependency.peerDependencies?.[peer]) required[peer] ??= dependency.peerDependencies[peer];
    }
    for (const peer of Object.keys(dependency.peerDependencies ?? {})) {
      if (!dependency.peerDependenciesMeta?.[peer]?.optional) required[peer] ??= dependency.peerDependencies[peer];
    }
    for (const child of Object.keys(required)) await copyDependency(child, source, Boolean(dependency.optionalDependencies?.[child]));
    for (const child of Object.keys(dependency.optionalDependencies ?? {})) await copyDependency(child, source, true);
  }
  for (const name of Object.keys(pkg.dependencies)) await copyDependency(name, appRoot);
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  staging = undefined;
  console.info(`Operator artifact staged at apps/api/build/operator (${copied.size} dependency packages).`);
} catch {
  console.error('Operator staging failed. Build the API, verify migration assets and install the approved dependencies.');
  process.exitCode = 1;
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
}
