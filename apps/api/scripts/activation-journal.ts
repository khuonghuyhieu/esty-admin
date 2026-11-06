import { mkdirSync, readdirSync, openSync, closeSync, fsyncSync, unlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { artifactTarget, canonical, inventory, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';
import { activationSchema, assertActivationManifest } from '../src/config/schema-transition.js';
import { migrationManifest } from '../src/generated/migrations.js';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };

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
  | 'promotion-intent' | 'outcome' | 'reconciled' | 'confirming' | 'remote-confirmed';
interface Event {
  version: 1; packetDigest: string; previousHash: string; sequence: number;
  phase: ActivationPhase; kind: Kind; value: unknown; sha256: string;
}
export interface ActivationState {
  packet: ActivationPacket; packetDigest: string; head: string; journal: number;
  events: readonly Event[]; next: ActivationPhase | null;
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
export function reserveActivationJournal(directory: string, packet: ActivationPacket, digest: string, journal: number): void {
  if (!Number.isSafeInteger(journal) || journal <= 0) refuse();
  checkLock(directory, packet, digest);
  writeReleaseEvidence(join(runPath(directory, packet), 'reservation.json'), { packetDigest: digest, journal });
}
function checkLock(directory: string, packet: ActivationPacket, digest: string, transferred = false): void {
  validateActivationPacket(packet, digest);
  const run = runPath(directory, packet);
  if (canonical(readEvidence(join(run, 'packet.json')).value) !== canonical(packet)) refuse();
  const actual = readEvidence(join(directory, 'operator.lock'));
  if (canonical(actual.value) !== canonical({ version: 1, kind: 'activation', runId: packet.runId, packetDigest: digest })) refuse();
  const retained = object(readEvidence(join(run, 'lock.json')).value, ['packetDigest', 'identity']);
  if (retained.packetDigest !== digest) refuse();
  if (transferred) {
    const original = object(retained.identity, ['dev', 'ino', 'size', 'mtime_ns', 'ctime_ns', 'sha256']);
    if (original.sha256 !== actual.identity.sha256 || original.size !== actual.identity.size) refuse();
  } else if (canonical(retained.identity) !== canonical(actual.identity)) refuse();
}
export function readActivationJournal(directory: string, packet: ActivationPacket, digest: string): ActivationState {
  return readJournal(directory, packet, digest, false);
}
function readJournal(directory: string, packet: ActivationPacket, digest: string, transferred: boolean): ActivationState {
  checkLock(directory, packet, digest, transferred);
  const run = runPath(directory, packet);
  const reservation = object(readEvidence(join(run, 'reservation.json')).value, ['packetDigest', 'journal']);
  if (reservation.packetDigest !== digest || !Number.isSafeInteger(reservation.journal) || Number(reservation.journal) <= 0) refuse();
  const names = readdirSync(run).filter(name => !['packet.json', 'lock.json', 'reservation.json'].includes(name)).sort();
  const events: Event[] = []; let head = digest, phaseIndex = 0;
  let intent = false, authorized = false, started = false, id: string | null = null;
  let attested = false, promotion = false, completed: ActivationOutcome | null = null, reconciled = false;
  let confirmation: string | null = null;
  const acknowledged = new Set<string>();
  for (const [index, name] of names.entries()) {
    if (name !== `${String(index).padStart(3, '0')}.json`) refuse();
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
        started = true; break;
      case 'acknowledged': {
        const value = object(row.value, ['deploymentId']);
        if (!started || completed || id || !['bridge', 'app'].includes(String(row.phase))
          || !matches(value.deploymentId, deployment) || acknowledged.has(value.deploymentId)) refuse();
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
        break;
      case 'reconciled':
        if (!started || reconciled || completed?.result === 'confirmed') refuse();
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
      default: refuse();
    }
    head = recorded as string; events.push(row as unknown as Event);
  }
  return { packet, packetDigest: digest, head, journal: Number(reservation.journal), events, next: activationPhases[phaseIndex] ?? null };
}
export function appendActivationEvent(directory: string, packet: ActivationPacket, digest: string,
  phase: ActivationPhase, kind: Kind, value: unknown): ActivationState {
  const state = readActivationJournal(directory, packet, digest);
  if (state.next !== phase) refuse();
  const last = state.events.at(-1), active = last?.phase === phase ? last : undefined;
  if (kind === 'intent') {
    if (active || canonical(value) !== canonical({ outcome: 'unknown' })) refuse();
  } else if (kind === 'authorized') {
    if (active?.kind !== 'intent' || canonical(value) !== canonical({ intentHash: state.head })) refuse();
  } else if (kind === 'started') {
    if (active?.kind !== 'authorized' || canonical(value) !== canonical({ outcome: 'unknown' })) refuse();
  } else if (kind === 'acknowledged' || kind === 'promotion-intent') {
    const data = object(value, ['deploymentId']);
    if (!['bridge', 'app'].includes(phase) || !matches(data.deploymentId, deployment)
      || active?.kind !== (kind === 'acknowledged' ? 'started' : 'candidate-attested')) refuse();
    if (kind === 'promotion-intent' && object(active.value, ['deploymentId', 'configDigest']).deploymentId !== data.deploymentId) refuse();
    if (kind === 'acknowledged' && state.events.some(event => event.kind === 'acknowledged'
      && object(event.value, ['deploymentId']).deploymentId === data.deploymentId)) refuse();
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
    if (kind === 'reconciled' && (!['started', 'acknowledged', 'candidate-attested', 'promotion-intent', 'outcome'].includes(active.kind)
      || !events.some(event => event.kind === 'started') || events.some(event => event.kind === 'reconciled')
      || (active.kind === 'outcome' && outcome(active.value).result === 'confirmed'))) refuse();
    const data = phaseOutcome(phase, value, id, events.some(event => event.kind === 'promotion-intent'));
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
  for (const event of retained.events) appendActivationEvent(directory, packet, digest, event.phase, event.kind, event.value);
  if (readActivationJournal(directory, packet, digest).head !== retained.head) refuse();
}
