import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ClientConfig } from 'pg';
import { privateDirectory, writePrivate } from './private-files.mjs';
import { manifestDigest, migrationStatus, runMigrations } from './migrations.js';
import type { MigrationReport } from './migrations.js';
import { migrationFiles } from './migration-files.mjs';
import { saveMigrationReport } from './migration-report.js';
import { bounded } from './bounded.js';

export interface DeployIdentity { provider: string; project: string; owner: string; target: string }
export interface DeployState extends DeployIdentity { id: string; revision: string; artifactDigest: string; status: 'queued' | 'building' | 'ready' | 'failed' | 'canceled' }
export interface Deployment {
  identity: DeployIdentity;
  preflight(signal: AbortSignal): Promise<void>;
  trigger(revision: string, signal: AbortSignal): Promise<DeployState>;
  inspect(id: string, signal: AbortSignal): Promise<DeployState>;
  smoke(state: DeployState, signal: AbortSignal): Promise<void>;
}
export function assertSourceApproval(actual: { revision: string; dirty: boolean; digest: string }, revision: string, digest: string): void {
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^[a-f0-9]{64}$/.test(digest)
    || actual.dirty || actual.revision !== revision || actual.digest !== digest) throw new Error('Release requires the exact clean approved commit and manifest.');
}
export interface ReleaseReport {
  run_id: string; revision: string; manifest_digest: string; artifact_digest: string; target: string;
  result: 'failed' | 'success'; stage: string;
  migration: MigrationReport | null;
  deployment: 'not_started' | 'unknown' | 'queued' | 'failed' | 'ready';
  deploy_id: string | null; lock_retained: boolean; reporting: 'written' | 'failed';
}
export interface PreparedRelease { directory: string; deployment: Deployment; dispose(): Promise<void> }
export async function runRelease(input: {
  revision: string; digest: string; artifactDigest: string; target: string; database: ClientConfig;
  reportDirectory: string;
  verifySource(): Promise<void>;
  prepare(): Promise<PreparedRelease>;
  signal?: AbortSignal; timeoutMs?: number; pollMs?: number;
}): Promise<ReleaseReport> {
  const report: ReleaseReport = { run_id: randomUUID(), revision: /^[a-f0-9]{40}$/.test(input.revision) ? input.revision : '',
    artifact_digest: /^[a-f0-9]{64}$/.test(input.artifactDigest) ? input.artifactDigest : '',
    manifest_digest: /^[a-f0-9]{64}$/.test(input.digest) ? input.digest : '', target: /^(local|supabase:[a-z]{20})$/.test(input.target) ? input.target : '',
    result: 'failed', stage: 'config', migration: null, deployment: 'not_started', deploy_id: null, lock_retained: false, reporting: 'written' };
  const signal = AbortSignal.any([input.signal ?? new AbortController().signal, AbortSignal.timeout(input.timeoutMs ?? 900000)]);
  let lock: string | undefined;
  let prepared: PreparedRelease | undefined;
  try {
    if (!report.revision || !report.manifest_digest || !report.artifact_digest || !report.target) throw new Error();
    const output = privateDirectory(input.reportDirectory);
    const path = join(output, 'operator.lock');
    writePrivate(path, { run_id: report.run_id, revision: report.revision });
    lock = path;
    report.stage = 'source';
    await bounded(input.verifySource(), signal);
    prepared = await input.prepare();
    signal.throwIfAborted();
    await bounded(input.verifySource(), signal);
    const { directory, deployment } = prepared;
    if (manifestDigest(migrationFiles(directory)) !== input.digest) throw new Error();
    report.stage = 'provider_preflight';
    await bounded(deployment.preflight(signal), signal);
    report.stage = 'status';
    const before = await bounded(migrationStatus(input.database, directory), signal);
    if (!before.ordered || before.unexpected.length) throw new Error();
    report.stage = 'migration';
    report.migration = await runMigrations(input.database, { directory, sourceRevision: input.revision, target: input.target, signal });
    if (!saveMigrationReport(report.migration, join(output, 'migrations')) || report.migration.result !== 'success'
      || report.migration.database_outcome !== 'committed' || report.migration.manifest_digest !== input.digest) throw new Error();
    report.stage = 'verification';
    const after = await bounded(migrationStatus(input.database, directory), signal);
    if (!after.ordered || after.pending.length || after.unexpected.length) throw new Error();
    await bounded(input.verifySource(), signal);
    report.stage = 'deploy';
    // Once a request might reach the provider, failure means unknown until a
    // terminal deploy state is observed. Keep the run lock for manual reconciliation.
    report.deployment = 'unknown';
    let state = await bounded(deployment.trigger(input.revision, signal), signal);
    while (true) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(state.id) || state.revision !== input.revision || state.artifactDigest !== input.artifactDigest
        || (['provider', 'project', 'owner', 'target'] as const).some(key => !state[key] || state[key] !== deployment.identity[key])) throw new Error();
      if (report.deploy_id && state.id !== report.deploy_id) throw new Error();
      report.deploy_id = state.id;
      if (state.status === 'ready') { report.deployment = 'ready'; break; }
      if (state.status === 'failed') { report.deployment = 'failed'; throw new Error(); }
      if (!['queued', 'building'].includes(state.status)) throw new Error();
      report.deployment = 'queued';
      await delay(input.pollMs ?? 2000, undefined, { signal });
      state = await bounded(deployment.inspect(state.id, signal), signal);
    }
    report.stage = 'smoke';
    await bounded(deployment.smoke(state, signal), signal);
    await bounded(input.verifySource(), signal);
    report.result = 'success';
    report.stage = 'complete';
  } catch {
    // Never copy driver/provider messages, request URLs, response bodies or secrets.
  } finally {
    report.lock_retained = Boolean(lock && (report.deployment === 'unknown' || report.deployment === 'queued'
      || (report.deployment === 'ready' && report.result !== 'success') || report.migration?.database_outcome === 'unknown'));
    if (lock && !report.lock_retained) {
      try { unlinkSync(lock); } catch { report.lock_retained = true; report.result = 'failed'; }
    }
    try { await prepared?.dispose(); } catch { report.result = 'failed'; }
    try { writePrivate(join(input.reportDirectory, `${report.run_id}.json`), report); }
    catch { report.reporting = 'failed'; report.result = 'failed'; }
  }
  return report;
}
