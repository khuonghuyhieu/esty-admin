import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, inventory, readArtifactFile, sha256, verifyArtifact } from './artifact.js';
import { verifyUploadedArchive } from './ci-archive.js';
import { responseBytes } from './ci-tools.js';
import { validateActivationPacket } from './activation-journal.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';
import { normalizeManualArchive } from './activation-archive-transport.mjs';

export const bridgeRecovery = Object.freeze({
  workflowRun: '42970824679', activationRun: 'dcbc0b5f-1707-485d-adb5-02b45037319a', journal: 7703208254,
  packetDigest: '5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690',
  candidate: 'dpl_525LvEPCBud7nyAeFTcRx8iipTrk', predecessor: 'dpl_E7FELzuA6Ymt9mW8B3NE7mA4oQH3',
  origin: 'https://esty-admin-aohiduygu-khuonghuyhieu0705s-projects.vercel.app',
  project: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls', scope: 'team_k2Hk4wx5XAb9Mgc6lP5AjVhf',
  revision: 'f162c8db8ec149724c0a25537a4a0674bd012035', tree: '181b2c014f9373e4d6cdf055cba01eac11ed5a5e',
  sourceDigest: '73e8f1f5cb7683da2f337b6f3092d6cdcd6dd42ea15a224ce35aa3ea0b77c3e8',
  artifactDigest: '82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2',
  configDigest: '6dae627e7a7c1fb1f67afb5f78f0177ba1af937c19a03c41562366ab4becd7fe',
  originalInventory: '1d08db233c8749a79ead73bfa32046da8edf94ba77a195441c44ea685df302b7',
  originalHead: '336c3c0a2bb38e932444941518f6bc6cfc31677a98166791f165bac8c1b558ae',
  workflowRevision: 'c8cb76eecb910db9a571f80a935becaa83cb031b', workflowTree: 'e76f27c53391b0e466a6e2b5d987eb689dd6e6c2',
  partitionUid: '24ec4f3bf9c9004635b9fa52c861c91b5123ee9b',
});
const target = bridgeRecovery;
function refuse(): never { throw new Error('Exact candidate recovery remains fenced.'); }
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) refuse();
  return value;
}
export interface RecoveryGuard { digest: string; verify(): unknown }
export interface RecoveryContext {
  original: string; artifact: string; directory: string; controlDigest: string; guard: RecoveryGuard;
}
export interface RecoveryIo {
  github(path: string): Promise<unknown>;
  vercel(path: string): Promise<unknown>;
  promote(): Promise<{ code: number | null; aborted: boolean }>;
}
export interface StartupResult {
  stage: 'metadata' | 'startup' | 'complete';
  category: 'passed' | 'refused' | 'aborted' | 'timeout' | 'http_401' | 'http_403' | 'http_other' | 'config_mismatch' | 'body_mismatch';
}
function anchor(context: RecoveryContext) {
  return { version: 1, originalHead: target.originalHead, originalInventory: target.originalInventory,
    packetDigest: target.packetDigest, journal: target.journal, candidate: target.candidate,
    executableDigest: context.guard.digest, controlDigest: context.controlDigest };
}
export function inspectBridgeRecoveryOriginal(context: RecoveryContext) {
  context.guard.verify();
  if (!/^[a-f0-9]{64}$/.test(context.controlDigest) || !/^[a-f0-9]{64}$/.test(context.guard.digest)) refuse();
  privateDirectory(context.original, false);
  if (sha256(canonical(inventory(context.original))) !== target.originalInventory) refuse();
  const packet = validateActivationPacket(readEvidence(join(context.original, 'packet-input.json')).value, target.packetDigest);
  if (packet.runId !== target.activationRun || packet.predecessorId !== target.predecessor
    || packet.bridgeConfigDigest !== target.configDigest) refuse();
  const directory = join(context.original, 'activation', target.activationRun);
  const reservation = object(readEvidence(join(directory, 'reservation.json')).value);
  if (reservation.journal !== target.journal || reservation.packetDigest !== target.packetDigest) refuse();
  let previous: string = target.packetDigest;
  const events = Array.from({ length: 11 }, (_, sequence) => {
    const event = object(readEvidence(join(directory, `${String(sequence).padStart(3, '0')}.json`)).value);
    const { sha256: recorded, ...body } = event;
    if (event.sequence !== sequence || event.packetDigest !== target.packetDigest || event.previousHash !== previous
      || typeof recorded !== 'string' || recorded !== sha256(canonical(body))) refuse();
    previous = recorded; return event;
  });
  if (previous !== target.originalHead || events[9]!.kind !== 'acknowledged'
    || object(events[9]!.value).deploymentId !== target.candidate || events[10]!.kind !== 'outcome'
    || object(events[10]!.value).result !== 'unknown' || object(events[10]!.value).deploymentId !== target.candidate) refuse();
  const artifact = verifyArtifact(context.artifact, target.artifactDigest, { revision: target.revision,
    migrationDigest: packet.targetDigest, repository: 'https://github.com/khuonghuyhieu/esty-admin', release: true });
  if (artifact.manifest.source.tree !== target.tree || artifact.manifest.source.digest !== target.sourceDigest) refuse();
  return { packet, artifact };
}
async function alias(io: RecoveryIo, expected: string): Promise<void> {
  const domain = object(await io.vercel(`/v9/projects/${target.project}/domains/api.lovora.us`));
  const value = object(await io.vercel(`/v4/aliases/api.lovora.us?projectId=${target.project}`));
  if (domain.name !== 'api.lovora.us' || domain.projectId !== target.project || domain.verified !== true
    || domain.redirect || domain.gitBranch || domain.customEnvironmentId || value.alias !== 'api.lovora.us'
    || value.projectId !== target.project || value.deploymentId !== expected || value.deletedAt || value.redirect
    || value.microfrontends || (value.deployment != null && object(value.deployment).id !== expected)) refuse();
}
async function candidate(io: RecoveryIo): Promise<void> {
  const value = object(await io.vercel(`/v13/deployments/${target.candidate}`)), meta = object(value.meta);
  if (value.id !== target.candidate || value.projectId !== target.project || value.ownerId !== target.scope
    || value.target !== 'production' || value.readyState !== 'READY' || value.gitSource
    || `https://${value.url}` !== target.origin || canonical(value.regions) !== canonical(['icn1'])
    || meta.sourceCommit !== target.revision || meta.artifactSha256 !== target.artifactDigest
    || meta.sourceDigest !== target.sourceDigest || meta.activationRun !== target.activationRun
    || meta.activationPacket !== target.packetDigest || meta.activationPhase !== 'bridge'
    || meta.activationConfigDigest !== target.configDigest) refuse();
}
export async function verifyRecoveredBridgeProduction(io: RecoveryIo): Promise<void> {
  await candidate(io);
  await alias(io, target.candidate);
}
async function inspectRemote(context: RecoveryContext, io: RecoveryIo,
  mainRevision: string = target.workflowRevision, mainTree: string = target.workflowTree): Promise<void> {
  const { artifact } = inspectBridgeRecoveryOriginal(context);
  const main = object(await io.github('/commits/main'));
  if (main.sha !== mainRevision || object(object(main.commit).tree).sha !== mainTree) refuse();
  const run = object(await io.github(`/actions/runs/${target.workflowRun}`));
  if (String(run.id) !== target.workflowRun || run.run_attempt !== 1 || run.status !== 'completed'
    || run.conclusion !== 'failure' || run.head_sha !== target.workflowRevision || run.head_branch !== 'main'
    || run.event !== 'workflow_dispatch' || object(run.repository).full_name !== 'khuonghuyhieu/esty-admin') refuse();
  const intent = object(await io.github(`/deployments/${target.journal}`)), payload = object(intent.payload);
  if (intent.id !== target.journal || intent.environment !== 'be-production' || intent.task !== 'deploy:esty-be-ci'
    || payload.run !== target.workflowRun || payload.activationRun !== target.activationRun
    || payload.activationPacket !== target.packetDigest || payload.artifact !== target.artifactDigest
    || payload.project !== target.project || payload.sourceDigest !== target.sourceDigest) refuse();
  const statuses = await io.github(`/deployments/${target.journal}/statuses?per_page=100`);
  if (!Array.isArray(statuses) || !statuses.length || object(statuses[0]).state !== 'in_progress'
    || object(statuses[0]).description !== `ack:${target.candidate}`
    || object(statuses[0]).log_url !== `https://github.com/khuonghuyhieu/esty-admin/actions/runs/${target.workflowRun}`) refuse();
  await candidate(io); await alias(io, target.predecessor);
  const roots = normalizeManualArchive(await io.vercel(`/v6/deployments/${target.candidate}/files`));
  const source = object(roots.find((entry: unknown) => object(entry).name === 'src'));
  const output = object(roots.find((entry: unknown) => object(entry).name === 'out'));
  if (source.type !== 'directory' || source.mode !== 0o40555 || !Array.isArray(source.children) || source.children.length !== 1
    || output.type !== 'directory' || output.mode !== 0o40555 || !Array.isArray(output.children) || output.children.length !== 1) refuse();
  const lambda = object(output.children[0]), file = object(source.children[0]);
  if (lambda.name !== 'index' || lambda.type !== 'lambda' || lambda.mode !== 0o140666
    || (lambda.children !== undefined && (!Array.isArray(lambda.children) || lambda.children.length))
    || file.uid !== target.partitionUid) refuse();
  const content = object(await io.vercel(`/v8/deployments/${target.candidate}/files/${target.partitionUid}`));
  if (typeof content.data !== 'string' || content.data.length > 4 * 1024 * 1024) refuse();
  const bytes = Buffer.from(content.data, 'base64');
  if (bytes.toString('base64') !== content.data) refuse();
  verifyUploadedArchive(bytes, artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/')), target.partitionUid);
  inspectBridgeRecoveryOriginal(context);
}
function record(context: RecoveryContext, name: string, value: unknown): void {
  writeReleaseEvidence(join(context.directory, name), value);
  if (canonical(readEvidence(join(context.directory, name)).value) !== canonical(value)) refuse();
}
async function requestStartup(context: RecoveryContext, io: RecoveryIo,
  readBearer: () => { value: string; dispose(): void }, signal: AbortSignal, transport: typeof fetch): Promise<StartupResult> {
  let result: StartupResult = { stage: 'metadata', category: 'refused' }, bearer: ReturnType<typeof readBearer> | undefined;
  try {
    await inspectRemote(context, io); context.guard.verify(); signal.throwIfAborted();
    bearer = readBearer();
    if (!/^[a-f0-9]{64}$/.test(bearer.value)) refuse();
    result = { stage: 'startup', category: 'refused' };
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    try {
      // Exactly one GET, only /health/live. No ready endpoint, bypass token, SQL or retry.
      const response = await transport(`${target.origin}/health/live`, { method: 'GET', redirect: 'error',
        credentials: 'omit', cache: 'no-store', signal: deadline, headers: { Authorization: `Bearer ${bearer.value}` } });
      if (response.status !== 200 || response.redirected) {
        await response.body?.cancel();
        result.category = response.status === 401 ? 'http_401' : response.status === 403 ? 'http_403' : 'http_other';
      } else if (response.headers.get('x-activation-config-digest') !== target.configDigest) {
        await response.body?.cancel(); result.category = 'config_mismatch';
      } else if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
        await response.body?.cancel(); result.category = 'body_mismatch';
      } else {
        const body = JSON.parse((await responseBytes(response, 4096)).toString('utf8'));
        result = object(body).status === 'ok' ? { stage: 'complete', category: 'passed' }
          : { stage: 'startup', category: 'body_mismatch' };
      }
    } catch { result.category = signal.aborted ? 'aborted' : deadline.aborted ? 'timeout' : 'refused'; }
    inspectBridgeRecoveryOriginal(context);
    if (result.category === 'passed') { await candidate(io); await alias(io, target.predecessor); }
  } catch { result = { stage: result.stage, category: signal.aborted ? 'aborted' : 'refused' }; }
  finally { bearer?.dispose(); }
  return result;
}
export async function attestBridgeRecovery(context: RecoveryContext, io: RecoveryIo,
  readBearer: () => { value: string; dispose(): void }, signal: AbortSignal, transport: typeof fetch = fetch): Promise<StartupResult> {
  inspectBridgeRecoveryOriginal(context); signal.throwIfAborted();
  // This directory is derived from the original completed transfer lineage by the guarded caller.
  // It is a separate one-shot fence, never a replacement for any original event or lock.
  mkdirSync(context.directory, { mode: 0o700 });
  privateDirectory(context.directory, false);
  const attempt = { anchor: anchor(context), kind: 'startup-attempt', state: 'unknown' };
  record(context, 'startup-attempt.json', attempt);
  const result = await requestStartup(context, io, readBearer, signal, transport);
  record(context, 'startup-result.json', { anchor: anchor(context), kind: 'startup-result',
    attemptDigest: sha256(canonical(attempt)), result });
  return result;
}

