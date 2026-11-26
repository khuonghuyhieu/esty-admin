import { mkdtemp } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, removeArtifactTree, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { verifyActivationArtifact } from './activation-journal.js';
import type { ActivationPacket } from './activation-journal.js';
import { failedPreflightProof, validateRetainedArtifactArchive, validateAuthorizationProducerArchive,
  validateAuthorizationReceiptArchive, completedEtsyRecovery } from './activation-preflight-disposition.mjs';
import { retainedActivation, retainedHistoricalArchive } from './activation-retained.mjs';
import { extractRoutineBundle, verifyRoutineBundle } from './routine-retained.mjs';
import { verifyHistoricalFinalAcceptance, validateHistoricalPreimages, validateHistoricalRecord } from './activation-held-proof.js';
import { heldAppPolicy, heldD2 } from './activation-held-contract.mjs';
import { historicalReleaseEvidence as evidence } from './historical-release-evidence.js';
import type { ReleaseRequest } from './ci-delivery.js';
import { validateReleaseRequest, validateReleaseResult } from './ci-delivery.js';
import type { ChecksDiagnostics } from './checks-diagnostics.js';
import { verifyCompletedEtsyRecovery } from './etsy-release.js';
import completedRecoveryReceipt from '../config/completed-etsy-recovery-receipt.json' with { type: 'json' };

