import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { canonical, sha256 } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { retainedD1BootstrapPins, verifyRecoveredRoleAssets } from './activation.js';
import type { ActivationRun } from './activation.js';
import { retainedUnknown, verifyRetainedAppUnknown } from './activation-schema-diagnostic.js';
import type { RetainedAppUnknown } from './activation-schema-diagnostic.js';
import { appendActivationEvent, heldEvidencePath, readActivationJournal, readHeldAppCleanup, readHeldAppPending } from './activation-journal.js';
import type { AppCurrentConfigurationAttestationReceipt, HeldAppPendingReceipt } from './activation-journal.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { acknowledgedId } from './ci-delivery.js';
import type { CommandResult } from './ci-tools.js';
import type { Candidate } from './ci-provider.js';
import { AppMetadataError } from './activation-configuration.js';
import type { AppMetadataDiagnostic, CurrentAppMetadata, MissingFiveAck, MissingFiveMetadata } from './activation-configuration.js';
import type { HeldAppProbeProof, HeldAppTarget } from './activation-held-proof.js';
import { rolesReachability } from './activation-recovery-origin.js';

export interface HeldAppReadProvider {
  preflight(): Promise<void>;
  inspect(id: string): Promise<Candidate>;
  attest(id: string): Promise<string>;
}
export interface HeldCreateCli { create(beforeDispatch: () => void): Promise<CommandResult>; dispose(): Promise<void> }
export interface PreparedHeldMetadata { observe(dispatched: () => void): Promise<CurrentAppMetadata>; dispose(): void }
export interface HeldAppExpectations extends RetainedAppUnknown { bootstrapPins: Readonly<Record<string, string>> }
export interface HeldAppControllerContext {
  run: ActivationRun; artifact: VerifiedArtifact; provider: HeldAppReadProvider;
  executableDigest: string; verifyExecutable(): unknown; signal: AbortSignal;
  expected?: HeldAppExpectations;
}
type HeldStage = 'guard' | 'assets' | 'preflight' | 'input' | 'metadata' | 'claim' | 'create' | 'ack'
  | 'ready' | 'archive' | 'cleanup' | 'pending' | 'proof' | 'receipt' | 'event' | 'terminal' | 'complete';
