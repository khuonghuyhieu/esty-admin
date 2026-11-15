import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { canonical, sha256 } from './artifact.js';
import { retainedD1BootstrapPins, verifyRecoveredRoleAssets } from './activation.js';
import { retainedUnknown, verifyRetainedAppUnknown } from './activation-schema-diagnostic.js';
import { appendActivationEvent, heldCorrectionEvidencePath, readActivationJournal, readHeldCorrectionOriginal,
  readHeldCorrectionPending } from './activation-journal.js';
import type { HeldCorrectionClaim, HeldCorrectionPending } from './activation-journal.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { acknowledgedId } from './ci-delivery.js';
import { AppMetadataError } from './activation-configuration.js';
import type { CurrentAppMetadata } from './activation-configuration.js';
import type { Candidate } from './ci-provider.js';
import type { HeldAppControllerContext, HeldAppResult, HeldCreateCli, PreparedHeldMetadata } from './activation-held.js';
import type { HeldAppProbeProof, HeldAppTarget } from './activation-held-proof.js';
import { heldCorrection, validateHeldCorrectionCapability } from './activation-held-correction-contract.mjs';
import type { HeldCorrectionCapability } from './activation-held-correction-contract.mjs';

export interface HeldCorrectionContext extends Omit<HeldAppControllerContext, 'expected'> {
  capability: HeldCorrectionCapability;
}
export interface HeldCorrectionResult extends HeldAppResult {
  correction: 'held-config-correction-01'; target: HeldAppTarget | null;
}
function refuse(): never { throw new Error('Fixed held configuration correction refused; preserve consumed evidence.'); }
function session(context: HeldCorrectionContext, importing = false) {
  const capability = validateHeldCorrectionCapability(context.capability), capabilityBytes = canonical(capability);
  const { run, signal } = context, owned = new Map<string, string>();
  const prefix = `${run.packet.runId}.${heldCorrection.selector}-`;
  const result: HeldCorrectionResult = { correction: 'held-config-correction-01', status: 'STOP', stage: 'guard', firstError: null,
    target: null, candidateId: null, metadataRequests: 0, createCommands: 0, candidateRequests: 0, envPosts: 0,
    promotions: 0, disposition: 'not-started', historicalWrite: 'unknown', historicalPostAck: 'absent' };
  const path = (suffix: string) => heldCorrectionEvidencePath(run.directory, run.packet, suffix);
  const check = () => {
    signal.throwIfAborted(); context.verifyExecutable();
    if ('expected' in context || canonical(validateHeldCorrectionCapability(context.capability)) !== capabilityBytes
      || !/^[a-f0-9]{64}$/.test(context.executableDigest)) refuse();
    verifyRetainedAppUnknown(run);
    const original = readHeldCorrectionOriginal(run.directory, run.packet, run.digest, retainedUnknown.head);
    if (context.executableDigest === original.proofExecutableDigest || context.executableDigest === original.pending.executableDigest) refuse();
    const pins = retainedD1BootstrapPins();
    if (sha256(canonical(pins)) !== original.pending.bootstrapProofDigest) refuse();
    for (const [suffix, digest] of Object.entries(pins)) {
      const directory = suffix === 'bootstrap-verification' ? run.directory : dirname(run.directory);
      if (readEvidence(join(directory, `${run.packet.runId}.${suffix}.json`)).identity.sha256 !== digest) refuse();
    }
    const names = readdirSync(dirname(run.directory)).filter(name => name.startsWith(prefix)).sort();
    if (canonical(names) !== canonical([...owned.keys()].sort())) refuse();
    for (const [name, digest] of owned) if (readEvidence(join(dirname(run.directory), name)).identity.sha256 !== digest) refuse();
    return original;
  };
  if (importing) {
    for (const suffix of ['create-started', 'create-ack', 'pending', 'create-result']) {
      owned.set(`${prefix}${suffix}.json`, readEvidence(path(suffix)).identity.sha256);
    }
  }
  const persist = (suffix: string, value: unknown) => {
    writeReleaseEvidence(path(suffix), value);
    const digest = sha256(JSON.stringify(value, null, 2) + '\n');
    if (readEvidence(path(suffix)).identity.sha256 !== digest) refuse();
    owned.set(`${prefix}${suffix}.json`, digest); return digest;
  };
  const fail = (error?: unknown) => {
    result.status = 'STOP';
    result.firstError ??= { stage: result.stage, category: signal.aborted ? 'aborted' : 'refused',
      ...(result.stage === 'metadata' && error instanceof AppMetadataError ? { metadata: error.diagnostic } : {}) };
    result.stage = result.firstError.stage;
  };
  return { result, capability, check, persist, fail, owned, prefix };
}

