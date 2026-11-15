import { bridgeRecovery, verifyRecoveredBridgeProduction } from './activation-candidate-recovery.js';
import type { RecoveryGuard, RecoveryIo } from './activation-candidate-recovery.js';
import type { ActivationPhaseProvider } from './activation.js';
import { recoveryGithubStatus } from './activation-input-transfer.js';
import { readHeldCandidate, recoveryIo } from './activation-recovery-io.js';
import { readActivationJournal, verifyActivationArtifact } from './activation-journal.js';
import type { ActivationRun } from './activation.js';
import type { VerifiedArtifact } from './artifact.js';
import type { HeldAppReadProvider } from './activation-held.js';
import { inspectCandidate, uploadedCandidatePartition, verifyCandidateArchive } from './ci-provider.js';
import { normalizeManualArchive } from './activation-archive-transport.mjs';

const mainRevision = 'd3d2b0788d970377c9fee9d59c52e3d1baff7de2';
const mainTree = 'ff6611ac0eb82a250d8e3b44318468cfd15e2f42';
const logUrl = `https://github.com/khuonghuyhieu/esty-admin/actions/runs/${bridgeRecovery.workflowRun}`;
function refuse(): never { throw new Error('Recovered activation provider identity or acknowledgement differs.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, unknown>;
}
function statusBinding(journal: number, state: string, description: string): void {
  if (journal !== bridgeRecovery.journal || state !== 'in_progress' || typeof description !== 'string'
    || /[\r\n]/.test(description) || !/^activation:(roles|migration|bootstrap|app-config):(intent|outcome):[a-f0-9]{64}$/.test(description)) refuse();
}
export function recoveredActivationProvider(guard: RecoveryGuard, signal: AbortSignal,
  io: RecoveryIo = recoveryIo(guard, signal), record = recoveryGithubStatus): ActivationPhaseProvider {
  return {
    async currentMain() {
      signal.throwIfAborted();
      const main = object(await io.github('/commits/main'));
      if (main.sha !== mainRevision || object(object(main.commit).tree).sha !== mainTree) refuse();
    },
    async binding(id) {
      if (id !== bridgeRecovery.candidate) refuse();
      signal.throwIfAborted();
      await verifyRecoveredBridgeProduction(io);
    },
    async record(journal, state, description) {
      statusBinding(journal, state, description);
      await record(journal, state, description, guard, signal);
    },
    async confirmJournal(journal, state, description) {
      if (description !== `ack:${bridgeRecovery.candidate}`) statusBinding(journal, state, description);
      else if (journal !== bridgeRecovery.journal || state !== 'in_progress') refuse();
      signal.throwIfAborted();
      const entry = object(await io.github(`/deployments/${bridgeRecovery.journal}`)), payload = object(entry.payload);
      if (entry.id !== bridgeRecovery.journal || entry.environment !== 'be-production' || entry.task !== 'deploy:esty-be-ci'
        || payload.run !== bridgeRecovery.workflowRun || payload.activationRun !== bridgeRecovery.activationRun
        || payload.activationPacket !== bridgeRecovery.packetDigest || payload.artifact !== bridgeRecovery.artifactDigest
        || payload.project !== bridgeRecovery.project || payload.sourceDigest !== bridgeRecovery.sourceDigest) refuse();
      const statuses = await io.github(`/deployments/${bridgeRecovery.journal}/statuses?per_page=100`);
      if (!Array.isArray(statuses) || statuses.length === 0) refuse();
      const latest = object(statuses[0]);
      if (latest.state !== state || latest.description !== description || latest.log_url !== logUrl) refuse();
    },
  };
}

// Task C controller provenance is distinct from the retained activation/workflow/artifact identities.
export function taskCBootstrapProvider(guard: RecoveryGuard, signal: AbortSignal,
  io: RecoveryIo = recoveryIo(guard, signal), record = recoveryGithubStatus): ActivationPhaseProvider {
  const retained = recoveredActivationProvider(guard, signal, io, record);
  const bootstrapStatus = (description: string) => {
    if (!/^activation:bootstrap:(intent|outcome):[a-f0-9]{64}$/.test(description)) refuse();
  };
  return {
    ...retained,
    async currentMain() {
      signal.throwIfAborted();
      const main = object(await io.github('/commits/main'));
      if (main.sha !== '7ce06834010e4c113663c76e1ce937949c35d941'
        || object(object(main.commit).tree).sha !== '6abbfe451e1a4e2198e85023336e72473c304f39') refuse();
    },
    async record(journal, state, description) {
      if (!/^activation:bootstrap:outcome:[a-f0-9]{64}$/.test(description)) refuse();
      await retained.record(journal, state, description);
    },
    async confirmJournal(journal, state, description) {
      bootstrapStatus(description);
      await retained.confirmJournal(journal, state, description);
    },
  };
}

// D1 may configure only the existing675 execution; it cannot deliver a candidate.
export function taskD1ConfigurationProvider(guard: RecoveryGuard, signal: AbortSignal,
  io: RecoveryIo = recoveryIo(guard, signal), record = recoveryGithubStatus): ActivationPhaseProvider {
  const retained = recoveredActivationProvider(guard, signal, io, record);
  return {
    ...retained,
    async currentMain() {
      signal.throwIfAborted();
      const main = object(await io.github('/commits/main'));
      if (main.sha !== 'c0e6d435b7d4bb4c65b50a540097a317f080bcac'
        || object(object(main.commit).tree).sha !== 'eb966a64f350211920152ceccab3b71c43874bff') refuse();
    },
    async record(journal, state, description) {
      if (!/^activation:app-config:(intent|outcome):[a-f0-9]{64}$/.test(description)) refuse();
      await retained.record(journal, state, description);
    },
    async confirmJournal(journal, state, description) {
      if (!/^activation:app-config:(intent|outcome):[a-f0-9]{64}$/.test(description)
        && description !== 'activation:bootstrap:outcome:99f6123eb3b53cd6c23124d45977f16d2e0b9b4bb56abfccbd228c26d913d4d7') refuse();
      await retained.confirmJournal(journal, state, description);
    },
  };
}

export function heldAppReadProvider(run: ActivationRun, artifact: VerifiedArtifact, guard: RecoveryGuard,
  signal: AbortSignal, creating: boolean): HeldAppReadProvider {
  const retained = taskD1ConfigurationProvider(guard, signal);
  const activation = { packet: run.packet, packetDigest: run.digest, phase: 'app' as const };
  const identity = { revision: run.packet.revision, tree: run.packet.tree, run: bridgeRecovery.workflowRun };
  const read = (id: string, path: string) => readHeldCandidate(guard, signal, id, path);
  return {
    async preflight() {
      signal.throwIfAborted(); guard.verify(); verifyActivationArtifact(artifact, run.packet);
      const current = readActivationJournal(run.directory, run.packet, run.digest), intent = current.events[18];
      if (current.events.length !== 22 || current.next !== 'app-config' || intent?.phase !== 'app-config' || intent.kind !== 'intent') refuse();
      // Import verifies the independently approved probe revision as current main, not the historical CREATE controller.
      if (creating) await retained.currentMain();
      await retained.binding(bridgeRecovery.candidate);
      await retained.confirmJournal(current.journal, 'in_progress', `activation:app-config:intent:${intent.sha256}`);
    },
    async inspect(id) {
      verifyActivationArtifact(artifact, run.packet);
      return inspectCandidate(await read(id, `/v13/deployments/${id}`), id, artifact, identity, activation);
    },
    async attest(id) {
      verifyActivationArtifact(artifact, run.packet);
      const uid = uploadedCandidatePartition(normalizeManualArchive(await read(id, `/v6/deployments/${id}/files`)));
      return verifyCandidateArchive(await read(id, `/v8/deployments/${id}/files/${uid}`), uid, artifact);
    },
  };
}