export interface HeldAppResult {
  status: 'STOP' | 'HELD_PROBE_PENDING' | 'CURRENT_CONFIG_ATTESTED'; stage: HeldStage;
  firstError: { stage: HeldStage; category: 'refused' | 'aborted'; metadata?: Readonly<AppMetadataDiagnostic> } | null;
  candidateId: string | null; metadataRequests: number; createCommands: number; candidateRequests: 0; envPosts: 0; promotions: 0;
  disposition: 'not-started' | 'create-unknown' | 'known-held-stop' | 'held-probe-pending' | 'current-attested';
  historicalWrite: 'unknown'; historicalPostAck: 'absent';
}
function refuse(): never { throw new Error('Held app configuration remains fenced.'); }
function checkRetainedApp(context: HeldAppControllerContext, expected: HeldAppExpectations) {
  const { run, signal } = context;
  signal.throwIfAborted(); context.verifyExecutable();
  if (!/^[a-f0-9]{64}$/.test(context.executableDigest)) refuse();
  verifyRetainedAppUnknown(run, expected);
  for (const [suffix, hash] of Object.entries(expected.bootstrapPins)) {
    const root = suffix === 'bootstrap-verification' ? run.directory : dirname(run.directory);
    if (readEvidence(join(root, `${run.packet.runId}.${suffix}.json`)).identity.sha256 !== hash) refuse();
  }
}
function session(context: HeldAppControllerContext) {
  const { run, signal } = context, expected = context.expected ?? { ...retainedUnknown, bootstrapPins: retainedD1BootstrapPins() };
  const prefix = `${run.packet.runId}.held-app-`, owned = new Map<string, string>();
  const result: HeldAppResult = { status: 'STOP', stage: 'guard', firstError: null, candidateId: null,
    metadataRequests: 0, createCommands: 0, candidateRequests: 0, envPosts: 0, promotions: 0,
    disposition: 'not-started', historicalWrite: 'unknown', historicalPostAck: 'absent' };
  const bootstrapProofDigest = sha256(canonical(expected.bootstrapPins));
  const check = () => {
    checkRetainedApp(context, expected);
    const names = readdirSync(dirname(run.directory)).filter(name => name.startsWith(prefix)).sort();
    if (canonical(names) !== canonical([...owned.keys()].sort())) refuse();
    for (const [name, hash] of owned) if (readEvidence(join(dirname(run.directory), name)).identity.sha256 !== hash) refuse();
    if (owned.has(`${prefix}attest-started.json`)) {
      const { claim } = readHeldAppCleanup(run.directory, run.packet, run.digest, expected.head);
      if (claim.inventoryDigest !== expected.inventory || claim.bootstrapProofDigest !== bootstrapProofDigest) refuse();
    }
  };
  const persist = (suffix: string, value: unknown) => {
    const path = heldEvidencePath(run.directory, run.packet, suffix);
    writeReleaseEvidence(path, value);
    const evidence = readEvidence(path), hash = sha256(JSON.stringify(value, null, 2) + '\n');
    if (evidence.identity.sha256 !== hash) refuse();
    owned.set(`${prefix}${suffix}.json`, hash); return hash;
  };
  const fail = (error?: unknown) => {
    result.status = 'STOP';
    result.firstError ??= { stage: result.stage, category: signal.aborted ? 'aborted' : 'refused',
      ...(result.stage === 'metadata' && error instanceof AppMetadataError ? { metadata: error.diagnostic } : {}) };
    result.stage = result.firstError.stage;
  };
  return { expected, owned, result, check, persist, fail, bootstrapProofDigest };
}
export async function createHeldApp(context: HeldAppControllerContext, prepare: () => PreparedHeldMetadata,
  makeCli: () => HeldCreateCli): Promise<HeldAppResult> {
  const { run, artifact, provider, signal } = context, s = session(context), result = s.result;
  let prepared: PreparedHeldMetadata | undefined, cli: HeldCreateCli | undefined, claimDigest: string | undefined;
  let metadata: CurrentAppMetadata | undefined, candidate: Candidate | undefined, archiveDigest: string | undefined;
  let ackDigest: string | undefined;
  try {
    s.check(); result.stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); s.check();
    result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'input'; prepared = prepare(); s.check();
    result.stage = 'metadata'; metadata = await prepared.observe(() => {
      s.check(); if (result.metadataRequests) refuse(); result.metadataRequests++;
    });
    s.check();
    if (result.metadataRequests !== 1 || !/^[a-f0-9]{64}$/.test(metadata.metadataDigest)
      || !Number.isInteger(metadata.keyCount) || metadata.keyCount < 1 || metadata.keyCount > 64) refuse();
    result.stage = 'cleanup'; prepared.dispose(); prepared = undefined; s.check();
    result.stage = 'claim';
    claimDigest = s.persist('create-started', { version: 1, kind: 'held-app-create', executionId: rolesReachability.executionId,
      packetDigest: run.digest, unknownHead: s.expected.head, inventoryDigest: s.expected.inventory,
      executableDigest: context.executableDigest, bootstrapProofDigest: s.bootstrapProofDigest,
      metadataDigest: metadata.metadataDigest, keyCount: metadata.keyCount });
    s.check(); result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'create'; cli = makeCli();
    const created = await cli.create(() => {
      s.check(); if (result.createCommands) refuse(); result.createCommands++; result.disposition = 'create-unknown';
    });
    // No cancellation/guard/cleanup can discard an acknowledged ID before this durable record.
    result.stage = 'ack'; const id = acknowledgedId(created.stdout);
    if (id) {
      result.candidateId = id; result.disposition = 'known-held-stop';
      ackDigest = s.persist('create-ack', { version: 1, kind: 'held-app-create-ack', claimDigest, deploymentId: id,
        code: created.code, aborted: created.aborted });
    }
    if (!id || !ackDigest || created.code !== 0 || created.aborted || result.createCommands !== 1) refuse();
    s.check(); result.stage = 'ready';
    for (let attempt = 0; attempt < 30; attempt++) {
      candidate = await provider.inspect(id); s.check();
      if (candidate.id !== id) refuse();
      if (candidate.ready) break;
      if (attempt === 29) refuse();
      await pause(4000, undefined, { signal }); s.check();
    }
    if (!candidate?.ready) refuse();
    result.stage = 'archive'; archiveDigest = await provider.attest(id); s.check();
    if (!/^[a-f0-9]{64}$/.test(archiveDigest)) refuse();
    result.stage = 'preflight'; await provider.preflight(); s.check();
  } catch (error) { s.fail(error); }
  finally {
    for (const dispose of [prepared ? () => prepared!.dispose() : undefined, cli ? () => cli!.dispose() : undefined]) {
      if (!dispose) continue;
      try { if (!result.firstError) result.stage = 'cleanup'; await dispose(); }
      catch { s.fail(); }
    }
  }
  try {
    if (result.firstError) throw new Error('Stopped');
    s.check(); result.stage = 'pending';
    if (!claimDigest || !metadata || !candidate || !archiveDigest || !ackDigest) refuse();
    const pending: HeldAppPendingReceipt = { version: 1, kind: 'held-app-pending', executionId: rolesReachability.executionId,
      packetDigest: run.digest, unknownHead: s.expected.head, inventoryDigest: s.expected.inventory,
      executableDigest: context.executableDigest, bootstrapProofDigest: s.bootstrapProofDigest,
      metadataDigest: metadata.metadataDigest, keyCount: metadata.keyCount, createClaimDigest: claimDigest,
      createAckDigest: ackDigest, candidate: { id: candidate.id, origin: candidate.origin }, archiveDigest };
    const pendingDigest = s.persist('pending', pending); s.check();
    result.stage = 'terminal'; s.persist('create-result', { version: 1, kind: 'held-app-create-result', claimDigest,
      pendingDigest, status: 'HELD_PROBE_PENDING' }); s.check();
    result.status = 'HELD_PROBE_PENDING'; result.disposition = 'held-probe-pending'; result.stage = 'complete';
  } catch {
    s.fail();
    if (claimDigest && !s.owned.has(`${run.packet.runId}.held-app-create-result.json`)) {
      try { s.persist('create-result', { version: 1, kind: 'held-app-create-result', claimDigest, status: 'STOP', result }); }
      catch { /* Retained partial/absent terminal evidence remains non-replayable. */ }
    }
  }
  return result;
}

