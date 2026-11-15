import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonical, sha256 } from './artifact.js';
import { retainedD1BootstrapPins, verifyRecoveredRoleAssets } from './activation.js';
import type { ActivationRun } from './activation.js';
import { bridgeRecovery } from './activation-candidate-recovery.js';
import { rolesReachability } from './activation-recovery-origin.js';
import { retainedUnknown, verifyRetainedAppUnknown } from './activation-schema-diagnostic.js';
import { heldCorrectionEvidencePath, readHeldCorrectionPending, validateActivationPacket } from './activation-journal.js';
import { heldCorrection, heldCorrectionCapability, validateHeldCorrectionCapability } from './activation-held-correction-contract.mjs';
import { heldRecord } from './activation-held-contract.mjs';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { AppMetadataError, appDatabasePairKeys } from './activation-configuration.js';
import type { AppDatabasePairAck, CurrentAppMetadata, MissingFiveMetadata } from './activation-configuration.js';
import type { HeldAppControllerContext, MissingFiveResult } from './activation-held.js';

export const heldDatabaseRepair = Object.freeze({
  selector: 'held-db-config-repair-01',
  candidate: 'dpl_D2pywKiNjekAMxzTHoFEyWJ5AaGh',
  previousController: 'f5d330c9784ec9d87df197ff780d30fde7073060',
  previousExecutable: '5bf10ca064cdf5a077e2930a56f6becb1727ee25dff5e6fcaea3fe1cdbfa3936',
  failedProbeRun: '43704277229',
  failedProbeRevision: '4c2c5a2a7834905d3942880acc3fbebbb0f2751d',
  failedBindingDigest: '01dd00dd31d211c1f559a9fbcd40c36b650f71092af04b3fa4716b95a554aa09',
  failedProbeDigest: 'f295e23a56edff591c586b225ece105e73fcde230de91b3802d0541a69047ecb',
  observationDigest: '7767a53e49db242172a6dd6ae48f43c2c366299a9ad80f4dd0e794d4664b998a',
  logHandoffDigest: 'c759a70bdce0c3b93ce72775d7735839847259af10ee6ddc7f65b0676f68d5ca',
  receipts: Object.freeze({
    'create-started': '1600b1591b1e78bfbe87728e9fc83a99081bb3461369eeef2fbd4c6333718fb4',
    'create-ack': 'e00e34545f12435972bdbbec1715e00f537a90271973086e1f2226ea9b734fec',
    pending: '98e30772b94824f8b99143fff11066f7281ccd4b636b18591b8f7910c2d81a77',
    'create-result': '9fd28a8224ae478c3141569f501fdea1f2860337c1978e97be3733e6e80cef7d',
  }),
});
const approvedRoot = '/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin';
const runDirectory = join(approvedRoot, '.openai/reports/protected-real-transfer-state-vd3tg33z',
  'ca-successor-36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed', `activation-recovered-${rolesReachability.executionId}`);
const logDirectory = join(dirname(approvedRoot), 'esty-admin-worktrees/task-d1-strict-api-config',
  '.openai/task-d1/held-config-correction01/log-retrieval01');
