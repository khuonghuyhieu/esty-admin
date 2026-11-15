import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonical, inventory, sha256 } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { readActivationJournal } from './activation-journal.js';
import { verifyRecoveredRoleAssets } from './activation.js';
import type { ActivationRun } from './activation.js';
import { rolesReachability } from './activation-recovery-origin.js';
import { bridgeRecovery } from './activation-candidate-recovery.js';
import { observePrivateSchemaExposure } from './app-roles.js';
import type { PrivateSchemaExposureObservation } from './app-roles.js';
import type { AppFoundationConfig } from '../src/config/config.js';
import { readEvidence } from './release-journal.js';

export const retainedUnknown = {
  head: '75333c2fa9074f418c23f4d67ea5a68db4ecf659718983ebfb13d2c46b096267',
  inventory: '205e42764af0704b6029d0223d982249cc9f0615e63ae633a9451c79cd2bde10',
  claims: {
    'authorize-started': 'fe440a72cf3b9d60e9846dbdb458e24912c9f30d46c98cd4961872956a031890',
    'authorize-result': '2181c91c272339ba30b337c15744eac5ed08a6628b47a246419632b3c81f88fa',
    'run-started': '3cd6ec5d55d0f226e38839fffe430593d96de43208cb503e96cf88f45e618ac2',
    'run-result': '3d1aadf5c3795889e5252c6ad6c2cab66554f5e6a3b5b3cd12f08892f345b176',
  },
};
export interface AppSchemaDiagnostic {
  status: 'OBSERVED' | 'STOP';
  stage: 'guard' | 'input' | 'request' | 'cleanup' | 'complete';
  category: PrivateSchemaExposureObservation['category'] | 'guard-refused' | 'input-refused' | 'cleanup-refused';
  httpStatus: number | null;
  requests: 0 | 1;
  journal: 'unchanged' | 'unverified';
  configuration: 'unknown';
  historicalCause: 'unresolved';
}
export interface PreparedAppSchemaDiagnostic {
  config: Pick<AppFoundationConfig, 'authUrl' | 'apiKey'>;
  dispose(): void;
}
export interface RetainedAppUnknown { head: string; inventory: string; claims: Record<string, string> }
export function verifyRetainedAppUnknown(run: ActivationRun, expected: RetainedAppUnknown = retainedUnknown): void {
  const current = readActivationJournal(run.directory, run.packet, run.digest), last = current.events.at(-1);
  if (current.recovery?.executionId !== rolesReachability.executionId || current.recovery.bridgeId !== bridgeRecovery.candidate
    || current.head !== expected.head || current.events.length !== 22 || current.next !== 'app-config'
    || last?.phase !== 'app-config' || last.kind !== 'outcome'
    || canonical(last.value) !== canonical({ result: 'unknown', databaseOutcome: 'not_started', count: 0, deploymentId: null,
      reportDigest: sha256(canonical({ phase: 'app-config', error: 'unconfirmed' })) })
    || sha256(canonical(inventory(run.directory))) !== expected.inventory) throw new Error('Retained diagnostic state differs.');
  const prefix = `${run.packet.runId}.app-configuration-`;
  if (canonical(readdirSync(dirname(run.directory)).filter(name => name.startsWith(prefix)).sort())
    !== canonical(Object.keys(expected.claims).map(suffix => `${prefix}${suffix}.json`).sort()))
    throw new Error('Unexpected diagnostic action.');
  for (const [suffix, digest] of Object.entries(expected.claims)) {
    if (readEvidence(join(dirname(run.directory), `${run.packet.runId}.app-configuration-${suffix}.json`)).identity.sha256 !== digest)
      throw new Error('Retained diagnostic action differs.');
  }
}

export async function diagnoseAppSchemaExposure(run: ActivationRun, artifact: VerifiedArtifact,
  prepare: () => PreparedAppSchemaDiagnostic,
  verifyExecutable: () => unknown, signal: AbortSignal, expected = retainedUnknown,
  transport: typeof fetch = fetch): Promise<AppSchemaDiagnostic> {
  const result: AppSchemaDiagnostic = { status: 'STOP', stage: 'guard', category: 'guard-refused',
    httpStatus: null, requests: 0, journal: 'unverified', configuration: 'unknown', historicalCause: 'unresolved' };
  const check = () => { verifyExecutable(); verifyRetainedAppUnknown(run, expected); };
  let prepared: PreparedAppSchemaDiagnostic | undefined;
  try {
    signal.throwIfAborted(); check(); verifyRecoveredRoleAssets(artifact, run.packet);
    result.stage = 'input'; result.category = 'input-refused';
    prepared = prepare();
    result.stage = 'guard'; result.category = 'guard-refused';
    check(); signal.throwIfAborted();
    result.stage = 'request'; result.category = 'transport';
    const observation = await observePrivateSchemaExposure(prepared.config, signal, async (url, init) => {
      // The synchronous guard above finishes before the shared request deadline starts.
      signal.throwIfAborted();
      result.requests = 1;
      return transport(url, init);
    });
    result.category = observation.category; result.httpStatus = observation.httpStatus;
    result.stage = 'guard'; check(); signal.throwIfAborted();
    result.status = 'OBSERVED';
  } catch {
    if (result.stage === 'guard') result.category = 'guard-refused';
  } finally {
    if (prepared) {
      try { prepared.dispose(); }
      catch { result.status = 'STOP'; result.stage = 'cleanup'; result.category = 'cleanup-refused'; }
    }
  }
  try { check(); result.journal = 'unchanged'; }
  catch { result.status = 'STOP'; result.stage = 'guard'; result.category = 'guard-refused'; }
  if (result.status === 'OBSERVED') result.stage = 'complete';
  return result;
}
