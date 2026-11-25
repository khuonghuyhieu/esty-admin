import fs from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir, userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { artifactTarget, canonical, inventory, removeArtifactTree, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { acknowledgedId, prebuiltCreateArguments, stagePrebuiltOutput } from './ci-delivery.js';
import type { ReleaseDiagnostics, ReleaseRequest } from './ci-delivery.js';
import { deploymentId, inspectCandidate, repository, uploadedCandidatePartition, verifyCandidateArchive } from './ci-provider.js';
import { command, isolatedEnvironment, responseBytes } from './ci-tools.js';
import type { CommandResult } from './ci-tools.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';
import { normalizeManualArchive } from './activation-archive-transport.mjs';
import { migrationInputs } from './activation-inputs.js';
import { parseMigrationConfig } from '../src/config/config.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { manifestDigest, migrationStatus, runMigrations } from './migrations.js';
import type { MigrationReport } from './migrations.js';
import { checkHostedHttp } from './hosted-acceptance.js';
import { readHiddenPassword } from './hidden-input.mjs';
import { prepareEtsyConfiguration, setupObject } from './etsy-setup.js';
import { bounded } from './bounded.js';
import { activationRuntimeKeys, etsyRuntimeKeys } from '../src/config/activation-config.js';
import { stoppedEtsyContinuation, validateHeldContinuationReceiptArchive, validateStoppedContinuationReceiptArchive } from './activation-preflight-disposition.mjs';
import { validateReleaseResult } from './ci-delivery.js';
import { currentAppMetadata } from './activation-configuration.js';

export const etsyReleasePhases = ['history', 'held-create', 'pre-sql-check', 'sql-apply', 'post-sql-check', 'promote-only', 'final-domain-ack'] as const;
export type EtsyReleasePhase = typeof etsyReleasePhases[number];
export interface EtsyReleasePacket {
  version: 1; runId: string; ledgerRoot: string; revision: string; tree: string; sourceDigest: string;
  artifactDigest: string; runtimeDigest: string; configBundleDigest: string; migrationInputDigest: string;
  previousDigest: string; targetDigest: string; target: string; driverDigest: string; nodeDigest: string;
  cliDigest: string; cliOwnFilesDigest: string; browserOrigin: string; runtimeKeys: string[]; metadataDigest: string;
  predecessor: { id: string; revision: string; tree: string; sourceDigest: string; artifactDigest: string; configDigest: string };
  window: { start: number; end: number };
  grants: { exclusiveOwnerLease: string; automatedDelivery: 'disabled'; maintenance: 'approved-readiness-interruption';
    recovery: 'approved-roll-forward-only'; phases: EtsyReleasePhase[] };
}

export const heldEtsyIncident = Object.freeze({
  run: '45106877912', job: 137470929512, journal: 7989854763, producer: '45101806838', artifactId: 14786046264,
  receiptArtifact: 14788062302, packetRun: '17900717-24bf-4b64-8c1d-8e6a456412d6',
  packetDigest: 'd8228ac9fceb5a18a2b473ca62269466686cb7880c297981dde096cb0ffab1ee',
  requestDigest: '107dcc5270f43024442b79db59bb70e323ddb85dbb2d65db1475c9269b756528',
  receiptZipDigest: '47fbb0ecc25d77764f11b187d60f7b954b473e15552660886745bbc6f4c1cf64',
  ackDigest: 'c1f7eb6d78bc4cc0f09b339a23ff9fdef4cb852684334f3ecd6763b136fa0f9c',
  outcomeHead: '3bd44dcc31ae315e9eb365ba419779e70efc7a1ff4888a301fa935abd1d40972',
  revision: 'b12a8fb31b2fa017ac87d191aa5cc2652a5691d3', tree: 'a4175ef8e71afe7a1d45f4b8af54f693be05244c',
  artifactDigest: '06afb0ae722be3afead286181137fddb1c769f9de6416fe8c71ef8ce4b4c08f1',
  sourceDigest: '9423a4a1c7d6810807c1afdaef5cd25e2ae4c55dfec796e78732019e5cca8e02',
  archiveDigest: 'def60b022306a4057c32c8dc22188362123b1ca066db5255bfa0cc4724a8e7a4',
});
export const etsyReplacement = Object.freeze({
  id: 'dpl_8X6ZgDHqFy1F4QjMXhJ4cKJyaRjw', tag: 'etsy-keyring-verification-c507332-45547549808',
  revision: 'c50733256ce58f7adc58599cfd9c0a054bf9262e', tree: '608ee1a33153d8425556ece1cf4042e407b5f36b',
  producer: '45547549808', artifactId: 14992526096,
  zipDigest: 'eb236155e1f1e370924df5ea6af51f66cb2782f8be22a677a10d8d966b519b79',
  archiveDigest: '59b8e11f70c5d0f405f6d3d296b2a11b900228a8a29ef5e55052f8bde7f3711d',
  artifactDigest: 'cc026615246f807ddd88838fcd3d6781ee83a06758b8e23d355402b6bd70b6f8',
  sourceDigest: 'a14fc0cadbe5df1ec1a06d002d14a465112558d8c531ef47c0c4bd06e16fdf18',
  operatorDigest: 'e589691ac319df64b2ca6ba47b6c909d4a92e6a7f6cacc31ec3a53854562c1d3',
  uploadedArchiveDigest: '15f4669257897f2338625f29c6a7a9052b3ba12f16213b6be64d47b350aa4d64',
});
export interface EtsyContinuationApproval {
  version: 1; kind: 'held-etsy-continuation' | 'replacement-etsy-continuation'; incident: typeof heldEtsyIncident;
  priorContinuation?: typeof stoppedEtsyContinuation; replacement?: typeof etsyReplacement;
  runId: string; lease: string; window: { start: number; end: number }; originalPacket: EtsyReleasePacket;
  operator: { revision: string; tree: string; producerRun: string; artifactId: string; artifactDigest: string;
    sourceDigest: string; archiveDigest: string; operatorDigest: string; workflowDigest: string;
    driverDigest: string; nodeDigest: string; cliDigest: string; cliOwnFilesDigest: string };
}
function heldRequire(condition: unknown, check: string): asserts condition {
  if (!condition) throw new Error(`Held continuation refused: ${check}.`);
}
export function validateEtsyContinuationApproval(value: unknown, digest: string, now = Date.now()): EtsyContinuationApproval {
  const replacement = setupObject(value).kind === 'replacement-etsy-continuation';
  const data = exactObject(value, ['version', 'kind', 'incident', 'runId', 'lease', 'window', 'originalPacket', 'operator',
    ...(replacement ? ['priorContinuation', 'replacement'] : [])]);
  heldRequire(hex.test(digest) && sha256(canonical(data)) === digest && data.version === 1
    && data.kind === (replacement ? 'replacement-etsy-continuation' : 'held-etsy-continuation')
    && equal(data.incident, heldEtsyIncident), 'typed-incident-approval');
  if (replacement) heldRequire(equal(data.priorContinuation, stoppedEtsyContinuation)
    && equal(data.replacement, etsyReplacement) && data.runId !== stoppedEtsyContinuation.runId, 'exact-replacement-approval');
  heldRequire(typeof data.runId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.runId)
    && data.runId !== heldEtsyIncident.packetRun && typeof data.lease === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(data.lease), 'fresh-owner-lease');
  const window = exactObject(data.window, ['start', 'end']);
  heldRequire(Number.isSafeInteger(window.start) && Number.isSafeInteger(window.end) && Number(window.start) <= now
    && Number(window.end) > now && Number(window.end) - Number(window.start) <= 86400000
    && Number(window.start) > (replacement ? Date.parse('2026-11-25T03:31:01Z') : 1795412007767), 'fresh-execution-window');
  // Historical validation does not grant present execution authority.
  const packet = validateEtsyReleasePacket(data.originalPacket, heldEtsyIncident.packetDigest, 1795405255467);
  heldRequire(packet.runId === heldEtsyIncident.packetRun && packet.revision === heldEtsyIncident.revision
    && packet.tree === heldEtsyIncident.tree && packet.artifactDigest === heldEtsyIncident.artifactDigest
    && packet.sourceDigest === heldEtsyIncident.sourceDigest && packet.target !== 'local', 'original-application');
  const operator = exactObject(data.operator, ['revision', 'tree', 'producerRun', 'artifactId', 'artifactDigest',
    'sourceDigest', 'archiveDigest', 'operatorDigest', 'workflowDigest', 'driverDigest', 'nodeDigest', 'cliDigest', 'cliOwnFilesDigest']);
  heldRequire(revision.test(String(operator.revision)) && revision.test(String(operator.tree))
    && operator.revision !== packet.revision && /^[1-9][0-9]{0,14}$/.test(String(operator.producerRun))
    && /^[1-9][0-9]{0,14}$/.test(String(operator.artifactId))
    && ['artifactDigest', 'sourceDigest', 'archiveDigest', 'operatorDigest', 'workflowDigest', 'driverDigest',
      'nodeDigest', 'cliDigest', 'cliOwnFilesDigest'].every(key => typeof operator[key] === 'string' && hex.test(operator[key] as string)),
  'independent-current-operator');
  if (replacement) heldRequire(operator.revision !== etsyReplacement.revision
    && String(operator.artifactId) !== String(etsyReplacement.artifactId)
    && operator.artifactDigest !== etsyReplacement.artifactDigest, 'independent-replacement-operator');
  return JSON.parse(canonical(data)) as EtsyContinuationApproval;
}

