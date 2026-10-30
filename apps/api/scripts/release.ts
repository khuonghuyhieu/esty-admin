import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPrivate } from './private-files.mjs';
import { parseMigrationConfig } from '../src/config/config.js';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };
import { assertSourceApproval, runRelease, reconcileRelease } from './release-core.js';
import type { ReleaseInput } from './release-core.js';
import { describeRetainedRun, parseSupersessionApproval } from './release-journal.js';
import { parseDeployConfig, vercelDeployment } from './vercel-deploy.js';
import { manifestDigest } from './migrations.js';
import { migrationFiles } from './migration-files.mjs';
import { assertSourceFiles, snapshotArtifact, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
async function command(binary: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let output = '';
    let overflow = false;
    let killTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
      killTimer ??= setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 2000);
    };
    child.stdout.on('data', chunk => { if (output.length < 1024 * 1024) output += chunk; else { overflow = true; stop(); } });
    child.stderr.resume();
    signal.addEventListener('abort', stop, { once: true });
    child.once('error', () => { clearTimeout(killTimer); signal.removeEventListener('abort', stop); reject(new Error('Local release prerequisite failed.')); });
    child.once('close', code => {
      clearTimeout(killTimer); signal.removeEventListener('abort', stop);
      if (code !== 0 || signal.aborted || overflow) reject(new Error('Local release prerequisite failed.'));
      else resolve(output.trim());
    });
    if (signal.aborted) stop();
  });
}
const args = process.argv.slice(2);
if (args.length === 0) {
  console.info('RELEASE_APPROVAL_REQUIRED: --approve-release --commit <40hex> --manifest <64hex> --artifact <sealed-directory> --artifact-sha256 <64hex> --operator-file <private-json> --deploy-file <separate-private-json> [--current-schema-only [--supersede <owner-approval-json>]]. Read-only: replace --approve-release with --reconcile-run <uuid>, retaining the original schema mode and exact artifact. Offline retained-lock fingerprint: --describe-retained-run <uuid>. Requires exact clean published source and Linux/x64 native artifact; no resume-create or force/unlock. No operation performed.');
} else {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(900000)]);
  try {
    if (args[0] === '--describe-retained-run') {
      if (args.length !== 2 || process.versions.node !== '24.22.1') throw new Error();
      console.info(JSON.stringify(describeRetainedRun(join(root, '.openai/reports/releases'), args[1]!)));
    } else {
    const values = new Map<string, string>();
    let approved = false;
    let currentOnly = false;
    for (let i = 0; i < args.length; i++) {
      const key = args[i]!;
      if (key === '--approve-release' && !approved) { approved = true; continue; }
      if (key === '--current-schema-only' && !currentOnly) { currentOnly = true; continue; }
      if (!['--commit', '--manifest', '--artifact', '--artifact-sha256', '--operator-file', '--deploy-file', '--supersede', '--reconcile-run'].includes(key)
        || values.has(key) || !args[i + 1]) throw new Error();
      values.set(key, args[++i]!);
    }
    const reconcile = values.get('--reconcile-run');
    if (approved === Boolean(reconcile) || process.versions.node !== '24.22.1'
      || !['--commit', '--manifest', '--artifact', '--artifact-sha256', '--operator-file', '--deploy-file'].every(key => values.has(key))
      || (values.has('--supersede') && (!currentOnly || reconcile))) throw new Error();
    const revision = values.get('--commit')!;
    const digest = values.get('--manifest')!;
    const artifact = verifyArtifact(resolve(values.get('--artifact')!), values.get('--artifact-sha256')!);
    if (artifact.manifest.source.mode !== 'release') throw new Error();
    let snapshot: VerifiedArtifact | undefined;
    const operatorPath = resolve(values.get('--operator-file')!);
    const deployPath = resolve(values.get('--deploy-file')!);
    if (operatorPath === deployPath) throw new Error();
    const operator = readPrivate(operatorPath);
    const allowed = ['SUPABASE_PROJECT_REF', 'SUPABASE_SESSION_HOST', 'SUPABASE_DATABASE_NAME', 'SUPABASE_DATABASE_USER', 'MIGRATION_DATABASE_URL', 'MIGRATION_TARGET', 'MIGRATION_CONFIRM_PROJECT_REF', 'DATABASE_CA_PEM'];
    if (!operator || typeof operator !== 'object' || Object.keys(operator).some(key => !allowed.includes(key) || typeof operator[key] !== 'string')
      || operator.MIGRATION_TARGET !== 'supabase') throw new Error();
    for (const [key, value] of Object.entries(approvedTarget)) if (key.startsWith('SUPABASE_') && operator[key] !== value) throw new Error();
    const database = parseMigrationConfig(operator);
    const deploy = parseDeployConfig(readPrivate(deployPath));
    const verifySource = async () => {
      verifyArtifact(artifact.root, artifact.digest, { revision, migrationDigest: digest, repository: deploy.REPOSITORY, release: true });
      if (snapshot) verifyArtifact(snapshot.root, artifact.digest);
      assertSourceFiles(root, artifact.manifest.source);
      const actual = await command('git', ['rev-parse', 'HEAD'], signal);
      const dirty = await command('git', ['status', '--porcelain', '--untracked-files=all'], signal);
      assertSourceApproval({ revision: actual, dirty: dirty.length > 0, digest: manifestDigest(migrationFiles(join(root, 'apps/api/migrations'))) }, revision, digest);
      const remote = (await command('git', ['remote', 'get-url', 'origin'], signal)).replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
      if (remote !== deploy.REPOSITORY || await command('git', ['branch', '--show-current'], signal) !== 'main') throw new Error();
      if (await command('git', ['rev-parse', 'HEAD^{tree}'], signal) !== artifact.manifest.source.tree
        || await command('git', ['rev-parse', 'refs/remotes/origin/main'], signal) !== revision) throw new Error();
      const config: unknown = JSON.parse(readFileSync(join(root, 'apps/api/vercel.json'), 'utf8'));
      if (!config || typeof config !== 'object' || !('framework' in config) || config.framework !== 'nestjs'
        || !('git' in config) || !config.git || typeof config.git !== 'object'
        || !('deploymentEnabled' in config.git) || config.git.deploymentEnabled !== false
        || Object.keys(config).some(key => !['$schema', 'framework', 'functions', 'git'].includes(key))) throw new Error();
    };
    const supersession = values.has('--supersede') ? parseSupersessionApproval(readPrivate(resolve(values.get('--supersede')!))) : undefined;
    const input: ReleaseInput = { revision, digest, artifactDigest: artifact.digest, target: `supabase:${approvedTarget.SUPABASE_PROJECT_REF}`, database,
      mode: currentOnly ? 'current-schema-only' : 'migrate', supersession, reportDirectory: join(root, '.openai/reports/releases'), signal,
      verifySource, prepare: async () => {
        const captured = await snapshotArtifact(artifact);
        snapshot = captured;
        try {
          return { directory: join(captured.root, 'operator/apps/api/migrations'),
            deployment: vercelDeployment(deploy, captured), dispose: captured.dispose };
        } catch (error) { await captured.dispose(); throw error; }
      } };
    if (reconcile) {
      console.info(JSON.stringify(await reconcileRelease(input, reconcile)));
    } else {
      const report = await runRelease(input);
      console.info(JSON.stringify(report));
      if (report.result !== 'success') process.exitCode = 1;
    }
    }
  } catch {
    console.error('Release refused: verify explicit mode/approval, clean exact source/artifact/manifest, owner-only contexts and durable lock/journal/supersession identity. No secret or upstream error is printed.');
    process.exitCode = 1;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
