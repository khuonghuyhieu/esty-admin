import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, rmdirSync } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { canonical, sha256, verifyArtifact } from './artifact.js';
import { inputPhases, snapshotCaSuccessor, snapshotPreparedTransfer } from './activation-input-helper.js';
import type { InputRequest, PreparedTransferSnapshot } from './activation-input-helper.js';
import { retainedActivation } from './activation-retained.mjs';
import { validateActivationPacket, verifyActivationArtifact } from './activation-journal.js';
import { failedPreflightProof, failedPreflightRun, failedPreflightStatus } from './activation-preflight-disposition.mjs';
import { privateDirectory } from './private-files.mjs';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';

export interface TransferGuard { digest: string; verify(): unknown }
interface ApprovedGh { path: string; sha256: string; home: string; configDirectory: string }

const repository = 'khuonghuyhieu/esty-admin', environment = 'be-production';
const phaseDestinations = ['BE_ACTIVATION_BRIDGE_INPUTS', 'BE_ACTIVATION_ROLE_INPUTS', 'BE_ACTIVATION_MIGRATION_INPUTS',
  'BE_ACTIVATION_BOOTSTRAP_INPUTS', 'BE_ACTIVATION_APP_INPUTS'] as const;
const destinations = [...phaseDestinations, 'VERCEL_CONFIGURATION_TOKEN'] as const;
const sources = ['bridge-config', 'roles', 'migration', 'bootstrap', 'app-config', 'configurationToken'] as const;
type Destination = typeof destinations[number];
interface TransferPlan {
  version: 1; repository: typeof repository; environment: typeof environment; destinations: readonly Destination[];
  inputs: string; requestDigest: string; receiptDigest: string; inventoryDigest: string; executableDigest: string;
  gh: { path: string; sha256: string; configDirectory: string }; reports: string;
}
interface ReplacementPlan extends Omit<TransferPlan, 'version'> {
  version: 2; successor: string; successorDigest: string;
}
interface TransferBinding {
  planDigest: string; requestDigest: string; receiptDigest: string; inventoryDigest: string; executableDigest: string;
}
type Outcome = 'NOT_STARTED' | 'UNKNOWN' | 'ACKNOWLEDGED';
const reasons = ['operation_refused', 'guard_mismatch', 'executable_mismatch', 'snapshot_mismatch', 'collision', 'attempt_exists',
  'child_failed', 'stdin_failed', 'child_timeout', 'child_output_limit', 'cancelled', 'cleanup_refused', 'evidence_refused'] as const;
