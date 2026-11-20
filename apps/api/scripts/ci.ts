import { appendFile, cp, mkdir, mkdtemp, realpath, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { artifactTarget, assertSourceFiles, canonical, inventory, sha256, verifyArtifact } from './artifact.js';
import { buildArtifact } from './build-artifact.js';
import { bootstrapTools, checked, isolatedEnvironment } from './ci-tools.js';
import { repository } from './ci-provider.js';
import { ChecksDiagnostics, safeChecksError } from './checks-diagnostics.js';

export function checksContext(env: NodeJS.ProcessEnv): 'development' | 'release' {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !['pull_request', 'push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '')) throw new Error('Unsupported checks context.');
  if (env.GITHUB_EVENT_NAME === 'pull_request') return 'development';
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Only main is a release source.');
  return 'release';
}
export async function runChecks(root: string, output: string, environment: NodeJS.ProcessEnv, signal: AbortSignal,
  diagnostics = new ChecksDiagnostics(join(dirname(resolve(output)), 'be-checks-diagnostics'))): Promise<void> {
  let ownsOutput = false;
  try {
    const result = await diagnostics.stage('required-checks', async () => {
      const mode = await diagnostics.stage('preflight', () => {
        const mode = checksContext(environment);
        if (process.platform !== 'linux' || process.arch !== 'x64' || process.versions.node !== artifactTarget.node) throw new Error('Pinned Linux/x64 Node required.');
        return mode;
      });
      root = await realpath(root);
      const work = await mkdtemp(join(await realpath(tmpdir()), 'esty-ci-checks-'));
      const env = await diagnostics.stage('isolated-environment', () => isolatedEnvironment(join(work, 'environment')));
      await diagnostics.stage('source-identity', async () => {
        const git = (args: string[]) => checked('git', args, root, env, signal, diagnostics);
        if (await git(['rev-parse', 'HEAD']) !== environment.GITHUB_SHA) throw new Error('Checkout does not match the event.');
        if (mode === 'release') {
          // These refs exist only in the disposable Actions checkout, never on an operator workstation.
          await git(['switch', '-C', 'main', environment.GITHUB_SHA!]);
          await git(['update-ref', 'refs/remotes/origin/main', environment.GITHUB_SHA!]);
        }
      });
      const cli = await diagnostics.stage('public-tools', () => bootstrapTools(join(work, 'tools'), signal, diagnostics));
      const bundle = join(work, 'bundle'); await mkdir(bundle);
      const artifact = await diagnostics.stage('native-build', () => buildArtifact({
        repository: root, work: join(work, 'native'), destination: join(bundle, 'artifact'), cli, mode, signal, diagnostics }));
      const functional = ['config', 'http', 'startup', 'release', 'artifact', 'ci'].map(name => `apps/api/build/tests/${name}.test.js`);
      await diagnostics.stage('functional-tests', () => checked(process.execPath,
        ['--test', ...functional, 'apps/api/tests/hosted-config.test.mjs'], root, env, signal, diagnostics));
      await diagnostics.stage('operator-staging', () => checked(process.execPath,
        ['apps/api/scripts/stage-operator.mjs', '--checks-diagnostics'], root, env, signal, diagnostics));
      // Native inputs are mandatory here. The local integration command's tsc fallback is never CI proof.
      await diagnostics.stage('native-http-database-tests', async () => {
        verifyArtifact(artifact.root, artifact.digest);
        await checked(process.execPath, ['--test', 'apps/api/build/tests/integration.test.js'], root,
          { ...env, TEST_DATABASE_URL: 'postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local',
            NATIVE_ARTIFACT: artifact.root, NATIVE_ARTIFACT_SHA256: artifact.digest }, signal, diagnostics);
      });
      return diagnostics.stage('verified-transfer', async () => {
        verifyArtifact(artifact.root, artifact.digest); assertSourceFiles(root, artifact.manifest.source);
        const runner = join(bundle, 'runner');
        await cp(join(artifact.root, 'operator'), runner, { recursive: true, errorOnExist: true });
        await writeFile(join(bundle, 'receipt.json'), JSON.stringify({ version: 1, revision: artifact.manifest.source.revision,
          tree: artifact.manifest.source.tree, artifact: artifact.digest, source: artifact.manifest.source.digest,
          nativeHttpDatabase: 'passed', functional: 'passed', mode, node: process.versions.node, runner: inventory(runner) }, null, 2) + '\n');
        // Own a fresh output directory before writing or removing any producer outputs.
        await mkdir(output, { mode: 0o700 }); ownsOutput = true;
        const archive = join(output, 'be-release.tar.gz');
        await checked('/usr/bin/tar', ['--format=pax', '--no-xattrs', '-czf', archive, '-C', bundle, 'artifact', 'runner', 'receipt.json'], work, env, signal, diagnostics);
        const archiveHash = sha256(readFileSync(archive));
        if (!/^[1-9][0-9]{0,15}$/.test(environment.GITHUB_RUN_ID ?? '')) throw new Error('Producer run identity is missing.');
        if (!environment.GITHUB_OUTPUT) throw new Error('GitHub output channel is missing.');
        const approval = { version: 1, mode, producer: { revision: artifact.manifest.source.revision,
          tree: artifact.manifest.source.tree, run: environment.GITHUB_RUN_ID }, artifactDigest: artifact.digest,
          sourceDigest: artifact.manifest.source.digest, archiveDigest: archiveHash,
          operatorDigest: sha256(canonical(inventory(runner))), schemaDigest: artifact.manifest.migrationDigest };
        const approvalBytes = canonical(approval) + '\n', approvalHash = sha256(approvalBytes);
        await writeFile(join(output, 'be-release-approval.json'), approvalBytes, { flag: 'wx' });
        await appendFile(environment.GITHUB_OUTPUT, `archive_hash=${archiveHash}\nartifact_hash=${artifact.digest}\nsource_tree=${artifact.manifest.source.tree}\napproval_hash=${approvalHash}\n`);
        return { checks: 'passed', nativeHttpDatabase: 'passed', mode, artifact: artifact.digest, archive: archiveHash, approval: approvalHash };
      });
    });
    console.info(JSON.stringify(result));
  } catch (error) {
    if (ownsOutput) for (const name of ['be-release-approval.json', 'be-release.tar.gz']) {
      try { await unlink(join(output, name)); }
      catch (cleanup) {
        if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') console.error('CHECKS_OUTPUT_CLEANUP_FAILED: ' + safeChecksError(cleanup));
      }
    }
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output, diagnosticDirectory] = process.argv.slice(2);
  const abort = new AbortController(), cancel = () => abort.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let diagnostics: ChecksDiagnostics | undefined;
  try {
    if (!root || !output || !diagnosticDirectory || process.argv.length !== 5) throw new Error('Explicit CI source/output/diagnostic paths required.');
    diagnostics = new ChecksDiagnostics(diagnosticDirectory);
    await runChecks(root, output, process.env, AbortSignal.any([abort.signal, AbortSignal.timeout(2100000)]), diagnostics);
  } catch (error) { console.error('BE_REQUIRED_CHECKS_FAILED: no delivery artifact is approved.\n' + (diagnostics?.error(error) ?? safeChecksError(error))); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