// Derive execution identity without altering either immutable original packet or
// artifact. All non-source controls remain bound to the independently approved incident.
export function continuationApplication(approval: EtsyContinuationApproval): EtsyReleasePacket {
  const original = approval.originalPacket;
  return approval.kind === 'replacement-etsy-continuation'
    ? { ...original, revision: etsyReplacement.revision, tree: etsyReplacement.tree,
      artifactDigest: etsyReplacement.artifactDigest, sourceDigest: etsyReplacement.sourceDigest }
    : original;
}
export function continuationCandidate(approval: EtsyContinuationApproval): string {
  return approval.kind === 'replacement-etsy-continuation' ? etsyReplacement.id : 'dpl_9gJ1zDbbbbPtac2FUqHrNReyLck4';
}
export function continuationClaimKey(approval: EtsyContinuationApproval): string {
  return sha256(canonical({ incident: heldEtsyIncident.run, journal: heldEtsyIncident.journal, ackDigest: heldEtsyIncident.ackDigest,
    ...(approval.kind === 'replacement-etsy-continuation' ? { stopped: stoppedEtsyContinuation, replacement: etsyReplacement } : {}) }));
}

export function verifyHeldEtsyReceipts(zip: Buffer, packet: EtsyReleasePacket, diagnostics?: ReleaseDiagnostics) {
  const archive = validateHeldContinuationReceiptArchive(zip, diagnostics?.trace);
  const bytes = (name: string): Buffer => {
    const member = archive.files.get(name);
    heldRequire(member !== undefined, 'required-original-member');
    return member.bytes;
  };
  const json = (name: string) => setupObject(JSON.parse(bytes(name).toString('utf8')));
  const strict = `strict/${heldEtsyIncident.packetRun}`, packetDigest = heldEtsyIncident.packetDigest;
  const original = validateEtsyReleasePacket(packet, packetDigest, 1795405255467);
  const ack = exactObject(json(`${strict}/create-ack.json`), ['packetDigest', 'deploymentId']);
  heldRequire(ack.packetDigest === packetDigest && deploymentId.test(String(ack.deploymentId)), 'original-create-ack');
  const id = String(ack.deploymentId), requestDigest = heldEtsyIncident.requestDigest;
  let previous: string | null = null, request: NonNullable<ReturnType<typeof validateReleaseResult>['request']> | undefined;
  const stages = ['reserve', 'history', 'create', 'create', 'pre-sql', 'pre-sql'];
  const creates = ['not-started', 'not-started', 'unknown', 'ACKed', 'ACKed', 'ACKed'];
  let authorizedHead: string | null = null;
  for (const [index, name] of (archive.outcomes as string[]).entries()) {
    const event = exactObject(json(name), ['requestDigest', 'previous', 'result', 'terminal']);
    heldRequire(event.requestDigest === requestDigest && event.previous === previous && event.terminal === (index >= 4), 'original-outcome-chain');
    const result = validateReleaseResult(event.result);
    heldRequire(result.request !== null, 'original-request-present');
    request ??= result.request;
    heldRequire(sha256(canonical(result.request)) === requestDigest && equal(result.request, request)
      && result.stage === stages[index] && result.status === (index >= 4 ? 'failed' : 'unknown')
      && result.category === (index >= 4 ? 'validation' : 'outcome-unknown') && result.evidence === 'confirmed'
      && result.nextAction === (index >= 4 ? 'inspect-known-deployment' : 'inspect-retained-evidence')
      && result.proof === null && result.migration === null
      && equal(result.effects, { create: creates[index], migration: 'not-started', promotion: 'not-started' })
      && result.deploymentId === (index >= 3 ? id : null)
      && result.receiptDigest === (index === 5 ? authorizedHead : previous), 'original-effects');
    if (index === 4) authorizedHead = previous;
    previous = sha256(bytes(name));
  }
  heldRequire(previous === heldEtsyIncident.outcomeHead && request !== undefined
    && request.controller.run === heldEtsyIncident.run && request.producer.run === heldEtsyIncident.producer
    && request.artifactDigest === original.artifactDigest && request.sourceDigest === original.sourceDigest
    && request.configDigest === original.runtimeDigest && request.migration?.packetDigest === packetDigest, 'original-request');
  const reservation = { version: 1, requestDigest, packetDigest, journal: heldEtsyIncident.journal };
  heldRequire(equal(json('strict/reserving.json'), { requestDigest, packetDigest })
    && equal(json('strict/reservation.json'), reservation)
    && equal(json('strict/operator.lock'), { packetDigest, runId: original.runId, lease: original.grants.exclusiveOwnerLease })
    && equal(json('strict/active.lock'), { packetDigest, runId: original.runId, phase: 'pre-sql-check' })
    && equal(json(`${strict}/STOP.json`), { packetDigest, phase: 'pre-sql-check', outcome: 'unknown-or-refused' }), 'original-retained-fences');
  let prior: string | null = null, priorId: string | null = null, historyCompleted = 0;
  for (const phase of ['history', 'held-create'] as const) {
    const intent = { packetDigest, phase, previous: prior, deploymentId: priorId };
    heldRequire(equal(json(`${strict}/${phase}.intent.json`), intent), 'original-phase-intent');
    const receipt = exactObject(json(`${strict}/${phase}.receipt.json`),
      ['packetDigest', 'phase', 'previous', 'deploymentId', 'completed', 'reportDigest']);
    heldRequire(equal(receipt, { ...intent, deploymentId: phase === 'history' ? null : id, completed: receipt.completed, reportDigest: null })
      && Number.isSafeInteger(receipt.completed) && Number(receipt.completed) >= Math.max(original.window.start, historyCompleted)
      && Number(receipt.completed) < original.window.end, 'original-phase-receipt');
    if (phase === 'history') {
      historyCompleted = Number(receipt.completed);
      const auth = json('strict/history.authorized.json');
      heldRequire(equal(auth, { ...reservation, phase, intent,
        description: `strict:history:intent:${sha256(canonical({ requestDigest, intent }))}`, confirmedAt: auth.confirmedAt })
        && Number.isSafeInteger(auth.confirmedAt) && Number(auth.confirmedAt) >= original.window.start
        && Number(auth.confirmedAt) <= historyCompleted && historyCompleted - Number(auth.confirmedAt) <= 60000,
      'original-history-authorization');
    }
    prior = sha256(bytes(`${strict}/${phase}.receipt.json`));
    heldRequire(equal(json(`strict/${phase}.remote.json`), { requestDigest, journal: heldEtsyIncident.journal,
      receiptDigest: prior, description: `strict:${phase}:receipt:${sha256(canonical({ requestDigest, receipt: prior }))}` }), 'original-remote-commitment');
    if (phase === 'held-create') priorId = id;
  }
  heldRequire(equal(json(`${strict}/pre-sql-check.intent.json`),
    { packetDigest, phase: 'pre-sql-check', previous: prior, deploymentId: id }), 'original-pre-sql-stop');
  const ackDigest = sha256(bytes(`${strict}/create-ack.json`));
  return { id, request, ackDigest, heldReceiptDigest: prior!, outcomeHead: previous!,
    key: sha256(canonical({ incident: heldEtsyIncident.run, journal: heldEtsyIncident.journal, ackDigest })),
    archiveDigest: archive.archiveDigest, inventoryDigest: archive.inventoryDigest };
}