type Reason = typeof reasons[number];
class TransferFailure extends Error {
  constructor(readonly reason: Reason, readonly destination: Destination | 'NONE' = 'NONE', readonly outcome: Outcome = 'NOT_STARTED') {
    super(`TRANSFER_REFUSED: reason=${reason} destination=${destination} outcome=${outcome}; no private value is disclosed.`);
  }
}
function refuse(reason: Reason = 'operation_refused', destination: Destination | 'NONE' = 'NONE', outcome: Outcome = 'NOT_STARTED'): never {
  throw new TransferFailure(reason, destination, outcome);
}
export function transferFailureMessage(error: unknown): string {
  if (error instanceof TransferFailure && reasons.includes(error.reason)
    && (error.destination === 'NONE' || destinations.includes(error.destination))
    && ['NOT_STARTED', 'UNKNOWN', 'ACKNOWLEDGED'].includes(error.outcome)) {
    return new TransferFailure(error.reason, error.destination, error.outcome).message;
  }
  return new TransferFailure('operation_refused').message;
}
function safeFailure(error: unknown): TransferFailure {
  return error instanceof TransferFailure ? error : new TransferFailure('operation_refused');
}
function exactKeys(value: unknown, keys: readonly string[]): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function digest(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function canonicalPath(path: string): void {
  if (typeof path !== 'string' || path.length > 4096 || /[\u0000-\u001f\u007f]/.test(path)
    || !isAbsolute(path) || resolve(path) !== path || path === '/') refuse();
}
function checkPaths(inputs: string, configDirectory: string, reports: string): void {
  for (const path of [inputs, configDirectory, reports]) canonicalPath(path);
  // The approved profile is a path binding only. Never inspect its directory or auth files.
  if ([inputs, configDirectory].some(path => reports === path || reports.startsWith(`${path}/`) || path.startsWith(`${reports}/`))) refuse();
  privateDirectory(reports, false);
  if (realpathSync(reports) !== reports) refuse();
}
function verifyGuard(guard: TransferGuard, expected = guard?.digest): { digest: string; gh: ApprovedGh } {
  if (!guard || !digest(expected) || guard.digest !== expected || typeof guard.verify !== 'function') refuse('guard_mismatch');
  let manifest: unknown;
  try { manifest = guard.verify(); } catch { refuse('guard_mismatch'); }
  if (guard.digest !== expected || !manifest || typeof manifest !== 'object' || !Object.hasOwn(manifest, 'transferGh')) refuse('guard_mismatch');
  // This allowlist belongs to the independently approved, hash-verified tool manifest.
  // Caller-supplied command/plan fields are assertions against it, never approval.
  const gh = (manifest as { transferGh: unknown }).transferGh;
  if (!exactKeys(gh, ['path', 'sha256', 'home', 'configDirectory'])) refuse('guard_mismatch');
  const approved = gh as ApprovedGh;
  if (!digest(approved.sha256)) refuse('guard_mismatch');
  // HOME/profile are approved lexical bindings, not directories to inspect or discover.
  try { for (const path of [approved.path, approved.home, approved.configDirectory]) canonicalPath(path); }
  catch { refuse('guard_mismatch'); }
  return { digest: expected, gh: { path: approved.path, sha256: approved.sha256,
    home: approved.home, configDirectory: approved.configDirectory } };
}
function assertSource(request: InputRequest): void {
  const pin = retainedActivation;
  if (request.revision !== pin.revision || request.tree !== pin.tree || request.sourceDigest !== pin.sourceDigest
    || request.artifactDigest !== pin.artifactDigest || request.projectId !== pin.project || request.scopeId !== pin.scope
    || request.target !== pin.target || request.buildRun !== pin.runId) refuse('snapshot_mismatch');
}
const statKeys = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'] as const;
interface GhIdentity { path: string; stat: BigIntStats; home: string; configDirectory: string }
function sameStat(left: BigIntStats, right: BigIntStats): boolean { return statKeys.every(key => left[key] === right[key]); }
function assertGhIdentity(gh: GhIdentity): void {
  try {
    if (realpathSync(gh.path) !== gh.path || !sameStat(gh.stat, lstatSync(gh.path, { bigint: true }))) refuse('executable_mismatch');
  } catch { refuse('executable_mismatch'); }
}
function verifyGh(path: string, approved: string, configDirectory: string, trusted: ApprovedGh): GhIdentity {
  // Refuse even a self-consistent unapproved executable before file or payload access.
  if (path !== trusted.path || approved !== trusted.sha256) refuse('executable_mismatch');
  if (configDirectory !== trusted.configDirectory) refuse('guard_mismatch');
  try {
    canonicalPath(path);
    if (!digest(approved) || realpathSync(path) !== path) refuse('executable_mismatch');
    const pathBefore = lstatSync(path, { bigint: true });
    if (!pathBefore.isFile()) refuse('executable_mismatch');
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd, { bigint: true });
      if (!sameStat(pathBefore, before) || !before.isFile() || (before.uid !== BigInt(process.getuid!()) && before.uid !== 0n)
        || (before.mode & 0o022n) !== 0n || (before.mode & 0o111n) === 0n
        || before.size <= 0n || before.size > 268435456n) refuse('executable_mismatch');
      accessSync(path, constants.X_OK);
      const hash = createHash('sha256'), bytes = Buffer.alloc(65536);
      let total = 0, count: number;
      while ((count = readSync(fd, bytes, 0, bytes.length, null)) > 0) {
        total += count;
        if (total > 268435456) refuse('executable_mismatch');
        hash.update(bytes.subarray(0, count));
      }
      const after = fstatSync(fd, { bigint: true });
      if (!sameStat(before, after) || BigInt(total) !== before.size || hash.digest('hex') !== approved) refuse('executable_mismatch');
      const identity = { path, stat: after, home: trusted.home, configDirectory: trusted.configDirectory };
      assertGhIdentity(identity);
      return identity;
    } finally { closeSync(fd); }
  } catch { refuse('executable_mismatch'); }
}
function validatePlan(value: unknown, approved: string): TransferPlan {
  if (!exactKeys(value, ['version', 'repository', 'environment', 'destinations', 'inputs', 'requestDigest', 'receiptDigest',
    'inventoryDigest', 'executableDigest', 'gh', 'reports'])) refuse();
  const plan = value as TransferPlan;
  if (plan.version !== 1 || plan.repository !== repository || plan.environment !== environment
    || !Array.isArray(plan.destinations) || plan.destinations.length !== destinations.length
    || !destinations.every((name, index) => plan.destinations[index] === name)
    || ![approved, plan.requestDigest, plan.receiptDigest, plan.inventoryDigest, plan.executableDigest].every(digest)
    || !exactKeys(plan.gh, ['path', 'sha256', 'configDirectory']) || !digest(plan.gh.sha256)
    || sha256(canonical(plan)) !== approved) refuse();
  canonicalPath(plan.gh.path);
  checkPaths(plan.inputs, plan.gh.configDirectory, plan.reports);
  return plan;
}

export function inspectPreparedTransfer(inputs: string, requestDigest: string, ghPath: string, ghSha256: string,
  ghConfigDirectory: string, reportDirectory: string, guard: TransferGuard): object {
  let snapshot: PreparedTransferSnapshot | undefined;
  try {
    const trusted = verifyGuard(guard), executableDigest = trusted.digest;
    checkPaths(inputs, ghConfigDirectory, reportDirectory);
    const gh = verifyGh(ghPath, ghSha256, ghConfigDirectory, trusted.gh);
    snapshot = snapshotPreparedTransfer(inputs, requestDigest, assertSource);
    const receiptDigest = sha256(canonical(snapshot.receipt));
    const plan: TransferPlan = { version: 1, repository, environment, destinations: [...destinations], inputs, requestDigest,
      receiptDigest, inventoryDigest: sha256(canonical(snapshot.files)), executableDigest,
      gh: { path: ghPath, sha256: ghSha256, configDirectory: ghConfigDirectory }, reports: reportDirectory };
    const planDigest = sha256(canonical(plan));
    verifyGuard(guard, executableDigest); assertGhIdentity(gh);
    writeReleaseEvidence(join(reportDirectory, 'transfer-plan.json'), plan);
    return { planDigest, requestDigest, receiptDigest, phases: snapshot.receipt.phases };
  } catch (error) { throw safeFailure(error); }
  finally { snapshot?.dispose(); }
}

