import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ClientConfig } from 'pg';
import { privateDirectory } from './private-files.mjs';
import { manifestDigest, migrationStatus, runMigrations } from './migrations.js';
import type { MigrationReport } from './migrations.js';
import { migrationFiles } from './migration-files.mjs';
import { saveMigrationReport } from './migration-report.js';
import { bounded } from './bounded.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { createReleaseJournal, readReleaseJournal, parseSupersessionApproval, validateBinding, writeReleaseEvidence, RunIdentityConflict } from './release-journal.js';
import type { ReleaseBinding, SchemaMode, SupersessionApproval } from './release-journal.js';

export interface DeployIdentity { provider: string; project: string; owner: string; target: string }
export interface DeployState extends DeployIdentity { id: string; revision: string; artifactDigest: string; status: 'queued' | 'building' | 'ready' | 'failed' | 'canceled' }
export interface DeploymentDiagnostics {
  operation: 'preflight' | 'upload' | 'create' | 'inspect' | 'attest' | 'smoke';
  request_state: 'not_started' | 'in_flight' | 'response_received';
  category: 'dns' | 'tcp' | 'tls' | 'timeout' | 'aborted' | 'http' | 'unclassified';
  http_status: number | null;
  deploy_id: string | null;
}
export interface DeploymentCheckpoints {
  beforeCreate(): void | Promise<void>;
  acknowledged(id: string): void | Promise<void>;
}
export interface Deployment {
  identity: DeployIdentity;
  artifact: { revision: string; digest: string; manifestDigest: string };
  preflight(signal: AbortSignal): Promise<void>;
  trigger(revision: string, signal: AbortSignal, checkpoints: DeploymentCheckpoints): Promise<DeployState>;
  inspect(id: string, signal: AbortSignal): Promise<DeployState>;
  smoke(state: DeployState, signal: AbortSignal): Promise<void>;
  diagnostics(error: unknown, signal: AbortSignal): DeploymentDiagnostics;
}
export function assertSourceApproval(actual: { revision: string; dirty: boolean; digest: string }, revision: string, digest: string): void {
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^[a-f0-9]{64}$/.test(digest)
    || actual.dirty || actual.revision !== revision || actual.digest !== digest) throw new Error('Release requires the exact clean approved commit and manifest.');
}
export interface ReleaseReport {
  run_id: string; revision: string; manifest_digest: string; artifact_digest: string; target: string;
  schema_mode: SchemaMode; schema_status: 'not_checked' | 'current'; supersedes_run_id: string | null;
  result: 'failed' | 'success'; stage: string;
  migration: MigrationReport | null;
  deployment: 'not_started' | 'unknown' | 'queued' | 'failed' | 'ready';
  deploy_id: string | null; lock_retained: boolean; reporting: 'written' | 'failed';
  deployment_diagnostics: DeploymentDiagnostics | null;
}
export interface PreparedRelease { directory: string; deployment: Deployment; dispose(): Promise<void> }
export interface ReleaseInput {
  revision: string; digest: string; artifactDigest: string; target: string; database: ClientConfig;
  mode: SchemaMode; supersession?: SupersessionApproval; reportDirectory: string;
  verifySource(): Promise<void>;
  prepare(): Promise<PreparedRelease>;
  signal?: AbortSignal; timeoutMs?: number; pollMs?: number;
}
function preparedMatches(input: ReleaseInput, prepared: PreparedRelease): void {
  const artifact = prepared.deployment.artifact;
  if (artifact.revision !== input.revision || artifact.digest !== input.artifactDigest || artifact.manifestDigest !== input.digest
    || manifestDigest(migrationFiles(prepared.directory)) !== input.digest
    || (input.mode === 'current-schema-only' && manifestDigest(migrationManifest) !== input.digest)) throw new Error('Release source or migration assets differ.');
}
async function currentSchema(input: ReleaseInput, directory: string, signal: AbortSignal): Promise<void> {
  const status = await bounded(migrationStatus(input.database, directory), signal);
  signal.throwIfAborted();
  if (!status.initialized || !status.ordered || status.pending.length || status.unexpected.length) throw new Error('Release requires already-current history.');
}
function stateMatches(input: ReleaseInput, deployment: Deployment, state: DeployState, id: string | null): void {
  if (!/^dpl_[A-Za-z0-9]{1,124}$/.test(state.id) || state.id !== id || state.revision !== input.revision
    || state.artifactDigest !== input.artifactDigest
    || (['provider', 'project', 'owner', 'target'] as const).some(key => !state[key] || state[key] !== deployment.identity[key])) throw new Error('Deployment identity differs.');
}
export async function runRelease(input: ReleaseInput): Promise<ReleaseReport> {
  const report: ReleaseReport = { run_id: randomUUID(), revision: /^[a-f0-9]{40}$/.test(input.revision) ? input.revision : '',
    artifact_digest: /^[a-f0-9]{64}$/.test(input.artifactDigest) ? input.artifactDigest : '',
    manifest_digest: /^[a-f0-9]{64}$/.test(input.digest) ? input.digest : '', target: /^(local|supabase:[a-z]{20})$/.test(input.target) ? input.target : '',
    schema_mode: input.mode === 'current-schema-only' ? input.mode : 'migrate', schema_status: 'not_checked', supersedes_run_id: null,
    result: 'failed', stage: 'config', migration: null, deployment: 'not_started', deploy_id: null,
    deployment_diagnostics: null, lock_retained: false, reporting: 'written' };
  const timeoutMs = input.timeoutMs ?? 900000, expires = performance.now() + timeoutMs, deadline = new AbortController();
  const signal = AbortSignal.any([input.signal ?? new AbortController().signal, deadline.signal, AbortSignal.timeout(timeoutMs)]);
  const checkActive = () => {
    // Synchronous fsync can delay timeout delivery; check elapsed time before network side effects.
    if (performance.now() >= expires) deadline.abort(new DOMException('Release deadline exceeded.', 'TimeoutError'));
    signal.throwIfAborted();
  };
  let journal: ReturnType<typeof createReleaseJournal> | undefined;
  let reservationAttempted = false;
  let mayWriteReport = true;
  let prepared: PreparedRelease | undefined;
  try {
    if (!report.revision || !report.manifest_digest || !report.artifact_digest || !report.target
      || !['migrate', 'current-schema-only'].includes(input.mode)) throw new Error();
    const approval = input.supersession ? parseSupersessionApproval(input.supersession) : undefined;
    if (approval) {
      if (input.mode !== 'current-schema-only') throw new Error();
      report.run_id = approval.next.run_id; report.supersedes_run_id = approval.previous.run_id;
    }
    const binding: ReleaseBinding = { run_id: report.run_id, revision: report.revision, artifact_digest: report.artifact_digest,
      manifest_digest: report.manifest_digest, target: report.target, schema_mode: input.mode };
    validateBinding(binding);
    if (lstatSync(join(input.reportDirectory, 'runs', report.run_id), { throwIfNoEntry: false })
      || lstatSync(join(input.reportDirectory, `${report.run_id}.json`), { throwIfNoEntry: false })) {
      mayWriteReport = false; report.lock_retained = true;
      throw new RunIdentityConflict();
    }
    report.stage = 'source';
    await bounded(input.verifySource(), signal);
    prepared = await input.prepare();
    signal.throwIfAborted();
    await bounded(input.verifySource(), signal);
    preparedMatches(input, prepared);
    report.stage = 'journal';
    reservationAttempted = true;
    journal = createReleaseJournal(input.reportDirectory, binding, approval);
    checkActive();
    const active = journal;
    const { directory, deployment } = prepared;
    report.stage = 'provider_preflight';
    await bounded(deployment.preflight(signal), signal);
    report.stage = 'status';
    if (input.mode === 'current-schema-only') {
      await currentSchema(input, directory, signal);
    } else {
      const before = await bounded(migrationStatus(input.database, directory), signal);
      if (!before.ordered || before.unexpected.length) throw new Error();
      report.stage = 'migration';
      report.migration = await runMigrations(input.database, { directory, sourceRevision: input.revision, target: input.target, signal });
      if (!saveMigrationReport(report.migration, join(input.reportDirectory, 'migrations')) || report.migration.result !== 'success'
        || report.migration.database_outcome !== 'committed' || report.migration.manifest_digest !== input.digest) throw new Error();
      report.stage = 'verification';
      await currentSchema(input, directory, signal);
    }
    report.schema_status = 'current';
    await bounded(input.verifySource(), signal);
    report.stage = 'deploy';
    report.deployment = 'unknown';
    let state = await bounded(deployment.trigger(input.revision, signal, {
      async beforeCreate() {
        await bounded(input.verifySource(), signal);
        preparedMatches(input, prepared!);
        await currentSchema(input, directory, signal);
        report.stage = 'create_intent';
        active.beforeCreate();
        checkActive();
        report.stage = 'deploy';
      },
      acknowledged(id) {
        report.stage = 'acknowledgement';
        if (!/^dpl_[A-Za-z0-9]{1,124}$/.test(id)) throw new Error('Invalid acknowledged identity.');
        report.deploy_id = id;
        // Persist even if cancellation raced with a valid provider response.
        active.acknowledge(id);
        checkActive();
        report.stage = 'deploy';
      },
    }), signal);
    while (true) {
      stateMatches(input, deployment, state, report.deploy_id);
      active.check();
      if (state.status === 'ready') { report.deployment = 'ready'; break; }
      if (state.status === 'failed') { report.deployment = 'failed'; throw new Error(); }
      if (!['queued', 'building'].includes(state.status)) throw new Error();
      report.deployment = 'queued';
      await delay(input.pollMs ?? 2000, undefined, { signal });
      state = await bounded(deployment.inspect(state.id, signal), signal);
    }
    report.stage = 'smoke';
    await bounded(deployment.smoke(state, signal), signal);
    await currentSchema(input, directory, signal);
    await bounded(input.verifySource(), signal);
    preparedMatches(input, prepared);
    active.check();
    report.result = 'success';
    report.stage = 'complete';
  } catch (error) {
    if (error instanceof RunIdentityConflict) mayWriteReport = false;
    if (prepared && ['provider_preflight', 'deploy', 'create_intent', 'acknowledgement', 'smoke'].includes(report.stage)) {
      report.deployment_diagnostics = prepared.deployment.diagnostics(error, signal);
      report.deploy_id ??= report.deployment_diagnostics.deploy_id;
    }
    // Never persist raw upstream errors, responses or private inputs.
  } finally {
    try { await prepared?.dispose(); } catch { report.result = 'failed'; report.stage = 'cleanup'; }
    if (journal) {
      report.lock_retained = Boolean(report.supersedes_run_id || report.deployment === 'unknown' || report.deployment === 'queued'
        || (report.deployment === 'ready' && report.result !== 'success') || report.migration?.database_outcome === 'unknown');
      try {
        report.lock_retained = journal.finish({ result: report.result, stage: report.stage, deployment: report.deployment,
          deploy_id: report.deploy_id, retain_lock: report.lock_retained });
      } catch { report.lock_retained = true; report.reporting = 'failed'; report.result = 'failed'; }
    } else if (reservationAttempted) {
      try {
        report.lock_retained = [join(input.reportDirectory, 'operator.lock'), join(input.reportDirectory, 'runs', report.run_id, 'operator.lock')]
          .some(path => Boolean(lstatSync(path, { throwIfNoEntry: false })));
      } catch { report.lock_retained = true; report.reporting = 'failed'; }
    }
    if (mayWriteReport) {
      try { privateDirectory(input.reportDirectory); writeReleaseEvidence(join(input.reportDirectory, `${report.run_id}.json`), report); }
      catch { report.reporting = 'failed'; report.result = 'failed'; }
    } else report.reporting = 'failed';
  }
  return report;
}