export function verifyStoppedEtsyContinuation(zip: Buffer, diagnostics?: ReleaseDiagnostics) {
  const archive = validateStoppedContinuationReceiptArchive(zip, diagnostics?.trace), pin = stoppedEtsyContinuation;
  const bytes = (name: string): Buffer => {
    const member = archive.files.get(name);
    heldRequire(member !== undefined, 'required-stopped-member');
    return member.bytes;
  };
  const json = (name: string) => setupObject(JSON.parse(bytes(name).toString('utf8')));
  const stages = ['artifact', 'reserve', 'history', 'pre-sql', 'pre-sql'];
  let previous: string | null = null, terminalPrior: string | null = null, request: ReleaseRequest | undefined;
  for (const [index, name] of archive.outcomes.entries()) {
    const event = exactObject(json(name), ['requestDigest', 'previous', 'result', 'terminal']);
    heldRequire(event.requestDigest === pin.requestDigest && event.previous === previous
      && event.terminal === (index >= 3), 'stopped-outcome-chain');
    const result = validateReleaseResult(event.result);
    heldRequire(result.request !== null, 'stopped-request-present');
    request ??= result.request;
    heldRequire(sha256(canonical(result.request)) === pin.requestDigest && equal(result.request, request)
      && result.stage === stages[index] && result.status === (index >= 3 ? 'refused' : 'unknown')
      && result.category === (index >= 3 ? 'configuration-mismatch' : 'outcome-unknown')
      && result.evidence === 'confirmed' && result.migration === null && result.proof === null
      && result.deploymentId === 'dpl_9gJ1zDbbbbPtac2FUqHrNReyLck4'
      && equal(result.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' })
      && result.nextAction === (index >= 3 ? 'inspect-known-deployment' : 'inspect-retained-evidence')
      && result.receiptDigest === (index === 4 ? terminalPrior : previous), 'stopped-confirmed-no-writes');
    if (index === 3) terminalPrior = previous;
    previous = sha256(bytes(name));
  }
  heldRequire(request?.continuation?.kind === 'held-etsy-continuation' && previous === pin.outcomeHead
    && request.controller.run === pin.run && request.migration?.packetDigest === pin.approvalDigest, 'stopped-request-binding');
  const approval = validateEtsyContinuationApproval(request.continuation, pin.approvalDigest, request.continuation.window.start);
  const saved = exactObject(json('continuation/origin.json'), ['zip', 'origin', 'execution']);
  heldRequire(typeof saved.zip === 'string' && saved.zip.length < 10000, 'stopped-origin-zip');
  const originalZip = Buffer.from(saved.zip, 'base64');
  heldRequire(originalZip.toString('base64') === saved.zip, 'stopped-origin-encoding');
  const origin = verifyHeldEtsyReceipts(originalZip, approval.originalPacket, diagnostics);
  heldRequire(equal(origin, saved.origin), 'stopped-original-proof');
  const claim = exactObject(json('continuation/claim.json'),
    ['version', 'key', 'requestDigest', 'packetDigest', 'journal', 'execution', 'originDigest']);
  const reservation = { version: 1, requestDigest: pin.requestDigest, packetDigest: pin.approvalDigest, journal: pin.journal };
  heldRequire(equal(claim, { version: 1, key: origin.key, requestDigest: pin.requestDigest,
    packetDigest: pin.approvalDigest, journal: pin.journal, execution: saved.execution,
    originDigest: sha256(bytes('continuation/origin.json')) }), 'stopped-linked-claim');
  const execution = setupObject(saved.execution);
  heldRequire(execution.run === pin.run && execution.job === pin.job && execution.revision === request.controller.revision
    && execution.tree === request.controller.tree && execution.workflowDigest === approval.operator.workflowDigest
    && execution.environment === 'be-production' && execution.concurrency === 'esty-admin-be-production'
    && execution.cancelInProgress === false, 'stopped-execution');
  const base = `continuation/${pin.runId}`, claimDigest = sha256(bytes('continuation/claim.json'));
  const intent = { packetDigest: pin.approvalDigest, phase: 'history', previous: claimDigest, deploymentId: origin.id };
  const receipt = json(`${base}/history.receipt.json`), completed = receipt.completed;
  heldRequire(equal(receipt, { ...intent, completed, reportDigest: null })
    && Number.isSafeInteger(completed) && Number(completed) >= approval.window.start
    && Number(completed) < approval.window.end, 'stopped-history-receipt');
  const historyDigest = sha256(bytes(`${base}/history.receipt.json`));
  const intentDescription = `strict:history:intent:${sha256(canonical({ requestDigest: pin.requestDigest, intent }))}`;
  const receiptDescription = `strict:history:receipt:${sha256(canonical({ requestDigest: pin.requestDigest, receipt: historyDigest }))}`;
  const authorization = json('continuation/history.authorized.json');
  heldRequire(equal(authorization, { ...reservation, phase: 'history', intent,
    description: intentDescription, confirmedAt: authorization.confirmedAt })
    && Number.isSafeInteger(authorization.confirmedAt) && Number(authorization.confirmedAt) >= approval.window.start
    && Number(authorization.confirmedAt) <= Number(completed)
    && Number(completed) - Number(authorization.confirmedAt) <= 60000, 'stopped-history-authorization');
  const preSql = { packetDigest: pin.approvalDigest, phase: 'pre-sql-check', previous: historyDigest, deploymentId: origin.id };
  heldRequire(equal(json('continuation/reserving.json'), { requestDigest: pin.requestDigest, packetDigest: pin.approvalDigest })
    && equal(json('continuation/reservation.json'), reservation)
    && equal(json(`${base}/history.intent.json`), intent)
    && equal(json('continuation/history.remote.json'), { requestDigest: pin.requestDigest, journal: pin.journal,
      receiptDigest: historyDigest, description: receiptDescription })
    && equal(json(`${base}/pre-sql-check.intent.json`), preSql)
    && equal(json('continuation/operator.lock'), { packetDigest: pin.approvalDigest, runId: pin.runId, lease: approval.lease })
    && equal(json('continuation/active.lock'), { packetDigest: pin.approvalDigest, runId: pin.runId, phase: 'pre-sql-check' })
    && equal(json(`${base}/STOP.json`), { packetDigest: pin.approvalDigest, phase: 'pre-sql-check', outcome: 'unknown-or-refused' }),
  'stopped-retained-fences');
  return { request, origin, execution, outcomeHead: previous, archiveDigest: archive.archiveDigest, inventoryDigest: archive.inventoryDigest,
    descriptions: [`strict:reserved:${pin.requestDigest}`, intentDescription, receiptDescription,
      `strict:pre-sql-check:intent:${sha256(canonical({ requestDigest: pin.requestDigest, intent: preSql }))}`, 'strict:unresolved'] };
}
export class EtsyReleaseStop extends Error {
  constructor() { super('ETSY_SETUP_STOP: durable intent or outcome requires owner disposition; do not retry mutations.'); }
}
function stop(): never { throw new EtsyReleaseStop(); }
const hex = /^[a-f0-9]{64}$/, revision = /^[a-f0-9]{40}$/;
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  const record = setupObject(value);
  if (!equal(Object.keys(record).sort(), [...keys].sort())) stop();
  return record;
}
export function validateEtsyReleasePacket(value: unknown, digest: string, now = Date.now()): EtsyReleasePacket {
  try {
    const data = exactObject(value, ['version', 'runId', 'ledgerRoot', 'revision', 'tree', 'sourceDigest', 'artifactDigest',
      'runtimeDigest', 'configBundleDigest', 'migrationInputDigest', 'previousDigest', 'targetDigest', 'target', 'driverDigest',
      'nodeDigest', 'cliDigest', 'cliOwnFilesDigest', 'browserOrigin', 'runtimeKeys', 'metadataDigest', 'predecessor', 'window', 'grants']);
    if (!hex.test(digest) || sha256(canonical(data)) !== digest || data.version !== 1
      || typeof data.runId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.runId)
      || typeof data.ledgerRoot !== 'string' || resolve(data.ledgerRoot) !== data.ledgerRoot || /[\x00-\x1f\x7f]/.test(data.ledgerRoot)
      || data.browserOrigin !== 'https://app.lovora.us' || !revision.test(String(data.revision)) || !revision.test(String(data.tree))
      || !['sourceDigest', 'artifactDigest', 'runtimeDigest', 'configBundleDigest', 'migrationInputDigest', 'driverDigest', 'nodeDigest', 'cliDigest', 'cliOwnFilesDigest', 'metadataDigest'].every(key => typeof data[key] === 'string' && hex.test(data[key] as string))
      || !/^(?:local|supabase:[a-z]{20})$/.test(String(data.target))
      || migrationManifest.length !== 4 || data.previousDigest !== manifestDigest(migrationManifest.slice(0, 3))
      || data.targetDigest !== manifestDigest(migrationManifest)) stop();
    if (!Array.isArray(data.runtimeKeys) || !equal(data.runtimeKeys, [...new Set(data.runtimeKeys)].sort())
      || data.runtimeKeys.some(key => typeof key !== 'string' || ![...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].includes(key))
      || ![...etsyRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].every(key => (data.runtimeKeys as unknown[]).includes(key))) stop();
    const predecessor = exactObject(data.predecessor, ['id', 'revision', 'tree', 'sourceDigest', 'artifactDigest', 'configDigest']);
    if (!deploymentId.test(String(predecessor.id)) || !revision.test(String(predecessor.revision)) || !revision.test(String(predecessor.tree))
      || !['sourceDigest', 'artifactDigest', 'configDigest'].every(key => hex.test(String(predecessor[key])))) stop();
    const window = exactObject(data.window, ['start', 'end']);
    if (!Number.isSafeInteger(window.start) || !Number.isSafeInteger(window.end) || Number(window.start) > now
      || Number(window.end) <= now || Number(window.end) - Number(window.start) > 86400000) stop();
    const grants = exactObject(data.grants, ['exclusiveOwnerLease', 'automatedDelivery', 'maintenance', 'recovery', 'phases']);
    if (typeof grants.exclusiveOwnerLease !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(grants.exclusiveOwnerLease)
      || grants.automatedDelivery !== 'disabled' || grants.maintenance !== 'approved-readiness-interruption'
      || grants.recovery !== 'approved-roll-forward-only' || !equal(grants.phases, etsyReleasePhases)) stop();
    return JSON.parse(canonical(data)) as EtsyReleasePacket;
  } catch { return stop(); }
}
export interface EtsyReleaseOperations {
  verify(): void;
  currentMain(): Promise<{ revision: string; tree: string }>;
  history(): Promise<string[]>;
  predecessor(pending: boolean): Promise<void>;
  create(): Promise<CommandResult>;
  candidate(id: string, pending: boolean, final: boolean): Promise<void>;
  migrate(): Promise<MigrationReport>;
  promote(id: string): Promise<CommandResult>;
  alias(id: string): Promise<void>;
}
function syncDirectory(path: string): void {
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
interface Receipt { packetDigest: string; phase: EtsyReleasePhase; previous: string | null;
  deploymentId: string | null; completed: number; reportDigest: string | null }
export interface EtsyReleaseIntent {
  packetDigest: string; phase: EtsyReleasePhase; previous: string | null; deploymentId: string | null;
}
export interface EtsyReleaseDurability {
  directory: string;
  intent(phase: EtsyReleasePhase, value: EtsyReleaseIntent): Promise<void>;
  acknowledged(id: string): Promise<void>;
  confirmed(phase: EtsyReleasePhase, value: Receipt): Promise<void>;
}
export const heldContinuationPhases: readonly EtsyReleasePhase[] = etsyReleasePhases.filter(phase => phase !== 'held-create');
export interface HeldContinuationPhase {
  approval: EtsyContinuationApproval; origin: ReturnType<typeof verifyHeldEtsyReceipts>; claimDigest: string;
  stoppedReceipt?: Buffer;
}
export async function runEtsyReleasePhase(input: {
  packet: EtsyReleasePacket; packetDigest: string; phase: EtsyReleasePhase; signal: AbortSignal;
  operations: Omit<EtsyReleaseOperations, 'create'> & { create?: EtsyReleaseOperations['create'] };
  durability?: EtsyReleaseDurability; diagnostics?: ReleaseDiagnostics; continuation?: HeldContinuationPhase;
}): Promise<void> {
  const { packetDigest, phase, signal, diagnostics } = input;
  const trace = diagnostics?.trace;
  const op = diagnostics ? { ...diagnostics.operations('strict-operation', { ...input.operations, verify: undefined }),
    verify: input.operations.verify } : input.operations;
  const predicate = (name: string, condition: boolean) => {
    trace?.check(`strict.${name}`, condition, 'condition-mismatch');
    if (!condition) stop();
  };
  const continuation = input.continuation;
  const authority = () => {
    if (!continuation) return validateEtsyReleasePacket(input.packet, packetDigest);
    const approval = validateEtsyContinuationApproval(continuation.approval, packetDigest);
    const application = continuationApplication(approval);
    heldRequire(equal(input.packet, application) && continuation.origin.ackDigest === heldEtsyIncident.ackDigest
      && continuation.origin.outcomeHead === heldEtsyIncident.outcomeHead && hex.test(continuation.claimDigest)
      && input.durability !== undefined && input.operations.create === undefined, 'continuation-phase-authority');
    if (approval.kind === 'replacement-etsy-continuation') {
      heldRequire(continuation.stoppedReceipt !== undefined
        && equal(verifyStoppedEtsyContinuation(continuation.stoppedReceipt, diagnostics).origin, continuation.origin), 'stopped-phase-proof');
    } else heldRequire(continuation.stoppedReceipt === undefined, 'original-phase-without-replacement');
    return application;
  };
  const packet = trace ? trace.sync('strict.packet', authority) : authority();
  const phases = continuation ? heldContinuationPhases : etsyReleasePhases, index = phases.indexOf(phase);
  predicate('phase-allowed', index >= 0);
  const identity = continuation?.approval.operator ?? packet;
  const window = continuation?.approval.window ?? packet.window;
  const runId = continuation?.approval.runId ?? packet.runId;
  const lease = continuation?.approval.lease ?? packet.grants.exclusiveOwnerLease;
  const stage = ({ history: 'history', 'held-create': 'create', 'pre-sql-check': 'pre-sql', 'sql-apply': 'sql',
    'post-sql-check': 'candidate', 'promote-only': 'promote', 'final-domain-ack': 'domain' } as const)[phase];
  diagnostics?.at(stage, 'evidence-persistence');
  const persist = (path: string, value: unknown) => diagnostics
    ? diagnostics.observe(() => writeReleaseEvidence(path, value)) : writeReleaseEvidence(path, value);
  const root = privateDirectory(input.durability?.directory ?? packet.ledgerRoot, false), run = join(root, runId);
  const lock = join(root, 'active.lock');
  // An exclusive fsynced lock survives process loss. Never automatically steal it.
  try { persist(lock, { packetDigest, runId, phase }); } catch (cause) { if (diagnostics) throw diagnostics.capture(cause); stop(); }
  let success = false;
  try {
    signal.throwIfAborted(); op.verify();
    const ownerPath = join(root, 'operator.lock');
    if (!fs.existsSync(ownerPath)) persist(ownerPath, { packetDigest, runId, lease });
    predicate('operator-lock-binding', equal(readEvidence(ownerPath).value, { packetDigest, runId, lease }));
    if (!fs.existsSync(run)) { fs.mkdirSync(run, { mode: 0o700 }); syncDirectory(root); }
    privateDirectory(run, false);
    predicate('no-retained-stop', !fs.existsSync(join(run, 'STOP.json')));
    let previous: string | null = continuation?.claimDigest ?? null;
    let id: string | null = continuation ? continuationCandidate(continuation.approval) : null;
    let reportDigest: string | null = null;
    // Validate every durable predecessor, not merely a caller-selected last receipt.
    for (const earlier of phases.slice(0, index)) {
      const entry = readEvidence(join(run, `${earlier}.receipt.json`));
      const value = exactObject(entry.value, ['packetDigest', 'phase', 'previous', 'deploymentId', 'completed', 'reportDigest']) as unknown as Receipt;
      predicate('prior-receipt-chain', value.packetDigest === packetDigest && value.phase === earlier && value.previous === previous
        && Number.isSafeInteger(value.completed) && value.completed >= window.start && value.completed <= Date.now()
        && (id === null || value.deploymentId === id));
      predicate('prior-intent-binding', equal(readEvidence(join(run, `${earlier}.intent.json`)).value,
        { packetDigest, phase: earlier, previous, deploymentId: id }));
      if (earlier === 'sql-apply') reportDigest = readEvidence(join(run, 'migration-report.json')).identity.sha256;
      predicate('prior-report-digest', value.reportDigest === reportDigest);
      if (earlier === 'held-create') {
        const ack = exactObject(readEvidence(join(run, 'create-ack.json')).value, ['packetDigest', 'deploymentId']);
        predicate('create-ack-binding', ack.packetDigest === packetDigest && deploymentId.test(String(ack.deploymentId)) && value.deploymentId === ack.deploymentId);
        id = String(ack.deploymentId);
      }
      previous = entry.identity.sha256;
    }
    // O_EXCL intent is the cross-process one-shot barrier for every phase.
    const intent: EtsyReleaseIntent = { packetDigest, phase, previous, deploymentId: id };
    persist(join(run, `${phase}.intent.json`), intent);
    await input.durability?.intent(phase, intent);
    signal.throwIfAborted();
    diagnostics?.at(stage, 'validation');
    const main = async () => {
      signal.throwIfAborted(); authority(); op.verify();
      const observed = await bounded(op.currentMain(), signal);
      predicate('current-main-binding', observed.revision === identity.revision && observed.tree === identity.tree);
    };
    const before = migrationManifest.slice(0, 3).map(entry => entry.name), after = migrationManifest.map(entry => entry.name);
    if (phase === 'history') {
      // SQL-only read credentials; no provider token is needed for this phase.
      await main();
      const observed = await bounded(op.history(), signal);
      diagnostics?.at(stage, 'history-mismatch');
      predicate('initial-history', equal(observed, before));
    } else if (phase === 'sql-apply') {
      // The fresh prior provider check is bound to this packet; SQL process never receives provider credentials.
      await main();
      const prior = readEvidence(join(run, 'pre-sql-check.receipt.json')).value as Receipt;
      predicate('pre-sql-freshness', Date.now() - prior.completed <= 60000);
      predicate('pre-sql-history', equal(await bounded(op.history(), signal), before));
      diagnostics?.at('sql', 'outcome-unknown'); diagnostics?.submitted('migration');
      const report = await bounded(op.migrate(), signal);
      diagnostics?.migrated(report); diagnostics?.at('sql');
      persist(join(run, 'migration-report.json'), report);
      reportDigest = readEvidence(join(run, 'migration-report.json')).identity.sha256;
      predicate('sql-confirmed-commit', report.result === 'success' && report.database_outcome === 'committed' && report.reporting !== 'failed');
      predicate('sql-report-binding', report.source_revision === packet.revision && report.target === packet.target && report.manifest_digest === packet.targetDigest);
      predicate('sql-exact-transition', equal(report.before, before) && equal(report.after, after)
        && equal(report.attempted, [{ ...migrationManifest[3], outcome: 'applied_committed' }]));
      predicate('sql-postflight-history', equal(await bounded(op.history(), signal), after));
    } else {
      await main();
      if (phase === 'held-create') {
        const history = readEvidence(join(run, 'history.receipt.json')).value as Receipt;
        predicate('held-history-freshness', Date.now() - history.completed <= 60000);
        await bounded(op.predecessor(false), signal);
        diagnostics?.at('create', 'outcome-unknown'); diagnostics?.submitted('create');
        if (!op.create || continuation) stop();
        const created = await op.create();
        // Never race away an acknowledgement: command transport settles after abort/exit.
        const acknowledged = acknowledgedId(created.stdout);
        if (acknowledged) {
          id = acknowledged; diagnostics?.created(id);
          persist(join(run, 'create-ack.json'), { packetDigest, deploymentId: id });
          await input.durability?.acknowledged(id);
        }
        predicate('held-create-ack', Boolean(id) && id !== packet.predecessor.id && created.code === 0 && !created.aborted);
        signal.throwIfAborted();
      } else if (phase === 'pre-sql-check') {
        if (!id) { predicate('pre-sql-known-id', false); stop(); }
        predicate('pre-sql-known-id', true);
        if (continuation) {
          const history = readEvidence(join(run, 'history.receipt.json')).value as Receipt;
          predicate('continuation-history-freshness', Date.now() - history.completed <= 60000);
        }
        await bounded(op.predecessor(false), signal);
        await bounded(op.candidate(id, true, false), signal);
        await bounded(op.alias(packet.predecessor.id), signal);
        await main();
      } else {
        if (!id) { predicate('post-sql-known-id', false); stop(); }
        predicate('post-sql-known-id', true);
        // Missing/altered SQL report cannot be laundered through a phase receipt.
        diagnostics?.at(stage, 'evidence-persistence');
        const report = readEvidence(join(run, 'migration-report.json')).value as MigrationReport;
        predicate('retained-sql-committed', report.result === 'success' && report.database_outcome === 'committed' && report.reporting !== 'failed');
        predicate('retained-sql-binding', equal(report.after, after) && report.manifest_digest === packet.targetDigest && report.source_revision === packet.revision);
        diagnostics?.at(stage);
        if (phase === 'post-sql-check' || phase === 'promote-only') {
          await bounded(op.predecessor(true), signal);
          await bounded(op.candidate(id, false, false), signal);
          await main(); await bounded(op.alias(packet.predecessor.id), signal);
          if (phase === 'promote-only') {
            persist(join(run, 'promote-intent.json'), { packetDigest, deploymentId: id });
            diagnostics?.at('promote', 'outcome-unknown'); diagnostics?.submitted('promotion');
            const promoted = await op.promote(id);
            if (continuation && promoted.code === 0) {
              let persistenceFailure: unknown;
              try { writeReleaseEvidence(join(run, 'promote-ack.json'), { packetDigest, deploymentId: id }); }
              catch (cause) { persistenceFailure = cause; }
              try { diagnostics?.promoted(); }
              finally {
                if (persistenceFailure) { diagnostics?.evidenceFailed(); throw persistenceFailure; }
              }
            }
            predicate('promotion-ack', promoted.code === 0 && !promoted.aborted);
            if (!continuation) diagnostics?.promoted();
            signal.throwIfAborted(); await bounded(op.alias(id), signal);
          }
        } else if (phase === 'final-domain-ack') {
          predicate('final-same-id-intent', equal(readEvidence(join(run, 'promote-intent.json')).value, { packetDigest, deploymentId: id }));
          if (continuation) predicate('final-same-id-ack', equal(readEvidence(join(run, 'promote-ack.json')).value, { packetDigest, deploymentId: id }));
          await bounded(op.alias(id), signal); await bounded(op.candidate(id, false, true), signal);
          await bounded(op.alias(id), signal); await main();
        } else stop();
      }
    }
    signal.throwIfAborted(); authority(); op.verify();
    const receipt: Receipt = { packetDigest, phase, previous, deploymentId: id, completed: Date.now(), reportDigest };
    diagnostics?.at(stage, 'evidence-persistence');
    persist(join(run, `${phase}.receipt.json`), receipt);
    predicate('receipt-readback', equal(readEvidence(join(run, `${phase}.receipt.json`)).value, receipt));
    await input.durability?.confirmed(phase, receipt);
    success = true;
    trace?.event(`strict.${phase}`, 'passed', 'phase-receipt-confirmed');
  } catch (cause) {
    const failure = diagnostics?.capture(cause);
    try { writeReleaseEvidence(join(run, 'STOP.json'), { packetDigest, phase, outcome: 'unknown-or-refused' }); }
    catch { diagnostics?.evidenceFailed(); }
    if (failure) throw failure;
    stop();
  } finally {
    if (success) { fs.unlinkSync(lock); syncDirectory(root); }
  }
}

export function verifyEtsyArtifact(packet: EtsyReleasePacket, root: string): VerifiedArtifact {
  const artifact = verifyArtifact(root, packet.artifactDigest, { revision: packet.revision, migrationDigest: packet.targetDigest,
    repository: `https://github.com/${repository}`, release: true });
  if (artifact.manifest.source.tree !== packet.tree || artifact.manifest.source.digest !== packet.sourceDigest
    || !equal(artifact.manifest.migrations, migrationManifest)) stop();
  return artifact;
}
async function currentEtsyMain(signal: AbortSignal, transport: typeof fetch = fetch,
  headers: Record<string, string> = { Accept: 'application/vnd.github+json' }): Promise<{ revision: string; tree: string }> {
  const response = await bounded(transport(`https://api.github.com/repos/${repository}/commits/main`,
    { redirect: 'error', signal, headers }), signal);
  if (response.status !== 200) { await response.body?.cancel(); stop(); }
  const commit = setupObject(JSON.parse((await bounded(responseBytes(response, 65536), signal)).toString('utf8')));
  return { revision: String(commit.sha), tree: String(setupObject(setupObject(commit.commit).tree).sha) };
}
export function etsyProviderOperations(packet: EtsyReleasePacket, packetDigest: string, artifact: VerifiedArtifact,
  credentials: { token: string; bearer: string; predecessorBearer: string; bypass: string; github?: string }, signal: AbortSignal,
  transport: typeof fetch = fetch, diagnostics?: ReleaseDiagnostics, continuation?: EtsyContinuationApproval) {
  diagnostics?.trace?.registerSecrets([credentials.token, credentials.bearer, credentials.predecessorBearer, credentials.bypass, credentials.github ?? '']);
  const predicate = (name: string, condition: boolean) => {
    diagnostics?.trace?.check(name, condition, 'approved-strict-contract-mismatch');
    if (!condition) stop();
  };
  const replacement = continuation?.kind === 'replacement-etsy-continuation';
  if (replacement) predicate('replacement.application-binding', equal(packet, continuationApplication(continuation))
    && artifact.digest === etsyReplacement.artifactDigest);
  predicate('strict.provider-credentials', /^[\x21-\x7e]{16,512}$/.test(credentials.token) && hex.test(credentials.bearer) && hex.test(credentials.predecessorBearer)
    && /^[\x21-\x7e]{16,512}$/.test(credentials.bypass)
    && (credentials.github === undefined || /^[\x21-\x7e]{16,512}$/.test(credentials.github)));
  const githubHeaders: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (credentials.github !== undefined) githubHeaders.Authorization = `Bearer ${credentials.github}`;
  const request = async (url: string, init: RequestInit = {}) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    const work = async () => {
      try {
        const response = await bounded(transport(url, { ...init, redirect: 'manual', signal: requestSignal }), signal);
        diagnostics?.trace?.event('strict.http-response', 'passed', 'headers-received-body-not-yet-validated',
          { status: response.status, redirected: response.redirected }); return response;
      } catch (cause) {
        diagnostics?.trace?.event('strict.http-transport', 'failed', requestSignal.aborted ? 'timeout-or-cancel' : 'transport-error',
          { aborted: requestSignal.aborted, callerAborted: signal.aborted }, cause);
        if (requestSignal.aborted) diagnostics?.reject('timeout'); throw cause;
      }
    };
    return diagnostics ? diagnostics.guard('transport', work) : work();
  };
  async function json(url: string, headers: Record<string, string>, maximum = 8 * 1024 * 1024,
    statusCheck: 'strict.http-status' | 'strict.github-predecessor-http-status' = 'strict.http-status'): Promise<Record<string, any>> {
    const response = await request(url, { headers });
    const parse = async () => {
      diagnostics?.trace?.check(statusCheck, response.status === 200 && !response.redirected, 'unexpected-status-or-redirect',
        { actual: response.status, expected: 200, redirected: response.redirected });
      if (response.status !== 200 || response.redirected) { await response.body?.cancel(); stop(); }
      const bytes = await bounded(responseBytes(response, maximum, diagnostics?.trace), signal);
      return diagnostics?.trace ? diagnostics.trace.sync('strict.http-json', () => JSON.parse(bytes.toString('utf8'))) : JSON.parse(bytes.toString('utf8'));
    };
    return diagnostics ? diagnostics.guard('validation', parse) : parse();
  }
  const provider = (path: string, maximum?: number) => {
    const url = new URL(path, 'https://api.vercel.com');
    if (url.origin !== 'https://api.vercel.com') stop();
    url.searchParams.set('teamId', artifactTarget.owner); url.searchParams.set('slug', artifactTarget.scope);
    return json(url.href, { Authorization: `Bearer ${credentials.token}` }, maximum);
  };
  async function alias(id: string): Promise<void> {
    const domain = await provider(`/v9/projects/${artifactTarget.project}/domains/api.lovora.us`);
    const binding = await provider(`/v4/aliases/api.lovora.us?projectId=${artifactTarget.project}`);
    predicate('strict.domain-binding', deploymentId.test(id) && domain.name === 'api.lovora.us' && domain.projectId === artifactTarget.project && domain.verified === true
      && !domain.redirect && !domain.gitBranch && !domain.customEnvironmentId && binding.alias === 'api.lovora.us'
      && binding.projectId === artifactTarget.project && binding.deploymentId === id && !binding.deletedAt && !binding.redirect && !binding.microfrontends
      && (binding.deployment == null || binding.deployment.id === id));
  }
  async function health(origin: string, digest: string, key: string, pending: boolean, candidate: boolean): Promise<void> {
    const http = async (url: string, init: RequestInit = {}) => {
      const response = await request(url, { ...init, headers: { ...init.headers,
        ...(candidate ? { 'x-vercel-protection-bypass': credentials.bypass } : {}) } });
      const path = new URL(url).pathname;
      const authorized = init.method !== 'OPTIONS' && ['/health/live', '/health/ready'].includes(path)
        && new Headers(init.headers).get('authorization') === `Bearer ${key}` && ![401, 403].includes(response.status);
      // Let shared HTTP acceptance report unexpected status/redirect/body first.
      // Only expected authorized health responses attest configuration; every
      // unauthorized response still forbids digest disclosure, regardless of status.
      const expectedStatus = path === '/health/ready' && pending ? 503 : 200;
      if (authorized && (response.status !== expectedStatus || response.redirected || response.body === null)) return response;
      diagnostics?.trace?.check('strict.runtime-config', response.headers.get('x-activation-config-digest') === (authorized ? digest : null),
        'runtime-digest-missing-mismatched-or-exposed-to-unauthorized-request', { authorized, pending, candidate });
      if (response.headers.get('x-activation-config-digest') !== (authorized ? digest : null)) {
        await response.body?.cancel(); diagnostics?.reject('configuration-mismatch'); stop();
      }
      return response;
    };
    await checkHostedHttp(origin, packet.browserOrigin, key, http, pending ? 'migrations_pending' : 'current', diagnostics?.trace);
  }
  const operations = {
    currentMain: () => currentEtsyMain(signal, transport, githubHeaders),
    alias,
    async predecessor(pending: boolean) {
      await alias(packet.predecessor.id);
      const project = await provider(`/v9/projects/${artifactTarget.project}`);
      predicate('strict.project-settings', project.id === artifactTarget.project && project.accountId === artifactTarget.owner && project.name === 'esty-admin-api'
        && project.rootDirectory === 'apps/api' && project.framework === 'nestjs' && project.nodeVersion === '24.x'
        && project.buildCommand === null && project.installCommand === null && project.outputDirectory === null
        && !project.commandForIgnoringBuildStep && project.link?.type === 'github' && project.link?.org === 'khuonghuyhieu'
        && project.link?.repo === 'esty-admin' && project.link?.productionBranch === 'main'
        && equal(project.link?.deployHooks, []));
      const metadata = currentAppMetadata(await provider(`/v10/projects/${artifactTarget.project}/env?decrypt=false&target=production`),
        Object.fromEntries(packet.runtimeKeys.map(key => [key, ''])));
      predicate('strict.predecessor-production-metadata', metadata.metadataDigest === packet.metadataDigest);
      predicate('strict.predecessor-source-ref', revision.test(packet.predecessor.revision));
      const source = await json(`https://api.github.com/repos/${repository}/commits/${packet.predecessor.revision}`,
        githubHeaders, undefined, 'strict.github-predecessor-http-status');
      predicate('strict.predecessor-source', source.sha === packet.predecessor.revision && source.commit?.tree?.sha === packet.predecessor.tree);
      const old = await provider(`/v13/deployments/${packet.predecessor.id}`), meta = setupObject(old.meta);
      predicate('strict.predecessor-identity', old.id === packet.predecessor.id && old.projectId === artifactTarget.project && old.ownerId === artifactTarget.owner
        && old.target === 'production' && old.readyState === 'READY' && !old.gitSource && equal(old.regions, ['icn1'])
        && meta.sourceCommit === packet.predecessor.revision && meta.artifactSha256 === packet.predecessor.artifactDigest
        && meta.sourceDigest === packet.predecessor.sourceDigest);
      await health('https://api.lovora.us', packet.predecessor.configDigest, credentials.predecessorBearer, pending, false);
      await alias(packet.predecessor.id);
    },
    async candidate(id: string, pending: boolean, final: boolean) {
      const metadata = currentAppMetadata(await provider(`/v10/projects/${artifactTarget.project}/env?decrypt=false&target=production`),
        Object.fromEntries(packet.runtimeKeys.map(key => [key, ''])));
      predicate('strict.candidate-production-metadata', metadata.metadataDigest === packet.metadataDigest);
      const deployed = await provider(`/v13/deployments/${id}`);
      const inspect = () => inspectCandidate(deployed, id, artifact, { revision: packet.revision, tree: packet.tree, run: packet.runId });
      const candidate = diagnostics?.trace ? diagnostics.trace.sync('strict.candidate-identity', inspect) : inspect();
      predicate('strict.candidate-declaration', candidate.ready && (replacement
        ? id === etsyReplacement.id && deployed.meta.runtimeDiagnostic === etsyReplacement.tag
        : deployed.meta.etsySetupRun === packet.runId && deployed.meta.etsySetupPacket === packetDigest
          && deployed.meta.etsyRuntimeDigest === packet.runtimeDigest));
      const files = await provider(`/v6/deployments/${id}/files`);
      const partition = () => {
        const source = Array.isArray(files) ? files.find(entry => entry?.name === 'src') : undefined;
        return uploadedCandidatePartition(source?.children?.[0]?.name === 'project.tgz' ? files : normalizeManualArchive(files));
      };
      const uid = diagnostics?.trace ? diagnostics.trace.sync('strict.uploaded-partition', partition) : partition();
      const archive = await provider(`/v8/deployments/${id}/files/${uid}`, 350 * 1024 * 1024);
      const verify = () => verifyCandidateArchive(archive, uid, artifact);
      const uploadedDigest = diagnostics?.trace ? diagnostics.trace.sync('strict.uploaded-archive', verify) : verify();
      if (replacement) predicate('replacement.uploaded-archive', uploadedDigest === etsyReplacement.uploadedArchiveDigest);
      await health(final ? 'https://api.lovora.us' : candidate.origin, packet.runtimeDigest, credentials.bearer, pending, !final);
    },
  };
  return diagnostics ? diagnostics.operations('strict-provider', operations) : operations;
}