export function acknowledgedTransferPlan(planPath: string, planDigest: string, guard: TransferGuard): TransferPlan {
  const trusted = verifyGuard(guard);
  canonicalPath(planPath);
  if (basename(planPath) !== 'transfer-plan.json') refuse();
  const plan = validatePlan(readEvidence(planPath).value, planDigest);
  if (dirname(planPath) !== plan.reports || plan.gh.path !== trusted.gh.path || plan.gh.sha256 !== trusted.gh.sha256
    || plan.gh.configDirectory !== trusted.gh.configDirectory) refuse('guard_mismatch');
  const binding: TransferBinding = { planDigest, requestDigest: plan.requestDigest, receiptDigest: plan.receiptDigest,
    inventoryDigest: plan.inventoryDigest, executableDigest: plan.executableDigest };
  if (!matchesEvidence(join(plan.reports, 'transfer-attempt.json'), attemptRecord(binding))
    || !destinations.every(destination => acknowledged(plan, binding, destination))
    || !matchesEvidence(join(plan.reports, 'transfer-complete.json'), completeRecord(binding))) refuse('attempt_exists', 'NONE', 'UNKNOWN');
  verifyGh(plan.gh.path, plan.gh.sha256, plan.gh.configDirectory, trusted.gh);
  return plan;
}
export function acknowledgedTransferSnapshot(planPath: string, planDigest: string, guard: TransferGuard) {
  const plan = acknowledgedTransferPlan(planPath, planDigest, guard);
  const snapshot = snapshotPreparedTransfer(plan.inputs, plan.requestDigest, assertSource);
  try {
    if (sha256(canonical(snapshot.receipt)) !== plan.receiptDigest || sha256(canonical(snapshot.files)) !== plan.inventoryDigest) refuse('snapshot_mismatch');
    verifyGuard(guard);
    return { plan, snapshot };
  } catch (error) { snapshot.dispose(); throw error; }
}

function attemptRecord(binding: TransferBinding, targets: readonly Destination[] = destinations) {
  return { version: 1, kind: 'attempt', repository, environment, binding, destinations: [...targets] };
}
function startedRecord(binding: TransferBinding, destination: Destination) {
  return { version: 1, kind: 'started', binding, destination, state: 'unknown' };
}
function acknowledgedRecord(binding: TransferBinding, destination: Destination) {
  return { version: 1, kind: 'acknowledged', binding, destination, startedDigest: sha256(canonical(startedRecord(binding, destination))) };
}
function completeRecord(binding: TransferBinding, targets: readonly Destination[] = destinations) {
  return { version: 1, kind: 'complete', repository, environment, binding,
    acknowledgements: targets.map(destination => ({ destination, acknowledgementDigest: sha256(canonical(acknowledgedRecord(binding, destination))) })) };
}
function evidencePath(plan: Pick<TransferPlan, 'reports'>, destination: Destination, kind: 'started' | 'ack'): string {
  return join(plan.reports, `transfer-${destination}.${kind}.json`);
}
function exists(path: string): boolean { return !!lstatSync(path, { throwIfNoEntry: false }); }
function matchesEvidence(path: string, expected: unknown): boolean {
  try { return canonical(readEvidence(path).value) === canonical(expected); } catch { return false; }
}
function acknowledged(plan: Pick<TransferPlan, 'reports'>, binding: TransferBinding, destination: Destination): boolean {
  return matchesEvidence(evidencePath(plan, destination, 'started'), startedRecord(binding, destination))
    && matchesEvidence(evidencePath(plan, destination, 'ack'), acknowledgedRecord(binding, destination));
}
function refusePriorAttempt(plan: Pick<TransferPlan, 'reports'>, binding: TransferBinding, targets: readonly Destination[] = destinations): void {
  let retained = exists(join(plan.reports, 'transfer-attempt.json')) || exists(join(plan.reports, 'transfer-complete.json'));
  for (const destination of targets) {
    const started = exists(evidencePath(plan, destination, 'started')), ack = exists(evidencePath(plan, destination, 'ack'));
    retained ||= started || ack;
    if ((started || ack) && !acknowledged(plan, binding, destination)) refuse('attempt_exists', destination, 'UNKNOWN');
  }
  if (retained) {
    const complete = matchesEvidence(join(plan.reports, 'transfer-attempt.json'), attemptRecord(binding, targets))
      && targets.every(destination => acknowledged(plan, binding, destination))
      && matchesEvidence(join(plan.reports, 'transfer-complete.json'), completeRecord(binding, targets));
    refuse('attempt_exists', 'NONE', complete ? 'ACKNOWLEDGED' : 'UNKNOWN');
  }
}
function checkEvidence(plan: Pick<TransferPlan, 'reports'>, binding: TransferBinding, count: number, targets: readonly Destination[] = destinations): void {
  if (!matchesEvidence(join(plan.reports, 'transfer-attempt.json'), attemptRecord(binding, targets))) refuse('evidence_refused');
  for (const destination of targets.slice(0, count)) {
    if (!acknowledged(plan, binding, destination)) refuse('evidence_refused', destination, 'UNKNOWN');
  }
}

