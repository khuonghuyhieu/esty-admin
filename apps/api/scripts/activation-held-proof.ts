import { createHash } from 'node:crypto';
import { canonical, sha256 } from './artifact.js';
import { validateHeldProbeArchive } from './activation-preflight-disposition.mjs';
import { heldAppPolicy, heldBindingVariable, heldPinPath, heldProbeSources, validateHeldBinding,
  validateHeldTarget, heldD2, heldD2Sources, validateHeldD2Gate, validateHeldD2Target, validateHeldD2Capability } from './activation-held-contract.mjs';
import type { HeldAppPolicy } from './activation-held-contract.mjs';
import { historicalReleaseEvidence } from './historical-release-evidence.js';

export interface HeldAppTarget {
  executionId: string; unknownHead: string; packetDigest: string; artifactDigest: string;
  revision: string; tree: string; sourceDigest: string; project: string; scope: string;
  candidate: string; origin: string; configDigest: string; createClaimDigest: string;
  createAckDigest: string; heldReceiptDigest: string;
}
export interface HeldAppBinding extends HeldAppTarget { workflowRevision: string }
export interface HeldProbeIo { read(path: string): Promise<unknown>; download(id: number): Promise<Buffer> }
export interface HeldAppProbeProof {
  version: 1; kind: 'github-held-app-live'; binding: HeldAppBinding; bindingDigest: string;
  workflowRun: string; artifactId: number; archiveDigest: string; receiptDigest: string;
  sourceDigests: Record<string, string>; sourcePinDigest: string;
  checks: { live: 'passed'; computedRuntimeDigest: 'passed'; target: 'not-proved'; authMembership: 'not-proved' };
}
export interface HeldAcceptanceGate {
  version: 1; stage: 'candidate' | 'final'; head: string; claimDigest: string; controllerRevision: string;
}
export interface HeldAppAcceptanceProof extends Omit<HeldAppProbeProof, 'kind' | 'checks'> {
  kind: 'github-held-app-acceptance'; gate: HeldAcceptanceGate;
  retainedCandidate?: HeldRetainedCandidateContext;
  checks: { live: 'passed'; computedRuntimeDigest: 'passed'; target: 'passed'; access: 'passed'; cors: 'passed'; authMembership: 'not-proved' };
}
const repository = 'khuonghuyhieu/esty-admin', workflow = '.github/workflows/be-candidate-probe.yml';
const variablePath = `/environments/be-production/variables/${heldBindingVariable}`;
function refuse(): never { throw new Error('Independent held candidate proof refused.'); }
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, any>;
}
// One root-sealed correction of the consumed pre-adoption attempt; never caller-selected history.
export const heldRetainedCandidate = Object.freeze({
  version: 1, action: 'accept-candidate', executionId: heldAppPolicy.executionId, head: heldD2.head,
  failedClaimDigest: 'b57e92c05a7c8337889985adbd94475ad9669ae2d682958b4aef4b4ef1c92c5c',
  prepareClaimDigest: '79660adfe4894f11e6188979bb087c2b88e884a1627bac81175beac8a5ff7456',
  gateDigest: 'd1d293c26e8fc45d1e05029c105a78d69d9b462cf221b5c924c54ee9293e097a',
  previousExecutableDigest: '31544e79260bdcd067e7a90f5775b5bbf252a2adc23ba0e2eab30338fc555189',
  workflowRun: '43826155118',
  proofPublication: Object.freeze({ revision: 'b6743c4cb2295871c5eec523e9b33e88058874ca',
    tree: 'e590ca280b8275dd1da4c87e82715db7ee13b811' }),
  candidate: heldD2.candidate, origin: heldD2.origin, configDigest: heldD2.configDigest,
  artifactDigest: heldAppPolicy.artifactDigest,
  sourceDigests: Object.freeze({
    '.github/workflows/be-candidate-probe.yml': '3da9c1cd29c4d40c0774c7f3e9909337f8be062afb8b85ce3fbae9d02c0c6caa',
    'apps/api/scripts/activation-candidate-probe.mjs': 'e6777d08e5d5c84dc4b15bc857051ac8c904127b850b19eca56a16613fd5238d',
    'apps/api/scripts/activation-held-contract.mjs': 'abb42cf3501608f644eeee672d91b20b1dc3545310730d2ddb8570b3fd5d1681',
    'apps/api/scripts/hosted-acceptance.ts': 'a531962762af89fa936648d33201da09f52bc7c31d59e613bf4cc52d7e3bfe80',
  }),
});
export interface HeldRetainedCandidateContext {
  binding: typeof heldRetainedCandidate;
  controllerPublication: { revision: string; tree: string };
}
export function validateHeldRetainedCandidate(manifest: unknown): HeldRetainedCandidateContext | undefined {
  const value = record(manifest);
  if (!Object.hasOwn(value, 'heldD2RetainedCandidate')) return undefined;
  if (['heldAppCapability', 'heldCorrectionCapability', 'heldDatabaseRepairCapability', 'heldPostRepairCapability',
    'diagnosticSelector', 'diagnosticContextDigest'].some(key => Object.hasOwn(value, key))
    || canonical(value.heldD2RetainedCandidate) !== canonical(heldRetainedCandidate)) refuse();
  const capability = validateHeldD2Capability(value.heldD2Capability), publication = capability.controllerPublication;
  if (publication.revision === heldRetainedCandidate.proofPublication.revision
    || publication.tree === heldRetainedCandidate.proofPublication.tree
    || canonical(capability.sourceDigests) !== canonical(heldRetainedCandidate.sourceDigests)) refuse();
  if (!Array.isArray(value.files)) refuse();
  for (const [path, digest] of Object.entries(heldRetainedCandidate.sourceDigests)) {
    const files = value.files.filter((file: unknown) => record(file).path === `proof-source/${path}`);
    if (files.length !== 1 || files[0].sha256 !== digest) refuse();
  }
  return { binding: heldRetainedCandidate, controllerPublication: { ...publication } };
}
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
export async function verifyHeldAppProbe(runId: string, target: HeldAppTarget, io: HeldProbeIo,
  sourceDigests: Readonly<Record<string, string>>, signal: AbortSignal, policy: HeldAppPolicy = heldAppPolicy): Promise<HeldAppProbeProof> {
  return verifyProbe(runId, target, io, sourceDigests, signal, policy) as Promise<HeldAppProbeProof>;
}
export async function verifyHeldAppAcceptance(runId: string, target: HeldAppTarget, io: HeldProbeIo,
  sourceDigests: Readonly<Record<string, string>>, signal: AbortSignal, gate: HeldAcceptanceGate,
  retained?: HeldRetainedCandidateContext): Promise<HeldAppAcceptanceProof> {
  validateHeldD2Target(target); validateHeldD2Gate(gate, gate.stage, gate.controllerRevision);
  if (retained) {
    const publication = record(retained.controllerPublication);
    if (Object.keys(retained).sort().join(',') !== 'binding,controllerPublication'
      || canonical(retained.binding) !== canonical(heldRetainedCandidate)
      || Object.keys(publication).sort().join(',') !== 'revision,tree'
      || typeof publication.revision !== 'string' || typeof publication.tree !== 'string'
      || !/^[a-f0-9]{40}$/.test(publication.revision) || !/^[a-f0-9]{40}$/.test(publication.tree)
      || publication.revision === heldRetainedCandidate.proofPublication.revision
      || publication.tree === heldRetainedCandidate.proofPublication.tree
      || canonical(sourceDigests) !== canonical(heldRetainedCandidate.sourceDigests) || gate.stage !== 'candidate'
      || runId !== heldRetainedCandidate.workflowRun || gate.head !== heldRetainedCandidate.head
      || gate.claimDigest !== heldRetainedCandidate.prepareClaimDigest
      || gate.controllerRevision !== heldRetainedCandidate.proofPublication.revision) refuse();
  }
  return verifyProbe(runId, target, io, sourceDigests, signal, heldAppPolicy, gate, retained) as Promise<HeldAppAcceptanceProof>;
}
export async function verifyHistoricalFinalAcceptance(current: { revision: string; tree: string },
  io: HeldProbeIo, signal: AbortSignal): Promise<HeldAppAcceptanceProof> {
  const selected = historicalReleaseEvidence.finalAccepted, expected = selected.proof;
  if (Object.keys(current).sort().join(',') !== 'revision,tree'
    || !/^[a-f0-9]{40}$/.test(current.revision) || !/^[a-f0-9]{40}$/.test(current.tree)
    || current.revision === expected.binding.workflowRevision) refuse();
  const publication = record(await io.read(`/commits/${expected.binding.workflowRevision}`));
  if (publication.sha !== selected.binding.capability.controllerPublication.revision
    || record(record(publication.commit).tree).sha !== selected.binding.capability.controllerPublication.tree) refuse();
  const { workflowRevision: _revision, ...target } = expected.binding;
  validateHeldD2Target(target); validateHeldD2Gate(expected.gate, 'final', expected.binding.workflowRevision);
  const observed = await verifyProbe(expected.workflowRun, target, io, expected.sourceDigests, signal,
    heldAppPolicy, expected.gate, undefined, current);
  if (canonical(observed) !== canonical(expected)) refuse();
  return observed as HeldAppAcceptanceProof;
}
async function verifyProbe(runId: string, target: HeldAppTarget, io: HeldProbeIo, sourceDigests: Readonly<Record<string, string>>,
  signal: AbortSignal, policy: HeldAppPolicy, gate?: HeldAcceptanceGate,
  retained?: HeldRetainedCandidateContext,
  historicalCurrent?: { revision: string; tree: string }): Promise<HeldAppProbeProof | HeldAppAcceptanceProof> {
  signal.throwIfAborted(); validateHeldTarget(target, policy);
  const sources = gate ? heldD2Sources : heldProbeSources;
  if (!/^[1-9][0-9]{0,19}$/.test(runId) || canonical(Object.keys(sourceDigests).sort()) !== canonical([...sources].sort())
    || Object.values(sourceDigests).some(value => !/^[a-f0-9]{64}$/.test(value))) refuse();
  const read = async (path: string) => { signal.throwIfAborted(); const value = await io.read(path); signal.throwIfAborted(); return value; };
  const variable = record(await read(variablePath));
  if (variable.name !== heldBindingVariable || typeof variable.value !== 'string' || Buffer.byteLength(variable.value) > 65536) refuse();
  const binding = record(JSON.parse(variable.value));
  if (!/^[a-f0-9]{40}$/.test(binding.workflowRevision ?? '')) refuse();
  const revision = binding.workflowRevision as string;
  const gatePath = `/environments/be-production/variables/${heldD2.gateVariable}`;
  const gateResource = gate ? record(await read(gatePath)) : undefined;
  if (gate && (revision !== gate.controllerRevision || gateResource?.name !== heldD2.gateVariable
    || typeof gateResource.value !== 'string' || Buffer.byteLength(gateResource.value) > 65536
    || canonical(JSON.parse(gateResource.value)) !== canonical(gate))) refuse();
  const source = async (path: string, sourceRevision = revision): Promise<Buffer> => {
    const file = record(await read(`/contents/${path}?ref=${sourceRevision}`));
    if (file.type !== 'file' || file.path !== path || file.encoding !== 'base64' || typeof file.content !== 'string'
      || file.content.length > 131072 || !Number.isSafeInteger(file.size) || file.size > 65536) refuse();
    const bytes = Buffer.from(file.content, 'base64');
    if (bytes.length !== file.size || bytes.toString('base64') !== file.content.replaceAll('\n', '')
      || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== file.sha) refuse();
    return bytes;
  };
  const pinBytes = await source(heldPinPath), pin = JSON.parse(pinBytes.toString('utf8'));
  validateHeldBinding(binding, pin, policy);
  if (retained && !pinBytes.equals(await source(heldPinPath, retained.controllerPublication.revision))) refuse();
  const { workflowRevision: _revision, ...boundTarget } = binding;
  if (canonical(boundTarget) !== canonical(target)) refuse();
  const checkMain = async () => {
    const main = record(await read('/commits/main'));
    const publication = historicalCurrent ?? retained?.controllerPublication;
    if (main.sha !== (publication?.revision ?? revision)
      || (publication && record(record(main.commit).tree).sha !== publication.tree)) refuse();
  };
  await checkMain();
  for (const path of sources) if (sha256(await source(path)) !== sourceDigests[path]) refuse();
  if (retained) for (const path of sources)
    if (sha256(await source(path, retained.controllerPublication.revision)) !== sourceDigests[path]) refuse();
  const runPath = `/actions/runs/${runId}`, run = record(await read(runPath));
  const checkRun = (value: Record<string, any>) => {
    if (String(value.id) !== runId || value.run_attempt !== 1 || value.status !== 'completed' || value.conclusion !== 'success'
      || value.event !== 'workflow_dispatch' || value.head_branch !== 'main' || value.head_sha !== revision
      || value.path !== workflow || record(value.repository).full_name !== repository
      || record(value.head_repository).full_name !== repository) refuse();
  };
  checkRun(run);
  const listing = record(await read(`${runPath}/artifacts?per_page=100`));
  if (!Array.isArray(listing.artifacts) || listing.total_count !== listing.artifacts.length || listing.artifacts.length > 100) refuse();
  const artifacts = listing.artifacts.filter((entry: unknown) => record(entry).name === `held-app-probe-${runId}-1`);
  if (artifacts.length !== 1) refuse();
  const artifact = record(artifacts[0]);
  if (!positive(artifact.id) || artifact.expired !== false || !positive(artifact.size_in_bytes) || artifact.size_in_bytes > 65536
    || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '') || String(record(artifact.workflow_run).id) !== runId
    || artifact.workflow_run.head_sha !== revision) refuse();
  signal.throwIfAborted();
  const bytes = await io.download(artifact.id); signal.throwIfAborted();
  if (bytes.length !== artifact.size_in_bytes) refuse();
  const archiveDigest = (artifact.digest as string).slice(7);
  const receipt = validateHeldProbeArchive(bytes, archiveDigest), bindingDigest = sha256(canonical(binding));
  const expected = { version: 1, kind: gate ? 'held-app-acceptance' : 'held-app-live', bindingDigest,
    workflowRevision: revision, workflowRun: runId, status: 200, configDigestMatch: true, bodyStatus: 'ok',
    ...(gate ? { stage: gate.stage, gateDigest: sha256(canonical(gate)), acceptance: 'passed' } : {}) };
  if (canonical(receipt) !== canonical(expected)) refuse();
  const after = record(await read(variablePath));
  if (canonical(after) !== canonical(variable)) refuse();
  if (gate && canonical(await read(gatePath)) !== canonical(gateResource)) refuse();
  await checkMain(); checkRun(record(await read(runPath)));
  if ((retained || historicalCurrent) && canonical(await read(`${runPath}/artifacts?per_page=100`)) !== canonical(listing)) refuse();
  const base = { version: 1 as const, binding: binding as HeldAppBinding, bindingDigest,
    workflowRun: runId, artifactId: artifact.id, archiveDigest, receiptDigest: sha256(canonical(receipt)),
    sourceDigests: { ...sourceDigests }, sourcePinDigest: sha256(pinBytes) };
  if (retained) Object.assign(base, { retainedCandidate: retained });
  return gate ? { ...base, kind: 'github-held-app-acceptance', gate, checks: { live: 'passed', computedRuntimeDigest: 'passed',
    target: 'passed', access: 'passed', cors: 'passed', authMembership: 'not-proved' } }
    : { ...base, kind: 'github-held-app-live',
      checks: { live: 'passed', computedRuntimeDigest: 'passed', target: 'not-proved', authMembership: 'not-proved' } };
}
