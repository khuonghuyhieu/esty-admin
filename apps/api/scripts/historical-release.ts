import { mkdtemp } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, removeArtifactTree, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { verifyActivationArtifact } from './activation-journal.js';
import type { ActivationPacket } from './activation-journal.js';
import { failedPreflightProof, failedPreflightStatus, validateRetainedArtifactArchive } from './activation-preflight-disposition.mjs';
import { retainedActivation } from './activation-retained.mjs';
import { extractRoutineBundle } from './routine-retained.mjs';
import { verifyHistoricalFinalAcceptance } from './activation-held-proof.js';
import { heldAppPolicy, heldD2 } from './activation-held-contract.mjs';
import { historicalReleaseEvidence as evidence } from './historical-release-evidence.js';
import type { ReleaseRequest } from './ci-delivery.js';
import { validateReleaseRequest } from './ci-delivery.js';

export const historicalHandoffDigest = sha256(canonical(evidence));
export interface HistoricalItem { entry: Record<string, unknown>; status: Record<string, unknown> }
export interface HistoricalIo {
  read(path: string): Promise<unknown>;
  download(id: number, maximum?: number): Promise<Buffer>;
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

export function validateHistoricalPreimages(): void {
  const accepted = evidence.finalAccepted, proof = accepted.proof;
  requireProof(accepted.binding.basisHead === heldD2.head && accepted.binding.candidate === heldD2.candidate
    && accepted.binding.packetDigest === heldAppPolicy.packetDigest && accepted.binding.artifactDigest === heldAppPolicy.artifactDigest,
  'accepted-basis');
  let head: string = heldD2.head;
  const kinds = ['intent', 'authorized', 'started', 'acknowledged', 'candidate-attested', 'promotion-intent', 'outcome', 'confirming', 'remote-confirmed'];
  requireProof(evidence.appEvents.length === kinds.length, 'app-event-count');
  for (const [index, row] of evidence.appEvents.entries()) {
    const { sha256: hash, ...body } = row;
    requireProof(row.version === 1 && row.packetDigest === heldAppPolicy.packetDigest && row.sequence === 23 + index
      && row.phase === 'app' && row.kind === kinds[index] && row.previousHash === head && sha256(canonical(body)) === hash, 'app-chain');
    head = hash;
  }
  const rows = evidence.appEvents;
  requireProof(equal(rows[0].value, { outcome: 'unknown' }) && equal(rows[1].value, { intentHash: rows[0].sha256 })
    && equal(rows[2].value, { outcome: 'unknown' }) && equal(rows[3].value, { deploymentId: heldD2.candidate })
    && equal(rows[4].value, { deploymentId: heldD2.candidate, configDigest: heldD2.configDigest })
    && equal(rows[5].value, { deploymentId: heldD2.candidate }), 'app-transition');
  requireProof(equal(rows[6].value, { result: 'confirmed', databaseOutcome: 'not_started', count: 1,
    deploymentId: heldD2.candidate, reportDigest: sha256(canonical(accepted)) })
    && equal(rows[7].value, { outcomeHash: rows[6].sha256 }) && equal(rows[8].value, { outcomeHash: rows[6].sha256 })
    && evidence.accepted.status.description === `activation:app:outcome:${rows[6].sha256}`, 'app-outcome');
  const ack = object(JSON.parse(evidence.promotionAck));
  requireProof(equal(ack.binding, accepted.binding) && ack.intentHead === rows[5].sha256 && ack.code === 0 && ack.aborted === false
    && proof.gate.stage === 'final' && proof.gate.head === ack.intentHead && proof.gate.claimDigest === sha256(evidence.promotionAck)
    && proof.gate.controllerRevision === accepted.binding.capability.controllerPublication.revision
    && equal(proof.sourceDigests, accepted.binding.capability.sourceDigests), 'promotion-final-binding');
  requireProof(failedPreflightStatus(evidence.failed.proof).description === evidence.failed.status.description, 'failed-proof-commitment');
}
export function validateHistoricalRecord(item: HistoricalItem): void {
  const accepted = item.entry.id === evidence.accepted.id;
  const selected = accepted ? evidence.accepted : evidence.failed;
  requireProof(item.entry.id === selected.id && item.entry.sha === heldAppPolicy.revision && item.entry.task === 'deploy:esty-be-ci'
    && item.entry.environment === 'be-production' && item.entry.production_environment === true, 'record-identity');
  const p = object(item.entry.payload);
  requireProof(equal(Object.keys(p).sort(), ['version', 'revision', 'tree', 'run', 'artifact', 'sourceDigest', 'migrationDigest', 'project', 'activationPacket', 'activationRun'].sort())
    && p.version === 1 && p.revision === heldAppPolicy.revision && p.tree === heldAppPolicy.tree && p.artifact === heldAppPolicy.artifactDigest
    && p.sourceDigest === heldAppPolicy.sourceDigest && p.project === heldAppPolicy.project
    && p.run === (accepted ? evidence.accepted.run : evidence.failed.proof.workflowRun)
    && p.activationRun === (accepted ? evidence.accepted.activationRun : evidence.failed.proof.activationRun)
    && p.activationPacket === (accepted ? heldAppPolicy.packetDigest : evidence.failed.proof.packetDigest)
    && p.migrationDigest === '149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3', 'record-payload');
  requireProof(Object.entries(selected.status).every(([key, value]) => item.status[key] === value), 'latest-status');
}
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
async function consumedPredecessor(items: readonly HistoricalItem[], io: HistoricalIo): Promise<ConsumedHandoff | undefined> {
  const marked = items.filter(item => !historicalRecordId(item.entry.id) && item.entry.payload !== null
    && typeof item.entry.payload === 'object' && Object.hasOwn(item.entry.payload, 'historicalHandoff'));
  let previous: ConsumedHandoff | undefined;
  for (const item of [...marked].reverse()) {
    const id = item.entry.id, p = object(item.entry.payload), marker = object(p.historicalHandoff);
    const request = validateReleaseRequest(p.releaseRequest, { version: 1, requestDigest: p.requestDigest });
    requireProof(typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && item.status.state === 'success'
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
export async function proveHistoricalHandoff(items: readonly HistoricalItem[], request: ReleaseRequest, io: HistoricalIo,
  signal: AbortSignal): Promise<HistoricalAdmission> {
  validateHistoricalPreimages(); signal.throwIfAborted();
  requireProof(request.historicalHandoffDigest === historicalHandoffDigest && request.target === retainedActivation.target, 'request-evidence-binding');
  const accepted = items.filter(item => item.entry.id === evidence.accepted.id), failed = items.filter(item => item.entry.id === evidence.failed.id);
  const acceptedRecord = accepted[0], failedRecord = failed[0];
  requireProof(accepted.length === 1 && failed.length === 1 && acceptedRecord !== undefined && failedRecord !== undefined, 'both-records-present');
  validateHistoricalRecord(acceptedRecord); validateHistoricalRecord(failedRecord);
  const snapshots = new Map<string, string>();
  const proofIo: HistoricalIo = { download: (id, maximum) => io.download(id, maximum), async read(path) {
    signal.throwIfAborted();
    const value = await io.read(path);
    if (/^\/(?:actions|deployments|environments)\//.test(path)) {
      const encoded = canonical(value), prior = snapshots.get(path);
      requireProof(prior === undefined || prior === encoded, 'proof-metadata-stable');
      snapshots.set(path, encoded);
    }
    return value;
  } };
  const recheck = async () => {
    for (const [path, expected] of snapshots) {
      signal.throwIfAborted();
      requireProof(canonical(await io.read(path)) === expected, 'proof-metadata-stable');
    }
  };
  const consumed = await consumedPredecessor(items, proofIo);
  if (consumed) {
    bindPredecessor(request, consumed.predecessor, consumed.request.schema.target);
    return { marker: { version: 1, evidenceDigest: historicalHandoffDigest, predecessorRecord: consumed.id,
      predecessor: consumed.predecessor }, recheck, async dispose() {} };
  }
  const metaPath = `/actions/artifacts/${retainedActivation.artifactId}`, metadata = object(await proofIo.read(metaPath));
  const artifactRun = object(metadata.workflow_run);
  requireProof(typeof metadata.id === 'number' && String(metadata.id) === retainedActivation.artifactId
    && metadata.name === `be-tested-${retainedActivation.runId}-1` && metadata.expired === false
    && metadata.digest === `sha256:${retainedActivation.zipDigest}` && typeof metadata.size_in_bytes === 'number'
    && Number.isSafeInteger(metadata.size_in_bytes) && metadata.size_in_bytes > 0 && metadata.size_in_bytes <= 64 * 1024 * 1024
    && typeof metadata.expires_at === 'string' && Date.parse(metadata.expires_at) > Date.now()
    && typeof metadata.created_at === 'string' && Date.parse(metadata.created_at) <= Date.now()
    && String(artifactRun.id) === retainedActivation.runId && artifactRun.head_sha === heldAppPolicy.revision
    && artifactRun.head_branch === 'main', 'legacy-artifact-metadata');
  const zip = await io.download(metadata.id, 64 * 1024 * 1024); signal.throwIfAborted();
  requireProof(zip.length === metadata.size_in_bytes, 'legacy-artifact-size');
  const archive = validateRetainedArtifactArchive(zip), root = await mkdtemp(join(realpathSync(tmpdir()), 'esty-historical-proof-'));
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
    requireProof(request.migration !== null && equal(await proofIo.read(metaPath), metadata), 'legacy-artifact-stable');
    signal.throwIfAborted();
    const expires = Date.parse(metadata.expires_at);
    return { artifact, marker: { version: 1, evidenceDigest: historicalHandoffDigest, predecessorRecord: null, predecessor },
      async recheck() { requireProof(expires > Date.now(), 'legacy-artifact-expired'); await recheck(); }, dispose };
  } catch (cause) {
    try { await dispose(); }
    catch (cleanup) { throw new AggregateError([cause, cleanup], 'Historical handoff proof and temporary evidence cleanup failed.', { cause }); }
    throw cause;
  }
}