const maximumOutput = 65536, childTimeout = 30000;
async function runGh(gh: GhIdentity, args: string[], signal: AbortSignal, payload?: Buffer, publicResponse = false): Promise<Buffer | undefined> {
  if (signal.aborted) refuse('cancelled');
  assertGhIdentity(gh);
  // Only pinned gh receives approved HOME/profile; temporary work stays separately owned.
  const scratch = mkdtempSync(join(realpathSync('/tmp'), 'esty-activation-transfer-'));
  const stateDirectory = join(scratch, 'state');
  const env = { PATH: '/usr/bin:/bin', HOME: gh.home, TMPDIR: scratch, GH_CONFIG_DIR: gh.configDirectory,
    // Pinned go-gh supports this ordinary, noncredential state location; not a filesystem sandbox.
    XDG_STATE_HOME: stateDirectory,
    GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', NO_COLOR: '1',
    // Prevent ancillary update checks and their profile-state writes.
    GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1' };
  let result: Buffer | undefined, failure: TransferFailure | undefined;
  try {
    privateDirectory(scratch, false);
    privateDirectory(stateDirectory);
    result = await new Promise<Buffer | undefined>((accept, reject) => {
      const child = spawn(gh.path, args, { env, cwd: scratch, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const output = payload === undefined || publicResponse ? Buffer.alloc(maximumOutput) : undefined;
      let captured = 0, observed = 0, inputFinished = false, settled = false, problem: Reason | undefined;
      let deadline: NodeJS.Timeout | undefined, reapDeadline: NodeJS.Timeout | undefined;
      const finish = (reason?: Reason) => {
        if (settled) return;
        settled = true; clearTimeout(deadline); clearTimeout(reapDeadline); signal.removeEventListener('abort', aborted);
        if (reason) { output?.fill(0); reject(new TransferFailure(reason)); }
        else accept(output?.subarray(0, captured));
      };
      const stop = (reason: Reason) => {
        if (settled || problem) return;
        problem = reason;
        if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* The owned process group may already have exited. */ } }
        reapDeadline = setTimeout(() => {
          child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref(); finish(problem);
        }, 1000);
      };
      const aborted = () => stop('cancelled');
      const drain = (bytes: Buffer, capture: boolean) => {
        observed += bytes.length;
        if (observed > maximumOutput) stop('child_output_limit');
        else if (capture && output && !problem) { bytes.copy(output, captured); captured += bytes.length; }
        bytes.fill(0);
      };
      child.stdout.on('data', (bytes: Buffer) => drain(bytes, true));
      child.stderr.on('data', (bytes: Buffer) => drain(bytes, false));
      child.stdout.on('error', () => stop('child_failed')); child.stderr.on('error', () => stop('child_failed'));
      child.stdin.once('error', () => stop('stdin_failed'));
      child.stdin.once('finish', () => { inputFinished = true; });
      child.once('error', () => stop('child_failed'));
      child.once('close', (code, termination) => {
        finish(problem ?? (signal.aborted ? 'cancelled' : code !== 0 || termination !== null || !inputFinished ? 'child_failed' : undefined));
      });
      deadline = setTimeout(() => stop('child_timeout'), childTimeout);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
      else { try { child.stdin.end(payload); } catch { stop('stdin_failed'); } }
    });
  } catch (error) { failure = safeFailure(error); }
  finally {
    try {
      // Remove only our ordinary-state subtree; refuse unexpected contents elsewhere in scratch.
      rmSync(stateDirectory, { recursive: true, force: true });
      rmdirSync(scratch);
    } catch { failure ??= new TransferFailure('cleanup_refused'); }
  }
  if (failure) { result?.fill(0); throw failure; }
  return result;
}

const gitObjectId = /^[a-f0-9]{40}$/;
function projectedMainIdentity(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('sha' in value) || !('commit' in value)
    || typeof value.sha !== 'string' || !gitObjectId.test(value.sha) || !exactKeys(value, ['sha', 'commit'])) return false;
  const commit = value.commit;
  if (!commit || typeof commit !== 'object' || !('tree' in commit) || !exactKeys(commit, ['tree'])) return false;
  const tree = commit.tree;
  return !!tree && typeof tree === 'object' && 'sha' in tree && typeof tree.sha === 'string'
    && gitObjectId.test(tree.sha) && exactKeys(tree, ['sha']);
}

export async function recoveryGithubRead(path: string, guard: TransferGuard, signal: AbortSignal): Promise<unknown> {
  const allowed = ['/commits/main', '/actions/runs/42970824679', '/deployments/7703208254',
    '/deployments/7703208254/statuses?per_page=100'];
  if (!allowed.includes(path)) refuse();
  const trusted = verifyGuard(guard);
  const gh = verifyGh(trusted.gh.path, trusted.gh.sha256, trusted.gh.configDirectory, trusted.gh);
  const args = ['api', `repos/${repository}${path}`, '--method', 'GET'];
  if (path === '/commits/main') args.push('--jq', '{sha: .sha, commit: {tree: {sha: .commit.tree.sha}}}');
  const bytes = await runGh(gh, args, signal, undefined, true);
  if (!bytes) refuse();
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (path === '/commits/main' && !projectedMainIdentity(value)) refuse('snapshot_mismatch');
    return value;
  } finally { bytes.fill(0); }
}

