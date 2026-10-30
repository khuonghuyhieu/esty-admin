import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

export const artifactTarget = Object.freeze({ project: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls',
  owner: 'team_k2Hk4wx5XAb9Mgc6lP5AjVhf', scope: 'khuonghuyhieu0705s-projects', target: 'production',
  root: 'apps/api', framework: 'nestjs', node: '24.22.1' });
export const toolPins = Object.freeze({
  vercel: { version: '65.4.0', integrity: 'sha512-2TfMSKn7OUP2X3AgvOfp1y6aL9F1MCVqBnuCyhrbI3M4IO0AYM08FotCnp9+OauzKA1LToNSSBtlJVOxUfDl4Q==' },
  '@vercel/nestjs': { version: '23.0.0', integrity: 'sha512-Fjl4DIpameou247OLdaVEw4/RbgckNVY/OrOB06iaKkD1eCOMhL+yzfBn4Tqc+wRiJDyqiaFHQGCPnxW98uUPg==' },
  '@vercel/node': { version: '28.0.0', integrity: 'sha512-EOq1lFLgStRDlWT3NC+ntw3DJQbH2FwOM/63Kzc9LiSiCdxdfiF0bWu2ZJzPeedHKp36exTFQgCS01PaXiG8lw==' },
  '@vercel/build-utils': { version: '15.1.0', integrity: 'sha512-IKJPszGj6EvnTf/o+K6+BHPtmqcGa6Mnc3LGScyNNKpwCDAYu1KwUabQ7+SI/jPx6IB/HfCfGc0Yu2Vc2C0DtQ==' },
});
export interface FileRecord { path: string; mode: number; size: number; sha256: string; sha1: string }
export interface DirectoryRecord { path: string; mode: number }
export interface SourceIdentity {
  mode: 'development' | 'release'; revision: string; tree: string; repository: string;
  digest: string; files: FileRecord[];
}
export interface ToolEvidence { name: keyof typeof toolPins; version: string; integrity: string; filesDigest: string }
export interface BuildEvidence {
  node: string; nodeSha256: string; npm: string; platform: string; arch: string;
  tools: ToolEvidence[]; builderConfigDigest: string; rawFiles: FileRecord[]; rawDigest: string;
  metadata: typeof artifactTarget;
}
export interface ArtifactManifest {
  version: 1; source: SourceIdentity; target: typeof artifactTarget; configDigest: string;
  migrations: Array<{ name: string; sha256: string }>; migrationDigest: string; build: BuildEvidence;
  files: FileRecord[]; directories: DirectoryRecord[];
}
export interface VerifiedArtifact { root: string; digest: string; manifest: ArtifactManifest }
const outputPrefix = '.vercel/output/';
const functionPrefix = `${outputPrefix}functions/index.func/`;
const handler = 'apps/api/src/main.js';
const hashPattern = /^[a-f0-9]{64}$/;
const maxFileBytes = 32 * 1024 * 1024;
const maxTotalBytes = 250 * 1024 * 1024;

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export function sha256(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function reject(): never { throw new Error('Artifact integrity or approved packaging contract differs.'); }
export function safePath(path: string): void {
  if (!path || path.length > 1024 || isAbsolute(path) || /[\\\x00-\x1f\x7f:]/.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..' || part.trim() !== part)) reject();
  for (const part of path.split('/')) {
    if (/^(?:\.env(?:\..*)?|\.git|\.openai|\.npmrc|\.netrc|auth\.json|(?:runtime|operator|deploy)(?:\.vercel)?\.json)$/i.test(part)
      || /\.(?:pem|key|p12|pfx)$/i.test(part)) reject();
  }
}
function safeRoot(root: string): string {
  const absolute = resolve(root);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute) reject();
  return absolute;
}
export function readArtifactFile(root: string, path: string, expected?: FileRecord): Buffer {
  safePath(path);
  root = safeRoot(root);
  const parts = path.split('/');
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) reject();
  }
  const fd = openSync(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > maxFileBytes || before.nlink !== 1) reject();
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (before.size !== bytes.length || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || realpathSync(join(root, path)) !== join(root, path)) reject();
    if (expected && (expected.path !== path || expected.size !== bytes.length || expected.mode !== (after.mode & 0o777)
      || expected.sha256 !== sha256(bytes) || expected.sha1 !== createHash('sha1').update(bytes).digest('hex'))) reject();
    return bytes;
  } finally { closeSync(fd); }
}
export function inventory(root: string, exclude: ReadonlySet<string> = new Set()): { files: FileRecord[]; directories: DirectoryRecord[] } {
  root = safeRoot(root);
  const files: FileRecord[] = [], directories: DirectoryRecord[] = [];
  const names = new Set<string>();
  let total = 0;
  function walk(path: string) {
    for (const name of readdirSync(join(root, path)).sort()) {
      const child = path ? `${path}/${name}` : name;
      safePath(child);
      if (exclude.has(child)) continue;
      const folded = child.toLowerCase();
      if (names.has(folded) || names.size >= 30000) reject();
      names.add(folded);
      const stat = lstatSync(join(root, child));
      if (stat.isSymbolicLink() || (stat.mode & 0o7000)) reject();
      if (stat.isDirectory()) { directories.push({ path: child, mode: stat.mode & 0o777 }); walk(child); }
      else if (stat.isFile()) {
        const bytes = readArtifactFile(root, child);
        total += bytes.length;
        if (total > maxTotalBytes) reject();
        files.push({ path: child, mode: stat.mode & 0o777, size: bytes.length, sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
      } else reject();
    }
  }
  walk('');
  return { files: files.sort((a, b) => a.path.localeCompare(b.path, 'en')), directories: directories.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
}
const sourceRoots = ['apps/api/src', 'apps/api/scripts', 'apps/api/tests', 'apps/api/config', 'apps/api/migrations'];
const sourceSingles = ['package.json', 'package-lock.json', 'apps/api/package.json', 'apps/api/tsconfig.json', 'apps/api/vercel.json', 'specs/001-connectivity-foundation/contracts/openapi.json'];
export function sourceFiles(root: string): FileRecord[] {
  const result: FileRecord[] = [];
  for (const path of sourceSingles) {
    const bytes = readArtifactFile(root, path), mode = lstatSync(join(root, path)).mode & 0o777;
    result.push({ path, mode, size: bytes.length, sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
  }
  for (const path of sourceRoots) {
    for (const file of inventory(join(root, path)).files) {
      if (!/\.(?:ts|mjs|json)$/.test(file.path)) reject();
      result.push({ ...file, path: `${path}/${file.path}` });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
export function assertSourceFiles(root: string, source: SourceIdentity): void {
  if (canonical(sourceFiles(root)) !== canonical(source.files) || sha256(canonical(source.files)) !== source.digest) reject();
}
export function builderConfig(sourceConfig: unknown): Record<string, unknown> {
  const expected = { $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'nestjs', git: { deploymentEnabled: false },
    functions: { 'src/main.ts': { maxDuration: 10, supportsCancellation: true } } };
  if (canonical(sourceConfig) !== canonical(expected)) reject();
  const { functions: _, ...input } = expected;
  return input;
}
function parsed(root: string, path: string): Record<string, any> {
  const value: unknown = JSON.parse(readArtifactFile(root, path).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
  return value as Record<string, any>;
}
export const finalRoutes = [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/', transforms: [{ type: 'request.path', op: 'set', args: '/$1' }] }];
function functionConfig(root: string, prefix: string, arch: string, final: boolean) {
  const config = parsed(root, `${prefix}.vc-config.json`);
  const allowed = ['handler', 'runtime', 'architecture', 'environment', 'framework', 'shouldDisableAutomaticFetchInstrumentation', 'launcherType',
    'shouldAddHelpers', 'shouldAddSourcemapSupport', 'awsLambdaHandler', 'maxDuration', 'supportsCancellation'];
  if (Object.keys(config).some(key => !allowed.includes(key)) || config.handler !== handler || config.runtime !== 'nodejs24.x'
    || config.architecture !== (arch === 'arm64' ? 'arm64' : 'x86_64') || !['arm64', 'x64'].includes(arch)
    || config.launcherType !== 'Nodejs' || canonical(config.environment) !== '{}' || config.framework?.slug !== 'nestjs'
    || Object.keys(config.framework).some(key => !['slug', 'version'].includes(key))
    || (config.framework.version !== undefined && config.framework.version !== '12.2.0')
    || config.shouldAddHelpers !== true || config.shouldAddSourcemapSupport !== true || config.awsLambdaHandler !== ''
    || config.shouldDisableAutomaticFetchInstrumentation !== false
    || (config.maxDuration !== undefined && config.maxDuration !== 10)
    || (config.supportsCancellation !== undefined && config.supportsCancellation !== true)
    || (final && (config.maxDuration !== 10 || config.supportsCancellation !== true))) reject();
  for (const name of [handler, 'apps/api/src/app.js', 'apps/api/src/generated/migrations.js', 'apps/api/package.json']) readArtifactFile(root, prefix + name);
  return config;
}
function validateOutput(root: string, files: FileRecord[], arch: string, final: boolean): void {
  const prefix = final ? functionPrefix : 'functions/index.func/';
  const config = parsed(root, final ? `${outputPrefix}config.json` : 'config.json');
  const rawRoutes = [{ handle: 'error' }, { status: 404, src: '^(?!/api).*$', dest: '/404.html' }, ...finalRoutes];
  if (config.version !== 3 || canonical(config.routes) !== canonical(final ? finalRoutes : rawRoutes)
    || config.framework?.slug !== 'nestjs' || config.framework?.version !== '12.2.0'
    || Object.keys(config).some(key => !['version', 'routes', 'framework', 'crons'].includes(key))
    || (config.crons !== undefined && canonical(config.crons) !== '[]')) reject();
  functionConfig(root, prefix, arch, final);
  const selected = files.filter(file => final ? file.path.startsWith(outputPrefix) : true);
  for (const file of selected) {
    const path = final ? file.path.slice(outputPrefix.length) : file.path;
    if (path === 'config.json' || path === 'artifact.json') continue;
    if (!path.startsWith('functions/index.func/')) reject();
    const inside = path.slice('functions/index.func/'.length);
    if (inside === '.vc-config.json') continue;
    if (!(inside.startsWith('apps/api/src/') && /\.js(?:\.map)?$/.test(inside)) && inside !== 'apps/api/package.json'
      && inside !== 'apps/api/config/hosted-target.example.json' && !inside.includes('node_modules/')) reject();
    if (/\.(?:node|so|dylib|dll|exe)$/i.test(inside)) reject();
  }
  for (const dependency of ['@nestjs/core', 'pg', '@vercel/functions', 'reflect-metadata']) {
    if (!selected.some(file => file.path.endsWith(`/node_modules/${dependency}/package.json`))) reject();
  }
}
async function copyRecords(from: string, to: string, files: FileRecord[], prefix = ''): Promise<void> {
  for (const file of files) {
    const bytes = readArtifactFile(from, file.path, file);
    const target = join(to, prefix + file.path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: 'wx', mode: file.mode & 0o111 ? 0o555 : 0o444 });
  }
}
function validateEvidence(manifest: ArtifactManifest): void {
  if (manifest.version !== 1 || canonical(manifest.target) !== canonical(artifactTarget)
    || canonical(manifest.build.metadata) !== canonical(artifactTarget) || manifest.build.node !== artifactTarget.node
    || !hashPattern.test(manifest.build.nodeSha256) || !/^\d+\.\d+\.\d+$/.test(manifest.build.npm)
    || !['darwin', 'linux'].includes(manifest.build.platform) || !['arm64', 'x64'].includes(manifest.build.arch)
    || !['development', 'release'].includes(manifest.source.mode) || !/^[a-f0-9]{40}$/.test(manifest.source.revision)
    || !/^[a-f0-9]{40}$/.test(manifest.source.tree) || !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(manifest.source.repository)
    || manifest.source.repository.endsWith('.git') || !hashPattern.test(manifest.configDigest)
    || manifest.source.digest !== sha256(canonical(manifest.source.files)) || manifest.build.rawDigest !== sha256(canonical(manifest.build.rawFiles))) reject();
  if (manifest.source.mode === 'release' && (manifest.build.platform !== 'linux' || manifest.build.arch !== 'x64')) reject();
  if (manifest.build.tools.length !== Object.keys(toolPins).length || new Set(manifest.build.tools.map(tool => tool.name)).size !== manifest.build.tools.length) reject();
  for (const tool of manifest.build.tools) {
    const pin = toolPins[tool.name];
    if (!pin || tool.version !== pin.version || tool.integrity !== pin.integrity || !hashPattern.test(tool.filesDigest)) reject();
  }
  const config = manifest.source.files.find(file => file.path === 'apps/api/vercel.json');
  if (!config || config.sha256 !== manifest.configDigest) reject();
  if (manifest.build.builderConfigDigest !== sha256(canonical(builderConfig({ $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'nestjs',
    git: { deploymentEnabled: false }, functions: { 'src/main.ts': { maxDuration: 10, supportsCancellation: true } } })))) reject();
  if (!manifest.migrations.length || manifest.migrationDigest !== sha256(JSON.stringify(manifest.migrations))
    || new Set(manifest.migrations.map(entry => entry.name.slice(0, 13))).size !== manifest.migrations.length) reject();
  for (const entry of manifest.migrations) {
    if (!/^\d{13}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) || !hashPattern.test(entry.sha256)
      || !manifest.source.files.some(file => file.path === `apps/api/migrations/${entry.name}.mjs` && file.sha256 === entry.sha256)) reject();
  }
}
export async function assembleArtifact(input: {
  raw: string; operator: string; destination: string; source: SourceIdentity; build: Omit<BuildEvidence, 'rawFiles' | 'rawDigest'>;
  config: unknown; migrations: ArtifactManifest['migrations'];
}): Promise<VerifiedArtifact> {
  builderConfig(input.config);
  const raw = inventory(input.raw);
  const runtime = raw.files.filter(file => file.path === 'config.json' || file.path.startsWith('functions/'));
  if (raw.files.some(file => !runtime.includes(file) && file.path !== 'builds.json' && !file.path.startsWith('diagnostics/'))) reject();
  validateOutput(input.raw, runtime, input.build.arch, false);
  const operator = inventory(input.operator);
  if (!operator.files.some(file => file.path === 'apps/api/build/scripts/migrate.js')) reject();
  const destination = resolve(input.destination);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(dirname(destination), '.artifact-stage-'));
  try {
    await copyRecords(input.raw, staging, runtime, outputPrefix);
    await copyRecords(input.operator, staging, operator.files, 'operator/');
    const configPath = `${functionPrefix}.vc-config.json`;
    const config = functionConfig(staging, functionPrefix, input.build.arch, false);
    await chmod(join(staging, configPath), 0o600);
    await writeFile(join(staging, configPath), canonical({ ...config, maxDuration: 10, supportsCancellation: true }) + '\n');
    await chmod(join(staging, configPath), 0o444);
    await chmod(join(staging, outputPrefix, 'config.json'), 0o600);
    await writeFile(join(staging, outputPrefix, 'config.json'), canonical({ version: 3, routes: finalRoutes, framework: { slug: 'nestjs', version: '12.2.0' } }) + '\n');
    await chmod(join(staging, outputPrefix, 'config.json'), 0o444);
    // This public receipt is uploaded but not served: it is outside static/functions.
    const receipt = { version: 1, source: input.source, configDigest: sha256(canonical(input.config)), migrations: input.migrations,
      migrationDigest: sha256(JSON.stringify(input.migrations)), target: artifactTarget, tools: input.build.tools };
    await writeFile(join(staging, outputPrefix, 'artifact.json'), canonical(receipt) + '\n', { flag: 'wx', mode: 0o444 });
    for (const directory of inventory(staging).directories.reverse()) await chmod(join(staging, directory.path), 0o555);
    const final = inventory(staging);
    const manifest: ArtifactManifest = { version: 1, source: input.source, target: artifactTarget,
      configDigest: input.source.files.find(file => file.path === 'apps/api/vercel.json')!.sha256,
      migrations: input.migrations, migrationDigest: sha256(JSON.stringify(input.migrations)),
      build: { ...input.build, rawFiles: runtime, rawDigest: sha256(canonical(runtime)) }, ...final };
    validateEvidence(manifest); validateOutput(staging, final.files, input.build.arch, true);
    await writeFile(join(staging, 'provenance.json'), canonical(manifest) + '\n', { flag: 'wx', mode: 0o444 });
    const digest = sha256(readArtifactFile(staging, 'provenance.json'));
    await chmod(staging, 0o555);
    // Never replace an existing artifact, including an empty directory.
    try { lstatSync(destination); reject(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rename(staging, destination);
    return verifyArtifact(destination, digest);
  } catch (error) { await removeArtifactTree(staging); throw error; }
}
export function verifyArtifact(root: string, digest: string, expected?: { revision: string; migrationDigest: string; repository: string; release?: boolean }): VerifiedArtifact {
  root = safeRoot(root);
  if (!hashPattern.test(digest)) reject();
  const bytes = readArtifactFile(root, 'provenance.json');
  if (sha256(bytes) !== digest || (lstatSync(join(root, 'provenance.json')).mode & 0o777) !== 0o444
    || (lstatSync(root).mode & 0o777) !== 0o555) reject();
  const manifest = JSON.parse(bytes.toString('utf8')) as ArtifactManifest;
  if (canonical(manifest) + '\n' !== bytes.toString('utf8')) reject();
  validateEvidence(manifest);
  const actual = inventory(root, new Set(['provenance.json']));
  if (canonical(actual.files) !== canonical(manifest.files) || canonical(actual.directories) !== canonical(manifest.directories)
    || actual.files.some(file => !file.path.startsWith(outputPrefix) && !file.path.startsWith('operator/'))
    || actual.files.some(file => ![0o444, 0o555].includes(file.mode)) || actual.directories.some(dir => dir.mode !== 0o555)) reject();
  validateOutput(root, actual.files, manifest.build.arch, true);
  for (const entry of manifest.migrations) {
    const path = `operator/apps/api/migrations/${entry.name}.mjs`;
    if (!actual.files.some(file => file.path === path && file.sha256 === entry.sha256)) reject();
  }
  const migrationPaths = actual.files.filter(file => file.path.startsWith('operator/apps/api/migrations/'));
  if (migrationPaths.length !== manifest.migrations.length) reject();
  if (expected && (manifest.source.revision !== expected.revision || manifest.migrationDigest !== expected.migrationDigest
    || manifest.source.repository !== expected.repository || (expected.release && manifest.source.mode !== 'release'))) reject();
  return { root, digest, manifest };
}
export async function snapshotArtifact(artifact: VerifiedArtifact): Promise<VerifiedArtifact & { dispose(): Promise<void> }> {
  verifyArtifact(artifact.root, artifact.digest);
  const parent = await mkdtemp(join(realpathSync(tmpdir()), 'esty-artifact-consume-'));
  const root = join(parent, 'artifact');
  try {
    await mkdir(root, { mode: 0o700 });
    await copyRecords(artifact.root, root, artifact.manifest.files);
    await copyFile(join(artifact.root, 'provenance.json'), join(root, 'provenance.json'), constants.COPYFILE_EXCL);
    await chmod(join(root, 'provenance.json'), 0o444);
    for (const directory of artifact.manifest.directories.slice().reverse()) await chmod(join(root, directory.path), directory.mode);
    await chmod(root, 0o555);
    verifyArtifact(artifact.root, artifact.digest);
    const verified = verifyArtifact(root, artifact.digest);
    return { ...verified, dispose: () => removeArtifactTree(parent) };
  } catch (error) { await removeArtifactTree(parent); throw error; }
}
export async function removeArtifactTree(root: string): Promise<void> {
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) { await rm(root, { force: true }); return; }
    await chmod(root, 0o700);
    for (const name of readdirSync(root)) await removeArtifactTree(join(root, name));
    await rmdir(root);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export function outsideRepository(path: string, repository: string): void {
  const rel = relative(resolve(repository), resolve(path));
  if (!rel || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) reject();
}
