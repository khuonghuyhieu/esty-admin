import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { canonical, sha256 } from './artifact.js';
import { privateDirectory } from './private-files.mjs';

export class RunIdentityConflict extends Error {
  constructor() { super('Run identity already consumed; use read-only reconciliation.'); this.name = 'RunIdentityConflict'; }
}

export type SchemaMode = 'migrate' | 'current-schema-only';
export interface ReleaseBinding {
  run_id: string; revision: string; artifact_digest: string; manifest_digest: string;
  target: string; schema_mode: SchemaMode;
}
interface FileIdentity {
  dev: string; ino: string; size: number; mtime_ns: string; ctime_ns: string; sha256: string;
}
export interface RetainedRun {
  run_id: string; revision: string; artifact_digest: string; manifest_digest: string; target: string;
  report_sha256: string;
  lock: FileIdentity & { value: { run_id: string; revision: string } };
}
export interface SupersessionApproval {
  version: 1;
  decision: 'accept-late-create-alias-risk-and-unresolved-https';
  previous: RetainedRun;
  next: ReleaseBinding;
}
export interface JournalOutcome {
  result: 'success' | 'failed'; stage: string;
  deployment: 'not_started' | 'unknown' | 'queued' | 'failed' | 'ready';
  deploy_id: string | null; retain_lock: boolean;
}
interface RecordEnvelope {
  version: 1; kind: string; binding: ReleaseBinding; previous_hash: string | null;
  value: unknown; sha256: string;
}
export interface JournalState {
  binding: ReleaseBinding; approval: SupersessionApproval | null;
  create_intent: boolean; deploy_id: string | null; outcome: JournalOutcome | null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hex40 = /^[a-f0-9]{40}$/;
const hex64 = /^[a-f0-9]{64}$/;
const deployId = /^dpl_[A-Za-z0-9]{1,124}$/;
function refuse(): never { throw new Error('Release evidence is incomplete, changed or not approved.'); }
function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  const record = value as Record<string, unknown>;
  if (keys && (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key)))) refuse();
  return record;
}
function matches(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.test(value); }
function equal(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
export function validateBinding(value: unknown): ReleaseBinding {
  const data = object(value, ['run_id', 'revision', 'artifact_digest', 'manifest_digest', 'target', 'schema_mode']);
  if (!matches(data.run_id, uuid) || !matches(data.revision, hex40) || !matches(data.artifact_digest, hex64)
    || !matches(data.manifest_digest, hex64) || !matches(data.target, /^(local|supabase:[a-z]{20})$/)
    || (data.schema_mode !== 'migrate' && data.schema_mode !== 'current-schema-only')) refuse();
  return data as unknown as ReleaseBinding;
}
export function parseSupersessionApproval(value: unknown): SupersessionApproval {
  const data = object(value, ['version', 'decision', 'previous', 'next']);
  if (data.version !== 1 || data.decision !== 'accept-late-create-alias-risk-and-unresolved-https') refuse();
  const next = validateBinding(data.next);
  const previous = object(data.previous, ['run_id', 'revision', 'artifact_digest', 'manifest_digest', 'target', 'report_sha256', 'lock']);
  const lock = object(previous.lock, ['dev', 'ino', 'size', 'mtime_ns', 'ctime_ns', 'sha256', 'value']);
  const lockValue = object(lock.value, ['run_id', 'revision']);
  if (next.schema_mode !== 'current-schema-only' || !matches(previous.run_id, uuid) || previous.run_id === next.run_id
    || !matches(previous.revision, hex40) || !matches(previous.artifact_digest, hex64) || !matches(previous.report_sha256, hex64)
    || previous.manifest_digest !== next.manifest_digest || previous.target !== next.target
    || lockValue.run_id !== previous.run_id || lockValue.revision !== previous.revision || !matches(lock.sha256, hex64)
    || !['dev', 'ino', 'mtime_ns', 'ctime_ns'].every(key => matches(lock[key], /^\d{1,30}$/))
    || !Number.isSafeInteger(lock.size) || Number(lock.size) <= 0 || Number(lock.size) > 65536) refuse();
  return JSON.parse(canonical(data)) as SupersessionApproval;
}
function identity(stat: fs.BigIntStats, bytes: Buffer): FileIdentity {
  return { dev: String(stat.dev), ino: String(stat.ino), size: Number(stat.size),
    mtime_ns: String(stat.mtimeNs), ctime_ns: String(stat.ctimeNs), sha256: sha256(bytes) };
}
function readEvidence(path: string): { value: unknown; identity: FileIdentity } {
  privateDirectory(dirname(path), false);
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.uid !== BigInt(process.getuid!()) || (before.mode & 0o777n) !== 0o600n
      || before.nlink !== 1n || before.size > 65536n || before.size === 0n) refuse();
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    const pathStat = fs.lstatSync(path, { bigint: true });
    if (!equal(identity(before, bytes), identity(after, bytes)) || pathStat.dev !== after.dev || pathStat.ino !== after.ino
      || pathStat.isSymbolicLink() || BigInt(bytes.length) !== after.size) refuse();
    return { value: JSON.parse(bytes.toString('utf8')), identity: identity(after, bytes) };
  } finally { fs.closeSync(fd); }
}
function syncDirectory(path: string): void {
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function durableDirectory(path: string, exclusive = false): string {
  privateDirectory(dirname(path), false);
  if (exclusive) fs.mkdirSync(path, { mode: 0o700 });
  else privateDirectory(path);
  privateDirectory(path, false);
  syncDirectory(path); syncDirectory(dirname(path));
  return path;
}
export function writeReleaseEvidence(path: string, value: unknown): void {
  privateDirectory(dirname(path), false);
  const fd = fs.openSync(path, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  // Partial or failed writes are evidence: never remove them to permit a retry.
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  syncDirectory(dirname(path));
}
export function describeRetainedRun(directory: string, runId: string): RetainedRun {
  if (!matches(runId, uuid)) refuse();
  const lock = readEvidence(join(directory, 'operator.lock'));
  const value = object(lock.value, ['run_id', 'revision']);
  const report = readEvidence(join(directory, `${runId}.json`));
  const data = object(report.value);
  const migration = object(data.migration);
  if (value.run_id !== runId || data.run_id !== runId || value.revision !== data.revision
    || !matches(data.revision, hex40) || !matches(data.artifact_digest, hex64) || !matches(data.manifest_digest, hex64)
    || !matches(data.target, /^(local|supabase:[a-z]{20})$/) || data.result !== 'failed' || data.stage !== 'deploy'
    || data.deployment !== 'unknown' || data.deploy_id !== null || data.lock_retained !== true || data.reporting !== 'written'
    || migration.result !== 'success' || migration.database_outcome !== 'committed'
    || migration.manifest_digest !== data.manifest_digest || migration.source_revision !== data.revision) refuse();
  return { run_id: runId, revision: data.revision, artifact_digest: data.artifact_digest,
    manifest_digest: data.manifest_digest, target: data.target, report_sha256: report.identity.sha256,
    lock: { ...lock.identity, value: { run_id: runId, revision: data.revision } } };
}
function envelope(kind: string, binding: ReleaseBinding, previous: string | null, value: unknown): RecordEnvelope {
  const body = { version: 1 as const, kind, binding, previous_hash: previous, value };
  return { ...body, sha256: sha256(canonical(body)) };
}
function readRecord(path: string, kind: string, binding: ReleaseBinding): RecordEnvelope {
  const data = object(readEvidence(path).value, ['version', 'kind', 'binding', 'previous_hash', 'value', 'sha256']);
  validateBinding(data.binding);
  const expected = envelope(kind, binding, data.previous_hash as string | null, data.value);
  if (!equal(data, expected)) refuse();
  return expected;
}
function optionalRecord(path: string, kind: string, binding: ReleaseBinding): RecordEnvelope | null {
  try { return readRecord(path, kind, binding); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
function paths(directory: string, binding: ReleaseBinding) {
  const run = join(directory, 'runs', binding.run_id);
  return { run, rootLock: join(directory, 'operator.lock'), childLock: join(run, 'operator.lock') };
}
function lockValue(binding: ReleaseBinding, intentHash: string) { return { version: 1, binding, intent_hash: intentHash }; }
function outcomeValue(value: unknown): JournalOutcome {
  const data = object(value, ['result', 'stage', 'deployment', 'deploy_id', 'retain_lock']);
  if ((data.result !== 'success' && data.result !== 'failed') || !matches(data.stage, /^[a-z_]{1,40}$/)
    || typeof data.deployment !== 'string' || !['not_started', 'unknown', 'queued', 'failed', 'ready'].includes(data.deployment)
    || (data.deploy_id !== null && !matches(data.deploy_id, deployId)) || typeof data.retain_lock !== 'boolean'
    || (data.result === 'success' && (data.stage !== 'complete' || data.deployment !== 'ready' || data.deploy_id === null))) refuse();
  return data as unknown as JournalOutcome;
}
export function readReleaseJournal(directory: string, expected: ReleaseBinding): JournalState {
  const binding = validateBinding(expected), p = paths(directory, binding);
  privateDirectory(p.run, false);
  const allowed = new Set(['intent.json', 'locked.json', 'operator.lock', 'create-intent.json', 'acknowledged.json', 'outcome.json']);
  if (fs.readdirSync(p.run).some(name => !allowed.has(name))) refuse();
  const intent = readRecord(join(p.run, 'intent.json'), 'intent', binding);
  if (intent.previous_hash !== null) refuse();
  const intentData = object(intent.value, ['approval']);
  const approval = intentData.approval === null ? null : parseSupersessionApproval(intentData.approval);
  if (approval && !equal(approval.next, binding)) refuse();
  const locked = readRecord(join(p.run, 'locked.json'), 'locked', binding);
  const lockedData = object(locked.value, ['lock']);
  if (locked.previous_hash !== intent.sha256) refuse();
  const create = optionalRecord(join(p.run, 'create-intent.json'), 'create-intent', binding);
  const ack = optionalRecord(join(p.run, 'acknowledged.json'), 'acknowledged', binding);
  const outcome = optionalRecord(join(p.run, 'outcome.json'), 'outcome', binding);
  if (create && (create.previous_hash !== locked.sha256 || !equal(create.value, { deployment: 'unknown', deploy_id: null }))) refuse();
  let id: string | null = null;
  if (ack) {
    const value = object(ack.value, ['deploy_id']);
    if (!create || ack.previous_hash !== create.sha256 || !matches(value.deploy_id, deployId)) refuse();
    id = value.deploy_id;
  }
  const result = outcome ? outcomeValue(outcome.value) : null;
  if (outcome && (outcome.previous_hash !== (create ? (result!.deploy_id ? ack?.sha256 : create.sha256) : locked.sha256)
    || (result!.deploy_id !== null && result!.deploy_id !== id)
    || (result!.result === 'success' && (!create || !ack))
    || (create && result!.deployment === 'not_started')
    || (!create && result!.deployment !== 'not_started' && result!.deployment !== 'unknown')
    || (!result!.retain_lock && (approval || ['unknown', 'queued'].includes(result!.deployment)
      || (result!.deployment === 'ready' && result!.result !== 'success'))))) refuse();
  if (approval) {
    if (!equal(describeRetainedRun(directory, approval.previous.run_id), approval.previous)) refuse();
    const receipt = readRecord(join(directory, 'supersessions', `${approval.previous.run_id}.json`), 'supersession', binding);
    if (receipt.previous_hash !== locked.sha256 || !equal(receipt.value, approval)) refuse();
    const childLock = readEvidence(p.childLock);
    if (!equal(childLock.value, lockValue(binding, intent.sha256)) || !equal(childLock.identity, lockedData.lock)) refuse();
  } else {
    try {
      const rootLock = readEvidence(p.rootLock);
      if (!equal(rootLock.value, lockValue(binding, intent.sha256)) || !equal(rootLock.identity, lockedData.lock)) refuse();
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !result || result.retain_lock) throw error;
    }
  }
  return { binding, approval, create_intent: Boolean(create), deploy_id: id, outcome: result };
}
export function createReleaseJournal(directory: string, binding: ReleaseBinding, approval?: SupersessionApproval) {
  validateBinding(binding);
  if (approval) {
    parseSupersessionApproval(approval);
    if (!equal(approval.next, binding) || !equal(describeRetainedRun(directory, approval.previous.run_id), approval.previous)) refuse();
  }
  if (fs.lstatSync(join(directory, `${binding.run_id}.json`), { throwIfNoEntry: false })) throw new RunIdentityConflict();
  durableDirectory(directory);
  durableDirectory(join(directory, 'runs'));
  const p = paths(directory, binding);
  try { durableDirectory(p.run, true); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new RunIdentityConflict();
    throw error;
  }
  const intent = envelope('intent', binding, null, { approval: approval ?? null });
  writeReleaseEvidence(join(p.run, 'intent.json'), intent);
  const lockPath = approval ? p.childLock : p.rootLock;
  writeReleaseEvidence(lockPath, lockValue(binding, intent.sha256));
  const acquiredLock = readEvidence(lockPath).identity;
  const locked = envelope('locked', binding, intent.sha256, { lock: acquiredLock });
  writeReleaseEvidence(join(p.run, 'locked.json'), locked);
  if (approval) {
    durableDirectory(join(directory, 'supersessions'));
    writeReleaseEvidence(join(directory, 'supersessions', `${approval.previous.run_id}.json`), envelope('supersession', binding, locked.sha256, approval));
  }
  let createHash: string | null = null;
  let ackHash: string | null = null;
  let persistenceFailed = false;
  const checked = () => {
    const state = readReleaseJournal(directory, binding);
    if (!equal(readEvidence(lockPath).identity, acquiredLock)) refuse();
    return state;
  };
  const append = (name: string, kind: string, previous: string, value: unknown): string => {
    try {
      const record = envelope(kind, binding, previous, value);
      writeReleaseEvidence(join(p.run, name), record);
      return record.sha256;
    } catch (error) { persistenceFailed = true; throw error; }
  };
  checked();
  return {
    binding,
    check: checked,
    beforeCreate() {
      const state = checked();
      if (state.create_intent || state.outcome || persistenceFailed) refuse();
      createHash = append('create-intent.json', 'create-intent', locked.sha256, { deployment: 'unknown', deploy_id: null });
    },
    acknowledge(id: string) {
      const state = checked();
      if (!matches(id, deployId) || !createHash || !state.create_intent || state.deploy_id || persistenceFailed) refuse();
      // A late response after cancellation may add an ID without rewriting the failed report.
      ackHash = append('acknowledged.json', 'acknowledged', createHash, { deploy_id: id });
    },
    finish(outcome: JournalOutcome): boolean {
      const state = checked();
      if (state.outcome || persistenceFailed) refuse();
      outcomeValue(outcome);
      if (outcome.deploy_id !== state.deploy_id) refuse();
      const retain = Boolean(approval) || outcome.retain_lock;
      append('outcome.json', 'outcome', ackHash ?? createHash ?? locked.sha256, { ...outcome, retain_lock: retain });
      if (!retain) {
        checked();
        fs.unlinkSync(lockPath);
        syncDirectory(dirname(lockPath));
      }
      return retain;
    },
  };
}