export async function recoveryGithubStatus(journal: number, state: string, description: string,
  guard: TransferGuard, signal: AbortSignal): Promise<void> {
  if (journal !== 7703208254 || state !== 'in_progress' || typeof description !== 'string'
    || /[\r\n]/.test(description) || !/^activation:(roles|migration|bootstrap|app-config):(intent|outcome):[a-f0-9]{64}$/.test(description)) refuse();
  if (signal.aborted) refuse('cancelled');
  const trusted = verifyGuard(guard);
  const gh = verifyGh(trusted.gh.path, trusted.gh.sha256, trusted.gh.configDirectory, trusted.gh);
  const logUrl = `https://github.com/${repository}/actions/runs/42970824679`;
  const payload = Buffer.from(canonical({ state, description, auto_inactive: false, log_url: logUrl }));
  let bytes: Buffer | undefined;
  try {
    bytes = await runGh(gh, ['api', `repos/${repository}/deployments/7703208254/statuses`, '--method', 'POST',
      '-H', 'X-GitHub-Api-Version: 2026-03-10', '--input', '-'], signal, payload, true);
    if (!bytes) refuse('child_failed');
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('evidence_refused');
    const status = value as Record<string, unknown>;
    if (!Number.isSafeInteger(status.id) || Number(status.id) <= 0 || status.state !== state
      || status.description !== description || status.log_url !== logUrl) refuse('evidence_refused');
  } catch (error) {
    throw new TransferFailure(safeFailure(error).reason, 'NONE', 'UNKNOWN');
  } finally { payload.fill(0); bytes?.fill(0); }
}
async function assertNames(gh: GhIdentity, signal: AbortSignal, expected: readonly Destination[], present: boolean): Promise<void> {
  const bytes = await runGh(gh, ['secret', 'list', '--env', environment, '--repo', repository, '--json', 'name'], signal);
  try {
    if (!bytes) refuse('child_failed');
    const rows: unknown = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(rows) || rows.length > 1000) refuse('child_failed');
    const names = new Set<string>();
    for (const row of rows) {
      if (!exactKeys(row, ['name']) || typeof row.name !== 'string' || !/^[A-Z_][A-Z0-9_]{0,255}$/.test(row.name)
        || names.has(row.name)) refuse('child_failed');
      names.add(row.name);
    }
    for (const destination of expected) if (names.has(destination) !== present) refuse(present ? 'snapshot_mismatch' : 'collision', destination);
  } catch (error) { throw error instanceof TransferFailure ? error : new TransferFailure('child_failed'); }
  finally { bytes?.fill(0); }
}

export async function transferPreparedSecrets(planPath: string, planDigest: string, guard: TransferGuard, signal: AbortSignal): Promise<object> {
  let snapshot: PreparedTransferSnapshot | undefined, active: Destination | undefined;
  try {
    const trusted = verifyGuard(guard); canonicalPath(planPath);
    if (basename(planPath) !== 'transfer-plan.json') refuse();
    const plan = validatePlan(readEvidence(planPath).value, planDigest);
    if (dirname(planPath) !== plan.reports || guard.digest !== plan.executableDigest) refuse('guard_mismatch');
    const binding: TransferBinding = { planDigest, requestDigest: plan.requestDigest, receiptDigest: plan.receiptDigest,
      inventoryDigest: plan.inventoryDigest, executableDigest: plan.executableDigest };
    // A retained attempt is a fence, not a resumable queue. No names query can establish value equality.
    refusePriorAttempt(plan, binding);
    if (signal.aborted) refuse('cancelled');
    const gh = verifyGh(plan.gh.path, plan.gh.sha256, plan.gh.configDirectory, trusted.gh);
    snapshot = snapshotPreparedTransfer(plan.inputs, plan.requestDigest, assertSource);
    if (sha256(canonical(snapshot.receipt)) !== plan.receiptDigest || sha256(canonical(snapshot.files)) !== plan.inventoryDigest) refuse('snapshot_mismatch');
    verifyGuard(guard, plan.executableDigest);
    await assertNames(gh, signal, destinations, false);
    try { writeReleaseEvidence(join(plan.reports, 'transfer-attempt.json'), attemptRecord(binding)); }
    catch { refusePriorAttempt(plan, binding); refuse('evidence_refused'); }
    for (let index = 0; index < destinations.length; index++) {
      const destination = destinations[index]!, source = sources[index]!;
      checkEvidence(plan, binding, index);
      if (index > 0) await assertNames(gh, signal, destinations.slice(index), false);
      if (signal.aborted) refuse('cancelled');
      assertGhIdentity(gh);
      active = destination;
      const started = startedRecord(binding, destination);
      writeReleaseEvidence(evidencePath(plan, destination, 'started'), started);
      if (!matchesEvidence(evidencePath(plan, destination, 'started'), started)) refuse('evidence_refused');
      const payload = source === 'configurationToken' ? snapshot.configurationToken : snapshot.payloads[source];
      // GitHub's PUT is not atomic absent-only: a concurrent external writer can still race the preceding names check.
      await runGh(gh, ['secret', 'set', destination, '--env', environment, '--repo', repository], signal, payload);
      writeReleaseEvidence(evidencePath(plan, destination, 'ack'), acknowledgedRecord(binding, destination));
      if (!acknowledged(plan, binding, destination)) refuse('evidence_refused');
      active = undefined;
    }
    checkEvidence(plan, binding, destinations.length);
    const complete = completeRecord(binding);
    writeReleaseEvidence(join(plan.reports, 'transfer-complete.json'), complete);
    if (!matchesEvidence(join(plan.reports, 'transfer-complete.json'), complete)) refuse('evidence_refused');
    return complete;
  } catch (error) {
    const failure = safeFailure(error);
    throw active ? new TransferFailure(failure.reason, active, 'UNKNOWN') : failure;
  } finally { snapshot?.dispose(); }
}