export async function attestHeldApp(context: HeldAppControllerContext): Promise<HeldAppResult> {
  const { run, artifact, provider } = context, s = session(context), result = s.result;
  let attestClaimDigest: string | undefined;
  try {
    for (const suffix of ['create-started', 'create-ack', 'create-result']) {
      s.owned.set(`${run.packet.runId}.held-app-${suffix}.json`, readEvidence(heldEvidencePath(run.directory, run.packet, suffix)).identity.sha256);
    }
    s.check();
    const lineage = readHeldAppCleanup(run.directory, run.packet, run.digest, s.expected.head);
    const { claim, candidateId, createClaimDigest, createAckDigest, createResultDigest } = lineage;
    if (claim.inventoryDigest !== s.expected.inventory || claim.bootstrapProofDigest !== s.bootstrapProofDigest
      || context.executableDigest === claim.executableDigest) refuse();
    result.candidateId = candidateId; result.disposition = 'known-held-stop';
    result.stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); s.check();
    result.stage = 'claim';
    attestClaimDigest = s.persist('attest-started', { version: 1, kind: 'held-app-attest',
      createClaimDigest, createAckDigest, createResultDigest, createExecutableDigest: claim.executableDigest,
      executableDigest: context.executableDigest });
    s.check(); result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'ready'; const candidate = await provider.inspect(candidateId); s.check();
    if (candidate.id !== candidateId || !candidate.ready || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(candidate.origin)) refuse();
    result.stage = 'archive'; const archiveDigest = await provider.attest(candidateId); s.check();
    if (!/^[a-f0-9]{64}$/.test(archiveDigest)) refuse();
    result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'pending';
    const pending: HeldAppPendingReceipt = { ...claim, kind: 'held-app-pending', createClaimDigest, createAckDigest,
      candidate: { id: candidate.id, origin: candidate.origin }, archiveDigest };
    const pendingDigest = s.persist('pending', pending); s.check();
    result.stage = 'terminal';
    s.persist('attest-result', { version: 1, kind: 'held-app-attest-result', attestClaimDigest,
      pendingDigest, status: 'HELD_PROBE_PENDING' }); s.check();
    result.status = 'HELD_PROBE_PENDING'; result.disposition = 'held-probe-pending'; result.stage = 'complete';
  } catch (error) {
    s.fail(error);
    if (attestClaimDigest && !s.owned.has(`${run.packet.runId}.held-app-attest-result.json`)) {
      try { s.persist('attest-result', { version: 1, kind: 'held-app-attest-result', attestClaimDigest, status: 'STOP', result }); }
      catch { /* A partial claim/result remains consumed; never retry attestation or CREATE. */ }
    }
  }
  return result;
}

