import { appendFile, copyFile, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { artifactTarget, assertSourceFiles, inventory, sha256, verifyArtifact } from './artifact.js';
import { buildArtifact } from './build-artifact.js';
import { bootstrapTools, checked, isolatedEnvironment } from './ci-tools.js';
import { repository } from './ci-provider.js';

export function checksContext(env: NodeJS.ProcessEnv): 'development' | 'release' {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !['pull_request', 'push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '')) throw new Error('Unsupported checks context.');
  if (env.GITHUB_EVENT_NAME === 'pull_request') return 'development';
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Only main is a release source.');
  return 'release';
}
export async function runChecks(root: string, output: string, environment: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  const mode = checksContext(environment);
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.versions.node !== artifactTarget.node) throw new Error('Pinned Linux/x64 Node required.');
  root = await realpath(root);
  const work = await mkdtemp(join(await realpath(tmpdir()), 'esty-ci-checks-'));
  const env = await isolatedEnvironment(join(work, 'environment'));
  const git = (args: string[]) => checked('git', args, root, env, signal);
  if (await git(['rev-parse', 'HEAD']) !== environment.GITHUB_SHA) throw new Error('Checkout does not match the event.');
  if (mode === 'release') {
    // These refs exist only in the disposable Actions checkout, never on an operator workstation.
    await git(['switch', '-C', 'main', environment.GITHUB_SHA!]);
    await git(['update-ref', 'refs/remotes/origin/main', environment.GITHUB_SHA!]);
  }
  const cli = await bootstrapTools(join(work, 'tools'), signal), bundle = join(work, 'bundle');
  await mkdir(bundle);
  const artifact = await buildArtifact({ repository: root, work: join(work, 'native'), destination: join(bundle, 'artifact'), cli, mode, signal });
  const functional = ['config', 'http', 'startup', 'release', 'artifact', 'ci'].map(name => `apps/api/build/tests/${name}.test.js`);
  const log = await checked(process.execPath, ['--test', ...functional, 'apps/api/tests/hosted-config.test.mjs'], root, env, signal);
  await writeFile(join(work, 'functional.log'), log);
  await checked(process.execPath, ['apps/api/scripts/stage-operator.mjs'], root, env, signal);
  // Native inputs are mandatory here. The local integration command's tsc fallback is never CI proof.
  verifyArtifact(artifact.root, artifact.digest);
  const integration = await checked(process.execPath, ['--test', 'apps/api/build/tests/integration.test.js'], root,
    { ...env, TEST_DATABASE_URL: 'postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local',
      NATIVE_ARTIFACT: artifact.root, NATIVE_ARTIFACT_SHA256: artifact.digest }, signal);
  await writeFile(join(work, 'integration.log'), integration);
  verifyArtifact(artifact.root, artifact.digest); assertSourceFiles(root, artifact.manifest.source);
  const runner = join(bundle, 'runner'); await mkdir(runner);
  for (const file of ['artifact.js', 'build-artifact.js', 'migration-files.mjs', 'ci-tools.js', 'ci-archive.js', 'ci-provider.js',
    'ci-delivery.js', 'vercel-deploy.js', 'hosted-acceptance.js']) {
    await copyFile(join(root, 'apps/api/build/scripts', file), join(runner, file));
  }
  await writeFile(join(runner, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(join(bundle, 'receipt.json'), JSON.stringify({ version: 1, revision: artifact.manifest.source.revision,
    tree: artifact.manifest.source.tree, artifact: artifact.digest, source: artifact.manifest.source.digest,
    nativeHttpDatabase: 'passed', functional: 'passed', mode, node: process.versions.node, runner: inventory(runner) }, null, 2) + '\n');
  await mkdir(output, { recursive: true });
  const archive = join(output, 'be-release.tar.gz');
  await checked('/usr/bin/tar', ['-czf', archive, '-C', bundle, 'artifact', 'runner', 'receipt.json'], work, env, signal);
  const archiveHash = sha256(readFileSync(archive));
  if (!environment.GITHUB_OUTPUT) throw new Error('GitHub output channel is missing.');
  await appendFile(environment.GITHUB_OUTPUT, `archive_hash=${archiveHash}\nartifact_hash=${artifact.digest}\nsource_tree=${artifact.manifest.source.tree}\n`);
  console.info(JSON.stringify({ checks: 'passed', nativeHttpDatabase: 'passed', mode, artifact: artifact.digest, archive: archiveHash }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output] = process.argv.slice(2);
  const abort = new AbortController(), cancel = () => abort.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    if (!root || !output || process.argv.length !== 4) throw new Error('Explicit CI source/output paths required.');
    await runChecks(root, output, process.env, AbortSignal.any([abort.signal, AbortSignal.timeout(2100000)]));
  } catch { console.error('BE_REQUIRED_CHECKS_FAILED: no delivery artifact is approved.'); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
