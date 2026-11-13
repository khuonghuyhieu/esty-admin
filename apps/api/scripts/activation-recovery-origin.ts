import { readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { canonical, inventory, sha256 } from './artifact.js';
import { bridgeRecovery as target, bridgePreHttpContinuation, bridgePackagedPreHttpContinuation,
  bridgeExternalStartupProof } from './activation-candidate-recovery.js';
import type { ActivationPacket, ActivationState } from './activation-journal.js';
import { readEvidence } from './release-journal.js';
import type { FileIdentity } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';

type OriginalReader = (directory: string, packet: ActivationPacket, digest: string) => ActivationState;
interface RetainedFile { path: string; identity: FileIdentity }
export interface ActivationRecoveryOrigin {
  version: 1; kind: 'activation-recovery-origin'; executionId: string; directory: string;
  packet: ActivationPacket; packetDigest: string; journal: number; bridgeId: string; configDigest: string;
  executableDigest: string; probeReceiptDigest: string;
  source: { directory: string; inventoryDigest: string; head: string; events: number; files: RetainedFile[] };
  promotion: { directory: string; intentDigest: string; files: RetainedFile[] };
  initialProof: unknown; initialProofDigest: string;
  rolesPredecessor?: { executionId: string; directory: string; head: string; intentHash: string; files: RetainedFile[];
    cause: 'missing-migration-assets' | 'schema-usage-reachability'; observation: 'read-only-absent';
    correction?: typeof rolesReachability.correction };
}
export interface ActivationRecoveryBinding {
  origin: ActivationRecoveryOrigin; originDigest: string; identity: FileIdentity;
}
export const activationRecoveryExecution = '032fbf73-d0d7-42b6-9d68-f316e79e873d';
export const activationRolesSuccessor = 'f63c833b-09cb-4ee6-b07a-1bca86ae2379';
export const rolesReachability = Object.freeze({
  executionId: '675b465c-f3cc-48e0-8994-7a3312970e53',
  predecessorHead: '34305c99612689e7b9bf30f3dc073a99f92c02a3061f8a16f84f80c2d05b4b2a',
  correction: Object.freeze({
    acceptedExecutableDigest: 'a6a900a40aaa8fb063499178272630e4da456540e1d060d91bab6abe8d38f33e',
    sourceSha256: 'c43d45bafabe4b300e642221f12fc5e6bf148a9988c3a8d6b45fdd470009e1e8',
    moduleSha256: 'fa834bf2bd1b64aae8ff8e978ae9eb29629abc49a70a703db5992919339fda56',
  }),
});
const executableDigest = '5c586b05fccbdd7a0fda9149dd16d4f73667caf99bf62837e843051976f1ac9e';
const controlDigest = '756f9802100c9c86a75f24d3e688e6a5f57d745b6f7f96b88555c2acd105d559';
const intentDigest = '664c1a85b5478ad7d6bb90569ef841b96ed8a9e5b8e40c0f2be5e112a55afea0';
const recoveryFiles = Object.freeze({
  'startup-attempt.json': 'b1141f4e9da68c5d773b62674efd4ad7ef15420016ed3c9a590f09672c7c3d8e',
  'startup-result.json': '9a9acd641f6ec6b8f8fcd74426676defd7df3bdc4acc4f0b893f1aa7c383b7e4',
  'startup-correction.json': '75b59bb876a1704490a94ac76e48281cd23ee18de574bca7332e67bc6cf16a47',
  'startup-correction-result.json': '1b01b10d3ddcd8c50e7ccc5c14899d5ad217275eb9e9aea43c91c94380fe02ef',
  'startup-packaging-attempt.json': '30a5455b75d7210b40488cfe1c6886b775c42da003a061d78365b6f7bb3398ed',
  'startup-packaging-result.json': '0cf34fd52c0dc220f6a00078aa4656d20a57b384eef3f66c5e2feb7b5b34cee4',
  'promotion-intent.json': '465662db632c9d62e2a1bb315025b4eb7739b0a21d6827bb4ab14fb26f2a2d1b',
  'promotion-result.json': '0a5288d41d4df8811e5e87209c40962768681e4fd2d397d7c713fdfc89eb79c2',
});
function refuse(): never { throw new Error('Activation recovery origin is incomplete, changed or not approved.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, unknown>;
}
function exactNames(directory: string, names: readonly string[]): void {
  privateDirectory(directory, false);
  if (canonical(readdirSync(directory).sort()) !== canonical([...names].sort())) refuse();
}
function anchor(executable: string) {
  return { version: 1, originalHead: target.originalHead, originalInventory: target.originalInventory,
    packetDigest: target.packetDigest, journal: target.journal, candidate: target.candidate,
    executableDigest: executable, controlDigest };
}
function promotionEvidence(directory: string): RetainedFile[] {
  exactNames(directory, Object.keys(recoveryFiles));
  const attempt = { anchor: anchor(bridgePreHttpContinuation.previousExecutableDigest), kind: 'startup-attempt', state: 'unknown' };
  const correction = { anchor: anchor(bridgePackagedPreHttpContinuation.previousExecutableDigest),
    kind: 'startup-pre-http-correction', authorization: bridgePreHttpContinuation, state: 'unknown' };
  const packaging = { anchor: anchor(bridgeExternalStartupProof.previousExecutableDigest),
    kind: 'startup-packaging-attempt', authorization: bridgePackagedPreHttpContinuation, state: 'unknown' };
  const proof = { sourceReceiptDigest: bridgeExternalStartupProof.receiptDigest, receipt: {
    version: 1, run: { status: 'completed', conclusion: 'success', headSha: bridgeExternalStartupProof.workflowRevision,
      event: 'workflow_dispatch', url: `https://github.com/khuonghuyhieu/esty-admin/actions/runs/${bridgeExternalStartupProof.workflowRun}` },
    probe: { status: 200, configDigestMatch: true, bodyStatus: 'ok', identity: {
      repository: 'khuonghuyhieu/esty-admin', workflow: '.github/workflows/be-candidate-probe.yml',
      candidate: target.candidate, origin: target.origin, path: '/health/live', revision: target.revision,
      tree: target.tree, sourceDigest: target.sourceDigest, artifactDigest: target.artifactDigest,
      packetDigest: target.packetDigest, configDigest: target.configDigest, activationRun: target.activationRun,
      project: target.project, scope: target.scope, workflowRevision: bridgeExternalStartupProof.workflowRevision,
      workflowRun: bridgeExternalStartupProof.workflowRun } } } };
  const intent = { anchor: anchor(executableDigest), kind: 'promotion-intent', startupProofDigest: sha256(canonical(proof)),
    importedStartupProof: proof, authorization: bridgeExternalStartupProof, state: 'unknown' };
  if (sha256(canonical(intent)) !== intentDigest) refuse();
  const expected: Record<keyof typeof recoveryFiles, unknown> = {
    'startup-attempt.json': attempt,
    'startup-result.json': { anchor: attempt.anchor, kind: 'startup-result', attemptDigest: sha256(canonical(attempt)),
      result: { stage: 'metadata', category: 'refused' } },
    'startup-correction.json': correction,
    'startup-correction-result.json': { anchor: correction.anchor, kind: 'startup-correction-result',
      correctionDigest: sha256(canonical(correction)), result: { stage: 'metadata', category: 'refused' } },
    'startup-packaging-attempt.json': packaging,
    'startup-packaging-result.json': { anchor: packaging.anchor, kind: 'startup-packaging-result',
      attemptDigest: sha256(canonical(packaging)), result: { stage: 'startup', category: 'refused' } },
    'promotion-intent.json': intent,
    'promotion-result.json': { anchor: intent.anchor, kind: 'promotion-result', intentDigest,
      outcome: 'acknowledged', deploymentId: target.candidate },
  };
  return (Object.keys(recoveryFiles) as (keyof typeof recoveryFiles)[]).sort().map(path => {
    const evidence = readEvidence(join(directory, path));
    if (evidence.identity.sha256 !== recoveryFiles[path] || canonical(evidence.value) !== canonical(expected[path])) refuse();
    return { path, identity: evidence.identity };
  });
}
export function buildActivationRecoveryOrigin(sourceDirectory: string, recoveryDirectory: string, directory: string,
  packet: ActivationPacket, digest: string, executionId: string, readOriginal: OriginalReader,
  rolesPredecessorHead?: string): ActivationRecoveryOrigin {
  sourceDirectory = resolve(sourceDirectory); recoveryDirectory = resolve(recoveryDirectory); directory = resolve(directory);
  const reachability = executionId === rolesReachability.executionId;
  const successor = executionId === activationRolesSuccessor || reachability;
  if ((!successor && executionId !== activationRecoveryExecution)
    || (successor ? !/^[a-f0-9]{64}$/.test(rolesPredecessorHead ?? '') : rolesPredecessorHead !== undefined)
    || directory !== join(dirname(recoveryDirectory), `activation-recovered-${executionId}`)
    || executionId === packet.runId || digest !== target.packetDigest || sha256(canonical(packet)) !== target.packetDigest
    || packet.runId !== target.activationRun || packet.bridgeConfigDigest !== target.configDigest
    || [sourceDirectory, recoveryDirectory].some(path => directory === path || directory.startsWith(`${path}${sep}`)
      || path.startsWith(`${directory}${sep}`))) refuse();
  const run = join(sourceDirectory, 'activation', packet.runId);
  const names = ['packet.json', 'lock.json', 'reservation.json', ...Array.from({ length: 11 }, (_, i) => `${String(i).padStart(3, '0')}.json`)];
  exactNames(sourceDirectory, ['activation', 'operator.lock', 'packet-input.json',
    `${packet.runId}.initial.json`, `${packet.runId}.bridge-config.configuration.json`]);
  exactNames(join(sourceDirectory, 'activation'), [packet.runId]);
  exactNames(run, names);
  const snapshot = inventory(sourceDirectory);
  if (sha256(canonical(snapshot)) !== target.originalInventory
    || canonical(readEvidence(join(sourceDirectory, 'packet-input.json')).value) !== canonical(packet)) refuse();
  const retained = readOriginal(sourceDirectory, packet, digest), last = retained.events.at(-1);
  if (retained.recovery || retained.head !== target.originalHead || retained.journal !== target.journal
    || retained.events.length !== 11 || retained.next !== 'bridge' || last?.kind !== 'outcome'
    || object(last.value).result !== 'unknown' || object(last.value).deploymentId !== target.candidate
    || retained.events[9]?.kind !== 'acknowledged' || object(retained.events[9].value).deploymentId !== target.candidate) refuse();
  const initial = readEvidence(join(sourceDirectory, `${packet.runId}.initial.json`));
  if (canonical(initial.value) !== canonical({ version: 1, packetDigest: digest, inputDigest: packet.roleInputDigest,
    history: packet.migrations.slice(0, 1).map(item => item.name), roles: 'compatible-or-absent' })) refuse();
  const files = snapshot.files.map(file => {
    const evidence = readEvidence(join(sourceDirectory, file.path));
    if (evidence.identity.sha256 !== file.sha256) refuse();
    return { path: file.path, identity: evidence.identity };
  });
  const promotionFiles = promotionEvidence(recoveryDirectory);
  if (sha256(canonical(inventory(sourceDirectory))) !== target.originalInventory) refuse();
  let rolesPredecessor: ActivationRecoveryOrigin['rolesPredecessor'];
  if (successor) {
    const priorExecution = reachability ? activationRolesSuccessor : activationRecoveryExecution;
    const priorDirectory = join(dirname(recoveryDirectory), `activation-recovered-${priorExecution}`);
    const prior = readOriginal(priorDirectory, packet, digest), last = prior.events.at(-1);
    if (prior.recovery?.executionId !== priorExecution || prior.recovery.bridgeId !== target.candidate
      || prior.head !== rolesPredecessorHead || prior.next !== 'roles' || prior.journal !== target.journal
      || prior.events.length !== 4 || prior.events.some(event => event.phase !== 'roles')
      || canonical(prior.events.map(event => event.kind)) !== canonical(['intent', 'authorized', 'started', 'outcome'])
      || last?.kind !== 'outcome' || object(last.value).result !== (reachability ? 'failed' : 'unknown')
      || object(last.value).databaseOutcome !== (reachability ? 'rolled_back' : 'unknown')) refuse();
    if (reachability && canonical(last.value) !== canonical({ result: 'failed', databaseOutcome: 'rolled_back',
      count: 0, deploymentId: null, reportDigest: sha256(canonical({ phase: 'roles', error: 'unconfirmed' })) })) refuse();
    exactNames(priorDirectory, ['activation', 'operator.lock', `${packet.runId}.initial.json`]);
    exactNames(join(priorDirectory, 'activation'), [packet.runId]);
    exactNames(join(priorDirectory, 'activation', packet.runId),
      ['packet.json', 'lock.json', 'reservation.json', 'recovery-origin.json', '000.json', '001.json', '002.json', '003.json']);
    const priorFiles = inventory(priorDirectory).files.map(file => {
      const evidence = readEvidence(join(priorDirectory, file.path));
      if (evidence.identity.sha256 !== file.sha256) refuse();
      return { path: file.path, identity: evidence.identity };
    });
    rolesPredecessor = { executionId: priorExecution, directory: priorDirectory, head: prior.head,
      intentHash: prior.events[0]!.sha256, files: priorFiles, observation: 'read-only-absent',
      cause: reachability ? 'schema-usage-reachability' : 'missing-migration-assets',
      ...(reachability ? { correction: rolesReachability.correction } : {}) };
  }
  return { version: 1, kind: 'activation-recovery-origin', executionId, directory, packet, packetDigest: digest,
    journal: retained.journal, bridgeId: target.candidate, configDigest: target.configDigest,
    executableDigest, probeReceiptDigest: bridgeExternalStartupProof.receiptDigest,
    source: { directory: sourceDirectory, inventoryDigest: target.originalInventory, head: retained.head, events: retained.events.length, files },
    promotion: { directory: recoveryDirectory, intentDigest, files: promotionFiles },
    initialProof: initial.value, initialProofDigest: initial.identity.sha256, ...(rolesPredecessor ? { rolesPredecessor } : {}) };
}
export function readActivationRecoveryOrigin(directory: string, packet: ActivationPacket, digest: string,
  readOriginal: OriginalReader): ActivationRecoveryBinding {
  const evidence = readEvidence(join(directory, 'activation', packet.runId, 'recovery-origin.json'));
  const value = object(evidence.value), source = object(value.source), promotion = object(value.promotion);
  if (typeof source.directory !== 'string' || typeof promotion.directory !== 'string' || typeof value.executionId !== 'string') refuse();
  const prior = value.rolesPredecessor === undefined ? undefined : object(value.rolesPredecessor);
  if (prior && typeof prior.head !== 'string') refuse();
  const origin = buildActivationRecoveryOrigin(source.directory, promotion.directory, directory, packet, digest,
    value.executionId, readOriginal, prior?.head as string | undefined);
  if (canonical(value) !== canonical(origin)) refuse();
  const initial = readEvidence(join(directory, `${packet.runId}.initial.json`));
  if (initial.identity.sha256 !== origin.initialProofDigest || canonical(initial.value) !== canonical(origin.initialProof)) refuse();
  return { origin, originDigest: sha256(canonical(origin)), identity: evidence.identity };
}