function replacementPlan(value: unknown, approved: string): ReplacementPlan {
  if (!exactKeys(value, ['version', 'repository', 'environment', 'destinations', 'inputs', 'requestDigest', 'receiptDigest',
    'inventoryDigest', 'executableDigest', 'gh', 'reports', 'successor', 'successorDigest'])) refuse();
  const plan = value as ReplacementPlan;
  if (plan.version !== 2 || plan.repository !== repository || plan.environment !== environment
    || canonical(plan.destinations) !== canonical(phaseDestinations)
    || ![approved, plan.requestDigest, plan.receiptDigest, plan.inventoryDigest, plan.executableDigest, plan.successorDigest].every(digest)
    || sha256(canonical(plan)) !== approved || !exactKeys(plan.gh, ['path', 'sha256', 'configDirectory']) || !digest(plan.gh.sha256)) refuse();
  canonicalPath(plan.successor); canonicalPath(plan.gh.path);
  if (basename(plan.successor) !== 'successor.json' || plan.reports !== join(dirname(plan.successor), 'replacement')) refuse();
  checkPaths(plan.inputs, plan.gh.configDirectory, plan.reports);
  return plan;
}

export function acknowledgedCaReplacement(successor: string, successorDigest: string, guard: TransferGuard) {
  const trusted = verifyGuard(guard), path = join(dirname(successor), 'replacement', 'replacement-plan.json');
  const value = readEvidence(path).value, plan = replacementPlan(value, sha256(canonical(value)));
  if (plan.successor !== successor || plan.successorDigest !== successorDigest || plan.gh.path !== trusted.gh.path
    || plan.gh.sha256 !== trusted.gh.sha256 || plan.gh.configDirectory !== trusted.gh.configDirectory) refuse('guard_mismatch');
  const binding: TransferBinding = { planDigest: sha256(canonical(plan)), requestDigest: plan.requestDigest,
    receiptDigest: plan.receiptDigest, inventoryDigest: plan.inventoryDigest, executableDigest: plan.executableDigest };
  checkEvidence(plan, binding, phaseDestinations.length, phaseDestinations);
  if (!matchesEvidence(join(plan.reports, 'transfer-complete.json'), completeRecord(binding, phaseDestinations))) refuse('evidence_refused');
  return plan;
}
export async function inspectCaReplacement(successor: string, guard: TransferGuard): Promise<object> {
  const trusted = verifyGuard(guard), current = await snapshotCaSuccessor(successor, guard);
  try {
    const gh = current.previousPlan.gh, reports = join(dirname(successor), 'replacement');
    verifyGh(gh.path, gh.sha256, gh.configDirectory, trusted.gh);
    const plan: ReplacementPlan = { version: 2, repository, environment, destinations: [...phaseDestinations],
      inputs: current.control.inputs, requestDigest: current.control.requestDigest,
      receiptDigest: sha256(canonical(current.snapshot.receipt)), inventoryDigest: sha256(canonical(current.snapshot.files)),
      executableDigest: guard.digest, gh, reports, successor, successorDigest: sha256(canonical(current.control)) };
    verifyGuard(guard);
    mkdirSync(reports, { mode: 0o700 });
    writeReleaseEvidence(join(reports, 'replacement-plan.json'), plan);
    return { plan: join(reports, 'replacement-plan.json'), planDigest: sha256(canonical(plan)) };
  } catch (error) { throw safeFailure(error); }
  finally { current.snapshot.dispose(); }
}
export async function replaceCaSecrets(planPath: string, planDigest: string, guard: TransferGuard, signal: AbortSignal): Promise<object> {
  let current: Awaited<ReturnType<typeof snapshotCaSuccessor>> | undefined, active: Destination | undefined;
  try {
    const trusted = verifyGuard(guard);
    canonicalPath(planPath);
    if (basename(planPath) !== 'replacement-plan.json') refuse();
    const plan = replacementPlan(readEvidence(planPath).value, planDigest);
    if (dirname(planPath) !== plan.reports || plan.executableDigest !== guard.digest) refuse('guard_mismatch');
    const binding: TransferBinding = { planDigest, requestDigest: plan.requestDigest, receiptDigest: plan.receiptDigest,
      inventoryDigest: plan.inventoryDigest, executableDigest: plan.executableDigest };
    refusePriorAttempt(plan, binding, phaseDestinations);
    if (signal.aborted) refuse('cancelled');
    const gh = verifyGh(plan.gh.path, plan.gh.sha256, plan.gh.configDirectory, trusted.gh);
    current = await snapshotCaSuccessor(plan.successor, guard);
    if (sha256(canonical(current.control)) !== plan.successorDigest || canonical(current.previousPlan.gh) !== canonical(plan.gh)
      || current.control.inputs !== plan.inputs || current.control.requestDigest !== plan.requestDigest
      || sha256(canonical(current.snapshot.receipt)) !== plan.receiptDigest
      || sha256(canonical(current.snapshot.files)) !== plan.inventoryDigest) refuse('snapshot_mismatch');
    verifyGuard(guard, plan.executableDigest);
    await assertNames(gh, signal, phaseDestinations, true);
    try { writeReleaseEvidence(join(plan.reports, 'transfer-attempt.json'), attemptRecord(binding, phaseDestinations)); }
    catch { refusePriorAttempt(plan, binding, phaseDestinations); refuse('evidence_refused'); }
    for (let index = 0; index < phaseDestinations.length; index++) {
      const destination = phaseDestinations[index]!;
      checkEvidence(plan, binding, index, phaseDestinations);
      if (index > 0) await assertNames(gh, signal, phaseDestinations, true);
      if (signal.aborted) refuse('cancelled');
      assertGhIdentity(gh); active = destination;
      const started = startedRecord(binding, destination);
      writeReleaseEvidence(evidencePath(plan, destination, 'started'), started);
      if (!matchesEvidence(evidencePath(plan, destination, 'started'), started)) refuse('evidence_refused');
      // Only the five fixed phase slots; never the configuration token or any provider credential.
      await runGh(gh, ['secret', 'set', destination, '--env', environment, '--repo', repository], signal, current.snapshot.payloads[inputPhases[index]!]);
      writeReleaseEvidence(evidencePath(plan, destination, 'ack'), acknowledgedRecord(binding, destination));
      if (!acknowledged(plan, binding, destination)) refuse('evidence_refused');
      active = undefined;
    }
    checkEvidence(plan, binding, phaseDestinations.length, phaseDestinations);
    const complete = completeRecord(binding, phaseDestinations);
    writeReleaseEvidence(join(plan.reports, 'transfer-complete.json'), complete);
    if (!matchesEvidence(join(plan.reports, 'transfer-complete.json'), complete)) refuse('evidence_refused');
    return complete;
  } catch (error) {
    const failure = safeFailure(error);
    throw active ? new TransferFailure(failure.reason, active, 'UNKNOWN') : failure;
  } finally { current?.snapshot.dispose(); }
}