export const historicalHandoffDigest = sha256(canonical({ evidence, retention: retainedHistoricalArchive }));
export interface HistoricalItem { entry: Record<string, unknown>; status: Record<string, unknown> }
export interface HistoricalIo {
  read(path: string): Promise<unknown>;
  download(id: number, maximum?: number): Promise<Buffer>;
  downloadReleaseAsset?(id: number): Promise<Buffer>;
  diagnostics?: ChecksDiagnostics;
}
export interface HistoricalPredecessor {
  id: string; revision: string; tree: string; artifactDigest: string; sourceDigest: string; configDigest: string;
}
export interface HistoricalMarker {
  version: 1; evidenceDigest: string; predecessorRecord: number | null; predecessor: HistoricalPredecessor;
}
export interface HistoricalAdmission {
  marker: HistoricalMarker; artifact?: VerifiedArtifact; recheck(): Promise<void>; dispose(): Promise<void>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Historical handoff object is unavailable.');
  return value as Record<string, unknown>;
}
function requireProof(condition: boolean, check: string): asserts condition {
  if (!condition) throw new Error(`Historical handoff refused: ${check}.`);
}
function equal(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
export function historicalRecordId(id: unknown): boolean { return id === evidence.accepted.id || id === evidence.failed.id; }

export function historicalSnapshot(items: readonly HistoricalItem[]): string {
  return canonical(items.map(({ entry, status }) => ({ id: entry.id, sha: entry.sha, task: entry.task, environment: entry.environment,
    production_environment: entry.production_environment, payload: entry.payload,
    status: Object.fromEntries(['id', 'state', 'created_at', 'description', 'log_url', 'environment_url'].map(key => [key, status[key]])) })));
}
function firstPredecessor(): HistoricalPredecessor {
  return { id: heldD2.candidate, revision: heldAppPolicy.revision, tree: heldAppPolicy.tree, artifactDigest: heldAppPolicy.artifactDigest,
    sourceDigest: heldAppPolicy.sourceDigest, configDigest: heldD2.configDigest };
}
function bindPredecessor(request: ReleaseRequest, expected: HistoricalPredecessor, before: ReleaseRequest['schema']['before']): void {
  requireProof(equal(request.schema.before, before) && request.schema.beforeDigest === sha256(JSON.stringify(before)), 'before-schema');
  if (request.migration) requireProof(equal(request.migration.predecessor, { id: expected.id, revision: expected.revision,
    artifactDigest: expected.artifactDigest, configDigest: expected.configDigest }), 'approved-predecessor');
}
interface ConsumedHandoff { id: number; predecessor: HistoricalPredecessor; request: ReleaseRequest }
export interface CompletedRecoveryAdmission {
  consumed: ConsumedHandoff; resolved: ReadonlySet<number>; recheck(): Promise<void>;
}
async function consumedPredecessor(items: readonly HistoricalItem[], io: HistoricalIo,
  refused: ReadonlyMap<number, FailedAuthorizationAdmission>, completed?: CompletedRecoveryAdmission): Promise<ConsumedHandoff | undefined> {
  const marked = items.filter(item => !historicalRecordId(item.entry.id) && item.entry.payload !== null
    && typeof item.entry.payload === 'object' && Object.hasOwn(item.entry.payload, 'historicalHandoff')
    && !completed?.resolved.has(Number(item.entry.id)));
  let previous: ConsumedHandoff | undefined;
  for (const item of [...marked].reverse()) {
    const id = item.entry.id, p = object(item.entry.payload), marker = object(p.historicalHandoff);
    const request = validateReleaseRequest(p.releaseRequest, { version: 1, requestDigest: p.requestDigest });
    const noEffect = typeof id === 'number' ? refused.get(id) : undefined;
    requireProof(typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && (item.status.state === 'success' || noEffect !== undefined)
      && item.entry.task === 'deploy:esty-be-ci' && item.entry.environment === 'be-production' && item.entry.production_environment === true
      && p.version === 1 && request.target === retainedActivation.target && p.migrationPacket === request.migration?.packetDigest
      && marker.version === 1 && marker.evidenceDigest === historicalHandoffDigest
      && equal(Object.keys(marker).sort(), ['version', 'evidenceDigest', 'predecessorRecord', 'predecessor'].sort())
      && request.historicalHandoffDigest === historicalHandoffDigest
      && item.entry.sha === request.controller.revision && p.revision === request.controller.revision && p.tree === request.controller.tree
      && p.run === request.controller.run && p.artifact === request.artifactDigest && p.sourceDigest === request.sourceDigest
      && p.configDigest === request.configDigest && p.migrationDigest === request.schema.targetDigest
      && p.project === heldAppPolicy.project, 'consumed-request');
    requireProof(marker.predecessorRecord === (previous?.id ?? null), 'consumed-lineage');
    requireProof(equal(marker.predecessor, previous?.predecessor ?? firstPredecessor()), 'consumed-predecessor');
    if (previous) bindPredecessor(request, previous.predecessor, previous.request.schema.target);
    else requireProof(request.schema.beforeDigest === '149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3'
      && request.migration !== null && equal(request.migration.predecessor, { id: heldD2.candidate, revision: heldAppPolicy.revision,
        artifactDigest: heldAppPolicy.artifactDigest, configDigest: heldD2.configDigest }), 'consumed-origin');
    if (noEffect) {
      requireProof(noEffect.marker.recordDigest === sha256(historicalSnapshot([item])), 'refused-lineage-binding');
      continue; // A verified refusal retains its predecessor; it never consumes a successful handoff.
    }
    if (completed?.consumed.id === id) {
      requireProof(equal(request, completed.consumed.request), 'completed-consumed-request');
      previous = completed.consumed;
      continue;
    }
    const statuses: unknown = await io.read(`/deployments/${id}/statuses?per_page=100`);
    requireProof(Array.isArray(statuses) && statuses.length > 0 && statuses.length < 100 && equal(statuses[0], item.status), 'consumed-status-readback');
    const ids = [...new Set(statuses.map(object).flatMap(row => {
      const description = row.description;
      return typeof description === 'string' && /^ack:dpl_[A-Za-z0-9]{1,124}$/.test(description) ? [description.slice(4)] : [];
    }))];
    const deployment = ids[0];
    requireProof(typeof deployment === 'string' && ids.length === 1 && (item.status.description === `accepted:${deployment}`
      || (request.mode === 'etsy-strict-cutover' && typeof item.status.description === 'string'
        && /^strict:accepted:[a-f0-9]{64}$/.test(item.status.description))), 'consumed-terminal');
    previous = { id, request, predecessor: { id: deployment, revision: request.controller.revision,
      tree: request.controller.tree, artifactDigest: request.artifactDigest, sourceDigest: request.sourceDigest, configDigest: request.configDigest } };
  }
  return previous;
}
// Metadata stability only; this reader does not grant historical admission.
export function historicalMetadataReadback(io: HistoricalIo, signal: AbortSignal) {
  const releasePath = `/releases/tags/${retainedHistoricalArchive.tag}`, snapshots = new Map<string, string>();
  const proofIo: HistoricalIo = { diagnostics: io.diagnostics, download: (id, maximum) => io.download(id, maximum), async read(path) {
    signal.throwIfAborted();
    const value = await io.read(path);
    if (/^\/(?:actions|deployments|commits|contents|git|releases)\//.test(path)) {
      let stable = value;
      if (path === releasePath) {
        const release = object(value);
        requireProof(Array.isArray(release.assets) && release.assets.length === 1, 'retention-unique-asset');
        // Download counters change during this read-only operation; byte/publication identity must not.
        stable = { ...release, assets: release.assets.map(raw => {
          const { download_count: _downloads, ...identity } = object(raw);
          return identity;
        }) };
      }
      const encoded = canonical(stable), prior = snapshots.get(path);
      requireProof(prior === undefined || prior === encoded, 'proof-metadata-stable');
      snapshots.set(path, encoded);
    }
    return value;
  } };
  const recheck = async () => {
    for (const path of snapshots.keys()) await proofIo.read(path);
  };
  return { proofIo, recheck };
}

// Admission is scoped to this completed recovery, never a general forgiveness of
// unresolved history. Its committed migration remains an acknowledged 3→4 change.
export async function proveCompletedRecovery(items: readonly HistoricalItem[], request: ReleaseRequest,
  io: HistoricalIo, signal: AbortSignal): Promise<CompletedRecoveryAdmission | undefined> {
  const pin = completedEtsyRecovery;
  if (!items.some(item => item.entry.id === pin.journal)) return undefined;
  requireProof(request.mode === 'current-schema-only' && request.migration === null, 'completed-ordinary-only');
  const { proofIo, recheck } = historicalMetadataReadback(io, signal);
  let position = -1;
  for (const [rawId, recordDigest, statusesDigest] of pin.lineage) {
    const id = Number(rawId), matches = items.filter(item => item.entry.id === id), item = matches[0];
    requireProof(matches.length === 1 && item !== undefined && items.indexOf(item) > position, 'completed-full-lineage');
    position = items.indexOf(item);
    const record = await proofIo.read(`/deployments/${id}`), statuses = await proofIo.read(`/deployments/${id}/statuses?per_page=100`);
    requireProof(equal(record, item.entry) && sha256(canonical(record)) === recordDigest
      && Array.isArray(statuses) && statuses.length > 0 && statuses.length < 100 && equal(statuses[0], item.status)
      && sha256(canonical(statuses)) === statusesDigest, 'completed-immutable-history');
  }
  const run = object(await proofIo.read(`/actions/runs/${pin.run}`));
  const jobs = object(await proofIo.read(`/actions/runs/${pin.run}/jobs?filter=all&per_page=100`));
  requireProof(sha256(canonical(run)) === pin.runDigest && sha256(canonical(jobs)) === pin.jobsDigest
    && run.status === 'completed' && run.conclusion === 'success', 'completed-protected-run');
  // Source-retained bytes outlive Actions retention; all remote execution and
  // lineage proofs remain mandatory. The raw verifier pins the entire ZIP.
  requireProof(typeof completedRecoveryReceipt.zipBase64 === 'string'
    && completedRecoveryReceipt.zipBase64.length <= 174764, 'completed-durable-receipt'); // Base64 bound for a 128 KiB ZIP.
  const verified = verifyCompletedEtsyRecovery(Buffer.from(completedRecoveryReceipt.zipBase64, 'base64'));
  const entry = items.find(item => item.entry.id === pin.journal)!;
  const statuses = await proofIo.read(`/deployments/${pin.journal}/statuses?per_page=100`) as Record<string, unknown>[];
  const workflow = object(await proofIo.read(`/contents/.github/workflows/be-delivery.yml?ref=${verified.request.controller.revision}`));
  requireProof(equal(object(entry.entry.payload).releaseRequest, verified.request)
    && run.head_sha === verified.request.controller.revision && workflow.encoding === 'base64' && typeof workflow.content === 'string'
    && sha256(Buffer.from(workflow.content, 'base64')) === pin.workflowDigest
    && equal([...statuses].reverse().map(row => row.description), verified.descriptions), 'completed-final-binding');
  bindPredecessor(request, verified.predecessor, verified.request.schema.target);
  return { consumed: { id: pin.journal, request: verified.request, predecessor: verified.predecessor },
    resolved: new Set(pin.lineage.slice(1).map(row => Number(row[0]))), recheck };
}

export async function proveHistoricalHandoff(items: readonly HistoricalItem[], request: ReleaseRequest, io: HistoricalIo,
  signal: AbortSignal, refused: ReadonlyMap<number, FailedAuthorizationAdmission> = new Map(),
  completed?: CompletedRecoveryAdmission): Promise<HistoricalAdmission> {
  validateHistoricalPreimages(); signal.throwIfAborted();
  requireProof(request.historicalHandoffDigest === historicalHandoffDigest && request.target === retainedActivation.target, 'request-evidence-binding');
  const accepted = items.filter(item => item.entry.id === evidence.accepted.id), failed = items.filter(item => item.entry.id === evidence.failed.id);
  const acceptedRecord = accepted[0], failedRecord = failed[0];
  requireProof(accepted.length === 1 && failed.length === 1 && acceptedRecord !== undefined && failedRecord !== undefined, 'both-records-present');
  validateHistoricalRecord(acceptedRecord); validateHistoricalRecord(failedRecord);
  const retention = retainedHistoricalArchive, releasePath = `/releases/tags/${retention.tag}`;
  const api = `https://api.github.com/repos/${retention.repository}`;
  const { proofIo, recheck } = historicalMetadataReadback(io, signal);
  const consumed = await consumedPredecessor(items, proofIo, refused, completed);
  if (consumed) {
    bindPredecessor(request, consumed.predecessor, consumed.request.schema.target);
    return { marker: { version: 1, evidenceDigest: historicalHandoffDigest, predecessorRecord: consumed.id,
      predecessor: consumed.predecessor }, recheck, async dispose() {} };
  }
  const release = object(await proofIo.read(releasePath));
  requireProof(typeof release.id === 'number' && Number.isSafeInteger(release.id) && release.id > 0
    && release.url === `${api}/releases/${release.id}` && release.assets_url === `${api}/releases/${release.id}/assets`
    && release.html_url === `https://github.com/${retention.repository}/releases/tag/${retention.tag}`
    && release.tag_name === retention.tag && release.target_commitish === retention.publicationTarget
    && release.draft === false && release.prerelease === false
    && typeof release.published_at === 'string' && Number.isFinite(Date.parse(release.published_at))
    && Date.parse(release.published_at) <= Date.now(), 'retention-publication');
  requireProof(Array.isArray(release.assets) && release.assets.length === 1, 'retention-unique-asset');
  const asset = object(release.assets[0]);
  requireProof(typeof asset.id === 'number' && Number.isSafeInteger(asset.id) && asset.id > 0
    && asset.url === `${api}/releases/assets/${asset.id}`
    && asset.browser_download_url === `https://github.com/${retention.repository}/releases/download/${retention.tag}/${retention.asset}`
    && asset.name === retention.asset && asset.state === 'uploaded' && asset.content_type === 'application/zip'
    && asset.size === retention.size && asset.digest === `sha256:${retention.zipDigest}`, 'retention-asset');
  const ref = object(await proofIo.read(`/git/ref/tags/${retention.tag}`)), tag = object(ref.object);
  requireProof(ref.ref === `refs/tags/${retention.tag}` && ref.url === `${api}/git/refs/tags/${retention.tag}`
    && tag.type === 'commit' && tag.sha === retention.revision && tag.url === `${api}/git/commits/${retention.revision}`, 'retention-tag');
  const source = object(await proofIo.read(`/commits/${retention.revision}`));
  requireProof(source.sha === retention.revision && object(object(source.commit).tree).sha === heldAppPolicy.tree, 'retention-source');
  const producer = object(await proofIo.read(`/actions/runs/${retainedActivation.runId}`));
  requireProof(String(producer.id) === retainedActivation.runId && producer.run_attempt === 1 && producer.status === 'completed'
    && producer.head_sha === retention.revision && producer.head_branch === 'main' && ['push', 'workflow_dispatch'].includes(String(producer.event))
    && [retainedActivation.workflowPath, `${retainedActivation.workflowPath}@main`, `${retainedActivation.workflowPath}@refs/heads/main`].includes(String(producer.path))
    && object(producer.repository).full_name === retention.repository && object(producer.head_repository).full_name === retention.repository, 'retention-producer');
  const jobs = object(await proofIo.read(`/actions/runs/${retainedActivation.runId}/jobs?filter=all&per_page=100`));
  requireProof(Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length && jobs.jobs.length <= 100, 'retention-jobs');
  const checks = jobs.jobs.map(object).filter(job => String(job.id) === retainedActivation.checksJobId);
  requireProof(checks.length === 1 && checks[0]!.name === 'BE required checks' && checks[0]!.status === 'completed'
    && checks[0]!.conclusion === 'success' && String(checks[0]!.run_id) === retainedActivation.runId
    && checks[0]!.run_attempt === 1 && checks[0]!.head_sha === retention.revision, 'retention-checks');
  requireProof(typeof io.downloadReleaseAsset === 'function', 'retention-transport');
  const zip = await io.downloadReleaseAsset(asset.id); signal.throwIfAborted();
  requireProof(zip.length === retention.size, 'retention-byte-count');
  const archive = io.diagnostics
    ? io.diagnostics.sync('github.archive.retained', () => validateRetainedArtifactArchive(zip, io.diagnostics))
    : validateRetainedArtifactArchive(zip);
  const root = await mkdtemp(join(realpathSync(tmpdir()), 'esty-historical-proof-'));
  const dispose = () => removeArtifactTree(root);
  try {
    const bundle = await extractRoutineBundle(archive, retainedActivation.archiveDigest, join(root, 'bundle'), true);
    const artifact = verifyArtifact(join(bundle, 'artifact'), heldAppPolicy.artifactDigest, { revision: heldAppPolicy.revision,
      repository: `https://github.com/${retainedActivation.repository}`,
      migrationDigest: '149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3', release: true });
    requireProof(artifact.manifest.source.tree === heldAppPolicy.tree && artifact.manifest.source.digest === heldAppPolicy.sourceDigest, 'legacy-artifact-source');
    const proof = await failedPreflightProof(proofIo, failedRecord.entry, (packet: ActivationPacket) => verifyActivationArtifact(artifact, packet));
    requireProof(equal(proof, evidence.failed.proof), 'failed-proof');
    await verifyHistoricalFinalAcceptance({ revision: request.controller.revision, tree: request.controller.tree }, proofIo, signal);
    const predecessor = firstPredecessor(); bindPredecessor(request, predecessor, artifact.manifest.migrations);
    requireProof(request.migration !== null, 'historical-migration-required');
    await recheck(); signal.throwIfAborted();
    return { artifact, marker: { version: 1, evidenceDigest: historicalHandoffDigest, predecessorRecord: null, predecessor }, recheck, dispose };
  } catch (cause) {
    try { await dispose(); }
    catch (cleanup) { throw new AggregateError([cause, cleanup], 'Historical handoff proof and temporary evidence cleanup failed.', { cause }); }
    throw cause;
  }
}

export interface FailedAuthorizationAdmission {
  marker: {
    version: 1; kind: 'failed-authorization-no-effects' | 'failed-read-only-history-no-effects'; journal: number; requestDigest: string;
    packetDigest: string; recordDigest: string; statusesDigest: string; sourcePolicy: 'current' | 'reviewed-legacy' | 'reviewed-history';
    workflowDigest: string; producerZipDigest: string; receiptArtifact: number; receiptZipDigest: string;
    receiptArchiveDigest: string; receiptInventoryDigest: string; outcomeHead: string; outcomeCount: number;
  };
  consumed?: true;
  recheck(): Promise<void>;
}
// Reviewed source identities, never incident run/journal/artifact IDs or caller-selected authority.
const authorizationWorkflowDigest = 'c9cd73e744ff32998b9874d0782480bc2c2eff1c92d1ec00f1be5d189ef89a53';
const authorizationLegacy = Object.freeze({
  revision: '5b038868fb636ad98d2d46a5c1ae3c089510ef4d', tree: '9afb8fd6329c2cc271e67b896d2b2b5afa2b45d1',
  source: '1bc2ea6eb7a1789fc00b1f3eb896a67d168a5044d5e0bd95e0dfc41abe3559a2',
  artifact: '259cc1cdafca81b51534f5164d1fbe51664638346e2b6602672932c029c9031d',
  operator: '3d2c5c3ea3d0a3f7b032f1de6c59639333b45050d5416337b3c8a922add0020d',
});
// These reviewed operators only connect, BEGIN READ ONLY, read history and COMMIT on the history route.
// Their complete producer closures are verified below as data; no archived code is executed.
const readOnlyHistoryLegacy = Object.freeze([
  Object.freeze({
    revision: '633e9d788722e6a8b7843cb6ac46d62e8dcb7690', tree: '0f4e03fe46d10309f873678115abfc5a7624b8e1',
    source: 'd9ef11eeb2de8ea5581834b98f5825613c024f6d40349fbb1a211b6951b68448',
    artifact: '17e8777c8428f3c4496bed6e9b26617d342af0a2ed1f20a37103ceb537170356',
    operator: 'a91a4248726fc179e7605b9ba0e7f1b0e768e6b0d68b8daec890fc352cda0732',
  }),
  Object.freeze({
    revision: '818c9f01dac34879cb2363b7c0eade58b7233ae7', tree: 'f8d6a8906a35d0cf50abb6e04bd534b758099ec5',
    source: '9cb46fae95823accad521a16f30051b2b60d6dcbc93c1e0e83b924ab9a4838e6',
    artifact: 'e3c550b52707afe53de36b961ea1a3a31bd89c358b11faa8ae52951ed04bd2c0',
    operator: 'cabdb9e96a1180a5296138d578e0f79344e4500255f810cac71a3580320ab62f',
  }),
]);
function operatorDigest(artifact: VerifiedArtifact): string {
  return sha256(canonical({
    files: artifact.manifest.files.filter(file => file.path.startsWith('operator/')).map(file => ({ ...file, path: file.path.slice(9) })),
    directories: artifact.manifest.directories.filter(dir => dir.path.startsWith('operator/')).map(dir => ({ ...dir, path: dir.path.slice(9) })),
  }));
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function timestamp(value: unknown): number {
  requireProof(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value)), 'authorization-timestamp');
  return Date.parse(value);
}
const authorizationSteps = [
  ['Set up job', 'success'],
  ['Check out the same published controller without persisted credentials', 'success'],
  ['Set exact delivery runtime without application installation', 'success'],
  ["Download only this run's verified immutable relay", 'success'],
  ['Reverify approved relay and exact controller/operator before executing bundle code', 'success'],
  ['Bootstrap independently verified public CLI before provider secrets', 'success'],
  ['Reserve the common durable exclusion and authorize the explicit migration mode', 'failure'],
  ['Inspect exactly strict three-entry history in the SQL-only worker', 'skipped'],
  ['Create held strict4 once and authorize SQL only after exact pending readiness', 'skipped'],
  ['Apply only the approved new suffix in the SQL-only worker', 'skipped'],
  ['Confirm durable SQL outcome when selected and accept the same exact deployment', 'skipped'],
  ['Preserve private receipt modes and record the exact transferable inventory', 'success'],
  ['Retain sanitized receipts without secret-bearing subprocess logs', 'success'],
  ['Summarize production boundaries without private output', 'success'],
  ['Retain public production diagnostics on every outcome', 'success'],
  ['Disclose production diagnostic upload loss', 'success'],
  ['Post Set exact delivery runtime without application installation', 'skipped'],
  ['Post Check out the same published controller without persisted credentials', 'success'],
  ['Complete job', 'success'],
] as const;
const readOnlyHistorySteps = authorizationSteps.map(([name, conclusion], index) =>
  [name, index === 6 ? 'success' : index === 7 ? 'failure' : conclusion]);