export interface EtsyCli {
  create(): Promise<CommandResult>;
  promote(id: string): Promise<CommandResult>;
  dispose(): Promise<void>;
}
function verifyEtsyCli(packet: Pick<EtsyReleasePacket, 'cliDigest' | 'cliOwnFilesDigest'>, artifact: VerifiedArtifact, cli: string): void {
  if (!cli.endsWith('/vercel/dist/vc.js') || sha256(fs.readFileSync(cli)) !== packet.cliDigest
    || JSON.parse(fs.readFileSync(resolve(cli, '../../package.json'), 'utf8')).version !== '65.4.0'
    || sha256(canonical(inventory(resolve(cli, '../..'), new Set(['node_modules'])).files)) !== packet.cliOwnFilesDigest
    || artifact.manifest.build.tools.find(tool => tool.name === 'vercel')?.filesDigest !== packet.cliOwnFilesDigest) stop();
}
export function isolatedEtsyCli(packet: EtsyReleasePacket, packetDigest: string, artifact: VerifiedArtifact, cli: string,
  token: string, signal: AbortSignal, diagnostics: ReleaseDiagnostics | undefined, promotionOnly: true,
  tools: EtsyContinuationApproval['operator'], operator: VerifiedArtifact): Promise<Omit<EtsyCli, 'create'>>;
