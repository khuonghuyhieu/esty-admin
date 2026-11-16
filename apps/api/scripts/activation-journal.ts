import { mkdirSync, readdirSync, openSync, closeSync, fsyncSync, unlinkSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { artifactTarget, canonical, inventory, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';
import { activationSchema, assertActivationManifest } from '../src/config/schema-transition.js';
import { migrationManifest } from '../src/generated/migrations.js';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };
import type { ActivationConfigurationReceipt } from './activation-configuration.js';
import { buildActivationRecoveryOrigin, readActivationRecoveryOrigin, rolesReachability } from './activation-recovery-origin.js';
import type { ActivationRecoveryBinding, ActivationRecoveryOrigin } from './activation-recovery-origin.js';
import type { HeldAppProbeProof, HeldAppTarget } from './activation-held-proof.js';
import { heldProbeSources, heldD2 } from './activation-held-contract.mjs';
import { heldCorrection, validateHeldCorrectionCapability } from './activation-held-correction-contract.mjs';
import type { HeldCorrectionCapability } from './activation-held-correction-contract.mjs';

export const activationPhases = ['bridge-config', 'bridge', 'roles', 'migration', 'bootstrap', 'app-config', 'app', 'fe'] as const;
export type ActivationPhase = typeof activationPhases[number];
export interface ActivationPacket {
  version: 1; runId: string; revision: string; tree: string; sourceDigest: string; artifactDigest: string;
  projectId: string; scopeId: string;
  contractDigest: string; oldDigest: string; targetDigest: string; target: string; predecessorId: string;
  bridgeConfigDigest: string; appConfigDigest: string; roleInputDigest: string; migrationInputDigest: string;
  bootstrapInputDigest: string; bootstrapBindingDigest: string; sourceReviewDigest: string; testReceiptDigest: string;
  retentionApprovalDigest: string; feRevision: string; feSourceDigest: string; feConfigDigest: string;
  migrations: typeof migrationManifest;
}
const hex = /^[a-f0-9]{64}$/, commit = /^[a-f0-9]{40}$/, deployment = /^dpl_[A-Za-z0-9]{1,124}$/;
const packetKeys = ['version', 'runId', 'revision', 'tree', 'sourceDigest', 'artifactDigest', 'contractDigest', 'oldDigest', 'targetDigest',
  'projectId', 'scopeId', 'target', 'predecessorId', 'bridgeConfigDigest', 'appConfigDigest', 'roleInputDigest', 'migrationInputDigest', 'bootstrapInputDigest',
  'bootstrapBindingDigest', 'sourceReviewDigest', 'testReceiptDigest', 'retentionApprovalDigest', 'feRevision', 'feSourceDigest', 'feConfigDigest', 'migrations'];
function refuse(): never { throw new Error('Activation evidence is incomplete, changed or unresolved.'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) refuse();
  return result;
}
function matches(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.test(value); }
export function validateActivationPacket(value: unknown, approvedDigest: string): ActivationPacket {
  assertActivationManifest();
  const packet = object(value, packetKeys);
  if (packet.version !== 1 || !matches(packet.runId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    || !['revision', 'tree', 'feRevision'].every(key => matches(packet[key], commit))
    || !packetKeys.filter(key => key.endsWith('Digest')).every(key => matches(packet[key], hex))
    || packet.projectId !== artifactTarget.project || packet.scopeId !== artifactTarget.owner
    || packet.contractDigest !== '41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad'
    || packet.oldDigest !== activationSchema.oldDigest || packet.targetDigest !== activationSchema.targetDigest
    || !['local', `supabase:${approvedTarget.SUPABASE_PROJECT_REF}`].includes(String(packet.target))
    || !matches(packet.predecessorId, deployment) || packet.bridgeConfigDigest === packet.appConfigDigest
    || canonical(packet.migrations) !== canonical(migrationManifest) || !hex.test(approvedDigest)
    || sha256(canonical(packet)) !== approvedDigest) refuse();
  return JSON.parse(canonical(packet)) as ActivationPacket;
}
export function verifyActivationArtifact(artifact: VerifiedArtifact, packet: ActivationPacket): void {
  const actual = verifyArtifact(artifact.root, packet.artifactDigest, { revision: packet.revision,
    repository: 'https://github.com/khuonghuyhieu/esty-admin', migrationDigest: packet.targetDigest, release: packet.target !== 'local' });
  if (actual.digest !== artifact.digest || actual.manifest.source.tree !== packet.tree
    || actual.manifest.source.digest !== packet.sourceDigest || canonical(actual.manifest.migrations) !== canonical(packet.migrations)
    || actual.manifest.source.files.find(file => file.path === 'specs/001-connectivity-foundation/contracts/openapi.json')?.sha256 !== packet.contractDigest) refuse();
}
export interface ActivationOutcome {
  result: 'confirmed' | 'failed' | 'unknown';
  databaseOutcome: 'not_started' | 'committed' | 'rolled_back' | 'unknown';
  reportDigest: string;
  count: number;
  deploymentId: string | null;
}
type Kind = 'intent' | 'authorized' | 'started' | 'acknowledged' | 'candidate-attested'
  | 'promotion-intent' | 'outcome' | 'reconciled' | 'confirming' | 'remote-confirmed' | 'configuration-attested';
interface Event {
  version: 1; packetDigest: string; previousHash: string; sequence: number;
  phase: ActivationPhase; kind: Kind; value: unknown; sha256: string;
}
export interface ActivationState {
  packet: ActivationPacket; packetDigest: string; head: string; journal: number;
  events: readonly Event[]; next: ActivationPhase | null;
  recovery?: { executionId: string; bridgeId: string; originDigest: string };
  heldCandidate?: { deploymentId: string; origin: string; proofDigest: string; configurationBasis: 'current-runtime-attestation' };
}
export interface HeldAppPendingReceipt {
  version: 1; kind: 'held-app-pending'; executionId: string; packetDigest: string; unknownHead: string;
  inventoryDigest: string; executableDigest: string; bootstrapProofDigest: string;
  metadataDigest: string; keyCount: number; createClaimDigest: string; createAckDigest: string;
  candidate: { id: string; origin: string }; archiveDigest: string;
}
type HeldAppCreateClaim = Omit<HeldAppPendingReceipt, 'kind' | 'candidate' | 'archiveDigest' | 'createClaimDigest' | 'createAckDigest'>
  & { kind: 'held-app-create' };
const heldCleanupPins = Object.freeze({
  executableDigest: 'c19eef1d41831341a207ea0657b44e4a5f0339812a0e8cad018d6637f0296a54',
  createClaimDigest: '068c33cbefd91af29fcb9685fe8ab868381559489945399c246a9c4e814caaa2',
  createAckDigest: '96e6c981fca2277e71cae90897f28c5e0fc8f2e2c33f47edb5b56e3a2b5a815e',
  createResultDigest: 'c43b98c50de7c9f7526f12fd83871a8eb43bb41fa5716a63a61667e3c62d2dce',
  correction: Object.freeze({
    started: 'e5a648959973cab58c07339435e2b5a0441cee1a3eb3e3057d9cbb68e91e9027',
    ack: '59e274b7aa63ff02eb9bedfb19ad6ebfc54652dd5d7ca52699bd3422d5fa0ae6',
    verified: '258be0c208e611d714fb631551ee798616da01c70bd4f0130ebe77f38b554c8f',
    result: '36ef6ec40264e2b06941769d53744563404a0892663ff7f024786ea0536b0112',
  }),
});
export function readHeldAppCleanup(directory: string, packet: ActivationPacket, digest: string, unknownHead: string) {
  const claimFile = readEvidence(heldEvidencePath(directory, packet, 'create-started'));
  const ackFile = readEvidence(heldEvidencePath(directory, packet, 'create-ack'));
  const resultFile = readEvidence(heldEvidencePath(directory, packet, 'create-result'));
  if (claimFile.identity.sha256 !== heldCleanupPins.createClaimDigest || ackFile.identity.sha256 !== heldCleanupPins.createAckDigest
    || resultFile.identity.sha256 !== heldCleanupPins.createResultDigest) refuse();
  const claim = object(claimFile.value, ['version', 'kind', 'executionId', 'packetDigest', 'unknownHead', 'inventoryDigest',
    'executableDigest', 'bootstrapProofDigest', 'metadataDigest', 'keyCount']);
  const ack = object(ackFile.value, ['version', 'kind', 'claimDigest', 'deploymentId', 'code', 'aborted']);
  if (claim.version !== 1 || claim.kind !== 'held-app-create' || claim.executionId !== rolesReachability.executionId
    || claim.packetDigest !== digest || claim.unknownHead !== unknownHead || claim.executableDigest !== heldCleanupPins.executableDigest
    || !matches(ack.deploymentId, deployment) || canonical(ack) !== canonical({ version: 1, kind: 'held-app-create-ack',
      claimDigest: heldCleanupPins.createClaimDigest, deploymentId: ack.deploymentId, code: 0, aborted: false })) refuse();
  const prefix = `${packet.runId}.app-missing-five-`, parent = dirname(directory);
  if (canonical(readdirSync(parent).filter(name => name.startsWith(prefix)).sort())
    !== canonical(Object.keys(heldCleanupPins.correction).map(suffix => `${prefix}${suffix}.json`).sort())) refuse();
  for (const [suffix, hash] of Object.entries(heldCleanupPins.correction)) {
    if (readEvidence(join(parent, `${prefix}${suffix}.json`)).identity.sha256 !== hash) refuse();
  }
  return { claim: claim as unknown as HeldAppCreateClaim, candidateId: ack.deploymentId,
    createClaimDigest: heldCleanupPins.createClaimDigest, createAckDigest: heldCleanupPins.createAckDigest,
    createResultDigest: heldCleanupPins.createResultDigest };
}
export interface AppCurrentConfigurationAttestationReceipt {
  version: 1; kind: 'app-current-configuration'; executionId: string; packetDigest: string; unknownHead: string;
  pendingDigest: string; importClaimDigest: string; probe: HeldAppProbeProof; historicalWrite: 'unknown'; historicalPostAck: 'absent';
  scope: 'held-deployment-runtime'; promotion: 'not_started';
}
export function heldEvidencePath(directory: string, packet: ActivationPacket, suffix: string): string {
  if (!['create-started', 'create-ack', 'pending', 'create-result', 'attest-started', 'attest-result',
    'import-started', 'current-proof', 'import-result'].includes(suffix)) refuse();
  return join(dirname(directory), `${packet.runId}.held-app-${suffix}.json`);
}
export function readHeldAppPending(directory: string, packet: ActivationPacket, digest: string, unknownHead: string):
  { pending: HeldAppPendingReceipt; target: HeldAppTarget; proofExecutableDigest: string; receiptSuffixes: readonly string[] } {
  const pendingFile = readEvidence(heldEvidencePath(directory, packet, 'pending'));
  const value = object(pendingFile.value, ['version', 'kind', 'executionId', 'packetDigest', 'unknownHead', 'inventoryDigest',
    'executableDigest', 'bootstrapProofDigest', 'metadataDigest', 'keyCount', 'createClaimDigest', 'createAckDigest', 'candidate', 'archiveDigest']);
  const candidate = object(value.candidate, ['id', 'origin']);
  if (value.version !== 1 || value.kind !== 'held-app-pending' || value.executionId !== rolesReachability.executionId
    || value.packetDigest !== digest || value.unknownHead !== unknownHead
    || !['unknownHead', 'inventoryDigest', 'executableDigest', 'bootstrapProofDigest', 'metadataDigest',
      'createClaimDigest', 'createAckDigest', 'archiveDigest'].every(key => matches(value[key], hex))
    || !Number.isInteger(value.keyCount) || Number(value.keyCount) < 1 || Number(value.keyCount) > 64
    || !matches(candidate.id, deployment) || !matches(candidate.origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/)) refuse();
  const retained = inventory(directory), appended = `activation/${packet.runId}/022.json`;
  const additions = new Set([appended]);
  const eventRoot = `activation/${packet.runId}/`;
  const later = retained.files.filter(file => file.path.startsWith(eventRoot)
    && /^[0-9]/.test(file.path.slice(eventRoot.length)) && file.path > appended);
  if (later.length) {
    const anchor = readEvidence(join(directory, appended)).value as Event;
    const { sha256: recorded, ...body } = anchor;
    if (recorded !== heldD2.head || eventHash(body) !== heldD2.head) refuse();
    const kinds = ['intent', 'authorized', 'started', 'acknowledged', 'candidate-attested',
      'promotion-intent', 'outcome', 'confirming', 'remote-confirmed'];
    let previous: string = heldD2.head, outcomeHash = '';
    for (const [index, file] of later.entries()) {
      const sequence = index + 23;
      if (file.path !== `${eventRoot}${String(sequence).padStart(3, '0')}.json` || !kinds[index]) refuse();
      const row = object(readEvidence(join(directory, file.path)).value,
        ['version', 'packetDigest', 'previousHash', 'sequence', 'phase', 'kind', 'value', 'sha256']);
      const { sha256: hash, ...event } = row;
      if (row.version !== 1 || row.packetDigest !== digest || row.previousHash !== previous || row.sequence !== sequence
        || row.phase !== 'app' || row.kind !== kinds[index] || hash !== eventHash(event as Omit<Event, 'sha256'>)) refuse();
      const expected = index === 0 || index === 2 ? { outcome: 'unknown' }
        : index === 1 ? { intentHash: previous }
          : index === 3 || index === 5 ? { deploymentId: heldD2.candidate }
            : index === 4 ? { deploymentId: heldD2.candidate, configDigest: heldD2.configDigest }
              : index >= 7 ? { outcomeHash } : null;
      if (expected && canonical(row.value) !== canonical(expected)) refuse();
      if (index === 6) {
        const result = phaseOutcome('app', row.value, heldD2.candidate, true);
        if (result.result !== 'confirmed') refuse();
        outcomeHash = hash as string;
      }
      previous = hash as string;
      additions.add(file.path);
    }
  }
  if (sha256(canonical({ files: retained.files.filter(file => !additions.has(file.path)), directories: retained.directories })) !== value.inventoryDigest) refuse();
  const claim = readEvidence(heldEvidencePath(directory, packet, 'create-started'));
  const acknowledgement = readEvidence(heldEvidencePath(directory, packet, 'create-ack'));
  const expectedClaim = { version: 1, kind: 'held-app-create', executionId: value.executionId, packetDigest: digest, unknownHead,
    inventoryDigest: value.inventoryDigest, executableDigest: value.executableDigest, bootstrapProofDigest: value.bootstrapProofDigest,
    metadataDigest: value.metadataDigest, keyCount: value.keyCount };
  if (claim.identity.sha256 !== value.createClaimDigest || canonical(claim.value) !== canonical(expectedClaim)
    || acknowledgement.identity.sha256 !== value.createAckDigest
    || canonical(acknowledgement.value) !== canonical({ version: 1, kind: 'held-app-create-ack',
      claimDigest: value.createClaimDigest, deploymentId: candidate.id, code: 0, aborted: false })) refuse();
  const receiptSuffixes = ['create-started', 'create-ack', 'pending', 'create-result'];
  let proofExecutableDigest = value.executableDigest as string;
  if (value.createClaimDigest === heldCleanupPins.createClaimDigest
    || canonical(readEvidence(heldEvidencePath(directory, packet, 'create-result')).value) !== canonical({
    version: 1, kind: 'held-app-create-result', claimDigest: value.createClaimDigest,
    pendingDigest: pendingFile.identity.sha256, status: 'HELD_PROBE_PENDING' })) {
    const lineage = readHeldAppCleanup(directory, packet, digest, unknownHead);
    const attestFile = readEvidence(heldEvidencePath(directory, packet, 'attest-started'));
    const attest = object(attestFile.value, ['version', 'kind', 'createClaimDigest', 'createAckDigest', 'createResultDigest',
      'createExecutableDigest', 'executableDigest']);
    if (!matches(attest.executableDigest, hex) || attest.executableDigest === lineage.claim.executableDigest
      || canonical(attest) !== canonical({ version: 1, kind: 'held-app-attest', createClaimDigest: lineage.createClaimDigest,
        createAckDigest: lineage.createAckDigest, createResultDigest: lineage.createResultDigest,
        createExecutableDigest: lineage.claim.executableDigest, executableDigest: attest.executableDigest })
      || canonical(readEvidence(heldEvidencePath(directory, packet, 'attest-result')).value) !== canonical({
        version: 1, kind: 'held-app-attest-result', attestClaimDigest: attestFile.identity.sha256,
        pendingDigest: pendingFile.identity.sha256, status: 'HELD_PROBE_PENDING' })) refuse();
    proofExecutableDigest = attest.executableDigest;
    receiptSuffixes.push('attest-started', 'attest-result');
  }
  const prefix = `${packet.runId}.held-app-`;
  const allowed = new Set([...receiptSuffixes, 'import-started', 'current-proof', 'import-result'].map(suffix => `${prefix}${suffix}.json`));
  if (readdirSync(dirname(directory)).some(name => name.startsWith(prefix) && !allowed.has(name))) refuse();
  return { pending: value as unknown as HeldAppPendingReceipt, proofExecutableDigest, receiptSuffixes, target: {
    executionId: rolesReachability.executionId, unknownHead, packetDigest: digest, artifactDigest: packet.artifactDigest,
    revision: packet.revision, tree: packet.tree, sourceDigest: packet.sourceDigest, project: packet.projectId, scope: packet.scopeId,
    candidate: candidate.id as string, origin: candidate.origin as string, configDigest: packet.appConfigDigest,
    createClaimDigest: value.createClaimDigest as string, createAckDigest: value.createAckDigest as string,
    heldReceiptDigest: pendingFile.identity.sha256,
  } };
}
function currentConfigurationProof(directory: string, packet: ActivationPacket, digest: string, unknownHead: string) {
  const { target, proofExecutableDigest } = readHeldAppPending(directory, packet, digest, unknownHead);
  const proofFile = readEvidence(heldEvidencePath(directory, packet, 'current-proof'));
  const value = object(proofFile.value, ['version', 'kind', 'executionId', 'packetDigest', 'unknownHead', 'pendingDigest',
    'importClaimDigest', 'probe', 'historicalWrite', 'historicalPostAck', 'scope', 'promotion']);
  const proof = object(value.probe, ['version', 'kind', 'binding', 'bindingDigest', 'workflowRun', 'artifactId', 'archiveDigest',
    'receiptDigest', 'sourceDigests', 'sourcePinDigest', 'checks']);
  const binding = object(proof.binding, [...Object.keys(target), 'workflowRevision']);
  if (value.version !== 1 || value.kind !== 'app-current-configuration' || value.executionId !== target.executionId
    || value.packetDigest !== digest || value.unknownHead !== unknownHead || value.pendingDigest !== target.heldReceiptDigest
    || value.historicalWrite !== 'unknown' || value.historicalPostAck !== 'absent' || value.scope !== 'held-deployment-runtime'
    || value.promotion !== 'not_started' || proof.version !== 1 || proof.kind !== 'github-held-app-live'
    || !Object.entries(target).every(([key, entry]) => binding[key] === entry) || !matches(binding.workflowRevision, commit)
    || proof.bindingDigest !== sha256(canonical(binding)) || !matches(proof.workflowRun, /^[1-9][0-9]{0,19}$/)
    || !Number.isSafeInteger(proof.artifactId) || Number(proof.artifactId) < 1
    || !['archiveDigest', 'receiptDigest', 'sourcePinDigest'].every(key => matches(proof[key], hex))
    || canonical(proof.checks) !== canonical({ live: 'passed', computedRuntimeDigest: 'passed', target: 'not-proved', authMembership: 'not-proved' })) refuse();
  const sources = object(proof.sourceDigests, heldProbeSources);
  if (Object.values(sources).some(item => !matches(item, hex))
    || proof.receiptDigest !== sha256(canonical({ version: 1, kind: 'held-app-live', bindingDigest: proof.bindingDigest,
      workflowRevision: binding.workflowRevision, workflowRun: proof.workflowRun, status: 200, configDigestMatch: true, bodyStatus: 'ok' }))) refuse();
  const claim = readEvidence(heldEvidencePath(directory, packet, 'import-started'));
  const claimValue = object(claim.value, ['version', 'kind', 'unknownHead', 'pendingDigest', 'workflowRun', 'executableDigest']);
  if (claim.identity.sha256 !== value.importClaimDigest || claimValue.executableDigest !== proofExecutableDigest
    || canonical(claimValue) !== canonical({ version: 1, kind: 'held-app-import', unknownHead,
      pendingDigest: target.heldReceiptDigest, workflowRun: proof.workflowRun, executableDigest: proofExecutableDigest })) refuse();
  return { receiptDigest: proofFile.identity.sha256, deploymentId: target.candidate, configDigest: packet.appConfigDigest, origin: target.origin };
}

// One admitted generation after the acknowledged DB-pair repair, not a retry counter.
export const heldPostRepair = Object.freeze({
  selector: 'held-post-db-repair-01',
  repairSelector: 'held-db-config-repair-01',
  repairExecutableDigest: '432f066814e4e193d89ea1a134adea51134155de0b65aab381ed22fa8a53048e',
  repairControllerRevision: 'bd9e2611a3b0338aa8b7d3678a31e8d6cbeefdd3',
  failedProbeRun: '43704277229',
  failedProbeRevision: '4c2c5a2a7834905d3942880acc3fbebbb0f2751d',
  receipts: Object.freeze({
    started: 'ed666841e8aabe0c96298c842a0225d8359f6c1e81e058eb6532c120ce3fac63',
    ack: '4f9a0611f2d95f1bc729f92b135c19899cef734e7c38ccd0f4e7871d6aa06478',
    verified: 'b4dcedfdb22bcc3057c7934261f82f0681edb5a0fc061c78aad5aa605a64d0cc',
    result: 'c9e76f2ea47d9a668707de349b20cfac9254891bccc01e146f71577b999640ff',
  }),
});
export function validateHeldDeploymentCapability(value: unknown): HeldCorrectionCapability {
  const data = object(value, ['selector', 'contextDigest', 'controllerPublication', 'sourceDigests']);
  if (data.selector !== heldPostRepair.selector) return validateHeldCorrectionCapability(value);
  const capability = validateHeldCorrectionCapability({ ...data, selector: heldCorrection.selector });
  if ([heldPostRepair.repairControllerRevision, heldPostRepair.failedProbeRevision,
    'f5d330c9784ec9d87df197ff780d30fde7073060'].includes(capability.controllerPublication.revision)) refuse();
  return { ...capability, selector: heldPostRepair.selector };
}

export const correctionReceiptSuffixes = ['create-started', 'create-ack', 'pending', 'create-result',
  'import-started', 'current-proof', 'import-result'] as const;
export function heldCorrectionEvidencePath(directory: string, packet: ActivationPacket, suffix: string,
  selector: string = heldCorrection.selector): string {
  if (!(correctionReceiptSuffixes as readonly string[]).includes(suffix)
    || (selector !== heldCorrection.selector && selector !== heldPostRepair.selector)) refuse();
  return join(dirname(directory), `${packet.runId}.${selector}-${suffix}.json`);
}
export function verifyHeldCorrectionFailedProbe(): void {
  // This is the fixed approved MAIN checkout, not the helper/worktree or a caller-supplied receipt.
  const approvedRoot = '/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin';
  const receipt = readEvidence(join(approvedRoot, '.openai/reports/d1-held-probe-2a08578/probe-safe-result.json'));
  if (receipt.identity.sha256 !== heldCorrection.failedProbeDigest) {
    throw new Error(`Retained public failed-probe SHA256 differs: expected ${heldCorrection.failedProbeDigest}, actual ${receipt.identity.sha256}.`);
  }
  if (canonical(receipt.value) !== canonical({
    runId: heldCorrection.failedProbeRun, conclusion: 'failure',
    safeResult: { version: 1, kind: 'held-app-live', bindingDigest: heldCorrection.failedBindingDigest,
      workflowRevision: heldCorrection.sourceRevision, workflowRun: heldCorrection.failedProbeRun,
      status: 500, configDigestMatch: false, bodyStatus: 'unavailable' },
    source: 'completed run log; no new endpoint request', additionalDispatches: 0,
  })) refuse();
}
export function readHeldCorrectionOriginal(directory: string, packet: ActivationPacket, digest: string, unknownHead: string) {
  verifyHeldCorrectionFailedProbe();
  for (const [suffix, hash] of Object.entries(heldCorrection.originalReceipts)) {
    if (readEvidence(heldEvidencePath(directory, packet, suffix)).identity.sha256 !== hash) refuse();
  }
  const original = readHeldAppPending(directory, packet, digest, unknownHead);
  if (original.proofExecutableDigest !== heldCorrection.previousExecutableDigest
    || original.pending.inventoryDigest !== heldCorrection.inventoryDigest
    || packet.appConfigDigest !== heldCorrection.ownerReset.APP_ACTIVATION_CONFIG_DIGEST
    || sha256(canonical({ ...original.target, workflowRevision: heldCorrection.sourceRevision })) !== heldCorrection.failedBindingDigest) refuse();
  return original;
}
export interface HeldCorrectionClaim {
  version: 1; kind: 'held-config-correction-create'; basis: typeof heldCorrection | typeof heldPostRepair;
  executionId: string; packetDigest: string; unknownHead: string; inventoryDigest: string; bootstrapProofDigest: string;
  artifactDigest: string; executableDigest: string; capability: HeldCorrectionCapability;
  metadataDigest: string; keyCount: number;
}
export interface HeldCorrectionPending {
  version: 1; kind: 'held-config-correction-pending'; claimDigest: string; ackDigest: string;
  candidate: { id: string; origin: string }; archiveDigest: string;
}
export function readHeldCorrectionPending(directory: string, packet: ActivationPacket, digest: string, unknownHead: string,
  selector: string = heldCorrection.selector) {
  const original = readHeldCorrectionOriginal(directory, packet, digest, unknownHead);
  const prior = selector === heldPostRepair.selector ? readHeldPostRepairBasis(directory, packet, digest, unknownHead) : undefined;
  const path = (suffix: string) => heldCorrectionEvidencePath(directory, packet, suffix, selector);
  const claimFile = readEvidence(path('create-started')), pendingFile = readEvidence(path('pending'));
  const claim = object(claimFile.value, ['version', 'kind', 'basis', 'executionId', 'packetDigest', 'unknownHead',
    'inventoryDigest', 'bootstrapProofDigest', 'artifactDigest', 'executableDigest', 'capability', 'metadataDigest', 'keyCount']);
  const capability = validateHeldDeploymentCapability(claim.capability);
  if (capability.selector !== selector || claim.version !== 1 || claim.kind !== 'held-config-correction-create'
    || canonical(claim.basis) !== canonical(prior ? heldPostRepair : heldCorrection)
    || claim.executionId !== original.target.executionId || claim.packetDigest !== digest || claim.unknownHead !== unknownHead
    || claim.inventoryDigest !== original.pending.inventoryDigest || claim.bootstrapProofDigest !== original.pending.bootstrapProofDigest
    || claim.artifactDigest !== packet.artifactDigest || !matches(claim.executableDigest, hex)
    || claim.executableDigest === original.proofExecutableDigest || claim.executableDigest === original.pending.executableDigest
    || !matches(claim.metadataDigest, hex) || !Number.isInteger(claim.keyCount) || Number(claim.keyCount) < 1 || Number(claim.keyCount) > 64) refuse();
  if (prior && (claim.executableDigest === prior.proofExecutableDigest || claim.executableDigest === heldPostRepair.repairExecutableDigest
    || claim.keyCount !== 17)) refuse();
  const value = object(pendingFile.value, ['version', 'kind', 'claimDigest', 'ackDigest', 'candidate', 'archiveDigest']);
  const candidate = object(value.candidate, ['id', 'origin']), ackFile = readEvidence(path('create-ack'));
  if (value.version !== 1 || value.kind !== 'held-config-correction-pending' || value.claimDigest !== claimFile.identity.sha256
    || value.ackDigest !== ackFile.identity.sha256 || !matches(value.archiveDigest, hex)
    || !matches(candidate.id, deployment) || candidate.id === original.target.candidate || candidate.id === packet.predecessorId
    || candidate.id === 'dpl_525LvEPCBud7nyAeFTcRx8iipTrk'
    || (prior && candidate.id === prior.target.candidate)
    || !matches(candidate.origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/)
    || canonical(ackFile.value) !== canonical({ version: 1, kind: 'held-config-correction-ack',
      claimDigest: claimFile.identity.sha256, deploymentId: candidate.id, code: 0, aborted: false })
    || canonical(readEvidence(path('create-result')).value) !== canonical({ version: 1, kind: 'held-config-correction-result',
      claimDigest: claimFile.identity.sha256, pendingDigest: pendingFile.identity.sha256, status: 'HELD_PROBE_PENDING' })) refuse();
  const prefix = `${packet.runId}.${selector}-`;
  const allowed = new Set(correctionReceiptSuffixes.map(suffix => `${prefix}${suffix}.json`));
  if (readdirSync(dirname(directory)).some(name => name.startsWith(prefix) && !allowed.has(name))) refuse();
  const target: HeldAppTarget = { ...original.target, candidate: candidate.id, origin: candidate.origin,
    createClaimDigest: claimFile.identity.sha256, createAckDigest: ackFile.identity.sha256, heldReceiptDigest: pendingFile.identity.sha256 };
  return { original, claim: claim as unknown as HeldCorrectionClaim, capability,
    pending: value as unknown as HeldCorrectionPending, target, proofExecutableDigest: claim.executableDigest as string };
}

export function readHeldPostRepairBasis(directory: string, packet: ActivationPacket, digest: string, unknownHead: string):
  { target: HeldAppTarget; proofExecutableDigest: string; claim: HeldCorrectionClaim } {
  const prior = readHeldCorrectionPending(directory, packet, digest, unknownHead);
  const prefix = `${packet.runId}.${heldPostRepair.repairSelector}-`;
  const files = Object.fromEntries(Object.entries(heldPostRepair.receipts).map(([suffix, hash]) => {
    const file = readEvidence(join(dirname(directory), `${prefix}${suffix}.json`));
    if (file.identity.sha256 !== hash) refuse();
    return [suffix, file];
  }));
  if (canonical(readdirSync(dirname(directory)).filter(name => name.startsWith(prefix)).sort())
    !== canonical(Object.keys(heldPostRepair.receipts).map(suffix => `${prefix}${suffix}.json`).sort())) refuse();
  const started = object(files.started!.value, ['version', 'kind', 'basis', 'executionId', 'packetDigest', 'unknownHead',
    'inventoryDigest', 'bootstrapProofDigest', 'pendingDigest', 'configDigest', 'executableDigest', 'capability',
    'metadataDigest', 'keyCount', 'historicalWrite', 'historicalPostAck']);
  const ack = object(files.ack!.value, ['version', 'kind', 'claimDigest', 'acknowledgement']);
  const verified = object(files.verified!.value, ['version', 'kind', 'claimDigest', 'ackDigest', 'metadataDigest', 'keyCount',
    'historicalWrite', 'historicalPostAck', 'valueProof']);
  const result = object(files.result!.value, ['version', 'kind', 'claimDigest', 'status', 'result']);
  if (started.packetDigest !== digest || started.unknownHead !== unknownHead || started.configDigest !== packet.appConfigDigest
    || started.pendingDigest !== prior.target.heldReceiptDigest || started.executionId !== prior.target.executionId
    || started.bootstrapProofDigest !== prior.claim.bootstrapProofDigest || started.inventoryDigest !== prior.claim.inventoryDigest
    || started.executableDigest !== heldPostRepair.repairExecutableDigest || started.keyCount !== 17
    || ack.claimDigest !== files.started!.identity.sha256 || verified.claimDigest !== ack.claimDigest
    || verified.ackDigest !== files.ack!.identity.sha256 || verified.metadataDigest !== started.metadataDigest
    || verified.keyCount !== 17 || result.claimDigest !== ack.claimDigest || result.status !== 'DATABASE_PAIR_REPAIRED') refuse();
  return prior;
}

function correctionConfigurationProof(directory: string, packet: ActivationPacket, digest: string, unknownHead: string,
  selector: string = heldCorrection.selector) {
  const { target, proofExecutableDigest, capability } = readHeldCorrectionPending(directory, packet, digest, unknownHead, selector);
  const path = (suffix: string) => heldCorrectionEvidencePath(directory, packet, suffix, selector);
  const proofFile = readEvidence(path('current-proof'));
  const value = object(proofFile.value, ['version', 'kind', 'executionId', 'packetDigest', 'unknownHead', 'pendingDigest',
    'importClaimDigest', 'probe', 'historicalWrite', 'historicalPostAck', 'scope', 'promotion']);
  const proof = object(value.probe, ['version', 'kind', 'binding', 'bindingDigest', 'workflowRun', 'artifactId', 'archiveDigest',
    'receiptDigest', 'sourceDigests', 'sourcePinDigest', 'checks']);
  const binding = object(proof.binding, [...Object.keys(target), 'workflowRevision']);
  if (value.version !== 1 || value.kind !== 'app-corrected-configuration' || value.executionId !== target.executionId
    || value.packetDigest !== digest || value.unknownHead !== unknownHead || value.pendingDigest !== target.heldReceiptDigest
    || value.historicalWrite !== 'unknown' || value.historicalPostAck !== 'absent' || value.scope !== 'held-deployment-runtime'
    || value.promotion !== 'not_started' || proof.version !== 1 || proof.kind !== 'github-held-app-live'
    || !Object.entries(target).every(([key, entry]) => binding[key] === entry) || !matches(binding.workflowRevision, commit)
    || binding.workflowRevision === capability.controllerPublication.revision || binding.workflowRevision === heldCorrection.sourceRevision
    || (selector === heldPostRepair.selector && (binding.workflowRevision === heldPostRepair.failedProbeRevision
      || binding.workflowRevision === heldPostRepair.repairControllerRevision))
    || proof.bindingDigest !== sha256(canonical(binding)) || !matches(proof.workflowRun, /^[1-9][0-9]{0,19}$/)
    || proof.workflowRun === heldCorrection.failedProbeRun || !Number.isSafeInteger(proof.artifactId) || Number(proof.artifactId) < 1
    || (selector === heldPostRepair.selector && proof.workflowRun === heldPostRepair.failedProbeRun)
    || !['archiveDigest', 'receiptDigest', 'sourcePinDigest'].every(key => matches(proof[key], hex))
    || canonical(proof.sourceDigests) !== canonical(capability.sourceDigests)
    || canonical(proof.checks) !== canonical({ live: 'passed', computedRuntimeDigest: 'passed', target: 'not-proved', authMembership: 'not-proved' })
    || proof.receiptDigest !== sha256(canonical({ version: 1, kind: 'held-app-live', bindingDigest: proof.bindingDigest,
      workflowRevision: binding.workflowRevision, workflowRun: proof.workflowRun, status: 200, configDigestMatch: true, bodyStatus: 'ok' }))) refuse();
  const claimFile = readEvidence(path('import-started'));
  if (claimFile.identity.sha256 !== value.importClaimDigest || canonical(claimFile.value) !== canonical({
    version: 1, kind: 'held-config-correction-import', unknownHead, pendingDigest: target.heldReceiptDigest,
    workflowRun: proof.workflowRun, executableDigest: proofExecutableDigest })) refuse();
  return { receiptDigest: proofFile.identity.sha256, deploymentId: target.candidate, configDigest: packet.appConfigDigest,
    origin: target.origin, correction: selector };
}
function selectedConfigurationProof(directory: string, packet: ActivationPacket, digest: string, unknownHead: string, value: unknown) {
  // The historical reader remains the default; only a fixed typed marker selects the new lineage.
  if (value && typeof value === 'object' && 'correction' in value) {
    if (value.correction !== heldCorrection.selector && value.correction !== heldPostRepair.selector) refuse();
    return correctionConfigurationProof(directory, packet, digest, unknownHead, value.correction);
  }
  return currentConfigurationProof(directory, packet, digest, unknownHead);
}
function outcome(value: unknown): ActivationOutcome {
  const data = object(value, ['result', 'databaseOutcome', 'reportDigest', 'count', 'deploymentId']);
  if (!['confirmed', 'failed', 'unknown'].includes(String(data.result))
    || !['not_started', 'committed', 'rolled_back', 'unknown'].includes(String(data.databaseOutcome))
    || !matches(data.reportDigest, hex) || !Number.isSafeInteger(data.count) || Number(data.count) < 0 || Number(data.count) > 64
    || (data.deploymentId !== null && !matches(data.deploymentId, deployment))) refuse();
  return data as unknown as ActivationOutcome;
}
function phaseOutcome(phase: ActivationPhase, value: unknown, id: string | null, promotion: boolean): ActivationOutcome {
  const data = outcome(value);
  if (data.deploymentId !== id) refuse();
  if (data.result === 'confirmed') {
    if (['bridge', 'app'].includes(phase) && (!id || !promotion || data.databaseOutcome !== 'not_started' || data.count !== 1)) refuse();
    if (['roles', 'migration', 'bootstrap'].includes(phase) && data.databaseOutcome !== 'committed') refuse();
    if (phase === 'roles' && ![0, 2].includes(data.count)) refuse();
    if (phase === 'migration' && data.count !== 2) refuse();
    if (phase === 'bootstrap' && ![0, 1].includes(data.count)) refuse();
    if (['bridge-config', 'app-config', 'fe'].includes(phase) && data.databaseOutcome !== 'not_started') refuse();
  }
  return data;
}
function candidateAttestation(packet: ActivationPacket, phase: ActivationPhase, id: string): object {
  if (phase !== 'bridge' && phase !== 'app') refuse();
  return { deploymentId: id, configDigest: phase === 'bridge' ? packet.bridgeConfigDigest : packet.appConfigDigest };
}
function configurationPath(directory: string, packet: ActivationPacket, phase: ActivationPhase): string {
  return join(directory, `${packet.runId}.${phase}.configuration.json`);
}
function configurationReceipt(value: unknown, packet: ActivationPacket, digest: string, phase: ActivationPhase,
  startedHash: string): { count: number; reportDigest: string } {
  if (phase !== 'bridge-config' && phase !== 'app-config') refuse();
  const envelope = object(value, ['startedHash', 'receipt']);
  const receipt = object(envelope.receipt, ['version', 'runId', 'phase', 'projectId', 'scopeId', 'packetDigest', 'revision', 'tree',
    'sourceDigest', 'artifactDigest', 'configDigest', 'metadataDigest', 'count', 'valueProof']);
  if (envelope.startedHash !== startedHash || receipt.version !== 2 || receipt.phase !== phase
    || receipt.packetDigest !== digest || receipt.valueProof !== 'pending-candidate-runtime'
    || !['runId', 'projectId', 'scopeId', 'revision', 'tree', 'sourceDigest', 'artifactDigest']
      .every(key => receipt[key] === packet[key as keyof ActivationPacket])
    || receipt.configDigest !== (phase === 'bridge-config' ? packet.bridgeConfigDigest : packet.appConfigDigest)
    || !matches(receipt.metadataDigest, hex) || !Number.isSafeInteger(receipt.count)
    || Number(receipt.count) < 1 || Number(receipt.count) > 64) refuse();
  return { count: Number(receipt.count), reportDigest: sha256(canonical(envelope)) };
}
export function saveActivationConfigurationReceipt(directory: string, packet: ActivationPacket, digest: string,
  phase: ActivationPhase, receipt: ActivationConfigurationReceipt): ActivationOutcome {
  const current = readActivationJournal(directory, packet, digest), started = current.events.at(-1);
  if (current.next !== phase || started?.phase !== phase || started.kind !== 'started') refuse();
  const envelope = { startedHash: started.sha256, receipt };
  const proof = configurationReceipt(envelope, packet, digest, phase, started.sha256);
  writeReleaseEvidence(configurationPath(directory, packet, phase), envelope);
  return { result: 'confirmed', databaseOutcome: 'not_started', deploymentId: null, ...proof };
}
function syncDirectory(directory: string): void {
  const fd = openSync(directory, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
}
function eventHash(data: Omit<Event, 'sha256'>): string { return sha256(canonical(data)); }
function runPath(directory: string, packet: ActivationPacket): string { return join(directory, 'activation', packet.runId); }
export function createActivationJournal(directory: string, packet: ActivationPacket, digest: string): void {
  validateActivationPacket(packet, digest);
  privateDirectory(directory);
  privateDirectory(join(directory, 'activation'));
  const run = runPath(directory, packet);
  mkdirSync(run, { mode: 0o700 }); syncDirectory(join(directory, 'activation'));
  writeReleaseEvidence(join(run, 'packet.json'), packet);
  // Same lock path as current-schema-only release: an unknown outcome never unlocks itself.
  writeReleaseEvidence(join(directory, 'operator.lock'), { version: 1, kind: 'activation', runId: packet.runId, packetDigest: digest });
  const identity = readEvidence(join(directory, 'operator.lock')).identity;
  writeReleaseEvidence(join(run, 'lock.json'), { packetDigest: digest, identity });
}
function recoveredLock(origin: ActivationRecoveryOrigin, originDigest: string) {
  return { version: 1, kind: 'activation-recovery', runId: origin.packet.runId, packetDigest: origin.packetDigest,
    executionId: origin.executionId, originDigest, journal: origin.journal };
}
function readOriginalJournal(directory: string, packet: ActivationPacket, digest: string): ActivationState {
  return readJournal(directory, packet, digest, true);
}
export function createRecoveredActivationJournal(sourceDirectory: string, recoveryDirectory: string, directory: string,
  packet: ActivationPacket, digest: string, executionId: string, rolesPredecessorHead?: string): void {
  validateActivationPacket(packet, digest);
  directory = resolve(directory);
  privateDirectory(dirname(directory), false);
  const origin = buildActivationRecoveryOrigin(sourceDirectory, recoveryDirectory, directory, packet, digest,
    executionId, readOriginalJournal, rolesPredecessorHead);
  const originDigest = sha256(canonical(origin));
  // A separate exclusive root fences every partial initialization. The original lock and history stay untouched.
  mkdirSync(directory, { mode: 0o700 }); syncDirectory(dirname(directory));
  privateDirectory(join(directory, 'activation'));
  const run = runPath(directory, packet);
  mkdirSync(run, { mode: 0o700 }); syncDirectory(join(directory, 'activation'));
  writeReleaseEvidence(join(run, 'packet.json'), packet);
  writeReleaseEvidence(join(run, 'recovery-origin.json'), origin);
  writeReleaseEvidence(join(directory, `${packet.runId}.initial.json`), origin.initialProof);
  writeReleaseEvidence(join(directory, 'operator.lock'), recoveredLock(origin, originDigest));
  const identity = readEvidence(join(directory, 'operator.lock')).identity;
  const recoveryOriginIdentity = readEvidence(join(run, 'recovery-origin.json')).identity;
  writeReleaseEvidence(join(run, 'lock.json'), { packetDigest: digest, identity, recoveryOriginIdentity });
  reserveActivationJournal(directory, packet, digest, origin.journal);
  readActivationJournal(directory, packet, digest);
}
export function reserveActivationJournal(directory: string, packet: ActivationPacket, digest: string, journal: number): void {
  if (!Number.isSafeInteger(journal) || journal <= 0) refuse();
  const recovery = checkLock(directory, packet, digest);
  if (recovery && journal !== recovery.origin.journal) refuse();
  writeReleaseEvidence(join(runPath(directory, packet), 'reservation.json'), { packetDigest: digest, journal });
}
function checkLock(directory: string, packet: ActivationPacket, digest: string, transferred = false): ActivationRecoveryBinding | undefined {
  validateActivationPacket(packet, digest);
  const run = runPath(directory, packet);
  if (canonical(readEvidence(join(run, 'packet.json')).value) !== canonical(packet)) refuse();
  const actual = readEvidence(join(directory, 'operator.lock'));
  const recovery = (actual.value as { kind?: unknown } | null)?.kind === 'activation-recovery'
    ? readActivationRecoveryOrigin(directory, packet, digest, readOriginalJournal) : undefined;
  const expected = recovery ? recoveredLock(recovery.origin, recovery.originDigest)
    : { version: 1, kind: 'activation', runId: packet.runId, packetDigest: digest };
  if (canonical(actual.value) !== canonical(expected)) refuse();
  const retained = object(readEvidence(join(run, 'lock.json')).value,
    recovery ? ['packetDigest', 'identity', 'recoveryOriginIdentity'] : ['packetDigest', 'identity']);
  if (recovery && canonical(retained.recoveryOriginIdentity) !== canonical(recovery.identity)) refuse();
  if (retained.packetDigest !== digest) refuse();
  if (transferred) {
    const original = object(retained.identity, ['dev', 'ino', 'size', 'mtime_ns', 'ctime_ns', 'sha256']);
    if (original.sha256 !== actual.identity.sha256 || original.size !== actual.identity.size) refuse();
  } else if (canonical(retained.identity) !== canonical(actual.identity)) refuse();
  return recovery;
}
export function readActivationJournal(directory: string, packet: ActivationPacket, digest: string): ActivationState {
  return readJournal(directory, packet, digest, false);
}
function readJournal(directory: string, packet: ActivationPacket, digest: string, transferred: boolean): ActivationState {
  const recovery = checkLock(directory, packet, digest, transferred);
  const run = runPath(directory, packet);
  const reservation = object(readEvidence(join(run, 'reservation.json')).value, ['packetDigest', 'journal']);
  if (reservation.packetDigest !== digest || !Number.isSafeInteger(reservation.journal) || Number(reservation.journal) <= 0) refuse();
  if (recovery && reservation.journal !== recovery.origin.journal) refuse();
  const names = readdirSync(run).filter(name => !['packet.json', 'lock.json', 'reservation.json',
    ...(recovery ? ['recovery-origin.json'] : [])].includes(name)).sort();
  const events: Event[] = [];
  let head = recovery?.originDigest ?? digest, phaseIndex = recovery ? activationPhases.indexOf('roles') : 0;
  let intent = false, authorized = false, started = false, id: string | null = null;
  let attested = false, promotion = false, completed: ActivationOutcome | null = null, reconciled = false;
  let confirmation: string | null = null;
  let heldCandidate: ActivationState['heldCandidate'];
  let startedHash = '';
  const acknowledged = new Set<string>(recovery ? [recovery.origin.bridgeId] : []);
  for (const [index, name] of names.entries()) {
    if (name !== `${String(index).padStart(3, '0')}.json`) refuse();
    if (heldCandidate && (events[22]?.sha256 !== heldD2.head || heldCandidate.deploymentId !== heldD2.candidate
      || heldCandidate.proofDigest !== heldD2.proofDigest || activationPhases[phaseIndex] !== 'app')) refuse();
    const row = object(readEvidence(join(run, name)).value, ['version', 'packetDigest', 'previousHash', 'sequence', 'phase', 'kind', 'value', 'sha256']);
    const { sha256: recorded, ...body } = row;
    if (row.version !== 1 || row.packetDigest !== digest || row.previousHash !== head || row.sequence !== index
      || row.phase !== activationPhases[phaseIndex] || recorded !== eventHash(body as Omit<Event, 'sha256'>)) refuse();
    switch (row.kind) {
      case 'intent':
        if (intent || canonical(row.value) !== canonical({ outcome: 'unknown' })) refuse();
        intent = true; break;
      case 'authorized':
        if (!intent || authorized || canonical(row.value) !== canonical({ intentHash: head })) refuse();
        authorized = true; break;
      case 'started':
        if (!authorized || started || canonical(row.value) !== canonical({ outcome: 'unknown' })) refuse();
        started = true; startedHash = recorded as string; break;
      case 'acknowledged': {
        const value = object(row.value, ['deploymentId']);
        if (!started || completed || id || !['bridge', 'app'].includes(String(row.phase))
          || !matches(value.deploymentId, deployment) || acknowledged.has(value.deploymentId)) refuse();
        if (heldCandidate && value.deploymentId !== heldD2.candidate) refuse();
        id = value.deploymentId; acknowledged.add(id); break;
      }
      case 'candidate-attested':
        if (!id || attested || completed || canonical(row.value) !== canonical(candidateAttestation(packet, row.phase as ActivationPhase, id))) refuse();
        attested = true; break;
      case 'promotion-intent':
        if (!id || !attested || promotion || completed || canonical(row.value) !== canonical({ deploymentId: id })) refuse();
        promotion = true; break;
      case 'outcome':
        if (!started || completed) refuse();
        completed = phaseOutcome(row.phase as ActivationPhase, row.value, id, promotion);
        if (completed.result === 'confirmed' && ['bridge-config', 'app-config'].includes(String(row.phase))) {
          const proof = configurationReceipt(readEvidence(configurationPath(directory, packet, row.phase as ActivationPhase)).value,
            packet, digest, row.phase as ActivationPhase, startedHash);
          if (completed.reportDigest !== proof.reportDigest || completed.count !== proof.count) refuse();
        }
        break;
      case 'reconciled':
        if (!started || reconciled || completed?.result === 'confirmed' || ['bridge-config', 'app-config'].includes(String(row.phase))) refuse();
        completed = phaseOutcome(row.phase as ActivationPhase, row.value, id, promotion);
        if (completed.result !== 'confirmed') refuse();
        reconciled = true; break;
      case 'confirming':
        if (!completed || completed.result !== 'confirmed' || confirmation
          || canonical(row.value) !== canonical({ outcomeHash: head })) refuse();
        confirmation = head; break;
      case 'remote-confirmed':
        if (!completed || completed.result !== 'confirmed' || !confirmation
          || canonical(row.value) !== canonical({ outcomeHash: confirmation })) refuse();
        phaseIndex++; intent = false; authorized = false; started = false; id = null;
        attested = false; promotion = false; completed = null; reconciled = false; confirmation = null; break;
      case 'configuration-attested': {
        if (index !== 22 || recovery?.origin.executionId !== rolesReachability.executionId || row.phase !== 'app-config'
          || events.at(-1)?.kind !== 'outcome' || canonical(completed) !== canonical({
            result: 'unknown', databaseOutcome: 'not_started', count: 0, deploymentId: null,
            reportDigest: sha256(canonical({ phase: 'app-config', error: 'unconfirmed' })) })
          || lstatSync(configurationPath(directory, packet, 'app-config'), { throwIfNoEntry: false })) refuse();
        const proof = selectedConfigurationProof(directory, packet, digest, head, row.value);
        if (proof.deploymentId === recovery.origin.bridgeId || canonical(row.value) !== canonical({
          receiptDigest: proof.receiptDigest, deploymentId: proof.deploymentId, configDigest: proof.configDigest,
          ...('correction' in proof ? { correction: proof.correction } : {}) })) refuse();
        heldCandidate = { deploymentId: proof.deploymentId, origin: proof.origin, proofDigest: proof.receiptDigest,
          configurationBasis: 'current-runtime-attestation' };
        phaseIndex++; intent = false; authorized = false; started = false; completed = null; confirmation = null; break;
      }
      default: refuse();
    }
    head = recorded as string; events.push(row as unknown as Event);
  }
  return { packet, packetDigest: digest, head, journal: Number(reservation.journal), events, next: activationPhases[phaseIndex] ?? null,
    ...(heldCandidate ? { heldCandidate } : {}),
    ...(recovery ? { recovery: { executionId: recovery.origin.executionId, bridgeId: recovery.origin.bridgeId, originDigest: recovery.originDigest } } : {}) };
}
export function appendActivationEvent(directory: string, packet: ActivationPacket, digest: string,
  phase: ActivationPhase, kind: Kind, value: unknown): ActivationState {
  const state = readActivationJournal(directory, packet, digest);
  // Only the exact D1-held app chain may continue. All older held states remain fenced.
  if (state.next !== phase || (state.heldCandidate && (phase !== 'app' || state.events[22]?.sha256 !== heldD2.head
    || state.heldCandidate.deploymentId !== heldD2.candidate || state.heldCandidate.proofDigest !== heldD2.proofDigest))) refuse();
  const last = state.events.at(-1), active = last?.phase === phase ? last : undefined;
  if (kind === 'configuration-attested') {
    if (phase !== 'app-config' || state.events.length !== 22 || state.recovery?.executionId !== rolesReachability.executionId
      || active?.kind !== 'outcome' || canonical(active.value) !== canonical({
        result: 'unknown', databaseOutcome: 'not_started', count: 0, deploymentId: null,
        reportDigest: sha256(canonical({ phase: 'app-config', error: 'unconfirmed' })) })
      || lstatSync(configurationPath(directory, packet, 'app-config'), { throwIfNoEntry: false })) refuse();
    const proof = selectedConfigurationProof(directory, packet, digest, state.head, value);
    if (proof.deploymentId === state.recovery.bridgeId || canonical(value) !== canonical({
      receiptDigest: proof.receiptDigest, deploymentId: proof.deploymentId, configDigest: proof.configDigest,
      ...('correction' in proof ? { correction: proof.correction } : {}) })) refuse();
  } else if (kind === 'intent') {
    if (active || canonical(value) !== canonical({ outcome: 'unknown' })) refuse();
  } else if (kind === 'authorized') {
    if (active?.kind !== 'intent' || canonical(value) !== canonical({ intentHash: state.head })) refuse();
  } else if (kind === 'started') {
    if (active?.kind !== 'authorized' || canonical(value) !== canonical({ outcome: 'unknown' })) refuse();
  } else if (kind === 'acknowledged' || kind === 'promotion-intent') {
    const data = object(value, ['deploymentId']);
    if (!['bridge', 'app'].includes(phase) || !matches(data.deploymentId, deployment)
      || active?.kind !== (kind === 'acknowledged' ? 'started' : 'candidate-attested')) refuse();
    if (state.heldCandidate && data.deploymentId !== heldD2.candidate) refuse();
    if (kind === 'promotion-intent' && object(active.value, ['deploymentId', 'configDigest']).deploymentId !== data.deploymentId) refuse();
    if (kind === 'acknowledged' && (state.recovery?.bridgeId === data.deploymentId || state.events.some(event => event.kind === 'acknowledged'
      && object(event.value, ['deploymentId']).deploymentId === data.deploymentId))) refuse();
  } else if (kind === 'candidate-attested') {
    if (active?.kind !== 'acknowledged') refuse();
    const id = object(active.value, ['deploymentId']).deploymentId;
    if (!matches(id, deployment) || canonical(value) !== canonical(candidateAttestation(packet, phase, id))) refuse();
  } else if (kind === 'outcome' || kind === 'reconciled') {
    if (!active) refuse();
    const events = state.events.filter(event => event.phase === phase);
    const acknowledgement = events.find(event => event.kind === 'acknowledged');
    const id = acknowledgement ? object(acknowledgement.value, ['deploymentId']).deploymentId as string : null;
    if (kind === 'outcome' && !['started', 'acknowledged', 'candidate-attested', 'promotion-intent'].includes(active.kind)) refuse();
    if (kind === 'reconciled' && (['bridge-config', 'app-config'].includes(phase)
      || !['started', 'acknowledged', 'candidate-attested', 'promotion-intent', 'outcome'].includes(active.kind)
      || !events.some(event => event.kind === 'started') || events.some(event => event.kind === 'reconciled')
      || (active.kind === 'outcome' && outcome(active.value).result === 'confirmed'))) refuse();
    const data = phaseOutcome(phase, value, id, events.some(event => event.kind === 'promotion-intent'));
    if (data.result === 'confirmed' && ['bridge-config', 'app-config'].includes(phase)) {
      const started = events.find(event => event.kind === 'started'); if (!started) refuse();
      const proof = configurationReceipt(readEvidence(configurationPath(directory, packet, phase)).value, packet, digest, phase, started.sha256);
      if (data.reportDigest !== proof.reportDigest || data.count !== proof.count) refuse();
    }
    if (kind === 'reconciled' && data.result !== 'confirmed') refuse();
  } else if (kind === 'confirming') {
    if (!active || !['outcome', 'reconciled'].includes(active.kind) || outcome(active.value).result !== 'confirmed'
      || canonical(value) !== canonical({ outcomeHash: state.head })) refuse();
  } else if (kind === 'remote-confirmed') {
    if (active?.kind !== 'confirming' || canonical(value) !== canonical(active.value)) refuse();
  } else refuse();
  const body: Omit<Event, 'sha256'> = { version: 1, packetDigest: digest, previousHash: state.head,
    sequence: state.events.length, phase, kind, value };
  // A failed/partial durable append is retained and fences all following work.
  writeReleaseEvidence(join(runPath(directory, packet), `${String(state.events.length).padStart(3, '0')}.json`), { ...body, sha256: eventHash(body) });
  return readActivationJournal(directory, packet, digest);
}
export function finishActivationJournal(directory: string, packet: ActivationPacket, digest: string): void {
  const state = readActivationJournal(directory, packet, digest);
  if (state.next !== null) refuse();
  const path = join(directory, `${packet.runId}.activation-complete.json`);
  const completion = { version: 1, packetDigest: digest, head: state.head, journal: state.journal, result: 'confirmed' };
  if (lstatSync(path, { throwIfNoEntry: false })) {
    if (canonical(readEvidence(path).value) !== canonical(completion)) refuse();
  } else writeReleaseEvidence(path, completion);
  checkLock(directory, packet, digest);
  unlinkSync(join(directory, 'operator.lock')); syncDirectory(directory);
}

export async function importFrontendJournal(source: string, directory: string, packet: ActivationPacket, digest: string,
  approvedInventory: string, confirm: (state: ActivationState, outcomeHash: string) => Promise<void>): Promise<void> {
  if (!hex.test(approvedInventory) || sha256(canonical(inventory(source))) !== approvedInventory) refuse();
  const retained = readJournal(source, packet, digest, true);
  const last = retained.events.at(-1);
  if (retained.next !== 'fe' || last?.phase !== 'app' || last.kind !== 'remote-confirmed') refuse();
  const hash = object(last.value, ['outcomeHash']).outcomeHash;
  if (!matches(hash, hex)) refuse();
  const initial = readEvidence(join(source, `${packet.runId}.initial.json`)).value;
  const postflight = readEvidence(join(source, `${packet.runId}.postflight.json`)).value;
  await confirm(retained, hash);
  // Recheck the approved snapshot after the remote read; preserve its original files.
  if (sha256(canonical(inventory(source))) !== approvedInventory) refuse();
  createActivationJournal(directory, packet, digest);
  reserveActivationJournal(directory, packet, digest, retained.journal);
  writeReleaseEvidence(join(directory, `${packet.runId}.initial.json`), initial);
  writeReleaseEvidence(join(directory, `${packet.runId}.postflight.json`), postflight);
  for (const phase of ['bridge-config', 'app-config'] as const) {
    writeReleaseEvidence(configurationPath(directory, packet, phase), readEvidence(configurationPath(source, packet, phase)).value);
  }
  for (const event of retained.events) appendActivationEvent(directory, packet, digest, event.phase, event.kind, event.value);
  if (readActivationJournal(directory, packet, digest).head !== retained.head) refuse();
}
