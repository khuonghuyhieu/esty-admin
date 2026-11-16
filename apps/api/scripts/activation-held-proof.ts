import { createHash } from 'node:crypto';
import { canonical, sha256 } from './artifact.js';
import { validateHeldProbeArchive } from './activation-preflight-disposition.mjs';
import { heldAppPolicy, heldBindingVariable, heldPinPath, heldProbeSources, validateHeldBinding,
  validateHeldTarget, heldD2, heldD2Sources, validateHeldD2Gate, validateHeldD2Target } from './activation-held-contract.mjs';
import type { HeldAppPolicy } from './activation-held-contract.mjs';

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
  checks: { live: 'passed'; computedRuntimeDigest: 'passed'; target: 'passed'; access: 'passed'; cors: 'passed'; authMembership: 'not-proved' };
}
const repository = 'khuonghuyhieu/esty-admin', workflow = '.github/workflows/be-candidate-probe.yml';
const variablePath = `/environments/be-production/variables/${heldBindingVariable}`;
function refuse(): never { throw new Error('Independent held candidate proof refused.'); }
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, any>;
}
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
export async function verifyHeldAppProbe(runId: string, target: HeldAppTarget, io: HeldProbeIo,
  sourceDigests: Readonly<Record<string, string>>, signal: AbortSignal, policy: HeldAppPolicy = heldAppPolicy): Promise<HeldAppProbeProof> {
  return verifyProbe(runId, target, io, sourceDigests, signal, policy) as Promise<HeldAppProbeProof>;
}
export async function verifyHeldAppAcceptance(runId: string, target: HeldAppTarget, io: HeldProbeIo,
  sourceDigests: Readonly<Record<string, string>>, signal: AbortSignal, gate: HeldAcceptanceGate): Promise<HeldAppAcceptanceProof> {
  validateHeldD2Target(target); validateHeldD2Gate(gate, gate.stage, gate.controllerRevision);
  return verifyProbe(runId, target, io, sourceDigests, signal, heldAppPolicy, gate) as Promise<HeldAppAcceptanceProof>;
}
async function verifyProbe(runId: string, target: HeldAppTarget, io: HeldProbeIo, sourceDigests: Readonly<Record<string, string>>,
  signal: AbortSignal, policy: HeldAppPolicy, gate?: HeldAcceptanceGate): Promise<HeldAppProbeProof | HeldAppAcceptanceProof> {
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
  const source = async (path: string): Promise<Buffer> => {
    const file = record(await read(`/contents/${path}?ref=${revision}`));
    if (file.type !== 'file' || file.path !== path || file.encoding !== 'base64' || typeof file.content !== 'string'
      || file.content.length > 131072 || !Number.isSafeInteger(file.size) || file.size > 65536) refuse();
    const bytes = Buffer.from(file.content, 'base64');
    if (bytes.length !== file.size || bytes.toString('base64') !== file.content.replaceAll('\n', '')
      || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== file.sha) refuse();
    return bytes;
  };
  const pinBytes = await source(heldPinPath), pin = JSON.parse(pinBytes.toString('utf8'));
  validateHeldBinding(binding, pin, policy);
  const { workflowRevision: _revision, ...boundTarget } = binding;
  if (canonical(boundTarget) !== canonical(target)) refuse();
  const checkMain = async () => {
    const main = record(await read('/commits/main'));
    if (main.sha !== revision) refuse();
  };
  await checkMain();
  for (const path of sources) if (sha256(await source(path)) !== sourceDigests[path]) refuse();
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
  const base = { version: 1 as const, binding: binding as HeldAppBinding, bindingDigest,
    workflowRun: runId, artifactId: artifact.id, archiveDigest, receiptDigest: sha256(canonical(receipt)),
    sourceDigests: { ...sourceDigests }, sourcePinDigest: sha256(pinBytes) };
  return gate ? { ...base, kind: 'github-held-app-acceptance', gate, checks: { live: 'passed', computedRuntimeDigest: 'passed',
    target: 'passed', access: 'passed', cors: 'passed', authMembership: 'not-proved' } }
    : { ...base, kind: 'github-held-app-live',
      checks: { live: 'passed', computedRuntimeDigest: 'passed', target: 'not-proved', authMembership: 'not-proved' } };
}