export function isolatedEtsyCli(packet: EtsyReleasePacket, packetDigest: string, artifact: VerifiedArtifact, cli: string,
  token: string, signal: AbortSignal, diagnostics?: ReleaseDiagnostics): Promise<EtsyCli>;
export async function isolatedEtsyCli(packet: EtsyReleasePacket, packetDigest: string, artifact: VerifiedArtifact, cli: string,
  token: string, signal: AbortSignal, diagnostics?: ReleaseDiagnostics, promotionOnly = false,
  tools?: EtsyContinuationApproval['operator'], operator?: VerifiedArtifact): Promise<EtsyCli | Omit<EtsyCli, 'create'>> {
  if (promotionOnly) {
    heldRequire(tools && operator, 'current-promotion-tools');
    verifyEtsyCli(tools, operator, cli);
  } else verifyEtsyCli(packet, artifact, cli);
  const root = await mkdtemp(join(fs.realpathSync(tmpdir()), 'esty-etsy-cli-'));
  try {
    const env = await isolatedEnvironment(join(root, 'environment')); env.PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;
    const auth = join(root, 'auth'), stage = join(root, 'stage'); await mkdir(auth, { mode: 0o700 }); await mkdir(stage, { mode: 0o700 });
    await writeFile(join(auth, 'auth.json'), JSON.stringify({ token }), { flag: 'wx', mode: 0o600 });
    await stagePrebuiltOutput(artifact, stage);
    const common = ['--non-interactive', '--cwd', stage, '--global-config', auth, '--scope', artifactTarget.scope];
    const verify = () => {
      if (!equal(inventory(join(stage, '.vercel/output')).files.map(file => ({ ...file, path: `.vercel/output/${file.path}` })),
        artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/')))) stop();
    };
    const promote = (id: string) => {
      if (!deploymentId.test(id)) stop();
      verify();
      return command(process.execPath, [cli, 'promote', id, '--timeout', '5m', ...common], stage, env, signal, diagnostics?.trace);
    };
    if (promotionOnly) return { promote, dispose: () => removeArtifactTree(root) };
    return {
      create() { verify(); return command(process.execPath, [cli, ...prebuiltCreateArguments(artifact, common),
        '--meta', `etsySetupRun=${packet.runId}`, '--meta', `etsySetupPacket=${packetDigest}`, '--meta', `etsyRuntimeDigest=${packet.runtimeDigest}`], stage, env, signal, diagnostics?.trace); },
      promote,
      dispose: () => removeArtifactTree(root),
    };
  } catch (cause) {
    if (promotionOnly) {
      try { await removeArtifactTree(root); }
      catch (cleanup) { throw new AggregateError([cause, cleanup], 'Held promotion preparation and cleanup failed.', { cause }); }
      throw cause;
    }
    await removeArtifactTree(root); return stop();
  }
}
function verifyExecuting(packet: EtsyReleasePacket, artifact: VerifiedArtifact): void {
  // One fixed owner/host ledger for this target, independent of source, run or artifact.
  // The owner must provision it on retained storage; alternate roots cannot reopen CREATE.
  if (packet.ledgerRoot !== join(fs.realpathSync(userInfo().homedir), '.local/state/lovora-etsy-setup')) stop();
  if (process.versions.node !== artifactTarget.node || process.platform !== 'linux' || process.arch !== 'x64'
    || sha256(fs.readFileSync(process.execPath)) !== packet.nodeDigest || packet.nodeDigest !== artifact.manifest.build.nodeSha256
    || sha256(fs.readFileSync(fileURLToPath(import.meta.url))) !== packet.driverDigest) stop();
  const executing = inventory(fileURLToPath(new URL('../../../../', import.meta.url)));
  if (!equal(executing.files, artifact.manifest.files.filter(file => file.path.startsWith('operator/')).map(file => ({ ...file, path: file.path.slice(9) })))
    || !equal(executing.directories, artifact.manifest.directories.filter(entry => entry.path.startsWith('operator/')).map(entry => ({ ...entry, path: entry.path.slice(9) })))) stop();
}
export function verifyEtsyOwnerExecution(packet: EtsyReleasePacket, artifactRoot: string): void {
  verifyExecuting(packet, verifyEtsyArtifact(packet, artifactRoot));
}
export function generateEtsyLaunchers(input: { packet: EtsyReleasePacket; packetDigest: string; packetPath: string;
  artifactRoot: string; configPath: string; cli: string; output: string }): void {
  const packet = validateEtsyReleasePacket(input.packet, input.packetDigest), artifact = verifyEtsyArtifact(packet, input.artifactRoot);
  verifyExecuting(packet, artifact);
  verifyEtsyCli(packet, artifact, input.cli);
  if (!equal(readEvidence(input.packetPath).value, packet)) stop();
  const config = readEvidence(input.configPath);
  if (config.identity.sha256 !== packet.configBundleDigest) stop();
  const prepared = setupObject(config.value), runtime = setupObject(prepared.runtime);
  const { APP_ACTIVATION_CONFIG_DIGEST: expected, ...values } = runtime;
  const validated = prepareEtsyConfiguration({ runtime: values, backupPolicy: prepared.backupPolicy });
  if (expected !== packet.runtimeDigest || validated.runtimeDigest !== packet.runtimeDigest || !equal(validated, prepared)
    || !equal(Object.keys(runtime).sort(), packet.runtimeKeys)) stop();
  const output = privateDirectory(input.output, false);
  const node = fs.realpathSync(process.execPath), driver = fileURLToPath(import.meta.url);
  for (const path of [input.packetPath, input.artifactRoot, input.cli, node, driver, output]) {
    if (resolve(path) !== path || fs.realpathSync(path) !== path || !/^\/[A-Za-z0-9_./ -]+$/.test(path)) stop();
  }
  // Built-in-only verifier runs before loading any operator code. Its expected inventory
  // is embedded in the approved fresh launcher, not imported from a mutable manifest.
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const files = artifact.manifest.files.filter(file => file.path.startsWith('operator/')).map(file => ({ ...file, path: file.path.slice(9) }));
  const directories = artifact.manifest.directories.filter(entry => entry.path.startsWith('operator/')).map(entry => ({ ...entry, path: entry.path.slice(9) }));
  if (output === artifact.root || output.startsWith(`${artifact.root}/`) || output === root || output.startsWith(root.endsWith('/') ? root : `${root}/`)) stop();
  const verifier = `const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=${JSON.stringify(root)},files=${JSON.stringify(files)},dirs=${JSON.stringify(directories)};
const expected=new Map([...files,...dirs].map(f=>[f.path,f]));let count=0;
if(fs.realpathSync(root)!==root.replace(/\\/$/,''))process.exit(1);
function walk(base){for(const name of fs.readdirSync(path.join(root,base))){const rel=base?base+'/'+name:name,s=fs.lstatSync(path.join(root,rel)),f=expected.get(rel);
if(!f||s.isSymbolicLink()||(s.mode&511)!==f.mode)process.exit(1);count++;
if(s.isDirectory()){if('sha256'in f)process.exit(1);walk(rel)}else if(!s.isFile()||s.nlink!==1||s.size!==f.size||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex')!==f.sha256)process.exit(1)}}
walk('');if(count!==expected.size)process.exit(1);`;
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  for (const phase of etsyReleasePhases) {
    const script = `#!/bin/sh\nset -eu\numask 077\nexport PATH=/usr/bin:/bin\nprintf '%s  %s\\n' ${quote(packet.nodeDigest)} ${quote(node)} | /usr/bin/sha256sum --check --status\n/usr/bin/env -i PATH=/usr/bin:/bin ${quote(node)} <<'ETSY_OPERATOR_INVENTORY'\n${verifier}\nETSY_OPERATOR_INVENTORY\nexec /usr/bin/env -i PATH=/usr/bin:/bin ${quote(node)} ${quote(driver)} ${quote(phase)} ${quote(input.packetPath)} ${quote(input.packetDigest)} ${quote(input.artifactRoot)} ${quote(input.cli)}\n`;
    const fd = fs.openSync(join(output, `${phase}.sh`), fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o700);
    try { fs.writeFileSync(fd, script); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    syncDirectory(output);
  }
  // This projection is made only after the independently approved packet, new
  // configuration bundle and immutable artifact above have all been verified.
  // The Owner launcher pins its digest; settings never supply this authority.
  const authUrl = validated.runtime.APP_AUTH_URL, authApiKey = validated.runtime.APP_AUTH_API_KEY;
  if (!authUrl || !authApiKey || packet.target !== `supabase:${validated.runtime.SUPABASE_PROJECT_REF}`) stop();
  const bindingPath = join(output, 'owner-binding.json');
  writeReleaseEvidence(bindingPath, { version: 1, packet, packetDigest: input.packetDigest,
    authUrl, authApiKeySha256: sha256(authApiKey) });
  const bindingDigest = readEvidence(bindingPath).identity.sha256;
  const owner = fileURLToPath(new URL('./etsy-owner.js', import.meta.url));
  const script = `#!/bin/sh\nset -eu\numask 077\nexport PATH=/usr/bin:/bin\nprintf '%s  %s\\n' ${quote(packet.nodeDigest)} ${quote(node)} | /usr/bin/sha256sum --check --status\n/usr/bin/env -i PATH=/usr/bin:/bin ${quote(node)} <<'ETSY_OPERATOR_INVENTORY'\n${verifier}\nETSY_OPERATOR_INVENTORY\nexec /usr/bin/env -i PATH=/usr/bin:/bin ${quote(node)} ${quote(owner)} ${quote(bindingPath)} ${quote(bindingDigest)} ${quote(input.artifactRoot)}\n`;
  const fd = fs.openSync(join(output, 'owner.sh'), fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o700);
  try { fs.writeFileSync(fd, script); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDirectory(output);
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!process.stdin.isTTY || !process.stdout.isTTY) stop();
  if (args[0] === 'launchers' && args.length === 7) {
    const [, packetPath, digest, artifactRoot, configPath, cli, output] = args;
    generateEtsyLaunchers({ packet: validateEtsyReleasePacket(readEvidence(packetPath!).value, digest!), packetDigest: digest!,
      packetPath: packetPath!, artifactRoot: artifactRoot!, configPath: configPath!, cli: cli!, output: output! }); return;
  }
  if (args.length !== 5 || !etsyReleasePhases.includes(args[0] as EtsyReleasePhase)) stop();
  const [phaseValue, packetPath, packetDigest, artifactRoot, cliPath] = args;
  const phase = phaseValue as EtsyReleasePhase;
  const packet = validateEtsyReleasePacket(readEvidence(packetPath!).value, packetDigest!);
  if (packet.target === 'local') stop(); // Executable owner launchers cannot silently select development infrastructure.
  const artifact = verifyEtsyArtifact(packet, artifactRoot!);
  const verify = () => { validateEtsyReleasePacket(readEvidence(packetPath!).value, packetDigest!); verifyEtsyArtifact(packet, artifactRoot!); verifyExecuting(packet, artifact); };
  verify();
  let candidate = '';
  if (etsyReleasePhases.indexOf(phase) >= 2) {
    const ack = exactObject(readEvidence(join(packet.ledgerRoot, packet.runId, 'create-ack.json')).value, ['packetDigest', 'deploymentId']);
    if (ack.packetDigest !== packetDigest || !deploymentId.test(String(ack.deploymentId))) stop();
    candidate = ` ${String(ack.deploymentId)}`;
  }
  const approval = `APPROVE ${phase} ${packetDigest}${candidate}`;
  if (await readHiddenPassword(process.stdin, process.stdout, `Type ${approval} (hidden; this phase only): `) !== approval) stop();
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(600000)]);
  let cli: EtsyCli | undefined;
  const unavailable = async (): Promise<never> => stop();
  try {
    let operations: EtsyReleaseOperations;
    if (phase === 'history' || phase === 'sql-apply') {
      const raw = await readHiddenPassword(process.stdin, process.stdout, 'Fresh approved migration-only input JSON (hidden): ', { maxBytes: 65536, maxCharacters: 65536 });
      const database = parseMigrationConfig(migrationInputs(JSON.parse(raw), packet));
      operations = { verify, currentMain: () => currentEtsyMain(signal), predecessor: unavailable, create: unavailable, candidate: unavailable,
        promote: unavailable, alias: unavailable,
        async history() { const status = await migrationStatus(database); if (!status.initialized || !status.ordered || status.unexpected.length) stop(); return status.applied; },
        migrate: () => runMigrations(database, { sourceRevision: packet.revision, target: packet.target, signal,
          expectedBefore: migrationManifest.slice(0, 3).map(entry => entry.name) }) };
    } else {
      const raw = await readHiddenPassword(process.stdin, process.stdout, 'Fresh provider/probe-only token/bearer/predecessorBearer/bypass JSON (hidden): ', { maxBytes: 16384 });
      const credentials = exactObject(JSON.parse(raw), ['token', 'bearer', 'predecessorBearer', 'bypass']) as unknown as { token: string; bearer: string; predecessorBearer: string; bypass: string };
      const provider = etsyProviderOperations(packet, packetDigest!, artifact, credentials, signal);
      // Preparing CLI auth/staging is local-only; phase intent precedes any provider request.
      if (phase === 'held-create' || phase === 'promote-only') cli = await isolatedEtsyCli(packet, packetDigest!, artifact, cliPath!, credentials.token, signal);
      operations = { ...provider, verify, history: unavailable, migrate: unavailable,
        create: () => cli ? cli.create() : unavailable(), promote: id => cli ? cli.promote(id) : unavailable() };
    }
    await runEtsyReleasePhase({ packet, packetDigest: packetDigest!, phase, operations, signal });
    console.info(`ETSY_SETUP_PHASE_CONFIRMED:${phase}`);
  } finally { await cli?.dispose(); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error(new EtsyReleaseStop().message); process.exitCode = 1; });
}
