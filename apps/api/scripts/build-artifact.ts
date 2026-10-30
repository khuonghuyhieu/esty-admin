import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { artifactTarget, assembleArtifact, assertSourceFiles, builderConfig, canonical, inventory, outsideRepository,
  readArtifactFile, sha256, sourceFiles, toolPins } from './artifact.js';
import type { SourceIdentity, ToolEvidence } from './artifact.js';
import { migrationFiles } from './migration-files.mjs';

async function command(binary: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '', timer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
      timer ??= setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 2000);
    };
    const receive = (chunk: Buffer) => { text += chunk.toString(); if (text.length > 4 * 1024 * 1024) stop(); };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    signal.addEventListener('abort', stop, { once: true });
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
    child.once('error', () => { finish(); reject(new Error('Public build subprocess could not start.')); });
    child.once('close', code => {
      finish();
      if (code !== 0 || signal.aborted || text.length > 4 * 1024 * 1024) reject(new Error(`Public build subprocess failed (${code}): ${text.slice(-12000)}`));
      else resolve(text.trim());
    });
    if (signal.aborted) stop();
  });
}
export function verifyToolPackage(name: keyof typeof toolPins, installed: string, published: string): ToolEvidence {
  const pin = toolPins[name], expected = inventory(published);
  if (JSON.parse(readArtifactFile(published, 'package.json').toString()).version !== pin.version) throw new Error('Tool version differs.');
  // These exact pins publish no root node_modules. Only that installed directory is
  // a separately resolved dependency boundary; nested/bundled package files are not excluded.
  if ([...expected.files, ...expected.directories].some(entry => entry.path === 'node_modules')) throw new Error('Published tool dependency boundary differs.');
  const dependencies = lstatSync(join(installed, 'node_modules'), { throwIfNoEntry: false });
  if (dependencies && (!dependencies.isDirectory() || dependencies.isSymbolicLink() || (dependencies.mode & 0o7000))) throw new Error('Unsafe installed tool dependency boundary.');
  const actual = inventory(installed, new Set(['node_modules']));
  if (canonical(actual) !== canonical(expected)) throw new Error(`Installed public tool own-package inventory differs: ${name}`);
  return { name, ...pin, filesDigest: sha256(canonical(expected.files)) };
}
async function verifyTool(name: keyof typeof toolPins, installed: string, work: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<ToolEvidence> {
  const pin = toolPins[name], label = name.replaceAll('/', '-').replace('@', '');
  const directory = join(work, `verified-${label}`);
  await mkdir(directory, { mode: 0o700 });
  const response = await fetch(`https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${pin.version}.tgz`, {
    redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  if (response.status !== 200) throw new Error('Public tool download failed.');
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body!) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) throw new Error('Public tool archive exceeds the bound.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pin.integrity) throw new Error('Published tool integrity differs.');
  const archive = join(directory, 'package.tgz');
  await writeFile(archive, bytes, { flag: 'wx' });
  // Only the exact independently pinned public tarball is extracted.
  await command('/usr/bin/tar', ['-xzf', archive, '-C', directory], directory, env, signal);
  return verifyToolPackage(name, installed, join(directory, 'package'));
}
export async function buildArtifact(input: { repository: string; work: string; destination: string; cli: string; mode: SourceIdentity['mode']; signal: AbortSignal }) {
  const root = realpathSync(input.repository), work = resolve(input.work), destination = resolve(input.destination);
  outsideRepository(work, root); outsideRepository(destination, root);
  if (process.versions.node !== artifactTarget.node || !['development', 'release'].includes(input.mode)) throw new Error('Exact Node and explicit source mode required.');
  if (realpathSync(dirname(work)) !== dirname(work) || realpathSync(dirname(destination)) !== dirname(destination)) throw new Error('Use canonical public paths.');
  await mkdir(work, { mode: 0o700 });
  const home = join(work, 'home'), sourceRoot = join(work, 'source');
  await mkdir(home); await mkdir(sourceRoot); await mkdir(join(work, 'auth'));
  const npmConfig = join(work, 'empty-user.npmrc'), npmGlobal = join(work, 'empty-global.npmrc');
  await writeFile(npmConfig, '', { flag: 'wx' }); await writeFile(npmGlobal, '', { flag: 'wx' });
  const env = { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: home,
    XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, TMPDIR: work, NPM_CONFIG_USERCONFIG: npmConfig, NPM_CONFIG_GLOBALCONFIG: npmGlobal,
    NPM_CONFIG_CACHE: join(work, 'npm-cache'), NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
    VERCEL_CLI_USE_NATIVE_BINARY: '0', VERCEL_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', CI: '1' };
  const git = (args: string[]) => command('git', args, root, env, input.signal);
  const revision = await git(['rev-parse', 'HEAD']), tree = await git(['rev-parse', 'HEAD^{tree}']);
  const repository = (await git(['remote', 'get-url', 'origin'])).replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^[a-f0-9]{40}$/.test(tree) || !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(repository)) throw new Error('Source identity is invalid.');
  if (input.mode === 'release' && ((await git(['status', '--porcelain', '--untracked-files=all'])) || (await git(['branch', '--show-current'])) !== 'main'
    || await git(['rev-parse', 'refs/remotes/origin/main']) !== revision || process.platform !== 'linux' || process.arch !== 'x64')) throw new Error('Published release source/platform not confirmed.');
  const files = sourceFiles(root);
  const source: SourceIdentity = { mode: input.mode, revision, tree, repository, files, digest: sha256(canonical(files)) };
  for (const file of files) {
    const path = join(sourceRoot, file.path); await mkdir(dirname(path), { recursive: true });
    await writeFile(path, readArtifactFile(root, file.path, file), { flag: 'wx', mode: file.mode });
  }
  assertSourceFiles(root, source); assertSourceFiles(sourceRoot, source);
  const config = JSON.parse(readArtifactFile(root, 'apps/api/vercel.json').toString()), effective = builderConfig(config);
  await writeFile(join(sourceRoot, 'apps/api/vercel.json'), JSON.stringify(effective, null, 2) + '\n');
  await mkdir(join(sourceRoot, '.vercel'));
  await writeFile(join(sourceRoot, '.vercel/project.json'), JSON.stringify({ projectId: artifactTarget.project, orgId: artifactTarget.owner,
    projectName: 'esty-admin-api', settings: { framework: 'nestjs', rootDirectory: 'apps/api', nodeVersion: '24.x',
      buildCommand: null, installCommand: 'npm ci --workspace=@esty-admin/api --include-workspace-root=false', outputDirectory: null } }));
  await writeFile(join(sourceRoot, '.vercel/.env.production.local'), '');
  const cli = realpathSync(input.cli), cliRoot = dirname(dirname(cli));
  if (!cli.endsWith('/vercel/dist/vc.js') || !lstatSync(cli).isFile()) throw new Error('Expected the approved public CLI entrypoint.');
  const tools: ToolEvidence[] = [await verifyTool('vercel', cliRoot, work, env, input.signal)];
  const resolver = createRequire(cli);
  for (const name of ['@vercel/nestjs', '@vercel/node', '@vercel/build-utils'] as const) {
    tools.push(await verifyTool(name, dirname(resolver.resolve(`${name}/package.json`)), work, env, input.signal));
  }
  const args = [cli, 'build', '--prod', '--non-interactive', '--standalone', '--cwd', sourceRoot, '--global-config', join(work, 'auth')];
  await writeFile(join(work, 'invocation.json'), JSON.stringify({ node: process.execPath, args, env, source }, null, 2));
  try {
    const log = await command(process.execPath, args, sourceRoot, env, input.signal);
    await writeFile(join(work, 'native-build.log'), log);
  } catch (error) {
    await writeFile(join(work, 'native-build.log'), String(error)); throw new Error('Native build failed; public work directory retains diagnostics.');
  }
  await writeFile(join(work, 'operator-build.log'), await command(process.execPath, ['apps/api/scripts/stage-operator.mjs'], sourceRoot, env, input.signal));
  await writeFile(join(sourceRoot, 'apps/api/vercel.json'), readArtifactFile(root, 'apps/api/vercel.json'));
  assertSourceFiles(sourceRoot, source); assertSourceFiles(root, source);
  const artifact = await assembleArtifact({ raw: join(sourceRoot, '.vercel/output'), operator: join(sourceRoot, 'apps/api/build/operator'), destination,
    source, config, migrations: migrationFiles(join(root, 'apps/api/migrations')).map(({ name, sha256 }) => ({ name, sha256 })),
    build: { node: process.versions.node, nodeSha256: sha256(readFileSync(process.execPath)), npm: await command('npm', ['--version'], work, env, input.signal),
      platform: process.platform, arch: process.arch, tools, builderConfigDigest: sha256(canonical(effective)), metadata: artifactTarget } });
  assertSourceFiles(root, source);
  return artifact;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = new Map<string, string>();
  if (!args.length) console.info('ARTIFACT_BUILD_INPUT_REQUIRED: --repository <public-source-root> --work <new-public-directory> --destination <new-artifact-directory> --cli <public-vercel/dist/vc.js> --mode development|release. No operation performed.');
  else {
    const abort = new AbortController(), cancel = () => abort.abort();
    process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
    try {
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i]!;
        if (!['--repository', '--work', '--destination', '--cli', '--mode'].includes(key) || values.has(key) || !args[i + 1]) throw new Error('Explicit public build arguments required.');
        values.set(key, args[i + 1]!);
      }
      if (values.size !== 5) throw new Error('All public build arguments required.');
      const artifact = await buildArtifact({ repository: values.get('--repository')!, work: values.get('--work')!, destination: values.get('--destination')!, cli: values.get('--cli')!,
        mode: values.get('--mode')! as SourceIdentity['mode'], signal: AbortSignal.any([abort.signal, AbortSignal.timeout(900000)]) });
      console.info(JSON.stringify({ artifact: artifact.root, sha256: artifact.digest, mode: artifact.manifest.source.mode }));
    } catch (error) { console.error(error instanceof Error ? error.message : 'Public artifact build failed.'); process.exitCode = 1; }
    finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  }
}