function refuse(): never { throw new Error('Fixed held database repair refused; preserve consumed evidence.'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, unknown>;
}
export interface HeldDatabaseRepairCapability {
  selector: string; contextDigest: string; controllerPublication: { revision: string; tree: string };
}
export function validateHeldDatabaseRepairCapability(value: unknown): HeldDatabaseRepairCapability {
  const capability = heldRecord(value, ['selector', 'contextDigest', 'controllerPublication']);
  const publication = validateHeldCorrectionCapability(heldCorrectionCapability(capability.controllerPublication)).controllerPublication;
  if (capability.selector !== heldDatabaseRepair.selector || capability.contextDigest !== heldCorrection.contextDigest
    || publication.revision === heldDatabaseRepair.previousController || publication.revision === heldDatabaseRepair.failedProbeRevision) refuse();
  return capability as unknown as HeldDatabaseRepairCapability;
}

// Only retained public receipts are read here; neither caller paths nor prepared credentials select the basis.
export function verifyHeldDatabaseRepairBasis(existing?: ActivationRun) {
  if (existing && (existing.directory !== runDirectory || existing.digest !== bridgeRecovery.packetDigest)) refuse();
  const packet = validateActivationPacket(existing?.packet ?? readEvidence(join(runDirectory,
    'activation', bridgeRecovery.activationRun, 'packet.json')).value, bridgeRecovery.packetDigest);
  const run = { directory: runDirectory, packet, digest: bridgeRecovery.packetDigest };
  verifyRetainedAppUnknown(run);
  const lineage = readHeldCorrectionPending(run.directory, packet, run.digest, retainedUnknown.head);
  const prefix = `${packet.runId}.${heldCorrection.selector}-`;
  if (canonical(readdirSync(dirname(run.directory)).filter(name => name.startsWith(prefix)).sort())
    !== canonical(Object.keys(heldDatabaseRepair.receipts).map(suffix => `${prefix}${suffix}.json`).sort())) refuse();
  for (const [suffix, digest] of Object.entries(heldDatabaseRepair.receipts)) {
    if (readEvidence(heldCorrectionEvidencePath(run.directory, packet, suffix)).identity.sha256 !== digest) refuse();
  }
  const pins = retainedD1BootstrapPins(), bootstrapProofDigest = sha256(canonical(pins));
  if (lineage.target.candidate !== heldDatabaseRepair.candidate
    || lineage.proofExecutableDigest !== heldDatabaseRepair.previousExecutable
    || lineage.capability.controllerPublication.revision !== heldDatabaseRepair.previousController
    || lineage.claim.bootstrapProofDigest !== bootstrapProofDigest
    || sha256(canonical({ ...lineage.target, workflowRevision: heldDatabaseRepair.failedProbeRevision })) !== heldDatabaseRepair.failedBindingDigest) refuse();
  for (const [suffix, digest] of Object.entries(pins)) {
    const directory = suffix === 'bootstrap-verification' ? run.directory : dirname(run.directory);
    if (readEvidence(join(directory, `${packet.runId}.${suffix}.json`)).identity.sha256 !== digest) refuse();
  }
  const probe = readEvidence(join(approvedRoot, '.openai/reports/d1-held-correction-f5d330c/corrected-probe-safe-result.json'));
  if (probe.identity.sha256 !== heldDatabaseRepair.failedProbeDigest || canonical(probe.value) !== canonical({
    runId: heldDatabaseRepair.failedProbeRun, conclusion: 'failure',
    safeResult: { version: 1, kind: 'held-app-live', bindingDigest: heldDatabaseRepair.failedBindingDigest,
      workflowRevision: heldDatabaseRepair.failedProbeRevision, workflowRun: heldDatabaseRepair.failedProbeRun,
      status: 500, configDigestMatch: false, bodyStatus: 'unavailable' },
    source: 'completed run log; no new endpoint request', additionalDispatches: 0,
  })) refuse();
  const observation = readEvidence(join(logDirectory, 'safe-result.json'));
  // Byte-identical public handoff copy: the original mode0644 is preserved, not weakened or chmodded.
  const handoff = readEvidence(join(dirname(dirname(logDirectory)), 'held-db-config-repair01/log-handoff.json'));
  if (observation.identity.sha256 !== heldDatabaseRepair.observationDigest || handoff.identity.sha256 !== heldDatabaseRepair.logHandoffDigest) refuse();
  const evidence = record(handoff.value), result = record(observation.value);
  if (evidence.candidate !== lineage.target.candidate || evidence.probeRun !== heldDatabaseRepair.failedProbeRun
    || evidence.probeRevision !== heldDatabaseRepair.failedProbeRevision || canonical(evidence.result) !== canonical(result)
    || result.availability !== 'COMPLETE' || result.rootCause !== 'UNDETERMINED'
    || result.digestSpecificEvidence !== 'UNAVAILABLE_IN_F162_STARTUP_SCHEMA'
    || !Array.isArray(result.observations) || !result.observations.some(row => canonical(row) === canonical({
      category: 'DB', reason: 'DB_CONFIG', stage: 'config', code: 'UNAVAILABLE', field: 'SUPABASE_DATABASE_USER', count: 1,
    }))) refuse();
  return { run, lineage, bootstrapProofDigest };
}

export interface PreparedHeldDatabaseRepair {
  observe(dispatched: () => void): Promise<MissingFiveMetadata>;
  post(before: MissingFiveMetadata, dispatched: () => void): Promise<AppDatabasePairAck>;
  verify(before: MissingFiveMetadata, ack: AppDatabasePairAck, dispatched: () => void): Promise<CurrentAppMetadata>;
  dispose(): void;
}
export interface HeldDatabaseRepairContext extends Omit<HeldAppControllerContext, 'expected'> {
  capability: HeldDatabaseRepairCapability;
}
export interface HeldDatabaseRepairResult extends Omit<MissingFiveResult, 'status' | 'acknowledgement'> {
  status: 'STOP' | 'DATABASE_PAIR_REPAIRED'; acknowledgement: AppDatabasePairAck | null;
}
export async function repairHeldDatabase(context: HeldDatabaseRepairContext,
  prepare: () => PreparedHeldDatabaseRepair | Promise<PreparedHeldDatabaseRepair>): Promise<HeldDatabaseRepairResult> {
  const { run, artifact, provider, signal } = context, owned = new Map<string, string>();
  const prefix = `${run.packet.runId}.${heldDatabaseRepair.selector}-`;
  const result: HeldDatabaseRepairResult = { status: 'STOP', stage: 'guard', firstError: null, disposition: 'not-started',
    acknowledgement: null, metadataRequests: 0, envPosts: 0, createCommands: 0, candidateRequests: 0,
    promotions: 0, journalTransitions: 0, historicalWrite: 'unknown', historicalPostAck: 'absent' };
  const check = () => {
    signal.throwIfAborted();
    const manifest = record(context.verifyExecutable());
    const capability = validateHeldDatabaseRepairCapability(context.capability);
    if ('expected' in context || canonical(validateHeldDatabaseRepairCapability(manifest.heldDatabaseRepairCapability)) !== canonical(capability)
      || manifest.heldAppCapability !== undefined || manifest.heldCorrectionCapability !== undefined || manifest.diagnosticSelector !== undefined
      || !/^[a-f0-9]{64}$/.test(context.executableDigest) || context.executableDigest === heldDatabaseRepair.previousExecutable) refuse();
    const basis = verifyHeldDatabaseRepairBasis(run);
    if (canonical(readdirSync(dirname(run.directory)).filter(name => name.startsWith(prefix)).sort())
      !== canonical([...owned.keys()].sort())) refuse();
    for (const [name, digest] of owned) if (readEvidence(join(dirname(run.directory), name)).identity.sha256 !== digest) refuse();
    return basis;
  };
  const persist = (suffix: string, value: unknown) => {
    const name = `${prefix}${suffix}.json`, path = join(dirname(run.directory), name);
    writeReleaseEvidence(path, value);
    const digest = sha256(JSON.stringify(value, null, 2) + '\n');
    if (readEvidence(path).identity.sha256 !== digest) refuse();
    owned.set(name, digest); return digest;
  };
  const fail = (error?: unknown) => {
    result.firstError ??= { stage: result.stage, category: signal.aborted ? 'aborted' : 'refused',
      ...(error instanceof AppMetadataError ? { metadata: error.diagnostic } : {}) };
    result.status = 'STOP'; result.stage = result.firstError.stage;
  };
  let prepared: PreparedHeldDatabaseRepair | undefined, before: MissingFiveMetadata | undefined;
  let claimDigest: string | undefined, ackDigest: string | undefined, verified: CurrentAppMetadata | undefined;
  try {
    const basis = check(); result.stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); check();
    result.stage = 'preflight'; await provider.preflight(); check();
    result.stage = 'input'; prepared = await prepare(); check();
    result.stage = 'metadata'; before = await prepared.observe(() => {
      check(); if (result.metadataRequests) refuse(); result.metadataRequests++;
    });
    check();
    if (result.metadataRequests !== 1 || before.keyCount !== 17 || !/^[a-f0-9]{64}$/.test(before.metadataDigest)
      || appDatabasePairKeys.some(key => !before!.bindings[key])) refuse();
    result.stage = 'claim';
    claimDigest = persist('started', { version: 1, kind: 'held-db-config-repair-started', basis: heldDatabaseRepair,
      executionId: rolesReachability.executionId, packetDigest: run.digest, unknownHead: retainedUnknown.head,
      inventoryDigest: retainedUnknown.inventory, bootstrapProofDigest: basis.bootstrapProofDigest,
      pendingDigest: basis.lineage.target.heldReceiptDigest, configDigest: run.packet.appConfigDigest,
      executableDigest: context.executableDigest, capability: context.capability,
      metadataDigest: before.metadataDigest, keyCount: before.keyCount,
      historicalWrite: 'unknown', historicalPostAck: 'absent' });
    check(); result.stage = 'preflight'; await provider.preflight(); check();
    result.stage = 'post';
    const ack = await prepared.post(before, () => {
      check(); if (result.envPosts) refuse(); result.envPosts++; result.disposition = 'unknown';
    });
    // Retain the returned per-key outcome and IDs before cancellation, identity checks or cleanup.
    result.acknowledgement = ack; result.stage = 'ack';
    ackDigest = persist('ack', { version: 1, kind: 'held-db-config-repair-ack', claimDigest, acknowledgement: ack });
    if (result.envPosts !== 1 || ack.outcome !== 'acknowledged' || appDatabasePairKeys.some(key =>
      ack.keys[key].status !== 'acknowledged' || ack.keys[key].ids.length !== 1 || ack.keys[key].ids[0] !== before!.bindings[key]!.id)) refuse();
    result.disposition = 'acknowledged-unverified'; check();
    result.stage = 'verification'; verified = await prepared.verify(before, ack, () => {
      check(); if (result.metadataRequests !== 1) refuse(); result.metadataRequests++;
    });
    check();
    if ((result.metadataRequests as number) !== 2 || verified.keyCount !== 17 || verified.metadataDigest !== before.metadataDigest) refuse();
    result.stage = 'preflight'; await provider.preflight(); check();
  } catch (error) { fail(error); }
  finally {
    if (prepared) {
      try { if (!result.firstError) result.stage = 'cleanup'; prepared.dispose(); }
      catch (error) { fail(error); }
    }
  }
  if (claimDigest) {
    try {
      if (!result.firstError) {
        check(); if (!ackDigest || !verified) refuse(); result.stage = 'receipt';
        persist('verified', { version: 1, kind: 'held-db-config-repair-verified', claimDigest, ackDigest,
          metadataDigest: verified.metadataDigest, keyCount: verified.keyCount,
          historicalWrite: 'unknown', historicalPostAck: 'absent', valueProof: 'pending-candidate-runtime' });
        check(); result.disposition = 'verified';
      }
      const terminal: HeldDatabaseRepairResult = result.firstError ? { ...result }
        : { ...result, status: 'DATABASE_PAIR_REPAIRED', stage: 'complete' };
      persist('result', { version: 1, kind: 'held-db-config-repair-result', claimDigest, status: terminal.status, result: terminal });
      if (!result.firstError) { check(); Object.assign(result, terminal); }
    } catch (error) { fail(error); }
  }
  return result;
}