export async function createHeldCorrection(context: HeldCorrectionContext, prepare: () => PreparedHeldMetadata,
  makeCli: () => HeldCreateCli): Promise<HeldCorrectionResult> {
  const s = session(context), result = s.result, { run, artifact, provider, signal } = context;
  let prepared: PreparedHeldMetadata | undefined, cli: HeldCreateCli | undefined, claimDigest: string | undefined;
  let ackDigest: string | undefined, candidate: Candidate | undefined, archiveDigest: string | undefined;
  try {
    const original = s.check();
    result.stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); s.check();
    result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'input'; prepared = prepare(); s.check();
    result.stage = 'metadata'; const metadata: CurrentAppMetadata = await prepared.observe(() => {
      s.check(); if (result.metadataRequests) refuse(); result.metadataRequests++;
    });
    if (result.metadataRequests !== 1 || !/^[a-f0-9]{64}$/.test(metadata.metadataDigest)
      || !Number.isInteger(metadata.keyCount) || metadata.keyCount < 1 || metadata.keyCount > 64) refuse();
    s.check(); result.stage = 'cleanup'; prepared.dispose(); prepared = undefined; s.check();
    result.stage = 'claim';
    const claim: HeldCorrectionClaim = { version: 1, kind: 'held-config-correction-create', basis: heldCorrection,
      executionId: original.target.executionId, packetDigest: run.digest, unknownHead: retainedUnknown.head,
      inventoryDigest: original.pending.inventoryDigest, bootstrapProofDigest: original.pending.bootstrapProofDigest,
      artifactDigest: artifact.digest, executableDigest: context.executableDigest, capability: s.capability,
      metadataDigest: metadata.metadataDigest, keyCount: metadata.keyCount };
    claimDigest = s.persist('create-started', claim); s.check();
    result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'create'; cli = makeCli();
    const created = await cli.create(() => {
      s.check(); if (result.createCommands) refuse();
      result.createCommands++; result.disposition = 'create-unknown';
    });
    // Preserve even a failed/aborted acknowledgement before any guard or cleanup check.
    result.stage = 'ack'; const id = acknowledgedId(created.stdout);
    if (id) {
      result.candidateId = id; result.disposition = 'known-held-stop';
      ackDigest = s.persist('create-ack', { version: 1, kind: 'held-config-correction-ack', claimDigest,
        deploymentId: id, code: created.code, aborted: created.aborted });
    }
    if (!id || !ackDigest || created.code !== 0 || created.aborted || result.createCommands !== 1
      || id === original.target.candidate || id === run.packet.predecessorId || id === 'dpl_525LvEPCBud7nyAeFTcRx8iipTrk') refuse();
    s.check(); result.stage = 'ready';
    for (let attempt = 0; attempt < 30; attempt++) {
      candidate = await provider.inspect(id); s.check();
      if (candidate.id !== id) refuse();
      if (candidate.ready) break;
      if (attempt === 29) refuse();
      await pause(4000, undefined, { signal });
    }
    if (!candidate?.ready || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(candidate.origin)) refuse();
    result.stage = 'archive'; archiveDigest = await provider.attest(id); s.check();
    if (!/^[a-f0-9]{64}$/.test(archiveDigest)) refuse();
    result.stage = 'preflight'; await provider.preflight(); s.check();
  } catch (error) { s.fail(error); }
  finally {
    for (const dispose of [prepared ? () => prepared!.dispose() : undefined, cli ? () => cli!.dispose() : undefined]) {
      if (!dispose) continue;
      try { if (!result.firstError) result.stage = 'cleanup'; await dispose(); }
      catch (error) { s.fail(error); }
    }
  }
  try {
    if (result.firstError) refuse();
    s.check(); result.stage = 'pending';
    if (!claimDigest || !ackDigest || !candidate || !archiveDigest) refuse();
    const pending: HeldCorrectionPending = { version: 1, kind: 'held-config-correction-pending', claimDigest, ackDigest,
      candidate: { id: candidate.id, origin: candidate.origin }, archiveDigest };
    const pendingDigest = s.persist('pending', pending); s.check();
    result.stage = 'terminal'; s.persist('create-result', { version: 1, kind: 'held-config-correction-result',
      claimDigest, pendingDigest, status: 'HELD_PROBE_PENDING' });
    s.check(); result.target = readHeldCorrectionPending(run.directory, run.packet, run.digest, retainedUnknown.head).target;
    result.status = 'HELD_PROBE_PENDING'; result.disposition = 'held-probe-pending'; result.stage = 'complete';
  } catch (error) {
    s.fail(error);
    if (claimDigest && !s.owned.has(`${s.prefix}create-result.json`)) {
      try { s.persist('create-result', { version: 1, kind: 'held-config-correction-result', claimDigest, status: 'STOP', result }); }
      catch { /* The consumed claim and any partial ACK/result remain immutable. */ }
    }
  }
  return result;
}

