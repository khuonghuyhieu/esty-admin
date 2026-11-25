import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import childProcess from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { cp, chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os, { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { gunzipSync } from 'node:zlib';
import { artifactTarget, assembleArtifact, canonical, inventory, readArtifactFile, removeArtifactTree, sha256, verifyArtifact } from '../scripts/artifact.js';
import type { FileRecord, VerifiedArtifact } from '../scripts/artifact.js';
import { artifactFixture, receiptZip, routineMigrationFixture, routineMetadataFixture, routineIngressFixture,
  tar, routineProviderFixture, routineRuntime, strictReleaseFixture, heldContinuationFixture, replacementContinuationFixture,
  failedReplacementFixture, historicalProviderFixture } from './artifact-fixture.js';
import { historicalActivationChild } from './historical-activation-fixture.js';
import { checksContext, runChecks } from '../scripts/ci.js';
import { ChecksDiagnostics } from '../scripts/checks-diagnostics.js';
import { checked, command, responseBytes } from '../scripts/ci-tools.js';
import { acknowledgedId, deliver, deliverActivationCandidate, deliveryContext, runRoutinePhase } from '../scripts/ci-delivery.js';
import { ReleaseDiagnostics, ReleaseOutcome, approvedRoutineRequest, authenticateRoutineDelivery, validateReleaseRequest, validateReleaseResult } from '../scripts/ci-delivery.js';
import { createActivationProvider, createProvider, repository, confirmStoppedEtsyContinuation, proveEtsyReplacement } from '../scripts/ci-provider.js';
import type { ActivationProvider, DeliveryProvider, RunIdentity } from '../scripts/ci-provider.js';
import { verifyUploadedArchive } from '../scripts/ci-archive.js';
import { checkHostedHttp } from '../scripts/hosted-acceptance.js';
import type { CommandResult } from '../scripts/ci-tools.js';
import { routineContext, loadRoutineContext, withRoutineDiagnostics, selectRoutine, validateRoutineSelection, confirmRoutineSelection,
  extractRoutineBundle, admitHeldProduction, heldClaimStep, replacementClaimStep, heldRunnerPaths } from '../scripts/routine-retained.mjs';
import { migrationManifest } from '../src/generated/migrations.js';
import { activationPhases, appendActivationEvent, createActivationJournal, finishActivationJournal, importFrontendJournal,
  readActivationJournal, reserveActivationJournal, saveActivationConfigurationReceipt } from '../scripts/activation-journal.js';
import type { ActivationPacket, ActivationPhase } from '../scripts/activation-journal.js';
import { completeActivation, confirmActivationPhase, executeActivationPhase, reconcileActivationAcknowledgement, reconcileActivationEffect } from '../scripts/activation.js';
import { phaseInputEnvironment } from '../scripts/activation-inputs.js';
import { configureActivation, observeAppMetadata, AppMetadataError, ActivationConfigurationError,
  appMissingFiveKeys, observeMissingFiveMetadata, postMissingFive, verifyMissingFiveMetadata,
  observeAppDatabasePair, postAppDatabasePair, verifyAppDatabasePair } from '../scripts/activation-configuration.js';
import type { ActivationConfigurationReceipt } from '../scripts/activation-configuration.js';
import { readEvidence, writeReleaseEvidence } from '../scripts/release-journal.js';
import { activationSchema, assertActivationManifest } from '../src/config/schema-transition.js';
import { approvedSchema, authorizeRoutineMigration, confirmedMigration, continueRoutineMigration, routinePacket } from '../scripts/ci-migrations.js';
import type { RoutineMigrationPacket, RoutineSchema } from '../scripts/ci-migrations.js';
import type { RoutineDeliveryApproval, RoutineProvider } from '../scripts/ci-provider.js';
import type { MigrationReport } from '../scripts/migrations.js';
import { canonical as retainedCanonical, githubReader, manualContext, readSelection, retainedActivation, retainedHistoricalArchive,
  selectRetained, validateSelection, verifyRelay, verifySelectedBundle, verifyWorkflowHead } from '../scripts/activation-retained.mjs';
import { executeManualAction } from '../scripts/manual-activation.mjs';
import { stoppedEtsyContinuation, failedReplacementDispatch, validateFailedReplacementReceiptArchive, failedPreflightProof, manualGithubIo, reserveManualActivation,
  validatePreflightReceiptArchive, validateHeldProbeArchive } from '../scripts/activation-preflight-disposition.mjs';
import { verifyHeldAppProbe } from '../scripts/activation-held-proof.js';
import { heldCorrection, heldCorrectionCapability } from '../scripts/activation-held-correction-contract.mjs';
import { heldPinPath, heldProbeSources } from '../scripts/activation-held-contract.mjs';
import { heldProofFixture, heldRetainedProofFixture, historicalProofFixture } from './held-app-fixture.js';
import { manualArchiveTransport } from '../scripts/activation-archive-transport.mjs';
import { heldCandidateCreate, readHeldCandidate, recoveryToolInventory } from '../scripts/activation-recovery-io.js';
import { heldPostRepair } from '../scripts/activation-journal.js';
import { verifyHeldAppAcceptance, heldRetainedCandidate, verifyHistoricalFinalAcceptance } from '../scripts/activation-held-proof.js';
import { heldAppPolicy, heldD2, heldD2Sources } from '../scripts/activation-held-contract.mjs';
import { runtimeConfigDigest } from '../src/config/activation-config.js';
import { historicalHandoffDigest, historicalMetadataReadback, historicalSnapshot, proveHistoricalHandoff,
  proveFailedAuthorization, proveFailedAuthorizations } from '../scripts/historical-release.js';
import { historicalReleaseEvidence } from '../scripts/historical-release-evidence.js';

function heldProductionFixture(replacement = false) {
  const replaced = replacement ? replacementContinuationFixture() : undefined, f = replaced ?? heldContinuationFixture();
  const source = readFileSync(new URL('../../../../.github/workflows/be-delivery.yml', import.meta.url));
  const env: NodeJS.ProcessEnv = { GITHUB_ACTIONS: 'true', GITHUB_JOB: 'production', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: f.request.controller.revision, GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/be-delivery.yml@refs/heads/main`,
    RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_NAME: 'synthetic-serialized-runner', BE_HELD_INCIDENT: replacement ? '45539045779' : '45106877912' };
  const run = { id: 123, workflow_id: 404086547, run_attempt: 1, head_sha: f.request.controller.revision, head_branch: 'main',
    path: '.github/workflows/be-delivery.yml', event: 'workflow_dispatch', status: 'in_progress', conclusion: null,
    repository: { id: 1430691691, full_name: repository }, head_repository: { id: 1430691691, full_name: repository } };
  const job = { id: 456, run_id: 123, run_attempt: 1, head_sha: run.head_sha, name: 'BE production delivery',
    status: 'in_progress', conclusion: null, runner_id: 789, runner_name: env.RUNNER_NAME,
    steps: [{ name: replacement ? replacementClaimStep : heldClaimStep, status: 'in_progress', conclusion: null as string | null }] };
  const records: Record<string, any> = {
    '/actions/runs/123': run,
    '/commits/main': { sha: run.head_sha, commit: { tree: { sha: f.request.controller.tree } } },
    [`/contents/.github/workflows/be-delivery.yml?ref=${run.head_sha}`]: {
      type: 'file', path: '.github/workflows/be-delivery.yml', encoding: 'base64', size: source.length, content: source.toString('base64') },
    '/actions/runs/123/jobs?filter=all&per_page=100': { total_count: 1, jobs: [job] },
    '/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1': { total_count: 1, workflow_runs: [run] },
  };
  const failed = failedReplacementFixture(), downloads: number[] = [];
  const download = async (id: number, maximum: number) => {
    assert.equal(id, failed.artifact.id); assert.equal(maximum, failed.zip.length);
    downloads.push(id); return Buffer.from(failed.zip);
  };
  if (replaced) {
    const pin = stoppedEtsyContinuation;
    records[`/actions/runs/${pin.run}`] = replaced.snapshots.run;
    records[`/actions/runs/${pin.run}/jobs?filter=all&per_page=100`] = replaced.snapshots.jobs;
    records['/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1'] = {
      total_count: 3, workflow_runs: [run, replaced.snapshots.run, failed.run] };
    records[`/actions/runs/${failed.run.id}`] = failed.run;
    records[`/actions/runs/${failed.run.id}/jobs?filter=all&per_page=100`] = failed.jobs;
    records[`/actions/runs/${failed.run.id}/artifacts?per_page=100`] = { total_count: 1, artifacts: [failed.artifact] };
    records[`/contents/.github/workflows/be-delivery.yml?ref=${failed.run.head_sha}`] = {
      type: 'file', path: '.github/workflows/be-delivery.yml', encoding: 'base64', size: failed.workflow.length, content: failed.workflow.toString('base64') };
    records['/deployments?task=deploy%3Aesty-be-ci&environment=be-production&per_page=100&page=1'] = failed.journal;
  }
  const read = async (path: string) => {
    assert.ok(Object.hasOwn(records, path), `Unexpected synthetic metadata path: ${path}`);
    return structuredClone(records[path]);
  };
  return { ...f, source, env, records, run, job, read, failed, downloads, download,
    admit: (audit = true) => admitHeldProduction(f.request, env, read, source, audit, download) };
}

test('replacement failed-dispatch disposition requires the exact closed history and fresh absence of reservation', async t => {
  const listPath = '/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1';
  const journalPath = '/deployments?task=deploy%3Aesty-be-ci&environment=be-production&per_page=100&page=';
  const pin = failedReplacementDispatch;
  const artifactPath = `/actions/runs/${pin.run}/artifacts?per_page=100`;
  const job = (f: ReturnType<typeof heldProductionFixture>) => f.failed.jobs.jobs.find((value: any) => value.id === pin.job);
  const valid = heldProductionFixture(true), calls: string[] = [];
  const io = manualGithubIo('synthetic-token-not-a-credential', AbortSignal.timeout(10000), async (raw, init) => {
    const url = new URL(String(raw)); calls.push(url.pathname + url.search);
    assert.equal(init?.method ?? 'GET', 'GET');
    if (url.hostname === 'retained.blob.core.windows.net') {
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      return new Response(valid.failed.zip);
    }
    assert.equal(url.hostname, 'api.github.com');
    const path = url.pathname.replace(`/repos/${repository}`, '') + url.search;
    if (path === `/actions/artifacts/${pin.artifact}/zip`) return new Response(null, {
      status: 302, headers: { location: 'https://retained.blob.core.windows.net/receipts' } });
    return Response.json(await valid.read(path));
  });
  assert.equal((await admitHeldProduction(valid.request, valid.env, io.read, valid.source, true, io.download)).job, 456);
  assert.ok(calls.includes(`/repos/${repository}${journalPath}1`));
  const archive = validateFailedReplacementReceiptArchive(valid.failed.zip);
  assert.equal(archive.files.size, 0);
  assert.deepEqual([...archive.directories], [['', { path: '', mode: 0o700 }], ['continuation', { path: 'continuation', mode: 0o700 }]]);
  const faults: [string, (f: ReturnType<typeof heldProductionFixture>) => void][] = [
    ['omitted historical run', f => {
      const listing = f.records[listPath];
      listing.workflow_runs = listing.workflow_runs.filter((run: any) => String(run.id) !== pin.run); listing.total_count--;
    }],
    ['wrong run', f => { f.failed.run.id++; }],
    ['rerun', f => { f.failed.run.run_attempt = 2; }],
    ['different source', f => { f.failed.run.head_sha = 'b'.repeat(40); }],
    ['unknown outcome', f => { f.failed.run.conclusion = null; }],
    ['wrong job', f => { job(f).id++; }],
    ['missing claim step', f => { job(f).steps = job(f).steps.filter((step: any) => step.name !== replacementClaimStep); }],
    ['downstream reached', f => { job(f).steps.find((step: any) => step.number === 14).conclusion = 'failure'; }],
    ['different workflow', f => {
      const bytes = Buffer.concat([f.source, Buffer.from('\n')]);
      Object.assign(f.records[`/contents/.github/workflows/be-delivery.yml?ref=${pin.revision}`],
        { content: bytes.toString('base64'), size: bytes.length });
    }],
    ['missing artifact', f => { f.records[artifactPath] = { total_count: 0, artifacts: [] }; }],
    ['duplicate artifact', f => { f.records[artifactPath].artifacts.push(f.failed.artifact); f.records[artifactPath].total_count++; }],
    ['incomplete artifacts', f => { f.records[artifactPath].total_count++; }],
    ['wrong artifact', f => { f.failed.artifact.id++; }],
    ['wrong artifact run', f => { f.failed.artifact.workflow_run.id++; }],
    ['wrong artifact attempt', f => { f.failed.artifact.name = `be-delivery-receipts-${pin.run}-2`; }],
    ['expired artifact', f => { f.failed.artifact.expired = true; }],
    ['out-of-job artifact', f => { f.failed.artifact.created_at = '2026-11-25T07:11:17Z'; }],
    ['tampered ZIP', f => { f.failed.zip[100] ^= 1; }],
    ['missing journal', f => { delete f.records[`${journalPath}1`]; }],
    ['duplicate journal', f => { f.failed.journal.push(f.failed.journal[0]); }],
    ['unknown journal identity', f => { delete f.failed.journal[0].payload.run; }],
    ['reserved failed run', f => { f.failed.journal[0].payload.run = pin.run; }],
    ['reserved request', f => { f.failed.journal[0].payload.releaseRequest.controller.run = pin.run; }],
    ['reserved execution', f => { f.failed.journal[0].payload.heldContinuation.execution.run = pin.run; }],
    ['incomplete journal page', f => {
      f.records[`${journalPath}1`] = Array.from({ length: 100 }, (_, index) => ({
        ...f.failed.journal[0], id: 9000000000 + index }));
    }],
  ];
  for (const [name, mutate] of faults) await t.test(name, async () => {
    const f = heldProductionFixture(true); mutate(f);
    await assert.rejects(f.admit());
  });
  await t.test('unavailable archive', async () => {
    const f = heldProductionFixture(true);
    await assert.rejects(admitHeldProduction(f.request, f.env, f.read, f.source, true,
      async () => { throw new Error('Synthetic archive unavailable'); }), /archive unavailable/);
  });
  await t.test('archive transport absent', async () => {
    const f = heldProductionFixture(true);
    await assert.rejects(admitHeldProduction(f.request, f.env, f.read, f.source, true), /failed-dispatch-provenance/);
  });
  await t.test('original path cannot consume replacement disposition', async () => {
    const f = heldProductionFixture(true), original = heldProductionFixture();
    f.job.steps = original.job.steps;
    f.records[listPath] = { total_count: 2, workflow_runs: [f.run, f.failed.run] };
    await assert.rejects(admitHeldProduction(original.request, original.env, f.read, original.source, true, f.download),
      /held.no-prior-claim-attempt/);
    assert.equal((await original.admit()).job, 456);
    assert.deepEqual(original.downloads, []);
  });
  await t.test('complete paginated absence', async () => {
    const f = heldProductionFixture(true), seen: string[] = [];
    f.records[`${journalPath}1`] = Array.from({ length: 100 }, (_, index) => ({ ...f.failed.journal[0], id: 9000000000 + index }));
    f.records[`${journalPath}2`] = f.failed.journal;
    const read = async (path: string) => { seen.push(path); return f.read(path); };
    assert.equal((await admitHeldProduction(f.request, f.env, read, f.source, true, f.download)).job, 456);
    assert.ok(seen.includes(`${journalPath}2`));
    f.records[`${journalPath}2`].push(f.records[`${journalPath}1`][0]);
    await assert.rejects(admitHeldProduction(f.request, f.env, read, f.source, true, f.download), /journal-identity/);
  });
  await t.test('journal scan bound cannot imply absence', async () => {
    const f = heldProductionFixture(true); let pages = 0;
    const read = async (path: string) => {
      if (!path.startsWith(journalPath)) return f.read(path);
      const page = Number(path.slice(journalPath.length)); pages++;
      return Array.from({ length: 100 }, (_, index) => ({ ...f.failed.journal[0], id: 9000000000 + page * 100 + index }));
    };
    await assert.rejects(admitHeldProduction(f.request, f.env, read, f.source, true, f.download), /journal-bound/);
    assert.equal(pages, 20);
  });
  await t.test('current workflow can evolve without relabeling historical bytes', async () => {
    const f = heldProductionFixture(true), source = Buffer.concat([f.source, Buffer.from('\n# Reviewed current-source change.\n')]);
    f.request.continuation!.operator.workflowDigest = sha256(source);
    Object.assign(f.records[`/contents/.github/workflows/be-delivery.yml?ref=${f.run.head_sha}`],
      { content: source.toString('base64'), size: source.length });
    const execution = await admitHeldProduction(f.request, f.env, f.read, source, true, f.download);
    assert.equal(execution.workflowDigest, sha256(source));
  });
});

test('replacement audit completes from the cold delivery ESM graph without bypassing replay checks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-cold-replacement-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const delivery = new URL('../scripts/ci-delivery.js', import.meta.url).href;
  const program = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { registerHooks, syncBuiltinESMExports } from 'node:module';
    import net from 'node:net';
    import tls from 'node:tls';
    import dgram from 'node:dgram';
    const fixture = JSON.parse(readFileSync(process.argv[1], 'utf8')), loaded = [];
    let network = 0;
    const deny = () => { network++; throw new Error('Unexpected network attempt'); };
    globalThis.fetch = deny; net.Socket.prototype.connect = deny; tls.connect = deny; dgram.createSocket = deny;
    syncBuiltinESMExports();
    process.on('exit', () => { if (network) process.exitCode = 97; });
    registerHooks({ load(url, context, nextLoad) {
      const module = nextLoad(url, context); loaded.push(url);
      if (url !== fixture.delivery) return module;
      // Preserve the real emitted imports and module body. Model only the
      // entrypoint's top-level await with the real audit and synthetic inputs.
      // A warm import before this await would conceal the production cycle.
      const source = typeof module.source === 'string' ? module.source : Buffer.from(module.source).toString('utf8');
      return { ...module, source: source + '\\nawait globalThis.coldReplacementAudit();\\n' };
    } });
    globalThis.coldReplacementAudit = async () => {
      const { admitHeldProduction, withRoutineDiagnostics } = await import(fixture.runtime);
      const checks = [], reads = [];
      const diagnostics = { check(name, passed) { checks.push({ name, passed }); } };
      const read = async path => {
        assert.ok(Object.hasOwn(fixture.records, path), 'Unmapped synthetic read: ' + path);
        reads.push(path); return structuredClone(fixture.records[path]);
      };
      const download = async (id, maximum) => {
        assert.equal(id, fixture.failedArtifact);
        const bytes = Buffer.from(fixture.failedZip, 'base64'); assert.equal(bytes.length, maximum); return bytes;
      };
      try {
        const execution = await withRoutineDiagnostics(diagnostics, () =>
          admitHeldProduction(fixture.request, fixture.env, read, Buffer.from(fixture.source, 'base64'), true, download));
        console.log(JSON.stringify({ status: 'admitted', execution, checks, reads, loaded, network }));
      } catch {
        console.log(JSON.stringify({ status: 'refused', checks, reads, loaded, network }));
        process.exitCode = 1;
      }
    };
    await import(fixture.delivery);
  `;
  for (const scenario of ['compiled', 'source-native', 'wrong-pin', 'reached-claim']) await t.test(scenario, async () => {
    const f = heldProductionFixture(true);
    if (scenario === 'wrong-pin') {
      f.request.continuation!.priorContinuation = structuredClone(stoppedEtsyContinuation);
      Object.assign(f.request.continuation!.priorContinuation, { journal: 1 });
    }
    if (scenario === 'reached-claim') {
      const prior = { ...f.run, id: 120, status: 'completed', conclusion: 'failure', updated_at: new Date(f.now).toISOString() };
      const listing = f.records['/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1'];
      listing.total_count++; listing.workflow_runs.push(prior);
      f.records['/actions/runs/120/jobs?filter=all&per_page=100'] = { total_count: 1, jobs: [{
        ...f.job, id: 450, run_id: 120, status: 'completed', conclusion: 'failure',
        steps: [{ name: heldClaimStep, status: 'completed', conclusion: 'skipped' },
          { name: replacementClaimStep, status: 'completed', conclusion: 'failure' }],
      }] };
    }
    const runtime = new URL(scenario === 'source-native' ? '../../scripts/routine-retained.mjs' : '../scripts/routine-retained.mjs', import.meta.url).href;
    const input = join(root, `${scenario}.json`);
    await writeFile(input, JSON.stringify({ delivery, runtime, request: f.request, env: f.env, records: f.records,
      source: f.source.toString('base64'), failedArtifact: f.failed.artifact.id, failedZip: f.failed.zip.toString('base64') }));
    const child = childProcess.spawnSync(process.execPath, ['--input-type=module', '-e', program, input], {
      env: { PATH: '/usr/bin:/bin', HOME: root }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.signal, null);
    assert.equal(child.status, ['compiled', 'source-native'].includes(scenario) ? 0 : 1, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.network, 0);
    assert.ok(result.loaded.includes(delivery));
    assert.ok(result.loaded.includes(new URL('../scripts/etsy-release.js', import.meta.url).href));
    assert.deepEqual(result.checks.find((check: { name: string }) => check.name === 'replacement.pinned-prior'),
      { name: 'replacement.pinned-prior', passed: scenario !== 'wrong-pin' });
    if (scenario === 'wrong-pin') {
      assert.equal(result.status, 'refused');
      assert.equal(result.reads.some((path: string) => path.includes('/actions/workflows/')), false);
    } else {
      assert.ok(result.checks.some((check: { name: string; passed: boolean }) => check.name === 'replacement.stopped-run-proof' && check.passed));
      if (scenario === 'reached-claim') {
        assert.equal(result.status, 'refused');
        assert.deepEqual(result.checks.at(-1), { name: 'held.no-prior-claim-attempt', passed: false });
      } else {
        assert.equal(result.status, 'admitted');
        assert.equal(result.execution.job, f.job.id);
        assert.deepEqual(result.checks.find((check: { name: string }) => check.name === 'replacement.failed-dispatch-present'),
          { name: 'replacement.failed-dispatch-present', passed: true });
        assert.ok(result.checks.some((check: { name: string; passed: boolean }) => check.name === 'replacement.failed-dispatch-unreserved' && check.passed));
      }
    }
  });
});

test('held continuation admits only the authenticated serialized production job', async t => {
  const valid = heldProductionFixture();
  assert.deepEqual(await valid.admit(), { version: 1, run: '123', job: 456, runner: 'synthetic-serialized-runner', runnerId: 789,
    revision: valid.request.controller.revision, tree: valid.request.controller.tree, workflowDigest: sha256(valid.source),
    environment: 'be-production', concurrency: 'esty-admin-be-production', cancelInProgress: false });
  for (const fault of ['main', 'runner', 'attempt', 'job', 'workflow', 'source', 'policy', 'claim-step', 'missing-job', 'truncated-runs']) {
    await t.test(fault, async () => {
      const f = heldProductionFixture();
      if (fault === 'main') f.records['/commits/main'].sha = 'f'.repeat(40);
      if (fault === 'runner') f.job.runner_name = 'unrelated-runner';
      if (fault === 'attempt') f.run.run_attempt = 2;
      if (fault === 'job') f.env.GITHUB_JOB = 'checks';
      if (fault === 'workflow') f.run.workflow_id = 1;
      if (fault === 'source') f.request.continuation!.operator.workflowDigest = '0'.repeat(64);
      if (fault === 'policy') {
        const index = f.source.indexOf('group: esty-admin-be-production');
        assert.ok(index >= 0);
        f.source.write('group: esty-admin-be-pr0duction', index);
        f.request.continuation!.operator.workflowDigest = sha256(f.source);
        f.records[`/contents/.github/workflows/be-delivery.yml?ref=${f.run.head_sha}`].content = f.source.toString('base64');
      }
      if (fault === 'claim-step') f.job.steps = [];
      if (fault === 'missing-job') f.records['/actions/runs/123/jobs?filter=all&per_page=100'] = { total_count: 2, jobs: [f.job] };
      if (fault === 'truncated-runs') f.records['/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1'].total_count = 2;
      await assert.rejects(f.admit(), /Routine retained release refused/);
    });
  }
});

test('held continuation retains lost-claim fences across approvals runs directories and skipped ordinary jobs', async t => {
  for (const state of ['in_progress', 'success', 'failure', 'missing', 'skipped']) await t.test(state, async () => {
    const f = heldProductionFixture(), prior = { ...f.run, id: 120, status: 'completed', conclusion: 'failure',
      updated_at: new Date(f.now - 10000).toISOString() };
    f.records['/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1'] = {
      total_count: 2, workflow_runs: [f.run, prior] };
    f.records['/actions/runs/120/jobs?filter=all&per_page=100'] = { total_count: 1, jobs: [{
      ...f.job, id: 450, run_id: 120, status: 'completed', conclusion: 'failure',
      steps: state === 'missing' ? [] : [{ name: heldClaimStep, status: state === 'in_progress' ? state : 'completed',
        conclusion: state === 'in_progress' ? null : state }, { name: replacementClaimStep, status: 'completed', conclusion: 'skipped' }],
    }] };
    f.request.continuation!.runId = randomUUID();
    f.request.continuation!.window = { start: f.now - 500, end: f.now + 300000 };
    const packetDigest = sha256(canonical(f.request.continuation));
    Object.assign(f.request.migration!, { packetDigest,
      recoveryApproval: sha256(canonical({ packet: packetDigest, recovery: f.packet.grants.recovery })),
      maintenanceApproval: sha256(canonical({ packet: packetDigest, window: f.request.continuation!.window, maintenance: f.packet.grants.maintenance })) });
    validateReleaseRequest(f.request, { version: 1, requestDigest: sha256(canonical(f.request)) });
    f.env.RUNNER_TEMP = '/synthetic/fresh-runner-directory';
    if (state === 'skipped') assert.equal((await f.admit()).job, 456);
    else await assert.rejects(f.admit(), /held.no-prior-claim-attempt/);
  });
});

test('held continuation selector cannot silently enter ordinary CREATE or a direct runner path', () => {
  const f = routineMetadataFixture(), env = { ...f.env, BE_HELD_INCIDENT: '45106877912', BE_DELIVERY_MODE: 'etsy-strict-cutover',
    BE_MIGRATION_PACKET_SHA256: 'a'.repeat(64) };
  const event = { inputs: { ...f.event.inputs, mode: 'etsy-strict-cutover', held_incident: '45106877912' } };
  assert.equal(routineContext(env, event).heldIncident, '45106877912');
  assert.throws(() => routineContext({ ...env, BE_HELD_INCIDENT: '' }, event));
  assert.throws(() => routineContext(env, { inputs: { ...event.inputs, held_incident: 'other' } }));
  assert.throws(() => routineContext({ ...env, BE_DELIVERY_MODE: 'versioned-migration' },
    { inputs: { ...event.inputs, mode: 'versioned-migration' } }));
  assert.throws(() => heldRunnerPaths({ ...env, GITHUB_JOB: 'checks', GITHUB_WORKSPACE: '/tmp/caller', RUNNER_TEMP: '/tmp/caller' }));
  const ordinary = routineContext(f.env, f.event);
  assert.equal(Object.hasOwn(ordinary, 'heldIncident'), false);
});

test('replacement ingress authenticates the exact stopped attempt and refuses every other reached claim', async t => {
  const valid = heldProductionFixture(true);
  assert.equal((await valid.admit()).job, 456);
  for (const fault of ['selector', 'stopped-run', 'stopped-jobs', 'successor-started', 'successor-success', 'successor-unknown', 'successor-skipped']) {
    await t.test(fault, async () => {
      const f = heldProductionFixture(true), pin = stoppedEtsyContinuation;
      if (fault === 'selector') f.env.BE_HELD_INCIDENT = '45106877912';
      if (fault === 'stopped-run') f.records[`/actions/runs/${pin.run}`].run_attempt = 2;
      if (fault === 'stopped-jobs') f.records[`/actions/runs/${pin.run}/jobs?filter=all&per_page=100`].total_count++;
      if (fault.startsWith('successor')) {
        const prior = { ...f.run, id: 120, status: 'completed', conclusion: 'failure', updated_at: new Date(f.now).toISOString() };
        const listing = f.records['/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1'];
        listing.total_count++; listing.workflow_runs.push(prior);
        f.records['/actions/runs/120/jobs?filter=all&per_page=100'] = { total_count: 1, jobs: [{
          ...f.job, id: 450, run_id: 120, status: 'completed', conclusion: 'failure',
          steps: [{ name: heldClaimStep, status: 'completed', conclusion: 'skipped' },
            ...(fault === 'successor-unknown' ? [] : [{ name: replacementClaimStep,
              status: fault === 'successor-started' ? 'in_progress' : 'completed',
              conclusion: fault === 'successor-started' ? null : fault === 'successor-success' ? 'success' : 'skipped' }])],
        }] };
        f.request.continuation!.runId = randomUUID();
        f.env.RUNNER_TEMP = '/synthetic/new-directory';
      }
      if (fault === 'successor-skipped') assert.equal((await f.admit()).job, 456);
      else await assert.rejects(f.admit(), /Routine retained release refused/);
    });
  }
});

test('replacement refuses journal or status drift and incomplete stopped proof before artifact download', async t => {
  const f = replacementContinuationFixture(), pin = stoppedEtsyContinuation;
  const fixture = await artifactFixture(); t.after(fixture.dispose);
  for (const fault of ['valid', 'journal', 'statuses', 'run', 'jobs', 'missing-artifact']) {
    await t.test(fault, async () => {
      const records: Record<string, unknown> = {
        [`/deployments/${pin.journal}`]: structuredClone(f.snapshots.journal),
        [`/deployments/${pin.journal}/statuses?per_page=100`]: structuredClone(f.snapshots.statuses),
        [`/actions/runs/${pin.run}`]: structuredClone(f.snapshots.run),
        [`/actions/runs/${pin.run}/jobs?filter=all&per_page=100`]: structuredClone(f.snapshots.jobs),
        [`/actions/runs/${pin.run}/artifacts?per_page=100`]: { total_count: 0, artifacts: [] },
      };
      if (fault === 'journal') records[`/deployments/${pin.journal}`] = { ...f.snapshots.journal, id: 1 };
      if (fault === 'statuses') records[`/deployments/${pin.journal}/statuses?per_page=100`] = f.snapshots.statuses.slice(0, -1);
      if (fault === 'run') records[`/actions/runs/${pin.run}`] = { ...f.snapshots.run, run_attempt: 2 };
      if (fault === 'jobs') records[`/actions/runs/${pin.run}/jobs?filter=all&per_page=100`] = { total_count: 0, jobs: [] };
      const io = { read: async (path: string) => {
        assert.ok(Object.hasOwn(records, path), `Unexpected synthetic read: ${path}`);
        return structuredClone(records[path]);
      }, download: async () => { assert.fail('Rejected proof must never download an artifact'); } };
      if (fault === 'valid') await confirmStoppedEtsyContinuation(io);
      else if (fault === 'journal' || fault === 'statuses') await assert.rejects(confirmStoppedEtsyContinuation(io), /statuses changed/);
      else await assert.rejects(proveEtsyReplacement(f.approval, { origin: f.origin, application: fixture.artifact,
        receiptZip: f.zip, record: {}, statuses: [], recheck: async () => {} }, io, join(fixture.root, 'unreachable'),
      AbortSignal.timeout(10000)), /Replacement refused/);
    });
  }
});

test('replacement never launders an existing or unknown durable successor with a fresh approval', async t => {
  const base = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(base.dispose);
  const f = replacementContinuationFixture(), h = routineProviderFixture(base.artifact);
  Object.assign(f.approval.operator, { artifactDigest: base.artifact.digest, sourceDigest: base.approval.sourceDigest,
    archiveDigest: base.approval.archiveDigest, operatorDigest: base.approval.operatorDigest });
  const digest = sha256(canonical(f.approval)), request = { ...f.request, artifactDigest: base.artifact.digest,
    sourceDigest: base.approval.sourceDigest, archiveDigest: base.approval.archiveDigest, operatorDigest: base.approval.operatorDigest,
    migration: { ...f.request.migration!, packetDigest: digest,
      recoveryApproval: sha256(canonical({ packet: digest, recovery: f.packet.grants.recovery })),
      maintenanceApproval: sha256(canonical({ packet: digest, window: f.approval.window, maintenance: f.packet.grants.maintenance })) } };
  const schema: RoutineDeliveryApproval = { digest: request.schema.targetDigest, configDigest: request.configDigest,
    request, requestDigest: sha256(canonical(request)), strictPacketDigest: digest };
  for (const prior of [
    { id: 999, task: 'deploy:esty-be-ci', environment: 'be-production', payload: { heldContinuation: { unknown: true } } },
    f.snapshots.journal,
    ...[
      { run: failedReplacementDispatch.run },
      { releaseRequest: { controller: { run: failedReplacementDispatch.run } } },
      { heldContinuation: { execution: { run: failedReplacementDispatch.run } } },
    ].map(payload => ({ id: 999, task: 'deploy:esty-be-ci', environment: 'be-production', payload })),
  ]) {
    let posts = 0;
    const transport: typeof fetch = async (raw, init) => {
      if (init?.method === 'POST') { posts++; assert.fail('A prior claim must never create a successor journal'); }
      const url = new URL(String(raw));
      assert.equal(url.hostname, 'api.github.com');
      assert.equal(url.pathname, `/repos/${repository}/deployments`);
      return Response.json([prior]);
    };
    await assert.rejects(createProvider(base.artifact, request.controller, schema, h.credentials,
      AbortSignal.timeout(10000), transport).reserve(), /durable or uncertain claim|Failed replacement dispatch has a durable reservation/);
    assert.equal(posts, 0);
  }
});

test('held continuation derives one canonical claim namespace and refuses caller-selected runner directories', async t => {
  const home = realpathSync(await mkdtemp(join(tmpdir(), 'esty-held-host-')));
  t.after(() => rm(home, { recursive: true, force: true }));
  const workspace = join(home, 'work/esty-admin/esty-admin'), temporary = join(home, 'work/_temp');
  await mkdir(join(workspace, '.github/workflows'), { recursive: true });
  await mkdir(temporary);
  await writeFile(join(workspace, '.github/workflows/be-delivery.yml'),
    readFileSync(new URL('../../../../.github/workflows/be-delivery.yml', import.meta.url)), { mode: 0o600 });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!, arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
  const user = os.userInfo();
  t.mock.method(os, 'userInfo', () => ({ ...user, homedir: home }));
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); Object.defineProperty(process, 'platform', platform);
    Object.defineProperty(process, 'arch', arch); syncBuiltinESMExports(); });
  const env = { GITHUB_ACTIONS: 'true', GITHUB_JOB: 'production', RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_WORKSPACE: workspace, RUNNER_TEMP: temporary, HOME: '/untrusted/caller/home' };
  const paths = heldRunnerPaths(env);
  assert.equal(paths.temporary, temporary);
  assert.equal(paths.receipts, join(temporary, 'be-receipts'));
  assert.throws(() => heldRunnerPaths({ ...env, RUNNER_TEMP: join(temporary, 'fresh') }));
  assert.throws(() => heldRunnerPaths({ ...env, GITHUB_WORKSPACE: join(home, 'other-checkout') }));
  const claims = join(paths.temporary, 'be-held-claims'); await mkdir(claims, { mode: 0o700 });
  const fixture = heldContinuationFixture(), path = join(claims, `${fixture.origin.key}.json`);
  const program = `import {writeReleaseEvidence} from ${JSON.stringify(new URL('../scripts/release-journal.js', import.meta.url).href)};
try { writeReleaseEvidence(process.argv[1], {lease:process.argv[2]}); console.log('CLAIMED'); }
catch (error) { if(error.code !== 'EEXIST') throw error; console.log('EXCLUSIVE_STOP'); }`;
  const compete = (lease: string) => new Promise<string>((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, ['--input-type=module', '-e', program, path, lease],
      { env: {}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, killSignal: 'SIGKILL' });
    let stdout = '', stderr = '';
    child.stdout!.on('data', bytes => { stdout += bytes; });
    child.stderr!.on('data', bytes => { stderr += bytes; });
    child.on('error', reject);
    child.on('close', code => code === 0 && stderr === '' ? resolve(stdout.trim()) : reject(new Error(`Synthetic claim child failed: ${code}`)));
  });
  assert.deepEqual((await Promise.all([compete('first-approved-window'), compete('different-approved-window')])).sort(),
    ['CLAIMED', 'EXCLUSIVE_STOP']);
  const retained = readEvidence(path);
  assert.throws(() => writeReleaseEvidence(path, { lease: 'restart' }), { code: 'EEXIST' });
  assert.deepEqual(readEvidence(path), retained);
});
const oldSchema: RoutineDeliveryApproval = { digest: activationSchema.oldDigest,
  configDigest: runtimeConfigDigest(routineRuntime), requestDigest: sha256('independently-approved-synthetic-request') };

test('L3 canonical strict reservation binds the complete request and survives a fresh runner directory', async t => {
  const f = await strictReleaseFixture(); t.after(f.dispose);
  const h = routineProviderFixture(f.artifact, '', undefined, { packet: f.packet });
  const sourceReads = new Set<string>(), origins = new Set<string>();
  t.mock.method(globalThis, 'fetch', async (raw: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(String(raw)), auth = new Headers(init?.headers).get('authorization');
    origins.add(url.origin);
    if (url.origin === 'https://api.github.com' && url.pathname.includes('/commits/')) {
      assert.ok([`https://api.github.com/repos/${repository}/commits/main`,
        `https://api.github.com/repos/${repository}/commits/${f.packet.predecessor.revision}`].includes(url.href));
      assert.equal(auth, `Bearer ${h.credentials.github}`);
      assert.ok(init?.redirect === 'error' || init?.redirect === 'manual');
      sourceReads.add(url.pathname);
    } else if (url.origin === 'https://api.vercel.com') assert.equal(auth, `Bearer ${h.credentials.vercel}`);
    else if (url.origin !== 'https://api.github.com') assert.notEqual(auth, `Bearer ${h.credentials.github}`);
    return h.transport(raw, init);
  });
  const env = { ...f.env, BE_ROUTINE_ACTION: 'authorize', GITHUB_TOKEN: h.credentials.github,
    VERCEL_TOKEN: h.credentials.vercel, BE_PREVIEW_ACCESS_KEY: h.credentials.bearer, VERCEL_AUTOMATION_BYPASS_SECRET: h.credentials.bypass };
  const reports = join(f.root, 'strict-reports');
  await runRoutinePhase({ artifact: f.artifact, request: f.request, env, cli: f.cli, reports, signal: AbortSignal.timeout(15000) });
  assert.deepEqual([...sourceReads].sort(), [`/repos/${repository}/commits/main`,
    `/repos/${repository}/commits/${f.packet.predecessor.revision}`].sort());
  assert.deepEqual([...origins].sort(), ['https://api.github.com', 'https://api.lovora.us', 'https://api.vercel.com'].sort());
  assert.equal(h.reservation()!.payload.requestDigest, sha256(canonical(f.request)));
  assert.equal(h.reservation()!.payload.migrationPacket, f.packetDigest);
  assert.equal(h.reservation()!.payload.configDigest, f.request.configDigest);
  assert.equal(fs.existsSync(f.packet.ledgerRoot), false, 'Actions must not borrow the owner-home ledger');
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  const authorization = readEvidence(join(reports, 'strict/history.authorized.json')).value as Record<string, unknown>;
  assert.equal(authorization.requestDigest, sha256(canonical(f.request)));
  assert.equal(h.statuses[0]!.description, authorization.description);
  const statuses = structuredClone(h.statuses);
  await assert.rejects(runRoutinePhase({ artifact: f.artifact, request: f.request, env, cli: f.cli,
    reports: join(f.root, 'replacement-runner'), signal: AbortSignal.timeout(15000) }));
  assert.deepEqual(h.statuses, statuses);
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  const changed = structuredClone(f.request); changed.archiveDigest = '0'.repeat(64);
  await assert.rejects(runRoutinePhase({ artifact: f.artifact, request: changed, env: { ...env, BE_ROUTINE_ACTION: 'held' },
    cli: f.cli, reports, signal: AbortSignal.timeout(15000) }));
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
});

test('L3 strict GitHub source refusal retains reservation and fences mutations without leaking credentials', async t => {
  for (const status of [403, 302]) await t.test(String(status), async st => {
    const f = await strictReleaseFixture(); st.after(f.dispose);
    const h = routineProviderFixture(f.artifact, '', undefined, { packet: f.packet });
    h.credentials.github = 'OpaqueGitHubAuthCanary0123456789';
    const bodyCanary = 'OpaqueSourceBodyCanary9876543210', output: string[] = [];
    st.mock.method(console, 'info', (...args: unknown[]) => output.push(args.join(' ')));
    st.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
    let sourceReads = 0, bodyCancelled = 0, reservationPosts = 0, foreignRequests = 0;
    let cliCalls = 0, sqlCalls = 0;
    const { default: pg } = await import('pg');
    st.mock.method(pg.Client.prototype, 'connect', () => { sqlCalls++; throw new Error('SQL forbidden during source refusal.'); });
    st.mock.method(pg.Pool.prototype, 'connect', () => { sqlCalls++; throw new Error('SQL forbidden during source refusal.'); });
    st.mock.method(childProcess, 'spawn', () => { cliCalls++; throw new Error('CLI forbidden during source refusal.'); });
    syncBuiltinESMExports();
    st.after(() => { st.mock.restoreAll(); syncBuiltinESMExports(); });
    st.mock.method(globalThis, 'fetch', async (raw: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(String(raw)), auth = new Headers(init?.headers).get('authorization');
      if (!['https://api.github.com', 'https://api.vercel.com', 'https://api.lovora.us'].includes(url.origin)) {
        foreignRequests++; throw new Error('Unexpected synthetic origin; no network fallback.');
      }
      if (url.origin !== 'https://api.github.com') assert.notEqual(auth, `Bearer ${h.credentials.github}`);
      if (url.origin === 'https://api.vercel.com') assert.equal(auth, `Bearer ${h.credentials.vercel}`);
      if (url.href === `https://api.github.com/repos/${repository}/deployments` && init?.method === 'POST') reservationPosts++;
      if (url.href === `https://api.github.com/repos/${repository}/commits/${f.packet.predecessor.revision}`) {
        sourceReads++;
        assert.equal(auth, `Bearer ${h.credentials.github}`);
        assert.equal(init?.redirect, 'manual');
        return new Response(new ReadableStream({
          start(controller) { controller.enqueue(new TextEncoder().encode(`${h.credentials.github}:${bodyCanary}`)); },
          cancel() { bodyCancelled++; },
        }), { status, headers: { location: `https://foreign.invalid/source?credential=${h.credentials.github}` } });
      }
      return h.transport(raw, init);
    });
    const env = { ...f.env, BE_ROUTINE_ACTION: 'authorize', GITHUB_TOKEN: h.credentials.github,
      VERCEL_TOKEN: h.credentials.vercel, BE_PREVIEW_ACCESS_KEY: h.credentials.bearer, VERCEL_AUTOMATION_BYPASS_SECRET: h.credentials.bypass };
    const reports = join(f.root, 'source-denial'), trace = new ChecksDiagnostics(join(f.root, 'source-diagnostics'), { scope: 'release' });
    await assert.rejects(runRoutinePhase({ artifact: f.artifact, request: f.request, env, cli: f.cli, reports,
      signal: AbortSignal.timeout(15000), trace, emit: false }), (cause: unknown) => {
      assert.ok(cause instanceof Error && 'result' in cause);
      const result = validateReleaseResult(cause.result);
      assert.equal(result.stage, 'reserve'); assert.equal(result.evidence, 'confirmed');
      assert.deepEqual(result.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' });
      assert.equal(result.deploymentId, null); assert.equal(result.migration, null);
      assert.equal(String(cause).includes(h.credentials.github), false);
      return true;
    });
    assert.equal(sourceReads, 1); assert.equal(bodyCancelled, 1); assert.equal(foreignRequests, 0);
    assert.equal(reservationPosts, 1); assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
    assert.deepEqual(readEvidence(join(reports, 'strict/reservation.json')).value,
      { version: 1, requestDigest: sha256(canonical(f.request)), packetDigest: f.packetDigest, journal: 44 });
    assert.equal(fs.existsSync(join(reports, 'strict/history.authorized.json')), false);
    assert.equal(h.statuses[0]!.state, 'error'); assert.equal(h.statuses[0]!.description, 'strict:unresolved');
    const failed = output.map(line => JSON.parse(line)).find(row => row.check === 'strict.github-predecessor-http-status' && row.status === 'failed');
    assert.deepEqual(failed?.values, { actual: status, expected: 200, redirected: false });
    const persisted = await readFile(join(trace.directory, `${trace.correlation}-events.jsonl`), 'utf8');
    for (const canary of [h.credentials.github, bodyCanary, 'foreign.invalid']) {
      assert.equal((output.join('\n') + persisted).includes(canary), false);
    }
    const statuses = structuredClone(h.statuses);
    await assert.rejects(runRoutinePhase({ artifact: f.artifact, request: f.request, env, cli: f.cli,
      reports: join(f.root, 'replacement-runner'), signal: AbortSignal.timeout(15000), emit: false }));
    assert.deepEqual(h.statuses, statuses); assert.equal(reservationPosts, 1); assert.equal(sourceReads, 1);
    assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
    assert.equal(cliCalls, 0); assert.equal(sqlCalls, 0);
  });
});

test('L3 ordinary provider refuses missing request approval before transport', async t => {
  const f = await fixture(); t.after(f.dispose); let requests = 0;
  for (const requestDigest of [undefined, '', 'not-approved']) {
    assert.throws(() => Reflect.apply(createProvider, undefined, [f.artifact, run, { ...oldSchema, requestDigest }, credentials,
      AbortSignal.timeout(1000), async () => { requests++; throw new Error('Unexpected transport'); }]));
  }
  assert.equal(requests, 0);
});

test('L3 reconciliation reads authenticated known IDs without replay or unbounded provider descriptions', async t => {
  const f = await fixture(); t.after(f.dispose);
  const h = routineProviderFixture(f.artifact), provider = createProvider(f.artifact, h.run, h.schema, h.credentials,
    AbortSignal.timeout(10000), h.transport);
  const journal = await provider.reserve(); await provider.record(journal, 'in_progress', 'ack:dpl_candidate');
  const statuses = structuredClone(h.statuses);
  const observed = await provider.reconcileRoutineJournal(journal);
  assert.deepEqual(observed, { journal, requestDigest: h.schema.requestDigest, description: 'ack:dpl_candidate',
    state: 'in_progress', acknowledgedIds: ['dpl_candidate'] });
  assert.deepEqual(h.statuses, statuses); assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  h.statuses[0]!.description = 'synthetic-secret-canary';
  await assert.rejects(provider.reconcileRoutineJournal(journal));
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
});

interface Fixture { artifact: VerifiedArtifact; dispose(): Promise<void> }
async function fixture(): Promise<Fixture> {
  const migration = readFileSync(new URL('../../migrations/1792972800000-foundation.mjs', import.meta.url), 'utf8');
  const base = await artifactFixture('release', migration);
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'ci'), config: base.config,
    source: { ...base.artifact.manifest.source, repository: `https://github.com/${repository}` },
    migrations: base.artifact.manifest.migrations, build: base.artifact.manifest.build });
  return { artifact, dispose: base.dispose };
}
function context(): NodeJS.ProcessEnv {
  return { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_RUN_ATTEMPT: '1', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/be-delivery.yml@refs/heads/main`,
    BE_DELIVERY_ENABLED: 'true', BE_DELIVERY_ENVIRONMENT: 'be-production', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123' };
}
const run: RunIdentity = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), run: '123' };
const credentials = { github: 'synthetic-github-token', vercel: 'synthetic-vercel-token', bearer: 'c'.repeat(64), bypass: 'synthetic-platform-bypass' };

function releaseRequest(mode: 'current-schema-only' | 'versioned-migration' | 'etsy-strict-cutover' = 'current-schema-only') {
  const previous = migrationManifest.slice(0, 3), target = mode === 'current-schema-only' ? previous : migrationManifest;
  return {
    version: 1, mode, repository, target: 'supabase:abcdefghijklmnopqrst', controller: { ...run, revision: 'c'.repeat(40) },
    producer: { ...run, run: '122' }, artifactId: '456', artifactDigest: 'd'.repeat(64), sourceDigest: '0'.repeat(64),
    archiveDigest: 'e'.repeat(64), operatorDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), historicalHandoffDigest,
    schema: { beforeDigest: sha256(JSON.stringify(previous)), targetDigest: sha256(JSON.stringify(target)), before: previous, target },
    migration: mode === 'current-schema-only' ? null : {
      packetDigest: '2'.repeat(64), predecessor: { id: 'dpl_previous', revision: '3'.repeat(40),
        artifactDigest: '4'.repeat(64), configDigest: '5'.repeat(64) },
      recoveryApproval: '6'.repeat(64), compatibilityApproval: mode === 'versioned-migration' ? '7'.repeat(64) : null,
      maintenanceApproval: mode === 'etsy-strict-cutover' ? '8'.repeat(64) : null,
    },
  };
}
const releaseApproval = (request: unknown) => ({ version: 1, requestDigest: sha256(canonical(request)) });

test('L0 request admits independently approved modes without treating bundle declarations as approval', () => {
  for (const mode of ['current-schema-only', 'versioned-migration', 'etsy-strict-cutover'] as const) {
    const request = releaseRequest(mode);
    const admitted = validateReleaseRequest(request, releaseApproval(request));
    assert.equal(admitted.mode, mode);
    assert.equal(admitted.producer.run, '122');
    assert.equal(admitted.controller.run, '123');
    assert.notEqual(admitted.controller.revision, admitted.producer.revision);
    request.producer.run = '999';
    assert.equal(admitted.producer.run, '122', 'Admission snapshots the approved identities');
    assert.throws(() => { admitted.producer.run = '999'; }, TypeError);
  }
});

test('L0 partial, self-approved and cross-bound requests refuse before synthetic transport', () => {
  const baseline = releaseRequest(), approval = releaseApproval(baseline);
  const changed: unknown[] = [null, [], { ...baseline, version: 2 }, { ...baseline, mode: 'activation' },
    { ...baseline, approval }, { ...baseline, artifactId: '0' }, { ...baseline, configDigest: undefined },
    { ...baseline, controller: { ...baseline.controller, run: '124' } },
    { ...baseline, producer: { ...baseline.producer, revision: '9'.repeat(40) } },
    { ...baseline, artifactDigest: '9'.repeat(64) }, { ...baseline, archiveDigest: '9'.repeat(64) },
    { ...baseline, operatorDigest: '9'.repeat(64) }, { ...baseline, configDigest: '9'.repeat(64) },
    { ...baseline, repository: 'fork/esty-admin' }, { ...baseline, sourceDigest: '9'.repeat(64) },
    { ...baseline, target: 'supabase:tsrqponmlkjihgfedcba' },
    ...Object.keys(baseline).map(omitted => Object.fromEntries(Object.entries(baseline).filter(([key]) => key !== omitted))),
    { ...baseline, artifactId: 'https://user:synthetic-secret-canary@provider.invalid/artifact' }];
  let transport = 0;
  for (const request of changed) {
    assert.throws(() => { new ReleaseOutcome(request, approval); transport++; }, error => {
      assert.ok(error instanceof Error); assert.doesNotMatch(error.message, /synthetic-secret-canary|user:|provider\.invalid/);
      return true;
    });
    const admission = ReleaseOutcome.admit(request, approval);
    if (admission instanceof ReleaseOutcome) transport++;
    else {
      assert.equal(admission.status, 'refused'); assert.equal(admission.stage, 'request');
      assert.equal(admission.category, 'invalid-input'); assert.equal(admission.request, null);
      assert.deepEqual(admission.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' });
      assert.doesNotMatch(JSON.stringify(admission), /synthetic-secret-canary|user:|provider\.invalid/);
    }
  }
  for (const invalidApproval of [undefined, {}, baseline, { ...approval, requestDigest: '0'.repeat(64) }]) {
    assert.throws(() => { new ReleaseOutcome(baseline, invalidApproval); transport++; });
  }
  assert.equal(transport, 0);
});

test('L0 schema and recovery authority reject incomplete or cross-mode migration packets', () => {
  const compatible = releaseRequest('versioned-migration'), strict = releaseRequest('etsy-strict-cutover');
  const cases = [
    { ...compatible, migration: null },
    { ...compatible, migration: { ...compatible.migration, compatibilityApproval: null } },
    { ...strict, migration: { ...strict.migration, maintenanceApproval: null } },
    { ...strict, migration: { ...strict.migration, recoveryApproval: null } },
    { ...strict, migration: { ...strict.migration, compatibilityApproval: 'a'.repeat(64) } },
    { ...compatible, schema: { ...compatible.schema, target: compatible.schema.before, targetDigest: compatible.schema.beforeDigest } },
    { ...compatible, schema: { ...compatible.schema, beforeDigest: '0'.repeat(64) } },
    { ...compatible, schema: { ...compatible.schema, targetDigest: '0'.repeat(64) } },
    { ...compatible, schema: { ...compatible.schema, before: [{ ...compatible.schema.before[0]!, sha256: '0'.repeat(64) }] } },
    { ...compatible, schema: { beforeDigest: sha256(JSON.stringify(compatible.schema.before.slice(0, 1))),
      targetDigest: compatible.schema.beforeDigest, before: compatible.schema.before.slice(0, 1), target: compatible.schema.before } },
    { ...releaseRequest(), migration: strict.migration },
    { ...strict, schema: { ...strict.schema, beforeDigest: sha256(JSON.stringify(strict.schema.before.slice(0, 2))),
      before: strict.schema.before.slice(0, 2) } },
  ];
  let submits = 0;
  for (const request of cases) assert.throws(() => { new ReleaseOutcome(request, releaseApproval(request)); submits++; });
  assert.equal(submits, 0);
});

test('L0 accepted result requires same deployment and all exact final proof plus durable receipt', () => {
  const request = releaseRequest(), state = new ReleaseOutcome(request, releaseApproval(request));
  assert.throws(() => state.submitted('migration'), /Release contract/);
  assert.throws(() => state.acknowledgeCreate('dpl_candidate'), /Release contract/);
  assert.throws(() => state.acknowledgePromotion(), /Release contract/);
  assert.throws(() => state.submitted('promotion'), /Release contract/);
  state.submitted('create'); state.acknowledgeCreate('dpl_candidate');
  state.submitted('promotion'); state.acknowledgePromotion();
  const proof = { deploymentId: 'dpl_candidate', artifactDigest: request.artifactDigest, configDigest: request.configDigest,
    schemaDigest: sha256(JSON.stringify(request.schema.target)), domain: 'api.lovora.us', checks: 'passed' };
  for (const altered of [{ ...proof, deploymentId: 'dpl_other' }, { ...proof, configDigest: '0'.repeat(64) },
    { ...proof, artifactDigest: '0'.repeat(64) }, { ...proof, schemaDigest: '0'.repeat(64) },
    { ...proof, domain: 'other.invalid' }, { ...proof, checks: 'READY' }]) {
    assert.throws(() => state.finish({ stage: 'receipt', category: null, nextAction: 'run-acceptance',
      receiptDigest: 'a'.repeat(64), proof: altered }));
  }
  assert.throws(() => state.finish({ stage: 'receipt', category: null, nextAction: 'run-acceptance', receiptDigest: null, proof }));
  const result = state.finish({ stage: 'receipt', category: null, nextAction: 'run-acceptance', receiptDigest: 'a'.repeat(64), proof });
  assert.equal(result.status, 'accepted');
  assert.equal(result.effects.migration, 'not-started');
  assert.equal(result.deploymentId, 'dpl_candidate');
  assert.deepEqual(validateReleaseResult(JSON.parse(JSON.stringify(result))), result);
  for (const patch of [{ status: 'success' }, { stage: 'raw-provider-stage' }, { category: 'raw-provider-error' },
    { nextAction: 'retry' }, { stage: { toString: () => 'receipt' } },
    { effects: { ...result.effects, create: 'done' } }, { effects: { ...result.effects, create: { toString: () => 'ACKed' } } },
    { providerBody: 'synthetic-secret-canary' }, { deploymentId: null }]) {
    assert.throws(() => validateReleaseResult({ ...result, ...patch }), /Release contract/);
  }
});

test('L0 compatible migration requires confirmed SQL before CREATE; strict cutover requires held CREATE first', () => {
  const compatible = releaseRequest('versioned-migration'), strict = releaseRequest('etsy-strict-cutover');
  const ordinary = new ReleaseOutcome(compatible, releaseApproval(compatible));
  const held = new ReleaseOutcome(strict, releaseApproval(strict));
  assert.throws(() => ordinary.submitted('create'), /Release contract/);
  ordinary.submitted('migration');
  assert.throws(() => ordinary.submitted('create'), /Release contract/);
  assert.throws(() => held.submitted('migration'), /Release contract/);
  held.submitted('create');
  assert.throws(() => held.submitted('migration'), /Release contract/);
  held.acknowledgeCreate('dpl_held');
  held.submitted('migration');
  const result = held.finish({ stage: 'sql', category: 'timeout', nextAction: 'reconcile-migration', receiptDigest: null });
  assert.equal(result.status, 'unknown'); assert.equal(result.effects.create, 'ACKed'); assert.equal(result.effects.migration, 'unknown');
  assert.throws(() => validateReleaseResult({ ...result, deploymentId: null, effects: { ...result.effects, create: 'not-started' } }));
});

test('L0 unknown reservation is fenced even before CREATE and cannot suggest nonexistent identities', () => {
  const request = releaseRequest(), state = new ReleaseOutcome(request, releaseApproval(request));
  const result = state.finish({ stage: 'reserve', category: 'outcome-unknown', nextAction: 'inspect-retained-evidence', receiptDigest: null });
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' });
  for (const nextAction of ['inspect-known-deployment', 'reconcile-migration', 'reconcile-promotion', 'none']) {
    assert.throws(() => validateReleaseResult({ ...result, nextAction }), /Release contract/);
  }
});

test('L4 evidence loss preserves the original stage and category with known operation effects', () => {
  const request = releaseRequest(), state = new ReleaseOutcome(request, releaseApproval(request));
  state.submitted('create'); state.acknowledgeCreate('dpl_candidate');
  const input = { stage: 'candidate' as const, category: 'configuration-mismatch' as const,
    nextAction: 'inspect-known-deployment' as const, receiptDigest: null, evidence: 'unconfirmed' as const };
  const result = state.finish(input);
  assert.equal(result.status, 'unknown'); assert.equal(result.stage, 'candidate');
  assert.equal(result.category, 'configuration-mismatch'); assert.equal(result.effects.create, 'ACKed');
  assert.equal(result.deploymentId, 'dpl_candidate');
  assert.throws(() => validateReleaseResult({ ...result, evidence: 'synthetic-secret-canary' }));
});

test('L4 actual delivery and selection executables emit bounded refusals without network or secret output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-l4-entry-')); t.after(() => rm(root, { recursive: true, force: true }));
  const guard = join(root, 'deny-network.mjs');
  await writeFile(guard, `
    import net from 'node:net';import tls from 'node:tls';import dgram from 'node:dgram';
    let calls=0;const deny=()=>{calls++;throw Error('synthetic-secret-canary');};
    globalThis.fetch=deny;net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;tls.connect=deny;dgram.createSocket=deny;
    process.on('exit',()=>{if(calls)process.exitCode=97;});
  `);
  for (const script of ['ci-delivery.js', 'routine-retained.mjs']) {
    const output = join(root, script + '.output'), summary = join(root, script + '.summary');
    const child = childProcess.spawnSync(process.execPath, ['--import', guard,
      decodeURIComponent(new URL('../scripts/' + script, import.meta.url).pathname)], {
      env: { PATH: '/usr/bin:/bin', HOME: root, RUNNER_TEMP: root, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
        GITHUB_TOKEN: 'synthetic-github-token', VERCEL_TOKEN: 'synthetic-vercel-token',
        DATABASE_URL: 'postgresql://user:synthetic-secret-canary@provider.invalid/database' },
      encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 1);
    const result = validateReleaseResult(JSON.parse(child.stdout.trim().split('\n').at(-1)!));
    assert.equal(result.status, 'refused'); assert.equal(result.request, null);
    assert.deepEqual(result.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' });
    assert.equal(result.deploymentId, null); assert.equal(result.nextAction, 'inspect-prerequisite');
    assert.match(await readFile(output, 'utf8'), /accepted=false/);
    const text = child.stdout + child.stderr + await readFile(summary, 'utf8');
    assert.doesNotMatch(text, /synthetic-secret-canary|synthetic-github-token|synthetic-vercel-token|provider\.invalid/);
  }
});

test('untrusted, stale-attempt and unactivated contexts cannot enter production', () => {
  assert.deepEqual(deliveryContext(context(), run.tree), run);
  for (const change of [{ GITHUB_REPOSITORY: 'fork/esty-admin' }, { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'push' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_RUN_ATTEMPT: '2' },
    { GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/other.yml@refs/heads/main` }, { BE_DELIVERY_ENABLED: 'false' },
    { BE_DELIVERY_ENVIRONMENT: 'preview' }, { GITHUB_SHA: 'invalid' }, { GITHUB_RUN_ID: '0' }]) {
    assert.throws(() => deliveryContext({ ...context(), ...change }, run.tree));
  }
  assert.equal(checksContext({ ...context(), GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/1/merge' }), 'development');
  assert.throws(() => checksContext({ ...context(), GITHUB_EVENT_NAME: 'pull_request_target' }));
  assert.throws(() => checksContext({ ...context(), GITHUB_REF: 'refs/heads/not-main' }));
});

test('L1 actual workflow production predicate and executable context reject push even when enabled', () => {
  const workflow = readFileSync(new URL('../../../../.github/workflows/be-delivery.yml', import.meta.url), 'utf8');
  const checksJob = workflow.split('\n  checks:\n')[1]?.split(/\n  [a-z_]+:\n/)[0];
  assert.ok(checksJob, 'The checks job must retain public failure diagnostics');
  const diagnosticUploads = checksJob.split(/(?=^      - )/m)
    .filter(step => /^          name: be-checks-diagnostics-/m.test(step));
  assert.equal(diagnosticUploads.length, 1, 'Exactly one bounded diagnostics upload is required');
  const diagnostics = diagnosticUploads[0];
  assert.ok(diagnostics);
  assert.equal(diagnostics.match(/^        if: (.+)$/m)?.[1]?.trim(), 'always()',
    'Diagnostics must survive a failed checks step');
  assert.equal(diagnostics.match(/^        continue-on-error: (.+)$/m)?.[1]?.trim(), 'true',
    'An upload failure must not replace the original checks result');
  const diagnosticPaths = diagnostics.match(/^          path: \|\n((?:            .*(?:\n|$))*)/m)?.[1]
    ?.trim().split('\n').map(path => path.trim());
  assert.deepEqual(diagnosticPaths, [
    '${{ runner.temp }}/be-checks-diagnostics/*-stage.json',
    '${{ runner.temp }}/be-checks-diagnostics/failed-stage.json',
    '${{ runner.temp }}/be-checks-diagnostics/*-stdout.log',
    '${{ runner.temp }}/be-checks-diagnostics/*-stderr.log',
  ], 'Diagnostics must upload exactly the four public globs, never broader paths');
  const expression = workflow.match(/if: &production-eligible >-\n([\s\S]*?)\n    runs-on:/)?.[1]?.trim()
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  assert.ok(expression);
  const evaluate = (event: string, mode = 'current-schema-only', enabled = 'true', attempt = '1') =>
    runInNewContext(expression, { github: { repository, ref: 'refs/heads/main', run_attempt: attempt, event_name: event },
      vars: { BE_DELIVERY_ENABLED: enabled }, inputs: { mode } }, { timeout: 100 });
  for (const event of ['push', 'pull_request', 'pull_request_target', 'schedule']) {
    assert.equal(evaluate(event), false, `${event} must remain checks-only`);
    assert.throws(() => deliveryContext({ ...context(), GITHUB_EVENT_NAME: event }, run.tree));
  }
  for (const mode of ['current-schema-only', 'versioned-migration', 'etsy-strict-cutover']) assert.equal(evaluate('workflow_dispatch', mode), true);
  for (const mode of ['activation', '', 'unexpected']) assert.equal(evaluate('workflow_dispatch', mode), false);
  assert.equal(evaluate('workflow_dispatch', 'current-schema-only', 'false'), false);
  assert.equal(evaluate('workflow_dispatch', 'current-schema-only', 'true', '2'), false);
});

test('L1 invalid dispatch and absent approval refuse before metadata transport', async () => {
  const f = routineMetadataFixture();
  let reads = 0;
  for (const patch of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_RUN_ATTEMPT: '2' },
    { GITHUB_REF: 'refs/heads/other' }, { GITHUB_REPOSITORY: 'fork/esty-admin' }, { BE_DELIVERY_ENABLED: 'false' },
    { BE_DELIVERY_ENVIRONMENT: 'preview' }, { BE_RELEASE_CONTROLLER_SHA: 'f'.repeat(40) },
    { BE_RELEASE_APPROVAL_SHA256: undefined }, { BE_DELIVERY_CONFIG_SHA256: undefined },
    { BE_DELIVERY_SCHEMA_SHA256: 'https://secret-canary@private.invalid' }]) {
    await assert.rejects(async () => {
      const context = routineContext({ ...f.env, ...patch }, f.event);
      await selectRoutine(context, async () => { reads++; return {}; });
    }, /Routine retained release refused/);
  }
  for (const inputs of [{ ...f.event.inputs, release_run_id: '123' }, { ...f.event.inputs, release_artifact_id: '' },
    { ...f.event.inputs, mode: 'activation' }, { ...f.event.inputs, activation_artifact_id: '456' }]) {
    assert.throws(() => routineContext(f.env, { inputs }));
  }
  assert.equal(reads, 0);
});

test('L1 optional activation input accepts omitted, empty and null only as routine no-value shapes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-optional-input-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const mode of ['current-schema-only', 'versioned-migration', 'etsy-strict-cutover']) {
    for (const [kind, value] of [['omitted', undefined], ['empty', ''], ['null', null]] as const) {
      await t.test(`${mode}: ${kind}`, async () => {
        const f = routineMetadataFixture(), eventPath = join(root, 'event.json'), packetDigest = 'b'.repeat(64);
        await writeFile(eventPath, JSON.stringify({ inputs: { ...f.event.inputs, mode, activation_artifact_id: value } }), { mode: 0o600 });
        const context = loadRoutineContext({ ...f.env, GITHUB_EVENT_PATH: eventPath, BE_DELIVERY_MODE: mode, BE_MIGRATION_PACKET_SHA256: packetDigest });
        const selected = await selectRoutine(context, f.read, f.now);
        assert.deepEqual(selected.context, { ...f.context, mode, packetDigest: mode === 'current-schema-only' ? null : packetDigest });
        assert.equal(selected.artifact.id, '456'); assert.equal(selected.producer.run, '122'); assert.equal(selected.checksJobId, '789');
      });
    }
  }
});

test('L1 optional activation input refuses values and mode mixing before metadata transport', async () => {
  const f = routineMetadataFixture();
  for (const value of ['456', ' ', 'null', 'opaqueOptionalInputCanary321', [], ['456'], {}, { input: 'opaqueOptionalInputCanary321' }, 0, 456, false, true]) {
    await assert.rejects(async () => {
      const context = routineContext(f.env, { inputs: { ...f.event.inputs, activation_artifact_id: value } });
      await selectRoutine(context, f.read, f.now);
    }, /context.activation-input-absent/);
    assert.equal(f.reads(), 0);
  }
  for (const value of [undefined, '', null]) {
    for (const [envMode, eventMode, reason] of [
      ['current-schema-only', 'activation', /context.mode-binding/],
      ['activation', 'activation', /context.mode\./],
      ['etsy-strict-cutover', 'versioned-migration', /context.mode-binding/],
    ] as const) {
      await assert.rejects(async () => {
        const context = routineContext({ ...f.env, BE_DELIVERY_MODE: envMode },
          { inputs: { ...f.event.inputs, mode: eventMode, activation_artifact_id: value } });
        await selectRoutine(context, f.read, f.now);
      }, reason);
      assert.equal(f.reads(), 0);
    }
  }
});

test('L1 optional activation input diagnostics expose kind and empty state but never input payload', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-optional-shape-')); t.after(() => rm(root, { recursive: true, force: true }));
  const f = routineMetadataFixture(), logs: string[] = [], directory = join(root, 'logs');
  t.mock.method(console, 'info', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args.join(' ')));
  const trace = new ChecksDiagnostics(directory, { scope: 'release' });
  const cases: Array<[unknown, string, boolean]> = [
    [undefined, 'undefined', true], ['', 'string', true], [null, 'null', true],
    ['opaqueOptionalInputCanary321', 'string', false], [['opaqueOptionalInputCanary321'], 'array', false],
    [{ input: 'opaqueOptionalInputCanary321' }, 'object', false], [0, 'number', false], [false, 'boolean', false],
  ];
  for (const [value, kind, accepted] of cases) {
    const start = logs.length;
    const validate = () => withRoutineDiagnostics(trace, () => routineContext(f.env,
      { inputs: { ...f.event.inputs, activation_artifact_id: value } }));
    if (accepted) assert.deepEqual(validate(), f.context);
    else assert.throws(validate, /context.activation-input-absent/);
    const record = logs.slice(start).map(line => JSON.parse(line)).find(row => row.check === 'context.activation-input-absent');
    assert.ok(record); assert.equal(record.status, accepted ? 'passed' : 'failed');
    assert.deepEqual(record.values, { present: value !== undefined, empty: value === '', [`${kind}Value`]: true });
  }
  const retained = (await fsPromises.readdir(directory)).map(name => readFileSync(join(directory, name), 'utf8')).join('\n');
  assert.doesNotMatch(logs.join('\n') + retained, /opaqueOptionalInputCanary321/);
});

test('L1 authenticated retained selection binds actual consumer, producer checks and immutable artifact', async t => {
  const failures: Array<[string, (records: Record<string, any>) => void]> = [
    ['forged dispatch environment with actual push run', r => { r['/actions/runs/123'].event = 'push'; }],
    ['consumer wrong revision', r => { r['/actions/runs/123'].head_sha = 'f'.repeat(40); }],
    ['consumer rerun', r => { r['/actions/runs/123'].run_attempt = 2; }],
    ['consumer fork', r => { r['/actions/runs/123'].head_repository.full_name = 'fork/esty-admin'; }],
    ['consumer wrong workflow', r => { r['/actions/runs/123'].path = '.github/workflows/other.yml'; }],
    ['stale controller main', r => { r['/commits/main'].sha = 'f'.repeat(40); }],
    ['producer failure', r => { r['/actions/runs/122'].conclusion = 'failure'; }],
    ['producer cancelled', r => { r['/actions/runs/122'].conclusion = 'cancelled'; }],
    ['producer PR development', r => { r['/actions/runs/122'].event = 'pull_request'; }],
    ['producer fork', r => { r['/actions/runs/122'].head_repository.full_name = 'fork/esty-admin'; }],
    ['producer wrong run', r => { r['/actions/runs/122'].id = 121; }],
    ['producer source drift', r => { r['/actions/runs/122'].head_sha = 'f'.repeat(40); }],
    ['checks failed', r => { r['/actions/runs/122/jobs?filter=all&per_page=100'].jobs[0].conclusion = 'failure'; }],
    ['wrong checks job', r => { r['/actions/runs/122/jobs?filter=all&per_page=100'].jobs[0].name = 'Untrusted checks'; }],
    ['checks wrong run', r => { r['/actions/runs/122/jobs?filter=all&per_page=100'].jobs[0].run_id = 121; }],
    ['partial job pagination', r => { r['/actions/runs/122/jobs?filter=all&per_page=100'].total_count = 2; }],
    ['artifact wrong ID', r => { r['/actions/artifacts/456'].id = 457; }],
    ['artifact wrong run', r => { r['/actions/artifacts/456'].workflow_run.id = 121; }],
    ['artifact expired', r => { r['/actions/artifacts/456'].expired = true; }],
    ['artifact missing digest', r => { delete r['/actions/artifacts/456'].digest; }],
    ['artifact not uploaded by checks interval', r => { r['/actions/artifacts/456'].created_at = '2020-01-01T00:00:00Z'; }],
  ];
  for (const [name, mutate] of failures) await t.test(name, async () => {
    const f = routineMetadataFixture(); mutate(f.records);
    const effects = { create: 0, sql: 0, promote: 0 };
    await assert.rejects(async () => { await selectRoutine(f.context, f.read, f.now); effects.create++; }, /Routine retained release refused/);
    assert.deepEqual(effects, { create: 0, sql: 0, promote: 0 });
  });
  await t.test('approved manual retained selection uses authenticated read-only transport', async () => {
    const f = routineMetadataFixture(); let calls = 0;
    const transport: typeof fetch = async (url, init) => {
      calls++; assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${credentials.github}`);
      assert.equal(init?.method ?? 'GET', 'GET');
      const path = new URL(String(url)).pathname.replace(`/repos/${repository}`, '') + new URL(String(url)).search;
      return Response.json(await f.read(path));
    };
    const selected = await selectRoutine(f.context, githubReader(credentials.github, AbortSignal.timeout(10000), transport), f.now);
    assert.equal(selected.context.controller.run, '123'); assert.equal(selected.producer.run, '122');
    assert.equal(selected.artifact.id, '456'); assert.equal(selected.checksJobId, '789'); assert.equal(calls, 5);
    await confirmRoutineSelection(selected, f.context, f.read);
    for (const patch of [{ checksJobId: '' }, { controllerTree: 'f'.repeat(40) }, { producer: { ...selected.producer, run: '121' } },
      { context: { ...f.context, configDigest: 'f'.repeat(64) } }]) assert.throws(() => validateRoutineSelection({ ...selected, ...patch }, f.context, f.now));
  });
});

test('L1 actual controller admission reauthenticates the consuming run before any release effects', async t => {
  const f = await routineIngressFixture(); t.after(f.dispose);
  const request = await approvedRoutineRequest(f.artifact, f.selection, f.approval, f.context, undefined), bytes = canonical(request) + '\n';
  await writeFile(join(f.transfer, 'request.json'), bytes, { mode: 0o600 }); f.env.BE_RELEASE_REQUEST_SHA256 = sha256(bytes);
  const valid = await authenticateRoutineDelivery({ bundle: f.bundle, transfer: f.transfer, env: f.env, read: f.read });
  assert.equal(valid.request.controller.run, '123'); assert.equal(valid.request.producer.run, '122');
  assert.equal(valid.artifact.digest, f.artifact.digest);
  f.records['/actions/runs/123'].event = 'push';
  const effects = { create: 0, sql: 0, promote: 0 };
  await assert.rejects(async () => { await authenticateRoutineDelivery({ bundle: f.bundle, transfer: f.transfer, env: f.env, read: f.read }); effects.create++; });
  assert.deepEqual(effects, { create: 0, sql: 0, promote: 0 });
  f.records['/actions/runs/123'].event = 'workflow_dispatch';
  const altered = canonical({ ...request, configDigest: 'f'.repeat(64) }) + '\n';
  await writeFile(join(f.transfer, 'request.json'), altered); f.env.BE_RELEASE_REQUEST_SHA256 = sha256(altered);
  await assert.rejects(authenticateRoutineDelivery({ bundle: f.bundle, transfer: f.transfer, env: f.env, read: f.read }), /Release contract/);
});

test('completion Bash distinguishes checks-only, eligible delivery and manual acceptance', async t => {
  let repositoryRoot = process.cwd();
  const workflowPath = '.github/workflows/be-delivery.yml';
  while (!existsSync(join(repositoryRoot, workflowPath)) && dirname(repositoryRoot) !== repositoryRoot) {
    repositoryRoot = dirname(repositoryRoot);
  }
  const workflow = readFileSync(join(repositoryRoot, workflowPath), 'utf8');
  const completion = workflow.split('\n  completion:\n')[1];
  const script = completion?.match(/        run: \|\n((?:          .*(?:\n|$))*)/)?.[1]
    ?.replace(/^          /gm, '');
  assert.ok(script, 'The completion job must expose its executable Bash');
  const directory = await mkdtemp(join(tmpdir(), 'esty-completion-gate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const baseline = {
    MANUAL_ACTIVATION: 'false', MANUAL_ROUTINE: 'false', ROUTINE_RETRIEVAL_RESULT: 'skipped',
    PRODUCTION_ELIGIBLE: 'false', CHECKS_RESULT: 'success',
    DELIVERY_RESULT: 'skipped', DELIVERY_ACCEPTED: '', RETRIEVAL_RESULT: 'skipped',
    ACTIVATION_RESULT: 'skipped', ACTIVATION_ACCEPTED: '',
  };
  type CompletionCase = { name: string; env: Partial<typeof baseline>; result: 'checks-only' | 'delivery' | 'activation' | 'failure' };
  const routine = { MANUAL_ROUTINE: 'true', PRODUCTION_ELIGIBLE: 'true', CHECKS_RESULT: 'skipped',
    ROUTINE_RETRIEVAL_RESULT: 'success', DELIVERY_RESULT: 'success', DELIVERY_ACCEPTED: 'true' };
  const cases: CompletionCase[] = [
    { name: 'owner-reported intentionally disabled delivery', env: {}, result: 'checks-only' },
    { name: 'eligible accepted retained delivery', env: routine, result: 'delivery' },
    { name: 'unknown eligibility cannot claim checks-only', env: { PRODUCTION_ELIGIBLE: '' }, result: 'failure' },
    { name: 'skipped delivery cannot claim acceptance', env: { DELIVERY_ACCEPTED: 'true' }, result: 'failure' },
    { name: 'ineligible unexpected delivery cannot claim checks-only', env: { DELIVERY_RESULT: 'success', DELIVERY_ACCEPTED: 'true' }, result: 'failure' },
  ];
  for (const result of ['failure', 'cancelled', 'skipped']) {
    cases.push({ name: `checks-only checks ${result}`, env: { CHECKS_RESULT: result }, result: 'failure' });
    cases.push({ name: `manual retrieval ${result}`, env: { ...routine, ROUTINE_RETRIEVAL_RESULT: result }, result: 'failure' });
    cases.push({ name: `manual delivery ${result}`, env: { ...routine, DELIVERY_RESULT: result }, result: 'failure' });
  }
  for (const result of ['success', 'failure', 'cancelled']) cases.push({ name: `manual routine unexpected checks ${result}`,
    env: { ...routine, CHECKS_RESULT: result }, result: 'failure' });
  for (const eligibility of ['', 'false']) cases.push({ name: `manual routine ineligible ${JSON.stringify(eligibility)}`,
    env: { ...routine, PRODUCTION_ELIGIBLE: eligibility }, result: 'failure' });
  for (const accepted of ['', 'false']) cases.push({ name: `manual delivery unaccepted ${JSON.stringify(accepted)}`,
    env: { ...routine, DELIVERY_ACCEPTED: accepted }, result: 'failure' });
  for (const result of ['failure', 'cancelled']) cases.push({ name: `ineligible delivery unexpectedly ${result}`,
    env: { DELIVERY_RESULT: result }, result: 'failure' });
  const manual = { MANUAL_ACTIVATION: 'true', CHECKS_RESULT: 'skipped', RETRIEVAL_RESULT: 'success',
    ACTIVATION_RESULT: 'success', ACTIVATION_ACCEPTED: 'true' };
  cases.push({ name: 'manual accepted independently of skipped routine jobs', env: manual, result: 'activation' });
  for (const field of ['RETRIEVAL_RESULT', 'ACTIVATION_RESULT'] as const) {
    for (const result of ['failure', 'cancelled', 'skipped']) cases.push({ name: `manual ${field} ${result}`,
      env: { ...manual, [field]: result }, result: 'failure' });
  }
  for (const accepted of ['', 'false']) cases.push({ name: `manual unaccepted ${JSON.stringify(accepted)}`,
    env: { ...manual, ACTIVATION_ACCEPTED: accepted }, result: 'failure' });
  for (const [index, entry] of cases.entries()) await t.test(entry.name, async () => {
    const summary = join(directory, `summary-${index}`);
    await writeFile(summary, '');
    const result = childProcess.spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      env: { PATH: '/usr/bin:/bin', ...baseline, ...entry.env, GITHUB_STEP_SUMMARY: summary },
      encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, entry.result === 'failure' ? 1 : 0, result.stderr);
  });
});

function harness(artifact: VerifiedArtifact, failure?: string) {
  const events: string[] = []; let creates = 0, promotions = 0, mainChecks = 0, alias = 'dpl_previous';
  const step = (name: string) => { events.push(name); if (failure === name) throw new Error('synthetic confidential failure'); };
  const provider: DeliveryProvider = {
    async currentMain() { step(`main${++mainChecks}`); }, async preflight() { step('preflight'); return alias; },
    async reserve() { step('reserve'); return 1; }, async record(_id, state, description) { step(`${state}:${description}`); },
    async inspect(id) { step('inspect'); return { id, origin: 'https://synthetic.vercel.app', ready: true }; },
    async attest() { step('attest'); }, async binding(id) { step('binding'); assert.equal(id, alias); },
    async http(_origin, candidate) { step(candidate ? 'candidate_http' : 'production_http'); },
  };
  const input = { artifact, run, schema: oldSchema, provider, signal: AbortSignal.timeout(10000),
    receipt(event: Record<string, unknown>) { step(`receipt:${event.phase}`); },
    cli: {
      async create(): Promise<CommandResult> { creates++; step('create'); return { code: 0, stdout: JSON.stringify({ deployment: { id: 'dpl_candidate' } }), aborted: false }; },
      async promote() { promotions++; step('promote'); alias = 'dpl_candidate'; return { code: 0, stdout: '', aborted: false }; },
    },
  };
  return { input, events, counts: () => ({ creates, promotions }) };
}

test('L2 ordinary delivery requires independent full configuration approval before transport', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const value of [undefined, '', 'not-a-digest', 'https://synthetic-secret-canary.invalid']) {
    const h = routineProviderFixture(f.artifact), schema = { digest: h.schema.digest, configDigest: value };
    let requests = 0;
    // JavaScript callers can omit a required typed field; exercise the runtime boundary too.
    assert.throws(() => Reflect.apply(createProvider, undefined, [f.artifact, h.run, schema, h.credentials, AbortSignal.timeout(10000),
      async () => { requests++; throw new Error('Unexpected transport'); }]));
    const stub = harness(f.artifact);
    await assert.rejects(Reflect.apply(deliver, undefined, [{ ...stub.input, schema }]));
    assert.equal(requests, 0); assert.deepEqual(stub.counts(), { creates: 0, promotions: 0 });
  }
});

test('L2 actual ordinary provider enforces runtime digest on candidate and final while preserving durable fences', async t => {
  const cases = ['', 'candidate-missing', 'candidate-wrong', 'candidate-etsy-drift', 'final-missing', 'final-wrong',
    'final-etsy-drift', 'denial-leak', 'pending-history', 'alias-drift', 'main-drift', 'archive-drift',
    'file-drift', 'create-unknown', 'create-known-nonzero', 'promote-unknown'];
  for (const fault of cases) await t.test(fault || 'exact bytes/full configuration/history and same-ID final alias', async t => {
    const f = await fixture(); t.after(f.dispose);
    const h = routineProviderFixture(f.artifact, fault, fault === 'file-drift' ? async () => {
      const path = join(f.artifact.root, '.vercel/output/functions/index.func/apps/api/src/main.js');
      await chmod(path, 0o600); await writeFile(path, 'changed'); await chmod(path, 0o444);
    } : undefined);
    const signal = AbortSignal.timeout(10000), provider = createProvider(f.artifact, h.run, h.schema, h.credentials, signal, h.transport);
    const input = { artifact: f.artifact, run: h.run, schema: h.schema, provider, cli: h.cli, signal, receipt: h.receipt };
    if (!fault) {
      assert.equal(await deliver(input), 'dpl_candidate');
      assert.deepEqual(h.counts(), { creates: 1, promotions: 1 });
      assert.equal(h.reservation()?.payload.configDigest, runtimeConfigDigest(routineRuntime));
      assert.notEqual(h.schema.configDigest, routineRuntime.APP_ACTIVATION_CONFIG_DIGEST);
      assert.equal(h.receipts.find(row => row.phase === 'accepted')?.configDigest, h.schema.configDigest);
      assert.equal(h.receipts.find(row => row.phase === 'accepted')?.id, 'dpl_candidate');
      assert.ok(h.events.indexOf('final:GET:/health/ready') < h.events.indexOf('success:accepted:dpl_candidate'));
    } else {
      await assert.rejects(deliver(input));
      assert.equal(h.receipts.some(row => row.phase === 'accepted'), false);
      assert.equal(h.events.some(row => row.startsWith('success:')), false);
      assert.deepEqual(h.counts(), { creates: 1, promotions: fault.startsWith('final-') || fault === 'promote-unknown' ? 1 : 0 });
      const unresolved = h.receipts.at(-1)!;
      assert.equal(unresolved.phase, 'unresolved'); assert.equal(unresolved.id, fault === 'create-unknown' ? null : 'dpl_candidate');
      if (fault.includes('unknown') || fault === 'create-known-nonzero') {
        const before = h.counts(); await assert.rejects(deliver(input)); assert.deepEqual(h.counts(), before, 'Durable unresolved intent forbids mutation replay');
      }
    }
    const acknowledged = h.events.indexOf('receipt:acknowledged'), inspected = h.events.indexOf('inspect');
    if (fault !== 'create-unknown') assert.ok(acknowledged >= 0 && (inspected < 0 || acknowledged < inspected));
    assert.doesNotMatch(JSON.stringify(h.receipts), /synthetic-secret-canary|synthetic-github-token|synthetic-vercel-token|synthetic-platform-bypass/);
  });
});
test('exact current-schema candidate acceptance precedes one promotion and final alias acceptance', async t => {
  const f = await fixture(); t.after(f.dispose);
  assert.equal(f.artifact.manifest.migrationDigest, activationSchema.oldDigest);
  const h = harness(f.artifact); assert.equal(await deliver(h.input), 'dpl_candidate');
  assert.deepEqual(h.counts(), { creates: 1, promotions: 1 });
  assert.ok(h.events.indexOf('receipt:acknowledged') < h.events.indexOf('inspect'));
  assert.ok(h.events.indexOf('candidate_http') < h.events.indexOf('promote'));
  assert.ok(h.events.indexOf('production_http') < h.events.indexOf('success:accepted:dpl_candidate'));
  assert.ok(h.events.indexOf('receipt:create_intent') < h.events.indexOf('create'));
});
test('current-only refuses unapproved history and accepts an explicitly approved exact manifest without migration', async t => {
  const base = await artifactFixture();
  t.after(base.dispose);
  const files = base.artifact.manifest.source.files.filter(entry => !entry.path.startsWith('apps/api/migrations/'));
  for (const migration of migrationManifest) {
    const path = `apps/api/migrations/${migration.name}.mjs`;
    const content = readFileSync(new URL(`../../migrations/${migration.name}.mjs`, import.meta.url));
    await writeFile(join(base.operator, path), content);
    files.push(file(path, content, 0o644));
  }
  const artifact = await assembleArtifact({
    raw: base.raw, operator: base.operator, destination: join(base.root, 'app-schema'), config: base.config,
    source: { ...base.artifact.manifest.source, repository: `https://github.com/${repository}`, files, digest: sha256(canonical(files)) },
    migrations: [...migrationManifest], build: base.artifact.manifest.build,
  });
  verifyArtifact(artifact.root, artifact.digest, { revision: run.revision, migrationDigest: artifact.manifest.migrationDigest,
    repository: `https://github.com/${repository}`, release: true });
  assert.notEqual(artifact.manifest.migrationDigest, activationSchema.oldDigest);
  const h = harness(artifact);
  await assert.rejects(deliver(h.input));
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  assert.deepEqual(h.events, []);
  const approved = harness(artifact); approved.input.schema = { ...oldSchema, digest: sha256(JSON.stringify(migrationManifest)) };
  assert.equal(await deliver(approved.input), 'dpl_candidate');
  assert.deepEqual(approved.counts(), { creates: 1, promotions: 1 });
  let requests = 0;
  assert.throws(() => createProvider(artifact, run, oldSchema, credentials, AbortSignal.timeout(10000),
    async () => { requests++; throw new Error('Unexpected transport.'); }));
  assert.equal(requests, 0);
  for (const value of [undefined, '', 'not-a-digest']) assert.throws(() => approvedSchema(value));
});

function migrationPacketFor(artifact: VerifiedArtifact): RoutineMigrationPacket {
  return { version: 1, revision: run.revision, tree: run.tree, target: 'local', previous: migrationManifest,
    migrations: artifact.manifest.migrations, migrationInputDigest: sha256('synthetic-input'),
    predecessor: { id: 'dpl_previous', revision: 'e'.repeat(40), artifact: sha256('prior'), configDigest: sha256('config') },
    compatibilityApproval: sha256('reviewed-compatible-predecessor'), recoveryApproval: sha256('reviewed-recovery') };
}
test('routine migration approval rejects initial activation, altered prior checksums and unbound source', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact);
  assert.deepEqual(routinePacket(packet, sha256(canonical(packet)), f.artifact, run), packet);
  for (const changed of [{ ...packet, previous: packet.previous.slice(0, 1) },
    { ...packet, previous: packet.migrations }, { ...packet, previous: [...packet.previous].reverse() },
    { ...packet, previous: packet.previous.map((item, index) => index ? item : { ...item, sha256: 'f'.repeat(64) }) },
    { ...packet, revision: 'f'.repeat(40) }, { ...packet, compatibilityApproval: '' },
    { ...packet, recoveryApproval: '' }, { ...packet, extra: true }]) {
    assert.throws(() => routinePacket(changed, sha256(canonical(changed)), f.artifact, run));
  }
  assert.throws(() => routinePacket(packet, '0'.repeat(64), f.artifact, run));
});

test('routine migration authorization is durable, confirmed and cannot be repeated after a lost acknowledgement', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineDeliveryApproval = {
    ...oldSchema, digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  for (const fail of ['compatible', 'reserve', 'record', 'confirm', 'none']) {
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-routine-authorization-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const h = harness(f.artifact), events: string[] = [];
    const step = (name: string) => { events.push(name); if (fail === name) throw new Error('Synthetic unknown acknowledgement.'); };
    const provider: RoutineProvider = { ...h.input.provider, async compatiblePredecessor() { step('compatible'); },
      async reserve() { step('reserve'); return 44; }, async record() { step('record'); },
      async confirmRoutineJournal() { step('confirm'); }, async reconcileRoutineJournal() { throw new Error('Unexpected reconciliation.'); } };
    const input = { artifact: f.artifact, run, schema, provider, directory };
    if (fail === 'none') {
      await authorizeRoutineMigration(input);
      assert.deepEqual(events, ['compatible', 'reserve', 'record', 'confirm']);
      assert.equal((readEvidence(join(directory, 'migration-authorized.json')).value as { journal: number }).journal, 44);
    } else {
      await assert.rejects(authorizeRoutineMigration(input));
      assert.equal(existsSync(join(directory, 'migration-authorized.json')), false);
    }
    const calls = [...events]; await assert.rejects(authorizeRoutineMigration(input)); assert.deepEqual(events, calls);
    await assert.rejects(continueRoutineMigration(input)); assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  }
});

test('routine committed continuation rejects unknown, incomplete or changed migration outcomes before provider work', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineDeliveryApproval = {
    ...oldSchema, digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  const report: MigrationReport = { run_id: randomUUID(), source_revision: run.revision, target: 'local',
    manifest_digest: schema.digest, started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:01.000Z',
    duration_ms: 1000, result: 'success', stage: 'verification', failed_version: null, database_outcome: 'committed',
    before: packet.previous.map(item => item.name), after: packet.migrations.map(item => item.name),
    attempted: packet.migrations.slice(packet.previous.length).map(item => ({ ...item, outcome: 'applied_committed' })), reporting: 'written' };
  assert.equal(confirmedMigration(report, packet), true);
  for (const change of [{ database_outcome: 'unknown' }, { database_outcome: 'rolled_back' }, { reporting: 'failed' },
    { before: [] }, { after: [] }, { attempted: [] }, { source_revision: 'f'.repeat(40) }]) {
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-routine-outcome-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const auth = { version: 1, packetDigest: schema.migration!.digest, artifact: f.artifact.digest,
      run, journal: 44, predecessor: 'dpl_previous', requestDigest: schema.requestDigest, configDigest: schema.configDigest, authorizedAt: Date.now() };
    const broken = { ...report, ...change } as MigrationReport;
    writeReleaseEvidence(join(directory, 'migration-authorized.json'), auth);
    writeReleaseEvidence(join(directory, 'migration-outcome.json'), { authorization: sha256(canonical(auth)), report: broken });
    writeReleaseEvidence(join(directory, 'migration-confirmed.json'), { authorization: sha256(canonical(auth)), reportDigest: sha256(canonical(broken)) });
    let calls = 0;
    const provider: RoutineProvider = { ...harness(f.artifact).input.provider,
      async compatiblePredecessor() { calls++; }, async confirmRoutineJournal() { calls++; },
      async reconcileRoutineJournal() { throw new Error('Unexpected reconciliation.'); } };
    await assert.rejects(continueRoutineMigration({ artifact: f.artifact, run, schema, directory, provider }));
    assert.equal(calls, 0);
  }
});

test('routine remote confirmation binds run, packet and artifact rather than trusting a success-shaped status', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineDeliveryApproval = {
    ...oldSchema, digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  const description = `migration_intent:${schema.migration!.digest}`;
  const valid = { id: 44, sha: run.revision, task: 'deploy:esty-be-ci', environment: 'be-production',
    payload: { version: 1, ...run, migrationPacket: schema.migration!.digest, artifact: f.artifact.digest,
      sourceDigest: f.artifact.manifest.source.digest, migrationDigest: schema.digest, configDigest: schema.configDigest,
      requestDigest: schema.requestDigest, project: artifactTarget.project } };
  for (const change of [{}, { artifact: 'f'.repeat(64) }, { migrationPacket: 'f'.repeat(64) }, { run: '124' },
    { tree: 'f'.repeat(40) }, { migrationDigest: activationSchema.oldDigest }, { configDigest: 'f'.repeat(64) }, { configDigest: undefined },
    { requestDigest: 'f'.repeat(64) }, { requestDigest: undefined }]) {
    const provider = createProvider(f.artifact, run, schema, credentials, AbortSignal.timeout(10000),
      async raw => Response.json(String(raw).includes('/statuses') ? [{ state: 'in_progress', description }]
        : { ...valid, payload: { ...valid.payload, ...change } }));
    if (Object.keys(change).length) await assert.rejects(provider.confirmRoutineJournal(44, description));
    else await provider.confirmRoutineJournal(44, description);
  }
  const unconfirmed = createProvider(f.artifact, run, schema, credentials, AbortSignal.timeout(10000),
    async raw => Response.json(String(raw).includes('/statuses') ? [{ state: 'success', description }] : valid));
  await assert.rejects(unconfirmed.confirmRoutineJournal(44, description));
});

test('routine migration refuses an incompatible predecessor before SQL authorization', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineDeliveryApproval = {
    ...oldSchema, digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  for (const mismatch of ['source', 'artifact', 'region', 'configuration']) {
    let http = 0;
    const provider = createProvider(f.artifact, run, schema, credentials, AbortSignal.timeout(10000), async raw => {
      const url = String(raw);
      if (url.includes('/domains/')) return Response.json({ name: 'api.lovora.us', projectId: artifactTarget.project, verified: true });
      if (url.includes('/aliases/')) return Response.json({ alias: 'api.lovora.us', projectId: artifactTarget.project, deploymentId: 'dpl_previous' });
      if (url.includes('/deployments/')) return Response.json({ id: 'dpl_previous', projectId: artifactTarget.project,
        ownerId: artifactTarget.owner, target: 'production', readyState: 'READY', regions: [mismatch === 'region' ? 'iad1' : 'icn1'],
        meta: { sourceCommit: mismatch === 'source' ? 'f'.repeat(40) : packet.predecessor.revision,
          artifactSha256: mismatch === 'artifact' ? 'f'.repeat(64) : packet.predecessor.artifact } });
      http++; return Response.json({ status: 'ok' }, { headers: { 'x-activation-config-digest': 'f'.repeat(64) } });
    });
    await assert.rejects(provider.compatiblePredecessor());
    assert.equal(http, mismatch === 'configuration' ? 1 : 0);
  }
});

test('L2 compatible predecessor keeps its separately approved old config when candidate configuration changes', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), configDigest = runtimeConfigDigest(routineRuntime);
  packet.predecessor.configDigest = runtimeConfigDigest({ ...routineRuntime, ETSY_CLIENT_ID: 'old-client' });
  const schema = { ...oldSchema, digest: f.artifact.manifest.migrationDigest, configDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  assert.notEqual(configDigest, packet.predecessor.configDigest);
  for (const actual of [packet.predecessor.configDigest, configDigest]) {
    let healthyReads = 0;
    const provider = createProvider(f.artifact, run, schema, credentials, AbortSignal.timeout(10000), async (raw, init) => {
      const url = new URL(String(raw)), headers = new Headers(init?.headers);
      if (url.pathname.includes('/domains/')) return Response.json({ name: 'api.lovora.us', projectId: artifactTarget.project, verified: true });
      if (url.pathname.includes('/aliases/')) return Response.json({ alias: 'api.lovora.us', projectId: artifactTarget.project, deploymentId: packet.predecessor.id });
      if (url.pathname.includes('/deployments/')) return Response.json({ id: packet.predecessor.id, projectId: artifactTarget.project,
        ownerId: artifactTarget.owner, target: 'production', readyState: 'READY', regions: ['icn1'],
        meta: { sourceCommit: packet.predecessor.revision, artifactSha256: packet.predecessor.artifact } });
      if (init?.method === 'OPTIONS') return headers.get('origin') === 'https://app.lovora.us'
        ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://app.lovora.us' } })
        : Response.json({ status: 'unauthorized' }, { status: 401 });
      if (headers.get('authorization') !== `Bearer ${credentials.bearer}`) return Response.json({ status: 'unauthorized' }, { status: 401 });
      if (url.pathname === '/__release_unknown_route') return new Response(null, { status: 404 });
      healthyReads++;
      return Response.json(url.pathname === '/health/live' ? { status: 'ok' } : { status: 'ready', database: 'up', migrations: 'current' },
        { headers: { 'x-activation-config-digest': actual } });
    });
    if (actual === packet.predecessor.configDigest) { await provider.compatiblePredecessor(); assert.equal(healthyReads, 2); }
    else { await assert.rejects(provider.compatiblePredecessor()); assert.equal(healthyReads, 1); }
  }
});

test('stale source, previous intent, persistence and candidate failures prevent creation or promotion', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const failure of ['main1', 'preflight', 'reserve', 'receipt:reserved', 'in_progress:create_intent_unknown_until_acknowledged',
    'main2', 'receipt:create_intent', 'in_progress:ack:dpl_candidate', 'attest', 'candidate_http', 'main3', 'receipt:promotion_intent']) {
    await t.test(failure, async () => {
      const h = harness(f.artifact, failure); await assert.rejects(deliver(h.input));
      assert.equal(h.counts().promotions, 0);
      if (['main1', 'preflight', 'reserve', 'receipt:reserved', 'in_progress:create_intent_unknown_until_acknowledged', 'main2', 'receipt:create_intent'].includes(failure)) {
        assert.equal(h.counts().creates, 0);
      }
      assert.equal(h.events.some(event => event.startsWith('success:')), false);
    });
  }
  const stale = harness(f.artifact); stale.input.run = { ...run, tree: 'd'.repeat(40) };
  await assert.rejects(deliver(stale.input)); assert.deepEqual(stale.counts(), { creates: 0, promotions: 0 });
});
test('nonzero, interrupted and lost create responses retain known or unknown identity without promotion', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const result of [{ code: 1, stdout: '{"deployment":{"id":"dpl_known"}}', aborted: false },
    { code: null, stdout: '{"deployment":{"id":"dpl_known"}}', aborted: true }, { code: 0, stdout: '', aborted: false }]) {
    const h = harness(f.artifact);
    h.input.cli.create = async () => result;
    await assert.rejects(deliver(h.input), /retained intent/);
    assert.equal(h.counts().promotions, 0); assert.equal(h.events.includes('inspect'), false);
    assert.equal(h.events.includes('receipt:acknowledged'), result.stdout !== '');
  }
  assert.equal(acknowledgedId('{"url":"https://guess.vercel.app"}'), undefined);
  assert.equal(acknowledgedId('{"deployment":{"id":"../../bad"}}'), undefined);
});
test('failed promotion or final domain acceptance never clears the durable fence', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const failure of ['promote', 'production_http', 'receipt:accepted']) {
    const h = harness(f.artifact, failure); await assert.rejects(deliver(h.input));
    assert.equal(h.counts().promotions, 1); assert.equal(h.events.some(event => event.startsWith('success:')), false);
    assert.ok(h.events.includes('error:unresolved:dpl_candidate'));
  }
});


test('L1 retained extraction rejects unsafe archive members before creating a destination', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'esty-routine-tar-'))); t.after(() => removeArtifactTree(root));
  const base = [{ path: 'artifact/', content: Buffer.alloc(0), mode: 0o555, type: '5' },
    { path: 'runner/', content: Buffer.alloc(0), mode: 0o555, type: '5' },
    { path: 'receipt.json', content: Buffer.from('{}'), mode: 0o600, type: '0' }];
  const good = { path: 'artifact/file.js', content: Buffer.from('export {};'), mode: 0o444, type: '0' };
  const pax = (key: string, value: string) => {
    const body = `${key}=${value}\n`; let length = Buffer.byteLength(body) + 2;
    while (Buffer.byteLength(`${length} ${body}`) !== length) length = Buffer.byteLength(`${length} ${body}`);
    return Buffer.from(`${length} ${body}`);
  };
  const longPath = `artifact/${'segment-'.repeat(15)}module.js`;
  const extended = tar([...base, { ...good, type: 'x',
    content: Buffer.concat([pax('path', longPath), pax('LIBARCHIVE.creationtime', '1700000000.123')]) }, good]);
  const extendedRoot = join(root, 'extended');
  await extractRoutineBundle(extended, sha256(extended), extendedRoot);
  assert.equal(await readFile(join(extendedRoot, longPath), 'utf8'), 'export {};');
  const longName = { ...good, path: '././@LongLink', type: 'L', content: Buffer.from(longPath + '\0') };
  const gnu = tar([...base, longName, good]), gnuRoot = join(root, 'gnu');
  await extractRoutineBundle(gnu, sha256(gnu), gnuRoot);
  assert.equal(await readFile(join(gnuRoot, longPath), 'utf8'), 'export {};');
  const valid = tar([...base, good]), validRoot = join(root, 'valid');
  await extractRoutineBundle(valid, sha256(valid), validRoot);
  assert.equal(await readFile(join(validRoot, good.path), 'utf8'), 'export {};');
  const cases = [
    [{ ...good, path: '../escape' }], [{ ...good, path: '/absolute' }], [{ ...good, path: 'artifact/../escape' }],
    [{ ...good, path: 'artifact\\escape' }], [{ ...good, path: 'artifact/.env' }],
    [{ ...good, path: 'artifact/absent/child.js' }], [{ ...good, type: '1' }], [{ ...good, type: '2' }],
    [{ ...good, type: '3' }], [{ ...good, mode: 0o666 }], [good, good],
    [good, { ...good, path: 'artifact/FILE.js' }],
    [{ ...good, type: 'x', content: pax('path', '../escape.js') }, good],
    [{ ...longName, content: Buffer.from('../escape.js\0') }, good],
    [{ ...longName, content: Buffer.from('runner/../escape.js\0') }, good],
    [{ ...longName, content: Buffer.from(longPath) }, good],
    [{ ...longName, content: Buffer.from('artifact/a\0hidden\0') }, good],
    [longName], [longName, longName, good],
  ];
  for (const [index, entries] of cases.entries()) {
    const destination = join(root, `refused-${index}`), archive = tar([...base, ...entries]);
    await assert.rejects(extractRoutineBundle(archive, sha256(archive), destination));
    assert.equal(existsSync(destination), false, 'No partial extraction may precede whole-archive path/type validation');
  }
});
function file(path: string, content: Buffer, mode = 0o444): FileRecord {
  return { path, mode, size: content.length, sha256: sha256(content), sha1: createHash('sha1').update(content).digest('hex') };
}
test('archive bytes, identities and modes must match; links, traversal, duplicates and malformed headers fail', () => {
  const content = Buffer.from('actual content'), path = '.vercel/output/config.json', expected = [file(path, content)];
  const good = { path, content, mode: 0o444 };
  const verify = (bytes: Buffer) => verifyUploadedArchive(bytes, expected, createHash('sha1').update(bytes).digest('hex'));
  verify(tar([good]));
  for (const entries of [[{ ...good, content: Buffer.from('changed') }], [{ ...good, mode: 0o644 }],
    [{ ...good, path: '../secret' }], [{ ...good, type: '2' }], [good, good], [], [{ ...good, path: '.vercel/output/extra' }]]) {
    assert.throws(() => verify(tar(entries)));
  }
  const bytes = tar([good]); assert.throws(() => verifyUploadedArchive(bytes, expected, '0'.repeat(40)));
  assert.throws(() => verify(Buffer.from('not gzip')));
});

// Exact historical workflow bytes from the86ac609 public snapshot; never bind old proofs to the current workflow.
const authorizationWorkflow = gunzipSync(Buffer.from(
  'H4sIAAAAAAAC/+09a1fbxrbf+RVTNyekWZF5h0AWvTWgJj4B7GOb9OY2WT6yNLbVyJKrB4Sm/e9373lIM3oYG4jTUE7XOsHSPPdr9nPkWxO6Tw5N4lDPvaDh1cpK4O+vEDJNPK8f0t8TGsX8dzTGfwkZhJZvj2m0T36dWK7/AR5eBuHHoRdc9h03mlqxLVq6/jSJI/43IZPAofJvAvNFduhOYxemI13qUTsmFoFx7Y/UIWGQxK5PySDxHY8+I0FI4jElbhR4Vgzvx24UB6FrWx6x7Ni9sHAcAlOP0wlw7W5InX0ShwlV5h1aiRfvEzsJQ+rHRgRzTiwj8L2rtFF8NQWo2OPAtbOeAVtslG2BEGPmKPgeQBpBL+oYE3cUsmVq72kcXRlRDFuJDTuJA2ivvc92Jx5nD/pWGLtD+N13nQq4mp/gNUAiBjwB1GQH0jwmQwAp/TT1XNuNVRhqO8hgOLS8iObgg8v2RyuyqUetiPbDxK9eTzexbRpFw8Qj09CFFQDhMZRHBPqxNUnMp/R4i7VcD6DmZJLE1sADSqNGDKSuQmkYBhMgOyuGxQZOYtMQV7nYglamNJy4USQpxw78GOgFmCeklrOy8lsw4M8ZFPgqfcmTcgbxlvPUcJ88+vyZjNx4nAzq9AJG62MP8t0BWS0w4ir56y/WD1YeGbjlBHgqTozN7fr6NnsTuxMKQAcC9ZMY2Xp7hz2HZyr7WqE9Boz0xxYIArYEgNY0qgOS3OFVXbSuq83k3CSF6fW9lXZZ9yhIQpv245DSGZ2VVsrMU0DeheVdO7ParmThQEJK52TqBZZTWLbhOrJrRMMLkB4p+KZBFI9CqogPd2KNYDvpi43d+sbGT9HY2tx5vr8+eLFhU/vF5ubmi43n69ZgaO3ubFnUspz15+t7g931PTrYfE7pYG9nfbhJt9e3LWdzC55s2PbW7no6C/UvVInVbnV7rzpmt3/eNTtAuQEIWC5NvACkaVnLdqPb/aXVOd4nrEl/6H6Kk5D2c7IubX98OGPcaRDGORG6sblbX4f/NvZ3dra3Nvfx/wpCl/xoqJ2MMbW8eGzYE4fUpqO+GyE7XRHjvDA1MZzCs1rZWC5wZggUQHai7KFgDu0ZyNPQpREsnGMaKUJuyRDce4QciywEQhZlCeNTQcfkEngXX03xcGAyxwYuhwYuCJJ0aUmEzIiiGQCwxkQAdPoJsLy9vWFtv6A7G88Hz+2tbaCK7aG1vbGzs2FtrdOtdWv4Yn2LfE8unqeD4ZQq2EOqyxEgu4zoGaL42gxlZbqgkzvtUtiI6+P5cgYnfLo5GBFFl0On1IcR7CtiW7CJiu1FNE6mhg8D/LS5vbe3u767uWcP1ulwa+fF3vPtbboJ/zzf3qE7jr0zsPbsrRezN4hDGeL03Scg7TY36xvq/iz7I/CfMbF8+Cc02OLKd2jCMQkHqDgF2Ck5AmLyR+ley9CXY7xj86T51uy865tnjcMT85hD/8IKo/qh2c+/1XGRvj1tHZu8I1et6qhTkT//LI6DLfHFaomCsqqP3j16bZ42+o12u9N6W7kw0ar7ugHiiZ012jBwvOyTP1X4wvEXD8nq99+r2iUCjr73TR/PXJCo//1X9N/3/ilqhuLvBpPDQDh8wXhgDt1REmat3/tHXGWIuDYBWiFgO0ZK84KrCfKZBS+mMaiptE7aGdbEeRrhYa8gk8OSWL4jh0QFhfGtkSkDrm95hhOgyivO4/p7f5W8V/ZMSO1RHpM19RliBR/kQF4jP/4IT181e6/PD/vdntnud89PTxudd7UcKTb9KLY8jySggVv+CNRKkGcfSaPdzBgNRRPsKgYdmaAaEERMwQEM+YpyieeZy0fTkYiMg6dmtGZN3TWuKwnxExmOa418OLBcO6oDyKbJABRIww4mE4Re7VHn/OzM7PR75ml7DYDMuVrptCamrMm5iT+dENsF4YqqC+gsNj34CfSwK8NyQCHBNcA717e9BPg5bWOEQRAfMGbF1zB8CLPxtcIDPzCsxAHFlv05BOGfg+NbdviTEQWQMIMC9bIQ8KzBxwZQQJNlwkdMWZNzM/igbix+77OJZoErfxAFk6kL6OfHEBIKP4RyG2WNlrtRNmVNzp1udJC4nrPABg9Zex8E8gXNdHdchWB3AvhnjA5H+9RLIjxzEvj7da/XNuKAqf3G8aGqZEu4cB1xFljYajPguPXfooyTQWt60203jhjP5yAC1OZHQxqWvCqCOC8GOsyiAy4Hkzi1YPAsALFGmeYJh5MwZ7gJrW2La68VJzF/mQq+nwa79s7z59bu7iYFdWMwHOy8oM66Y2/urO9sbVrbu3vO7u6LveE1xzFbd2pkGYrqwS1GOEzyD604ppNpnNNLwMbXTxrCDiwu3urYAzqoEMa/hUVYj62wPvrjZp0NaSIAjjUr3h0yKQNEHBlM09wnNAyDUFO30OoD+BqOdQXA3thWXiIHANpQUzE8UBS9fbKuvEafwGXoxhXaSTcBngvdP6i0pLmwRAqAU9FAllKPhowQQAG0vEtYzpMfVrKlwCr9hIKeYLA95LwnOaWmedbtNU5OVMtIyHU0jWBfVEfeEZx/r8wztb2Qa1XtT9vNE1Nvz8RFeXs4ZJs/vyu38oqtz9snrcZxuVmXb81YX7NBFhGPEcPRVZHVJWmpvJ4XRKBVCKAePPosIW4k/kc/uPT/AvkhQAhvJXz1twxg7C2HZvZWnYNLUCMTlswgEj4rQ6jLMIqAsTqF4OnUCuZghLYCwoUJc3JsgEyDKh+eEkSBBTObQGoM4XgXB4XuQkNpxnr1lV79nHy7EaUvVSgWjsdlyMfimfx07akBhDaieQm3yBBDC6jNuf04uBQHOLHuBaPbDAHInXOIEmaEIZjlHrGdeDcexHMnrhjkxmMgYMEOmuP0ubRCf97D55rTJcehXM9LHZNCVSmyrDWMaUjEinVVk/X4ttm1KOSXwa/FWRdl15IRbsKtFQtZgFmrRijy6pembvRHKuQrVGNJuVHq4Qnp1LNsVKoEyRdou4xqc+pS1+ydt/tFtaPqBKtQil6bR2+6JcNUslalQqOSHQu+0CjxYtAg0UehLBaNFG3a2kviBBqi3SH59VdoxoeooYdI+mc+fHiJ0TudtDIP0b8i9KOs7u8jYgHC+/voMCqgJPGtC4A5mjov0XswxYhhELojdMwwdCB2EBLC+BNBL059BMgqqpOzQAaH0sAAuo/cydRzqVNfnb3E0nVxDsIIpQNcj44omPElm49MrCuQF+rS66vVvh7012lCjaHFVX46YPGtwG8RJOtzTzRsQg0cyWCqL7Yo40eFsGoaT3qcOcMM6gFE0ZxMlV1VigG/RG4cgCp7cEBWP46TwB+Nk6uxS5O1zEpfJY8fi85pxyHrAf9Ga2NqOdEaOtKwYZmExKYbxVGUYNdBebALhqt0qWIXBK8y7hPVjYrvS72lgJZ8u5Kwbmm7kvDu6g83CMlt8JAcyBM3DHz0ce7rTswV4bNXY43y3FTijVkMmQVV0meFWF9p1AtYx7qaFfTCsBcSHwZaorGlyzh8kcXq1HZZd5FwkO8MuwATiqa9lWayL4pa8lgQuEE/oXhgeJGGVAlJzOuD11++bXZaZ6fmWa8MBXrjcn+9Om7HPDEbXbN/1DrrdVonJ2Abdl839IWVtykdhnuUGyfCT18+Tq5R6UC9RueV2Svvz9+VgwfW+HPzVen05W3Kh9GiDXNFJNRhTpuvOo1es3XWbzeO3pi9/r+7rTN9lNImswcpW0xFozQIPDs0iCktwhnJFOtoLD3RgefBmXXv4oTcCQ1yDwVcuj04psCosEQshnk6dCv/2wkVNhJUdGLcDTosmNQK85GlNJtEODbSUzzn1kAJWaVKCv2h13oj3WkCQXHwEeyvvKJX7qyS0lLqSvXJb5GYd4bDOrfl4+DSZ4oQHpaMpPkIaC0qaTMMCPLI0DbqiAEq0C1fZ9bc1u7e1vpgw960Bpa1vTcY0J2957bzYhOI3H6xZyElrG9sbSDWdyuxrhxf0YyDSjkKdcKHPRn68ZjrmdqBGjtJBWqfVGlPSnOOU4PhdDaWpSE525utNAe6RJIGXd2delSzpnVB5frSfRxnOjNHJsv0kVQcWUOMMrEoGnIyNgFq94jtBRFYSjyYIvg8F31ifFJF6srJ04V/j5i4VYXxIgrG4vwgVrdYBIf3qZWFggomKOhUWTw309kHV6D5MShK54vQeuBfm+J6NSAy3ezruEMysMES7lVk59oxUipbuKdA5l3Ekr5AKCm1ntMNMkrMJEE+WHoHwSTO3OUsXfSCHLd+Ocs7QORRURVMOgNL26ywK4rtQeg03pWaP18zOFRUFgipWYraYXCoHTz6LACqRmokhOBtCsDycJCQ7nDE4cBwNgmCZXEkDkh1YAYbeMeBdl3AJ3Uji71UOZAz6itzJcs032/al5zC4C7dyY+LpGPgm2gu8foQBymKxmM3Qj2GltKsdAVCg2ghh/Bxs/HqrNXtNY9K3LnV5F0pgx4r+BZ06wfwg2p4l67awuzXe21v47NNfbXCy4wHCuauiNQ8rtPAHyzDDiUadIhZUDrnl80t4ng+l2ydnKJvzB9x16wTsBdM2YK/CB0O8axZzD07dNEbm7mAcvn7So6hVs7gU4o2R8GLmzpkn5Y4ZBd1GW6tz+MyzDv+WOIk1b1+YplyCyn1oYNTUAvzvFY355aUGFtxxAr6BYHMHa/2lVzICIaZgu6TWkVGma/NxhRPTFTAV5hEr/kebu4OJUoyKTxnciHzMj6t9DLO4e+J0Hv9T/L2pKm/99jtk/eBuKyeaTUSNi+gMkvT0w21v5UDhMmlekEsXe8LuXvfQ4fyzK3MHmZwY4cGp6uMc9aCKWbxBqlDjX6idsIS9HmgiyXP3qnL4TpIVXoftLE75n/OzW5voZFLQh+38Gpwm/1L+TYOgyCOYKip6kQCBkm5QtgBRydNiTpENpgcqPqDjMn5OOIgUCRhtuWqNa5xalyrzNY12IigSZYl6OKrquezk3MxA5cyaY8J0Xj6JyHjffrJ9pJIWtNCx/mDN02LMdOIIsvo1QCQ9tC0TCDeYu3HrChlZYeycOUsHmmd95pnZr/BGKRsed8iKy3iXGcpp0fmidpWUG5dfVNYd7tjvm2avwDojsxut//GfKd3Lm1SOnPjvNc65TGow3dYqwdwPurI2F1uMVWNi5aElBoypb/o3rg516Wq4W+R5nOYIWquCUaUdmecuoZr7QMnJWAYrsGsoDCuOaDDrF3Y5YwvTZGS2huWc8KOH5BinE+Ad0MKqiAcRleiLP0KE2iQpbv/OWEpBKw+Pld7I5rOx8i35Mv8XN8mV2rh1uZZ+7zXLfBMvkGBrp/m6Dqvq4MJEFMypp4j8LsNOh3Yz7q8BsRyVY+7qbhCgucb6hxoRcAMkX524ZDLQbY60YP8/Ubl7zV02gDb6SqLuKZKsk8vSZQMh+6neWQQ1wr+pspEfnEPQqtSaGGJbDhJtUwmnYSP5nIMDJMG5JkUY26YzBchrXTp79Bd7DlnzgL4E10eRNE9F0XtUNg70xDvkKHSlcusl0jk4tpB6AgrB6lNqm+MXF0fIwuaLsSCO2yUvohDzXarF5KZmdG5imb/waP/eck83qDo4e8aMXxK1onwbktnco1dt8IXLhMbuBsZROInNz74V/Qyi4pyZzFsLqTcvYx+CIcMLPtj/b1fS6f68fHmSzJ0V4n5v81ezgOP91JU656kzPvO1G6shgaaNfCamQOu1xKD5urQCW7ej2LyOYXuM9vyAx+vTHrG7xj568C6tMDedCeYBP8EThD05NatcHTx68aHH14yH0HgUczIf8K7PEnHeJKOq3fc/PAD/O/lamE9N7QWpMvpGlW9MN2PxcZShqW96ukeDL69mjZIbIXEsP8YzjMSzz4A2jrSW9eIskptdD4jQGCR4efalYzcFvc0dMvDsZHluzHotU4Whklv8WBCwxhQK2Tp9clAoJtFUUo5dp4Q7FJDrAUQLSNHpQqJN+qaJ9QbDaLTxezIKb9RYUbsdOtGaSVKQIwlNVnsHp008CEOEH4o32luyZfPFum1WiddtTV3LZa2haP3davT/D9t9NS6LO/zutnttTpaPoow6yvamyfabtEsLG/J1U9tLUL3rsi8EZr+XDHCXEbNkdls97p6lFs752d2LA2Sq0LnayfnFAKU7OSbnXSD1d0sdFmRWSOu1mDkBE04nVXk7EgSgnYZjamDCZKB95KetLdAI/gKSad8huh3LEKXFKP2RVvCcJ1U7uBmJaGUjyVQZwjMs+QhQR96ZhFvlhaV54hhzlwjNRavJBvBT8qik4Jy7l+CkZJKsOSC1W8zj6gyczMf91m0+rY4wE2Kb8uXsUDtbcUAyy69TROqShnzb5NR9bQqowoTf8AaTixvZhUm2rwgnGhoKIFseR1rdutqriAzPa6+obrLfOljtrvVh2rHMseVQrm3LDAsXBJ8yN1wb7l7p7Tasfheq35TXmN4/+eT1i/FwsSKRlUDVRbjlbe5ZpiycryqVovX44X0wqWXwKSS2O/t3Z2ZV+4eJ2i9tTzXQdsyu/JaLWUSNW9Uvy57An9AJ+ur1+ll/H27Ur0O3wAtKdVTr0soL9V7qMr7e1TliasrmWIhM6pzpXi5KryB63PnOyvHi6jlFa8FLK3FEfGZG1fZ/Xmt0V1F2Tz5b57sNG2lqn05+ei4YXVOyUrO0fupzNFbXWhWdPVWDH6jfYu0xRskxOQq0iohpJcfpvIgq0Ms0BZSkp7Gx1x4mQ70tylHFAA1NCB/U6WJlWWFSy4PzGycDJaqkdPgT+lMM0eRNKLwIW83Pdg9d1yyoXwkZHbVxjdZgPFgNC3VaMoPNSt3I8/ZsxWFB3PsH2qOXV8vw45Cdjkf1wGzLy0EUcQuNb4ez8sunKkk/uXWzUhTN7PvpCEwh70QhJhAOmVJrayIJvCXr9PPljcPSn6Jkj8fyG5RmCOyx1jKE7tkXskUXEolTjHtbIprUUtnPKVcTOxA+zqc/REE7KxvtrDLEBW0MaWuMsE1r+mV2NEKTmRe5JQvvLxR+3WjC7pJzajpOYJ3oRDIyg5lf9XFHQVi5sJNsamQlLXqi8Jea/pDtrdb1nvkKX/WaFly2M0qQ2aUdclvG4mEWyWElVZ4aTT1NEdTC5CLyK5cgFy+hZRVHlsrUmK5r4vrQ62T47TAhmWVBgz0lF1GDVaikknE7IXorlAAcww9dzSOF0CC8r7TOjGrUr/Lm90AUo20NmUQus6Ipt9N4rKPU+rVXUGkrNCvCBG+EoOv5H4S6JH8OpUoB0ov7+JIaOc/MnVnUiHxvwzoQfNtW+wKXLahIYifMWE3cowSK3Regqp7gTe7B+El/ERFPWASUebu8SqTehGD/NLPc1HoUI3Pkna55Llss4ed5vGreXhLa3hTNIeTct4SCpLlX6FOka+nuQWSbT7rP53HMtGmf+9IIgN6MIPnawi3eyrVeBUkekcjfk8PiLVJIGxKAff0ZnzhphBf0QNJcdQxGz1zuaLuHh8v4UQFu5A2WOMlL09avry574JGqJbBhYuqfPZh6SXJFpw+up8wbkugoqdJXPEydD/xi09T96YOgC8sQG4D7WWr+VIgMAItpCx/efa/x5TZ0G5jCULH9THxP77k8VblWpYBxv6WKxHSye8n7E3ma85BHu19sC7E1wYy8IsPuuC1DMsSEbcFvzLitdXgM9re3IMigMjYV1SvuqJkF2h7JOp0HTp0feUmujt2owRRPIcfpQzWX0vMZkTHlOB0A1ILG0g/+jJl8D2XBY3crVhuhDe5pfcQ3z3M57T3CtPeK6hnESGe5yU+r1W4YETig0h8LM3MuyX8VW9Qq9Xr9jqN9jyeo1zb2ziPUhCnl3MIOTvwXHZLwlS7GXIJxtz9pulMkoiruoCKc747Lfy5XIECi/lHusYVXHw19/hdwf5LOLUb7XnkUtbqFhKpki2EeuPG0Vdwad93xtD92SoOvo4nG6a+txKIfbknveoqix3IjCxe6iL83DzVUCBEuLWXKJHutwtbgPXQVL7OKjT8mIaYlPazKXKZMaeYjDQ+cNR83eJtZMuRSvfVI3v393fNdUfXwyVYD5dg3a9LsB5uuvrH3XS1wouqPFry+ZfshVr89Cu/aOhZ8fMvz5REwmeFIqlnxVKsD2nhFEJGkt4NPi+9WSjXIZ9nlGh0KMvMFzcmMfNOfjWIfUT+98TFhBj5vZfrLg89bZydN04U60Y7UW9bhJW77IrPJS4rvd1E382aSF6H2jF7naaJX1vumN3zk97s+0jFp5G0kdqd1vE5z+Y2T5qvmocn5owvBInby16bR2+6JVNynJXOkyY4F3tlk83uiYpIuyerpgp9C18Cyl3yVQ2pQmlF2TJU93/VCEr+8jVDlO2lOMisLUVj6nkgl61oPPdNpcp1pJn4IDJPGz1V6oWkHJvwZ3Y3Af7IQI6/5NIO8HtZ2d2ktUcakTDFooJm8V2OOrRHElQ18ieJKWhi1jWf0Cq9EBVvaC2IghryInYp/x6Z7FdcsfIlM5hUS0Sfo0m2o+9mTV/4FhmaN1nFAV4Nm5VnZlcsZCJdacy+l8uqcw41Q2iSoG2Khfu4VurgJ8oeb+aWgRShVfoqeo6sHYoia0QPVk3U4FMNhOgrlqutk5/dMIqVdP+cecY/0wbEBcrR1MLLApnFpn2pDeSSjlZBX3PitETuZehgCMsRMOLzozudAojZ62pyzmO+QNyVDW5BGELay1vlctSRXkzCpbnrufHVs4xmOKcrRJJ+VutLkwrJ6ukVmslNjxTToZb8tnl8c1IpwekCHyTUxaa8wFloJCkU5VcBq8FUAFK2wFKyBIJm+iCqCLMI7yAjUdayQHh6A+OPctorBUWKNgRCXjWj7OCYqg53oeYCveAHS6QS8ZJBhldfU+dlhmiVXHO4i+g1OCkdZJ/IOdV1zUHhgyAeL4I7jbz1xdUeCahde3St/D+pM1NVKqUAAA==', 'base64'));
assert.equal(sha256(authorizationWorkflow), 'c9cd73e744ff32998b9874d0782480bc2c2eff1c92d1ec00f1be5d189ef89a53');

interface AuthorizationFixtureInput {
  artifact: VerifiedArtifact; archive: Buffer;
  approval: { producer: RunIdentity; archiveDigest: string; operatorDigest: string };
}
function authorizationFailureFixture(f: AuthorizationFixtureInput, readOnlyHistory: boolean | 'later' = false) {
  const controllerRun = readOnlyHistory === 'later' ? 124 : readOnlyHistory ? 123 : 121;
  const journal = readOnlyHistory === 'later' ? 897 : readOnlyHistory ? 898 : 899;
  const receiptId = readOnlyHistory === 'later' ? 459 : readOnlyHistory ? 458 : 457;
  const runId = '00000000-0000-4000-8000-000000000001';
  const h = historicalProviderFixture(f.artifact), now = Date.now();
  const time = (seconds: number) => new Date(now + seconds * 1000).toISOString();
  const request = { ...h.prior, controller: { ...f.approval.producer, run: String(controllerRun) }, producer: f.approval.producer,
    artifactId: '456', artifactDigest: f.artifact.digest, sourceDigest: f.artifact.manifest.source.digest,
    archiveDigest: f.approval.archiveDigest, operatorDigest: f.approval.operatorDigest,
    migration: { ...h.prior.migration!, packetDigest: (readOnlyHistory === 'later' ? 'd' : readOnlyHistory ? 'b' : 'a').repeat(64) } };
  const requestDigest = sha256(canonical(request)), packetDigest = request.migration.packetDigest;
  const entry = { id: journal, sha: request.controller.revision, task: 'deploy:esty-be-ci', environment: 'be-production',
    production_environment: true, payload: { version: 1, ...request.controller, artifact: request.artifactDigest,
      sourceDigest: request.sourceDigest, migrationDigest: request.schema.targetDigest, project: artifactTarget.project,
      configDigest: request.configDigest, requestDigest, migrationPacket: packetDigest,
      releaseRequest: request, historicalHandoff: h.marker } };
  const status = (id: number, state: string, description: string, seconds: number) => ({ id, state, description,
    created_at: time(seconds), log_url: `https://github.com/${repository}/actions/runs/${controllerRun}`, environment_url: 'https://api.lovora.us' });
  const statuses = [status(898, 'error', 'strict:unresolved', -190), status(897, 'in_progress', `strict:reserved:${requestDigest}`, -200)];
  const outcome = { requestDigest, previous: null, result: { version: 1, request, status: 'refused', stage: 'reserve',
    category: 'validation', nextAction: 'inspect-retained-evidence', effects: { create: 'not-started', migration: 'not-started', promotion: 'not-started' },
    deploymentId: null, migration: null, receiptDigest: null, proof: null, evidence: 'confirmed' }, terminal: true };
  const files = new Map<string, Buffer>([
    ['strict/reserving.json', Buffer.from(JSON.stringify({ requestDigest, packetDigest }) + '\n')],
    ['strict/reservation.json', Buffer.from(JSON.stringify({ version: 1, requestDigest, packetDigest, journal: entry.id }) + '\n')],
    ['release-outcome-0000.json', Buffer.from(JSON.stringify(outcome) + '\n')],
  ]);
  files.set('release-outcome-0001.json', Buffer.from(JSON.stringify({ ...outcome, previous: sha256(files.get('release-outcome-0000.json')!) }) + '\n'));
  if (readOnlyHistory) {
    const intent = { packetDigest, phase: 'history', previous: null, deploymentId: null };
    const description = `strict:history:intent:${sha256(canonical({ requestDigest, intent }))}`;
    statuses[0]!.state = 'in_progress'; statuses[0]!.description = description;
    const values: Record<string, unknown> = {
      'strict/history.authorized.json': { version: 1, requestDigest, packetDigest, journal, phase: 'history',
        intent, description, confirmedAt: Date.parse(time(-189)) },
      'strict/operator.lock': { packetDigest, runId, lease: `owner-manual-${runId}` },
      'strict/active.lock': { packetDigest, runId, phase: 'history' },
      [`strict/${runId}/history.intent.json`]: intent,
      [`strict/${runId}/STOP.json`]: { packetDigest, phase: 'history', outcome: 'unknown-or-refused' },
    };
    for (const [name, value] of Object.entries(values)) files.set(name, Buffer.from(JSON.stringify(value) + '\n'));
    const initial = { ...outcome, terminal: false, result: { ...outcome.result, status: 'unknown', category: 'outcome-unknown' } };
    files.set('release-outcome-0000.json', Buffer.from(JSON.stringify(initial) + '\n'));
    const head = sha256(files.get('release-outcome-0000.json')!);
    const refused = { ...outcome, previous: head, result: { ...outcome.result, stage: 'history', category: 'history-mismatch', receiptDigest: head } };
    files.set('release-outcome-0001.json', Buffer.from(JSON.stringify(refused) + '\n'));
    files.set('release-outcome-0002.json', Buffer.from(JSON.stringify({ ...refused, previous: sha256(files.get('release-outcome-0001.json')!) }) + '\n'));
  }
  const producerZip = receiptZip([['be-release.tar.gz', f.archive], ['be-release-approval.json', Buffer.from(canonical(f.approval) + '\n')]]);
  const runValue = (failed: boolean) => ({ id: failed ? controllerRun : 122, run_attempt: 1, workflow_id: 12,
    status: 'completed', conclusion: failed ? 'failure' : 'success', event: failed ? 'workflow_dispatch' : 'push',
    head_sha: request.controller.revision, head_branch: 'main', path: '.github/workflows/be-delivery.yml',
    repository: { full_name: repository, id: 1 }, head_repository: { full_name: repository, id: 1 },
    created_at: time(failed ? -300 : -600), updated_at: time(failed ? -150 : -400) });
  const jobNames = ['BE required checks', 'BE completion', 'BE production delivery', 'Select an approved checked routine bundle',
    'Activate the owner-approved retained bundle', 'Select the owner-approved retained activation bundle'];
  const successfulSteps = (names: string[]) => names.map((name, index) => ({ name, number: index + 1, status: 'completed', conclusion: 'success' }));
  const jobsValue = (failed: boolean) => ({ total_count: 6, jobs: jobNames.map((name, index) => ({
    id: (failed ? 100 : 200) + index, name, run_id: failed ? controllerRun : 122, run_attempt: 1,
    head_sha: request.controller.revision, status: 'completed',
    conclusion: name === 'BE required checks' ? failed ? 'skipped' : 'success' : name === 'BE completion' ? failed ? 'failure' : 'success'
      : name === 'BE production delivery' ? failed ? 'failure' : 'skipped' : name === 'Select an approved checked routine bundle' && failed ? 'success' : 'skipped',
    started_at: time(failed ? -280 : -580), completed_at: time(failed ? -170 : -410),
    steps: [] as Array<{ name: string; number: number; status: string; conclusion: string }>,
  })) });
  const failedJobs = jobsValue(true), producerJobs = jobsValue(false);
  const production = failedJobs.jobs.find(job => job.name === 'BE production delivery')!;
  production.steps = successfulSteps([
    'Set up job', 'Check out the same published controller without persisted credentials',
    'Set exact delivery runtime without application installation', "Download only this run's verified immutable relay",
    'Reverify approved relay and exact controller/operator before executing bundle code',
    'Bootstrap independently verified public CLI before provider secrets',
    'Reserve the common durable exclusion and authorize the explicit migration mode',
    'Inspect exactly strict three-entry history in the SQL-only worker',
    'Create held strict4 once and authorize SQL only after exact pending readiness',
    'Apply only the approved new suffix in the SQL-only worker',
    'Confirm durable SQL outcome when selected and accept the same exact deployment',
    'Preserve private receipt modes and record the exact transferable inventory',
    'Retain sanitized receipts without secret-bearing subprocess logs',
    'Summarize production boundaries without private output', 'Retain public production diagnostics on every outcome',
    'Disclose production diagnostic upload loss', 'Post Set exact delivery runtime without application installation',
    'Post Check out the same published controller without persisted credentials', 'Complete job',
  ]);
  production.steps[6]!.conclusion = 'failure';
  for (const index of [7, 8, 9, 10, 16]) production.steps[index]!.conclusion = 'skipped';
  if (readOnlyHistory) { production.steps[6]!.conclusion = 'success'; production.steps[7]!.conclusion = 'failure'; }
  failedJobs.jobs.find(job => job.name === 'Select an approved checked routine bundle')!.steps = successfulSteps([
    'Authenticate consumer and successful producer before retrieval',
    'Check independent approval and archive before safe extraction and full closure verification',
    'Relay unchanged approved bytes and bounded request receipts',
  ]);
  producerJobs.jobs[0]!.steps = successfulSteps(['Compile exact API source',
    'Build native artifact and require functional plus actual HTTP-to-test-DB checks', 'Retain one immutable mode-preserving tested bundle']);
  const artifactValue = (failed: boolean, bytes: Buffer) => ({ id: failed ? receiptId : 456,
    name: failed ? `be-delivery-receipts-${controllerRun}-1` : 'be-tested-122-1', size_in_bytes: bytes.length,
    digest: `sha256:${sha256(bytes)}`, expired: false, created_at: time(failed ? -180 : -420), expires_at: time(86400),
    workflow_run: { id: failed ? controllerRun : 122, head_sha: request.controller.revision, head_branch: 'main', repository_id: 1, head_repository_id: 1 } });
  const workflow = authorizationWorkflow;
  const values: Record<string, any> = {
    [`/deployments/${journal}`]: entry, [`/deployments/${journal}/statuses?per_page=100`]: statuses,
    [`/actions/runs/${controllerRun}`]: runValue(true), '/actions/runs/122': runValue(false),
    [`/actions/runs/${controllerRun}/jobs?filter=all&per_page=100`]: failedJobs,
    '/actions/runs/122/jobs?filter=all&per_page=100': producerJobs,
    [`/commits/${request.controller.revision}`]: { sha: request.controller.revision, commit: { tree: { sha: request.controller.tree } } },
    [`/contents/.github/workflows/be-delivery.yml?ref=${request.controller.revision}`]: {
      type: 'file', path: '.github/workflows/be-delivery.yml', encoding: 'base64', size: workflow.length, content: workflow.toString('base64') },
    '/actions/runs/122/artifacts?per_page=100': { total_count: 1, artifacts: [artifactValue(false, producerZip)] },
  };
  const archives = new Map<number, Buffer>([[456, producerZip]]);
  const sealReceipts = (inventoryDigest?: string, historyDirectory = runId) => {
    const directories = [{ path: 'strict', mode: 0o700 }];
    if (readOnlyHistory) directories.push({ path: `strict/${historyDirectory}`, mode: 0o700 });
    const entries = [...files].sort(([a], [b]) => a.localeCompare(b, 'en'));
    const listing = { files: entries.map(([path, bytes]) => ({ path, mode: 0o600, size: bytes.length,
      sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') })), directories };
    const compressed = tar([
      { path: 'be-receipts/', content: Buffer.alloc(0), mode: 0o700, type: '5' },
      ...directories.map(({ path }) => ({ path: `be-receipts/${path}/`, content: Buffer.alloc(0), mode: 0o700, type: '5' })),
      ...entries.map(([path, content]) => ({ path: `be-receipts/${path}`, content, mode: 0o600 })),
    ]);
    const zip = receiptZip([['be-delivery-receipts.tar.gz', compressed],
      ['be-delivery-receipts.archive-sha256', Buffer.from(`${sha256(compressed)}  /synthetic/be-delivery-receipts.tar.gz\n`)],
      ['be-delivery-receipts.inventory-sha256', Buffer.from(`${inventoryDigest ?? sha256(canonical(listing))}\n`)]]);
    archives.set(receiptId, zip);
    values[`/actions/runs/${controllerRun}/artifacts?per_page=100`] = { total_count: 1, artifacts: [artifactValue(true, zip)] };
  };
  sealReceipts();
  const reads: string[] = [], downloads: number[] = [];
  const io = {
    async read(path: string): Promise<unknown> { reads.push(path); assert.ok(Object.hasOwn(values, path), `Unexpected synthetic read: ${path}`); return structuredClone(values[path]); },
    async download(id: number): Promise<Buffer> { downloads.push(id); const bytes = archives.get(id); assert.ok(bytes, 'Missing synthetic archive'); return bytes; },
  };
  return { h, request, entry, statuses, item: { entry, status: statuses[0]! }, files, values, archives, io,
    reads, downloads, sealReceipts, production, failedJobs, producerJobs, runId };
}

test('failed read-only history requires complete source-bound no-effect evidence', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const fault of ['none', 'running', 'cancelled', 'source', 'authorization-failed', 'history-skipped', 'mutation-step',
    'unknown-job', 'status-changed', 'extra-status', 'missing-intent', 'sql-intent', 'extra-effect-intent',
    'lock-phase', 'authorization-binding', 'missing-stop', 'raw-chain', 'unknown-outcome', 'unconfirmed',
    'initial-terminal', 'effect', 'receipt-pointer', 'receipt-parent', 'expired', 'late-status']) await t.test(fault, async () => {
    const p = authorizationFailureFixture(f, true);
    const change = (name: string, mutate: (value: any) => void) => {
      const value = JSON.parse(p.files.get(name)!.toString()); mutate(value);
      p.files.set(name, Buffer.from(JSON.stringify(value) + '\n'));
    };
    if (fault === 'running') p.values['/actions/runs/123'].status = 'in_progress';
    if (fault === 'cancelled') p.values['/actions/runs/123'].conclusion = 'cancelled';
    if (fault === 'source') { p.request.operatorDigest = '0'.repeat(64); p.entry.payload.requestDigest = sha256(canonical(p.request)); }
    if (fault === 'authorization-failed') p.production.steps[6]!.conclusion = 'failure';
    if (fault === 'history-skipped') p.production.steps[7]!.conclusion = 'skipped';
    if (fault === 'mutation-step') p.production.steps[9]!.conclusion = 'success';
    if (fault === 'unknown-job') {
      p.failedJobs.jobs[4]!.name = 'Unknown job'; Reflect.deleteProperty(p.failedJobs.jobs[4]!, 'conclusion');
    }
    if (fault === 'status-changed') p.statuses[0]!.description = 'strict:sql-apply:intent:' + '0'.repeat(64);
    if (fault === 'extra-status') p.statuses.push({ ...p.statuses[1]!, id: 896, description: 'ack:dpl_unknown' });
    if (fault === 'missing-intent') p.files.delete(`strict/${p.runId}/history.intent.json`);
    if (fault === 'sql-intent') change(`strict/${p.runId}/history.intent.json`, value => { value.phase = 'sql-apply'; });
    if (fault === 'extra-effect-intent') p.files.set(`strict/${p.runId}/sql-apply.intent.json`, Buffer.from('{}'));
    if (fault === 'lock-phase') change('strict/active.lock', value => { value.phase = 'held-create'; });
    if (fault === 'authorization-binding') change('strict/history.authorized.json', value => { value.journal++; });
    if (fault === 'missing-stop') p.files.delete(`strict/${p.runId}/STOP.json`);
    if (fault === 'raw-chain') change('release-outcome-0002.json', value => { value.previous = '0'.repeat(64); });
    if (fault === 'unknown-outcome') change('release-outcome-0002.json', value => { value.result.status = 'unknown'; value.result.category = 'outcome-unknown'; });
    if (fault === 'unconfirmed') change('release-outcome-0002.json', value => { value.result.evidence = 'unconfirmed'; value.result.status = 'unknown'; });
    if (fault === 'initial-terminal') change('release-outcome-0000.json', value => { value.terminal = true; });
    if (fault === 'effect') change('release-outcome-0002.json', value => { value.result.effects.migration = 'unknown'; });
    if (fault === 'receipt-pointer') change('release-outcome-0002.json', value => { value.result.receiptDigest = value.previous; });
    p.sealReceipts(undefined, fault === 'receipt-parent' ? '00000000-0000-4000-8000-000000000002' : p.runId);
    if (fault === 'expired') p.values['/actions/runs/123/artifacts?per_page=100'].artifacts[0].expires_at = new Date(0).toISOString();
    if (fault === 'late-status') {
      const read = p.io.read; let reads = 0;
      p.io.read = async path => {
        if (path === '/deployments/898/statuses?per_page=100' && ++reads === 2) p.statuses[0]!.description += 'changed';
        return read(path);
      };
    }
    const before = canonical([p.entry, p.statuses, [...p.files]]);
    if (fault === 'none') {
      const proof = await proveFailedAuthorization(p.item, f.artifact, p.io, AbortSignal.timeout(30000));
      assert.equal(proof.marker.kind, 'failed-read-only-history-no-effects');
      assert.equal(proof.marker.outcomeCount, 3);
      assert.equal(proof.marker.outcomeHead, sha256(p.files.get('release-outcome-0002.json')!));
      assert.equal(proof.marker.recordDigest, sha256(historicalSnapshot([p.item])));
      await proof.recheck();
      assert.equal(canonical([p.entry, p.statuses, [...p.files]]), before);
    } else await assert.rejects(proveFailedAuthorization(p.item, f.artifact, p.io, AbortSignal.timeout(30000)));
    assert.equal(p.item.status.state, 'in_progress');
  });
});

test('failed read-only history fresh provider reservation requires both failure and retained handoff proofs', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const fault of ['retention-unavailable', 'missing-handoff', 'source', 'intent', 'running', 'dangling-marker',
    'effect-intent']) await t.test(fault, async st => {
    const p = authorizationFailureFixture(f, true), h = p.h;
    const request = { ...p.request, controller: h.run, migration: { ...p.request.migration, packetDigest: 'c'.repeat(64) } };
    const schema: RoutineDeliveryApproval = { ...h.schema, request, requestDigest: sha256(canonical(request)),
      strictPacketDigest: request.migration.packetDigest };
    if (fault === 'missing-handoff') Reflect.deleteProperty(p.entry.payload, 'historicalHandoff');
    if (fault === 'source') {
      p.request.operatorDigest = '0'.repeat(64); p.entry.payload.requestDigest = sha256(canonical(p.request));
    }
    if (fault === 'intent') p.statuses[0]!.description = 'strict:sql-apply:intent:' + '0'.repeat(64);
    if (fault === 'running') p.values['/actions/runs/123'].status = 'in_progress';
    if (fault === 'dangling-marker') Object.assign(p.entry.payload, { noEffectDispositions: [{
      version: 1, kind: 'failed-authorization-no-effects', journal: 899,
    }] });
    if (fault === 'effect-intent') {
      p.files.set(`strict/${p.runId}/sql-apply.intent.json`, Buffer.from('{}')); p.sealReceipts();
    }
    const before = canonical([p.entry, p.statuses, [...p.files]]);
    let posts = 0, retentionReads = 0, realNetwork = 0;
    st.mock.method(globalThis, 'fetch', async () => { realNetwork++; throw new Error('Real network denied'); });
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw)), path = url.pathname.replace(`/repos/${repository}`, '') + url.search;
      if (init?.method === 'POST') { posts++; throw new Error('Unproved reservation forbidden'); }
      if (url.hostname === 'proof.blob.core.windows.net') {
        assert.equal(new Headers(init?.headers).has('Authorization'), false);
        return new Response(new Uint8Array(await p.io.download(Number(url.pathname.slice(1)))));
      }
      if (url.pathname.endsWith('/deployments')) return Response.json([p.entry, ...h.records.slice(1)]);
      if (path === '/deployments/898/statuses?per_page=1') return Response.json([p.statuses[0]]);
      const download = /^\/actions\/artifacts\/(\d+)\/zip$/.exec(path);
      if (download) return new Response(null, { status: 302, headers: { location: `https://proof.blob.core.windows.net/${download[1]}` } });
      if (Object.hasOwn(p.values, path)) return Response.json(await p.io.read(path));
      if (path === `/releases/tags/${retainedHistoricalArchive.tag}`) { retentionReads++; return Response.json({}); }
      return h.transport(raw, init);
    };
    const provider = createProvider(f.artifact, h.run, schema, h.credentials, AbortSignal.timeout(30000), transport);
    if (fault === 'retention-unavailable') {
      // Valid fresh no-effect proof reaches, but cannot replace, the independent retained handoff proof.
      await assert.rejects(provider.reserve(), /retention-unique-asset/);
      assert.equal(retentionReads, 1);
      assert.deepEqual([...new Set(p.downloads)].sort(), [456, 458]);
    } else {
      await assert.rejects(provider.reserve()); assert.equal(retentionReads, 0);
    }
    assert.equal(posts, 0); assert.equal(realNetwork, 0); assert.equal(h.reservation(), undefined);
    assert.equal(canonical([p.entry, p.statuses, [...p.files]]), before);
    assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  });
});

test('failed read-only history reproves carried markers and consumes both only through accepted lineage', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  const origin = authorizationFailureFixture(f);
  const original = await proveFailedAuthorization(origin.item, f.artifact, origin.io, AbortSignal.timeout(30000));
  for (const fault of ['fresh', 'marker-drift', 'missing-origin', 'duplicate-prior', 'expired-origin',
    'consumed', 'consumed-missing-origin', 'consumed-unaccepted', 'consumed-status-drift']) await t.test(fault, async () => {
    const p = authorizationFailureFixture(f, true), marker = structuredClone(original.marker), h = p.h;
    Object.assign(p.entry.payload, { noEffectDispositions: [marker] });
    const values = { ...origin.values, ...p.values }, downloads: number[] = [];
    const io = {
      async read(path: string): Promise<unknown> {
        if (Object.hasOwn(values, path)) return structuredClone(values[path]);
        return (await h.transport(`https://api.github.com/repos/${repository}${path}`)).json();
      },
      async download(id: number): Promise<Buffer> {
        downloads.push(id); const bytes = p.archives.get(id) ?? origin.archives.get(id);
        assert.ok(bytes); return bytes;
      },
    };
    const items = [p.item, origin.item];
    if (fault === 'marker-drift') marker.outcomeHead = '0'.repeat(64);
    if (fault === 'missing-origin') items.pop();
    if (fault === 'duplicate-prior') Object.assign(p.entry.payload, { noEffectDispositions: [marker, marker] });
    if (fault === 'expired-origin') {
      values['/actions/runs/121/artifacts?per_page=100'] = structuredClone(origin.values['/actions/runs/121/artifacts?per_page=100']);
      values['/actions/runs/121/artifacts?per_page=100'].artifacts[0].expires_at = new Date(0).toISOString();
    }
    if (['marker-drift', 'missing-origin', 'duplicate-prior', 'expired-origin'].includes(fault)) {
      await assert.rejects(proveFailedAuthorizations(items, f.artifact, io, AbortSignal.timeout(30000)));
      return;
    }
    const proofs = await proveFailedAuthorizations(items, f.artifact, io, AbortSignal.timeout(30000));
    assert.deepEqual([...proofs.keys()].sort(), [898, 899]);
    assert.ok([...proofs.values()].every(proof => proof.consumed === undefined));
    assert.ok(downloads.includes(457) && downloads.includes(458), 'Both unconsumed failed histories require fresh archive proof');
    if (fault === 'fresh') return;
    const carrier = h.records[0]!;
    carrier.payload.noEffectDispositions = [...proofs.values()].map(proof => proof.marker);
    if (fault === 'consumed-missing-origin') carrier.payload.noEffectDispositions = [proofs.get(898)!.marker];
    h.records.splice(1, 0, p.entry, origin.entry);
    let forbidden = 0, posts = 0, statusReads = 0;
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw)), path = url.pathname.replace(`/repos/${repository}`, '') + url.search;
      if (/^\/(?:actions|contents|releases)\//.test(path)) { forbidden++; throw new Error('Old artifacts unavailable after acceptance'); }
      if (init?.method === 'POST') posts++;
      for (const prior of [p, origin]) {
        if (path === `/deployments/${prior.entry.id}`) return Response.json(prior.entry);
        if (url.pathname.endsWith(`/deployments/${prior.entry.id}/statuses`)) {
          if (fault === 'consumed-status-drift' && prior === p && url.searchParams.get('per_page') === '100' && ++statusReads === 2) {
            return Response.json([{ ...prior.statuses[0], description: 'changed' }, prior.statuses[1]]);
          }
          return Response.json(url.searchParams.get('per_page') === '100' ? prior.statuses : prior.statuses.slice(0, 1));
        }
      }
      const response = await h.transport(raw, init);
      if (fault === 'consumed-unaccepted' && url.pathname.endsWith('/deployments/900/statuses')) {
        const rows = await response.json(); assert.ok(Array.isArray(rows)); rows[0].state = 'in_progress'; return Response.json(rows);
      }
      return response;
    };
    const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, AbortSignal.timeout(30000), transport);
    if (fault === 'consumed') {
      assert.equal(await provider.reserve(), 44); assert.equal(posts, 1);
      assert.equal(Object.hasOwn(h.reservation()!.payload, 'noEffectDispositions'), false);
      await assert.rejects(provider.reserve(), /already has a durable reservation/);
      assert.equal(posts, 1);
    } else { await assert.rejects(provider.reserve()); assert.equal(posts, 0); }
    assert.equal(forbidden, 0); assert.equal(p.statuses[0]!.state, 'in_progress'); assert.equal(origin.statuses[0]!.state, 'error');
    assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  });
});

test('failed read-only history three-origin dependencies require closed older proofs and complete accepted consumption', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const fault of ['fresh', 'missing-history', 'missing-authorization', 'missing-transitive', 'marker-drift',
    'duplicate-dependency', 'duplicate-record', 'unknown-kind', 'self', 'future-edge', 'expired-history', 'late-status',
    'consumed', 'consumed-missing-authorization', 'consumed-missing-history', 'consumed-duplicate', 'consumed-status-drift']) {
    await t.test(fault, async st => {
      const origin = authorizationFailureFixture(f), earlier = authorizationFailureFixture(f, true);
      const latest = authorizationFailureFixture(f, 'later'), h = latest.h;
      const originProof = await proveFailedAuthorization(origin.item, f.artifact, origin.io, AbortSignal.timeout(30000));
      Object.assign(earlier.entry.payload, { noEffectDispositions: [originProof.marker] });
      const earlierProof = await proveFailedAuthorization(earlier.item, f.artifact, earlier.io, AbortSignal.timeout(30000));
      const carried = [structuredClone(earlierProof.marker), structuredClone(originProof.marker)];
      Object.assign(latest.entry.payload, { noEffectDispositions: carried });
      const items = [latest.item, earlier.item, origin.item];
      const values = { ...origin.values, ...earlier.values, ...latest.values };
      const archives = new Map([...origin.archives, ...earlier.archives, ...latest.archives]);
      const downloads: number[] = [];
      let posts = 0, forbidden = 0, retentionReads = 0, statusReads = 0, consumed = false, realNetwork = 0;
      st.mock.method(globalThis, 'fetch', async () => { realNetwork++; throw new Error('Real network denied'); });
      const io = {
        async read(path: string): Promise<unknown> {
          if (Object.hasOwn(values, path)) {
            const value = structuredClone(values[path]);
            if (path === '/deployments/897/statuses?per_page=100'
              && ((fault === 'late-status' && ++statusReads === 2) || (consumed && fault === 'consumed-status-drift'))) value[0].description = 'changed';
            return value;
          }
          return (await h.transport(`https://api.github.com/repos/${repository}${path}`)).json();
        },
        async download(id: number): Promise<Buffer> {
          downloads.push(id); const bytes = archives.get(id); assert.ok(bytes); return bytes;
        },
      };
      if (fault.startsWith('consumed')) {
        // The accepted successor alone consumes all three exact independently verified commitments.
        const proofs = await proveFailedAuthorizations(items, f.artifact, io, AbortSignal.timeout(30000));
        assert.deepEqual([...proofs.keys()].sort(), [897, 898, 899]);
        assert.ok([...proofs.values()].every(proof => proof.consumed === undefined));
        assert.deepEqual([...new Set(downloads)].sort(), [456, 457, 458, 459]);
        const committed = [...proofs.values()].map(proof => proof.marker);
        if (fault === 'consumed-missing-authorization') committed.splice(committed.findIndex(marker => marker.journal === 899), 1);
        if (fault === 'consumed-missing-history') committed.splice(committed.findIndex(marker => marker.journal === 898), 1);
        if (fault === 'consumed-duplicate') committed.push(committed[0]!);
        h.records[0]!.payload.noEffectDispositions = committed;
        h.records.splice(1, 0, ...items.map(item => item.entry)); consumed = true; downloads.length = 0;
      } else {
        if (fault === 'missing-history') items.splice(1, 1);
        if (fault === 'missing-authorization') items.splice(2, 1);
        if (fault === 'missing-transitive') carried.pop();
        if (fault === 'marker-drift') carried[0]!.outcomeHead = '0'.repeat(64);
        if (fault === 'duplicate-dependency') carried.push(carried[0]!);
        if (fault === 'duplicate-record') items.push(earlier.item);
        if (fault === 'unknown-kind') Object.assign(carried[0]!, { kind: 'unrecognized-no-effects' });
        if (fault === 'self') {
          const own = await proveFailedAuthorization(latest.item, f.artifact, latest.io, AbortSignal.timeout(30000));
          carried.push(own.marker);
        }
        if (fault === 'future-edge') {
          Reflect.deleteProperty(latest.entry.payload, 'noEffectDispositions');
          const newer = await proveFailedAuthorization(latest.item, f.artifact, latest.io, AbortSignal.timeout(30000));
          Object.assign(earlier.entry.payload, { noEffectDispositions: [newer.marker, originProof.marker] });
        }
        if (fault === 'expired-history') values['/actions/runs/123/artifacts?per_page=100'].artifacts[0].expires_at = new Date(0).toISOString();
      }
      const before = canonical(items);
      const request = { ...latest.request, controller: h.run, migration: { ...latest.request.migration, packetDigest: 'e'.repeat(64) } };
      const schema: RoutineDeliveryApproval = consumed ? h.schema : { ...h.schema, request,
        requestDigest: sha256(canonical(request)), strictPacketDigest: request.migration.packetDigest };
      const transport: typeof fetch = async (raw, init) => {
        const url = new URL(String(raw)), path = url.pathname.replace(`/repos/${repository}`, '') + url.search;
        if (init?.method === 'POST') posts++;
        if (consumed && /^\/(?:actions|contents|releases)\//.test(path)) {
          forbidden++; throw new Error('Old Actions artifacts unavailable after accepted consumption');
        }
        if (url.hostname === 'proof.blob.core.windows.net') {
          assert.equal(new Headers(init?.headers).has('Authorization'), false);
          return new Response(new Uint8Array(await io.download(Number(url.pathname.slice(1)))));
        }
        if (!consumed && url.pathname.endsWith('/deployments')) return Response.json([...items.map(item => item.entry), ...h.records.slice(1)]);
        for (const item of items) if (path === `/deployments/${item.entry.id}/statuses?per_page=1`) return Response.json([item.status]);
        const download = /^\/actions\/artifacts\/(\d+)\/zip$/.exec(path);
        if (download) return new Response(null, { status: 302, headers: { location: `https://proof.blob.core.windows.net/${download[1]}` } });
        if (Object.hasOwn(values, path)) return Response.json(await io.read(path));
        if (path === `/releases/tags/${retainedHistoricalArchive.tag}`) { retentionReads++; return Response.json({}); }
        return h.transport(raw, init);
      };
      const provider = createProvider(f.artifact, h.run, schema, h.credentials, AbortSignal.timeout(30000), transport);
      if (fault === 'consumed') {
        assert.equal(await provider.reserve(), 44); assert.equal(posts, 1);
        assert.equal(Object.hasOwn(h.reservation()!.payload, 'noEffectDispositions'), false);
        await assert.rejects(provider.reserve(), /already has a durable reservation/);
        assert.equal(posts, 1); assert.deepEqual(downloads, []);
      } else {
        if (fault === 'fresh') {
          await assert.rejects(provider.reserve(), /retention-unique-asset/);
          assert.equal(retentionReads, 1);
          assert.deepEqual([...new Set(downloads)].sort(), [456, 457, 458, 459]);
        } else { await assert.rejects(provider.reserve()); assert.equal(retentionReads, 0); }
        assert.equal(posts, 0); assert.equal(h.reservation(), undefined);
      }
      assert.equal(forbidden, 0); assert.equal(realNetwork, 0); assert.equal(canonical(items), before);
      assert.equal(latest.statuses[0]!.state, 'in_progress'); assert.equal(earlier.statuses[0]!.state, 'in_progress');
      assert.equal(origin.statuses[0]!.state, 'error'); assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
    });
  }
});

test('failed authorization proves the complete raw receipt chain without changing the retained error', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  const p = authorizationFailureFixture(f), before = canonical([p.entry, p.statuses, [...p.files]]);
  const proof = await proveFailedAuthorization(p.item, f.artifact, p.io, AbortSignal.timeout(30000));
  assert.equal(proof.marker.kind, 'failed-authorization-no-effects');
  assert.equal(proof.marker.sourcePolicy, 'current'); assert.equal(proof.marker.journal, 899);
  assert.equal(proof.marker.outcomeHead, sha256(p.files.get('release-outcome-0001.json')!));
  assert.equal(proof.marker.outcomeCount, 2);
  assert.equal(proof.marker.requestDigest, sha256(canonical(p.request)));
  assert.equal(proof.marker.recordDigest, sha256(historicalSnapshot([p.item])));
  assert.equal(canonical([p.entry, p.statuses, [...p.files]]), before);
  p.values['/actions/runs/121'].run_attempt = 2;
  await assert.rejects(proof.recheck(), /proof-metadata-stable/);
});

test('failed authorization refuses incomplete, changed, unknown and effect-bearing evidence', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const fault of ['source', 'operator', 'tree', 'workflow', 'run-attempt', 'repository', 'producer-failed', 'jobs-page',
    'failed-job-substitution', 'producer-job-substitution', 'failed-job-omitted', 'producer-job-omitted',
    'failed-job-duplicate', 'producer-job-duplicate',
    'checks-failed', 'retrieval-failed', 'history-started', 'effect-started', 'missing-status', 'extra-status',
    'status-ack', 'status-run', 'expired', 'receipt-id', 'artifact-page', 'artifact-run', 'missing-archive',
    'archive-bytes', 'producer-bytes', 'inventory', 'missing-reservation', 'wrong-journal', 'history-authorized', 'outcome-gap',
    'raw-chain', 'request-binding', 'outcome-unknown', 'outcome-unconfirmed', 'create-acked', 'sql-unknown',
    'promotion-unknown', 'nonterminal', 'metadata-drift']) await t.test(fault, async () => {
    const p = authorizationFailureFixture(f);
    const receipt = p.values['/actions/runs/121/artifacts?per_page=100'].artifacts[0];
    if (fault === 'source') p.request.sourceDigest = '0'.repeat(64);
    if (fault === 'operator') p.request.operatorDigest = '0'.repeat(64);
    if (fault === 'source' || fault === 'operator') {
      p.entry.payload.sourceDigest = p.request.sourceDigest;
      p.entry.payload.requestDigest = sha256(canonical(p.request));
      p.statuses[1]!.description = `strict:reserved:${p.entry.payload.requestDigest}`;
    }
    if (fault === 'tree') p.values[`/commits/${p.request.controller.revision}`].commit.tree.sha = '0'.repeat(40);
    if (fault === 'workflow') p.values[`/contents/.github/workflows/be-delivery.yml?ref=${p.request.controller.revision}`].content = Buffer.from('changed').toString('base64');
    if (fault === 'run-attempt') p.values['/actions/runs/121'].run_attempt = 2;
    if (fault === 'repository') p.values['/actions/runs/121'].repository.full_name = 'foreign/repository';
    if (fault === 'producer-failed') p.values['/actions/runs/122'].conclusion = 'failure';
    if (fault === 'jobs-page') p.failedJobs.total_count = 101;
    const jobFault = /^(failed|producer)-job-(substitution|omitted|duplicate)$/.exec(fault);
    if (jobFault) {
      const listing = jobFault[1] === 'failed' ? p.failedJobs : p.producerJobs;
      const index = listing.jobs.findIndex(job => job.name === 'Activate the owner-approved retained bundle');
      assert.notEqual(index, -1);
      if (jobFault[2] === 'substitution') {
        listing.jobs[index]!.name = 'Unrecognized completed job';
        Reflect.deleteProperty(listing.jobs[index]!, 'conclusion');
      } else if (jobFault[2] === 'omitted') {
        listing.jobs.splice(index, 1);
        listing.total_count = listing.jobs.length;
      } else {
        listing.jobs[index]!.name = 'Select the owner-approved retained activation bundle';
      }
    }
    if (fault === 'checks-failed') p.producerJobs.jobs[0]!.steps[1]!.conclusion = 'failure';
    if (fault === 'retrieval-failed') p.failedJobs.jobs[3]!.conclusion = 'failure';
    if (fault === 'history-started') p.production.steps[7]!.conclusion = 'success';
    if (fault === 'effect-started') p.production.steps[8]!.conclusion = 'success';
    if (fault === 'missing-status') p.statuses.pop();
    if (fault === 'extra-status') p.statuses.push({ ...p.statuses[1]!, id: 896 });
    if (fault === 'status-ack') p.statuses[1]!.description = 'ack:dpl_unapproved';
    if (fault === 'status-run') p.statuses[1]!.log_url += '0';
    if (fault === 'expired') receipt.expires_at = new Date(0).toISOString();
    if (fault === 'receipt-id') receipt.name = 'be-delivery-receipts-121-2';
    if (fault === 'artifact-page') p.values['/actions/runs/121/artifacts?per_page=100'].total_count = 101;
    if (fault === 'artifact-run') receipt.workflow_run.head_sha = '0'.repeat(40);
    if (fault === 'missing-archive') p.archives.delete(457);
    if (fault === 'archive-bytes') p.archives.set(457, Buffer.from('changed'));
    if (fault === 'producer-bytes') p.archives.set(456, Buffer.from('changed'));
    if (fault === 'missing-reservation') p.files.delete('strict/reservation.json');
    if (fault === 'wrong-journal') {
      const reservation = JSON.parse(p.files.get('strict/reservation.json')!.toString()); reservation.journal++;
      p.files.set('strict/reservation.json', Buffer.from(JSON.stringify(reservation)));
    }
    if (fault === 'history-authorized') p.files.set('strict/history.authorized.json', Buffer.from('{}'));
    if (fault === 'outcome-gap') { p.files.set('release-outcome-0002.json', p.files.get('release-outcome-0001.json')!); p.files.delete('release-outcome-0001.json'); }
    if (['raw-chain', 'request-binding', 'outcome-unknown', 'outcome-unconfirmed', 'create-acked', 'sql-unknown', 'promotion-unknown', 'nonterminal'].includes(fault)) {
      const event = JSON.parse(p.files.get('release-outcome-0001.json')!.toString());
      if (fault === 'raw-chain') event.previous = sha256(canonical(JSON.parse(p.files.get('release-outcome-0000.json')!.toString())));
      if (fault === 'request-binding') event.result.request.configDigest = '0'.repeat(64);
      if (fault === 'outcome-unknown') { event.result.status = 'unknown'; event.result.category = 'outcome-unknown'; }
      if (fault === 'outcome-unconfirmed') { event.result.status = 'unknown'; event.result.evidence = 'unconfirmed'; }
      if (fault === 'create-acked') { event.result.status = 'failed'; event.result.effects.create = 'ACKed'; event.result.deploymentId = 'dpl_unapproved'; }
      if (fault === 'sql-unknown') event.result.effects.migration = 'unknown';
      if (fault === 'promotion-unknown') event.result.effects.promotion = 'unknown';
      if (fault === 'nonterminal') event.terminal = false;
      p.files.set('release-outcome-0001.json', Buffer.from(JSON.stringify(event)));
    }
    if (['missing-reservation', 'wrong-journal', 'history-authorized', 'outcome-gap', 'raw-chain', 'request-binding',
      'outcome-unknown', 'outcome-unconfirmed', 'create-acked', 'sql-unknown', 'promotion-unknown', 'nonterminal'].includes(fault)) p.sealReceipts();
    if (fault === 'inventory') p.sealReceipts('0'.repeat(64));
    if (fault === 'metadata-drift') {
      const read = p.io.read; let calls = 0;
      p.io.read = async path => { if (path === '/actions/runs/121' && ++calls === 2) p.values[path].run_attempt = 2; return read(path); };
    }
    let posts = 0, unrelatedHistoricalReads = 0;
    const transport: typeof fetch = async (raw: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(String(raw)), path = url.pathname.replace(`/repos/${repository}`, '') + url.search;
      if (init?.method === 'POST') { posts++; throw new Error('Unexpected reservation'); }
      if (url.hostname === 'proof.blob.core.windows.net') {
        assert.equal(new Headers(init?.headers).has('Authorization'), false);
        const bytes = await p.io.download(Number(url.pathname.slice(1)));
        return new Response(new Uint8Array(bytes));
      }
      if (url.pathname.endsWith('/deployments')) return Response.json([p.entry, ...p.h.records.slice(1)]);
      if (path === '/deployments/899/statuses?per_page=1') return Response.json([p.statuses[0]]);
      const download = /^\/actions\/artifacts\/(\d+)\/zip$/.exec(path);
      if (download) return new Response(null, { status: 302, headers: { location: `https://proof.blob.core.windows.net/${download[1]}` } });
      if (Object.hasOwn(p.values, path)) return Response.json(await p.io.read(path));
      if (path.startsWith('/releases/')) unrelatedHistoricalReads++;
      return p.h.transport(raw, init);
    };
    const provider = createProvider(f.artifact, p.h.run, p.h.schema, p.h.credentials, AbortSignal.timeout(30000), transport);
    if (fault === 'source' || fault === 'operator') await assert.rejects(provider.reserve(), /authorization-reviewed-source/);
    else await assert.rejects(provider.reserve());
    assert.equal(posts, 0); assert.equal(unrelatedHistoricalReads, 0);
    if (jobFault) assert.deepEqual(p.downloads, []);
    assert.equal(p.item.status.state, 'error');
  });
});

test('failed authorization consumed lineage survives expired Actions artifacts and still fences replay and forks', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  const original = authorizationFailureFixture(f);
  const verified = await proveFailedAuthorization(original.item, f.artifact, original.io, AbortSignal.timeout(30000));
  for (const fault of ['none', 'unaccepted', 'missing-ack', 'marker-request', 'marker-record', 'marker-statuses',
    'marker-packet', 'marker-shape', 'duplicate-claim', 'fork', 'record-drift', 'status-drift', 'concurrent']) await t.test(fault, async st => {
    const p = authorizationFailureFixture(f), h = p.h, marker = structuredClone(verified.marker);
    // Bind this fixture's distinct timestamps; the proof bytes/request are otherwise identical.
    marker.recordDigest = sha256(historicalSnapshot([p.item]));
    marker.statusesDigest = sha256(canonical(p.statuses));
    const carrier = h.records[0]!;
    carrier.payload.noEffectDispositions = [marker];
    h.records.splice(1, 0, p.entry);
    if (fault === 'marker-request') marker.requestDigest = '0'.repeat(64);
    if (fault === 'marker-record') marker.recordDigest = '0'.repeat(64);
    if (fault === 'marker-statuses') marker.statusesDigest = '0'.repeat(64);
    if (fault === 'marker-packet') marker.packetDigest = '0'.repeat(64);
    if (fault === 'marker-shape') Reflect.set(marker, 'ignored', true);
    if (fault === 'duplicate-claim') carrier.payload.noEffectDispositions = [marker, marker];
    if (fault === 'fork') carrier.payload.historicalHandoff = { ...h.marker, predecessorRecord: 999 };
    const before = canonical(p.statuses);
    let forbiddenArtifacts = 0, posts = 0, scans = 0, oldStatusReads = 0, network = 0;
    st.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('Real network denied'); });
    const transport: typeof fetch = async (raw: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(String(raw)), path = url.pathname.replace(`/repos/${repository}`, '') + url.search;
      if (url.hostname === 'api.github.com' && /\/(?:actions|contents|releases)\//.test(path)) {
        forbiddenArtifacts++; throw new Error('Expired historical Actions evidence is unavailable');
      }
      if (init?.method === 'POST') posts++;
      if (path === '/deployments/899') return Response.json(p.entry);
      if (path.startsWith('/deployments/899/statuses')) {
        if (url.searchParams.get('per_page') === '100') {
          oldStatusReads++;
          if (fault === 'status-drift' && oldStatusReads === 2) return Response.json([p.statuses[0]]);
          return Response.json(p.statuses);
        }
        return Response.json([p.statuses[0]]);
      }
      const response = await h.transport(raw, init);
      if (url.pathname.endsWith('/deployments') && init?.method !== 'POST') {
        scans++;
        const rows = await response.json();
        assert.ok(Array.isArray(rows));
        if (fault === 'record-drift' && scans === 2) rows[1].payload.configDigest = '0'.repeat(64);
        if (fault === 'concurrent' && scans === 2) rows.unshift({ ...p.entry, id: 999, payload: {} });
        return Response.json(rows);
      }
      if (url.pathname.endsWith('/deployments/900/statuses')) {
        const rows = await response.json();
        assert.ok(Array.isArray(rows));
        if (fault === 'unaccepted') rows[0].state = 'in_progress';
        if (fault === 'missing-ack' && rows.length > 1) rows[1].description = 'strict:unresolved';
        return Response.json(rows);
      }
      return response;
    };
    const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, AbortSignal.timeout(30000), transport);
    if (fault === 'none') {
      assert.equal(await provider.reserve(), 44);
      const handoff = h.reservation()!.payload.historicalHandoff;
      assert.ok(handoff && typeof handoff === 'object' && 'predecessorRecord' in handoff);
      assert.equal(handoff.predecessorRecord, 900);
      assert.equal(Object.hasOwn(h.reservation()!.payload, 'noEffectDispositions'), false);
      await assert.rejects(provider.reserve(), /already has a durable reservation/);
      assert.equal(posts, 1);
    } else { await assert.rejects(provider.reserve()); assert.equal(posts, 0); }
    assert.equal(forbiddenArtifacts, 0); assert.equal(network, 0);
    assert.equal(canonical(p.statuses), before);
    assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  });
});

test('failed authorization request and strict packet replay precede proof reads and reservation writes', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const [mode, readOnlyHistory] of [['request', false], ['packet', false], ['request', true], ['packet', true]] as const) await t.test(`${mode}:${readOnlyHistory ? 'history' : 'authorization'}`, async () => {
    const p = authorizationFailureFixture(f, readOnlyHistory), h = p.h;
    const request = { ...p.request, controller: h.run, migration: { ...p.request.migration,
      packetDigest: mode === 'packet' ? p.request.migration.packetDigest : 'c'.repeat(64) } };
    const schema: RoutineDeliveryApproval = { ...h.schema, request, requestDigest: sha256(canonical(request)),
      strictPacketDigest: request.migration.packetDigest };
    if (mode === 'request') p.entry.payload.requestDigest = schema.requestDigest;
    let proofReads = 0, posts = 0;
    const transport: typeof fetch = async (raw: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (init?.method === 'POST') posts++;
      const url = new URL(String(raw));
      if (url.pathname.endsWith('/deployments')) return Response.json([p.entry]);
      proofReads++; throw new Error('Replay must stop before proof');
    };
    const provider = createProvider(f.artifact, h.run, schema, h.credentials, AbortSignal.timeout(10000), transport);
    await assert.rejects(provider.reserve(), /already has a durable reservation/);
    assert.equal(proofReads, 0); assert.equal(posts, 0);
  });
});

test('failed authorization excludes malformed receipt contents and HTTP bodies from public errors and diagnostics', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  const p = authorizationFailureFixture(f), canary = 'privateFailedAuthorizationCanary12345';
  p.files.set('release-outcome-0001.json', Buffer.from(`{"private":"${canary}`));
  p.sealReceipts();
  await assert.rejects(proveFailedAuthorization(p.item, f.artifact, p.io, AbortSignal.timeout(30000)), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /authorization-receipt-json/);
    assert.equal(error.message.includes(canary), false);
    return true;
  });
  const lines: string[] = [];
  for (const method of ['info', 'error'] as const) t.mock.method(console, method, (...args: unknown[]) => lines.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(f.root, 'authorization-redaction'), { scope: 'release' });
  const signal = AbortSignal.timeout(30000);
  const diagnostics = new ReleaseDiagnostics(p.h.request, join(f.root, 'authorization-outcome'), signal, trace);
  let posts = 0, failures = 0;
  const transport: typeof fetch = async (raw: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init?.method === 'POST') { posts++; throw new Error('Unexpected reservation'); }
    const url = new URL(String(raw)), path = url.pathname.replace(`/repos/${repository}`, '') + url.search;
    if (url.pathname.endsWith('/deployments')) return Response.json([p.entry, ...p.h.records.slice(1)]);
    if (path === '/deployments/899/statuses?per_page=1') return Response.json([p.statuses[0]]);
    if (path === '/actions/runs/121') { failures++; return new Response(canary, { status: 403 }); }
    if (Object.hasOwn(p.values, path)) return Response.json(await p.io.read(path));
    return p.h.transport(raw, init);
  };
  const provider = createProvider(f.artifact, p.h.run, p.h.schema, p.h.credentials, signal, transport, diagnostics);
  await assert.rejects(provider.reserve());
  assert.equal(posts, 0); assert.equal(failures, 1);
  const text = lines.join('\n');
  assert.match(text, /github.http-status/);
  for (const secret of [canary, ...Object.values(p.h.credentials)]) assert.equal(text.includes(secret), false);
});

test('durable remote history blocks every unresolved outcome, including absent status, before POST', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const prior of [[], [{ state: 'in_progress' }], [{ state: 'error' }], [{ state: 'failure' }], [{ state: 'inactive' }]]) {
    let posts = 0;
    const transport: typeof fetch = async (url, init) => {
      if (init?.method === 'POST') { posts++; throw new Error('unexpected POST'); }
      return Response.json(String(url).includes('/statuses') ? prior : [{ id: 44, task: 'deploy:esty-be-ci', environment: 'be-production' }]);
    };
    const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
    await assert.rejects(provider.reserve(), /unresolved/); assert.equal(posts, 0);
  }
});
test('historical handoff follows a successful typed successor instead of requiring the old D2 alias forever', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  const h = historicalProviderFixture(f.artifact), before = structuredClone(h.records);
  const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, AbortSignal.timeout(10000), h.transport);
  assert.equal(await provider.reserve(), 44);
  assert.deepEqual(h.reservation()?.payload.historicalHandoff, { version: 1, evidenceDigest: historicalHandoffDigest,
    predecessorRecord: 900, predecessor: { id: 'dpl_previous', revision: h.prior.controller.revision, tree: h.prior.controller.tree,
      artifactDigest: h.prior.artifactDigest, sourceDigest: h.prior.sourceDigest, configDigest: h.prior.configDigest } });
  assert.equal(h.reservation()?.payload.requestDigest, sha256(canonical(h.request)));
  assert.deepEqual(h.reservation()?.payload.releaseRequest, h.request);
  assert.deepEqual(h.records, before);
  await assert.rejects(provider.reserve());
  assert.equal(h.events.filter(event => event === 'reserve').length, 1);
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
});

test('historical handoff rejects forged disposition, missing evidence, drift and concurrent claims before POST', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const fault of ['missing-failed', 'duplicate', 'unknown', 'concurrent', 'replay', 'marker-digest', 'marker-fork',
    'request-tamper', 'schema', 'record-drift', 'unresolved-successor', 'missing-ack', 'status-drift', 'forged-status',
    'source', 'artifact', 'alias', 'alias-drift', 'runtime', 'main']) {
    await t.test(fault, async () => {
      const h = historicalProviderFixture(f.artifact, fault);
      const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, AbortSignal.timeout(10000), h.transport);
      await assert.rejects(provider.reserve());
      assert.equal(h.reservation(), undefined, `${fault} must not reserve`);
      assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
      assert.equal(h.events.includes('reserve'), false);
    });
  }
});

test('historical handoff diagnostics retain both prior identities and the first failed predicate without effects', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  const h = historicalProviderFixture(f.artifact, 'artifact'), logs: string[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args.join(' ')));
  const signal = AbortSignal.timeout(10000);
  const trace = new ChecksDiagnostics(join(f.root, 'historical-diagnostics'), { scope: 'release' });
  const diagnostics = new ReleaseDiagnostics(h.request, join(f.root, 'historical-outcomes'), signal, trace);
  const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, signal, h.transport, diagnostics);
  await assert.rejects(provider.reserve());
  const rows = logs.map(line => JSON.parse(line) as {
    check?: string; status?: string; reason?: string; values?: { actualId?: string }; firstFailure?: string | null;
  });
  for (const [id, state] of [['7703208254', 'in_progress'], ['7686732071', 'error']]) {
    assert.ok(rows.some(row => row.check === 'reservation.prior-record' && row.values?.actualId === id && row.reason === `prior-${state}`));
  }
  const failures = rows.filter(row => row.status === 'failed');
  assert.equal(failures[0]?.check, 'reservation.predecessor-identity');
  assert.ok(failures.every(row => row.firstFailure === 'reservation.predecessor-identity'));
  assert.equal(h.reservation(), undefined);
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  for (const credential of Object.values(h.credentials)) assert.equal(logs.join('\n').includes(credential), false);
});

test('historical GitHub refusal retains endpoint and first failure before POST even when diagnostic storage or console fails', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const fault of ['none', 'storage', 'console']) await t.test(fault, async st => {
    const h = historicalProviderFixture(f.artifact), logs: string[] = [];
    st.mock.method(globalThis, 'fetch', async () => { throw new Error('Real network denied.'); });
    for (const method of ['info', 'error'] as const) st.mock.method(console, method, (...args: unknown[]) => {
      if (fault === 'console') throw new Error('privateConsoleCanary12345');
      logs.push(args.join(' '));
    });
    const signal = new AbortController().signal, directory = join(f.root, `historical-io-${fault}`);
    const trace = new ChecksDiagnostics(directory, { scope: 'release', correlation: 'historical-io' });
    const diagnostics = new ReleaseDiagnostics(h.request, join(f.root, `outcomes-${fault}`), signal, trace);
    if (fault === 'storage') for (const method of ['writeFileSync', 'appendFileSync'] as const) {
      const original = fs[method];
      st.mock.method(fs, method, (...args: unknown[]) => {
        if (String(args[0]).startsWith(directory)) throw new Error('privateStorageCanary12345');
        return Reflect.apply(original, fs, args);
      });
    }
    let posts = 0, historicalReads = 0;
    const transport: typeof fetch = async (raw, init) => {
      if (init?.method === 'POST') { posts++; throw new Error('Unexpected POST.'); }
      const url = new URL(String(raw));
      if (url.pathname.endsWith('/deployments')) return Response.json(h.records.slice(1));
      if (url.pathname.endsWith(`/releases/tags/${retainedHistoricalArchive.tag}`)) {
        historicalReads++; return new Response('privateBodyCanary12345', { status: 403 });
      }
      return h.transport(raw, init);
    };
    const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, signal, transport, diagnostics);
    let primary: unknown;
    await assert.rejects(provider.reserve(), error => { primary = error; return true; });
    const first = diagnostics.capture(primary);
    assert.equal(diagnostics.capture(new Error('later cleanup')), first);
    const outcome = diagnostics.failure(primary);
    assert.equal(outcome.stage, 'reserve'); assert.equal(outcome.category, 'unresolved-prior'); assert.equal(outcome.status, 'refused');
    assert.deepEqual(outcome.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' });
    assert.equal(outcome.deploymentId, null); assert.equal(posts, 0); assert.equal(historicalReads, 1);
    assert.equal(h.reservation(), undefined); assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
    const text = fault === 'console' ? await readFile(join(directory, 'historical-io-events.jsonl'), 'utf8') : logs.join('\n');
    const rows = text.trim().split('\n').map(line => JSON.parse(line)), failures = rows.filter(row => row.status === 'failed');
    assert.equal(failures[0].check, 'github.http-status');
    assert.deepEqual(failures[0].values, { route: 'release-metadata', actual: 403,
      expected: 200, redirected: false, bodyPresent: true });
    assert.ok(failures.every(row => row.firstFailure === 'github.http-status'));
    assert.ok(rows.some(row => row.check === 'github.request' && row.status === 'started' && row.values.route === 'release-metadata'));
    assert.match(text, /activation-retained\.mjs:\d+:\d+/); assert.match(text, /historical-release\.js:\d+:\d+/);
    if (fault === 'storage') assert.match(text, /diagnostics-write-failed/);
    for (const credential of Object.values(h.credentials)) assert.equal(text.includes(credential), false);
    assert.doesNotMatch(text, /private(?:Body|Storage|Console)Canary12345|https:\/\/|Authorization/);
  });
});

test('historical evidence digest is part of independent request admission, not caller-selected exception authority', () => {
  const request = { ...releaseRequest(), historicalHandoffDigest: '0'.repeat(64) };
  assert.throws(() => validateReleaseRequest(request, releaseApproval(request)));
});

test('historical final acceptance verifies the selected real receipt under current main without weakening ordinary final proof', async () => {
  const current = { revision: 'e'.repeat(40), tree: 'f'.repeat(40) }, f = historicalProofFixture(current);
  const read = f.io.read; let protectedReads = 0;
  f.io.read = async path => {
    if (path.startsWith('/environments/')) { protectedReads++; throw new Error('Protected resource unavailable to the job token.'); }
    return read(path);
  };
  const observed = await verifyHistoricalFinalAcceptance(current, f.io, AbortSignal.timeout(10000));
  assert.deepEqual(observed, { version: 1, kind: 'historical-final-acceptance', recordId: historicalReleaseEvidence.accepted.id,
    outcomeHash: historicalReleaseEvidence.appEvents[6].sha256, proof: f.proof });
  assert.equal(observed.proof.binding.candidate, heldD2.candidate);
  assert.equal(observed.proof.checks.authMembership, 'not-proved'); assert.equal(protectedReads, 0);
  f.main.sha = f.proof.binding.workflowRevision;
  await assert.rejects(verifyHeldAppAcceptance(f.proof.workflowRun, f.target, f.io, f.proof.sourceDigests,
    AbortSignal.timeout(10000), f.proof.gate));
  assert.equal(protectedReads, 1);
});

test('historical final acceptance rejects missing, altered, stale and racing independent evidence', async t => {
  for (const fault of ['missing-archive', 'expired', 'receipt', 'artifact-id', 'rerun', 'failed-run', 'source', 'pin',
    'remote-record', 'remote-commitment', 'publication', 'revision', 'tree', 'main-race', 'artifact-race', 'status-race', 'record-race']) {
    await t.test(fault, async () => {
      const current = { revision: 'e'.repeat(40), tree: 'f'.repeat(40) }, f = historicalProofFixture(current);
      const artifact = f.listing.artifacts[0]; assert.ok(artifact);
      if (fault === 'missing-archive') f.archives.delete(f.proof.artifactId);
      if (fault === 'expired') artifact.expired = true;
      if (fault === 'receipt') f.archives.set(f.proof.artifactId, Buffer.from('untrusted replacement'));
      if (fault === 'artifact-id') {
        artifact.id = 999; f.archives.set(999, f.archives.get(f.proof.artifactId)!);
      }
      if (fault === 'rerun') f.finalRun.run_attempt = 2;
      if (fault === 'failed-run') f.finalRun.conclusion = 'failure';
      if (fault === 'source') f.setSource('.github/workflows/be-candidate-probe.yml', Buffer.from('different source'));
      if (fault === 'pin') f.setSource(heldPinPath, Buffer.from('{}'));
      if (fault === 'remote-record') f.values[f.entryPath] = { ...f.records[0]!.entry, sha: '0'.repeat(40) };
      if (fault === 'remote-commitment') f.values[f.statusPath] = [{ ...f.records[0]!.status, description: 'activation:app:outcome:' + '0'.repeat(64) }];
      if (fault === 'publication') f.values[`/commits/${f.proof.binding.workflowRevision}`] = {
        sha: f.proof.binding.workflowRevision, commit: { tree: { sha: '0'.repeat(40) } } };
      if (fault === 'revision') f.main.sha = '0'.repeat(40);
      if (fault === 'tree') f.main.commit.tree.sha = '0'.repeat(40);
      if (['main-race', 'artifact-race', 'status-race', 'record-race'].includes(fault)) {
        const read = f.io.read; let observations = 0;
        const watched = fault === 'main-race' ? '/commits/main' : fault === 'status-race' ? f.statusPath
          : fault === 'record-race' ? f.entryPath : `/actions/runs/${f.proof.workflowRun}/artifacts?per_page=100`;
        f.io.read = async path => {
          if (path === watched && ++observations === 2) {
            if (fault === 'main-race') f.main.sha = '0'.repeat(40);
            else if (fault === 'status-race') f.values[f.statusPath] = [{ ...f.records[0]!.status, state: 'error' }];
            else if (fault === 'record-race') f.values[f.entryPath] = { ...f.records[0]!.entry, sha: '0'.repeat(40) };
            else artifact.expired = true;
          }
          return read(path);
        };
      }
      await assert.rejects(verifyHistoricalFinalAcceptance(current, f.io, AbortSignal.timeout(10000)));
    });
  }
});

test('historical archive admission never falls back to the expired Actions download capability', async t => {
  const f = await strictReleaseFixture(undefined, undefined, retainedActivation.target); t.after(f.dispose);
  const p = historicalProofFixture(f.request.controller);
  await assert.rejects(proveHistoricalHandoff(p.records, f.request, p.io, new AbortController().signal));
  assert.equal(p.reads.at(-1), `/actions/runs/${retainedActivation.runId}/jobs?filter=all&per_page=100`);
  assert.deepEqual(p.downloads, []);
  assert.equal(p.reads.some(path => path.startsWith('/actions/artifacts/') || path.startsWith('/environments/')), false);
});

test('historical acceptance refuses forged fixed preimages before any remote read', async t => {
  const mutations: Array<[object, string, unknown]> = [
    [historicalReleaseEvidence.appEvents[6], 'previousHash', '0'.repeat(64)],
    [historicalReleaseEvidence.finalAccepted.proof.gate, 'stage', 'candidate'],
    [historicalReleaseEvidence, 'promotionAck', '{}'],
  ];
  for (const [target, key, value] of mutations) await t.test(key, async () => {
    const previous = Reflect.get(target, key), current = { revision: 'e'.repeat(40), tree: 'f'.repeat(40) };
    const f = historicalProofFixture(current);
    try {
      Reflect.set(target, key, value);
      await assert.rejects(verifyHistoricalFinalAcceptance(current, f.io, new AbortController().signal));
      assert.deepEqual(f.reads, []); assert.deepEqual(f.downloads, []);
    } finally { Reflect.set(target, key, previous); }
  });
});

test('historical Release retention rejects invalid publication source asset and bytes before reservation POST', async t => {
  const f = await strictReleaseFixture(undefined, undefined, retainedActivation.target); t.after(f.dispose);
  const request = structuredClone(f.request); assert.ok(request.migration);
  request.migration.predecessor = { id: heldD2.candidate, revision: heldAppPolicy.revision,
    artifactDigest: heldAppPolicy.artifactDigest, configDigest: heldD2.configDigest };
  const faults = ['missing-release', 'draft', 'prerelease', 'unpublished', 'future', 'tag', 'target', 'target-old-sha', 'target-ref', 'foreign-release',
    'missing-asset', 'duplicate-asset', 'asset-name', 'asset-state', 'asset-type', 'asset-size', 'asset-hash', 'foreign-asset', 'browser-url',
    'tag-target', 'tag-type', 'tag-ref', 'tag-url', 'source', 'source-main', 'producer-id', 'producer-attempt', 'producer-state', 'producer-source',
    'producer-repository', 'checks-missing', 'checks-duplicate', 'checks-failed', 'checks-source', 'checks-attempt',
    'missing-bytes', 'short-bytes', 'oversized-bytes', 'wrong-bytes'];
  for (const fault of faults) await t.test(fault, async st => {
    let realNetwork = 0, posts = 0, downloads = 0, protectedReads = 0;
    st.mock.method(globalThis, 'fetch', async () => { realNetwork++; throw new Error('Real network denied.'); });
    const p = historicalProofFixture(request.controller), h = historicalProviderFixture(f.artifact);
    const asset = p.release.assets[0]!; let expectedLast = p.releasePath;
    const sourcePath = `/commits/${retainedActivation.revision}`, producerPath = `/actions/runs/${retainedActivation.runId}`;
    const jobsPath = `${producerPath}/jobs?filter=all&per_page=100`, downloadPath = `/releases/assets/${asset.id}`;
    if (fault === 'draft') p.release.draft = true;
    if (fault === 'prerelease') p.release.prerelease = true;
    if (fault === 'unpublished') Reflect.set(p.release, 'published_at', null);
    if (fault === 'future') p.release.published_at = new Date(Date.now() + 60000).toISOString();
    if (fault === 'tag') Reflect.set(p.release, 'tag_name', 'caller-selected-tag');
    if (fault === 'target') Reflect.set(p.release, 'target_commitish', 'foreign-branch');
    if (fault === 'target-old-sha') Reflect.set(p.release, 'target_commitish', retainedActivation.revision);
    if (fault === 'target-ref') Reflect.set(p.release, 'target_commitish', 'refs/heads/main');
    if (fault === 'foreign-release') p.release.url = p.release.url.replace(repository, 'foreign/repository');
    if (fault === 'missing-asset') p.release.assets = [];
    if (fault === 'duplicate-asset') p.release.assets.push({ ...asset, id: 9002 });
    if (fault === 'asset-name') Reflect.set(asset, 'name', 'caller-selected.zip');
    if (fault === 'asset-state') asset.state = 'open';
    if (fault === 'asset-type') asset.content_type = 'application/json';
    if (fault === 'asset-size') asset.size--;
    if (fault === 'asset-hash') asset.digest = `sha256:${'0'.repeat(64)}`;
    if (fault === 'foreign-asset') asset.url = asset.url.replace(repository, 'foreign/repository');
    if (fault === 'browser-url') asset.browser_download_url += '?caller=untrusted';
    if (fault.startsWith('tag-')) expectedLast = p.tagPath;
    if (fault === 'tag-target') Reflect.set(p.tag.object, 'sha', request.controller.revision);
    if (fault === 'tag-type') p.tag.object.type = 'tag';
    if (fault === 'tag-ref') p.tag.ref = 'refs/tags/caller-selected-tag';
    if (fault === 'tag-url') p.tag.url = p.tag.url.replace(repository, 'foreign/repository');
    if (fault === 'source') { expectedLast = sourcePath; p.values[sourcePath] = { sha: retainedActivation.revision, commit: { tree: { sha: '0'.repeat(40) } } }; }
    if (fault === 'source-main') { expectedLast = sourcePath; p.values[sourcePath] = { sha: request.controller.revision, commit: { tree: { sha: request.controller.tree } } }; }
    if (fault.startsWith('producer-')) expectedLast = producerPath;
    if (fault === 'producer-id') p.producer.id++;
    if (fault === 'producer-attempt') p.producer.run_attempt = 2;
    if (fault === 'producer-state') p.producer.status = 'in_progress';
    if (fault === 'producer-source') Reflect.set(p.producer, 'head_sha', '0'.repeat(40));
    if (fault === 'producer-repository') Reflect.set(p.producer.repository, 'full_name', 'foreign/repository');
    if (fault.startsWith('checks-')) expectedLast = jobsPath;
    if (fault === 'checks-missing') { p.jobs.jobs = []; p.jobs.total_count = 0; }
    if (fault === 'checks-duplicate') { p.jobs.jobs.push({ ...p.jobs.jobs[0]! }); p.jobs.total_count = 2; }
    if (fault === 'checks-failed') p.jobs.jobs[0]!.conclusion = 'failure';
    if (fault === 'checks-source') Reflect.set(p.jobs.jobs[0]!, 'head_sha', '0'.repeat(40));
    if (fault === 'checks-attempt') p.jobs.jobs[0]!.run_attempt = 2;
    if (fault.endsWith('-bytes')) expectedLast = downloadPath;
    const expired = { ...(p.values['/actions/artifacts/13587251015'] as object), expired: true };
    p.values['/actions/artifacts/13587251015'] = expired;
    const reads: string[] = [];
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw)), path = url.pathname.slice(`/repos/${repository}`.length) + url.search;
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${h.credentials.github}`);
      if (init?.method === 'POST') { posts++; throw new Error('Reservation POST denied.'); }
      reads.push(path);
      if (path.startsWith('/environments/')) { protectedReads++; throw new Error('Protected environment GET denied.'); }
      if (path.startsWith('/deployments?')) return Response.json(p.records.map(item => item.entry));
      if (fault === 'missing-release' && path === p.releasePath) return new Response(null, { status: 404 });
      if (path === downloadPath) {
        downloads++;
        assert.equal(new Headers(init?.headers).get('accept'), 'application/octet-stream');
        return new Response(fault === 'missing-bytes' ? null : fault === 'short-bytes' ? Buffer.from('short')
          : Buffer.alloc(retainedHistoricalArchive.size + (fault === 'oversized-bytes' ? 1 : 0)),
        { status: fault === 'missing-bytes' ? 404 : 200 });
      }
      if (Object.hasOwn(p.values, path)) return Response.json(p.values[path]);
      return h.transport(raw, init);
    };
    const schema = { ...h.schema, request, requestDigest: sha256(canonical(request)), strictPacketDigest: request.migration!.packetDigest };
    await assert.rejects(createProvider(f.artifact, h.run, schema, h.credentials, new AbortController().signal, transport).reserve());
    assert.equal(reads.at(-1), expectedLast); assert.equal(downloads, fault.endsWith('-bytes') ? 1 : 0);
    assert.equal(posts, 0); assert.equal(realNetwork, 0); assert.equal(protectedReads, 0);
    assert.equal(expired.expired, true); assert.equal(reads.some(path => path.startsWith('/actions/artifacts/13587251015')), false);
    assert.deepEqual(h.counts(), { creates: 0, promotions: 0 }); assert.equal(h.reservation(), undefined);
  });
});

test('historical Release readback rejects identity content and descriptive drift but accepts download counters', async t => {
  for (const fault of ['release-id', 'publication-target', 'release-description', 'asset-id', 'asset-digest', 'asset-description', 'download-count']) {
    await t.test(fault, async () => {
      const p = historicalProofFixture({ revision: 'e'.repeat(40), tree: 'f'.repeat(40) });
      const asset = p.release.assets[0]!;
      Reflect.set(p.release, 'body', 'Original release description');
      Reflect.set(asset, 'label', 'Original asset label');
      const { proofIo, recheck } = historicalMetadataReadback(p.io, new AbortController().signal);
      await proofIo.read(p.releasePath); await proofIo.read('/commits/main');
      await recheck();
      assert.deepEqual(p.reads, [p.releasePath, '/commits/main', p.releasePath, '/commits/main']);
      if (fault === 'release-id') p.release.id++;
      if (fault === 'publication-target') Reflect.set(p.release, 'target_commitish', retainedActivation.revision);
      if (fault === 'release-description') Reflect.set(p.release, 'body', 'Changed after admission');
      if (fault === 'asset-id') asset.id++;
      if (fault === 'asset-digest') asset.digest = `sha256:${'0'.repeat(64)}`;
      if (fault === 'asset-description') Reflect.set(asset, 'label', 'Changed after admission');
      if (fault === 'download-count') asset.download_count++;
      if (fault === 'download-count') {
        await recheck();
        assert.deepEqual(p.reads.slice(4), [p.releasePath, '/commits/main']);
      } else {
        await assert.rejects(recheck(), /proof-metadata-stable/);
        assert.deepEqual(p.reads.slice(4), [p.releasePath], 'Drift must stop before the next snapshot read.');
        await assert.rejects(recheck(), /proof-metadata-stable/, 'A rejected snapshot must not become the new baseline.');
      }
      assert.deepEqual(p.downloads, []);
    });
  }
});

test('historical Release readback preserves unique asset and cancellation boundaries', async t => {
  for (const fault of ['missing-asset', 'duplicate-asset', 'abort-before-read', 'abort-before-recheck']) {
    await t.test(fault, async () => {
      const p = historicalProofFixture({ revision: 'e'.repeat(40), tree: 'f'.repeat(40) }), controller = new AbortController();
      const { proofIo, recheck } = historicalMetadataReadback(p.io, controller.signal);
      const cancelled = new Error('Synthetic readback cancellation');
      if (fault === 'abort-before-read') {
        controller.abort(cancelled);
        await assert.rejects(proofIo.read(p.releasePath), cause => cause === cancelled);
        assert.deepEqual(p.reads, []);
        return;
      }
      await proofIo.read(p.releasePath);
      if (fault === 'abort-before-recheck') {
        controller.abort(cancelled);
        await assert.rejects(recheck(), cause => cause === cancelled);
        assert.deepEqual(p.reads, [p.releasePath]);
      } else {
        if (fault === 'missing-asset') p.release.assets = [];
        else p.release.assets.push({ ...p.release.assets[0]! });
        await assert.rejects(recheck(), /retention-unique-asset/);
        assert.deepEqual(p.reads, [p.releasePath, p.releasePath]);
      }
      assert.deepEqual(p.downloads, []);
    });
  }
});

test('historical readback fences consumed-lineage reservation before POST and preserves replay refusal', async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime), true); t.after(f.dispose);
  for (const fault of ['unchanged', 'changed-at-recheck']) await t.test(fault, async st => {
    const h = historicalProviderFixture(f.artifact);
    let historyReads = 0, posts = 0, realNetwork = 0, archiveReads = 0;
    st.mock.method(globalThis, 'fetch', async () => { realNetwork++; throw new Error('Real network denied.'); });
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw));
      if (url.pathname.includes('/releases/') || url.pathname.includes('/actions/artifacts/')) {
        archiveReads++; throw new Error('Consumed lineage must not reopen archival admission.');
      }
      if (init?.method === 'POST') {
        posts++;
        assert.equal(historyReads, 2, 'Final metadata recheck must finish before a reservation POST.');
      }
      const response = await h.transport(raw, init);
      if (url.pathname.endsWith('/deployments/900/statuses') && url.searchParams.get('per_page') === '100') {
        historyReads++;
        const statuses: unknown = await response.json();
        assert.ok(Array.isArray(statuses));
        const ack: unknown = statuses[1];
        assert.ok(ack && typeof ack === 'object' && 'description' in ack);
        if (fault === 'changed-at-recheck' && historyReads === 2) ack.description = 'ack:dpl_changed';
        return Response.json(statuses);
      }
      return response;
    };
    const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, AbortSignal.timeout(10000), transport);
    if (fault === 'changed-at-recheck') {
      await assert.rejects(provider.reserve(), /proof-metadata-stable/);
      assert.equal(posts, 0); assert.equal(h.reservation(), undefined);
      assert.equal(h.events.includes('reserve'), false);
    } else {
      assert.equal(await provider.reserve(), 44);
      assert.equal(posts, 1);
      const marker = h.reservation()!.payload.historicalHandoff;
      assert.ok(marker && typeof marker === 'object' && 'predecessorRecord' in marker);
      assert.equal(marker.predecessorRecord, 900);
      await assert.rejects(provider.reserve(), /already has a durable reservation/);
      assert.equal(posts, 1);
    }
    assert.equal(historyReads, 2); assert.equal(realNetwork, 0); assert.equal(archiveReads, 0);
    assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  });
});

test('historical Release binary transport keeps one deadline exact redirect hosts and safe failure diagnostics', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-release-download-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const fault of ['401', '403', '404', '429', '500', 'followed', 'missing-location', 'invalid-location',
    'foreign-host', 'subdomain', 'http', 'userinfo', 'port', 'fragment', 'second-redirect', 'binary-200-size',
    'binary-302-size', 'transport-timeout', 'body-failure', 'body-timeout', 'wrong-hash']) await t.test(fault, async st => {
    const output: string[] = [], authorizations: Array<string | null> = [], signals: Array<AbortSignal | null | undefined> = [];
    for (const method of ['info', 'error'] as const) st.mock.method(console, method, (...args: unknown[]) => output.push(args.join(' ')));
    const trace = new ChecksDiagnostics(join(root, fault), { scope: 'release' });
    if (fault.endsWith('timeout')) st.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('privateTimeoutCanary12345', 'TimeoutError')));
    let calls = 0;
    const io = manualGithubIo('privateCredentialCanary12345', new AbortController().signal, async (_raw, init) => {
      calls++; authorizations.push(new Headers(init?.headers).get('authorization')); signals.push(init?.signal);
      if (fault === 'transport-timeout') init?.signal?.throwIfAborted();
      if (fault.startsWith('body-')) return new Response(new ReadableStream({ start(controller) { controller.error(new Error('privateBodyCanary12345')); } }));
      if (fault === 'wrong-hash') return new Response(Buffer.alloc(retainedHistoricalArchive.size));
      if (fault === 'binary-200-size') return new Response('short');
      if (calls === 2) {
        assert.equal(init?.redirect, 'error'); assert.equal(authorizations[1], null); assert.equal(signals[1], signals[0]);
        return fault === 'second-redirect' ? new Response(null, { status: 302, headers: { location: 'https://privateHostCanary12345.invalid' } }) : new Response('short');
      }
      assert.equal(init?.redirect, 'manual');
      let location = 'https://release-assets.githubusercontent.com/privatePathCanary12345?sig=privateSignatureCanary12345';
      if (fault === 'invalid-location') location = 'privateLocationCanary12345';
      if (fault === 'foreign-host') location = 'https://privateHostCanary12345.blob.core.windows.net/file';
      if (fault === 'subdomain') location = location.replace('release-assets.', 'privateSubdomainCanary12345.release-assets.');
      if (fault === 'http') location = location.replace('https:', 'http:');
      if (fault === 'userinfo') location = location.replace('https://', 'https://privateUserCanary12345:password@');
      if (fault === 'port') location = location.replace('.com/', '.com:8443/');
      if (fault === 'fragment') location += '#privateFragmentCanary12345';
      const response = new Response(null, { status: /^\d+$/.test(fault) ? Number(fault) : 302,
        headers: fault === 'missing-location' ? {} : { location } });
      if (fault === 'followed') Object.defineProperty(response, 'redirected', { value: true });
      return response;
    }, trace);
    await assert.rejects(io.downloadReleaseAsset(9001));
    assert.equal(authorizations[0], 'Bearer privateCredentialCanary12345');
    const failures = output.map(line => JSON.parse(line)).filter(row => row.status === 'failed');
    const expected = /^\d+$/.test(fault) || fault === 'followed' ? 'github.release-status'
      : fault.endsWith('location') ? 'github.download-location'
      : ['foreign-host', 'subdomain', 'http', 'userinfo', 'port', 'fragment'].includes(fault) ? 'github.download-host'
      : fault === 'second-redirect' ? 'github.download-status' : fault.startsWith('binary-') ? 'github.release-size'
      : fault === 'transport-timeout' ? 'github.download-transport' : fault.startsWith('body-') ? 'github.download-body' : 'github.release-hash';
    assert.equal(failures[0].check, expected); assert.ok(failures.every(row => row.firstFailure === expected));
    assert.equal(calls, ['second-redirect', 'binary-302-size'].includes(fault) ? 2 : 1);
    assert.doesNotMatch(output.join('\n'), /private\w*Canary12345|https?:\/\/|Authorization|sig=/);
  });
});

test('successful durable reservation uses exact commit, no auto-merge and no secret payload', async t => {
  const f = await fixture(); t.after(f.dispose); let posted: Record<string, any> | undefined;
  const transport: typeof fetch = async (_url, init) => {
    if (init?.method !== 'POST') return Response.json([]);
    posted = JSON.parse(String(init.body));
    return Response.json({ id: 45, sha: run.revision, task: 'deploy:esty-be-ci', environment: 'be-production' }, { status: 201 });
  };
  const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
  assert.equal(await provider.reserve(), 45);
  assert.equal(posted?.ref, run.revision); assert.equal(posted?.auto_merge, false); assert.equal(posted?.payload.artifact, f.artifact.digest);
  for (const value of Object.values(credentials)) assert.equal(JSON.stringify(posted).includes(value), false);
});
test('candidate metadata rejects source, owner, region and Git rebuild mismatches', async t => {
  const f = await fixture(); t.after(f.dispose);
  const valid = { id: 'dpl_candidate', projectId: f.artifact.manifest.target.project, ownerId: f.artifact.manifest.target.owner,
    target: 'production', readyState: 'READY', url: 'synthetic.vercel.app', regions: ['icn1'],
    meta: { sourceCommit: run.revision, artifactSha256: f.artifact.digest, sourceDigest: f.artifact.manifest.source.digest } };
  for (const change of [{ regions: ['iad1'] }, { ownerId: 'other' }, { gitSource: { ref: 'main' } }, { meta: {} },
    { url: 'other.example' }, { readyState: 'ERROR' }]) {
    const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), async () => Response.json({ ...valid, ...change }));
    await assert.rejects(provider.inspect('dpl_candidate'));
  }
});
test('candidate bypass is header-only and cannot mask final custom-domain application protection', async t => {
  const f = await fixture(); t.after(f.dispose); const observed: Array<{ url: string; headers: Headers }> = [];
  const transport: typeof fetch = async (raw, init) => {
    const url = String(raw), headers = new Headers(init?.headers); observed.push({ url, headers });
    if (init?.method === 'OPTIONS') return headers.get('origin') === 'https://app.lovora.us'
      ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://app.lovora.us' } })
      : Response.json({ status: 'unauthorized' }, { status: 401 });
    if (headers.get('authorization') !== `Bearer ${credentials.bearer}`) return Response.json({ status: 'unauthorized' }, { status: 401 });
    if (url.endsWith('/health/live')) return Response.json({ status: 'ok' }, { headers: { 'x-activation-config-digest': oldSchema.configDigest } });
    if (url.endsWith('/health/ready')) return Response.json({ status: 'ready', database: 'up', migrations: 'current' },
      { headers: { 'x-activation-config-digest': oldSchema.configDigest } });
    return new Response(null, { status: 404 });
  };
  const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
  await provider.http('https://synthetic.vercel.app', true); await provider.http('https://api.lovora.us', false);
  assert.equal(observed.length, 16);
  assert.ok(observed.slice(0, 8).every(row => row.headers.get('x-vercel-protection-bypass') === credentials.bypass));
  assert.ok(observed.slice(8).every(row => !row.headers.has('x-vercel-protection-bypass')));
  assert.ok(observed.every(row => !row.url.includes(credentials.bypass) && row.headers.get('authorization') !== `Bearer ${credentials.vercel}`));
  await assert.rejects(checkHostedHttp('https://synthetic.vercel.app', 'https://app.lovora.us', credentials.bearer,
    async () => Response.json({ status: 'ready', database: 'down', migrations: 'pending' })), /contract differs/);
});

test('provider archive attestation requires every exact file and canonical namespace metadata', async t => {
  const f = await fixture(); t.after(f.dispose);
  const records = f.artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/'));
  const entries = records.map(file => ({ path: file.path, mode: file.mode, content: readArtifactFile(f.artifact.root, file.path, file) }));
  const cases = ['exact', 'missing', 'changed', 'coerced-mode', 'extra-function', 'wrong-uid', 'bad-base64',
    'raw-exact', 'raw-multipart', 'raw-part-name', 'raw-part-type', 'raw-part-mode', 'raw-directory-mode',
    'raw-root-mode', 'raw-namespace', 'raw-function-mode', 'raw-wrong-uid', 'raw-changed-compressed',
    'raw-runtime-mode', 'raw-changed'];
  for (const scenario of cases) await t.test(scenario, async () => {
    const manual = scenario.startsWith('raw-'), fault = scenario.replace(/^raw-/, '');
    const uploaded = fault === 'missing' ? entries.slice(1) : entries.map((entry, index) =>
      index ? entry : fault === 'changed' ? { ...entry, content: Buffer.from('different') }
        : fault === 'runtime-mode' ? { ...entry, mode: entry.mode === 0o444 ? 0o555 : 0o444 } : entry);
    const bytes = tar(uploaded), uid = createHash('sha1').update(bytes).digest('hex');
    const advertisedUid = fault === 'wrong-uid' ? '0'.repeat(40) : uid;
    const part = { name: fault === 'part-name' ? 'source.tgz.part2' : 'source.tgz.part1',
      type: fault === 'part-type' ? 'file' : 'invalid', mode: fault === 'part-mode' ? 0o644 : 0o666, uid: advertisedUid };
    const roots = [
      { name: 'src', type: 'directory', mode: fault === 'coerced-mode' ? '0x416d' : fault === 'root-mode' ? 0o40777 : 0o40555,
        children: manual ? [{ name: fault === 'namespace' ? 'other' : '.vercel', type: 'directory',
          mode: fault === 'directory-mode' ? 0o40777 : 0o40555,
          children: [part, ...(fault === 'multipart' ? [{ ...part, name: 'source.tgz.part2' }] : [])] }]
          : [{ name: 'project.tgz', type: 'file', uid: advertisedUid }] },
      { name: 'out', type: 'directory', mode: 0o40555, children: [
        { name: 'index', type: 'lambda', mode: fault === 'function-mode' ? 0o140777 : 0o140666, uid: 'f'.repeat(40) },
        ...(fault === 'extra-function' ? [{ name: 'extra', type: 'lambda', mode: 0o140666 }] : []),
      ] },
    ];
    let contentReads = 0;
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw));
      assert.equal(url.origin, 'https://api.vercel.com');
      assert.equal(init?.method ?? 'GET', 'GET');
      if (url.pathname === '/v6/deployments/dpl_candidate/files') return Response.json(roots);
      assert.equal(url.pathname, `/v8/deployments/dpl_candidate/files/${advertisedUid}`);
      contentReads++;
      return Response.json({ data: fault === 'bad-base64' ? '!!'
        : (fault === 'changed-compressed' ? Buffer.from('changed archive') : bytes).toString('base64') });
    };
    const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
    if (fault === 'exact') await provider.attest('dpl_candidate');
    else await assert.rejects(provider.attest('dpl_candidate'));
    assert.equal(contentReads, ['exact', 'missing', 'changed', 'wrong-uid', 'bad-base64', 'changed-compressed', 'runtime-mode'].includes(fault) ? 1 : 0);
  });
});

test('manual CLI partition attestation preserves exact runtime bytes and rejects unsupported transport evidence', async t => {
  if (historicalActivationChild(t.name)) return;
  const f = await activationArtifact(); t.after(f.dispose);
  const records = f.artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/'));
  const entries = records.map(file => ({ path: file.path, mode: file.mode, content: readArtifactFile(f.artifact.root, file.path, file) }));
  const cases = ['exact', 'missing-part', 'extra-part', 'wrong-part-name', 'wrong-part-type', 'wrong-part-mode',
    'wrong-directory-mode', 'wrong-root-mode', 'extra-root', 'extra-function', 'wrong-uid', 'changed-compressed',
    'missing-runtime-file', 'extra-runtime-file', 'changed-runtime-file', 'bad-base64', 'denied', 'redirected'];
  for (const scenario of cases) await t.test(scenario, async () => {
    let uploaded = entries;
    if (scenario === 'missing-runtime-file') uploaded = entries.slice(1);
    if (scenario === 'extra-runtime-file') uploaded = [...entries, { path: '.vercel/output/extra', mode: 0o444, content: Buffer.from('extra') }];
    if (scenario === 'changed-runtime-file') uploaded = entries.map((entry, index) => index ? entry : { ...entry, content: Buffer.from('changed') });
    const bytes = tar(uploaded), uid = createHash('sha1').update(bytes).digest('hex');
    const part = { name: scenario === 'wrong-part-name' ? 'source.tgz.part2' : 'source.tgz.part1',
      type: scenario === 'wrong-part-type' ? 'file' : 'invalid', mode: scenario === 'wrong-part-mode' ? 0o644 : 0o666,
      uid: scenario === 'wrong-uid' ? '0'.repeat(40) : uid };
    const roots = [
      { name: 'src', type: 'directory', mode: scenario === 'wrong-root-mode' ? 0o40777 : 0o40555,
        children: [{ name: '.vercel', type: 'directory', mode: scenario === 'wrong-directory-mode' ? 0o40777 : 0o40555,
          children: scenario === 'missing-part' ? [] : [part,
            ...(scenario === 'extra-part' ? [{ ...part, name: 'source.tgz.part2' }] : [])] }] },
      { name: 'out', type: 'directory', mode: 0o40555,
        children: [{ name: 'index', type: 'lambda', mode: 0o140666 },
          ...(scenario === 'extra-function' ? [{ name: 'extra', type: 'lambda', mode: 0o140666 }] : [])] },
      ...(scenario === 'extra-root' ? [{ name: 'extra', type: 'directory', mode: 0o40555, children: [] }] : []),
    ];
    let contentReads = 0;
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw));
      assert.equal(url.origin, 'https://api.vercel.com');
      assert.equal(init?.method ?? 'GET', 'GET');
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${credentials.vercel}`);
      if (url.pathname === '/v6/deployments/dpl_candidate/files') {
        if (scenario === 'denied') return Response.json(roots, { status: 403 });
        if (scenario === 'redirected') return Response.redirect('https://untrusted.invalid/files', 302);
        return Response.json(roots);
      }
      assert.equal(url.pathname, `/v8/deployments/dpl_candidate/files/${part.uid}`);
      contentReads++;
      return Response.json({ data: scenario === 'bad-base64' ? '!!'
        : (scenario === 'changed-compressed' ? Buffer.from('changed archive') : bytes).toString('base64') });
    };
    const provider = createActivationProvider(f.artifact, run, credentials, AbortSignal.timeout(10000),
      { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'bridge' }, manualArchiveTransport(transport));
    if (scenario === 'exact') {
      await provider.attest('dpl_candidate');
      assert.equal(contentReads, 1);
    } else {
      await assert.rejects(provider.attest('dpl_candidate'));
      if (!['wrong-uid', 'changed-compressed', 'missing-runtime-file', 'extra-runtime-file',
        'changed-runtime-file', 'bad-base64'].includes(scenario)) assert.equal(contentReads, 0);
    }
  });
});

test('manual archive metadata remains body-bounded before content retrieval', async () => {
  let cancelled = false;
  const transport = manualArchiveTransport(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  })));
  await assert.rejects(transport('https://api.vercel.com/v6/deployments/dpl_candidate/files', {}));
  assert.equal(cancelled, true);
});

function activationPacket(): ActivationPacket {
  return { version: 1, runId: randomUUID(), revision: run.revision, tree: run.tree,
    projectId: artifactTarget.project, scopeId: artifactTarget.owner,
    sourceDigest: sha256('source'), artifactDigest: sha256('artifact'),
    contractDigest: '41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad',
    oldDigest: activationSchema.oldDigest, targetDigest: activationSchema.targetDigest,
    target: 'local', predecessorId: 'dpl_previous', bridgeConfigDigest: sha256('bridge'), appConfigDigest: sha256('app'),
    roleInputDigest: sha256('roles'), migrationInputDigest: sha256('migration'), bootstrapInputDigest: sha256('bootstrap'),
    bootstrapBindingDigest: sha256('bootstrap-binding'), sourceReviewDigest: sha256('review'), testReceiptDigest: sha256('tests'),
    retentionApprovalDigest: sha256('retention'), feRevision: 'f'.repeat(40), feSourceDigest: sha256('fe'),
    feConfigDigest: sha256('fe-config'), migrations: migrationManifest };
}
async function activationJournal(packet = activationPacket()) {
  const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-activation-test-'));
  const digest = sha256(canonical(packet));
  createActivationJournal(directory, packet, digest); reserveActivationJournal(directory, packet, digest, 123);
  return { directory, packet, digest };
}
function authorizeLocal(input: Awaited<ReturnType<typeof activationJournal>>, phase: ActivationPhase) {
  const intent = appendActivationEvent(input.directory, input.packet, input.digest, phase, 'intent', { outcome: 'unknown' });
  appendActivationEvent(input.directory, input.packet, input.digest, phase, 'authorized', { intentHash: intent.head });
}
function configurationReceiptFixture(packet: ActivationPacket, phase: 'bridge-config' | 'app-config'): ActivationConfigurationReceipt {
  return { version: 2, runId: packet.runId, phase, projectId: packet.projectId, scopeId: packet.scopeId,
    packetDigest: sha256(canonical(packet)), revision: packet.revision, tree: packet.tree,
    sourceDigest: packet.sourceDigest, artifactDigest: packet.artifactDigest,
    configDigest: phase === 'bridge-config' ? packet.bridgeConfigDigest : packet.appConfigDigest,
    metadataDigest: sha256(`synthetic-metadata:${phase}`), count: 1, valueProof: 'pending-candidate-runtime' };
}
test('unknown Secret writes stay fenced across restart and cannot be reconciled from metadata', async t => {
  if (historicalActivationChild(t.name)) return;
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  let writes = 0, inspections = 0;
  const effect = async () => { writes++; throw new Error('synthetic private transport uncertainty'); };
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  assert.equal(writes, 0);
  authorizeLocal(input, 'bridge-config');
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  assert.equal(writes, 1);
  const restarted = { ...input };
  await assert.rejects(executeActivationPhase(restarted, 'bridge-config', effect));
  await assert.rejects(executeActivationPhase(restarted, 'roles', effect));
  assert.equal(writes, 1);
  assert.throws(() => finishActivationJournal(input.directory, input.packet, input.digest));
  await assert.rejects(reconcileActivationEffect(restarted, 'bridge-config', async () => {
    inspections++; return { result: 'confirmed', databaseOutcome: 'not_started', count: 10, deploymentId: null, reportDigest: sha256('metadata') };
  }));
  assert.equal(inspections, 0);
  const current = readActivationJournal(input.directory, input.packet, input.digest);
  assert.equal(current.next, 'bridge-config');
  assert.throws(() => appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'confirming', { outcomeHash: current.head }));
  assert.throws(() => appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'reconciled',
    { result: 'confirmed', databaseOutcome: 'not_started', count: 10, deploymentId: null, reportDigest: sha256('metadata') }));
  await assert.rejects(executeActivationPhase(restarted, 'bridge', effect));
  assert.equal(writes, 1);
  assert.equal(readActivationJournal(input.directory, input.packet, input.digest).head, current.head);
  assert.equal(existsSync(join(input.directory, 'operator.lock')), true);
});

test('transferred receipts permit only the untouched FE gate after separately approved inventory and remote confirmation', async t => {
  if (historicalActivationChild(t.name)) return;
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  const parent = await mkdtemp(join(realpathSync(tmpdir()), 'esty-activation-import-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  for (const phase of activationPhases.filter(value => value !== 'fe')) {
    authorizeLocal(input, phase);
    appendActivationEvent(input.directory, input.packet, input.digest, phase, 'started', { outcome: 'unknown' });
    const deploymentId = phase === 'bridge' || phase === 'app' ? `dpl_${phase}` : null;
    if (deploymentId) {
      appendActivationEvent(input.directory, input.packet, input.digest, phase, 'acknowledged', { deploymentId });
      appendActivationEvent(input.directory, input.packet, input.digest, phase, 'candidate-attested',
        { deploymentId, configDigest: phase === 'bridge' ? input.packet.bridgeConfigDigest : input.packet.appConfigDigest });
      appendActivationEvent(input.directory, input.packet, input.digest, phase, 'promotion-intent', { deploymentId });
    }
    const result = phase === 'bridge-config' || phase === 'app-config'
      ? saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, phase, configurationReceiptFixture(input.packet, phase))
      : { result: 'confirmed' as const, databaseOutcome: ['roles', 'migration', 'bootstrap'].includes(phase) ? 'committed' : 'not_started',
        count: phase === 'roles' || phase === 'migration' ? 2 : 1, deploymentId, reportDigest: sha256(phase) };
    const completed = appendActivationEvent(input.directory, input.packet, input.digest, phase, 'outcome', result);
    appendActivationEvent(input.directory, input.packet, input.digest, phase, 'confirming', { outcomeHash: completed.head });
    appendActivationEvent(input.directory, input.packet, input.digest, phase, 'remote-confirmed', { outcomeHash: completed.head });
  }
  for (const proof of ['initial', 'postflight']) writeReleaseEvidence(join(input.directory, `${input.packet.runId}.${proof}.json`), { proof });
  const transferred = join(parent, 'transferred'); await cp(input.directory, transferred, { recursive: true });
  assert.throws(() => readActivationJournal(transferred, input.packet, input.digest));
  const approved = sha256(canonical(inventory(transferred))), destination = join(parent, 'imported');
  let confirmed = 0;
  await assert.rejects(importFrontendJournal(transferred, destination, input.packet, input.digest, sha256('wrong'),
    async () => { confirmed++; }));
  assert.equal(confirmed, 0); assert.equal(existsSync(destination), false);
  await assert.rejects(importFrontendJournal(transferred, destination, input.packet, input.digest, approved,
    async () => { throw new Error('remote head changed'); }));
  assert.equal(existsSync(destination), false);
  await importFrontendJournal(transferred, destination, input.packet, input.digest, approved, async current => {
    confirmed++; assert.equal(current.next, 'fe');
  });
  const restored = { ...input, directory: destination };
  assert.equal(readActivationJournal(destination, input.packet, input.digest).next, 'fe');
  let effects = 0;
  await assert.rejects(executeActivationPhase(restored, 'migration', async () => {
    effects++; throw new Error('must not repeat SQL');
  }));
  assert.equal(effects, 0);
  assert.equal(sha256(canonical(inventory(transferred))), approved);
  authorizeLocal(restored, 'fe');
  await executeActivationPhase(restored, 'fe', async () => ({ result: 'confirmed', databaseOutcome: 'not_started',
    count: 1, deploymentId: null, reportDigest: sha256('approved-fe-receipt') }));
  const fe = readActivationJournal(destination, input.packet, input.digest);
  appendActivationEvent(destination, input.packet, input.digest, 'fe', 'confirming', { outcomeHash: fe.head });
  appendActivationEvent(destination, input.packet, input.digest, 'fe', 'remote-confirmed', { outcomeHash: fe.head });
  let finalWrites = 0, finalReads = 0;
  const unavailable = async (): Promise<never> => { throw new Error('Unexpected provider operation during completion'); };
  const completionProvider: ActivationProvider = {
    async currentMain() {}, async binding(id) { assert.equal(id, 'dpl_app'); },
    async record() { finalWrites++; throw new Error('Lost final acknowledgement'); },
    async confirmJournal() { finalReads++; },
    preflight: unavailable, reserve: unavailable, inspect: unavailable, attest: unavailable,
    http: unavailable, acceptFrontend: unavailable,
  };
  await assert.rejects(completeActivation(restored, completionProvider, false));
  await assert.rejects(completeActivation(restored, completionProvider, false));
  assert.equal(finalWrites, 1); assert.equal(finalReads, 0);
  assert.equal(existsSync(join(destination, 'operator.lock')), true);
  await completeActivation(restored, completionProvider, true);
  assert.equal(finalWrites, 1); assert.equal(finalReads, 1);
  assert.equal(existsSync(join(destination, 'operator.lock')), false);
});

test('phase credential boundaries reject privileged cross-phase inputs rather than silently dropping them', () => {
  for (const phase of ['bridge-config', 'app-config', 'roles', 'migration', 'bootstrap', 'bridge', 'app'] as const) {
    for (const key of ['DATABASE_URL', 'APP_AUTH_ADMIN_KEY', 'MIGRATION_DATABASE_URL', 'VERCEL_AUTOMATION_BYPASS_SECRET']) {
      assert.throws(() => phaseInputEnvironment({ [key]: 'synthetic-secret' }, phase));
    }
  }
  assert.throws(() => phaseInputEnvironment({ ACTIVATION_APP_INPUTS: '{}' }, 'bridge'));
  assert.throws(() => phaseInputEnvironment({ GITHUB_TOKEN: 'synthetic' }, 'roles'));
  assert.throws(() => phaseInputEnvironment({ VERCEL_TOKEN: 'synthetic' }, 'app-config'));
});

function secretConfiguration(phase: 'bridge' | 'app' = 'bridge') {
  const values: Record<string, string> = { API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
    SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
    SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
    DATABASE_URL: 'postgresql://postgres.eotmpaliqcxxcotrcols:synthetic-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: 'a'.repeat(64) };
  if (phase === 'app') Object.assign(values, { APP_SCHEMA_MODE: 'strict', APP_FOUNDATION_ENABLED: 'true',
    SUPABASE_DATABASE_USER: 'app_runtime.eotmpaliqcxxcotrcols',
    DATABASE_URL: values.DATABASE_URL!.replace('postgres.eotmpaliqcxxcotrcols:', 'app_runtime.eotmpaliqcxxcotrcols:'),
    APP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000005', APP_EMAIL_ENABLED: 'false',
    APP_AUTH_URL: 'https://eotmpaliqcxxcotrcols.supabase.co/auth/v1', APP_AUTH_API_KEY: 'sb_publishable_synthetic-only',
    APP_RETENTION_POLICY_ID: 'manual-retention-v1' });
  const packet = { ...activationPacket(), [phase === 'bridge' ? 'bridgeConfigDigest' : 'appConfigDigest']: sha256(canonical(values)) };
  const entries = Object.keys({ ...values, APP_ACTIVATION_CONFIG_DIGEST: sha256(canonical(values)) }).map((key, index) =>
    ({ id: `env_${index}`, key, type: 'sensitive', visibility: 'secret', target: ['production'] }));
  return { values, packet, entries };
}

test('missing-five requires exactly absent targets and valid existing Secret Production metadata', async t => {
  for (const scenario of ['exact', 'target-present', 'missing-other', 'all-present', 'encrypted', 'config', 'preview',
    'duplicate-id', 'privileged', 'hidden', 'paginated']) await t.test(scenario, async () => {
    const { values, packet, entries } = secretConfiguration('app');
    const isMissing = (key: string) => appMissingFiveKeys.some(name => name === key);
    const rows: Array<Record<string, unknown>> = entries.filter(row => !isMissing(row.key));
    if (scenario === 'target-present') rows.push(entries.find(row => row.key === 'APP_WORKSPACE_ID')!);
    if (scenario === 'all-present') rows.push(...entries.filter(row => isMissing(row.key)));
    if (scenario === 'missing-other') rows.splice(rows.findIndex(row => row.key === 'API_RUNTIME'), 1);
    if (scenario === 'encrypted') rows[0]!.type = 'encrypted';
    if (scenario === 'config') rows[0]!.visibility = 'config';
    if (scenario === 'preview') rows[0]!.target = ['preview'];
    if (scenario === 'duplicate-id') rows[1]!.id = rows[0]!.id;
    if (scenario === 'privileged') rows.push({ key: 'SUPABASE_SERVICE_ROLE_KEY', value: 'PRIVATE_MISSING_FIVE' });
    let gets = 0;
    const transport: typeof fetch = async (url, init) => {
      gets++; assert.equal(init?.method, 'GET');
      assert.equal(new URL(String(url)).searchParams.get('decrypt'), 'false');
      return Response.json({ envs: rows, hiddenProductionEnvCount: scenario === 'hidden' ? 1 : 0,
        pagination: { next: scenario === 'paginated' ? 'more' : null } });
    };
    const observed = observeMissingFiveMetadata(values, packet, 'synthetic-config-token', AbortSignal.timeout(10000), transport);
    if (scenario === 'exact') {
      const result = await observed;
      assert.deepEqual(Object.keys(result.bindings).sort(), entries.filter(row => !isMissing(row.key)).map(row => row.key).sort());
      assert.equal(result.keyCount, entries.length - 5);
    } else await assert.rejects(observed, error => error instanceof AppMetadataError
      && !JSON.stringify(error).includes('PRIVATE_MISSING_FIVE'));
    assert.equal(gets, 1);
  });
});

test('missing-five POST never upserts or sends existing keys and preserves partial or unknown acknowledgement', async t => {
  for (const scenario of ['success', 'partial', 'collision', 'ongoing-update', 'lost-ack', 'invalid-json', 'body-error',
    'duplicate', 'duplicate-id', 'wrong-target', 'wrong-type', 'extra-key', 'missing-failed']) await t.test(scenario, async () => {
    const { values, packet, entries } = secretConfiguration('app'), canary = 'PRIVATE_MISSING_FIVE';
    const rows: Array<Record<string, unknown>> = appMissingFiveKeys.map(key => ({ ...entries.find(row => row.key === key)!, value: canary }));
    let calls = 0;
    const transport: typeof fetch = async (url, init) => {
      calls++; assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error');
      const parsed = new URL(String(url));
      assert.equal(parsed.pathname, `/v10/projects/${packet.projectId}/env`);
      assert.deepEqual([...parsed.searchParams.keys()].sort(), ['slug', 'teamId']);
      const sent = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
      assert.deepEqual(sent.map(row => row.key), appMissingFiveKeys);
      for (const row of sent) assert.deepEqual(row, { key: row.key, value: values[String(row.key)],
        type: 'sensitive', target: ['production'] });
      if (scenario === 'lost-ack') throw new Error(canary);
      if (scenario === 'invalid-json') return new Response(canary, { status: 201 });
      if (scenario === 'body-error') return new Response(new ReadableStream({ start(controller) { controller.error(new Error(canary)); } }), { status: 201 });
      if (scenario === 'collision' || scenario === 'ongoing-update') return Response.json(
        { error: { code: canary, message: canary } }, { status: scenario === 'collision' ? 403 : 400 });
      if (scenario === 'partial') return Response.json({ created: rows.slice(0, 3),
        failed: [{ error: { key: appMissingFiveKeys[3], envVarId: 'env_existing_collision', message: canary, value: canary } }] }, { status: 201 });
      if (scenario === 'duplicate') rows.push({ ...rows[0] });
      if (scenario === 'duplicate-id') rows[1]!.id = rows[0]!.id;
      if (scenario === 'wrong-target') rows[0]!.target = ['preview'];
      if (scenario === 'wrong-type') rows[0]!.type = 'encrypted';
      if (scenario === 'extra-key') rows.push({ ...entries[0]!, value: canary });
      return Response.json({ created: rows, ...(scenario === 'missing-failed' ? {} : { failed: [] }) }, { status: 201 });
    };
    const result = await postMissingFive(values, packet, 'synthetic-config-token', AbortSignal.timeout(10000), transport);
    assert.equal(calls, 1); assert.equal(result.outcome, scenario === 'success' ? 'acknowledged' : 'unknown');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_MISSING_FIVE|synthetic-config-token|sb_publishable|postgresql/);
    if (scenario === 'success') assert.ok(appMissingFiveKeys.every(key => result.keys[key].status === 'acknowledged'));
    if (scenario === 'partial') {
      assert.deepEqual(appMissingFiveKeys.map(key => result.keys[key].status), ['acknowledged', 'acknowledged', 'acknowledged', 'failed', 'unknown']);
      assert.deepEqual(result.keys.APP_RETENTION_POLICY_ID.ids, ['env_existing_collision']);
      assert.deepEqual(result.keys.APP_AUTH_API_KEY.ids, [rows[0]!.id]);
    }
    if (scenario === 'duplicate') assert.equal(result.keys.APP_AUTH_API_KEY.status, 'unknown');
    if (scenario === 'duplicate-id') {
      assert.equal(result.keys.APP_AUTH_API_KEY.status, 'unknown');
      assert.equal(result.keys.APP_AUTH_URL.status, 'unknown');
      assert.deepEqual(result.keys.APP_AUTH_API_KEY.ids, result.keys.APP_AUTH_URL.ids);
    }
    if (scenario === 'wrong-target' || scenario === 'wrong-type') {
      assert.equal(result.keys.APP_AUTH_API_KEY.status, 'unknown');
      assert.deepEqual(result.keys.APP_AUTH_API_KEY.ids, [rows[0]!.id]);
    }
    if (scenario === 'collision' || scenario === 'ongoing-update') {
      assert.equal(result.httpStatus, scenario === 'collision' ? 403 : 400);
      assert.equal(result.issue, 'http'); assert.ok(appMissingFiveKeys.every(key => result.keys[key].status === 'unknown'));
    }
    if (scenario === 'lost-ack') assert.equal(result.httpStatus, null);
  });
});

test('missing-five final metadata binds both new ACK identities and untouched existing identities', async t => {
  for (const scenario of ['verified', 'existing-id-drift', 'new-id-drift', 'still-missing', 'new-target-drift']) await t.test(scenario, async () => {
    const { values, packet, entries } = secretConfiguration('app');
    const missing = entries.filter(row => appMissingFiveKeys.some(key => key === row.key));
    const before = await observeMissingFiveMetadata(values, packet, 'synthetic-config-token', AbortSignal.timeout(10000),
      async () => Response.json({ envs: entries.filter(row => !missing.includes(row)) }));
    const ack = await postMissingFive(values, packet, 'synthetic-config-token', AbortSignal.timeout(10000),
      async () => Response.json({ created: missing, failed: [] }, { status: 201 }));
    const after = structuredClone(entries);
    if (scenario === 'existing-id-drift') after[0]!.id = 'env_replaced_existing';
    if (scenario === 'new-id-drift') after.find(row => row.key === 'APP_AUTH_API_KEY')!.id = 'env_replaced_new';
    if (scenario === 'new-target-drift') after.find(row => row.key === 'APP_AUTH_API_KEY')!.target = ['preview'];
    if (scenario === 'still-missing') after.splice(after.findIndex(row => row.key === 'APP_AUTH_API_KEY'), 1);
    let gets = 0;
    const result = verifyMissingFiveMetadata(values, packet, 'synthetic-config-token', before, ack, AbortSignal.timeout(10000),
      async (url, init) => { gets++; assert.equal(init?.method, 'GET');
        assert.equal(new URL(String(url)).searchParams.get('decrypt'), 'false'); return Response.json({ envs: after }); });
    if (scenario === 'verified') assert.equal((await result).keyCount, entries.length);
    else await assert.rejects(result, AppMetadataError);
    assert.equal(gets, 1);
  });
});

function databasePairConfiguration() {
  const { values, packet } = secretConfiguration('app');
  values.DATABASE_CA_PEM = rootCertificates[0]!;
  packet.appConfigDigest = sha256(canonical(values));
  const entries = Object.keys({ ...values, APP_ACTIVATION_CONFIG_DIGEST: packet.appConfigDigest }).map((key, index) =>
    ({ id: `env_pair_${index}`, key, type: 'sensitive', visibility: 'secret', target: ['production'], value: 'PRIVATE_DB_PAIR' }));
  return { values, packet, entries };
}
test('database-pair requires all17 existing Production Secret bindings and least-privilege APP inputs', async t => {
  for (const scenario of ['valid', 'missing-url', 'missing-user', 'missing-other', 'encrypted', 'preview',
    'duplicate-id', 'privileged', 'hidden', 'paginated', 'postgres', 'operator', 'url-mismatch', 'digest']) {
    await t.test(scenario, async () => {
      const { values, packet, entries } = databasePairConfiguration();
      const rows: Array<Record<string, unknown>> = [...entries];
      if (scenario.startsWith('missing-')) {
        const key = scenario === 'missing-url' ? 'DATABASE_URL' : scenario === 'missing-user' ? 'SUPABASE_DATABASE_USER' : 'DATABASE_CA_PEM';
        rows.splice(rows.findIndex(row => row.key === key), 1);
      }
      if (scenario === 'encrypted') rows[0]!.type = 'encrypted';
      if (scenario === 'preview') rows[0]!.target = ['preview'];
      if (scenario === 'duplicate-id') rows[1]!.id = rows[0]!.id;
      if (scenario === 'privileged') rows.push({ key: 'SUPABASE_SERVICE_ROLE_KEY', value: 'PRIVATE_DB_PAIR' });
      if (scenario === 'postgres' || scenario === 'operator' || scenario === 'url-mismatch') {
        const user = scenario === 'operator' ? 'app_operator' : 'postgres';
        values.DATABASE_URL = values.DATABASE_URL!.replace('app_runtime.', `${user}.`);
        if (scenario !== 'url-mismatch') values.SUPABASE_DATABASE_USER = `${user}.eotmpaliqcxxcotrcols`;
        packet.appConfigDigest = sha256(canonical(values));
      }
      if (scenario === 'digest') packet.appConfigDigest = sha256('unapproved input envelope');
      let gets = 0;
      const observed = observeAppDatabasePair(values, packet, 'synthetic-config-token', AbortSignal.timeout(10000),
        async (url, init) => {
          gets++; assert.equal(init?.method, 'GET'); assert.equal(new URL(String(url)).searchParams.get('decrypt'), 'false');
          return Response.json({ envs: rows, hiddenProductionEnvCount: scenario === 'hidden' ? 1 : 0,
            pagination: { next: scenario === 'paginated' ? 'more' : null } });
        });
      if (scenario === 'valid') {
        const result = await observed;
        assert.equal(result.keyCount, 17); assert.equal(result.bindings.DATABASE_URL!.id, entries.find(row => row.key === 'DATABASE_URL')!.id);
        assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DB_PAIR|synthetic-only|BEGIN CERTIFICATE/);
      } else await assert.rejects(observed, error => error instanceof Error && !JSON.stringify(error).includes('PRIVATE_DB_PAIR'));
      assert.equal(gets, ['postgres', 'operator', 'url-mismatch', 'digest'].includes(scenario) ? 0 : 1);
    });
  }
});
test('database-pair updates only the existing approved pair and retains partial or lost ACK without replay or secret output', async t => {
  for (const scenario of ['success', 'partial', 'lost-ack', 'http-error', 'extra-key', 'missing-before']) await t.test(scenario, async () => {
    const { values, packet, entries } = databasePairConfiguration(), canary = 'PRIVATE_DB_PAIR';
    const before = await observeAppDatabasePair(values, packet, 'synthetic-config-token', AbortSignal.timeout(10000),
      async () => Response.json({ envs: entries }));
    const pair = ['DATABASE_URL', 'SUPABASE_DATABASE_USER'];
    const rows = pair.map(key => entries.find(row => row.key === key)!);
    const providerValues = new Map(entries.map(row => [row.key, `untouched:${row.key}`])), original = new Map(providerValues);
    if (scenario === 'missing-before') {
      const bindings = { ...before.bindings }; delete bindings.DATABASE_URL;
      before.bindings = bindings;
    }
    let posts = 0;
    const outcome = postAppDatabasePair(values, packet, 'synthetic-config-token', before, AbortSignal.timeout(10000),
      async (url, init) => {
        posts++; assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error');
        const parsed = new URL(String(url));
        assert.equal(parsed.origin, 'https://api.vercel.com'); assert.equal(parsed.pathname, `/v10/projects/${packet.projectId}/env`);
        assert.deepEqual(Object.fromEntries(parsed.searchParams), { upsert: 'true', teamId: packet.scopeId, slug: artifactTarget.scope });
        const sent = JSON.parse(String(init?.body)) as Array<{ key: string; value: string }>;
        assert.deepEqual(sent, pair.map(key => ({ key, value: values[key], type: 'sensitive', target: ['production'] })));
        for (const row of sent) { assert.ok(providerValues.has(row.key)); providerValues.set(row.key, row.value); }
        if (scenario === 'lost-ack') throw new Error(canary);
        if (scenario === 'http-error') return Response.json({ error: { message: canary, value: canary } }, { status: 403 });
        if (scenario === 'partial') return Response.json({ created: [rows[0]], failed: [
          { error: { envVarKey: 'SUPABASE_DATABASE_USER', envVarId: rows[1]!.id, message: canary, value: canary } },
        ] }, { status: 201 });
        return Response.json({ created: scenario === 'extra-key' ? [...rows, entries[0]] : rows, failed: [] }, { status: 201 });
      });
    if (scenario === 'missing-before') { await assert.rejects(outcome, AppMetadataError); assert.equal(posts, 0); return; }
    const ack = await outcome;
    assert.equal(posts, 1); assert.equal(ack.outcome, scenario === 'success' ? 'acknowledged' : 'unknown');
    assert.equal(providerValues.get('DATABASE_URL'), values.DATABASE_URL);
    assert.equal(providerValues.get('SUPABASE_DATABASE_USER'), 'app_runtime.eotmpaliqcxxcotrcols');
    for (const [key, value] of original) if (!pair.includes(key)) assert.equal(providerValues.get(key), value);
    assert.deepEqual(Object.keys(ack.keys), pair);
    assert.doesNotMatch(JSON.stringify(ack), /PRIVATE_DB_PAIR|synthetic-only|synthetic-config-token|BEGIN CERTIFICATE|postgresql/);
    if (scenario === 'partial') {
      assert.deepEqual(ack.keys.DATABASE_URL, { status: 'acknowledged', ids: [rows[0]!.id] });
      assert.deepEqual(ack.keys.SUPABASE_DATABASE_USER, { status: 'failed', ids: [rows[1]!.id] });
    }
    if (scenario === 'lost-ack') {
      assert.equal(ack.httpStatus, null);
      assert.deepEqual(ack.keys, { DATABASE_URL: { status: 'unknown', ids: [] }, SUPABASE_DATABASE_USER: { status: 'unknown', ids: [] } });
    }
  });
});
test('database-pair verifies only full ACKs and unchanged17 identities, types and targets, never decrypted values', async t => {
  for (const scenario of ['verified', 'partial', 'ack-id', 'pair-id', 'other-id', 'type', 'target', 'missing']) await t.test(scenario, async () => {
    const { values, packet, entries } = databasePairConfiguration();
    const before = await observeAppDatabasePair(values, packet, 'synthetic-config-token', AbortSignal.timeout(10000),
      async () => Response.json({ envs: entries }));
    const ack = await postAppDatabasePair(values, packet, 'synthetic-config-token', before, AbortSignal.timeout(10000),
      async () => Response.json({ created: entries.filter(row => ['DATABASE_URL', 'SUPABASE_DATABASE_USER'].includes(row.key)), failed: [] }, { status: 201 }));
    if (scenario === 'partial') ack.outcome = 'unknown';
    if (scenario === 'ack-id') ack.keys.DATABASE_URL.ids = ['env_replaced'];
    const after = structuredClone(entries), pair = after.find(row => row.key === 'DATABASE_URL')!;
    if (scenario === 'pair-id') pair.id = 'env_replaced';
    if (scenario === 'other-id') after[0]!.id = 'env_replaced';
    if (scenario === 'type') pair.type = 'encrypted';
    if (scenario === 'target') pair.target = ['preview'];
    if (scenario === 'missing') after.splice(after.indexOf(pair), 1);
    after.forEach(row => { row.value = 'OTHER_PRIVATE_VALUE'; });
    let gets = 0;
    const verify = () => verifyAppDatabasePair(values, packet, 'synthetic-config-token', before, ack, AbortSignal.timeout(10000),
      async (url, init) => { gets++; assert.equal(init?.method, 'GET');
        assert.equal(new URL(String(url)).searchParams.get('decrypt'), 'false'); return Response.json({ envs: after }); });
    if (scenario === 'verified') assert.deepEqual(await verify(), { metadataDigest: before.metadataDigest, keyCount: 17 });
    else await assert.rejects(async () => verify(), AppMetadataError);
    assert.equal(gets, ['partial', 'ack-id'].includes(scenario) ? 0 : 1);
  });
});

test('held APP metadata diagnoses bounded failures without disclosing values, IDs or untrusted names', async t => {
  const issues = {
    'secret-only': 'secret-type-mismatch', visibility: 'secret-type-mismatch',
    'missing-key': 'controlled-key-mismatch', duplicate: 'controlled-key-mismatch',
    'duplicate-id': 'controlled-key-mismatch', 'unexpected-controlled': 'controlled-key-mismatch',
    privileged: 'privileged-name', 'privileged-alias': 'privileged-name',
    preview: 'target-binding-mismatch', 'binding-hook': 'target-binding-mismatch', 'invalid-id': 'target-binding-mismatch',
    paginated: 'list-incomplete', hidden: 'list-incomplete', 'malformed-list': 'list-incomplete',
    transport: 'transport', http: 'http', 'http-cancel': 'http', oversized: 'body', 'body-stream': 'body', json: 'json',
  } as const;
  for (const scenario of ['sensitive', ...Object.keys(issues)]) await t.test(scenario, async () => {
    const { values, packet, entries } = secretConfiguration('app');
    const rows: Array<Record<string, unknown>> = structuredClone(entries), canary = 'PRIVATE_METADATA_CANARY';
    for (const row of rows) { row.id = `${canary}_${row.id}`; row.value = canary; }
    if (scenario === 'secret-only') rows[0]!.type = 'encrypted';
    if (scenario === 'visibility') rows[0]!.visibility = 'config';
    if (scenario === 'missing-key') {
      rows.splice(rows.findIndex(row => row.key === 'API_RUNTIME'), 1);
      rows.push({ key: `UNTRUSTED_${canary}`, value: canary, id: canary });
    }
    if (scenario === 'duplicate') rows.push({ ...rows[0] });
    if (scenario === 'duplicate-id') rows.find(row => row.key === 'DATABASE_URL')!.id = rows[0]!.id;
    if (scenario === 'unexpected-controlled') rows.push({ ...rows[0], id: `${canary}_extra`, key: 'DATABASE_CA_PEM' });
    if (scenario === 'privileged') rows.push({ key: `ACTIVATION_${canary}`, value: canary });
    if (scenario === 'privileged-alias') rows.push({ key: 'SUPABASE_SERVICE_ROLE_KEY', value: canary });
    if (scenario === 'preview') rows[0]!.target = ['preview'];
    if (scenario === 'binding-hook') rows[0]!.configurationId = canary;
    if (scenario === 'invalid-id') rows[0]!.id = `invalid/${canary}`;
    let requests = 0;
    const transport: typeof fetch = async (url, init) => {
      requests++; assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
      const parsed = new URL(String(url));
      assert.equal(parsed.origin, 'https://api.vercel.com'); assert.equal(parsed.pathname, `/v10/projects/${packet.projectId}/env`);
      assert.equal(parsed.searchParams.get('decrypt'), 'false'); assert.equal(parsed.searchParams.get('teamId'), packet.scopeId);
      if (scenario === 'transport') throw new Error(canary);
      if (scenario === 'http') return new Response(canary, { status: 403 });
      if (scenario === 'http-cancel') return new Response(new ReadableStream({ cancel() { throw new Error(canary); } }), { status: 429 });
      if (scenario === 'oversized') return new Response(canary.padEnd(1024 * 1024 + 1, 'x'));
      if (scenario === 'body-stream') return new Response(new ReadableStream({ start(controller) { controller.error(new Error(canary)); } }));
      if (scenario === 'json') return new Response(`{\"invalid\":\"${canary}`);
      return Response.json({ envs: scenario === 'malformed-list' ? { [canary]: rows } : rows,
        hiddenProductionEnvCount: scenario === 'hidden' ? 1 : 0, pagination: { next: scenario === 'paginated' ? canary : null } });
    };
    const call = observeAppMetadata(values, packet, 'synthetic-configuration-token', AbortSignal.timeout(10000), transport);
    if (scenario === 'sensitive') {
      const result = await call;
      assert.equal(result.keyCount, entries.length); assert.match(result.metadataDigest, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(result).includes(canary), false);
    } else await assert.rejects(call, error => {
      assert.ok(error instanceof AppMetadataError);
      assert.deepEqual(error.diagnostic, { issue: issues[scenario as keyof typeof issues],
        httpStatus: scenario === 'transport' ? null : scenario === 'http' ? 403 : scenario === 'http-cancel' ? 429 : 200,
        missingKeys: scenario === 'missing-key' ? ['API_RUNTIME'] : [],
        unexpectedKeys: scenario === 'duplicate' ? ['API_RUNTIME'] : scenario === 'duplicate-id' ? ['DATABASE_URL']
          : scenario === 'unexpected-controlled' ? ['DATABASE_CA_PEM'] : [] });
      assert.doesNotMatch(JSON.stringify(error) + error.message, /PRIVATE_METADATA_CANARY|UNTRUSTED_|SUPABASE_SERVICE_ROLE_KEY|env_/);
      return true;
    });
    assert.equal(requests, 1);
  });
});
test('Secret configuration accepts one-way201 acknowledgement without decrypting saved values', async t => {
  if (historicalActivationChild(t.name)) return;
  const { values, packet, entries } = secretConfiguration();
  let writes = 0;
  const transport: typeof fetch = async (raw, init) => {
    const url = new URL(String(raw));
    assert.equal(url.pathname, `/v10/projects/${packet.projectId}/env`);
    if (init?.method === 'POST') {
      writes++;
      const body = JSON.parse(String(init.body)) as Array<{ type: string }>;
      assert.ok(body.every(row => row.type === 'sensitive'));
      return Response.json({ created: entries, failed: [] }, { status: 201 });
    }
    assert.equal(url.searchParams.get('decrypt'), 'false');
    return Response.json({ envs: entries, pagination: null, hiddenProductionEnvCount: 0 });
  };
  const receipt = await configureActivation(values, packet, 'bridge', 'synthetic-configuration-token', AbortSignal.timeout(10000), transport);
  assert.equal(writes, 1);
  assert.equal(receipt.configDigest, packet.bridgeConfigDigest);
  assert.equal(receipt.valueProof, 'pending-candidate-runtime');
  assert.equal(receipt.packetDigest, sha256(canonical(packet)));
  assert.equal(JSON.stringify(receipt).includes('synthetic-only'), false);
});

test('Secret metadata respects authoritative visibility and binds both runtime phases', async t => {
  if (historicalActivationChild(t.name)) return;
  for (const phase of ['bridge', 'app'] as const) for (const kind of ['legacy-sensitive', 'encrypted-secret', 'upgrade-config']) {
    const { values, packet, entries } = secretConfiguration(phase);
    const final = entries.map(row => kind === 'legacy-sensitive' ? { ...row, visibility: undefined }
      : kind === 'encrypted-secret' ? { ...row, type: 'encrypted' } : row);
    let writes = 0;
    const transport: typeof fetch = async (_raw, init) => {
      if (init?.method === 'POST') { writes++; return Response.json({ created: final, failed: [] }, { status: 201 }); }
      return Response.json({ envs: !writes && kind === 'upgrade-config'
        ? entries.map(row => ({ ...row, type: 'encrypted', visibility: 'config' })) : final });
    };
    const receipt = await configureActivation(values, packet, phase, 'synthetic-config-token', AbortSignal.timeout(10000), transport);
    assert.equal(receipt.phase, `${phase}-config`); assert.equal(receipt.valueProof, 'pending-candidate-runtime');
    assert.equal(receipt.configDigest, sha256(canonical(values))); assert.equal(writes, 1);
  }
});

test('Secret configuration fences incomplete or changed acknowledgements and metadata without readback or retry', async t => {
  if (historicalActivationChild(t.name)) return;
  const scenarios = ['hidden', 'pagination', 'duplicate', 'preview', 'lost-ack', 'partial', 'missing-ack', 'duplicate-ack',
    'extra-ack', 'replaced-id', 'config-visibility', 'post-drift', 'post-missing', 'abort-before-write', 'abort-after-write'];
  for (const scenario of scenarios) await t.test(scenario, async () => {
    const { values, packet, entries } = secretConfiguration();
    const abort = new AbortController();
    let writes = 0, decryptions = 0;
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw));
      if (url.pathname !== `/v10/projects/${packet.projectId}/env`) { decryptions++; throw new Error('Forbidden readback'); }
      assert.equal(url.searchParams.get('teamId'), packet.scopeId);
      if (init?.method === 'POST') {
        writes++;
        if (scenario === 'lost-ack') throw new Error('synthetic-secret-canary');
        if (scenario === 'abort-after-write') abort.abort();
        const created = scenario === 'missing-ack' ? [] : scenario === 'duplicate-ack' ? entries.map(() => entries[0])
          : scenario === 'extra-ack' ? [...entries, { ...entries[0], id: 'extra', key: 'UNAPPROVED' }]
          : scenario === 'replaced-id' ? entries.map(row => ({ ...row, id: `${row.id}_replaced` }))
          : scenario === 'config-visibility' ? entries.map(row => ({ ...row, visibility: 'config' })) : entries;
        return Response.json({ created, failed: scenario === 'partial' ? [{ error: 'synthetic-secret-canary' }] : [] }, { status: 201 });
      }
      assert.equal(url.searchParams.get('decrypt'), 'false');
      if (scenario === 'abort-before-write') abort.abort();
      const envs = scenario === 'duplicate' ? [...entries, entries[0]]
        : scenario === 'preview' ? entries.map(row => ({ ...row, target: ['production', 'preview'] }))
        : writes && scenario === 'post-drift' ? entries.map(row => ({ ...row, id: `${row.id}_changed` }))
        : writes && scenario === 'post-missing' ? entries.slice(1) : entries;
      return Response.json({ envs, hiddenProductionEnvCount: scenario === 'hidden' ? 1 : 0,
        pagination: scenario === 'pagination' ? { next: 123 } : null });
    };
    const beforeWrite = ['hidden', 'pagination', 'duplicate', 'preview', 'abort-before-write'].includes(scenario);
    await assert.rejects(configureActivation(values, packet, 'bridge', 'synthetic-config-token', abort.signal, transport),
      error => error instanceof ActivationConfigurationError && error.outcome === (beforeWrite ? 'not_started' : 'unknown')
        && !error.message.includes('synthetic-secret-canary'));
    assert.equal(writes, beforeWrite ? 0 : 1); assert.equal(decryptions, 0);
  });
});

test('lost remote acknowledgement after a durable Secret receipt is read-only recoverable without another write', async t => {
  if (historicalActivationChild(t.name)) return;
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  authorizeLocal(input, 'bridge-config');
  await executeActivationPhase(input, 'bridge-config', async () =>
    saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, 'bridge-config', configurationReceiptFixture(input.packet, 'bridge-config')));
  let writes = 0, reads = 0;
  const forbidden = async (): Promise<never> => { throw new Error('Unexpected provider effect'); };
  const provider: ActivationProvider = { currentMain: forbidden, preflight: forbidden, reserve: forbidden, binding: forbidden,
    inspect: forbidden, attest: forbidden, http: forbidden, acceptFrontend: forbidden,
    async record() { writes++; }, async confirmJournal() { reads++; if (reads === 1) throw new Error('Lost remote ACK'); } };
  await assert.rejects(confirmActivationPhase(input, 'bridge-config', provider));
  await assert.rejects(confirmActivationPhase(input, 'bridge-config', provider));
  assert.equal(readActivationJournal(input.directory, input.packet, input.digest).next, 'bridge-config');
  await reconcileActivationAcknowledgement(input, 'bridge-config', provider);
  assert.equal(readActivationJournal(input.directory, input.packet, input.digest).next, 'bridge');
  assert.equal(writes, 1); assert.equal(reads, 2);
});

test('missing or substituted durable Secret receipts prevent candidate execution after restart', async t => {
  if (historicalActivationChild(t.name)) return;
  for (const change of ['missing', 'startedHash', 'packetDigest', 'artifactDigest', 'metadataDigest', 'valueProof', 'count']) {
    const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
    authorizeLocal(input, 'bridge-config');
    await executeActivationPhase(input, 'bridge-config', async () =>
      saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, 'bridge-config', configurationReceiptFixture(input.packet, 'bridge-config')));
    const current = readActivationJournal(input.directory, input.packet, input.digest);
    appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'confirming', { outcomeHash: current.head });
    appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'remote-confirmed', { outcomeHash: current.head });
    const path = join(input.directory, `${input.packet.runId}.bridge-config.configuration.json`);
    if (change === 'missing') await rm(path);
    else {
      const envelope = JSON.parse(readFileSync(path, 'utf8'));
      if (change === 'startedHash') envelope.startedHash = sha256('substituted');
      else envelope.receipt[change] = change === 'count' ? 2 : change === 'valueProof' ? 'confirmed' : sha256('substituted');
      await writeFile(path, JSON.stringify(envelope));
    }
    let effects = 0;
    await assert.rejects(executeActivationPhase(input, 'bridge', async () => { effects++; throw new Error('Forbidden candidate'); }));
    await assert.rejects(reconcileActivationEffect(input, 'bridge-config', async () => { effects++; throw new Error('Forbidden reconciliation'); }));
    assert.equal(effects, 0, change);
    assert.equal(existsSync(join(input.directory, 'operator.lock')), true);
  }
});

test('configuration receipt persistence failure cannot be repaired by replaying the Secret write', async t => {
  if (historicalActivationChild(t.name)) return;
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  authorizeLocal(input, 'bridge-config');
  writeReleaseEvidence(join(input.directory, `${input.packet.runId}.bridge-config.configuration.json`), { partial: true });
  let writes = 0;
  const effect = async () => {
    writes++;
    return saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, 'bridge-config', configurationReceiptFixture(input.packet, 'bridge-config'));
  };
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  const current = readActivationJournal(input.directory, input.packet, input.digest);
  assert.equal((current.events.at(-1)!.value as { result: string }).result, 'unknown');
  assert.equal(current.next, 'bridge-config'); assert.equal(writes, 1);
});


test('configuration refuses privileged credential aliases before mutation or decryption and fences post-write discovery', async t => {
  if (historicalActivationChild(t.name)) return;
  const values = { API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
    SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
    SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
    DATABASE_URL: 'postgresql://postgres.eotmpaliqcxxcotrcols:synthetic-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: 'a'.repeat(64) };
  const packet = { ...activationPacket(), bridgeConfigDigest: sha256(canonical(values)) };
  const expected = { ...values, APP_ACTIVATION_CONFIG_DIGEST: packet.bridgeConfigDigest };
  const entries = Object.entries(expected).map(([key, value], index) =>
    ({ id: `env_${index}`, key, value, type: 'sensitive', target: ['production'] }));
  const aliases = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY',
    'SUPABASE_ACCESS_TOKEN', 'SUPABASE_JWT_SECRET', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DATABASE_URL',
    'POSTGRES_PASSWORD', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL',
    'PGPASSWORD', 'PGPASSFILE', 'DATABASE_PASSWORD', 'DATABASE_ADMIN_URL', 'DIRECT_URL',
    'AUTH_ADMIN_KEY', 'AUTH_ADMIN_TOKEN', 'ADMIN_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET'];
  for (const key of aliases) {
    for (const stage of ['before-write', 'after-write'] as const) {
      let writes = 0, decryptions = 0, inventories = 0;
      const transport: typeof fetch = async (raw, init) => {
        const url = new URL(String(raw));
        if (init?.method === 'POST') { writes++; return Response.json({ created: entries, failed: [] }, { status: 201 }); }
        if (url.pathname.endsWith('/env')) {
          inventories++;
          const present = stage !== 'after-write' || writes > 0;
          return Response.json({ envs: present
            ? [...entries, { id: 'env_privileged', key, type: 'encrypted', target: ['production'] }] : entries });
        }
        decryptions++;
        const entry = entries.find(value => url.pathname.endsWith(`/${value.id}`));
        assert.ok(entry);
        return Response.json(entry);
      };
      await assert.rejects(configureActivation(values, packet, 'bridge', 'synthetic-configuration-token', AbortSignal.timeout(10000), transport),
        error => error instanceof ActivationConfigurationError && error.outcome === (stage === 'after-write' ? 'unknown' : 'not_started'),
        `${key}: ${stage}`);
      assert.equal(writes, stage === 'after-write' ? 1 : 0, `${key}: no forbidden write or replay`);
      assert.equal(decryptions, 0, `${key}: no credential readback after refusal`);
      assert.equal(inventories, stage === 'after-write' ? 2 : 1);
    }
  }
});

async function activationArtifact() {
  const base = await artifactFixture();
  const files = base.artifact.manifest.source.files.filter(entry => !entry.path.startsWith('apps/api/migrations/'));
  for (const migration of migrationManifest) {
    const path = `apps/api/migrations/${migration.name}.mjs`;
    const bytes = readFileSync(new URL(`../../migrations/${migration.name}.mjs`, import.meta.url));
    await writeFile(join(base.operator, path), bytes); files.push(file(path, bytes, 0o644));
  }
  const contractPath = 'specs/001-connectivity-foundation/contracts/openapi.json';
  // Public historical contract at97000fac531308f0a4a13e0eee932260dc868650;
  // the production activation pin is unchanged, not the current API contract.
  const contract = readFileSync(new URL('../../tests/fixtures/historical-activation-openapi.json', import.meta.url));
  assert.equal(sha256(contract), '41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad');
  await mkdir(dirname(join(base.operator, contractPath)), { recursive: true });
  await writeFile(join(base.operator, contractPath), contract); files.push(file(contractPath, contract, 0o644));
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'activation'),
    config: base.config, source: { ...base.artifact.manifest.source, repository: `https://github.com/${repository}`,
      files, digest: sha256(canonical(files)) }, migrations: [...migrationManifest], build: base.artifact.manifest.build });
  const packet = { ...activationPacket(), artifactDigest: artifact.digest, sourceDigest: artifact.manifest.source.digest,
    target: 'supabase:eotmpaliqcxxcotrcols' };
  return { artifact, packet, dispose: base.dispose };
}
test('held CLI awaits readonly stage disposal, preserves outside symlinks and retains primary read errors', {
  skip: !process.getuid || process.getuid() === 0,
}, async t => {
  if (historicalActivationChild(t.name)) return;
  const f = await activationArtifact(), owned = await mkdtemp(join(realpathSync(tmpdir()), 'esty-held-cleanup-test-'));
  const roots: string[] = [], makeTemp = fs.mkdtempSync;
  t.after(async () => {
    t.mock.restoreAll(); syncBuiltinESMExports();
    for (const root of roots) await removeArtifactTree(root);
    await removeArtifactTree(owned); await f.dispose();
  });
  t.mock.method(fs, 'mkdtempSync', (prefix: string) => {
    const root = makeTemp(prefix); if (prefix.endsWith('esty-held-app-cli-')) roots.push(root); return root;
  });
  syncBuiltinESMExports();
  const tool = join(owned, 'tool'), cliPath = join(tool, 'vercel/dist/vc.js');
  await mkdir(dirname(cliPath), { recursive: true });
  await writeFile(join(tool, 'vercel/package.json'), JSON.stringify({ version: '65.4.0', type: 'module' }));
  await writeFile(cliPath, 'console.log(JSON.stringify({ synthetic: true }));\n');
  const guard = { digest: sha256('synthetic native held cleanup'), verify: () => ({ recoveryVercel: {
    root: tool, home: join(owned, 'home'), configDirectory: join(owned, 'profile'), inventoryDigest: recoveryToolInventory(tool),
  } }) };
  const before = canonical(inventory(f.artifact.root)), stop = new Error('Synthetic pre-dispatch stop');
  const cli = heldCandidateCreate(guard, f.artifact,
    { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'app' }, AbortSignal.timeout(30000));
  let dispatched = false;
  await assert.rejects(cli.create(() => { dispatched = true; throw stop; }), error => error === stop);
  assert.equal(dispatched, true);
  const stagedRoot = roots[0]!;
  const staged = inventory(join(stagedRoot, 'stage/.vercel/output'));
  assert.ok(staged.directories.every(directory => directory.mode === 0o555));
  assert.ok(staged.files.some(file => file.mode === 0o444));
  const outside = join(owned, 'outside'); await mkdir(outside); await writeFile(join(outside, 'sentinel'), 'unchanged');
  await symlink(outside, join(stagedRoot, 'cache/outside-link'));
  await cli.dispose();
  assert.equal(existsSync(stagedRoot), false);
  assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'unchanged');
  assert.equal(canonical(inventory(f.artifact.root)), before);
  await cli.dispose();

  const chmodNative = fsPromises.chmod;
  let release!: () => void, entered!: () => void, settled = false;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const chmodMock = t.mock.method(fsPromises, 'chmod', async (path: fs.PathLike, mode: fs.Mode) => {
    if (path === roots.at(-1)) { entered(); await blocked; }
    return chmodNative(path, mode);
  });
  syncBuiltinESMExports();
  const read = readHeldCandidate(guard, AbortSignal.timeout(30000), 'dpl_SyntheticRead', '/v13/deployments/dpl_SyntheticRead');
  void read.then(() => { settled = true; }, () => { settled = true; });
  await reached; assert.equal(settled, false); release();
  assert.deepEqual(await read, { synthetic: true });
  assert.equal(existsSync(roots.at(-1)!), false);
  chmodMock.mock.restore(); syncBuiltinESMExports();

  await writeFile(cliPath, 'console.log(\"invalid-json\");\n');
  t.mock.method(fsPromises, 'chmod', async () => { throw new Error('Synthetic secondary cleanup failure'); });
  syncBuiltinESMExports();
  await assert.rejects(readHeldCandidate(guard, AbortSignal.timeout(30000),
    'dpl_SyntheticRead', '/v13/deployments/dpl_SyntheticRead'), SyntaxError);
});

test('post-repair and fixed correction native CREATE preserve forced prebuilt staging and capability isolation', async t => {
  if (historicalActivationChild(t.name)) return;
  const f = await activationArtifact(), owned = await mkdtemp(join(realpathSync(tmpdir()), 'esty-correction-native-test-'));
  t.after(async () => { await removeArtifactTree(owned); await f.dispose(); });
  const tool = join(owned, 'tool'), cliPath = join(tool, 'vercel/dist/vc.js');
  await mkdir(dirname(cliPath), { recursive: true });
  await writeFile(join(tool, 'vercel/package.json'), JSON.stringify({ version: '65.4.0', type: 'module' }));
  await writeFile(cliPath, 'import { readdirSync } from "node:fs"; console.log(JSON.stringify({ id:"dpl_SyntheticNativeCorrection", args:process.argv.slice(2), files:readdirSync(process.cwd()) }));\n');
  const capability = heldCorrectionCapability({ revision: 'a'.repeat(40), tree: 'c'.repeat(40) });
  const postCapability = { ...capability, selector: heldPostRepair.selector };
  const toolIdentity = { root: tool, home: join(owned, 'home'), configDirectory: join(owned, 'profile'), inventoryDigest: recoveryToolInventory(tool) };
  const before = canonical(inventory(f.artifact.root));
  for (const correction of [undefined, heldCorrection.selector, heldPostRepair.selector]) {
    const guard = { digest: sha256('synthetic correction native transport'), verify: () => ({
      ...(correction === heldPostRepair.selector ? { heldPostRepairCapability: postCapability } : { heldCorrectionCapability: capability }),
      recoveryVercel: toolIdentity,
    }) };
    const cli = heldCandidateCreate(guard, f.artifact,
      { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'app' }, AbortSignal.timeout(30000), correction);
    let dispatches = 0;
    try {
      const result = await cli.create(() => { dispatches++; });
      assert.equal(result.code, 0, result.stdout); assert.equal(result.aborted, false);
      const observed = JSON.parse(result.stdout) as { args: string[]; files: string[] };
      assert.equal(observed.args.filter(arg => arg === '--force').length, correction ? 1 : 0);
      for (const flag of ['--prebuilt', '--archive=tgz', '--prod', '--skip-domain', '--no-wait']) assert.ok(observed.args.includes(flag));
      assert.deepEqual(observed.files.sort(), ['.vercel', 'apps']);
      await assert.rejects(cli.create(() => { dispatches++; }));
      assert.equal(dispatches, 1);
    } finally { await cli.dispose(); }
  }
  for (const authority of [
    {}, { heldCorrectionCapability: capability }, { heldPostRepairCapability: capability },
    { heldPostRepairCapability: { ...postCapability, controllerPublication: null } },
    { heldPostRepairCapability: postCapability, heldCorrectionCapability: capability },
  ]) {
    const cli = heldCandidateCreate({ digest: sha256('synthetic refused transport'), verify: () => ({
      ...authority, recoveryVercel: toolIdentity,
    }) }, f.artifact, { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'app' },
    AbortSignal.timeout(30000), heldPostRepair.selector);
    let dispatched = false;
    try { await assert.rejects(cli.create(() => { dispatched = true; })); assert.equal(dispatched, false); }
    finally { await cli.dispose(); }
  }
  assert.equal(canonical(inventory(f.artifact.root)), before);
});


test('L5 current four-entry source refuses historical activation before provider or CLI effects', async t => {
  assert.equal(migrationManifest.length, 4);
  assert.throws(() => assertActivationManifest());
  const f = await activationArtifact(); t.after(f.dispose);
  const h = harness(f.artifact);
  const activation = { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'bridge' as const };
  const provider: ActivationProvider = { ...h.input.provider,
    async confirmJournal() { throw new Error('Unexpected historical journal access'); },
    async acceptFrontend() { throw new Error('Unexpected frontend operation'); } };
  await assert.rejects(deliverActivationCandidate({ artifact: f.artifact, activation, provider, cli: h.input.cli,
    predecessor: 'dpl_previous', journal: 1, signal: AbortSignal.timeout(10000),
    persist() { throw new Error('Unexpected historical persistence'); } }));
  let requests = 0;
  assert.throws(() => createActivationProvider(f.artifact, run, credentials, AbortSignal.timeout(10000), activation,
    async () => { requests++; throw new Error('Unexpected historical provider transport'); }));
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 }); assert.deepEqual(h.events, []);
  assert.equal(requests, 0);
});

test('activation preserves known IDs and refuses promotion after unknown acknowledgement or runtime attestation failure', async t => {
  if (historicalActivationChild(t.name)) return;
  const f = await activationArtifact(); t.after(f.dispose);
  for (const failure of [undefined, 'lost-create', 'known-nonzero', 'lost-ack', 'candidate_http', 'promote', 'production_http']) {
    const h = harness(f.artifact, failure);
    const provider: ActivationProvider = { ...h.input.provider,
      async confirmJournal() { if (failure === 'lost-ack') throw new Error('unknown acknowledgement'); },
      async acceptFrontend() { throw new Error('not a frontend operation'); } };
    const create = h.input.cli.create;
    h.input.cli.create = async () => {
      const result = await create();
      return failure === 'lost-create' ? { ...result, stdout: '' } : failure === 'known-nonzero' ? { ...result, code: 1 } : result;
    };
    const retained: Array<{ kind: string; value: Record<string, string> }> = [];
    const operation = deliverActivationCandidate({ artifact: f.artifact,
      activation: { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'bridge' },
      provider, cli: h.input.cli, predecessor: 'dpl_previous', journal: 1, signal: AbortSignal.timeout(10000),
      persist(kind, value) { retained.push({ kind, value }); } });
    if (failure) await assert.rejects(operation); else assert.equal(await operation, 'dpl_candidate');
    assert.equal(h.counts().creates, 1);
    assert.equal(h.counts().promotions, [undefined, 'promote', 'production_http'].includes(failure) ? 1 : 0);
    assert.equal(retained.some(event => event.kind === 'acknowledged'), failure !== 'lost-create');
    if (retained.some(event => event.kind === 'promotion-intent')) {
      assert.deepEqual(retained.find(event => event.kind === 'candidate-attested')?.value,
        { deploymentId: 'dpl_candidate', configDigest: f.packet.bridgeConfigDigest });
    }
  }
});

test('provider runtime configuration attestation cannot be replaced by deployment metadata or leaked on denial', async t => {
  if (historicalActivationChild(t.name)) return;
  const f = await activationArtifact(); t.after(f.dispose);
  for (const mode of ['exact', 'missing', 'changed', 'leaked']) {
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw)), headers = new Headers(init?.headers);
      assert.equal(headers.has('x-vercel-protection-bypass'), false);
      if (init?.method === 'OPTIONS') return headers.get('origin') === 'https://app.lovora.us'
        ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://app.lovora.us' } })
        : new Response(null, { status: 401 });
      const authorized = headers.get('authorization') === `Bearer ${credentials.bearer}`;
      const responseHeaders: Record<string, string> = {};
      if (mode !== 'missing' && (authorized || mode === 'leaked')) {
        responseHeaders['x-activation-config-digest'] = mode === 'changed' ? sha256('different') : f.packet.bridgeConfigDigest;
      }
      if (!authorized) return Response.json({ status: 'unauthorized' }, { status: 401, headers: responseHeaders });
      if (url.pathname === '/health/live') return Response.json({ status: 'ok' }, { headers: responseHeaders });
      if (url.pathname === '/health/ready') return Response.json({ status: 'ready', database: 'up', migrations: 'current' }, { headers: responseHeaders });
      return new Response(null, { status: 404 });
    };
    const provider = createActivationProvider(f.artifact, run, credentials, AbortSignal.timeout(10000),
      { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'bridge' }, transport);
    if (mode === 'exact') await provider.http('https://synthetic.vercel.app', true);
    else await assert.rejects(provider.http('https://synthetic.vercel.app', true));
  }
});

test('journal mode and event tampering prevent all later phase effects', async t => {
  if (historicalActivationChild(t.name)) return;
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  authorizeLocal(input, 'bridge-config');
  const path = join(input.directory, 'activation', input.packet.runId, '000.json');
  await chmod(path, 0o644);
  let effects = 0;
  const effect = async () => { effects++; throw new Error('forbidden effect'); };
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  await chmod(path, 0o600);
  const event = JSON.parse(readFileSync(path, 'utf8')); event.value = { outcome: 'confirmed' };
  await writeFile(path, JSON.stringify(event));
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  assert.equal(effects, 0);
});

interface RetainedRunMetadata {
  id: number;
  run_attempt: number;
  head_sha: string;
  head_branch: string;
  event: string;
  path: string;
  repository: { full_name: string };
  head_repository: { full_name: string };
  status: string;
  conclusion: string | null;
}
interface RetainedMetadata {
  main: { sha: string; commit: { tree: { sha: string } } };
  source: { sha: string; commit: { tree: { sha: string } } };
  retainedRun: RetainedRunMetadata;
  jobs: { total_count: number; jobs: Array<{ id: number; name: string; run_id: number; run_attempt: number;
    head_sha: string; status: string; conclusion: string }> };
  artifact: { id: number; name: string; expired: boolean; size_in_bytes: number; digest: string;
    created_at: string; expires_at: string; workflow_run: { id: number; head_sha: string; head_branch: string } };
  activeRun: RetainedRunMetadata;
}

function retainedManualFixture(now = Date.now()) {
  const pin = retainedActivation;
  const packet: ActivationPacket = { ...activationPacket(), runId: '11111111-1111-4111-8111-111111111111',
    revision: pin.revision, tree: pin.tree, sourceDigest: pin.sourceDigest, artifactDigest: pin.artifactDigest,
    projectId: pin.project, scopeId: pin.scope, target: pin.target };
  const packetJson = retainedCanonical(packet);
  const env: NodeJS.ProcessEnv = { ...context(), GITHUB_EVENT_NAME: 'workflow_dispatch', BE_DELIVERY_ENABLED: 'false',
    BE_DELIVERY_MODE: 'activation', BE_ACTIVATION_ENABLED: 'true', BE_ACTIVATION_WORKFLOW_SHA: run.revision,
    BE_ACTIVATION_PACKET_JSON: packetJson, BE_ACTIVATION_PACKET_SHA256: sha256(packetJson) };
  const event = { inputs: { mode: 'activation', activation_artifact_id: pin.artifactId } };
  const active = manualContext(env, event), repo = { full_name: pin.repository };
  const retainedRun = { id: Number(pin.runId), run_attempt: 1, head_sha: pin.revision, head_branch: 'main',
    event: 'push', path: pin.workflowPath, repository: repo, head_repository: repo, status: 'completed', conclusion: 'failure' };
  const metadata: RetainedMetadata = {
    main: { sha: run.revision, commit: { tree: { sha: run.tree } } },
    source: { sha: pin.revision, commit: { tree: { sha: pin.tree } } },
    retainedRun,
    jobs: { total_count: 1, jobs: [{ id: Number(pin.checksJobId), name: 'BE required checks',
      run_id: Number(pin.runId), run_attempt: 1, head_sha: pin.revision, status: 'completed', conclusion: 'success' }] },
    artifact: { id: Number(pin.artifactId), name: `be-tested-${pin.runId}-1`, expired: false, size_in_bytes: 1024,
      digest: `sha256:${pin.zipDigest}`, created_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 3_600_000).toISOString(),
      workflow_run: { id: Number(pin.runId), head_sha: pin.revision, head_branch: 'main' } },
    activeRun: { ...retainedRun, id: Number(run.run), head_sha: run.revision, event: 'workflow_dispatch',
      status: 'in_progress', conclusion: null },
  };
  const read = async (path: string) => {
    const values: Record<string, unknown> = { '/commits/main': metadata.main, [`/commits/${pin.revision}`]: metadata.source,
      [`/actions/runs/${pin.runId}`]: metadata.retainedRun,
      [`/actions/runs/${pin.runId}/jobs?filter=all&per_page=100`]: metadata.jobs,
      [`/actions/artifacts/${pin.artifactId}`]: metadata.artifact, [`/actions/runs/${run.run}`]: metadata.activeRun };
    assert.ok(Object.hasOwn(values, path), `Unexpected retained metadata path: ${path}`);
    return structuredClone(values[path]);
  };
  return { now, packet, env, event, context: active, metadata, read };
}

test('manual retained approval binds the new workflow without opening ordinary production gates', () => {
  const f = retainedManualFixture();
  assert.deepEqual(f.context.workflow, { revision: run.revision, run: run.run, ref: 'refs/heads/main',
    workflowRef: `${repository}/.github/workflows/be-delivery.yml@refs/heads/main` });
  assert.equal(f.context.packet.revision, retainedActivation.revision);
  assert.notEqual(f.context.packet.revision, f.context.workflow.revision);
  for (const enabled of [undefined, '', 'false']) {
    assert.deepEqual(manualContext({ ...f.env, BE_DELIVERY_ENABLED: enabled }, f.event), f.context);
    for (const event of ['push', 'workflow_dispatch']) for (const mode of ['current-schema-only', 'versioned-migration']) {
      const env = { ...context(), GITHUB_EVENT_NAME: event, BE_DELIVERY_MODE: mode, BE_DELIVERY_ENABLED: enabled,
        BE_ACTIVATION_ENABLED: 'true', BE_ACTIVATION_WORKFLOW_SHA: run.revision };
      assert.throws(() => deliveryContext(env, run.tree), `${event}/${mode} remains broad-gated`);
      if (event === 'push') assert.throws(() => deliveryContext({ ...env, BE_DELIVERY_ENABLED: 'true' }, run.tree));
      else assert.deepEqual(deliveryContext({ ...env, BE_DELIVERY_ENABLED: 'true' }, run.tree), run);
    }
  }
});

test('manual retained context refuses implicit activation, unreviewed workflows and untrusted attempts', () => {
  const f = retainedManualFixture();
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'fork/esty-admin' },
    { GITHUB_REF: 'refs/heads/topic' }, { GITHUB_REF: 'refs/tags/main' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ID: retainedActivation.runId },
    { GITHUB_RUN_ID: '0' }, { GITHUB_SHA: 'invalid' },
    { GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/other.yml@refs/heads/main` },
    { BE_DELIVERY_ENVIRONMENT: 'preview' }, { BE_DELIVERY_MODE: 'current-schema-only' },
    { BE_ACTIVATION_ENABLED: 'false' }, { BE_ACTIVATION_ENABLED: undefined },
    { BE_ACTIVATION_WORKFLOW_SHA: retainedActivation.revision }, { BE_ACTIVATION_WORKFLOW_SHA: undefined }]) {
    assert.throws(() => manualContext({ ...f.env, ...change }, f.event), JSON.stringify(change));
  }
  for (const event of [{}, { inputs: {} }, { inputs: { ...f.event.inputs, mode: 'current-schema-only' } },
    { inputs: { mode: 'activation' } }, { inputs: { ...f.event.inputs, activation_artifact_id: '13587251016' } },
    { inputs: { ...f.event.inputs, activation_artifact_id: Number(retainedActivation.artifactId) } }]) {
    assert.throws(() => manualContext(f.env, event));
  }
});

test('manual retained packet approval rejects substituted release pins and noncanonical bytes', () => {
  const f = retainedManualFixture();
  for (const change of [{ version: 2 }, { revision: run.revision }, { tree: run.tree }, { sourceDigest: sha256('different-source') },
    { artifactDigest: sha256('different-artifact') }, { projectId: 'prj_other' }, { scopeId: 'team_other' }, { target: 'local' }]) {
    const json = retainedCanonical({ ...f.packet, ...change });
    assert.throws(() => manualContext({ ...f.env, BE_ACTIVATION_PACKET_JSON: json, BE_ACTIVATION_PACKET_SHA256: sha256(json) }, f.event));
  }
  for (const json of [JSON.stringify(f.packet, null, 2), `${f.env.BE_ACTIVATION_PACKET_JSON}\n`, '{', 'null']) {
    assert.throws(() => manualContext({ ...f.env, BE_ACTIVATION_PACKET_JSON: json, BE_ACTIVATION_PACKET_SHA256: sha256(json) }, f.event));
  }
  assert.throws(() => manualContext({ ...f.env, BE_ACTIVATION_PACKET_SHA256: sha256('unapproved') }, f.event));
});

test('retained selection accepts successful exact checks despite failed old completion and keeps workflow identity separate', async () => {
  const f = retainedManualFixture(Date.parse('2026-10-31T00:00:00.000Z'));
  const selected = await selectRetained(f.context, f.read, f.now);
  assert.deepEqual(selected.retained, retainedActivation);
  assert.deepEqual(selected.workflow, { ...f.context.workflow, tree: run.tree });
  assert.deepEqual(selected.checks, { id: retainedActivation.checksJobId, conclusion: 'success' });
  assert.equal(selected.packetDigest, f.context.packetDigest);
  assert.equal(selected.expiresAt, f.metadata.artifact.expires_at);
  assert.equal(selected.selectedAt, new Date(f.now).toISOString());
  await verifyWorkflowHead(selected, f.read);
  f.metadata.main.sha = retainedActivation.revision;
  await assert.rejects(verifyWorkflowHead(selected, f.read));
  f.metadata.main.sha = run.revision;
  f.metadata.main.commit.tree.sha = retainedActivation.tree;
  await assert.rejects(verifyWorkflowHead(selected, f.read));
  f.metadata.main.commit.tree.sha = run.tree;
  f.metadata.source.commit.tree.sha = run.tree;
  await assert.rejects(verifyWorkflowHead(selected, f.read));
});

test('retained selector refuses changed metadata, incomplete checks and expired transport before issuing approval', async () => {
  const now = Date.parse('2026-10-31T00:00:00.000Z');
  const changes: Array<[string, (metadata: RetainedMetadata) => void]> = [
    ['live main changed', m => { m.main.sha = retainedActivation.revision; }],
    ['source tree changed', m => { m.source.commit.tree.sha = run.tree; }],
    ['retained run changed', m => { m.retainedRun.id++; }],
    ['retained rerun', m => { m.retainedRun.run_attempt = 2; }],
    ['retained source changed', m => { m.retainedRun.head_sha = run.revision; }],
    ['retained branch changed', m => { m.retainedRun.head_branch = 'topic'; }],
    ['retained pull request', m => { m.retainedRun.event = 'pull_request'; }],
    ['retained workflow changed', m => { m.retainedRun.path = '.github/workflows/other.yml'; }],
    ['retained fork', m => { m.retainedRun.head_repository = { full_name: 'fork/esty-admin' }; }],
    ['retained incomplete', m => { m.retainedRun.status = 'in_progress'; }],
    ['checks missing', m => { m.jobs.jobs = []; m.jobs.total_count = 0; }],
    ['checks pagination incomplete', m => { m.jobs.total_count = 101; }],
    ['checks duplicated', m => { m.jobs.jobs.push({ ...m.jobs.jobs[0]! }); m.jobs.total_count = 2; }],
    ['checks renamed', m => { m.jobs.jobs[0]!.name = 'Different checks'; }],
    ['checks failed', m => { m.jobs.jobs[0]!.conclusion = 'failure'; }],
    ['checks incomplete', m => { m.jobs.jobs[0]!.status = 'in_progress'; }],
    ['checks rerun', m => { m.jobs.jobs[0]!.run_attempt = 2; }],
    ['checks different run', m => { m.jobs.jobs[0]!.run_id++; }],
    ['checks different source', m => { m.jobs.jobs[0]!.head_sha = run.revision; }],
    ['artifact substituted', m => { m.artifact.id++; }],
    ['artifact renamed', m => { m.artifact.name = 'be-tested-other'; }],
    ['artifact digest changed', m => { m.artifact.digest = `sha256:${sha256('different-zip')}`; }],
    ['artifact expired flag', m => { m.artifact.expired = true; }],
    ['artifact expiry boundary', m => { m.artifact.expires_at = new Date(now).toISOString(); }],
    ['artifact invalid expiry', m => { m.artifact.expires_at = 'not-a-date'; }],
    ['artifact from future', m => { m.artifact.created_at = new Date(now + 1).toISOString(); }],
    ['artifact unbounded', m => { m.artifact.size_in_bytes = 64 * 1024 * 1024 + 1; }],
    ['artifact empty', m => { m.artifact.size_in_bytes = 0; }],
    ['artifact wrong run', m => { m.artifact.workflow_run.id++; }],
    ['artifact wrong source', m => { m.artifact.workflow_run.head_sha = run.revision; }],
    ['active run changed', m => { m.activeRun.id++; }],
    ['active rerun', m => { m.activeRun.run_attempt = 2; }],
    ['active push', m => { m.activeRun.event = 'push'; }],
    ['active source impersonates release', m => { m.activeRun.head_sha = retainedActivation.revision; }],
    ['active workflow changed', m => { m.activeRun.path = '.github/workflows/other.yml'; }],
    ['active run completed', m => { m.activeRun.status = 'completed'; }],
    ['active fork', m => { m.activeRun.repository = { full_name: 'fork/esty-admin' }; }],
  ];
  for (const [label, change] of changes) {
    const f = retainedManualFixture(now); change(f.metadata);
    await assert.rejects(selectRetained(f.context, f.read, now), label);
  }
});

test('selection receipts cannot cross workflow, packet, artifact or expiry boundaries', async () => {
  const f = retainedManualFixture(Date.parse('2026-10-31T00:00:00.000Z'));
  const selected = await selectRetained(f.context, f.read, f.now);
  for (const changed of [{ ...selected, version: 2 }, { ...selected, extra: true },
    { ...selected, retained: { ...selected.retained, archiveDigest: sha256('substituted') } },
    { ...selected, workflow: { ...selected.workflow, revision: retainedActivation.revision } },
    { ...selected, workflow: { ...selected.workflow, run: '124' } },
    { ...selected, workflow: { ...selected.workflow, tree: 'invalid' } },
    { ...selected, packetDigest: sha256('different-packet') },
    { ...selected, checks: { ...selected.checks, id: '128499919012' } },
    { ...selected, checks: { ...selected.checks, conclusion: 'failure' } },
    { ...selected, selectedAt: new Date(f.now + 1).toISOString() },
    { ...selected, expiresAt: new Date(f.now).toISOString() }]) {
    assert.throws(() => validateSelection(changed, f.context, f.now));
  }
  assert.throws(() => validateSelection(selected, f.context, Date.parse(selected.expiresAt)));
});

test('retained metadata reader refuses redirects and unsafe paths without exposing its credential', async () => {
  const token = 'synthetic-retained-read-token';
  let calls = 0;
  const reader = githubReader(token, AbortSignal.timeout(10000), async (raw, init) => {
    calls++;
    assert.equal(new URL(String(raw)).origin, 'https://api.github.com');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token}`);
    return new Response(null, { status: 302, headers: { location: 'https://untrusted.invalid/credential-sink' } });
  });
  for (const path of ['https://untrusted.invalid', '/../deployments', '/commits/main#ignored', '/commits/ main', '/commits\\main']) {
    await assert.rejects(reader(path));
  }
  assert.equal(calls, 0);
  await assert.rejects(reader('/commits/main'), error => error instanceof Error && !error.message.includes(token));
  assert.equal(calls, 1);
});

test('relay rejects substituted archive bytes, unbound receipts and symbolic-link selections', async t => {
  const f = retainedManualFixture(), selected = await selectRetained(f.context, f.read, f.now);
  const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-retained-relay-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'selection.json'), bytes = retainedCanonical(selected) + '\n', digest = sha256(bytes);
  await writeFile(path, bytes, { mode: 0o600 });
  assert.deepEqual(readSelection(path, digest, f.context), selected);
  assert.throws(() => readSelection(path, sha256('wrong-receipt'), f.context));
  await writeFile(join(directory, 'be-release.tar.gz'), 'substituted archive', { mode: 0o600 });
  assert.throws(() => verifyRelay(directory, digest, f.context));
  await writeFile(path, retainedCanonical({ ...selected, packetDigest: sha256('changed') }) + '\n');
  const changedHash = sha256(readFileSync(path));
  assert.throws(() => readSelection(path, changedHash, f.context));
  await rm(path);
  const target = join(directory, 'selection-target.json');
  await writeFile(target, bytes, { mode: 0o600 });
  await symlink(target, path);
  assert.throws(() => readSelection(path, digest, f.context));
});

test('actual retained bundle manual reservation uses the current controller with sealed preflight and durable unknown-ACK fences',
  { skip: !process.env.MANUAL_ACTIVATION_TEST_BUNDLE }, async t => {
    const f = retainedManualFixture(), selected = await selectRetained(f.context, f.read, f.now);
    const bundleRoot = realpathSync(process.env.MANUAL_ACTIVATION_TEST_BUNDLE!);
    const bundle = await verifySelectedBundle(bundleRoot, selected, f.context);
    assert.equal(bundle.artifact.digest, retainedActivation.artifactDigest);
    assert.equal(bundle.artifact.manifest.source.revision, retainedActivation.revision);
    assert.notEqual(bundle.context.workflow.revision, bundle.artifact.manifest.source.revision);
    for (const changed of [{ ...f.packet, oldDigest: sha256('wrong-old') }, { ...f.packet, migrations: [] },
      { ...f.packet, bridgeConfigDigest: f.packet.appConfigDigest }, { ...f.packet, extra: true }]) {
      assert.throws(() => bundle.modules.journal.validateActivationPacket(changed, sha256(retainedCanonical(changed))));
    }
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-retained-manual-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const eventPath = join(directory, 'event.json');
    await writeFile(eventPath, JSON.stringify(f.event), { mode: 0o600 });
    const relay = join(directory, 'relay'); await mkdir(relay, { mode: 0o700 });
    const selectionBytes = retainedCanonical(selected) + '\n';
    await writeFile(join(relay, 'selection.json'), selectionBytes, { mode: 0o600 });
    await cp(join(dirname(bundleRoot), 'be-release.tar.gz'), join(relay, 'be-release.tar.gz'));
    assert.deepEqual(verifyRelay(relay, sha256(selectionBytes), f.context), selected);
    await writeFile(join(relay, 'unexpected.json'), '{}', { mode: 0o600 });
    assert.throws(() => verifyRelay(relay, sha256(selectionBytes), f.context));
    const env = { ...f.env, GITHUB_EVENT_PATH: eventPath, GITHUB_TOKEN: credentials.github,
      VERCEL_TOKEN: credentials.vercel, BE_PREVIEW_ACCESS_KEY: credentials.bearer };
    for (const scenario of ['confirmed', 'lost-reservation-ack', 'changed-main', 'changed-predecessor']) {
      const journalDirectory = join(directory, scenario);
      bundle.modules.privateFiles.privateDirectory(journalDirectory);
      bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, 'packet-input.json'), bundle.packet);
      let posts = 0;
      const transport: typeof fetch = async (raw, init) => {
        const url = new URL(String(raw)), headers = new Headers(init?.headers);
        if (url.origin === 'https://api.github.com') {
          assert.equal(headers.get('authorization'), `Bearer ${credentials.github}`);
          const path = url.pathname.slice(`/repos/${repository}`.length);
          if (path === '/commits/main') return Response.json(scenario === 'changed-main'
            ? { ...f.metadata.main, sha: retainedActivation.revision } : f.metadata.main);
          if (path === `/commits/${retainedActivation.revision}`) return Response.json(f.metadata.source);
          if (path === '/deployments' && init?.method !== 'POST') return Response.json([]);
          if (path === '/deployments' && init?.method === 'POST') {
            posts++;
            const lock = bundle.modules.releaseJournal.readEvidence(join(journalDirectory, 'operator.lock')).value;
            assert.equal(lock.packetDigest, f.context.packetDigest);
            const body = JSON.parse(String(init.body));
            assert.equal(body.ref, retainedActivation.revision);
            assert.equal(body.auto_merge, false);
            assert.deepEqual(body.required_contexts, []);
            assert.equal(body.payload.run, f.context.workflow.run);
            assert.equal(body.payload.revision, retainedActivation.revision);
            assert.equal(body.payload.tree, retainedActivation.tree);
            assert.equal(body.payload.artifact, retainedActivation.artifactDigest);
            assert.equal(body.payload.activationPacket, f.context.packetDigest);
            for (const value of Object.values(credentials)) assert.equal(JSON.stringify(body).includes(value), false);
            if (scenario === 'lost-reservation-ack') throw new Error('Synthetic lost reservation acknowledgement.');
            return Response.json({ id: 45, sha: retainedActivation.revision,
              task: 'deploy:esty-be-ci', environment: 'be-production' }, { status: 201 });
          }
        } else if (url.origin === 'https://api.vercel.com') {
          assert.equal(headers.get('authorization'), `Bearer ${credentials.vercel}`);
          assert.notEqual(init?.method, 'POST');
          if (url.pathname === `/v9/projects/${retainedActivation.project}`) return Response.json({
            id: retainedActivation.project, name: 'esty-admin-api', accountId: retainedActivation.scope,
            rootDirectory: 'apps/api', framework: 'nestjs', nodeVersion: '24.x',
            buildCommand: null, installCommand: null, outputDirectory: null,
            link: { type: 'github', org: 'khuonghuyhieu', repo: 'esty-admin', productionBranch: 'main', repoId: 1, deployHooks: [] },
          });
          if (url.pathname === `/v9/projects/${retainedActivation.project}/domains/api.lovora.us`) {
            return Response.json({ name: 'api.lovora.us', projectId: retainedActivation.project, verified: true });
          }
          if (url.pathname === '/v4/aliases/api.lovora.us') return Response.json({ alias: 'api.lovora.us',
            projectId: retainedActivation.project, deploymentId: scenario === 'changed-predecessor' ? 'dpl_changed' : f.packet.predecessorId });
        }
        throw new Error(`Unexpected synthetic activation request: ${url.origin}${url.pathname}`);
      };
      const execute = () => executeManualAction(bundle, 'reserve', '-', env, journalDirectory,
        join(directory, 'unused-vercel-cli.js'), AbortSignal.timeout(30000), transport);
      if (scenario === 'confirmed') {
        await execute();
        const journal = bundle.modules.journal.readActivationJournal(journalDirectory, bundle.packet, f.context.packetDigest);
        assert.equal(journal.journal, 45);
        assert.equal(journal.next, 'bridge-config');
        assert.deepEqual(journal.events, []);
        await assert.rejects(execute());
        assert.equal(posts, 1);
      } else if (scenario === 'lost-reservation-ack') {
        await assert.rejects(execute());
        assert.equal(posts, 1);
        assert.equal(existsSync(join(journalDirectory, 'operator.lock')), true);
        assert.throws(() => bundle.modules.journal.readActivationJournal(journalDirectory, bundle.packet, f.context.packetDigest));
        await assert.rejects(execute());
        assert.equal(posts, 1);
      } else {
        await assert.rejects(execute());
        assert.equal(posts, 0);
        assert.equal(existsSync(join(journalDirectory, 'operator.lock')), false);
      }
    }
  });

test('private mutations recheck authorized main before spawning and keep provider credentials out of real children',
  { skip: !process.env.MANUAL_ACTIVATION_TEST_BUNDLE || process.platform !== 'linux' }, async t => {
    const base = retainedManualFixture(), selected = await selectRetained(base.context, base.read, base.now);
    const bundle = await verifySelectedBundle(realpathSync(process.env.MANUAL_ACTIVATION_TEST_BUNDLE!), selected, base.context);
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-private-main-guard-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const eventPath = join(directory, 'event.json');
    await writeFile(eventPath, JSON.stringify(base.event), { mode: 0o600 });
    const childObservations: Array<{ phase: string; providerNames: string[]; error?: unknown }> = [];
    const originalSpawn = childProcess.spawn;
    t.mock.method(childProcess, 'spawn', ((...args: Parameters<typeof childProcess.spawn>) => {
      const child = Reflect.apply(originalSpawn, childProcess, args);
      child.once('spawn', () => {
        try {
          // Read only this newly spawned synthetic worker, once, on its spawn event; never poll or inspect other processes.
          const names = readFileSync(`/proc/${child.pid}/environ`, 'utf8').split('\0').map(item => item.split('=', 1)[0]!);
          childObservations.push({ phase: args[1]![2]!, providerNames: names.filter(name =>
            name.startsWith('GITHUB_') || ['VERCEL_TOKEN', 'VERCEL_API_TOKEN', 'BE_PREVIEW_ACCESS_KEY',
              'VERCEL_AUTOMATION_BYPASS_SECRET'].includes(name)) });
        } catch (error) { childObservations.push({ phase: args[1]![2]!, providerNames: [], error }); }
      });
      return child;
    }) as typeof childProcess.spawn);
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const fields = { 'bridge-config': 'ACTIVATION_BRIDGE_INPUTS', roles: 'ACTIVATION_ROLE_INPUTS',
      migration: 'ACTIVATION_MIGRATION_INPUTS', bootstrap: 'ACTIVATION_BOOTSTRAP_INPUTS', 'app-config': 'ACTIVATION_APP_INPUTS' };
    for (const phase of Object.keys(fields) as Array<keyof typeof fields>) {
      for (const scenario of ['unchanged', 'main-sha', 'main-tree', 'api-failure', 'missing-token', 'vercel-token']) {
        await t.test(`${phase}/${scenario}`, async () => {
          const f = retainedManualFixture(), journalDirectory = join(directory, `${phase}-${scenario}`);
          const input = { directory: journalDirectory, packet: bundle.packet, digest: base.context.packetDigest };
          const j = bundle.modules.journal;
          j.createActivationJournal(journalDirectory, input.packet, input.digest);
          j.reserveActivationJournal(journalDirectory, input.packet, input.digest, 45);
          bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, 'packet-input.json'), input.packet);
          // Synthetic prior phases use the existing journal fixture protocol; no external phase is executed.
          for (const prior of activationPhases) {
            if (prior === phase) break;
            const intent = j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'intent', { outcome: 'unknown' });
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'authorized', { intentHash: intent.head });
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'started', { outcome: 'unknown' });
            const deploymentId = prior === 'bridge' || prior === 'app' ? `dpl_${prior}` : null;
            if (deploymentId) {
              j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'acknowledged', { deploymentId });
              j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'candidate-attested',
                { deploymentId, configDigest: prior === 'bridge' ? input.packet.bridgeConfigDigest : input.packet.appConfigDigest });
              j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'promotion-intent', { deploymentId });
            }
            const result = prior === 'bridge-config' || prior === 'app-config'
              ? j.saveActivationConfigurationReceipt(journalDirectory, input.packet, input.digest, prior, configurationReceiptFixture(input.packet, prior))
              : { result: 'confirmed', databaseOutcome: ['roles', 'migration', 'bootstrap'].includes(prior) ? 'committed' : 'not_started',
                count: prior === 'roles' || prior === 'migration' ? 2 : 1, deploymentId, reportDigest: sha256(prior) };
            const completed = j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'outcome', result);
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'confirming', { outcomeHash: completed.head });
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'remote-confirmed', { outcomeHash: completed.head });
          }
          bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, `${input.packet.runId}.initial.json`),
            { version: 1, packetDigest: input.digest, inputDigest: input.packet.roleInputDigest,
              history: input.packet.migrations.slice(0, 1).map((item: { name: string }) => item.name), roles: 'compatible-or-absent' });
          if (phase === 'bootstrap' || phase === 'app-config') {
            const started = j.readActivationJournal(journalDirectory, input.packet, input.digest).events
              .find((event: { phase: string; kind: string }) => event.phase === 'migration' && event.kind === 'started');
            bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, `${input.packet.runId}.postflight.json`),
              { version: 1, packetDigest: input.digest, inputDigest: input.packet.roleInputDigest, startedHash: started.sha256,
                history: input.packet.migrations.map((item: { name: string }) => item.name), roles: 'target-confirmed' });
          }
          let authorization = '';
          await bundle.modules.activation.authorizeActivationPhase(input, phase, {
            currentMain: () => verifyWorkflowHead(selected, f.read),
            async binding(id: string) { assert.equal(id, phase === 'bridge-config' ? input.packet.predecessorId : 'dpl_bridge'); },
            async record(_id: number, _state: string, description: string) { authorization = description; },
            async confirmJournal(_id: number, _state: string, description: string) { assert.equal(description, authorization); },
          });
          const before = j.readActivationJournal(journalDirectory, input.packet, input.digest);
          assert.equal(before.events.at(-1).kind, 'authorized');
          if (scenario === 'main-sha') f.metadata.main.sha = retainedActivation.revision;
          if (scenario === 'main-tree') f.metadata.main.commit.tree.sha = retainedActivation.tree;
          const env: NodeJS.ProcessEnv = { ...f.env, GITHUB_EVENT_PATH: eventPath, GITHUB_TOKEN: credentials.github,
            [fields[phase]]: '{}' };
          if (phase === 'bridge-config' || phase === 'app-config') env.VERCEL_CONFIGURATION_TOKEN = 'synthetic-config-token';
          if (scenario === 'missing-token') delete env.GITHUB_TOKEN;
          if (scenario === 'vercel-token') env.VERCEL_TOKEN = credentials.vercel;
          let requests = 0;
          const transport: typeof fetch = async (raw, init) => {
            requests++;
            assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${credentials.github}`);
            assert.equal(init?.method ?? 'GET', 'GET');
            if (scenario === 'api-failure') throw new Error('Synthetic metadata API unavailable.');
            const url = new URL(String(raw));
            assert.equal(url.origin, 'https://api.github.com');
            return Response.json(await f.read(url.pathname.slice(`/repos/${repository}`.length)));
          };
          const childrenBefore = childObservations.length;
          // Unchanged head admits the real sealed worker. Deliberately invalid synthetic phase inputs then fence it before external work.
          await assert.rejects(executeManualAction(bundle, 'run', phase, env, journalDirectory,
            join(directory, 'unused-cli.js'), AbortSignal.timeout(30000), transport));
          const after = j.readActivationJournal(journalDirectory, input.packet, input.digest);
          if (scenario === 'unchanged') {
            assert.equal(requests, 2);
            assert.equal(childObservations.length, childrenBefore + 1);
            assert.deepEqual(childObservations.at(-1), { phase, providerNames: [] });
            assert.ok(after.events.some((event: { phase: string; kind: string }) => event.phase === phase && event.kind === 'started'));
          } else {
            assert.equal(requests, scenario === 'missing-token' || scenario === 'vercel-token' ? 0 : 1);
            assert.equal(childObservations.length, childrenBefore);
            assert.equal(after.head, before.head);
          }
        });
      }
    }
  });

test('failed-preflight archive proves intact reservation and rejects events, initial proof, changed lock and incomplete inventory', async t => {
  if (historicalActivationChild(t.name)) return;
  const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-terminal-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const packet = activationPacket(), digest = sha256(canonical(packet)), root = join(directory, 'be-receipts');
  createActivationJournal(root, packet, digest); reserveActivationJournal(root, packet, digest, 45);
  writeReleaseEvidence(join(root, 'packet-input.json'), packet);
  const archivePath = join(directory, 'receipts.tar.gz');
  const pack = (inventoryDigest = sha256(canonical(inventory(root)))) => {
    childProcess.execFileSync('tar', ['--format=ustar', '-czf', archivePath, '-C', directory, 'be-receipts'],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    const bytes = readFileSync(archivePath);
    return receiptZip([['be-delivery-receipts.tar.gz', bytes],
      ['be-delivery-receipts.inventory-sha256', Buffer.from(inventoryDigest + '\n')],
      ['be-delivery-receipts.archive-sha256', Buffer.from(`${sha256(bytes)}  /synthetic/be-delivery-receipts.tar.gz\n`)]]);
  };
  const validate = (zip: Buffer) => validatePreflightReceiptArchive(zip, sha256(zip), { runId: packet.runId, packetDigest: digest });
  const original = pack(), proof = validate(original);
  assert.equal(proof.journal, 45); assert.deepEqual(proof.packet, packet);
  assert.equal(proof.inventoryDigest, sha256(canonical(inventory(root))));
  assert.throws(() => validatePreflightReceiptArchive(original, sha256('substituted archive'), { runId: packet.runId, packetDigest: digest }));
  assert.throws(() => validatePreflightReceiptArchive(original, sha256(original), { runId: randomUUID(), packetDigest: digest }));
  assert.throws(() => validate(pack(sha256('incomplete inventory'))));
  for (const name of [`activation/${packet.runId}/000.json`, 'initial-proof.json', 'candidate.json']) {
    const path = join(root, name); writeReleaseEvidence(path, { unexpected: true });
    assert.throws(() => validate(pack()), name); await rm(path);
  }
  const lockPath = join(root, 'operator.lock'), lock = readFileSync(lockPath);
  await writeFile(lockPath, canonical({ version: 1, kind: 'activation', runId: packet.runId, packetDigest: sha256('other packet') }));
  assert.throws(() => validate(pack())); await writeFile(lockPath, lock);
  const reservation = join(root, 'activation', packet.runId, 'reservation.json'), bytes = readFileSync(reservation);
  await rm(reservation); assert.throws(() => validate(pack())); await writeFile(reservation, bytes, { mode: 0o600 });
  await chmod(lockPath, 0o640); assert.throws(() => validate(pack())); await chmod(lockPath, 0o600);
  const changed = Buffer.from(original); changed[50] = changed[50]! ^ 1;
  assert.throws(() => validatePreflightReceiptArchive(changed, sha256(original), { runId: packet.runId, packetDigest: digest }));
  assert.deepEqual(validate(pack()).packet, packet);
});
test('manual reservation refuses missing, unrelated failed, cross-project and consumed execution history without POST', async t => {
  const f = retainedManualFixture(), selected = await selectRetained(f.context, f.read, f.now);
  const bundle = { context: f.context, packet: f.packet, selection: selected };
  for (const scenario of ['no-status', 'unknown', 'unrelated-error', 'wrong-project', 'consumed-run', 'consumed-packet', 'success', 'changed-head', 'lost-ack']) {
    await t.test(scenario, async () => {
      let posts = 0, headChecks = 0;
      const payload = { project: scenario === 'wrong-project' ? 'prj_other' : retainedActivation.project,
        run: scenario === 'consumed-run' ? f.context.workflow.run : '42',
        activationRun: scenario === 'consumed-packet' ? f.packet.runId : randomUUID() };
      const transport: typeof fetch = async (raw, options) => {
        const url = new URL(String(raw));
        if (options?.method === 'POST') {
          posts++;
          if (scenario === 'lost-ack') throw new Error('Synthetic acknowledgement loss');
          return Response.json({ id: 46, sha: retainedActivation.revision, task: 'deploy:esty-be-ci', environment: 'be-production' }, { status: 201 });
        }
        if (url.pathname.endsWith('/deployments')) return Response.json([{ id: 45, task: 'deploy:esty-be-ci', environment: 'be-production', payload }]);
        if (url.pathname.endsWith('/statuses')) return Response.json(scenario === 'no-status' ? [] : [{ id: 1,
          state: scenario === 'unknown' ? 'in_progress' : scenario === 'unrelated-error' ? 'error' : 'success', description: 'not an approved disposition' }]);
        throw new Error('Unexpected proof lookup for an unrelated failed execution.');
      };
      const currentMain = async () => { headChecks++; if (scenario === 'changed-head' && headChecks === 2) throw new Error('Main advanced'); };
      const operation = reserveManualActivation(bundle, { GITHUB_TOKEN: credentials.github }, AbortSignal.timeout(10000), transport, currentMain);
      if (scenario === 'success') { assert.equal(await operation, 46); assert.equal(posts, 1); assert.equal(headChecks, 2); }
      else { await assert.rejects(operation); assert.equal(posts, scenario === 'lost-ack' ? 1 : 0); }
    });
  }
});
test('fixed failed-preflight exception cannot be selected for another packet, run, repository or incomplete run', async () => {
  const pin = retainedActivation, oldRun = '42847325668', revision = 'a'.repeat(40);
  const intent = { id: 45, sha: pin.revision, task: 'deploy:esty-be-ci', environment: 'be-production', production_environment: true,
    payload: { version: 1, revision: pin.revision, tree: pin.tree, run: oldRun, artifact: pin.artifactDigest,
      sourceDigest: pin.sourceDigest, migrationDigest: activationSchema.targetDigest, project: pin.project,
      activationPacket: '8385563025717633d77f7a2a38e3fc26f5b7e51ab9fb2b81086eee3edde15382',
      activationRun: '36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed' } };
  const run = { id: Number(oldRun), run_attempt: 1, status: 'completed', conclusion: 'failure', event: 'workflow_dispatch',
    head_branch: 'main', head_sha: revision, path: pin.workflowPath, repository: { full_name: pin.repository }, head_repository: { full_name: pin.repository } };
  for (const change of [{ status: 'in_progress' }, { run_attempt: 2 }, { conclusion: 'success' },
    { repository: { full_name: 'fork/esty-admin' } }, { head_repository: { full_name: 'fork/esty-admin' } }, { path: '.github/workflows/other.yml' }]) {
    let archiveReads = 0;
    const io = { read: async (path: string) => path.startsWith('/deployments/') ? intent : { ...run, ...change },
      download: async () => { archiveReads++; return Buffer.alloc(0); } };
    await assert.rejects(failedPreflightProof(io, intent, async () => { throw new Error('Artifact must not be reached.'); }));
    assert.equal(archiveReads, 0);
  }
  for (const payload of [{ ...intent.payload, run: '454' }, { ...intent.payload, activationPacket: sha256('other packet') },
    { ...intent.payload, project: 'prj_other' }, { ...intent.payload, activationRun: randomUUID() }]) {
    await assert.rejects(failedPreflightProof({ read: async () => { throw new Error('No lookup permitted.'); } },
      { ...intent, payload }, async () => {}));
  }
});
test('receipt download never forwards GitHub authorization to the signed artifact host or follows an arbitrary redirect', async () => {
  const token = 'synthetic-github-artifact-read-token';
  for (const location of ['https://synthetic.blob.core.windows.net/receipts?sig=synthetic', 'https://attacker.invalid/receipts',
    'http://synthetic.blob.core.windows.net/receipts', 'https://user:password@synthetic.blob.core.windows.net/receipts']) {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const io = manualGithubIo(token, AbortSignal.timeout(10000), async (raw, init) => {
      calls.push({ url: String(raw), authorization: new Headers(init?.headers).get('authorization') });
      if (calls.length === 1) return new Response(null, { status: 302, headers: { location } });
      return new Response(Buffer.from('synthetic zip'));
    });
    if (location.startsWith('https://synthetic.')) {
      assert.equal((await io.download(1)).toString(), 'synthetic zip');
      assert.deepEqual(calls.map(call => call.authorization), [`Bearer ${token}`, null]);
    } else { await assert.rejects(io.download(1)); assert.equal(calls.length, 1); }
  }
});

test('held proof import independently binds environment metadata, reviewed source, successful run and exact receipt archive', async () => {
  const f = heldProofFixture();
  const proof = await verifyHeldAppProbe(f.workflowRun, f.target, f.io, f.sourceDigests, AbortSignal.timeout(10000));
  assert.equal(proof.binding.candidate, f.target.candidate);
  assert.equal(proof.bindingDigest, sha256(canonical(f.binding)));
  assert.equal(proof.archiveDigest, f.values[f.artifactPath].artifacts[0].digest.slice(7));
  assert.deepEqual(proof.checks, { live: 'passed', computedRuntimeDigest: 'passed', target: 'not-proved', authMembership: 'not-proved' });
  assert.equal(f.reads.filter(path => path === f.variablePath).length, 2);
  assert.deepEqual(f.downloads, [f.artifactId]);
});

test('held proof import rejects forged, stale, incomplete and changed protected evidence', async t => {
  for (const scenario of ['missing-environment-variable', 'different-held-id', 'disabled-pin', 'different-pin-origin',
    'changed-source', 'stale-main', 'wrong-repository', 'wrong-branch', 'failed-run', 'rerun', 'expired-artifact',
    'duplicate-artifact', 'incomplete-artifacts', 'wrong-archive-digest', 'wrong-live-digest', 'extra-receipt-field',
    'extra-zip-member', 'variable-drift', 'main-drift', 'run-drift']) await t.test(scenario, async () => {
    const f = heldProofFixture(), artifact = f.values[f.artifactPath].artifacts[0];
    if (scenario === 'missing-environment-variable') delete f.values[f.variablePath];
    if (scenario === 'different-held-id') f.values[f.variablePath].value = JSON.stringify({ ...f.binding, candidate: 'dpl_OtherHeld' });
    if (scenario === 'disabled-pin') f.setSource(heldPinPath, Buffer.from(JSON.stringify({ version: 1, enabled: false, target: null })));
    if (scenario === 'different-pin-origin') f.setSource(heldPinPath, Buffer.from(JSON.stringify({
      version: 1, enabled: true, target: { ...f.target, origin: 'https://substitute.vercel.app' } })));
    if (scenario === 'changed-source') f.setSource(heldProbeSources[0]!, Buffer.from('unreviewed executable source'));
    if (scenario === 'stale-main') f.values['/commits/main'].sha = 'c'.repeat(40);
    if (scenario === 'wrong-repository') f.values[f.runPath].repository.full_name = 'other/repository';
    if (scenario === 'wrong-branch') f.values[f.runPath].head_branch = 'other';
    if (scenario === 'failed-run') f.values[f.runPath].conclusion = 'failure';
    if (scenario === 'rerun') f.values[f.runPath].run_attempt = 2;
    if (scenario === 'expired-artifact') artifact.expired = true;
    if (scenario === 'duplicate-artifact') {
      f.values[f.artifactPath].artifacts.push({ ...artifact, id: 789 }); f.values[f.artifactPath].total_count = 2;
    }
    if (scenario === 'incomplete-artifacts') f.values[f.artifactPath].total_count = 101;
    if (scenario === 'wrong-archive-digest') artifact.digest = `sha256:${sha256('wrong archive')}`;
    if (scenario === 'wrong-live-digest') f.setReceipt({ ...f.receipt, configDigestMatch: false });
    if (scenario === 'extra-receipt-field') f.setReceipt({ ...f.receipt, callerApproved: true });
    if (scenario === 'extra-zip-member') f.setReceipt(f.receipt, [['untrusted.json', Buffer.from('{}')]]);
    const counts = new Map<string, number>(), io = { ...f.io, async read(path: string) {
      const count = (counts.get(path) ?? 0) + 1; counts.set(path, count);
      if (count === 2 && path === f.variablePath && scenario === 'variable-drift') f.values[path].value = '{}';
      if (count === 2 && path === '/commits/main' && scenario === 'main-drift') f.values[path].sha = 'c'.repeat(40);
      if (count === 2 && path === f.runPath && scenario === 'run-drift') f.values[path].run_attempt = 2;
      return f.io.read(path);
    } };
    await assert.rejects(verifyHeldAppProbe(f.workflowRun, f.target, io, f.sourceDigests, AbortSignal.timeout(10000)));
    assert.ok(f.downloads.length <= 1);
  });
});

test('D2 independent acceptance binds new executable provenance, protected gate and exact held target', async t => {
  const target = { ...heldAppPolicy, candidate: heldD2.candidate, origin: heldD2.origin, configDigest: heldD2.configDigest,
    createClaimDigest: heldD2.createClaimDigest, createAckDigest: heldD2.createAckDigest, heldReceiptDigest: heldD2.heldReceiptDigest };
  const gate = { version: 1 as const, stage: 'candidate' as const, head: heldD2.head,
    claimDigest: sha256('synthetic exclusive D2 claim'), controllerRevision: 'b'.repeat(40) };
  for (const scenario of ['valid', 'old-live-proof', 'old-source-pins', 'wrong-gate', 'wrong-target', 'partial-receipt',
    'source-drift', 'gate-race', 'stale-main', 'failed-run', 'wrong-artifact']) await t.test(scenario, async () => {
    const f = heldProofFixture(target, undefined, gate);
    if (scenario === 'old-live-proof') f.setReceipt({ ...f.receipt, kind: 'held-app-live' });
    if (scenario === 'old-source-pins') delete f.sourceDigests['apps/api/scripts/hosted-acceptance.ts'];
    if (scenario === 'wrong-gate') f.setReceipt({ ...f.receipt, gateDigest: sha256('stale gate') });
    if (scenario === 'wrong-target') f.target = { ...target, candidate: 'dpl_ArbitraryCaller' };
    if (scenario === 'partial-receipt') f.setReceipt({ ...f.receipt, acceptance: 'not-proved' });
    if (scenario === 'source-drift') f.setSource('apps/api/scripts/hosted-acceptance.ts', Buffer.from('changed'));
    if (scenario === 'stale-main') f.values['/commits/main'].sha = 'c'.repeat(40);
    if (scenario === 'failed-run') f.values[f.runPath].conclusion = 'failure';
    if (scenario === 'wrong-artifact') f.values[f.artifactPath].artifacts[0].workflow_run.head_sha = 'c'.repeat(40);
    const original = f.io.read; let gateReads = 0;
    f.io.read = async path => {
      const value = await original(path);
      if (scenario === 'gate-race' && path.endsWith(heldD2.gateVariable) && ++gateReads === 2)
        return { name: heldD2.gateVariable, value: '{}' };
      return value;
    };
    const operation = verifyHeldAppAcceptance(f.workflowRun, f.target, f.io, f.sourceDigests, new AbortController().signal, gate);
    if (scenario === 'valid') {
      const proof = await operation;
      assert.equal(proof.kind, 'github-held-app-acceptance'); assert.equal(proof.checks.target, 'passed');
      assert.equal(proof.checks.authMembership, 'not-proved'); assert.deepEqual(proof.gate, gate);
      assert.deepEqual(Object.keys(proof.sourceDigests).sort(), [...heldD2Sources].sort());
    } else await assert.rejects(operation);
  });
});

test('retained D2 proof independently pins historical run and actual new controller without relaxing default main fences', async t => {
  const target = { ...heldAppPolicy, candidate: heldD2.candidate, origin: heldD2.origin, configDigest: heldD2.configDigest,
    createClaimDigest: heldD2.createClaimDigest, createAckDigest: heldD2.createAckDigest, heldReceiptDigest: heldD2.heldReceiptDigest };
  const gate = { version: 1 as const, stage: 'candidate' as const, head: heldD2.head,
    claimDigest: heldRetainedCandidate.prepareClaimDigest, controllerRevision: heldRetainedCandidate.proofPublication.revision };
  const publication = { revision: 'b'.repeat(40), tree: 'c'.repeat(40) };
  for (const scenario of ['valid', 'no-context', 'arbitrary-context', 'wrong-run', 'old-main', 'new-tree', 'target',
    'old-pin', 'new-pin', ...heldD2Sources.map((_, index) => `old-source-${index}`),
    ...heldD2Sources.map((_, index) => `new-source-${index}`), 'new-blob', 'gate-race', 'binding-race',
    'main-race', 'artifact-race', 'read-refused', 'final-context']) await t.test(scenario, async () => {
    const f = heldRetainedProofFixture(target, gate, publication);
    const context = structuredClone(f.context);
    if (scenario === 'arbitrary-context') context.binding = { ...context.binding, failedClaimDigest: sha256('arbitrary claim') } as typeof context.binding;
    if (scenario === 'old-main') f.values['/commits/main'].sha = gate.controllerRevision;
    if (scenario === 'new-tree') f.values['/commits/main'].commit.tree.sha = 'd'.repeat(40);
    if (scenario === 'target') f.target = { ...target, candidate: 'dpl_Substitute' };
    if (scenario === 'old-pin' || scenario === 'new-pin') f.setSource(heldPinPath,
      Buffer.from(JSON.stringify({ version: 1, enabled: true, target: { ...target, candidate: 'dpl_Substitute' } })),
      scenario === 'old-pin' ? gate.controllerRevision : publication.revision);
    if (scenario.startsWith('old-source-') || scenario.startsWith('new-source-')) {
      const index = Number(scenario.at(-1));
      f.setSource(heldD2Sources[index]!, Buffer.from('changed proof implementation'),
        scenario.startsWith('old-') ? gate.controllerRevision : publication.revision);
    }
    if (scenario === 'new-blob') f.values[`/contents/${heldD2Sources[0]}?ref=${publication.revision}`].sha = 'd'.repeat(40);
    const counts = new Map<string, number>(), original = f.io.read;
    f.io.read = async path => {
      const count = (counts.get(path) ?? 0) + 1; counts.set(path, count);
      if (scenario === 'read-refused') throw new Error('Synthetic metadata read refused');
      if (count === 2) {
        if (scenario === 'gate-race' && path.endsWith(heldD2.gateVariable)) f.values[path].value = '{}';
        if (scenario === 'binding-race' && path === f.variablePath) f.values[path].value = '{}';
        if (scenario === 'main-race' && path === '/commits/main') f.values[path].sha = 'd'.repeat(40);
        if (scenario === 'artifact-race' && path === f.artifactPath) f.values[path].artifacts[0].digest = `sha256:${sha256('changed archive')}`;
      }
      return original(path);
    };
    const operation = verifyHeldAppAcceptance(scenario === 'wrong-run' ? '123' : f.workflowRun, f.target, f.io,
      f.sourceDigests, AbortSignal.timeout(10000), scenario === 'final-context' ? { ...gate, stage: 'final' } : gate,
      scenario === 'no-context' ? undefined : context);
    if (scenario === 'valid') {
      const proof = await operation;
      assert.equal(proof.workflowRun, '43826155118'); assert.equal(proof.binding.workflowRevision, gate.controllerRevision);
      assert.deepEqual(proof.retainedCandidate, f.context);
      for (const path of [...heldD2Sources, heldPinPath]) {
        assert.ok(f.reads.includes(`/contents/${path}?ref=${gate.controllerRevision}`));
        assert.ok(f.reads.includes(`/contents/${path}?ref=${publication.revision}`));
      }
      assert.equal(counts.get('/commits/main'), 2); assert.equal(counts.get(f.artifactPath), 2);
    } else await assert.rejects(operation);
  });
});

test('required-checks diagnostics retain failing test stdout stderr and stage exit', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-log-')); t.after(() => rm(root, { recursive: true, force: true }));
  const diagnostics = new ChecksDiagnostics(join(root, 'logs'));
  await assert.rejects(diagnostics.stage('functional', () => checked(process.execPath, ['-e',
    'console.log("public-test-name");console.error(new Error("assertion expected ready200 got503").stack);process.exitCode=7'],
  root, { PATH: '/usr/bin:/bin' }, AbortSignal.timeout(5000), diagnostics)));
  const failed = JSON.parse(await readFile(join(root, 'logs/failed-stage.json'), 'utf8'));
  assert.equal(failed.code, 7); assert.equal(failed.status, 'failed'); assert.equal(failed.signal, null);
  assert.ok(failed.parents.includes('functional')); assert.ok(failed.durationMs >= 0);
  assert.match(await readFile(join(root, 'logs', failed.stdout), 'utf8'), /public-test-name/);
  const stderr = await readFile(join(root, 'logs', failed.stderr), 'utf8');
  assert.match(stderr, /assertion expected ready200 got503/); assert.match(stderr, /at \[eval\]/);
});

test('required-checks diagnostics mask split secrets URLs headers and command arguments', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-mask-')); t.after(() => rm(root, { recursive: true, force: true }));
  const secret = 'fixtureConfidential987654', argument = 'argumentConfidential123456';
  const diagnostics = new ChecksDiagnostics(join(root, 'logs'), { secrets: [secret] });
  const consoleOutput: string[] = [], originalSpawn = childProcess.spawn;
  t.mock.method(console, 'info', (...args: unknown[]) => consoleOutput.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => consoleOutput.push(args.join(' ')));
  t.mock.method(childProcess, 'spawn', (...args: Parameters<typeof childProcess.spawn>) => {
    const child = originalSpawn(...args);
    // Real subprocess bytes, deterministically fragmented at every possible UTF-8/secret boundary.
    for (const stream of [child.stdout, child.stderr]) if (stream) {
      const emit = stream.emit.bind(stream);
      stream.emit = (event: string | symbol, ...values: unknown[]) => {
        if (event === 'data' && Buffer.isBuffer(values[0])) {
          for (const byte of values[0]) emit('data', Buffer.from([byte]));
          return true;
        }
        return emit(event, ...values);
      };
    }
    return child;
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const script = `process.stdout.write("case name preserved\\n${secret.slice(0, 10)}",()=>{
    process.stdout.write("${secret.slice(10)}\\nhttps://user:password987@public.invalid/path\\npublic café\\n");
    process.stderr.write("Authorization: Bearer headerValue987\\nCookie: sid=cookieValue987\\n");
    process.exitCode=9;});`;
  await assert.rejects(checked(process.execPath, ['-e', script, '--', '--token', argument], root,
    { PATH: '/usr/bin:/bin', PRIVATE_KEY: secret }, AbortSignal.timeout(5000), diagnostics));
  const logs = (await Promise.all((await fsPromises.readdir(join(root, 'logs'))).map(path => readFile(join(root, 'logs', path), 'utf8')))).join('') + consoleOutput.join('\n');
  for (const value of [secret, secret.slice(0, 10), secret.slice(10), argument, 'password987', 'headerValue987', 'cookieValue987']) assert.ok(!logs.includes(value));
  assert.match(logs, /case name preserved/); assert.match(logs, /public café/); assert.match(logs, /REDACTED/);
});

test('required-checks diagnostics retain signal abort overflow and spawn failure', async t => {
  for (const scenario of ['signal', 'abort', 'pre-abort', 'overflow', 'spawn'] as const) await t.test(scenario, async t => {
    const root = await mkdtemp(join(tmpdir(), 'esty-checks-exit-')); t.after(() => rm(root, { recursive: true, force: true }));
    const diagnostics = new ChecksDiagnostics(join(root, 'logs'), { outputLimit: 4096 });
    const abort = new AbortController();
    if (scenario === 'pre-abort') abort.abort();
    if (scenario === 'abort') {
      const original = childProcess.spawn;
      t.mock.method(childProcess, 'spawn', (...args: Parameters<typeof childProcess.spawn>) => {
        const child = original(...args); child.stdout?.once('data', () => abort.abort()); return child;
      });
      syncBuiltinESMExports();
      t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    }
    const script = scenario === 'signal' ? 'console.log("before signal");process.kill(process.pid,"SIGTERM")'
      : scenario === 'overflow' ? 'process.stdout.write("x".repeat(16384))'
      : 'function emit(){process.stdout.write("before cancellation\\n",()=>setImmediate(emit))}emit()';
    await assert.rejects(checked(scenario === 'spawn' ? join(root, 'absent-binary') : process.execPath,
      ['-e', script], root, { PATH: '/usr/bin:/bin' }, abort.signal, diagnostics));
    const failed = JSON.parse(await readFile(join(root, 'logs/failed-stage.json'), 'utf8'));
    if (scenario === 'signal') assert.equal(failed.signal, 'SIGTERM');
    if (scenario === 'abort' || scenario === 'pre-abort') assert.equal(failed.aborted, true);
    if (scenario === 'overflow') { assert.equal(failed.outputLimit, true); assert.ok(failed.truncation.length > 0); }
    if (scenario === 'spawn') assert.match(failed.error, /ENOENT/);
    assert.equal(failed.status, 'failed');
  });
});

test('required-checks diagnostics bound long lines and disk output with explicit markers', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-bound-')); t.after(() => rm(root, { recursive: true, force: true }));
  const diagnostics = new ChecksDiagnostics(join(root, 'logs'), { lineLimit: 128, fileLimit: 512, totalLimit: 1024 });
  await checked(process.execPath, ['-e', 'console.log("x".repeat(1024));console.log("following test intact");console.log("ok\\n".repeat(1000))'],
    root, { PATH: '/usr/bin:/bin' }, AbortSignal.timeout(5000), diagnostics);
  const records = (await fsPromises.readdir(join(root, 'logs'))).filter(path => path.endsWith('.json'));
  const record = JSON.parse(await readFile(join(root, 'logs', records[0]!), 'utf8'));
  assert.ok(record.truncation.includes('stdout:line-limit')); assert.ok(record.truncation.includes('stdout:disk-limit'));
  const bytes = await readFile(join(root, 'logs', record.stdout));
  assert.ok(bytes.length <= 512); assert.match(bytes.toString(), /following test intact/);
});

test('required-checks diagnostics preserve primary stack cause and first failure through persistence errors', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-cause-')); t.after(() => rm(root, { recursive: true, force: true }));
  const diagnostics = new ChecksDiagnostics(join(root, 'logs'));
  const primary = new Error('public outer assertion', { cause: new Error('public inner cause') });
  await assert.rejects(diagnostics.stage('parent', () => diagnostics.stage('first-child', () => { throw primary; })), error => error === primary);
  const first = JSON.parse(await readFile(join(root, 'logs/failed-stage.json'), 'utf8'));
  assert.equal(first.stage, 'first-child'); assert.match(first.error, /public outer assertion/);
  assert.match(first.error, /public inner cause/); assert.match(first.error, /ci\.test\.js:/);
  const original = fs.writeFileSync, output: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
    if (String(args[0]).startsWith(join(root, 'logs'))) throw new Error('synthetic disk unavailable');
    return original(...args);
  });
  await assert.rejects(diagnostics.stage('later-cleanup', () => { throw primary; }), error => error === primary);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'logs/failed-stage.json'), 'utf8')), first);
  assert.match(output.join('\n'), /public outer assertion/); assert.match(output.join('\n'), /diagnostics-write-failed/);
});

test('required-checks opt-in leaves default provider command nonlogging unchanged', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-default-')); t.after(() => rm(root, { recursive: true, force: true }));
  const output: unknown[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => output.push(args));
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args));
  const result = await command(process.execPath, ['-e', 'console.log("dpl_known");console.error("private-provider-canary");process.exitCode=1'],
    root, { PATH: '/usr/bin:/bin' }, AbortSignal.timeout(5000));
  assert.equal(result.stdout.trim(), 'dpl_known'); assert.equal(result.code, 1);
  await assert.rejects(checked(process.execPath, ['-e', 'console.error("private-provider-canary");process.exitCode=1'],
    root, { PATH: '/usr/bin:/bin' }, AbortSignal.timeout(5000)), error => {
    assert.ok(error instanceof Error); assert.ok(!String(error.stack).includes('private-provider-canary')); return true;
  });
  assert.deepEqual(output, []); assert.deepEqual(await fsPromises.readdir(root), []);
});

test('required-checks failed preflight persists pointer and publishes no approval', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-preflight-')); t.after(() => rm(root, { recursive: true, force: true }));
  const diagnostics = new ChecksDiagnostics(join(root, 'logs'));
  await assert.rejects(runChecks(root, join(root, 'transfer'), {}, AbortSignal.timeout(5000), diagnostics));
  const failed = JSON.parse(await readFile(join(root, 'logs/failed-stage.json'), 'utf8'));
  assert.equal(failed.stage, 'preflight'); assert.match(failed.error, /Unsupported checks context/);
  assert.equal(existsSync(join(root, 'transfer/be-release-approval.json')), false);
  assert.equal(existsSync(join(root, 'transfer/be-release.tar.gz')), false);
});

test('required-checks operator staging exposes public cause only with explicit opt-in', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-stage-diagnostics-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  for (const directory of ['scripts', 'build/scripts', 'build/src/generated']) await mkdir(join(root, directory), { recursive: true });
  for (const file of ['scripts/stage-operator.mjs', 'scripts/migration-files.mjs', 'build/src/generated/migrations.js',
    'build/scripts/checks-diagnostics.js']) await cp(join('apps/api', file), join(root, file));
  const invoke = (args: string[]) => childProcess.spawnSync(process.execPath, [join(root, 'scripts/stage-operator.mjs'), ...args],
    { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000 });
  const normal = invoke([]), diagnostic = invoke(['--checks-diagnostics']);
  assert.equal(normal.status, 1); assert.ok(!normal.stderr.includes('ENOENT'));
  assert.equal(diagnostic.status, 1); assert.match(diagnostic.stderr, /ENOENT/);
  assert.match(diagnostic.stderr, /migrationFiles/); assert.match(diagnostic.stderr, /migrations/);
});

test('required-checks final persistence failure cannot return a passing stage', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-final-write-')); t.after(() => rm(root, { recursive: true, force: true }));
  const diagnostics = new ChecksDiagnostics(join(root, 'logs')), original = fs.writeFileSync;
  const events: Array<{ event: string; status?: string }> = [];
  t.mock.method(console, 'info', (line: string) => events.push(JSON.parse(line)));
  t.mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
    if (String(args[0]).endsWith('-stage.json') && String(args[1]).includes('"status":"passed"')) throw new Error('public final write failed');
    return original(...args);
  });
  await assert.rejects(diagnostics.stage('checks-complete', () => 'candidate-success'));
  const failed = JSON.parse(await readFile(join(root, 'logs/failed-stage.json'), 'utf8'));
  assert.equal(failed.status, 'failed'); assert.match(failed.error, /persistence/);
  assert.deepEqual(events.filter(event => event.event === 'checks-stage-end').map(event => event.status), ['failed']);
});

test('required-checks lost log storage preserves child assertions in bounded safe console fallback', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-checks-storage-')); t.after(() => rm(root, { recursive: true, force: true }));
  const diagnostics = new ChecksDiagnostics(join(root, 'logs')), original = fs.appendFileSync, output: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(fs, 'appendFileSync', (...args: Parameters<typeof fs.appendFileSync>) => {
    if (String(args[0]).startsWith(join(root, 'logs'))) throw new Error('public disk write refused');
    return original(...args);
  });
  await assert.rejects(checked(process.execPath, ['-e',
    'console.log("failing test name");console.error(new Error("assertion actual503 expected200").stack);console.error("password=storageCanary987");process.exitCode=7'],
  root, { PATH: '/usr/bin:/bin' }, AbortSignal.timeout(5000), diagnostics));
  const failed = JSON.parse(await readFile(join(root, 'logs/failed-stage.json'), 'utf8'));
  assert.equal(failed.code, 7); assert.match(failed.error, /exit=7/);
  assert.match(output.join('\n'), /failing test name/); assert.match(output.join('\n'), /assertion actual503 expected200/);
  assert.match(output.join('\n'), /at \[eval\]/); assert.ok(!output.join('\n').includes('storageCanary987'));
  assert.ok(failed.persistenceErrors.length > 0);
});

test('end-to-end diagnostics name event-file and context refusals without secret values', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-e2e-context-')); t.after(() => rm(root, { recursive: true, force: true }));
  const f = routineMetadataFixture(), eventPath = join(root, 'event.json'), logs: string[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(root, 'logs'), { scope: 'release' });
  await writeFile(eventPath, JSON.stringify(f.event), { mode: 0o600 });
  const env = { ...f.env, GITHUB_EVENT_PATH: eventPath, GITHUB_TOKEN: 'privateOpaqueCanary87654' };
  assert.deepEqual(withRoutineDiagnostics(trace, () => loadRoutineContext(env)), f.context);
  await chmod(eventPath, 0o622);
  assert.throws(() => withRoutineDiagnostics(trace, () => loadRoutineContext(env)), /event-file.permissions/);
  await chmod(eventPath, 0o600);
  assert.throws(() => withRoutineDiagnostics(trace, () => loadRoutineContext({ ...env, GITHUB_RUN_ATTEMPT: '2' })), /context.GITHUB_RUN_ATTEMPT/);
  await writeFile(eventPath, '{"secret":"privateOpaqueCanary87654", broken');
  assert.throws(() => withRoutineDiagnostics(trace, () => loadRoutineContext(env)));
  const records = logs.map(line => JSON.parse(line));
  assert.ok(records.some(record => record.check === 'event-file.permissions' && record.status === 'failed' && record.values.actual === 0o622));
  assert.ok(records.some(record => record.check === 'context.GITHUB_RUN_ATTEMPT' && record.status === 'failed'));
  assert.ok(records.some(record => record.check === 'event-json.parse' && record.status === 'failed'));
  assert.ok(records.some(record => record.check === 'context.validate' && record.status === 'passed'));
  assert.doesNotMatch(logs.join('\n'), /privateOpaqueCanary87654/);
});

test('end-to-end private subprocess preserves nonzero ACK and hides fragmented output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-e2e-command-')); t.after(() => rm(root, { recursive: true, force: true }));
  const logs: string[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(root, 'logs'), { scope: 'release' });
  const canary = 'opaqueProviderCanary76543';
  const result = await command(process.execPath, ['-e',
    `for(const c of ${JSON.stringify(canary)})process.stderr.write(c);console.log(JSON.stringify({deployment:{id:"dpl_known"}}));process.exitCode=7`],
  root, { PATH: '/usr/bin:/bin' }, AbortSignal.timeout(5000), trace);
  assert.equal(result.code, 7); assert.equal(acknowledgedId(result.stdout), 'dpl_known');
  const records = logs.map(line => JSON.parse(line));
  assert.ok(records.some(record => record.status === 'started' && record.check.startsWith('provider-command.')));
  assert.ok(records.some(record => record.status === 'failed' && record.values.code === 7 && record.values.stderrBytes === Buffer.byteLength(canary)));
  const retained = (await fsPromises.readdir(join(root, 'logs'))).map(name => readFileSync(join(root, 'logs', name), 'utf8')).join('\n');
  assert.doesNotMatch(logs.join('\n') + retained, /opaqueProviderCanary76543/);
});

test('end-to-end logger failure preserves first exception cause and known deployment', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'esty-e2e-primary-'))); t.after(() => rm(root, { recursive: true, force: true }));
  const output: string[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(root, 'logs'), { scope: 'release' });
  const request = releaseRequest();
  const diagnostics = new ReleaseDiagnostics(validateReleaseRequest(request, releaseApproval(request)), join(root, 'receipts'), AbortSignal.timeout(10000), trace);
  diagnostics.load(); diagnostics.submitted('create'); diagnostics.created('dpl_known');
  const primary = new Error('opaqueProviderCanary76543', { cause: new Error('nestedPrivateCanary12345') });
  diagnostics.at('candidate');
  const captured = diagnostics.capture(primary), original = fs.appendFileSync;
  t.mock.method(fs, 'appendFileSync', (...args: Parameters<typeof fs.appendFileSync>) => {
    if (String(args[0]).startsWith(join(root, 'logs'))) throw new Error('privateDiskErrorCanary12345');
    return original(...args);
  });
  await assert.rejects(trace.boundary('later-cleanup', () => { throw primary; }), error => error === primary);
  assert.equal(diagnostics.capture(new Error('later')), captured); assert.equal(captured.cause, primary);
  const result = diagnostics.failure(primary);
  assert.equal(result.stage, 'candidate'); assert.equal(result.deploymentId, 'dpl_known'); assert.equal(result.effects.create, 'ACKed');
  assert.match(output.join('\n'), /diagnostics-write-failed/); assert.match(output.join('\n'), /Caused by/);
  assert.doesNotMatch(output.join('\n'), /opaqueProviderCanary76543|nestedPrivateCanary12345|privateDiskErrorCanary12345/);
});

test('end-to-end HTTP body records overflow and failure without response payload', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-e2e-body-')); t.after(() => rm(root, { recursive: true, force: true }));
  const output: string[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(root, 'logs'), { scope: 'release' });
  await assert.rejects(responseBytes(new Response('opaqueResponseCanary12345'), 4, trace));
  const stream = new ReadableStream({ start(controller) { controller.error(new Error('privateStreamCanary12345')); } });
  await assert.rejects(responseBytes(new Response(stream), 64, trace));
  assert.equal((await responseBytes(new Response('ok'), 64, trace)).toString(), 'ok');
  const records = output.map(line => JSON.parse(line));
  assert.ok(records.some(record => record.check === 'http.body-size' && record.status === 'failed' && record.values.maximum === 4));
  assert.ok(records.some(record => record.check === 'http.body' && record.status === 'passed' && record.values.size === 2));
  assert.doesNotMatch(output.join('\n'), /opaqueResponseCanary12345|privateStreamCanary12345/);
});

test('end-to-end diagnostic quota preserves first failure and refuses unsafe storage', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-e2e-quota-')); t.after(() => rm(root, { recursive: true, force: true }));
  const output: string[] = [];
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(root, 'logs'), { scope: 'release', correlation: 'quota', runId: '44' });
  for (let index = 0; index < 8192; index++) trace.event('archive.member', 'passed', 'member-verified');
  trace.event('archive.digest', 'failed', 'first-digest-mismatch');
  trace.event('archive.digest', 'failed', 'later-digest-mismatch');
  trace.event('create', 'not-run', 'archive-refused');
  assert.equal(JSON.parse(await readFile(join(root, 'logs/quota-failure.json'), 'utf8')).reason, 'first-digest-mismatch');
  assert.equal(JSON.parse(await readFile(join(root, 'logs/quota-limits.json'), 'utf8')).omittedEvents, 3);
  assert.equal((await readFile(join(root, 'logs/quota-events.jsonl'), 'utf8')).trim().split('\n').length, 8192);
  assert.equal(output.filter(line => JSON.parse(line).event === 'diagnostics-overflow').length, 1);
  await mkdir(join(root, 'outside'), { mode: 0o700 }); await symlink(join(root, 'outside'), join(root, 'unsafe'));
  const unsafe = new ChecksDiagnostics(join(root, 'unsafe'), { scope: 'release' });
  unsafe.event('operation', 'failed', 'storage-must-not-follow-symlink');
  assert.deepEqual(await fsPromises.readdir(join(root, 'outside')), []);
  assert.ok(output.some(line => JSON.parse(line).event === 'diagnostics-init-failed'));
});

test('historical GitHub reader distinguishes HTTP body parse and timeout failures without leaking caller data', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-historical-github-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cases = ['valid', '401', '403', '404', '429', '500', '503', 'redirect', 'no-body', 'empty-body',
    'transport', 'transport-timeout', 'body', 'body-timeout', 'oversize', 'json'];
  for (const fault of cases) await t.test(fault, async st => {
    const output: string[] = [];
    for (const method of ['info', 'error'] as const) st.mock.method(console, method, (...args: unknown[]) => output.push(args.join(' ')));
    const trace = new ChecksDiagnostics(join(root, fault), { scope: 'release' }), caller = new AbortController();
    const primary = new Error('privateTransportCanary98765', { cause: new Error('privateCauseCanary98765') });
    if (fault.endsWith('timeout')) st.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('privateTimeoutCanary98765', 'TimeoutError')));
    const transport: typeof fetch = async (_raw, init) => {
      assert.equal(init?.redirect, 'error');
      if (fault === 'transport-timeout') init?.signal?.throwIfAborted();
      if (fault === 'transport') throw primary;
      if (fault === 'body' || fault === 'body-timeout') return new Response(new ReadableStream({
        start(controller) { controller.error(primary); },
      }));
      if (fault === 'no-body') return new Response(null);
      if (fault === 'oversize') return new Response(Buffer.alloc(8 * 1024 * 1024 + 1));
      const response = new Response(fault === 'json' ? 'privateBodyCanary98765' : fault === 'empty-body' ? ''
        : JSON.stringify({ accepted: true, value: 'privateValueCanary98765' }), { status: /^\d+$/.test(fault) ? Number(fault) : 200 });
      if (fault === 'redirect') Object.defineProperty(response, 'redirected', { value: true });
      return response;
    };
    const io = manualGithubIo('privateCredentialCanary98765', caller.signal, transport, trace);
    if (fault === 'valid') assert.deepEqual(await io.read('/actions/artifacts/13587251015'), { accepted: true, value: 'privateValueCanary98765' });
    else await assert.rejects(io.read('/actions/artifacts/13587251015'), error => {
      if (['transport', 'body', 'body-timeout'].includes(fault)) assert.equal(error, primary);
      return true;
    });
    const rows = output.map(line => JSON.parse(line)), failures = rows.filter(row => row.status === 'failed');
    const expected = /^\d+$/.test(fault) ? 'github.http-status' : fault === 'redirect' ? 'github.no-redirect'
      : fault === 'no-body' ? 'github.body-present' : ['empty-body', 'json'].includes(fault) ? 'github.json-parse'
      : fault.startsWith('transport') ? 'github.transport' : fault === 'oversize' ? 'github.body-size' : 'github.body';
    if (fault === 'valid') assert.deepEqual(failures, []);
    else {
      assert.equal(failures[0].check, expected); assert.equal(failures[0].values.route, 'artifact-metadata');
      assert.ok(failures.every(row => row.firstFailure === expected));
      if (/^\d+$/.test(fault)) assert.equal(failures[0].values.actual, Number(fault));
      if (fault.endsWith('timeout')) {
        assert.equal(failures[0].reason, 'timeout-or-cancel');
        assert.equal(failures[0].values.aborted, true); assert.equal(failures[0].values.callerAborted, false);
      }
      if (['transport', 'body', 'body-timeout'].includes(fault)) assert.match(failures[0].error, /Caused by/);
    }
    assert.doesNotMatch(output.join('\n'), /private\w*Canary98765|Authorization|https:\/\/|\/actions\/artifacts/);
  });
});

test('historical GitHub routes disclose only finite endpoint classes and the fixed public artifact ID', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-historical-routes-')); t.after(() => rm(root, { recursive: true, force: true }));
  const output: string[] = [];
  for (const method of ['info', 'error'] as const) t.mock.method(console, method, (...args: unknown[]) => output.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(root, 'logs'), { scope: 'release' });
  const routes = [
    ['/actions/artifacts/13587251015', 'artifact-metadata'], ['/actions/artifacts/987654321012345', 'artifact-metadata'],
    ['/actions/runs/44', 'run-metadata'], ['/actions/runs/44/attempts/1/jobs?per_page=100', 'run-jobs'],
    ['/actions/runs/44/artifacts?per_page=100', 'run-artifacts'], ['/deployments/44', 'deployment'],
    ['/deployments/44/statuses?per_page=100', 'deployment-statuses'],
    ['/environments/be-production/variables/BE_D1_HELD_APP_BINDING', 'environment-binding'],
    ['/environments/be-production/variables/BE_D2_APP_ACCEPTANCE_GATE', 'environment-gate'],
    ['/contents/privatePathCanary98765?ref=privateQueryCanary98765', 'source-content'], ['/commits/main', 'commit'],
    ['/environments/privatePathCanary98765/variables/privateVariableCanary98765', 'unclassified'],
  ];
  const io = manualGithubIo('privateCredentialCanary98765', new AbortController().signal, async () => Response.json({ value: 'privateValueCanary98765' }), trace);
  for (const [path, route] of routes) {
    output.length = 0; assert.deepEqual(await io.read(path!), { value: 'privateValueCanary98765' });
    const row = output.map(line => JSON.parse(line)).find(row => row.check === 'github.request' && row.status === 'started');
    assert.equal(row.values.route, route);
    assert.equal(row.values.actualId, path === '/actions/artifacts/13587251015' ? '13587251015' : undefined);
    assert.doesNotMatch(output.join('\n'), /private\w*Canary98765|987654321012345|BE_D[12]_|\/environments\/|\/contents\//);
  }
  output.length = 0;
  const unlogged = manualGithubIo('privateCredentialCanary98765', new AbortController().signal, async () => Response.json({ accepted: true }));
  assert.deepEqual(await unlogged.read('/actions/runs/44'), { accepted: true }); assert.deepEqual(output, []);
});

test('historical GitHub downloads expose bounded phase failures without signed locations or authorization', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-historical-download-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cases = ['valid', '401', '403', '404', '429', '500', 'missing-location', 'invalid-location', 'host', 'scheme', 'userinfo',
    'transport', 'transport-timeout', 'blob-status', 'blob-redirect', 'blob-no-body', 'blob-transport', 'blob-timeout', 'body', 'body-timeout', 'oversize'];
  for (const fault of cases) await t.test(fault, async st => {
    const output: string[] = [], authorizations: Array<string | null> = [];
    for (const method of ['info', 'error'] as const) st.mock.method(console, method, (...args: unknown[]) => output.push(args.join(' ')));
    const trace = new ChecksDiagnostics(join(root, fault), { scope: 'release' }), caller = new AbortController();
    const primary = new Error('privateDownloadCanary98765', { cause: new Error('privateCauseCanary98765') });
    if (fault.endsWith('timeout')) st.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('privateTimeoutCanary98765', 'TimeoutError')));
    let calls = 0;
    const transport: typeof fetch = async (_raw, init) => {
      authorizations.push(new Headers(init?.headers).get('authorization')); calls++;
      if (calls === 1) {
        assert.equal(init?.redirect, 'manual');
        if (fault === 'transport') throw primary;
        if (fault === 'transport-timeout') init?.signal?.throwIfAborted();
        let location = 'https://privateHostCanary98765.blob.core.windows.net/privatePathCanary98765?sig=privateSignatureCanary98765';
        if (fault === 'invalid-location') location = 'privateLocationCanary98765';
        if (fault === 'host') location = 'https://privateHostCanary98765.invalid/privatePathCanary98765';
        if (fault === 'scheme') location = location.replace('https:', 'http:');
        if (fault === 'userinfo') location = location.replace('https://', 'https://privateUserCanary98765:privatePasswordCanary98765@');
        return new Response(null, { status: /^\d+$/.test(fault) ? Number(fault) : 302, headers: fault === 'missing-location' ? {} : { location } });
      }
      assert.equal(init?.redirect, 'error'); assert.equal(authorizations[1], null);
      if (fault === 'blob-transport') throw primary;
      if (fault === 'blob-timeout') init?.signal?.throwIfAborted();
      if (fault === 'body' || fault === 'body-timeout') return new Response(new ReadableStream({ start(controller) { controller.error(primary); } }));
      if (fault === 'blob-no-body') return new Response(null);
      const response = new Response(Buffer.from('synthetic zip'), { status: fault === 'blob-status' ? 503 : 200 });
      if (fault === 'blob-redirect') Object.defineProperty(response, 'redirected', { value: true });
      return response;
    };
    const io = manualGithubIo('privateCredentialCanary98765', caller.signal, transport, trace);
    if (fault === 'valid') assert.equal((await io.download(13587251015)).toString(), 'synthetic zip');
    else await assert.rejects(io.download(13587251015, fault === 'oversize' ? 4 : 65536), error => {
      if (['transport', 'blob-transport', 'body', 'body-timeout'].includes(fault)) assert.equal(error, primary);
      return true;
    });
    assert.equal(authorizations[0], 'Bearer privateCredentialCanary98765');
    const rows = output.map(line => JSON.parse(line)), failures = rows.filter(row => row.status === 'failed');
    const expected = /^\d+$/.test(fault) ? 'github.download-redirect-status'
      : fault.endsWith('location') ? 'github.download-location' : ['host', 'scheme', 'userinfo'].includes(fault) ? 'github.download-host'
      : ['transport', 'transport-timeout', 'blob-transport', 'blob-timeout'].includes(fault) ? 'github.download-transport'
      : fault === 'blob-status' ? 'github.download-status' : fault === 'blob-redirect' ? 'github.download-no-redirect'
      : fault === 'blob-no-body' ? 'github.download-body-present' : fault === 'oversize' ? 'github.download-size' : 'github.download-body';
    if (fault === 'valid') {
      assert.deepEqual(failures, []); assert.equal(calls, 2);
      assert.ok(rows.some(row => row.check === 'github.download-host' && row.values.allowedHost && row.values.safeLocation));
      assert.ok(rows.some(row => row.check === 'github.download-body' && row.values.bytes === 13));
    } else {
      assert.equal(failures[0].check, expected); assert.ok(failures.every(row => row.firstFailure === expected));
      const blob = fault.startsWith('blob-') || fault.startsWith('body') || fault === 'oversize';
      assert.equal(failures[0].values.route, blob ? 'artifact-blob' : 'artifact-download'); assert.equal(calls, blob ? 2 : 1);
      if (/^\d+$/.test(fault)) assert.equal(failures[0].values.actual, Number(fault));
      if (fault.endsWith('timeout')) assert.equal(failures[0].reason, 'timeout-or-cancel');
    }
    assert.doesNotMatch(output.join('\n'), /private\w*Canary98765|https?:\/\/|Authorization|sig=/);
  });
});

test('historical held archive failures retain size hash and archive boundaries without exposing payloads', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-historical-archive-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const fault of ['valid', 'size', 'hash', 'structure', 'json']) await t.test(fault, async st => {
    const output: string[] = [];
    for (const method of ['info', 'error'] as const) st.mock.method(console, method, (...args: unknown[]) => output.push(args.join(' ')));
    const trace = new ChecksDiagnostics(join(root, fault), { scope: 'release' }), f = heldProofFixture();
    f.io.diagnostics = trace;
    if (fault === 'size') {
      const bytes = Buffer.alloc(65537);
      assert.throws(() => trace.sync('github.archive.held', () => validateHeldProbeArchive(bytes, sha256(bytes), trace)));
    } else {
      if (fault !== 'valid') {
        const changed = fault === 'json' ? receiptZip([['held-app-probe.json', Buffer.from('privateArchiveCanary98765')]])
          : Buffer.from('privateArchiveCanary98765');
        const artifact = f.values[f.artifactPath].artifacts[0];
        artifact.size_in_bytes = changed.length;
        if (fault !== 'hash') artifact.digest = `sha256:${sha256(changed)}`;
        f.io.download = async id => { assert.equal(id, f.artifactId); return changed; };
      }
      if (fault === 'valid') assert.equal((await verifyHeldAppProbe(f.workflowRun, f.target, f.io, f.sourceDigests, new AbortController().signal)).binding.candidate, f.target.candidate);
      else await assert.rejects(verifyHeldAppProbe(f.workflowRun, f.target, f.io, f.sourceDigests, new AbortController().signal));
    }
    const rows = output.map(line => JSON.parse(line)), failures = rows.filter(row => row.status === 'failed');
    if (fault === 'valid') {
      assert.deepEqual(failures, []); assert.ok(rows.some(row => row.check === 'github.archive-hash' && row.values.digestMatches));
      assert.ok(rows.some(row => row.check === 'github.archive.held' && row.status === 'passed'));
    } else {
      const expected = fault === 'size' ? 'github.archive-size' : fault === 'hash' ? 'github.archive-hash' : 'github.archive.held';
      assert.equal(failures[0].check, expected); assert.ok(failures.every(row => row.firstFailure === expected));
      assert.match(output.join('\n'), /activation-preflight-disposition\.mjs:\d+:\d+/);
    }
    assert.doesNotMatch(output.join('\n'), /privateArchiveCanary98765/);
  });
});

test('end-to-end executable workflow summary distinguishes failure skipped dependency and unavailable summary', async t => {
  const root = await mkdtemp(join(tmpdir(), 'esty-e2e-summary-')); t.after(() => rm(root, { recursive: true, force: true }));
  const script = new URL('../scripts/checks-diagnostics.js', import.meta.url).pathname;
  const result = childProcess.spawnSync(process.execPath, [script, 'summary', join(root, 'logs'), 'retrieval', 'select=failure', 'download=skipped'], {
    env: { PATH: '/usr/bin:/bin', GITHUB_RUN_ID: '44', GITHUB_STEP_SUMMARY: root }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, 'Best-effort summary cannot replace the original job failure');
  const records = (result.stdout + result.stderr).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(records.some(row => row.check === 'workflow.select' && row.status === 'failed'));
  assert.ok(records.some(row => row.check === 'workflow.download' && row.status === 'not-run'));
  assert.ok(records.some(row => row.check === 'workflow.summary' && row.reason === 'summary-write-failed'));
  assert.ok(records.every(row => row.runId === '44'));
  const workflow = await readFile(new URL('../../../../.github/workflows/be-delivery.yml', import.meta.url), 'utf8');
  const notice = workflow.match(/run: &diagnostic-upload-notice \|\n((?:          .*(?:\n|$))*)/)?.[1]?.replace(/^          /gm, '');
  assert.ok(notice);
  for (const outcome of ['failure', 'skipped', 'cancelled']) {
    const upload: SpawnSyncReturns<string> = childProcess.spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', notice], {
      env: { PATH: '/usr/bin:/bin', DIAGNOSTIC_UPLOAD: outcome, GITHUB_STEP_SUMMARY: root }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(upload.status, 0, 'Upload and summary failure cannot replace the original step result');
    assert.match(upload.stdout, /::warning::BE diagnostic upload unavailable/);
  }
});

test('end-to-end preflight diagnostics preserve the existing Unicode character bound', async t => {
  const f = await fixture(); t.after(f.dispose);
  const root = await mkdtemp(join(tmpdir(), 'esty-e2e-preflight-')); t.after(() => rm(root, { recursive: true, force: true }));
  const h = routineProviderFixture(f.artifact), output: string[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  const trace = new ChecksDiagnostics(join(root, 'preflight-diagnostics'), { scope: 'release' });
  const request = releaseRequest(), signal = AbortSignal.timeout(10000);
  const diagnostics = new ReleaseDiagnostics(validateReleaseRequest(request, releaseApproval(request)), join(root, 'outcomes'), signal, trace);
  const transport: typeof fetch = async (url, init) => {
    const response = await h.transport(url, init);
    if (new URL(String(url)).pathname === `/v9/projects/${artifactTarget.project}`) {
      const project = await response.json() as Record<string, unknown>;
      return new Response(JSON.stringify({ ...project, description: '€'.repeat(30000) }));
    }
    return response;
  };
  const provider = createProvider(f.artifact, h.run, h.schema, h.credentials, signal, transport, diagnostics);
  assert.equal(await provider.preflight(), 'dpl_previous');
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  assert.ok(output.map(line => JSON.parse(line)).some(row => row.check === 'configuration.response-size'
    && row.status === 'passed' && row.values.actualCharacters > 30000 && row.values.maximumCharacters === 65536));
  assert.doesNotMatch(output.join('\n'), /€/);
});