export async function proveFailedAuthorization(item: HistoricalItem, current: VerifiedArtifact,
  io: HistoricalIo, signal: AbortSignal): Promise<FailedAuthorizationAdmission> {
  const { proofIo, recheck: metadataRecheck } = historicalMetadataReadback(io, signal);
  const readOnlyHistory = item.status.state === 'in_progress';
  const p = object(item.entry.payload), request = validateReleaseRequest(p.releaseRequest, { version: 1, requestDigest: p.requestDigest });
  const journal = item.entry.id, repository = retainedActivation.repository, workflow = retainedActivation.workflowPath;
  requireProof(positive(journal) && (readOnlyHistory || item.status.state === 'error') && request.mode === 'etsy-strict-cutover'
    && request.target === retainedActivation.target && request.migration !== null
    && item.entry.task === 'deploy:esty-be-ci' && item.entry.environment === 'be-production' && item.entry.production_environment === true
    && item.entry.sha === request.controller.revision && p.version === 1 && p.revision === request.controller.revision
    && p.run === request.controller.run && p.tree === request.controller.tree && p.artifact === request.artifactDigest
    && p.sourceDigest === request.sourceDigest && p.configDigest === request.configDigest && p.project === heldAppPolicy.project
    && p.migrationDigest === request.schema.targetDigest && p.migrationPacket === request.migration.packetDigest
    && request.controller.revision === request.producer.revision && request.controller.tree === request.producer.tree
    && request.controller.run !== request.producer.run, 'authorization-journal-binding');
  const source = current.manifest.source;
  const isCurrent = request.artifactDigest === current.digest && request.sourceDigest === source.digest
    && request.controller.revision === source.revision && request.controller.tree === source.tree
    && request.operatorDigest === operatorDigest(current);
  const reviewed = readOnlyHistory
    ? readOnlyHistoryLegacy.find(profile => profile.revision === request.controller.revision) : authorizationLegacy;
  const isLegacy = reviewed !== undefined && request.artifactDigest === reviewed.artifact && request.sourceDigest === reviewed.source
    && request.controller.revision === reviewed.revision && request.controller.tree === reviewed.tree
    && request.operatorDigest === reviewed.operator;
  requireProof(isCurrent || isLegacy, 'authorization-reviewed-source');
  const historyIntent = readOnlyHistory ? { packetDigest: request.migration.packetDigest, phase: 'history', previous: null, deploymentId: null } : undefined;
  const historyDescription = readOnlyHistory ? `strict:history:intent:${sha256(canonical({ requestDigest: p.requestDigest, intent: historyIntent }))}` : '';
  const remote = object(await proofIo.read(`/deployments/${journal}`));
  requireProof(equal(remote, item.entry), 'authorization-journal-readback');
  const statuses = await proofIo.read(`/deployments/${journal}/statuses?per_page=100`);
  requireProof(Array.isArray(statuses) && statuses.length === 2 && equal(statuses[0], item.status), 'authorization-complete-statuses');
  const terminal = object(statuses[0]), reserved = object(statuses[1]);
  requireProof((readOnlyHistory ? terminal.state === 'in_progress' && terminal.description === historyDescription
    : terminal.state === 'error' && terminal.description === 'strict:unresolved')
    && reserved.state === 'in_progress' && reserved.description === `strict:reserved:${p.requestDigest}`
    && positive(terminal.id) && positive(reserved.id) && terminal.id > reserved.id
    && statuses.every(raw => { const s = object(raw); return s.log_url === `https://github.com/${repository}/actions/runs/${request.controller.run}`
      && s.environment_url === 'https://api.lovora.us'; }), 'authorization-status-effects');
  const run = object(await proofIo.read(`/actions/runs/${request.controller.run}`));
  const producer = object(await proofIo.read(`/actions/runs/${request.producer.run}`));
  const repositoryId = object(run.repository).id;
  requireProof(positive(repositoryId) && positive(run.workflow_id) && run.workflow_id === producer.workflow_id, 'authorization-workflow-identity');
  for (const [value, identity, failed] of [[run, request.controller, true], [producer, request.producer, false]] as const) {
    requireProof(positive(value.id) && String(value.id) === identity.run && value.run_attempt === 1 && value.status === 'completed'
      && value.conclusion === (failed ? 'failure' : 'success') && value.head_sha === identity.revision && value.head_branch === 'main'
      && value.path === workflow && (failed ? value.event === 'workflow_dispatch' : ['push', 'workflow_dispatch'].includes(String(value.event)))
      && object(value.repository).full_name === repository && object(value.head_repository).full_name === repository
      && object(value.repository).id === repositoryId && object(value.head_repository).id === repositoryId, 'authorization-run');
  }
  const commit = object(await proofIo.read(`/commits/${request.controller.revision}`));
  requireProof(commit.sha === request.controller.revision && object(object(commit.commit).tree).sha === request.controller.tree, 'authorization-tree');
  const file = object(await proofIo.read(`/contents/${workflow}?ref=${request.controller.revision}`));
  requireProof(file.type === 'file' && file.path === workflow && file.encoding === 'base64'
    && typeof file.content === 'string' && file.content.length <= 256 * 1024, 'authorization-workflow-content');
  const workflowBytes = Buffer.from(file.content.replace(/\n/g, ''), 'base64');
  requireProof(workflowBytes.toString('base64') === file.content.replace(/\n/g, '') && workflowBytes.length === file.size
    && sha256(workflowBytes) === authorizationWorkflowDigest, 'authorization-workflow-source');
  const jobsFor = async (identity: ReleaseRequest['controller'], failed: boolean) => {
    const listing = object(await proofIo.read(`/actions/runs/${identity.run}/jobs?filter=all&per_page=100`));
    requireProof(Array.isArray(listing.jobs) && listing.total_count === listing.jobs.length && listing.jobs.length === 6, 'authorization-complete-jobs');
    const jobs = listing.jobs.map(object), expected = new Map<string, string>([
      ['BE required checks', failed ? 'skipped' : 'success'], ['BE completion', failed ? 'failure' : 'success'],
      ['BE production delivery', failed ? 'failure' : 'skipped'],
      ['Select an approved checked routine bundle', failed ? 'success' : 'skipped'],
      ['Activate the owner-approved retained bundle', 'skipped'], ['Select the owner-approved retained activation bundle', 'skipped'],
    ]);
    requireProof(new Set(jobs.map(job => job.id)).size === 6 && new Set(jobs.map(job => job.name)).size === 6
      && jobs.every(job => typeof job.name === 'string' && expected.has(job.name)
        && (job.conclusion === 'success' || job.conclusion === 'failure' || job.conclusion === 'skipped')
        && positive(job.id) && String(job.run_id) === identity.run && job.run_attempt === 1
        && job.head_sha === identity.revision && job.status === 'completed' && expected.get(job.name) === job.conclusion), 'authorization-job-identity');
    return jobs;
  };
  const jobs = await jobsFor(request.controller, true), producerJobs = await jobsFor(request.producer, false);
  const production = jobs.find(job => job.name === 'BE production delivery')!, retrieval = jobs.find(job => job.name === 'Select an approved checked routine bundle')!;
  const checks = producerJobs.find(job => job.name === 'BE required checks')!;
  const expectedSteps = readOnlyHistory ? readOnlyHistorySteps : authorizationSteps;
  requireProof(Array.isArray(production.steps) && production.steps.every(step => object(step).status === 'completed')
    && equal(production.steps.map(step => { const s = object(step); return [s.name, s.conclusion]; }), expectedSteps), 'authorization-before-effects');
  for (const [job, required] of [[retrieval, ['Authenticate consumer and successful producer before retrieval',
    'Check independent approval and archive before safe extraction and full closure verification',
    'Relay unchanged approved bytes and bounded request receipts']], [checks, ['Compile exact API source',
    'Build native artifact and require functional plus actual HTTP-to-test-DB checks', 'Retain one immutable mode-preserving tested bundle']]] as const) {
    requireProof(Array.isArray(job.steps) && job.steps.length > 0 && job.steps.length < 100, 'authorization-successful-steps');
    const steps = job.steps.map(object);
    requireProof(new Set(steps.map(step => step.name)).size === steps.length
      && steps.every(step => step.status === 'completed' && step.conclusion === 'success')
      && required.every(name => steps.some(step => step.name === name)), 'authorization-successful-checks');
  }
  requireProof(timestamp(producer.updated_at) <= timestamp(run.created_at)
    && timestamp(reserved.created_at) >= timestamp(production.started_at)
    && timestamp(terminal.created_at) >= timestamp(reserved.created_at)
    && timestamp(terminal.created_at) <= timestamp(production.completed_at), 'authorization-effect-window');
  const expirations: number[] = [];
  const artifactFor = async (identity: ReleaseRequest['controller'], job: Record<string, unknown>, name: string, maximum: number) => {
    const listing = object(await proofIo.read(`/actions/runs/${identity.run}/artifacts?per_page=100`));
    requireProof(Array.isArray(listing.artifacts) && listing.artifacts.length < 100 && listing.total_count === listing.artifacts.length, 'authorization-complete-artifacts');
    requireProof(listing.artifacts.every(raw => positive(object(raw).id))
      && new Set(listing.artifacts.map(raw => object(raw).id)).size === listing.artifacts.length, 'authorization-artifact-identities');
    const found = listing.artifacts.map(object).filter(artifact => artifact.name === name);
    requireProof(found.length === 1, 'authorization-unique-artifact');
    const artifact = found[0]!, binding = object(artifact.workflow_run);
    requireProof(positive(artifact.id) && positive(artifact.size_in_bytes) && artifact.size_in_bytes <= maximum
      && artifact.expired === false && typeof artifact.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(artifact.digest)
      && String(binding.id) === identity.run && binding.head_sha === identity.revision && binding.head_branch === 'main'
      && binding.repository_id === repositoryId && binding.head_repository_id === repositoryId
      && timestamp(artifact.created_at) >= timestamp(job.started_at) && timestamp(artifact.created_at) <= timestamp(job.completed_at)
      && timestamp(artifact.expires_at) > Date.now(), 'authorization-artifact');
    expirations.push(timestamp(artifact.expires_at));
    return artifact as Record<string, unknown> & { id: number; size_in_bytes: number; digest: string; expires_at: string };
  };
  const producerArtifact = await artifactFor(request.producer, checks, `be-tested-${request.producer.run}-1`, 64 * 1024 * 1024);
  requireProof(String(producerArtifact.id) === request.artifactId, 'authorization-producer-artifact');
  const receiptArtifact = await artifactFor(request.controller, production, `be-delivery-receipts-${request.controller.run}-1`, 65536);
  const producerZip = await proofIo.download(producerArtifact.id, 64 * 1024 * 1024);
  requireProof(producerZip.length === producerArtifact.size_in_bytes, 'authorization-producer-size');
  const packaged = validateAuthorizationProducerArchive(producerZip, producerArtifact.digest.slice(7), io.diagnostics);
  requireProof(equal(packaged.approval, { version: 1, mode: 'release', producer: request.producer,
    artifactDigest: request.artifactDigest, sourceDigest: request.sourceDigest, archiveDigest: request.archiveDigest,
    operatorDigest: request.operatorDigest, schemaDigest: request.schema.targetDigest }), 'authorization-packaged-approval');
  const context = { version: 1, controller: { revision: request.controller.revision, run: request.controller.run },
    producerRun: request.producer.run, artifactId: request.artifactId, mode: request.mode, approvalDigest: packaged.approvalDigest,
    configDigest: request.configDigest, schemaDigest: request.schema.targetDigest, target: request.target, packetDigest: request.migration.packetDigest };
  const selection = { version: 1, context, controllerTree: request.controller.tree, producer: request.producer,
    checksJobId: String(checks.id), artifact: { id: request.artifactId, zipDigest: producerArtifact.digest.slice(7),
      expiresAt: producerArtifact.expires_at }, selectedAt: new Date().toISOString() };
  const root = await mkdtemp(join(realpathSync(tmpdir()), 'esty-authorization-proof-'));
  try {
    const bundle = await extractRoutineBundle(packaged.archive, request.archiveDigest, join(root, 'bundle'));
    await verifyRoutineBundle(bundle, packaged.approval, selection, context, undefined);
  } finally { await removeArtifactTree(root); }
  const receiptZip = await proofIo.download(receiptArtifact.id);
  requireProof(receiptZip.length === receiptArtifact.size_in_bytes, 'authorization-receipt-size');
  const receipts = validateAuthorizationReceiptArchive(receiptZip, receiptArtifact.digest.slice(7), io.diagnostics, readOnlyHistory);
  const json = (name: string): unknown => {
    try { return JSON.parse(receipts.files.get(name).bytes.toString('utf8')); }
    catch { throw new Error('Historical handoff refused: authorization-receipt-json.'); }
  };
  requireProof(equal(json('strict/reserving.json'), { requestDigest: p.requestDigest, packetDigest: request.migration.packetDigest })
    && equal(json('strict/reservation.json'), { version: 1, requestDigest: p.requestDigest, packetDigest: request.migration.packetDigest, journal }),
  'authorization-local-reservation');
  if (readOnlyHistory) {
    const runId = receipts.runId, base = `strict/${runId}`, auth = object(json('strict/history.authorized.json'));
    const lock = object(json('strict/operator.lock'));
    requireProof(equal(json(`${base}/history.intent.json`), historyIntent)
      && equal(json(`${base}/STOP.json`), { packetDigest: request.migration.packetDigest, phase: 'history', outcome: 'unknown-or-refused' })
      && equal(json('strict/active.lock'), { packetDigest: request.migration.packetDigest, runId, phase: 'history' })
      && equal(Object.keys(lock).sort(), ['lease', 'packetDigest', 'runId'])
      && lock.packetDigest === request.migration.packetDigest && lock.runId === runId
      && typeof lock.lease === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(lock.lease), 'history-read-only-locks');
    requireProof(Number.isSafeInteger(auth.confirmedAt) && Number(auth.confirmedAt) >= timestamp(terminal.created_at)
      && Number(auth.confirmedAt) <= timestamp(production.completed_at)
      && equal(auth, { version: 1, requestDigest: p.requestDigest, packetDigest: request.migration.packetDigest,
        journal, phase: 'history', intent: historyIntent, description: historyDescription, confirmedAt: auth.confirmedAt }),
    'history-read-only-authorization');
  }
  let previous: string | null = null, authorizedHead: string | null = null;
  for (const [index, name] of (receipts.outcomes as string[]).entries()) {
    const event = object(json(name)), initialHistory = readOnlyHistory && index === 0;
    requireProof(equal(Object.keys(event).sort(), ['previous', 'requestDigest', 'result', 'terminal'])
      && event.previous === previous && event.requestDigest === p.requestDigest && event.terminal === !initialHistory, 'authorization-outcome-chain');
    const result = validateReleaseResult(event.result);
    const phaseMatches = initialHistory
      ? result.status === 'unknown' && result.stage === 'reserve' && result.category === 'outcome-unknown'
      : result.status === 'refused' && (readOnlyHistory ? result.stage === 'history'
        && (result.category === 'history-mismatch' || result.category === 'validation') : result.stage === 'reserve' && result.category === 'validation');
    requireProof(equal(result.request, request) && phaseMatches
      && result.evidence === 'confirmed' && result.nextAction === 'inspect-retained-evidence'
      && equal(result.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' })
      && result.deploymentId === null && result.migration === null && result.proof === null
      && result.receiptDigest === (readOnlyHistory && !initialHistory ? authorizedHead : null), 'authorization-no-effects');
    if (initialHistory) authorizedHead = sha256(receipts.files.get(name).bytes);
    previous = sha256(receipts.files.get(name).bytes);
  }
  const recheck = async () => {
    await metadataRecheck();
    requireProof(expirations.every(expires => expires > Date.now()), 'authorization-evidence-expired');
    signal.throwIfAborted();
  };
  await recheck();
  return { marker: { version: 1, kind: readOnlyHistory ? 'failed-read-only-history-no-effects' : 'failed-authorization-no-effects',
    journal, requestDigest: String(p.requestDigest), packetDigest: request.migration.packetDigest, recordDigest: sha256(historicalSnapshot([item])),
    statusesDigest: sha256(canonical(statuses)), sourcePolicy: isCurrent ? 'current' : readOnlyHistory ? 'reviewed-history' : 'reviewed-legacy',
    workflowDigest: authorizationWorkflowDigest, producerZipDigest: producerArtifact.digest.slice(7), receiptArtifact: receiptArtifact.id,
    receiptZipDigest: receiptArtifact.digest.slice(7), receiptArchiveDigest: receipts.archiveDigest,
    receiptInventoryDigest: receipts.inventoryDigest, outcomeHead: previous!, outcomeCount: receipts.outcomes.length }, recheck };
}

export async function proveFailedAuthorizations(items: readonly HistoricalItem[], current: VerifiedArtifact,
  io: HistoricalIo, signal: AbortSignal, completed?: CompletedRecoveryAdmission): Promise<Map<number, FailedAuthorizationAdmission>> {
  const journals = new Set<unknown>();
  for (const item of items) {
    requireProof(!journals.has(item.entry.id), 'authorization-unique-records');
    journals.add(item.entry.id);
  }
  const admissions = new Map<number, FailedAuthorizationAdmission>();
  const { proofIo, recheck } = historicalMetadataReadback(io, signal);
  // Only a complete, successful typed handoff may consume a disposition. The immutable
  // reservation payload binds its proof; the accepted remote outcome consumes that payload.
  // This is the same durable authority as consumedPredecessor, not an expired-artifact fallback.
  for (const [index, item] of items.entries()) {
    if (!item.entry.payload || typeof item.entry.payload !== 'object') continue;
    const payload = object(item.entry.payload);
    if (!Object.hasOwn(payload, 'noEffectDispositions')) continue;
    // A failed carrier is proved independently below; its marker is not consumption authority.
    if (item.status.state !== 'success') continue;
    requireProof(item.status.state === 'success' && Object.hasOwn(payload, 'historicalHandoff')
      && Array.isArray(payload.noEffectDispositions) && payload.noEffectDispositions.length > 0
      && payload.noEffectDispositions.length <= items.length, 'authorization-consumed-carrier');
    const consumedMarkers = payload.noEffectDispositions;
    const successor = validateReleaseRequest(payload.releaseRequest, { version: 1, requestDigest: payload.requestDigest });
    for (const value of consumedMarkers) {
      const marker = object(value);
      requireProof(equal(Object.keys(marker).sort(), ['version', 'kind', 'journal', 'requestDigest', 'packetDigest',
        'recordDigest', 'statusesDigest', 'sourcePolicy', 'workflowDigest', 'producerZipDigest', 'receiptArtifact',
        'receiptZipDigest', 'receiptArchiveDigest', 'receiptInventoryDigest', 'outcomeHead', 'outcomeCount'].sort())
        && marker.version === 1 && (marker.kind === 'failed-authorization-no-effects' || marker.kind === 'failed-read-only-history-no-effects')
        && positive(marker.journal) && positive(marker.receiptArtifact) && positive(marker.outcomeCount) && marker.outcomeCount <= 256
        && (marker.kind === 'failed-read-only-history-no-effects' ? marker.outcomeCount === 3
          && ['current', 'reviewed-history'].includes(String(marker.sourcePolicy)) : ['current', 'reviewed-legacy'].includes(String(marker.sourcePolicy)))
        && marker.workflowDigest === authorizationWorkflowDigest
        && ['requestDigest', 'packetDigest', 'recordDigest', 'statusesDigest', 'producerZipDigest',
          'receiptZipDigest', 'receiptArchiveDigest', 'receiptInventoryDigest', 'outcomeHead'].every(key =>
          typeof marker[key] === 'string' && /^[a-f0-9]{64}$/.test(marker[key] as string)), 'authorization-consumed-marker');
      const failedIndex = items.findIndex(row => row.entry.id === marker.journal), failed = items[failedIndex];
      requireProof(failed !== undefined && failedIndex > index && !historicalRecordId(marker.journal)
        && !admissions.has(marker.journal) && failed.status.state === (marker.kind === 'failed-read-only-history-no-effects' ? 'in_progress' : 'error')
        && marker.recordDigest === sha256(historicalSnapshot([failed])), 'authorization-consumed-record');
      const failedPayload = object(failed.entry.payload);
      const request = validateReleaseRequest(failedPayload.releaseRequest, { version: 1, requestDigest: failedPayload.requestDigest });
      requireProof(request.mode === 'etsy-strict-cutover' && request.migration !== null
        && marker.requestDigest === failedPayload.requestDigest && marker.packetDigest === request.migration.packetDigest
        && marker.requestDigest !== payload.requestDigest && marker.packetDigest !== successor.migration?.packetDigest
        && equal(object(failedPayload.historicalHandoff), object(payload.historicalHandoff))
        && equal(request.schema.before, successor.schema.before), 'authorization-consumed-request');
      if (Object.hasOwn(failedPayload, 'noEffectDispositions')) {
        requireProof(marker.kind === 'failed-read-only-history-no-effects' && Array.isArray(failedPayload.noEffectDispositions)
          && failedPayload.noEffectDispositions.length > 0 && failedPayload.noEffectDispositions.length <= items.length
          && failedPayload.noEffectDispositions.every(prior => {
            const kind = object(prior).kind;
            return (kind === 'failed-authorization-no-effects' || kind === 'failed-read-only-history-no-effects')
              && consumedMarkers.some(carried => equal(carried, prior));
          }), 'history-consumed-prior-commitments');
      }
      const remote = await proofIo.read(`/deployments/${marker.journal}`);
      const statuses = await proofIo.read(`/deployments/${marker.journal}/statuses?per_page=100`);
      requireProof(equal(remote, failed.entry) && Array.isArray(statuses) && statuses.length === 2
        && equal(statuses[0], failed.status) && sha256(canonical(statuses)) === marker.statusesDigest,
      'authorization-consumed-statuses');
      admissions.set(marker.journal, { marker: marker as unknown as FailedAuthorizationAdmission['marker'], consumed: true, recheck });
    }
  }
  for (const item of items) {
    if (item.status.state === 'success' || historicalRecordId(item.entry.id) || completed?.resolved.has(Number(item.entry.id))) continue;
    requireProof(positive(item.entry.id) && (item.status.state === 'error' || item.status.state === 'in_progress'), 'authorization-unresolved-prior');
    if (!admissions.has(item.entry.id)) admissions.set(item.entry.id, await proveFailedAuthorization(item, current, proofIo, signal));
  }
  for (const [index, item] of items.entries()) {
    if (item.status.state === 'success' || historicalRecordId(item.entry.id) || completed?.resolved.has(Number(item.entry.id))) continue;
    const payload = object(item.entry.payload), own = admissions.get(Number(item.entry.id))!;
    if (!Object.hasOwn(payload, 'noEffectDispositions')) continue;
    const carried = payload.noEffectDispositions;
    requireProof(own.marker.kind === 'failed-read-only-history-no-effects' && Array.isArray(carried) && carried.length > 0
      && carried.length <= items.length && new Set(carried.map(value => object(value).journal)).size === carried.length,
    'history-prior-carrier');
    for (const value of carried) {
      const marker = object(value), priorIndex = items.findIndex(row => row.entry.id === marker.journal);
      const prior = priorIndex > index ? admissions.get(Number(marker.journal)) : undefined;
      requireProof(prior !== undefined
        && (prior.marker.kind === 'failed-authorization-no-effects' || prior.marker.kind === 'failed-read-only-history-no-effects')
        && equal(marker, prior.marker), 'history-prior-proof');
      const priorPayload = object(items[priorIndex]!.entry.payload);
      requireProof(equal(priorPayload.historicalHandoff, payload.historicalHandoff)
        && equal(object(priorPayload.releaseRequest).schema, object(payload.releaseRequest).schema)
        && priorPayload.requestDigest !== payload.requestDigest && priorPayload.migrationPacket !== payload.migrationPacket,
      'history-prior-lineage');
      if (Object.hasOwn(priorPayload, 'noEffectDispositions')) {
        requireProof(Array.isArray(priorPayload.noEffectDispositions)
          && priorPayload.noEffectDispositions.length > 0 && priorPayload.noEffectDispositions.length <= items.length
          && priorPayload.noEffectDispositions.every(dependency => carried.some(value => equal(value, dependency))),
        'history-prior-closure');
      }
    }
  }
  if (admissions.size) {
    // Validate all carriers, refused origins and subsequent accepted predecessor links
    // together before returning any exception capability to the provider.
    await consumedPredecessor(items, proofIo, admissions, completed);
    await recheck();
  }
  return admissions;
}
