import { mkdtemp } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, removeArtifactTree, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { verifyActivationArtifact } from './activation-journal.js';
import type { ActivationPacket } from './activation-journal.js';
import { failedPreflightProof, validateRetainedArtifactArchive } from './activation-preflight-disposition.mjs';
import { retainedActivation, retainedHistoricalArchive } from './activation-retained.mjs';
import { extractRoutineBundle } from './routine-retained.mjs';
import { verifyHistoricalFinalAcceptance, validateHistoricalPreimages, validateHistoricalRecord } from './activation-held-proof.js';
import { heldAppPolicy, heldD2 } from './activation-held-contract.mjs';
import { historicalReleaseEvidence as evidence } from './historical-release-evidence.js';
import type { ReleaseRequest } from './ci-delivery.js';
import { validateReleaseRequest } from './ci-delivery.js';
import type { ChecksDiagnostics } from './checks-diagnostics.js';

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
// Metadata stability only; this reader does not grant historical admission.
export function historicalMetadataReadback(io: HistoricalIo, signal: AbortSignal) {
  const releasePath = `/releases/tags/${retainedHistoricalArchive.tag}`, snapshots = new Map<string, string>();
  const proofIo: HistoricalIo = { diagnostics: io.diagnostics, download: (id, maximum) => io.download(id, maximum), async read(path) {
    signal.throwIfAborted();
    const value = await io.read(path);
    if (/^\/(?:actions|deployments|commits|git|releases)\//.test(path)) {
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

export async function proveHistoricalHandoff(items: readonly HistoricalItem[], request: ReleaseRequest, io: HistoricalIo,
  signal: AbortSignal): Promise<HistoricalAdmission> {
  validateHistoricalPreimages(); signal.throwIfAborted();
  requireProof(request.historicalHandoffDigest === historicalHandoffDigest && request.target === retainedActivation.target, 'request-evidence-binding');
  const accepted = items.filter(item => item.entry.id === evidence.accepted.id), failed = items.filter(item => item.entry.id === evidence.failed.id);
  const acceptedRecord = accepted[0], failedRecord = failed[0];
  requireProof(accepted.length === 1 && failed.length === 1 && acceptedRecord !== undefined && failedRecord !== undefined, 'both-records-present');
  validateHistoricalRecord(acceptedRecord); validateHistoricalRecord(failedRecord);
  const retention = retainedHistoricalArchive, releasePath = `/releases/tags/${retention.tag}`;
  const api = `https://api.github.com/repos/${retention.repository}`;
  const { proofIo, recheck } = historicalMetadataReadback(io, signal);
  const consumed = await consumedPredecessor(items, proofIo);
  if (consumed) {
    bindPredecessor(request, consumed.predecessor, consumed.request.schema.target);
    return { marker: { version: 1, evidenceDigest: historicalHandoffDigest, predecessorRecord: consumed.id,
      predecessor: consumed.predecessor }, recheck, async dispose() {} };
  }
  const release = object(await proofIo.read(releasePath));
  requireProof(typeof release.id === 'number' && Number.isSafeInteger(release.id) && release.id > 0
    && release.url === `${api}/releases/${release.id}` && release.assets_url === `${api}/releases/${release.id}/assets`
    && release.html_url === `https://github.com/${retention.repository}/releases/tag/${retention.tag}`
    && release.tag_name === retention.tag && release.target_commitish === retention.revision
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