export async function reconcileRelease(input: ReleaseInput, runId: string) {
  const binding = validateBinding({ run_id: runId, revision: input.revision, artifact_digest: input.artifactDigest,
    manifest_digest: input.digest, target: input.target, schema_mode: input.mode });
  const signal = AbortSignal.any([input.signal ?? new AbortController().signal, AbortSignal.timeout(input.timeoutMs ?? 900000)]);
  let prepared: PreparedRelease | undefined;
  try {
    const recorded = readReleaseJournal(input.reportDirectory, binding);
    await bounded(input.verifySource(), signal);
    prepared = await input.prepare();
    preparedMatches(input, prepared);
    await bounded(prepared.deployment.preflight(signal), signal);
    await currentSchema(input, prepared.directory, signal);
    let observed: DeployState | null = null;
    let http = 'not_checked';
    if (recorded.deploy_id) {
      observed = await bounded(prepared.deployment.inspect(recorded.deploy_id, signal), signal);
      stateMatches(input, prepared.deployment, observed, recorded.deploy_id);
      if (observed.status === 'ready') { await bounded(prepared.deployment.smoke(observed, signal), signal); http = 'verified'; }
    }
    await bounded(input.verifySource(), signal);
    preparedMatches(input, prepared);
    const after = readReleaseJournal(input.reportDirectory, binding);
    if (JSON.stringify(after) !== JSON.stringify(recorded)) throw new Error('Release evidence changed during reconciliation.');
    return { ...binding, operation: 'read-only-reconciliation', create_intent: recorded.create_intent,
      deploy_id: recorded.deploy_id, deployment: observed?.status ?? (recorded.create_intent ? 'unknown' : 'not_started'),
      schema_status: 'current', http, original_report_unchanged: true };
  } finally { await prepared?.dispose(); }
}
