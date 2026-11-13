import { bridgeRecovery, verifyRecoveredBridgeProduction } from './activation-candidate-recovery.js';
import type { RecoveryGuard, RecoveryIo } from './activation-candidate-recovery.js';
import type { ActivationPhaseProvider } from './activation.js';
import { recoveryGithubStatus } from './activation-input-transfer.js';
import { recoveryIo } from './activation-recovery-io.js';

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