export async function importHeldCorrectionProof(context: HeldCorrectionContext, workflowRun: string,
  verifyProof: (target: HeldAppTarget) => Promise<HeldAppProbeProof>): Promise<HeldCorrectionResult> {
  const s = session(context, true), result = s.result, { run, artifact, provider } = context;
  let importClaimDigest: string | undefined;
  try {
    s.check();
    if (!/^[1-9][0-9]{0,19}$/.test(workflowRun) || workflowRun === heldCorrection.failedProbeRun) refuse();
    const lineage = readHeldCorrectionPending(run.directory, run.packet, run.digest, retainedUnknown.head);
    if (lineage.proofExecutableDigest !== context.executableDigest || canonical(lineage.capability) !== canonical(s.capability)) refuse();
    const { target, pending } = lineage;
    result.target = target;
    result.candidateId = target.candidate; result.disposition = 'known-held-stop';
    result.stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); s.check();
    result.stage = 'claim'; importClaimDigest = s.persist('import-started', { version: 1, kind: 'held-config-correction-import',
      unknownHead: retainedUnknown.head, pendingDigest: target.heldReceiptDigest, workflowRun, executableDigest: context.executableDigest });
    s.check(); result.stage = 'proof'; const proof = await verifyProof(target); s.check();
    if (proof.workflowRun !== workflowRun || canonical(proof.sourceDigests) !== canonical(s.capability.sourceDigests)
      || proof.binding.workflowRevision === s.capability.controllerPublication.revision
      || proof.binding.workflowRevision === heldCorrection.sourceRevision) refuse();
    result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'ready'; const candidate = await provider.inspect(target.candidate); s.check();
    if (!candidate.ready || candidate.id !== target.candidate || candidate.origin !== target.origin) refuse();
    result.stage = 'archive'; if (await provider.attest(target.candidate) !== pending.archiveDigest) refuse(); s.check();
    result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'receipt'; const receiptDigest = s.persist('current-proof', { version: 1, kind: 'app-corrected-configuration',
      executionId: target.executionId, packetDigest: run.digest, unknownHead: retainedUnknown.head,
      pendingDigest: target.heldReceiptDigest, importClaimDigest, probe: proof, historicalWrite: 'unknown', historicalPostAck: 'absent',
      scope: 'held-deployment-runtime', promotion: 'not_started' });
    s.check(); result.stage = 'event';
    const current = appendActivationEvent(run.directory, run.packet, run.digest, 'app-config', 'configuration-attested', {
      receiptDigest, deploymentId: target.candidate, configDigest: run.packet.appConfigDigest, correction: heldCorrection.selector });
    context.verifyExecutable();
    if (current.events.length !== 23 || current.next !== 'app' || current.heldCandidate?.deploymentId !== target.candidate
      || readActivationJournal(run.directory, run.packet, run.digest).head !== current.head) refuse();
    result.stage = 'terminal'; s.persist('import-result', { version: 1, kind: 'held-config-correction-import-result',
      importClaimDigest, status: 'CURRENT_CONFIG_ATTESTED', head: current.head, receiptDigest });
    result.status = 'CURRENT_CONFIG_ATTESTED'; result.disposition = 'current-attested'; result.stage = 'complete';
  } catch (error) {
    s.fail(error);
    if (importClaimDigest && !s.owned.has(`${s.prefix}import-result.json`)) {
      try { s.persist('import-result', { version: 1, kind: 'held-config-correction-import-result', importClaimDigest, status: 'STOP', result }); }
      catch { /* A partial import cannot unlock another import or CREATE. */ }
    }
  }
  return result;
}