function terminalIo(guard: TransferGuard, signal: AbortSignal) {
  const trusted = verifyGuard(guard), approved = trusted.gh;
  const gh = verifyGh(approved.path, approved.sha256, approved.configDirectory, approved);
  const call = async (path: string, payload?: Buffer): Promise<Buffer> => {
    if (!/^\/(?:deployments(?:\?[a-zA-Z0-9%=&_-]+|\/[1-9][0-9]*(?:\/statuses(?:\?per_page=100)?)?)?|actions\/runs\/[1-9][0-9]*(?:\/attempts\/1\/jobs\?per_page=100|\/artifacts\?per_page=100)?|actions\/artifacts\/[1-9][0-9]*\/zip|contents\/(?:\.github\/workflows\/be-delivery\.yml|apps\/api\/scripts\/(?:manual-activation|activation-retained)\.mjs)\?ref=[a-f0-9]{40})$/.test(path)
      || (payload !== undefined && !/^\/deployments\/[1-9][0-9]*\/statuses$/.test(path))) refuse();
    verifyGuard(guard);
    const args = ['api', `repos/${repository}${path}`, '--method', payload ? 'POST' : 'GET',
      '-H', 'X-GitHub-Api-Version: 2026-03-10'];
    if (payload) args.push('--input', '-');
    const bytes = await runGh(gh, args, signal, payload, true);
    if (!bytes) refuse('child_failed');
    return bytes;
  };
  const read = async (path: string): Promise<unknown> => {
    const bytes = await call(path);
    try { return JSON.parse(bytes.toString('utf8')); } finally { bytes.fill(0); }
  };
  return { read,
    download: (id: number) => call(`/actions/artifacts/${id}/zip`),
    async post(path: string, value: unknown): Promise<unknown> {
      const payload = Buffer.from(canonical(value));
      let bytes: Buffer | undefined;
      try { bytes = await call(path, payload); return JSON.parse(bytes.toString('utf8')); }
      finally { bytes?.fill(0); payload.fill(0); }
    },
  };
}
async function terminalProof(guard: TransferGuard, signal: AbortSignal, bundleRoot: string, journal?: number) {
  canonicalPath(bundleRoot);
  const io = terminalIo(guard, signal);
  let intent: Record<string, unknown> | undefined;
  if (journal !== undefined) intent = await io.read(`/deployments/${journal}`) as Record<string, unknown>;
  else {
    for (let page = 1; ; page++) {
      if (page > 20) refuse();
      const rows = await io.read(`/deployments?task=deploy%3Aesty-be-ci&environment=${environment}&per_page=100&page=${page}`);
      if (!Array.isArray(rows) || rows.length > 100) refuse();
      for (const row of rows) if (row?.payload?.run === failedPreflightRun) {
        if (intent) refuse();
        intent = row;
      }
      if (rows.length < 100) break;
    }
  }
  if (!intent) refuse();
  const proof = await failedPreflightProof(io, intent, async (packet: unknown) => {
    const approved = validateActivationPacket(packet, sha256(canonical(packet))), pin = retainedActivation;
    const artifact = verifyArtifact(join(bundleRoot, 'artifact'), pin.artifactDigest,
      { revision: pin.revision, repository: `https://github.com/${pin.repository}`, migrationDigest: approved.targetDigest, release: true });
    if (artifact.manifest.source.tree !== pin.tree || artifact.manifest.source.digest !== pin.sourceDigest
      || artifact.manifest.build.node !== '24.22.1' || artifact.manifest.build.platform !== 'linux' || artifact.manifest.build.arch !== 'x64') refuse();
    verifyActivationArtifact(artifact, approved);
  });
  const statuses = await io.read(`/deployments/${proof.journal}/statuses?per_page=100`);
  if (!Array.isArray(statuses) || statuses.length !== 0) refuse('attempt_exists', 'NONE', 'UNKNOWN');
  verifyGuard(guard); signal.throwIfAborted();
  return { io, proof };
}
export async function inspectFailedPreflight(args: string[], guard: TransferGuard, signal: AbortSignal): Promise<object> {
  const [planPath, planDigest, bundleRoot] = args;
  if (args.length !== 3 || !planPath || !planDigest || !bundleRoot) refuse();
  const plan = acknowledgedTransferPlan(planPath, planDigest, guard);
  const reports = join(dirname(plan.reports), `failed-preflight-${failedPreflightRun}`);
  const { proof } = await terminalProof(guard, signal, bundleRoot);
  const record = { version: 1, executableDigest: guard.digest, originalPlan: planPath, originalPlanDigest: planDigest, bundleRoot, proof };
  mkdirSync(reports, { mode: 0o700 });
  const path = join(reports, 'terminal-proof.json');
  writeReleaseEvidence(path, record);
  return { path, digest: sha256(canonical(record)), proof };
}
export async function recordFailedPreflight(path: string, approvedDigest: string, guard: TransferGuard, signal: AbortSignal): Promise<object> {
  try {
    canonicalPath(path); verifyGuard(guard);
    if (basename(path) !== 'terminal-proof.json' || !digest(approvedDigest)) refuse();
    const record = readEvidence(path).value as { version: number; executableDigest: string; originalPlan: string;
      originalPlanDigest: string; bundleRoot: string; proof: Awaited<ReturnType<typeof failedPreflightProof>> };
    if (!exactKeys(record, ['version', 'executableDigest', 'originalPlan', 'originalPlanDigest', 'bundleRoot', 'proof'])
      || sha256(canonical(record)) !== approvedDigest || record.version !== 1 || record.executableDigest !== guard.digest) refuse();
    const plan = acknowledgedTransferPlan(record.originalPlan, record.originalPlanDigest, guard);
    const reports = join(dirname(plan.reports), `failed-preflight-${failedPreflightRun}`);
    if (dirname(path) !== reports || !Number.isSafeInteger(record.proof?.journal) || record.proof.journal <= 0) refuse();
    const attemptPath = join(reports, 'terminal-attempt.json'), ackPath = join(reports, 'terminal-ack.json');
    if (exists(attemptPath) || exists(ackPath)) refuse('attempt_exists', 'NONE', 'UNKNOWN');
    const { io, proof } = await terminalProof(guard, signal, record.bundleRoot, record.proof.journal);
    if (canonical(proof) !== canonical(record.proof)) refuse('snapshot_mismatch');
    return await commitFailedPreflightDisposition(io, proof, approvedDigest, reports, guard, signal);
  } catch (error) { throw safeFailure(error); }
}
export async function commitFailedPreflightDisposition(io: Pick<ReturnType<typeof terminalIo>, 'post'>,
  proof: Awaited<ReturnType<typeof failedPreflightProof>>, approvedDigest: string, reports: string,
  guard: TransferGuard, signal: AbortSignal): Promise<object> {
  let attempted = false;
  try {
    verifyGuard(guard); signal.throwIfAborted();
    if (!digest(approvedDigest) || proof.version !== 1 || proof.kind !== 'failed-preflight-no-effects'
      || proof.workflowRun !== failedPreflightRun || proof.repository !== repository || proof.environment !== environment
      || proof.project !== retainedActivation.project || proof.artifact !== retainedActivation.artifactDigest
      || !Number.isSafeInteger(proof.journal) || proof.journal <= 0) refuse();
    canonicalPath(reports); privateDirectory(reports, false);
    const attemptPath = join(reports, 'terminal-attempt.json'), ackPath = join(reports, 'terminal-ack.json');
    if (exists(attemptPath) || exists(ackPath)) refuse('attempt_exists', 'NONE', 'UNKNOWN');
    const status = failedPreflightStatus(proof);
    try { writeReleaseEvidence(attemptPath, { version: 1, proofDigest: approvedDigest, journal: proof.journal, status, outcome: 'UNKNOWN' }); }
    catch { if (exists(attemptPath)) refuse('attempt_exists', 'NONE', 'UNKNOWN'); throw new Error('Terminal intent unavailable.'); }
    attempted = true;
    const result = await io.post(`/deployments/${proof.journal}/statuses`, status) as Record<string, unknown>;
    if (!Number.isSafeInteger(result.id) || Number(result.id) <= 0 || result.state !== status.state
      || result.description !== status.description || result.log_url !== status.log_url) refuse('evidence_refused');
    const ack = { version: 1, proofDigest: approvedDigest, journal: proof.journal, statusId: result.id,
      state: 'error', disposition: 'failed-preflight-no-effects', outcome: 'ACKNOWLEDGED' };
    writeReleaseEvidence(ackPath, ack);
    if (!matchesEvidence(ackPath, ack)) refuse('evidence_refused');
    return ack;
  } catch (error) {
    const failure = safeFailure(error);
    throw attempted ? new TransferFailure(failure.reason, 'NONE', 'UNKNOWN') : failure;
  }
}