export interface PreparedMissingFiveConfiguration {
  observe(dispatched: () => void): Promise<MissingFiveMetadata>;
  post(dispatched: () => void): Promise<MissingFiveAck>;
  verify(before: MissingFiveMetadata, ack: MissingFiveAck, dispatched: () => void): Promise<CurrentAppMetadata>;
  dispose(): void;
}
type MissingFiveStage = 'guard' | 'assets' | 'preflight' | 'input' | 'metadata' | 'claim' | 'post'
  | 'ack' | 'verification' | 'cleanup' | 'receipt' | 'complete';
export interface MissingFiveResult {
  status: 'STOP' | 'MISSING_FIVE_CORRECTED'; stage: MissingFiveStage;
  firstError: { stage: MissingFiveStage; category: 'refused' | 'aborted'; metadata?: Readonly<AppMetadataDiagnostic> } | null;
  disposition: 'not-started' | 'unknown' | 'acknowledged-unverified' | 'verified';
  acknowledgement: MissingFiveAck | null; metadataRequests: number; envPosts: number;
  createCommands: 0; candidateRequests: 0; promotions: 0; journalTransitions: 0;
  historicalWrite: 'unknown'; historicalPostAck: 'absent';
}
export async function correctMissingFiveApp(context: HeldAppControllerContext,
  prepare: () => PreparedMissingFiveConfiguration): Promise<MissingFiveResult> {
  const { run, artifact, provider, signal } = context;
  const expected = context.expected ?? { ...retainedUnknown, bootstrapPins: retainedD1BootstrapPins() };
  const prefix = `${run.packet.runId}.app-missing-five-`, owned = new Map<string, string>();
  const result: MissingFiveResult = { status: 'STOP', stage: 'guard', firstError: null, disposition: 'not-started',
    acknowledgement: null, metadataRequests: 0, envPosts: 0, createCommands: 0, candidateRequests: 0,
    promotions: 0, journalTransitions: 0, historicalWrite: 'unknown', historicalPostAck: 'absent' };
  const check = () => {
    checkRetainedApp(context, expected);
    const names = readdirSync(dirname(run.directory));
    if (names.some(name => name.startsWith(`${run.packet.runId}.held-app-`))
      || canonical(names.filter(name => name.startsWith(prefix)).sort()) !== canonical([...owned.keys()].sort())) refuse();
    for (const [name, hash] of owned) if (readEvidence(join(dirname(run.directory), name)).identity.sha256 !== hash) refuse();
  };
  const persist = (suffix: string, value: unknown) => {
    const name = `${prefix}${suffix}.json`, path = join(dirname(run.directory), name);
    writeReleaseEvidence(path, value);
    const evidence = readEvidence(path), hash = sha256(JSON.stringify(value, null, 2) + '\n');
    if (evidence.identity.sha256 !== hash) refuse();
    owned.set(name, hash); return hash;
  };
  const fail = (error?: unknown) => {
    result.firstError ??= { stage: result.stage, category: signal.aborted ? 'aborted' : 'refused',
      ...(error instanceof AppMetadataError ? { metadata: error.diagnostic } : {}) };
    result.status = 'STOP'; result.stage = result.firstError.stage;
  };
  let prepared: PreparedMissingFiveConfiguration | undefined, claimDigest: string | undefined, ackDigest: string | undefined;
  let before: MissingFiveMetadata | undefined, verified: CurrentAppMetadata | undefined;
  try {
    check(); result.stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); check();
    result.stage = 'preflight'; await provider.preflight(); check();
    result.stage = 'input'; prepared = prepare(); check();
    result.stage = 'metadata'; before = await prepared.observe(() => {
      check(); if (result.metadataRequests) refuse(); result.metadataRequests++;
    });
    check();
    if (result.metadataRequests !== 1 || !/^[a-f0-9]{64}$/.test(before.metadataDigest)
      || !Number.isInteger(before.keyCount) || before.keyCount < 1 || before.keyCount > 64) refuse();
    result.stage = 'claim';
    claimDigest = persist('started', { version: 1, kind: 'app-missing-five-started', executionId: rolesReachability.executionId,
      packetDigest: run.digest, unknownHead: expected.head, inventoryDigest: expected.inventory,
      executableDigest: context.executableDigest, bootstrapProofDigest: sha256(canonical(expected.bootstrapPins)),
      metadataDigest: before.metadataDigest, keyCount: before.keyCount, historicalWrite: 'unknown', historicalPostAck: 'absent' });
    check(); result.stage = 'preflight'; await provider.preflight(); check();
    result.stage = 'post';
    const ack = await prepared.post(() => {
      check(); if (result.envPosts) refuse(); result.envPosts++; result.disposition = 'unknown';
    });
    // Preserve every safe returned ID and per-key result before cancellation, rechecks or disposal.
    result.acknowledgement = ack; result.stage = 'ack';
    ackDigest = persist('ack', { version: 1, kind: 'app-missing-five-ack', claimDigest, acknowledgement: ack });
    if (result.envPosts !== 1 || ack.outcome !== 'acknowledged') refuse();
    result.disposition = 'acknowledged-unverified'; check();
    result.stage = 'verification'; verified = await prepared.verify(before, ack, () => {
      check(); if (result.metadataRequests !== 1) refuse(); result.metadataRequests++;
    });
    check();
    if ((result.metadataRequests as number) !== 2 || verified.keyCount !== before.keyCount + 5
      || !/^[a-f0-9]{64}$/.test(verified.metadataDigest)) refuse();
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
        check();
        if (!ackDigest || !verified) refuse();
        result.stage = 'receipt';
        persist('verified', { version: 1, kind: 'app-missing-five-verified', claimDigest, ackDigest,
          metadataDigest: verified.metadataDigest, keyCount: verified.keyCount,
          historicalWrite: 'unknown', historicalPostAck: 'absent', valueProof: 'pending-candidate-runtime' });
        check(); result.disposition = 'verified';
      }
      const terminal: MissingFiveResult = result.firstError ? { ...result }
        : { ...result, status: 'MISSING_FIVE_CORRECTED', stage: 'complete' };
      persist('result', { version: 1, kind: 'app-missing-five-result', claimDigest,
        status: terminal.status, result: terminal });
      if (!result.firstError) { check(); Object.assign(result, terminal); }
    } catch (error) { fail(error); }
  }
  return result;
}
export async function importHeldAppProof(context: HeldAppControllerContext, workflowRun: string,
  verifyProof: (target: HeldAppTarget) => Promise<HeldAppProbeProof>): Promise<HeldAppResult> {
  const { run, artifact, provider } = context, s = session(context), result = s.result;
  let importClaimDigest: string | undefined;
  try {
    if (!/^[1-9][0-9]{0,19}$/.test(workflowRun)) refuse();
    const { pending, target, proofExecutableDigest, receiptSuffixes } = readHeldAppPending(run.directory, run.packet, run.digest, s.expected.head);
    for (const suffix of receiptSuffixes) {
      s.owned.set(`${run.packet.runId}.held-app-${suffix}.json`, readEvidence(heldEvidencePath(run.directory, run.packet, suffix)).identity.sha256);
    }
    s.check(); result.stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); s.check();
    if (proofExecutableDigest !== context.executableDigest || pending.bootstrapProofDigest !== s.bootstrapProofDigest) refuse();
    result.candidateId = target.candidate; result.disposition = 'known-held-stop'; result.stage = 'claim';
    importClaimDigest = s.persist('import-started', { version: 1, kind: 'held-app-import', unknownHead: s.expected.head,
      pendingDigest: target.heldReceiptDigest, workflowRun, executableDigest: context.executableDigest });
    s.check(); result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'ready'; const candidate = await provider.inspect(target.candidate); s.check();
    if (!candidate.ready || candidate.id !== target.candidate || candidate.origin !== target.origin) refuse();
    result.stage = 'archive'; const archive = await provider.attest(target.candidate); s.check();
    if (archive !== pending.archiveDigest) refuse();
    result.stage = 'preflight'; await provider.preflight(); s.check();
    result.stage = 'proof'; const probe = await verifyProof(target); s.check();
    if (probe.workflowRun !== workflowRun) refuse();
    const receipt: AppCurrentConfigurationAttestationReceipt = { version: 1, kind: 'app-current-configuration',
      executionId: rolesReachability.executionId, packetDigest: run.digest, unknownHead: s.expected.head,
      pendingDigest: target.heldReceiptDigest, importClaimDigest, probe, historicalWrite: 'unknown', historicalPostAck: 'absent',
      scope: 'held-deployment-runtime', promotion: 'not_started' };
    result.stage = 'receipt'; const receiptDigest = s.persist('current-proof', receipt); s.check();
    result.stage = 'event';
    const current = appendActivationEvent(run.directory, run.packet, run.digest, 'app-config', 'configuration-attested', {
      receiptDigest, deploymentId: target.candidate, configDigest: run.packet.appConfigDigest });
    context.verifyExecutable();
    if (current.events.length !== 23 || current.next !== 'app' || current.heldCandidate?.deploymentId !== target.candidate
      || readActivationJournal(run.directory, run.packet, run.digest).head !== current.head) refuse();
    result.stage = 'terminal'; s.persist('import-result', { version: 1, kind: 'held-app-import-result', importClaimDigest,
      status: 'CURRENT_CONFIG_ATTESTED', head: current.head, receiptDigest });
    result.status = 'CURRENT_CONFIG_ATTESTED'; result.disposition = 'current-attested'; result.stage = 'complete';
  } catch {
    s.fail();
    if (importClaimDigest && !s.owned.has(`${run.packet.runId}.held-app-import-result.json`)) {
      try { s.persist('import-result', { version: 1, kind: 'held-app-import-result', importClaimDigest, status: 'STOP', result }); }
      catch { /* Keep the one-shot claim and all partial proof; do not retry import or CREATE. */ }
    }
  }
  return result;
}