export const bridgePreHttpContinuation = Object.freeze({
  rootAuthorization: 't12p via t11c: one evidence-linked continuation of the same pre-HTTP startup intent; no retry or promotion',
  previousExecutableDigest: 'd005efad80701959da0e24f42f98f38c5c0901881adb1df6bb959f196b0a3251',
  acceptedProjectionExecutableDigest: '421b8d62d7fd3540f72650a2e25ba3cd929c1a93631d90fee44f4aafaf4a4d0f',
  previousControllerSourceDigest: '9a6199a97b50e223543a3ce4505d8ee66b12a9e4cccedda31e1088cccf785df3',
  previousAttemptDigest: '2336c9a06867877fae835a9220195544d86c26871d6993b3917f2a74b237b8b3',
  previousResultDigest: '7486a374f69d7ea6fd20d0f2f36b3bb42c7afa2df20fb1c2a8c7d4d677a68dbe',
  previousResultFileDigest: '9a9acd641f6ec6b8f8fcd74426676defd7df3bdc4acc4f0b893f1aa7c383b7e4',
});
function capturedPreHttpRefusal(context: RecoveryContext): void {
  const authorization = bridgePreHttpContinuation, manifest = object(context.guard.verify());
  if (canonical(manifest.bridgePreHttpContinuation) !== canonical(authorization)
    || context.guard.digest === authorization.previousExecutableDigest
    || context.guard.digest === authorization.acceptedProjectionExecutableDigest) refuse();
  const attempt = readEvidence(join(context.directory, 'startup-attempt.json'));
  const outcome = readEvidence(join(context.directory, 'startup-result.json'));
  const previousAnchor = { ...anchor(context), executableDigest: authorization.previousExecutableDigest };
  const expectedAttempt = { anchor: previousAnchor, kind: 'startup-attempt', state: 'unknown' };
  const expectedOutcome = { anchor: previousAnchor, kind: 'startup-result', attemptDigest: authorization.previousAttemptDigest,
    result: { stage: 'metadata', category: 'refused' } };
  if (canonical(attempt.value) !== canonical(expectedAttempt) || canonical(outcome.value) !== canonical(expectedOutcome)
    || sha256(canonical(attempt.value)) !== authorization.previousAttemptDigest
    || attempt.identity.sha256 !== 'b1141f4e9da68c5d773b62674efd4ad7ef15420016ed3c9a590f09672c7c3d8e'
    || sha256(canonical(outcome.value)) !== authorization.previousResultDigest
    || outcome.identity.sha256 !== authorization.previousResultFileDigest) refuse();
  // Only this captured controller's metadata stage predates its sole transport call.
  // Its bearer callback precedes the startup stage; whether it ran is not inferred.
}
export const bridgePackagedPreHttpContinuation = Object.freeze({
  rootAuthorization: 't12p via t11c: one protected startup GET over the preserved four-file pre-HTTP lineage; no promotion',
  previousExecutableDigest: 'bcf09fc719050ea813d7486cb0bbdaf51903f56963d6f339205c19cde5eaba50',
  acceptedPackagingManifestDigest: 'c84843f4d935b34b10ade09b5845943ccff5f66c5d7f3581d2045d849354df18',
  packagingToolBindingDigest: '9ef789802411a7cebb41495bcce02cfe7a35af2e3248c4e742c4369c86e9370a',
  previousCorrectionFileDigest: '75b59bb876a1704490a94ac76e48281cd23ee18de574bca7332e67bc6cf16a47',
  previousResultFileDigest: '1b01b10d3ddcd8c50e7ccc5c14899d5ad217275eb9e9aea43c91c94380fe02ef',
});
function capturedPackagingRefusal(context: RecoveryContext): void {
  capturedPreHttpRefusal(context);
  const authorization = bridgePackagedPreHttpContinuation, manifest = object(context.guard.verify());
  if (canonical(manifest.bridgePackagedPreHttpContinuation) !== canonical(authorization)
    || sha256(canonical(manifest.recoveryVercel)) !== authorization.packagingToolBindingDigest
    || context.guard.digest === authorization.previousExecutableDigest
    || context.guard.digest === authorization.acceptedPackagingManifestDigest) refuse();
  const correction = readEvidence(join(context.directory, 'startup-correction.json'));
  const outcome = readEvidence(join(context.directory, 'startup-correction-result.json'));
  const previousAnchor = { ...anchor(context), executableDigest: authorization.previousExecutableDigest };
  const expectedCorrection = { anchor: previousAnchor, kind: 'startup-pre-http-correction',
    authorization: bridgePreHttpContinuation, state: 'unknown' };
  const expectedOutcome = { anchor: previousAnchor, kind: 'startup-correction-result',
    correctionDigest: sha256(canonical(expectedCorrection)), result: { stage: 'metadata', category: 'refused' } };
  if (canonical(correction.value) !== canonical(expectedCorrection) || canonical(outcome.value) !== canonical(expectedOutcome)
    || correction.identity.sha256 !== authorization.previousCorrectionFileDigest
    || outcome.identity.sha256 !== authorization.previousResultFileDigest) refuse();
}
export async function continueBridgeRecovery(context: RecoveryContext, io: RecoveryIo,
  readBearer: () => { value: string; dispose(): void }, signal: AbortSignal, transport: typeof fetch = fetch): Promise<StartupResult> {
  inspectBridgeRecoveryOriginal(context); privateDirectory(context.directory, false); signal.throwIfAborted();
  if (canonical(readdirSync(context.directory).sort()) !== canonical([
    'startup-attempt.json', 'startup-correction-result.json', 'startup-correction.json', 'startup-result.json'])) refuse();
  capturedPackagingRefusal(context);
  const correction = { anchor: anchor(context), kind: 'startup-packaging-attempt',
    authorization: bridgePackagedPreHttpContinuation, state: 'unknown' };
  // Exclusive append fences concurrency, partial writes and every later retry; all four old records stay untouched.
  record(context, 'startup-packaging-attempt.json', correction);
  let result = await requestStartup(context, io, readBearer, signal, transport);
  try { capturedPackagingRefusal(context); } catch { result = { stage: result.stage, category: 'refused' }; }
  record(context, 'startup-packaging-result.json', { anchor: anchor(context), kind: 'startup-packaging-result',
    attemptDigest: sha256(canonical(correction)), result });
  return result;
}
export const bridgeExternalStartupProof = Object.freeze({
  rootAuthorization: 't12p via t11c: consume accepted GitHub startup proof and promote the existing candidate once; no health retry or create',
  receiptName: 'candidate-probe-43000514504.json',
  receiptDigest: '8fd49d01a374fd9cc802d21a55761a08cf1e0ecbb7cadb693a43dcb18d00efb1',
  workflowRun: '43000514504', workflowRevision: 'd3d2b0788d970377c9fee9d59c52e3d1baff7de2',
  workflowTree: 'ff6611ac0eb82a250d8e3b44318468cfd15e2f42',
  previousExecutableDigest: '986a015b0d4d84d12e718d0bbc7e423ab4268d8ee6b5516621ae0064ac1b1e1a',
  previousAttemptFileDigest: '30a5455b75d7210b40488cfe1c6886b775c42da003a061d78365b6f7bb3398ed',
  previousResultFileDigest: '0cf34fd52c0dc220f6a00078aa4656d20a57b384eef3f66c5e2feb7b5b34cee4',
});
function externalStartupProof(context: RecoveryContext) {
  capturedPackagingRefusal(context);
  const authorization = bridgeExternalStartupProof, manifest = object(context.guard.verify());
  if (canonical(manifest.bridgeExternalStartupProof) !== canonical(authorization)
    || typeof manifest.externalStartupProofDirectory !== 'string'
    || context.guard.digest === authorization.previousExecutableDigest) refuse();
  const attempt = readEvidence(join(context.directory, 'startup-packaging-attempt.json'));
  const outcome = readEvidence(join(context.directory, 'startup-packaging-result.json'));
  const previousAnchor = { ...anchor(context), executableDigest: authorization.previousExecutableDigest };
  const expectedAttempt = { anchor: previousAnchor, kind: 'startup-packaging-attempt',
    authorization: bridgePackagedPreHttpContinuation, state: 'unknown' };
  const expectedOutcome = { anchor: previousAnchor, kind: 'startup-packaging-result',
    attemptDigest: sha256(canonical(expectedAttempt)), result: { stage: 'startup', category: 'refused' } };
  if (canonical(attempt.value) !== canonical(expectedAttempt) || canonical(outcome.value) !== canonical(expectedOutcome)
    || attempt.identity.sha256 !== authorization.previousAttemptFileDigest
    || outcome.identity.sha256 !== authorization.previousResultFileDigest) refuse();
  // The old startup refusal remains unchanged and ambiguous; only the independently accepted proof authorizes promotion.
  const bytes = readArtifactFile(manifest.externalStartupProofDirectory, authorization.receiptName);
  if (bytes.length > 65536 || sha256(bytes) !== authorization.receiptDigest) refuse();
  const receipt: unknown = JSON.parse(bytes.toString('utf8'));
  const expected = { version: 1, run: { status: 'completed', conclusion: 'success',
    headSha: authorization.workflowRevision, event: 'workflow_dispatch',
    url: `https://github.com/khuonghuyhieu/esty-admin/actions/runs/${authorization.workflowRun}` },
    probe: { status: 200, configDigestMatch: true, bodyStatus: 'ok', identity: {
      repository: 'khuonghuyhieu/esty-admin', workflow: '.github/workflows/be-candidate-probe.yml',
      candidate: target.candidate, origin: target.origin, path: '/health/live', revision: target.revision,
      tree: target.tree, sourceDigest: target.sourceDigest, artifactDigest: target.artifactDigest,
      packetDigest: target.packetDigest, configDigest: target.configDigest, activationRun: target.activationRun,
      project: target.project, scope: target.scope, workflowRevision: authorization.workflowRevision,
      workflowRun: authorization.workflowRun } } };
  if (canonical(receipt) !== canonical(expected)) refuse();
  return { sourceReceiptDigest: authorization.receiptDigest, receipt };
}
function unpromotedRecoveryFiles(context: RecoveryContext): void {
  if (canonical(readdirSync(context.directory).sort()) !== canonical([
    'startup-attempt.json', 'startup-correction-result.json', 'startup-correction.json',
    'startup-packaging-attempt.json', 'startup-packaging-result.json', 'startup-result.json'])) refuse();
}
export async function promoteBridgeRecovery(context: RecoveryContext, io: RecoveryIo, signal: AbortSignal) {
  inspectBridgeRecoveryOriginal(context); privateDirectory(context.directory, false); signal.throwIfAborted();
  unpromotedRecoveryFiles(context);
  const proof = externalStartupProof(context), authorization = bridgeExternalStartupProof;
  await inspectRemote(context, io, authorization.workflowRevision, authorization.workflowTree);
  context.guard.verify(); signal.throwIfAborted();
  unpromotedRecoveryFiles(context); externalStartupProof(context);
  // The imported proof and exclusive intent are one append before the sole promotion command.
  const intent = { anchor: anchor(context), kind: 'promotion-intent', startupProofDigest: sha256(canonical(proof)),
    importedStartupProof: proof, authorization, state: 'unknown' };
  record(context, 'promotion-intent.json', intent);
  let outcome: 'acknowledged' | 'unknown' = 'unknown';
  try {
    context.guard.verify(); signal.throwIfAborted();
    const result = await io.promote();
    if (result.code !== 0 || result.aborted) refuse();
    await candidate(io); await alias(io, target.candidate); inspectBridgeRecoveryOriginal(context);
    outcome = 'acknowledged';
  } catch { /* The separate original UNKNOWN and the new promotion intent remain immutable. */ }
  record(context, 'promotion-result.json', { anchor: anchor(context), kind: 'promotion-result',
    intentDigest: sha256(canonical(intent)), outcome, deploymentId: target.candidate });
  return { stage: 'promotion' as const, outcome, deploymentId: target.candidate, originalHistory: 'unchanged' as const, beAccepted: false };
}
