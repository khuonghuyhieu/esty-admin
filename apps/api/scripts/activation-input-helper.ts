import { spawn } from 'node:child_process';
import { randomUUID, X509Certificate } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactTarget, canonical, readArtifactFile, sha256, verifyArtifact } from './artifact.js';
import { createRecoveredActivationJournal, readActivationJournal, validateActivationPacket, verifyActivationArtifact } from './activation-journal.js';
import { bootstrapInputs, decodePhaseInput, migrationInputs, phaseInputEnvironment, roleInputEnvelope, roleInputs, runtimeInputs } from './activation-inputs.js';
import { bootstrapIdentity } from '../src/app-foundation/application/service.js';
import { uuidPattern as authUserUuidPattern } from '../src/app-foundation/application/validation.js';
import { ConfigurationError, parseAppOperatorConfig, parseMigrationConfig } from '../src/config/config.js';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };
import { readHiddenPassword } from './hidden-input.mjs';
import { privateDirectory, readPrivate, readPrivateBytes, writePrivate } from './private-files.mjs';
import { diagnoseRoleAuthority } from './activation-diagnostic.js';
import type { RoleDiagnosticResult } from './activation-diagnostic.js';
import { parseAppRoleInputs } from './app-roles.js';
import { attestBridgeRecovery, bridgeRecovery, continueBridgeRecovery, promoteBridgeRecovery } from './activation-candidate-recovery.js';
import { recoveryIo } from './activation-recovery-io.js';
import { activationRecoveryExecution, activationRolesSuccessor, rolesReachability } from './activation-recovery-origin.js';
import { recoveredActivationProvider, taskCBootstrapProvider } from './activation-recovered-provider.js';
import { authorizeActivationPhase, confirmActivationPhase, executeActivationPhase, reconcileActivationAcknowledgement,
  reconcileActivationEffect, runRecoveredActivationEffect, runRecoveredActivationPostflight, diagnoseRecoveredRoles,
  completeRecoveredRoles, reconcileRecoveredRolesAcknowledgement, diagnoseRecoveredRolePrivileges } from './activation.js';
import type { RecoveredRolesDiagnosticStage } from './activation.js';
import { continueReachabilityBootstrap, continueReachabilityBootstrapPretransaction, continueReachabilityMigration, finalizeRetainedReachabilityBootstrap, inspectRetainedReachabilityBootstrap, observeReachabilityBootstrapAuth } from './activation.js';
import { migrationsDirectory } from './migrations.js';
import { verifyMigrationFiles } from './migration-files.mjs';

export const inputPhases = ['bridge-config', 'roles', 'migration', 'bootstrap', 'app-config'] as const;
export type InputPhase = typeof inputPhases[number];
const variables = { 'bridge-config': 'ACTIVATION_BRIDGE_INPUTS', roles: 'ACTIVATION_ROLE_INPUTS',
  migration: 'ACTIVATION_MIGRATION_INPUTS', bootstrap: 'ACTIVATION_BOOTSTRAP_INPUTS', 'app-config': 'ACTIVATION_APP_INPUTS' } as const;
const digestFields = { 'bridge-config': 'bridgeConfigDigest', roles: 'roleInputDigest', migration: 'migrationInputDigest',
  bootstrap: 'bootstrapInputDigest', 'app-config': 'appConfigDigest' } as const;
export interface InputRequest {
  version: 1; runId: string; workspaceId: string; profileName: 'Hieu'; workspaceName: 'Lovora'; retentionPolicyId: 'manual-retention-v1';
  revision: string; tree: string; sourceDigest: string; artifactDigest: string; projectId: string; scopeId: string;
  target: string; buildRun: string; retentionApprovalDigest: string;
  publicInputs?: Partial<Record<'APP_OPERATOR_USER_ID' | 'APP_AUTH_API_KEY' | 'DATABASE_CA_PEM', string>>;
}
const requestKeys = ['version', 'runId', 'workspaceId', 'profileName', 'workspaceName', 'retentionPolicyId', 'revision', 'tree',
  'sourceDigest', 'artifactDigest', 'projectId', 'scopeId', 'target', 'buildRun', 'retentionApprovalDigest'];
const hex = /^[a-f0-9]{64}$/, uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const publicFields = ['APP_OPERATOR_USER_ID', 'APP_AUTH_API_KEY'] as const;
const credentialFields = ['VERCEL_CONFIGURATION_TOKEN', 'MIGRATION_DATABASE_PASSWORD', 'APP_RUNTIME_DATABASE_PASSWORD',
  'APP_OPERATOR_DATABASE_PASSWORD', 'PREVIEW_ACCESS_KEY', 'APP_OPERATOR_AUTH_KEY'] as const;
const self = fileURLToPath(import.meta.url), prefix = 'esty-activation-inputs-';
interface LauncherBinding { launcher: string; manifest: string; digest: string; verify(): unknown; command(args: string[]): string }
function launcherBinding(): LauncherBinding | undefined {
  return (globalThis as unknown as Record<symbol, LauncherBinding | undefined>)[Symbol.for('esty.activation.input.launcher')];
}
function refuse(): never { throw new Error('Activation input preparation or handoff refused; no private value is disclosed.'); }
type FailureStage = 'request' | 'collection' | 'composition' | 'validation' | 'pre_child_guard' | 'child_worker' | 'receipt' | 'cleanup' | 'operation';
type FailureReason = 'operation_refused' | 'input_refused' | 'configuration_invalid' | 'executable_mismatch' | 'worker_refused' | 'cleanup_refused';
interface FailureDetails {
  stage: FailureStage; phase: InputPhase | 'none'; field: string; reason: FailureReason;
  cleanup?: 'not_needed' | 'complete' | 'refused';
}
const diagnosticFields = [...publicFields, ...credentialFields, 'NONE', 'INPUT_REQUEST', 'PREPARED_OUTPUT',
  'DATABASE_URL', 'MIGRATION_DATABASE_URL', 'DATABASE_CA_PEM', 'SUPABASE_PROJECT_REF', 'SUPABASE_SESSION_HOST',
  'SUPABASE_DATABASE_NAME', 'SUPABASE_DATABASE_USER', 'APP_ROLES_CREDENTIALS', 'APP_ROLES_RUNTIME_DATABASE_URL',
  'APP_ROLES_OPERATOR_DATABASE_URL', 'APP_OPERATOR_DATABASE_URL', 'APP_AUTH_URL', 'APP_WORKSPACE_ID',
  'APP_RETENTION_POLICY_ID', 'APP_OPERATOR_USER_ID', 'APP_OPERATOR_PROFILE_NAME', 'APP_OPERATOR_WORKSPACE_NAME'];
class InputFailure extends Error {
  readonly details: Readonly<FailureDetails>;
  constructor(details: FailureDetails) {
    super('Input helper operation refused.');
    this.details = Object.freeze({ ...details });
  }
}
class TransferOperationFailure extends Error {
  constructor(readonly publicMessage: string) { super('Protected transfer operation refused.'); }
}
function classifyFailure(error: unknown, context: FailureDetails): InputFailure {
  if (error instanceof InputFailure) {
    return error.details.phase === 'none' && context.phase !== 'none'
      ? new InputFailure({ ...error.details, phase: context.phase }) : error;
  }
  if (error instanceof ConfigurationError) {
    // Match only known prefixes; never forward validator remedies, values or raw errors.
    const field = error.message.startsWith('APP_ROLES credentials:') ? 'APP_ROLES_CREDENTIALS'
      : diagnosticFields.find(field => error.message.startsWith(`${field}:`)) ?? 'NONE';
    return new InputFailure({ ...context, field, reason: 'configuration_invalid' });
  }
  return new InputFailure(context);
}
export function inputFailureMessage(error: unknown): string {
  if (error instanceof TransferOperationFailure) return error.publicMessage;
  const details = error instanceof InputFailure ? error.details
    : { stage: 'operation', phase: 'none', field: 'NONE', reason: 'operation_refused', cleanup: 'not_needed' };
  const field = diagnosticFields.includes(details.field) ? details.field : 'NONE';
  return `INPUT_HELPER_REFUSED: stage=${details.stage} phase=${details.phase} field=${field} reason=${details.reason} cleanup=${details.cleanup ?? 'not_needed'}; no private value is disclosed.`;
}
function phaseName(value: string): InputPhase { if (!inputPhases.includes(value as InputPhase)) refuse(); return value as InputPhase; }
export function validateInputRequest(value: unknown, digest: string): InputRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  const row = value as InputRequest;
  if (Object.keys(row).some(key => !requestKeys.includes(key) && key !== 'publicInputs')
    || requestKeys.some(key => !Object.hasOwn(row, key))
    || Object.entries(row).some(([key, value]) => key !== 'version' && key !== 'publicInputs' && typeof value !== 'string')
    || row.version !== 1 || !uuid.test(row.runId) || !uuid.test(row.workspaceId)
    || row.profileName !== 'Hieu' || row.workspaceName !== 'Lovora' || row.retentionPolicyId !== 'manual-retention-v1'
    || ![row.revision, row.tree].every(v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v))
    || ![row.sourceDigest, row.artifactDigest, row.retentionApprovalDigest].every(v => typeof v === 'string' && hex.test(v))
    || row.projectId !== artifactTarget.project || row.scopeId !== artifactTarget.owner
    || row.target !== `supabase:${approvedTarget.SUPABASE_PROJECT_REF}` || !/^[1-9][0-9]*$/.test(row.buildRun)
    || !hex.test(digest) || sha256(canonical(row)) !== digest) refuse();
  if (Object.hasOwn(row, 'publicInputs')) {
    const inputs = row.publicInputs;
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)
      || Object.entries(inputs).some(([key, value]) => ![...publicFields, 'DATABASE_CA_PEM'].includes(key)
        || typeof value !== 'string' || !value || value.length > 16384 || value.includes('\0'))
      || (inputs.APP_OPERATOR_USER_ID !== undefined && !authUserUuidPattern.test(inputs.APP_OPERATOR_USER_ID))) refuse();
  }
  return row;
}
function requestAt(path: string, digest: string): InputRequest {
  if (basename(path) !== 'input-request.json') refuse();
  return validateInputRequest(readPrivate(path), digest);
}
function bootstrapBinding(value: unknown): string {
  const inputs = value as Record<string, string>, parsed = parseAppOperatorConfig(inputs);
  const identity = bootstrapIdentity(parsed.appFoundation.workspaceId, { userId: inputs.APP_OPERATOR_USER_ID ?? '',
    profileName: inputs.APP_OPERATOR_PROFILE_NAME ?? '', workspaceName: inputs.APP_OPERATOR_WORKSPACE_NAME ?? '', approvalId: parsed.approvalId });
  return sha256(canonical({ fingerprint: identity.fingerprint, approvalId: identity.approvalId,
    retentionPolicyId: parsed.appFoundation.retentionPolicyId ?? null }));
}
export function validatePreparedPhase(request: InputRequest, phase: InputPhase, env: NodeJS.ProcessEnv): { digest: string; binding?: string } {
  phaseName(phase);
  const values = phaseInputEnvironment(env, phase), raw = values[variables[phase]];
  const input = decodePhaseInput(raw), digest = sha256(canonical(input));
  let checked: Readonly<Record<string, string>>, binding: string | undefined;
  if (phase === 'bridge-config' || phase === 'app-config') {
    if (!/^[\x21-\x7e]{16,512}$/.test(values.VERCEL_CONFIGURATION_TOKEN ?? '')) {
      throw new InputFailure({ stage: 'validation', phase, field: 'VERCEL_CONFIGURATION_TOKEN', reason: 'input_refused' });
    }
    checked = runtimeInputs(input, { bridgeConfigDigest: digest, appConfigDigest: digest }, phase === 'bridge-config' ? 'bridge' : 'app');
  } else if (phase === 'roles') checked = roleInputs(input, { roleInputDigest: digest, target: request.target });
  else if (phase === 'migration') checked = migrationInputs(input, { migrationInputDigest: digest, target: request.target });
  else {
    binding = bootstrapBinding(input);
    checked = bootstrapInputs(input, { bootstrapInputDigest: digest, bootstrapBindingDigest: binding, target: request.target });
    if (checked.APP_OPERATOR_PROFILE_NAME !== request.profileName || checked.APP_OPERATOR_WORKSPACE_NAME !== request.workspaceName) refuse();
  }
  if (phase === 'bootstrap' || phase === 'app-config') {
    if (checked.APP_WORKSPACE_ID !== request.workspaceId || checked.APP_RETENTION_POLICY_ID !== request.retentionPolicyId) refuse();
  }
  for (const [field, expected] of Object.entries(request.publicInputs ?? {})) {
    if ((field === 'DATABASE_CA_PEM' || (field === 'APP_OPERATOR_USER_ID' && phase === 'bootstrap')
      || (field === 'APP_AUTH_API_KEY' && (phase === 'bootstrap' || phase === 'app-config'))) && checked[field] !== expected) refuse();
  }
  return { digest, ...(binding ? { binding } : {}) };
}
function missingPublicFields(request: InputRequest): string[] {
  return publicFields.filter(field => request.publicInputs?.[field] === undefined);
}
export function composePhaseInputs(request: InputRequest, fields: Record<string, string>) {
  const expected = [...missingPublicFields(request), ...credentialFields];
  if (Object.keys(fields).length !== expected.length || expected.some(field => !Object.hasOwn(fields, field))
    || Object.values(fields).some(value => typeof value !== 'string' || !value || value.length > 16384
      || /[\u0000-\u001f\u007f]/.test(value))) refuse();
  const supplied: Record<string, string | undefined> = { ...fields, ...request.publicInputs };
  if (!authUserUuidPattern.test(supplied.APP_OPERATOR_USER_ID ?? '')) refuse();
  const project = approvedTarget.SUPABASE_PROJECT_REF;
  const metadata = { SUPABASE_PROJECT_REF: project, SUPABASE_SESSION_HOST: approvedTarget.SUPABASE_SESSION_HOST,
    SUPABASE_DATABASE_NAME: approvedTarget.SUPABASE_DATABASE_NAME, SUPABASE_DATABASE_USER: approvedTarget.SUPABASE_DATABASE_USER,
    ...(request.publicInputs?.DATABASE_CA_PEM === undefined ? {} : { DATABASE_CA_PEM: request.publicInputs.DATABASE_CA_PEM }) };
  const url = (user: string, password: string) => `postgresql://${user}:${encodeURIComponent(password)}@${metadata.SUPABASE_SESSION_HOST}:${approvedTarget.port}/${metadata.SUPABASE_DATABASE_NAME}`;
  const migrationUrl = url(metadata.SUPABASE_DATABASE_USER, supplied.MIGRATION_DATABASE_PASSWORD!);
  const runtimeUrl = url(`app_runtime.${project}`, supplied.APP_RUNTIME_DATABASE_PASSWORD!);
  const operatorUrl = url(`app_operator.${project}`, supplied.APP_OPERATOR_DATABASE_PASSWORD!);
  const bridge = { ...metadata, API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
    DATABASE_URL: migrationUrl, BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: supplied.PREVIEW_ACCESS_KEY! };
  const appFields = { APP_WORKSPACE_ID: request.workspaceId, APP_EMAIL_ENABLED: 'false',
    APP_AUTH_URL: `https://${project}.supabase.co/auth/v1`, APP_AUTH_API_KEY: supplied.APP_AUTH_API_KEY!,
    APP_RETENTION_POLICY_ID: request.retentionPolicyId };
  const app = { ...bridge, ...appFields, APP_SCHEMA_MODE: 'strict', APP_FOUNDATION_ENABLED: 'true',
    SUPABASE_DATABASE_USER: `app_runtime.${project}`, DATABASE_URL: runtimeUrl };
  const migration = { ...metadata, MIGRATION_TARGET: 'supabase', MIGRATION_CONFIRM_PROJECT_REF: project,
    MIGRATION_DATABASE_URL: migrationUrl, DATABASE_URL: runtimeUrl };
  const roles = { ...migration, APP_ROLES_APPROVAL_ID: request.runId, APP_ROLES_CONFIRM_TARGET: request.target,
    APP_ROLES_RUNTIME_DATABASE_URL: runtimeUrl, APP_ROLES_OPERATOR_DATABASE_URL: operatorUrl };
  const bootstrap = { ...metadata, ...appFields, SUPABASE_DATABASE_USER: `app_operator.${project}`,
    BROWSER_ORIGIN: bridge.BROWSER_ORIGIN, APP_OPERATOR_TARGET: 'supabase', APP_OPERATOR_DATABASE_URL: operatorUrl,
    APP_OPERATOR_AUTH_KEY: supplied.APP_OPERATOR_AUTH_KEY!, APP_OPERATOR_CONFIRM_WORKSPACE: request.workspaceId,
    APP_OPERATOR_APPROVAL_ID: request.runId, APP_OPERATOR_USER_ID: supplied.APP_OPERATOR_USER_ID!,
    APP_OPERATOR_PROFILE_NAME: request.profileName, APP_OPERATOR_WORKSPACE_NAME: request.workspaceName,
    APP_OPERATOR_CONFIRM_PROJECT_REF: project };
  const maps = { 'bridge-config': bridge, roles, migration, bootstrap, 'app-config': app };
  const environments = {} as Record<InputPhase, Record<string, string>>;
  const phases = {} as Record<InputPhase, { digest: string; binding?: string }>;
  // Validate the entire composition before any child can receive credentials.
  for (const phase of inputPhases) {
    const env = environments[phase] = { [variables[phase]]: canonical(maps[phase]) };
    if (phase === 'bridge-config' || phase === 'app-config') env.VERCEL_CONFIGURATION_TOKEN = supplied.VERCEL_CONFIGURATION_TOKEN!;
    try { phases[phase] = validatePreparedPhase(request, phase, env); }
    catch (error) { throw classifyFailure(error, { stage: 'validation', phase, field: 'NONE', reason: 'input_refused' }); }
  }
  return { environments, phases };
}
function outputDirectory(directory: string): string {
  directory = privateDirectory(directory, false);
  if (!basename(directory).startsWith(prefix) || realpathSync(directory) !== directory) refuse();
  return directory;
}
const outputNames = ['input-request.json', 'receipt.json', ...inputPhases.map(phase => `${phase}.json`)];
export function discardPreparedInputs(directory: string, requestDigest: string): void {
  directory = outputDirectory(directory); requestAt(join(directory, 'input-request.json'), requestDigest);
  const names = readdirSync(directory);
  for (const name of names) {
    const info = lstatSync(join(directory, name));
    if (!outputNames.includes(name) || !info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid!()
      || (info.mode & 0o777) !== 0o600) refuse();
  }
  for (const name of names) unlinkSync(join(directory, name));
  rmdirSync(directory);
}
export async function isolatedInputWorker(entry: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'esty-activation-worker-'));
  const childEnv = { ...env, HOME: home, TMPDIR: home };
  let failure: InputFailure | undefined;
  try {
    const binding = entry === self ? launcherBinding() : undefined;
    try { binding?.verify(); }
    catch {
      throw new InputFailure({ stage: 'pre_child_guard', phase: 'none', field: 'NONE', reason: 'executable_mismatch' });
    }
    const command = binding ? [binding.launcher, binding.manifest, binding.digest, ...args] : [entry, ...args];
    await new Promise<void>((complete, reject) => {
      const child = spawn(process.execPath, command, { env: childEnv, cwd: home, stdio: 'ignore', signal });
      let failed = false;
      child.once('error', () => { failed = true; });
      child.once('close', code => { if (failed || code !== 0) reject(new Error('Isolated input worker refused; output suppressed.')); else complete(); });
    });
  } catch (error) {
    failure = classifyFailure(error, { stage: 'child_worker', phase: 'none', field: 'NONE', reason: 'worker_refused' });
  } finally {
    for (const key of Object.keys(childEnv)) delete (childEnv as NodeJS.ProcessEnv)[key];
    try { rmSync(home, { recursive: true, force: true }); }
    catch {
      failure = new InputFailure({ ...(failure?.details ?? { stage: 'cleanup', phase: 'none', field: 'NONE', reason: 'cleanup_refused' }),
        cleanup: 'refused' });
    }
  }
  if (failure) throw failure;
}
export async function prepareInputs(path: string, requestDigest: string, signal: AbortSignal): Promise<string> {
  let directory: string | undefined, composition: ReturnType<typeof composePhaseInputs> | undefined;
  const fields: Record<string, string> = {};
  const context: FailureDetails = { stage: 'request', phase: 'none', field: 'INPUT_REQUEST', reason: 'input_refused' };
  try {
    const request = requestAt(path, requestDigest);
    if (!process.stdin.isTTY || !process.stdout.isTTY) refuse();
    context.stage = 'collection'; context.field = 'PREPARED_OUTPUT';
    directory = mkdtempSync(join(realpathSync(tmpdir()), prefix));
    writePrivate(join(directory, 'input-request.json'), request);
    const missing = missingPublicFields(request);
    if (missing.length) console.info(`MISSING_NONSECRET_FIELDS: ${missing.join(', ')}`);
    for (const field of [...missing, ...credentialFields]) {
      context.field = field;
      const token = field === 'VERCEL_CONFIGURATION_TOKEN';
      const value = await readHiddenPassword(process.stdin, process.stdout, `${field} (hidden; Ctrl+C cancels): `,
        { maxBytes: token ? 512 : 65536, maxCharacters: token ? 512 : 16384, signal });
      if (!value || /[\u0000-\u001f\u007f]/.test(value)
        || (field === 'APP_OPERATOR_USER_ID' && !authUserUuidPattern.test(value))) refuse();
      fields[field] = value;
    }
    context.stage = 'composition'; context.field = 'NONE';
    composition = composePhaseInputs(request, fields);
    for (const phase of inputPhases) {
      context.stage = 'child_worker'; context.phase = phase; context.reason = 'worker_refused';
      const env: NodeJS.ProcessEnv = { HOME: directory, TMPDIR: directory, PATH: '/usr/bin:/bin', NO_COLOR: '1',
        ...composition.environments[phase] };
      try {
        await isolatedInputWorker(self, ['validate-worker', join(directory, 'input-request.json'), requestDigest, phase], env,
          AbortSignal.any([signal, AbortSignal.timeout(30000)]));
      } finally { for (const key of Object.keys(env)) delete env[key]; }
    }
    context.stage = 'receipt'; context.phase = 'none'; context.field = 'PREPARED_OUTPUT'; context.reason = 'operation_refused';
    signal.throwIfAborted();
    writePrivate(join(directory, 'receipt.json'), { version: 1, requestDigest, phases: composition.phases });
    return directory;
  } catch (error) {
    let failure = classifyFailure(error, context);
    if (directory) {
      let cleanup: 'complete' | 'refused' = 'complete';
      try {
        // Never remove arbitrary caller directories or overwrite the primary refusal with cleanup failure.
        if (readdirSync(directory).includes('input-request.json')) discardPreparedInputs(directory, requestDigest);
        else rmdirSync(directory);
      } catch { cleanup = 'refused'; }
      failure = new InputFailure({ ...failure.details, cleanup: failure.details.cleanup === 'refused' ? 'refused' : cleanup });
    }
    throw failure;
  } finally {
    for (const key of Object.keys(fields)) delete fields[key];
    if (composition) for (const env of Object.values(composition.environments)) for (const key of Object.keys(env)) delete env[key];
  }
}
interface PreparationReceipt { version: 1; requestDigest: string; phases: Record<InputPhase, { digest: string; binding?: string }> }
export function bindPreparedPacket(request: InputRequest, value: unknown, digest: string) {
  const packet = validateActivationPacket(value, digest);
  for (const key of ['runId', 'revision', 'tree', 'sourceDigest', 'artifactDigest', 'projectId', 'scopeId', 'target', 'retentionApprovalDigest'] as const) {
    if (request[key] !== packet[key]) refuse();
  }
  return packet;
}
interface HandoffPaths { inputs: string; packet: string; artifact: string; reports: string; cli: string }
export interface HandoffPlan {
  version: 1; executableDigest: string; requestDigest: string; packetDigest: string;
  phase: InputPhase; action: 'run' | 'preflight' | 'postflight'; source: HandoffPaths; destination: HandoffPaths;
}
interface InputFileBinding { name: string; size: number; sha256: string }
interface HandoffBinding { version: 1; plan: HandoffPlan; files: InputFileBinding[]; cliDigest: string }
function exactKeys(value: unknown, keys: readonly string[]): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function canonicalPath(path: string): void {
  if (typeof path !== 'string' || path.length > 4096 || /[\u0000-\u001f\u007f]/.test(path)
    || !isAbsolute(path) || resolve(path) !== path) refuse();
}
export function validateHandoffPlan(value: unknown, digest: string): HandoffPlan {
  if (!exactKeys(value, ['version', 'executableDigest', 'requestDigest', 'packetDigest', 'phase', 'action', 'source', 'destination'])) refuse();
  const plan = value as HandoffPlan;
  if (plan.version !== 1 || !hex.test(digest) || sha256(canonical(plan)) !== digest
    || ![plan.executableDigest, plan.requestDigest, plan.packetDigest].every(value => typeof value === 'string' && hex.test(value))
    || !inputPhases.includes(plan.phase) || (plan.action !== 'run' && !(plan.phase === 'roles' && ['preflight', 'postflight'].includes(plan.action)))) refuse();
  for (const paths of [plan.source, plan.destination]) {
    if (!exactKeys(paths, ['inputs', 'packet', 'artifact', 'reports', 'cli'])) refuse();
    for (const path of Object.values(paths)) canonicalPath(path);
    if (!basename(paths.inputs).startsWith(prefix) || paths.packet !== join(paths.reports, 'packet-input.json')
      || [paths.packet, paths.artifact, paths.reports, paths.cli].some(path => path === paths.inputs || path.startsWith(`${paths.inputs}/`))) refuse();
  }
  return plan;
}
function handoffLauncher(executableDigest: string): LauncherBinding {
  const binding = launcherBinding();
  if (!binding || binding.digest !== executableDigest) refuse();
  const manifest = binding.verify() as { runtimes: Array<{ platform: string; arch: string }> };
  if (!manifest.runtimes.some(runtime => runtime.platform === 'darwin' && runtime.arch === 'arm64')
    || !manifest.runtimes.some(runtime => runtime.platform === 'linux' && runtime.arch === 'x64')) refuse();
  return binding;
}
function privateSnapshot(directory: string, name: string, parse: boolean) {
  const bytes = readPrivateBytes(join(directory, name), name === 'input-request.json' || name === 'receipt.json' ? 65536 : 262144);
  try {
    return { record: { name, size: bytes.length, sha256: sha256(bytes) },
      value: parse ? JSON.parse(bytes.toString('utf8')) as unknown : undefined };
  } finally { bytes.fill(0); }
}
export interface PreparedTransferSnapshot {
  request: InputRequest;
  receipt: PreparationReceipt;
  files: InputFileBinding[];
  payloads: Record<InputPhase, Buffer>;
  configurationToken: Buffer;
  dispose(): void;
}
export function snapshotPreparedTransfer(directory: string, requestDigest: string,
  assertRequest: (request: InputRequest) => void): PreparedTransferSnapshot {
  directory = outputDirectory(directory);
  if (canonical(readdirSync(directory).sort()) !== canonical([...outputNames].sort())) refuse();
  const requestFile = privateSnapshot(directory, 'input-request.json', true);
  const request = validateInputRequest(requestFile.value, requestDigest);
  assertRequest(request);
  const receiptFile = privateSnapshot(directory, 'receipt.json', true), receipt = receiptFile.value as PreparationReceipt;
  if (!exactKeys(receipt, ['version', 'requestDigest', 'phases']) || receipt.version !== 1
    || receipt.requestDigest !== requestDigest || !exactKeys(receipt.phases, inputPhases)
    || inputPhases.some(phase => !exactKeys(receipt.phases[phase], phase === 'bootstrap' ? ['digest', 'binding'] : ['digest'])
      || !hex.test(receipt.phases[phase].digest))
    || !hex.test(receipt.phases.bootstrap.binding ?? '')) refuse();
  const files = [requestFile.record, receiptFile.record], payloads = {} as Record<InputPhase, Buffer>;
  let configurationToken: Buffer | undefined, complete = false;
  const dispose = () => {
    for (const bytes of Object.values(payloads)) bytes.fill(0);
    configurationToken?.fill(0);
  };
  try {
    for (const phase of inputPhases) {
      const snapshot = privateSnapshot(directory, `${phase}.json`, true);
      files.push(snapshot.record);
      const value = snapshot.value as NodeJS.ProcessEnv;
      let env: NodeJS.ProcessEnv | undefined;
      try {
        env = phaseInputEnvironment(value, phase);
        if (canonical(env) !== canonical(value)
          || canonical(validatePreparedPhase(request, phase, env)) !== canonical(receipt.phases[phase])) refuse();
        payloads[phase] = Buffer.from(env[variables[phase]]!, 'utf8');
        if (phase === 'bridge-config' || phase === 'app-config') {
          const token = Buffer.from(env.VERCEL_CONFIGURATION_TOKEN!, 'utf8');
          if (!configurationToken) configurationToken = token;
          else {
            const matches = configurationToken.equals(token);
            token.fill(0);
            if (!matches) refuse();
          }
        }
      } finally {
        if (env) for (const key of Object.keys(env)) delete env[key];
        if (value && typeof value === 'object') for (const key of Object.keys(value)) delete value[key];
      }
    }
    if (!configurationToken) refuse();
    complete = true;
    return { request, receipt, files, payloads, configurationToken, dispose };
  } finally { if (!complete) dispose(); }
}
function handoffSnapshot(plan: HandoffPlan, paths: HandoffPaths, allPhases: boolean) {
  for (const path of Object.values(paths)) if (realpathSync(path) !== path) refuse();
  const directory = outputDirectory(paths.inputs);
  privateDirectory(paths.reports, false);
  if (canonical(readdirSync(directory).sort()) !== canonical([...outputNames].sort())) refuse();
  const requestFile = privateSnapshot(directory, 'input-request.json', true);
  const request = validateInputRequest(requestFile.value, plan.requestDigest);
  const packet = bindPreparedPacket(request, readPrivate(paths.packet), plan.packetDigest);
  const artifact = verifyArtifact(paths.artifact, request.artifactDigest, { revision: request.revision,
    repository: 'https://github.com/khuonghuyhieu/esty-admin', migrationDigest: packet.targetDigest, release: true });
  if (artifact.manifest.source.tree !== request.tree || artifact.manifest.source.digest !== request.sourceDigest) refuse();
  const receiptFile = privateSnapshot(directory, 'receipt.json', true), receipt = receiptFile.value as PreparationReceipt;
  if (!exactKeys(receipt, ['version', 'requestDigest', 'phases']) || receipt.version !== 1
    || receipt.requestDigest !== plan.requestDigest || !exactKeys(receipt.phases, inputPhases)
    || inputPhases.some(phase => !exactKeys(receipt.phases[phase], phase === 'bootstrap' ? ['digest', 'binding'] : ['digest'])
      || receipt.phases[phase].digest !== packet[digestFields[phase]])
    || receipt.phases.bootstrap.binding !== packet.bootstrapBindingDigest) refuse();
  const files = [requestFile.record, receiptFile.record];
  let selected: NodeJS.ProcessEnv = {}, complete = false;
  try {
    for (const phase of inputPhases) {
      const snapshot = privateSnapshot(directory, `${phase}.json`, allPhases || phase === plan.phase);
      files.push(snapshot.record);
      if (allPhases || phase === plan.phase) {
        const value = snapshot.value as NodeJS.ProcessEnv, env = phaseInputEnvironment(value, phase);
        try {
          if (canonical(env) !== canonical(value) || canonical(validatePreparedPhase(request, phase, env)) !== canonical(receipt.phases[phase])) refuse();
          if (phase === plan.phase) selected = env;
        } finally { if (env !== selected) for (const key of Object.keys(env)) delete env[key]; }
      }
    }
    const cliInfo = lstatSync(paths.cli);
    if (!cliInfo.isFile() || cliInfo.isSymbolicLink() || cliInfo.uid !== process.getuid!() || (cliInfo.mode & 0o022)) refuse();
    const cliDigest = sha256(readArtifactFile(dirname(paths.cli), basename(paths.cli)));
    complete = true;
    return { request, packet, artifact, files, cliDigest, selected };
  } finally { if (!complete) for (const key of Object.keys(selected)) delete selected[key]; }
}
export function bindPreparedHandoff(planPath: string, planDigest: string, bindingPath: string): string {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') refuse();
  canonicalPath(planPath); canonicalPath(bindingPath);
  if (basename(planPath) !== 'handoff-plan.json' || bindingPath !== join(dirname(planPath), 'handoff-binding.json')) refuse();
  const plan = validateHandoffPlan(readPrivate(planPath), planDigest), launcher = handoffLauncher(plan.executableDigest);
  if (bindingPath.startsWith(`${plan.source.inputs}/`) || bindingPath.startsWith(`${plan.source.artifact}/`)) refuse();
  const snapshot = handoffSnapshot(plan, plan.source, true);
  try {
    launcher.verify();
    const binding: HandoffBinding = { version: 1, plan, files: snapshot.files, cliDigest: snapshot.cliDigest };
    writePrivate(bindingPath, binding);
    return sha256(canonical(binding));
  } finally { for (const key of Object.keys(snapshot.selected)) delete snapshot.selected[key]; }
}
export async function handoffPreparedPhase(args: string[], signal: AbortSignal, checkOnly = false): Promise<void> {
  const [bindingPath, bindingDigest] = args;
  if (args.length !== 2 || !bindingPath || !bindingDigest || !hex.test(bindingDigest)
    || process.platform !== 'linux' || process.arch !== 'x64' || process.versions.node !== artifactTarget.node) refuse();
  canonicalPath(bindingPath);
  if (basename(bindingPath) !== 'handoff-binding.json') refuse();
  const binding = readPrivate(bindingPath) as HandoffBinding;
  if (!exactKeys(binding, ['version', 'plan', 'files', 'cliDigest']) || binding.version !== 1
    || sha256(canonical(binding)) !== bindingDigest) refuse();
  const plan = validateHandoffPlan(binding.plan, sha256(canonical(binding.plan))), launcher = handoffLauncher(plan.executableDigest);
  const snapshot = handoffSnapshot(plan, plan.destination, false);
  try {
    if (canonical(snapshot.files) !== canonical(binding.files) || snapshot.cliDigest !== binding.cliDigest) refuse();
    launcher.verify(); signal.throwIfAborted();
    if (checkOnly) { console.info(`HANDOFF_VALIDATED phase=${plan.phase} action=${plan.action}`); return; }
    const env: NodeJS.ProcessEnv = { HOME: plan.destination.inputs, TMPDIR: plan.destination.inputs, PATH: '/usr/bin:/bin', NO_COLOR: '1',
      ...snapshot.selected, BE_ACTIVATION_CONTEXT: 'operator', BE_ACTIVATION_ENABLED: 'true', BE_DELIVERY_ENABLED: 'true',
      BE_DELIVERY_ENVIRONMENT: 'be-production', BE_ACTIVATION_OPERATOR_APPROVAL: snapshot.packet.runId,
      BE_ACTIVATION_BUILD_RUN: snapshot.request.buildRun, BE_ACTIVATION_PACKET_SHA256: plan.packetDigest };
    try {
      await isolatedInputWorker(join(snapshot.artifact.root, 'operator/apps/api/build/scripts/activation.js'),
        [plan.action, plan.action === 'run' ? plan.phase : '-', plan.destination.packet, plan.packetDigest,
          snapshot.artifact.root, plan.destination.reports, plan.destination.cli], env, signal);
    } finally { for (const key of Object.keys(env)) delete env[key]; }
  } finally { for (const key of Object.keys(snapshot.selected)) delete snapshot.selected[key]; }
  // Inputs stay intact until durable effect reconciliation and an explicitly authorized discard.
}
type PreDatabaseStage = 'guard' | 'request' | 'packet' | 'receipt' | 'role-input' | 'migration-config' | 'public-ca';
type PreDatabaseField = 'execution_guard' | 'prepared_directory' | 'prepared_files' | 'request_validation'
  | 'packet_binding' | 'receipt_binding' | 'role_envelope' | 'role_schema_or_digest' | 'role_public_binding'
  | 'migration_configuration' | 'executable_recheck' | 'original_ca_present' | 'public_ca_binding';
type PreparedRoleDiagnosticResult = RoleDiagnosticResult | {
  stage: PreDatabaseStage; category: 'refused' | 'aborted'; sqlstate: null; field: PreDatabaseField;
};
type RoleCaResult = { caMatches: boolean; present: boolean };
type OverlayRoleDiagnosticResult = PreparedRoleDiagnosticResult & { caOverlay: boolean; publicCaAnchor: 'supabase-root-2021' };
// Parsed identity of the root-approved public Supabase Root 2021 CA, not its PEM-file digest.
const approvedCaFingerprint = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
const approvedCaFileDigest = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
function approvedPublicCa(bytes: Buffer): string {
  if (sha256(bytes) !== approvedCaFileDigest) refuse();
  const ca = bytes.toString('utf8'), certificate = new X509Certificate(ca);
  if (!certificate.ca || certificate.fingerprint256 !== approvedCaFingerprint) refuse();
  return ca;
}
function readApprovedPublicCa(path: string): string {
  canonicalPath(path);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 16384
    || info.uid !== process.getuid!() || (info.mode & 0o022)) refuse();
  return approvedPublicCa(readArtifactFile(dirname(path), basename(path)));
}
function caSuccessorContent(original: PreparedTransferSnapshot, packet: ReturnType<typeof bindPreparedPacket>, runId: string, ca: string) {
  if (!uuid.test(runId) || runId === original.request.runId || original.request.publicInputs?.DATABASE_CA_PEM !== undefined
    || inputPhases.some(phase => original.receipt.phases[phase].digest !== packet[digestFields[phase]])
    || original.receipt.phases.bootstrap.binding !== packet.bootstrapBindingDigest) refuse();
  const request: InputRequest = { ...original.request, runId, publicInputs: { ...original.request.publicInputs, DATABASE_CA_PEM: ca } };
  const requestDigest = sha256(canonical(request));
  validateInputRequest(request, requestDigest);
  const environments = {} as Record<InputPhase, NodeJS.ProcessEnv>;
  const receipt: PreparationReceipt = { version: 1, requestDigest, phases: {} as PreparationReceipt['phases'] };
  try {
    for (const phase of inputPhases) {
      const values = decodePhaseInput(original.payloads[phase].toString('utf8')) as Record<string, string>;
      if (Object.hasOwn(values, 'DATABASE_CA_PEM')) refuse();
      // Approval IDs remain business/idempotency identities; only request/packet get a new execution ID.
      const env = environments[phase] = { [variables[phase]]: canonical({ ...values, DATABASE_CA_PEM: ca }),
        ...(['bridge-config', 'app-config'].includes(phase) ? { VERCEL_CONFIGURATION_TOKEN: original.configurationToken.toString('utf8') } : {}) };
      receipt.phases[phase] = validatePreparedPhase(request, phase, env);
    }
    if (receipt.phases.bootstrap.binding !== packet.bootstrapBindingDigest) refuse();
    const nextPacket = { ...packet, runId };
    for (const phase of inputPhases) nextPacket[digestFields[phase]] = receipt.phases[phase].digest;
    const packetDigest = sha256(canonical(nextPacket));
    bindPreparedPacket(request, nextPacket, packetDigest);
    return { request, requestDigest, environments, receipt, packet: nextPacket, packetDigest };
  } catch (error) {
    for (const env of Object.values(environments)) for (const key of Object.keys(env)) delete env[key];
    throw error;
  }
}
export async function prepareCaSuccessor(args: string[], signal: AbortSignal): Promise<object> {
  const [planPath, planDigest, packetPath, packetDigest, caPath] = args, guard = launcherBinding();
  if (args.length !== 5 || !planPath || !planDigest || !packetPath || !packetDigest || !caPath || !guard
    || Object.keys(phaseInputEnvironment(process.env, 'provider')).length) refuse();
  signal.throwIfAborted(); guard.verify();
  const adapter = await import('./activation-input-transfer.js');
  const original = adapter.acknowledgedTransferSnapshot(planPath, planDigest, guard);
  let content: ReturnType<typeof caSuccessorContent> | undefined;
  try {
    const packet = bindPreparedPacket(original.snapshot.request, readPrivate(packetPath), packetDigest);
    content = caSuccessorContent(original.snapshot, packet, randomUUID(), readApprovedPublicCa(caPath));
    const root = join(dirname(original.plan.reports), `ca-successor-${original.snapshot.request.runId}`);
    privateDirectory(dirname(root), false);
    guard.verify(); signal.throwIfAborted();
    // Exclusive, deterministic lineage fence. A partial successor is retained, never silently reset.
    mkdirSync(root, { mode: 0o700 });
    const inputs = join(root, `${prefix}${content.request.runId}`);
    mkdirSync(inputs, { mode: 0o700 });
    writePrivate(join(inputs, 'input-request.json'), content.request);
    for (const phase of inputPhases) writePrivate(join(inputs, `${phase}.json`), content.environments[phase]);
    writePrivate(join(inputs, 'receipt.json'), content.receipt);
    writePrivate(join(root, 'activation-packet.json'), content.packet);
    writePrivate(join(root, 'successor.json'), { version: 1, originalPlan: planPath, originalPlanDigest: planDigest,
      originalPacket: packetPath, originalPacketDigest: packetDigest, executableDigest: guard.digest,
      inputs, runId: content.request.runId, requestDigest: content.requestDigest, packetDigest: content.packetDigest });
    return { directory: root, inputs, packet: join(root, 'activation-packet.json'), runId: content.request.runId };
  } finally {
    original.snapshot.dispose();
    if (content) for (const env of Object.values(content.environments)) for (const key of Object.keys(env)) delete env[key];
  }
}
export async function snapshotCaSuccessor(path: string, guard: { digest: string; verify(): unknown }) {
  canonicalPath(path);
  if (basename(path) !== 'successor.json') refuse();
  guard.verify();
  const control = readPrivate(path);
  if (!exactKeys(control, ['version', 'originalPlan', 'originalPlanDigest', 'originalPacket', 'originalPacketDigest',
    'executableDigest', 'inputs', 'runId', 'requestDigest', 'packetDigest']) || control.version !== 1
    || control.executableDigest !== guard.digest) refuse();
  const adapter = await import('./activation-input-transfer.js');
  const original = adapter.acknowledgedTransferSnapshot(control.originalPlan, control.originalPlanDigest, guard);
  let next: PreparedTransferSnapshot | undefined, expected: ReturnType<typeof caSuccessorContent> | undefined;
  try {
    const root = join(dirname(original.plan.reports), `ca-successor-${original.snapshot.request.runId}`);
    if (dirname(path) !== root || control.inputs !== join(root, `${prefix}${control.runId}`)) refuse();
    next = snapshotPreparedTransfer(control.inputs, control.requestDigest, request => { if (request.runId !== control.runId) refuse(); });
    const ca = next.request.publicInputs?.DATABASE_CA_PEM;
    if (typeof ca !== 'string') refuse();
    const packet = bindPreparedPacket(original.snapshot.request, readPrivate(control.originalPacket), control.originalPacketDigest);
    expected = caSuccessorContent(original.snapshot, packet, control.runId, approvedPublicCa(Buffer.from(ca)));
    if (canonical(next.request) !== canonical(expected.request) || canonical(next.receipt) !== canonical(expected.receipt)
      || control.packetDigest !== expected.packetDigest || canonical(readPrivate(join(root, 'activation-packet.json'))) !== canonical(expected.packet)
      || !next.configurationToken.equals(original.snapshot.configurationToken)
      || inputPhases.some(phase => canonical(decodePhaseInput(next!.payloads[phase].toString('utf8')))
        !== expected!.environments[phase][variables[phase]])) refuse();
    guard.verify();
    return { control, previousPlan: original.plan, snapshot: next };
  } catch (error) { next?.dispose(); throw error; }
  finally {
    original.snapshot.dispose();
    if (expected) for (const env of Object.values(expected.environments)) for (const key of Object.keys(env)) delete env[key];
  }
}
export function diagnosePreparedRole(args: string[], signal: AbortSignal): Promise<PreparedRoleDiagnosticResult>;
export function diagnosePreparedRole(args: string[], signal: AbortSignal, checkCa: true): Promise<RoleCaResult | null>;
export function diagnosePreparedRole(args: string[], signal: AbortSignal, checkCa: 'public-ca-overlay'): Promise<OverlayRoleDiagnosticResult>;
export async function diagnosePreparedRole(args: string[], signal: AbortSignal, checkCa: boolean | 'public-ca-overlay' = false): Promise<PreparedRoleDiagnosticResult | RoleCaResult | OverlayRoleDiagnosticResult | null> {
  const overlay = checkCa === 'public-ca-overlay';
  let caOverlay = false;
  let selected: NodeJS.ProcessEnv | undefined, raw: NodeJS.ProcessEnv | undefined;
  let authority: ReturnType<typeof parseAppRoleInputs>['authority'] | undefined;
  let stage: PreDatabaseStage = 'guard', field: PreDatabaseField = 'execution_guard';
  try {
    const [directoryArg, requestDigest, packetPath, packetDigest, publicCaPath] = args, launcher = launcherBinding();
    if (args.length !== (overlay ? 5 : 4) || (overlay && !publicCaPath) || !directoryArg || !requestDigest || !packetPath || !packetDigest || !launcher
      || process.platform !== 'linux' || process.arch !== 'x64' || process.versions.node !== artifactTarget.node
      || Object.keys(phaseInputEnvironment(process.env, 'roles')).length
      || Object.keys(process.env).some(key => key.startsWith('PG'))) refuse();
    signal.throwIfAborted(); launcher.verify();
    stage = 'request'; field = 'prepared_directory';
    canonicalPath(directoryArg);
    const directory = outputDirectory(directoryArg);
    field = 'prepared_files';
    if (canonical(readdirSync(directory).sort()) !== canonical([...outputNames].sort())) refuse();
    field = 'request_validation';
    const request = requestAt(join(directory, 'input-request.json'), requestDigest);
    stage = 'packet'; field = 'packet_binding';
    canonicalPath(packetPath);
    const packet = bindPreparedPacket(request, readPrivate(packetPath), packetDigest);
    stage = 'receipt'; field = 'receipt_binding';
    const receipt = privateSnapshot(directory, 'receipt.json', true).value as PreparationReceipt;
    if (!exactKeys(receipt, ['version', 'requestDigest', 'phases']) || receipt.version !== 1
      || receipt.requestDigest !== requestDigest || !exactKeys(receipt.phases, inputPhases)
      || inputPhases.some(phase => !exactKeys(receipt.phases[phase], phase === 'bootstrap' ? ['digest', 'binding'] : ['digest'])
        || receipt.phases[phase].digest !== packet[digestFields[phase]])
      || receipt.phases.bootstrap.binding !== packet.bootstrapBindingDigest) refuse();
    stage = 'role-input'; field = 'role_envelope';
    raw = privateSnapshot(directory, 'roles.json', true).value as NodeJS.ProcessEnv;
    selected = phaseInputEnvironment(raw, 'roles');
    if (canonical(selected) !== canonical(raw)) refuse();
    field = 'role_schema_or_digest';
    const inputs = roleInputEnvelope(decodePhaseInput(selected.ACTIVATION_ROLE_INPUTS), packet);
    field = 'role_public_binding';
    if (request.publicInputs?.DATABASE_CA_PEM !== undefined && inputs.DATABASE_CA_PEM !== request.publicInputs.DATABASE_CA_PEM) refuse();
    stage = 'migration-config'; field = 'migration_configuration';
    const configured = parseAppRoleInputs(inputs);
    if (configured.target !== packet.target) refuse();
    authority = configured.authority;
    if (overlay) {
      stage = 'public-ca'; field = 'original_ca_present';
      if (inputs.DATABASE_CA_PEM !== undefined) refuse();
      field = 'public_ca_binding';
      authority.ssl = { ca: readApprovedPublicCa(publicCaPath!), rejectUnauthorized: true, servername: approvedTarget.SUPABASE_SESSION_HOST };
      caOverlay = true;
    }
    stage = 'guard'; field = 'executable_recheck';
    launcher.verify(); signal.throwIfAborted();
    if (checkCa === true) {
      const ca = inputs.DATABASE_CA_PEM;
      return { caMatches: ca !== undefined && new X509Certificate(ca).fingerprint256 === approvedCaFingerprint,
        present: ca !== undefined };
    }
    const result = await diagnoseRoleAuthority(authority, signal);
    return overlay ? { ...result, caOverlay, publicCaAnchor: 'supabase-root-2021' } : result;
  } catch {
    if (checkCa === true) return null;
    const result = { stage, category: signal.aborted ? 'aborted' as const : 'refused' as const, sqlstate: null, field };
    return overlay ? { ...result, caOverlay, publicCaAnchor: 'supabase-root-2021' } : result;
  } finally {
    if (authority) authority.password = undefined;
    if (selected) for (const key of Object.keys(selected)) delete selected[key];
    if (raw && typeof raw === 'object') for (const key of Object.keys(raw)) delete raw[key];
  }
}

function recoveryRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function recoveryEnvironment(value: unknown): value is Record<string, string> {
  return recoveryRecord(value) && Object.values(value).every(item => typeof item === 'string');
}
async function preparedRecoveryContext(args: string[], signal: AbortSignal) {
  const [controlPath, controlDigest, original, artifact] = args, guard = launcherBinding();
  if (args.length !== 4 || !controlPath || !controlDigest || !original || !artifact || !guard
    || !hex.test(controlDigest) || process.versions.node !== artifactTarget.node
    || Object.keys(phaseInputEnvironment(process.env, 'provider')).length
    || Object.keys(process.env).some(key => key.startsWith('PG') || credentialFields.some(field => field === key)
      || /^(?:NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|NODE_USE_ENV_PROXY|HTTPS?_PROXY|ALL_PROXY)$/i.test(key))) refuse();
  guard.verify(); signal.throwIfAborted();
  for (const path of [controlPath, original, artifact]) canonicalPath(path);
  const control: unknown = readPrivate(controlPath);
  if (!recoveryRecord(control) || !exactKeys(control, ['version', 'originalPlan', 'originalPlanDigest', 'originalPacket',
    'originalPacketDigest', 'executableDigest', 'inputs', 'runId', 'requestDigest', 'packetDigest'])
    || control.version !== 1 || sha256(canonical(control)) !== controlDigest
    || typeof control.originalPlan !== 'string' || typeof control.originalPlanDigest !== 'string'
    || typeof control.inputs !== 'string' || typeof control.requestDigest !== 'string'
    || control.executableDigest !== 'd02721f629688c3f4977bbef68f3a747eb04554772a6e5883f2700e7f70c6e53'
    || control.runId !== bridgeRecovery.activationRun || control.packetDigest !== bridgeRecovery.packetDigest) refuse();
  const adapter = await import('./activation-input-transfer.js');
  const previous = adapter.acknowledgedTransferPlan(control.originalPlan, control.originalPlanDigest, guard);
  const root = join(dirname(previous.reports), 'ca-successor-36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed');
  if (controlPath !== join(root, 'successor.json') || control.inputs !== join(root, `esty-activation-inputs-${control.runId}`)) refuse();
  const replacement = adapter.acknowledgedCaReplacement(controlPath, controlDigest, guard);
  if (replacement.inputs !== control.inputs || replacement.requestDigest !== control.requestDigest
    || replacement.executableDigest !== control.executableDigest) refuse();
  const directory = control.inputs, requestDigest = control.requestDigest;
  const context = { original, artifact, directory: join(root, `bridge-recovery-${bridgeRecovery.workflowRun}`), controlDigest, guard };
  return { context, root, directory, requestDigest, packetPath: join(root, 'activation-packet.json') };
}
async function recoverPreparedBridge(args: string[], mode: 'attest' | 'continue' | 'promote', signal: AbortSignal) {
  const { context, root, directory, requestDigest } = await preparedRecoveryContext(args, signal);
  const { guard } = context, io = recoveryIo(guard, signal);
  // Promotion never opens a prepared phase file or uses an application bearer.
  if (mode === 'promote') return promoteBridgeRecovery(context, io, signal);
  const attest = mode === 'continue' ? continueBridgeRecovery : attestBridgeRecovery;
  return attest(context, io, () => preparedBridgeBearer(directory, requestDigest,
    join(root, 'activation-packet.json'), bridgeRecovery.packetDigest, guard, signal), signal);
}

export function preparedRecoveryPhase(directory: string, requestDigest: string, packetPath: string,
  packetDigest: string, phase: InputPhase, guard: { verify(): unknown }, signal: AbortSignal,
  observe?: (stage: RecoveredRolesDiagnosticStage) => void) {
  let raw: Record<string, string> | undefined, selected: NodeJS.ProcessEnv | undefined;
  const dispose = () => {
    if (raw) for (const key of Object.keys(raw)) delete raw[key];
    if (selected) for (const key of Object.keys(selected)) delete selected[key];
  };
  try {
    observe?.('guard');
    if (!inputPhases.includes(phase)) refuse();
    guard.verify(); signal.throwIfAborted(); canonicalPath(directory); canonicalPath(packetPath);
    if (outputDirectory(directory) !== directory || canonical(readdirSync(directory).sort()) !== canonical([...outputNames].sort())) refuse();
    observe?.('request');
    const request = requestAt(join(directory, 'input-request.json'), requestDigest);
    observe?.('packet');
    const packet = bindPreparedPacket(request, readPrivate(packetPath), packetDigest);
    observe?.('receipt');
    const receipt: unknown = privateSnapshot(directory, 'receipt.json', true).value;
    if (!recoveryRecord(receipt) || !exactKeys(receipt, ['version', 'requestDigest', 'phases']) || receipt.version !== 1
      || receipt.requestDigest !== requestDigest || !recoveryRecord(receipt.phases) || !exactKeys(receipt.phases, inputPhases)) refuse();
    for (const phase of inputPhases) {
      const item = receipt.phases[phase];
      if (!recoveryRecord(item) || !exactKeys(item, phase === 'bootstrap' ? ['digest', 'binding'] : ['digest'])
        || item.digest !== packet[digestFields[phase]] || (phase === 'bootstrap' && item.binding !== packet.bootstrapBindingDigest)) refuse();
    }
    observe?.('role-input');
    const value: unknown = privateSnapshot(directory, `${phase}.json`, true).value;
    if (!recoveryEnvironment(value)) refuse();
    raw = value;
    observe?.('role-validation');
    selected = phaseInputEnvironment(raw, phase);
    if (canonical(raw) !== canonical(selected) || validatePreparedPhase(request, phase, selected).digest !== packet[digestFields[phase]]) refuse();
    observe?.('guard');
    guard.verify(); signal.throwIfAborted();
    return { values: selected, dispose };
  } catch { dispose(); refuse(); }
}
export function preparedBridgeBearer(directory: string, requestDigest: string, packetPath: string,
  packetDigest: string, guard: { verify(): unknown }, signal: AbortSignal) {
  const prepared = preparedRecoveryPhase(directory, requestDigest, packetPath, packetDigest, 'bridge-config', guard, signal);
  try {
    const packet = validateActivationPacket(readPrivate(packetPath), packetDigest);
    const key = runtimeInputs(decodePhaseInput(prepared.values.ACTIVATION_BRIDGE_INPUTS), packet, 'bridge').PREVIEW_ACCESS_KEY;
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) refuse();
    return { value: key, dispose() { this.value = ''; prepared.dispose(); } };
  } catch { prepared.dispose(); refuse(); }
}

async function preparedReachabilityMigration(args: string[], signal: AbortSignal) {
  const [action, phase, ...contextArgs] = args, guard = launcherBinding();
  if (args.length !== 6 || phase !== 'migration' || !action
    || !['state', 'authorize', 'run', 'postflight', 'confirm', 'reconcile-ack', 'inspect', 'verify-noop'].includes(action)
    || !guard || !contextArgs[3]) refuse();
  guard.verify(); signal.throwIfAborted();
  // Verify the sealed f162 operator assets before even opening the private control context.
  canonicalPath(contextArgs[3]);
  const artifact = verifyArtifact(contextArgs[3], bridgeRecovery.artifactDigest);
  verifyMigrationFiles(migrationsDirectory, artifact.manifest.migrations);
  const { context, directory, requestDigest, packetPath } = await preparedRecoveryContext(contextArgs, signal);
  const packet = validateActivationPacket(readPrivate(packetPath), bridgeRecovery.packetDigest);
  verifyActivationArtifact(artifact, packet);
  const run = { directory: join(dirname(context.directory), `activation-recovered-${rolesReachability.executionId}`),
    packet, digest: bridgeRecovery.packetDigest };
  return continueReachabilityMigration(run, action, artifact, recoveredActivationProvider(guard, signal), phase => {
    guard.verify();
    const prepared = preparedRecoveryPhase(directory, requestDigest, packetPath, run.digest, phase, guard, signal);
    try {
      if (phase === 'roles') return { roles: parseAppRoleInputs(roleInputs(decodePhaseInput(prepared.values.ACTIVATION_ROLE_INPUTS), packet)),
        dispose: prepared.dispose };
      return { database: parseMigrationConfig(migrationInputs(decodePhaseInput(prepared.values.ACTIVATION_MIGRATION_INPUTS), packet)),
        dispose: prepared.dispose };
    } catch { prepared.dispose(); refuse(); }
  }, signal);
}

export function preparedBootstrapEnvironment(prepared: ReturnType<typeof preparedRecoveryPhase>,
  packet: Parameters<typeof bootstrapInputs>[1]) {
  let env: NodeJS.ProcessEnv | undefined, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    let failed = false, primary: unknown;
    try { if (env) for (const key of Object.keys(env)) delete env[key]; }
    catch (error) { failed = true; primary = error; }
    try { prepared.dispose(); } catch (error) { if (!failed) throw error; }
    if (failed) throw primary;
  };
  try {
    env = { ...bootstrapInputs(decodePhaseInput(prepared.values.ACTIVATION_BOOTSTRAP_INPUTS), packet) };
    parseAppOperatorConfig(env);
    return { env, dispose };
  } catch (error) {
    try { dispose(); } catch { /* Cleanup must not replace the preparation failure. */ }
    throw error;
  }
}

async function preparedReachabilityBootstrap(args: string[], signal: AbortSignal,
  mode: 'bootstrap' | 'observe-auth' | 'continue-pretransaction' | 'inspect-retained' = 'bootstrap') {
  const [action, ...contextArgs] = args, guard = launcherBinding();
  if (args.length !== 5 || !action || !(mode === 'bootstrap' ? ['state', 'authorize', 'run', 'inspect', 'confirm', 'reconcile-ack'].includes(action) : action === mode)
    || !guard || !contextArgs[3]) refuse();
  guard.verify(); signal.throwIfAborted();
  canonicalPath(contextArgs[3]);
  const artifact = verifyArtifact(contextArgs[3], bridgeRecovery.artifactDigest);
  verifyMigrationFiles(migrationsDirectory, artifact.manifest.migrations);
  const { context, directory, requestDigest, packetPath } = await preparedRecoveryContext(contextArgs, signal);
  const packet = validateActivationPacket(readPrivate(packetPath), bridgeRecovery.packetDigest);
  verifyActivationArtifact(artifact, packet);
  const run = { directory: join(dirname(context.directory), `activation-recovered-${rolesReachability.executionId}`),
    packet, digest: bridgeRecovery.packetDigest };
  const prepare = () => preparedBootstrapEnvironment(
    preparedRecoveryPhase(directory, requestDigest, packetPath, run.digest, 'bootstrap', guard, signal), packet);
  const provider = recoveredActivationProvider(guard, signal);
  if (mode === 'inspect-retained') {
    const evidence = join(resolve(contextArgs[2]!, '../../..'), 'recovered-activation-zc_q5vob/bootstrap-continuation');
    return inspectRetainedReachabilityBootstrap(run, artifact, provider, prepare, evidence, guard.digest, signal);
  }
  if (mode === 'continue-pretransaction') {
    const evidence = join(resolve(contextArgs[2]!, '../../..'), 'recovered-activation-zc_q5vob/bootstrap-continuation');
    return continueReachabilityBootstrapPretransaction(run, artifact, provider, prepare, evidence, guard.digest, signal);
  }
  return mode === 'observe-auth' ? observeReachabilityBootstrapAuth(run, artifact, provider, prepare, signal)
    : continueReachabilityBootstrap(run, action, artifact, provider, prepare, signal);
}

async function preparedRetainedBootstrapFinalization(args: string[], signal: AbortSignal, reconcile: boolean) {
  const guard = launcherBinding();
  if (args.length !== 4 || !guard || !args[3]) refuse();
  signal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
  guard.verify(); signal.throwIfAborted();
  canonicalPath(args[3]);
  const artifact = verifyArtifact(args[3], bridgeRecovery.artifactDigest);
  verifyMigrationFiles(migrationsDirectory, artifact.manifest.migrations);
  const { context, packetPath } = await preparedRecoveryContext(args, signal);
  const packet = validateActivationPacket(readPrivate(packetPath), bridgeRecovery.packetDigest);
  verifyActivationArtifact(artifact, packet);
  const run = { directory: join(dirname(context.directory), `activation-recovered-${rolesReachability.executionId}`),
    packet, digest: bridgeRecovery.packetDigest };
  const evidence = join(resolve(args[2]!, '../../..'), 'recovered-activation-zc_q5vob/bootstrap-continuation');
  // No prepared phase, credentials, Auth or database capability is passed to finalization.
  return finalizeRetainedReachabilityBootstrap(run, artifact, taskCBootstrapProvider(guard, signal),
    evidence, guard.digest, signal, reconcile);
}

async function recoveredPreparedActivation(args: string[], signal: AbortSignal) {
  const [action, phase, ...contextArgs] = args;
  if (!action || !['initialize', 'state', 'authorize', 'run', 'postflight', 'confirm', 'reconcile-ack', 'inspect'].includes(action)
    || !['roles', 'migration', 'bootstrap', 'app-config'].includes(phase ?? '')) refuse();
  const { context, directory, requestDigest, packetPath } = await preparedRecoveryContext(contextArgs, signal);
  const { guard } = context;
  const packet = validateActivationPacket(readPrivate(packetPath), bridgeRecovery.packetDigest);
  const run = { directory: join(dirname(context.directory), `activation-recovered-${activationRecoveryExecution}`),
    packet, digest: bridgeRecovery.packetDigest };
  const provider = recoveredActivationProvider(guard, signal);
  if (action === 'initialize') {
    if (phase !== 'roles') refuse();
    await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    await provider.confirmJournal(bridgeRecovery.journal, 'in_progress', `ack:${bridgeRecovery.candidate}`);
    guard.verify(); signal.throwIfAborted();
    createRecoveredActivationJournal(context.original, context.directory, run.directory, packet, run.digest, activationRecoveryExecution);
  } else if (action !== 'state') {
    const current = readActivationJournal(run.directory, packet, run.digest);
    if (!current.recovery || current.next !== phase) refuse();
    const selectedPhase = phase as 'roles' | 'migration' | 'bootstrap' | 'app-config';
    guard.verify(); signal.throwIfAborted();
    if (action === 'authorize') {
      const previous = current.events.at(-1);
      let expected = `ack:${bridgeRecovery.candidate}`;
      if (previous) {
        if (previous.kind !== 'remote-confirmed' || !recoveryRecord(previous.value)
          || typeof previous.value.outcomeHash !== 'string' || !hex.test(previous.value.outcomeHash)) refuse();
        expected = `activation:${previous.phase}:outcome:${previous.value.outcomeHash}`;
      }
      await provider.confirmJournal(current.journal, 'in_progress', expected);
      await authorizeActivationPhase(run, selectedPhase, provider);
    } else if (action === 'confirm') {
      const intent = current.events.find(event => event.phase === selectedPhase && event.kind === 'intent');
      if (!intent) refuse();
      await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
      await provider.confirmJournal(current.journal, 'in_progress', `activation:${selectedPhase}:intent:${intent.sha256}`);
      await confirmActivationPhase(run, selectedPhase, provider);
    } else if (action === 'reconcile-ack') await reconcileActivationAcknowledgement(run, selectedPhase, provider);
    else {
      if (action === 'postflight' && selectedPhase !== 'migration') refuse();
      await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
      const last = current.events.at(-1);
      if (!last || last.phase !== selectedPhase) refuse();
      const intent = current.events.find(event => event.phase === selectedPhase && event.kind === 'intent');
      if (!intent) refuse();
      await provider.confirmJournal(current.journal, 'in_progress', `activation:${selectedPhase}:intent:${intent.sha256}`);
      if (action === 'run') {
        if (last.kind !== 'authorized') refuse();
      } else if (action === 'inspect') {
        if (selectedPhase === 'app-config' || !['started', 'outcome'].includes(last.kind)
          || (last.kind === 'outcome' && recoveryRecord(last.value) && last.value.result === 'confirmed')) refuse();
      } else if (!['outcome', 'reconciled'].includes(last.kind) || !recoveryRecord(last.value) || last.value.result !== 'confirmed') refuse();
      const artifact = verifyArtifact(context.artifact, packet.artifactDigest);
      verifyActivationArtifact(artifact, packet);
      const withInputs = async (inspect: boolean) => {
        const prepared = preparedRecoveryPhase(directory, requestDigest, packetPath, run.digest,
          selectedPhase, guard, signal);
        try { return await runRecoveredActivationEffect(run, selectedPhase, artifact, prepared.values, signal, inspect); }
        finally { prepared.dispose(); }
      };
      if (action === 'run') await executeActivationPhase(run, selectedPhase, () => withInputs(false));
      else if (action === 'inspect') await reconcileActivationEffect(run, selectedPhase, () => withInputs(true));
      else {
        const prepared = preparedRecoveryPhase(directory, requestDigest, packetPath, run.digest, 'roles', guard, signal);
        try { await runRecoveredActivationPostflight(run, artifact, prepared.values, signal); }
        finally { prepared.dispose(); }
      }
    }
  }
  const current = readActivationJournal(run.directory, packet, run.digest);
  return { executionId: current.recovery?.executionId, next: current.next, head: current.head,
    events: current.events.length, last: current.events.at(-1)?.kind ?? null };
}

async function diagnosePreparedRecoveredRoles(args: string[], signal: AbortSignal,
  mode: 'diagnose' | 'complete' | 'ack' | 'privileges' | 'reachability' | 'reachability-ack' = 'diagnose') {
  const { context, directory, requestDigest, packetPath } = await preparedRecoveryContext(args, signal);
  const packet = validateActivationPacket(readPrivate(packetPath), bridgeRecovery.packetDigest);
  const reachability = mode === 'reachability' || mode === 'reachability-ack';
  const run = { directory: join(dirname(context.directory), `activation-recovered-${reachability ? activationRolesSuccessor : activationRecoveryExecution}`),
    packet, digest: bridgeRecovery.packetDigest };
  const expectedHead = reachability ? rolesReachability.predecessorHead : '8f39ac9f7bd58155cfa8a58aa75987c02d634f07424f5f3875c168f1c04e4ac1';
  const provider = recoveredActivationProvider(context.guard, signal);
  if (mode === 'ack' || mode === 'reachability-ack') return reconcileRecoveredRolesAcknowledgement(run, expectedHead, provider, signal);
  const prepare = (observe: (stage: RecoveredRolesDiagnosticStage) => void) => {
      observe('artifact');
      verifyActivationArtifact(verifyArtifact(context.artifact, packet.artifactDigest), packet);
      const prepared = preparedRecoveryPhase(directory, requestDigest, packetPath, run.digest, 'roles', context.guard, signal, observe);
      try {
        observe('configuration');
        const inputs = parseAppRoleInputs(roleInputs(decodePhaseInput(prepared.values.ACTIVATION_ROLE_INPUTS), packet));
        return { inputs, dispose: prepared.dispose };
      } catch { prepared.dispose(); refuse(); }
  };
  if (mode === 'privileges') return diagnoseRecoveredRolePrivileges(run, expectedHead,
    '34305c99612689e7b9bf30f3dc073a99f92c02a3061f8a16f84f80c2d05b4b2a', provider, prepare, signal);
  if (mode === 'complete' || mode === 'reachability') return completeRecoveredRoles(run, expectedHead,
    verifyArtifact(context.artifact, packet.artifactDigest), provider, prepare, signal);
  return diagnoseRecoveredRoles(run, expectedHead, provider, prepare, signal);
}

export async function inputHelperMain(args: string[], signal: AbortSignal): Promise<void> {
  const [action, path, digest, phaseArg] = args;
  if (action === 'finalize-retained-reachability-bootstrap' || action === 'reconcile-retained-reachability-bootstrap-ack') {
    try {
      const result = await preparedRetainedBootstrapFinalization(args.slice(1), signal,
        action === 'reconcile-retained-reachability-bootstrap-ack');
      console.info(`BOOTSTRAP_FINALIZATION ${JSON.stringify(result)}`);
      if (result.status !== 'BOOTSTRAP_COMPLETE') process.exitCode = 1;
    } catch {
      console.info('BOOTSTRAP_FINALIZATION {"status":"STOP","stage":"guard","category":"refused"}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'inspect-retained-reachability-bootstrap') {
    try {
      const result = await preparedReachabilityBootstrap(['inspect-retained', ...args.slice(1)], signal, 'inspect-retained');
      console.info(`BOOTSTRAP_RETAINED_INSPECTION ${JSON.stringify(result)}`);
      if (result.status !== 'INSPECTED') process.exitCode = 1;
    } catch {
      console.info('BOOTSTRAP_RETAINED_INSPECTION {"status":"STOP","stage":"guard","category":"refused","inspection":null}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'continue-reachability-bootstrap-pretransaction') {
    try {
      const result = await preparedReachabilityBootstrap(['continue-pretransaction', ...args.slice(1)], signal, 'continue-pretransaction');
      console.info(`BOOTSTRAP_PRETRANSACTION_CONTINUATION ${JSON.stringify(result)}`);
      if (result.status !== 'BOOTSTRAP_COMPLETE') process.exitCode = 1;
    } catch {
      console.info('BOOTSTRAP_PRETRANSACTION_CONTINUATION {"status":"STOP","stage":"guard","category":"refused"}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'inspect-reachability-bootstrap-auth') {
    try {
      const result = await preparedReachabilityBootstrap(['observe-auth', ...args.slice(1)], signal, 'observe-auth');
      console.info(`BOOTSTRAP_AUTH_OBSERVATION ${JSON.stringify(result)}`);
      if (result.status !== 'AUTH_VERIFIED') process.exitCode = 1;
    } catch {
      console.info('BOOTSTRAP_AUTH_OBSERVATION {"status":"STOP","stage":"guard","category":"refused","sqlstate":null}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'reachability-bootstrap') {
    try {
      const result = await preparedReachabilityBootstrap(args.slice(1), signal);
      console.info(`RECOVERED_BOOTSTRAP ${JSON.stringify(result)}`);
      if (result.status === 'STOP') process.exitCode = 1;
    } catch {
      console.info('RECOVERED_BOOTSTRAP {"status":"STOP","stage":"guard","category":"refused","sqlstate":null}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'reachability-activation') {
    try {
      const result = await preparedReachabilityMigration(args.slice(1), signal);
      console.info(`RECOVERED_MIGRATION ${JSON.stringify(result)}`);
      if (result.status === 'STOP') process.exitCode = 1;
    } catch {
      console.info('RECOVERED_MIGRATION {"status":"STOP","stage":"guard","category":"refused","sqlstate":null}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'inspect-recovered-role-privileges') {
    try {
      const result = await diagnosePreparedRecoveredRoles(args.slice(1), signal, 'privileges');
      console.info(`RECOVERED_ROLE_PRIVILEGES ${JSON.stringify(result)}`);
      if (result.category !== 'passed') process.exitCode = 1;
    } catch {
      console.info('RECOVERED_ROLE_PRIVILEGES {"stage":"guard","category":"refused","sqlstate":null,"basis":"current-public-baseline","historicalPredicate":"unresolved","observations":[]}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'complete-recovered-roles' || action === 'reconcile-recovered-roles-ack'
    || action === 'complete-reachability-roles' || action === 'reconcile-reachability-roles-ack') {
    try {
      const mode = action === 'complete-reachability-roles' ? 'reachability'
        : action === 'reconcile-reachability-roles-ack' ? 'reachability-ack'
        : action === 'complete-recovered-roles' ? 'complete' : 'ack';
      const result = await diagnosePreparedRecoveredRoles(args.slice(1), signal, mode);
      console.info(`RECOVERED_ROLES_SUCCESSOR ${JSON.stringify(result)}`);
      if (!('status' in result) || result.status !== 'ROLES_COMPLETE') process.exitCode = 1;
    } catch {
      console.info('RECOVERED_ROLES_SUCCESSOR {"status":"STOP","stage":"guard","category":"refused","sqlstate":null,"roles":"unavailable"}');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'diagnose-recovered-roles') {
    try {
      const result = await diagnosePreparedRecoveredRoles(args.slice(1), signal);
      console.info(`RECOVERED_ROLES_DIAGNOSTIC ${JSON.stringify(result)}`);
      if (result.category !== 'passed' || !('roles' in result) || result.roles !== 'committed') process.exitCode = 1;
    } catch {
      console.info('RECOVERED_ROLES_DIAGNOSTIC {"stage":"guard","category":"refused","roles":"unavailable","reconciled":false}');
      process.exitCode = 1;
    }
  } else if (action === 'recovered-activation') {
    try { console.info(`RECOVERED_ACTIVATION ${JSON.stringify(await recoveredPreparedActivation(args.slice(1), signal))}`); }
    catch { console.info('RECOVERED_ACTIVATION {"category":"refused"}'); process.exitCode = 1; }
  } else if (action === 'attest-bridge-recovery' || action === 'continue-bridge-recovery' || action === 'promote-bridge-recovery') {
    try {
      const mode = action === 'promote-bridge-recovery' ? 'promote' : action === 'continue-bridge-recovery' ? 'continue' : 'attest';
      const result = await recoverPreparedBridge(args.slice(1), mode, signal);
      console.info(`BRIDGE_RECOVERY ${JSON.stringify(result)}`);
      if (('category' in result && result.category !== 'passed') || ('outcome' in result && result.outcome !== 'acknowledged')) process.exitCode = 1;
    } catch { console.info('BRIDGE_RECOVERY {"stage":"guard","category":"refused"}'); process.exitCode = 1; }
  } else if (action === 'prepare-ca-successor') {
    console.info(`CA_SUCCESSOR_PREPARED ${JSON.stringify(await prepareCaSuccessor(args.slice(1), signal))}`);
  } else if (action === 'check-role-ca') {
    const result = await diagnosePreparedRole(args.slice(1), signal, true);
    if (result) console.info(JSON.stringify(result));
    else process.exitCode = 1;
  } else if (action === 'diagnose-role-ca-overlay') {
    const result = await diagnosePreparedRole(args.slice(1), signal, 'public-ca-overlay');
    console.info(`ROLE_DIAGNOSTIC ${JSON.stringify(result)}`);
    if (result.category !== 'passed') process.exitCode = 1;
  } else if (action === 'diagnose-role') {
    const result = await diagnosePreparedRole(args.slice(1), signal);
    console.info(`ROLE_DIAGNOSTIC ${JSON.stringify(result)}`);
    if (result.category !== 'passed') process.exitCode = 1;
  } else if (['inspect-transfer', 'transfer-secrets', 'inspect-ca-replacement', 'replace-ca-secrets',
    'inspect-failed-preflight', 'record-failed-preflight'].includes(action ?? '')) {
    const binding = launcherBinding();
    if (!binding) refuse();
    binding.verify();
    const adapter = await import('./activation-input-transfer.js');
    try {
      if (action === 'inspect-transfer' && args.length === 7 && path && digest && phaseArg && args[4] && args[5] && args[6]) {
        const result = adapter.inspectPreparedTransfer(path, digest, phaseArg, args[4], args[5], args[6], binding);
        console.info(`TRANSFER_PLAN_READY ${JSON.stringify(result)}`);
      } else if (action === 'transfer-secrets' && args.length === 3 && path && digest) {
        const result = await adapter.transferPreparedSecrets(path, digest, binding, signal);
        console.info(`TRANSFER_COMPLETE ${JSON.stringify(result)}`);
      } else if (action === 'inspect-ca-replacement' && args.length === 2 && path) {
        console.info(`CA_REPLACEMENT_PLAN_READY ${JSON.stringify(await adapter.inspectCaReplacement(path, binding))}`);
      } else if (action === 'replace-ca-secrets' && args.length === 3 && path && digest) {
        console.info(`CA_REPLACEMENT_COMPLETE ${JSON.stringify(await adapter.replaceCaSecrets(path, digest, binding, signal))}`);
      } else if (action === 'inspect-failed-preflight' && args.length === 4) {
        console.info(`FAILED_PREFLIGHT_PROOF_READY ${JSON.stringify(await adapter.inspectFailedPreflight(args.slice(1), binding, signal))}`);
      } else if (action === 'record-failed-preflight' && args.length === 3 && path && digest) {
        console.info(`FAILED_PREFLIGHT_RECORDED ${JSON.stringify(await adapter.recordFailedPreflight(path, digest, binding, signal))}`);
      } else refuse();
    } catch (error) { throw new TransferOperationFailure(adapter.transferFailureMessage(error)); }
  } else if (action === 'prepare' && args.length === 3 && path && digest) {
    const directory = await prepareInputs(path, digest, signal);
    console.info(`INPUTS_PREPARED ${directory}`);
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const binding = launcherBinding();
    console.info(`DISCARD: ${binding ? binding.command(['discard', directory, digest])
      : [process.execPath, self, 'discard', directory, digest].map(quote).join(' ')}`);
  } else if (action === 'discard' && args.length === 3 && path && digest) {
    discardPreparedInputs(path, digest); console.info('PREPARED_INPUTS_REMOVED');
  } else if (action === 'validate-worker' && args.length === 4 && path && digest && phaseArg) {
    const phase = phaseName(phaseArg), request = requestAt(path, digest), directory = outputDirectory(resolve(path, '..'));
    validatePreparedPhase(request, phase, process.env);
    writePrivate(join(directory, `${phase}.json`), phaseInputEnvironment(process.env, phase));
  } else if (action === 'bind-handoff' && args.length === 4 && path && digest && phaseArg) {
    console.info(`HANDOFF_BOUND ${bindPreparedHandoff(path, digest, phaseArg)}`);
  } else if (action === 'handoff' || action === 'check-handoff') await handoffPreparedPhase(args.slice(1), signal, action === 'check-handoff');
  else refuse();
}
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const abort = new AbortController(), cancel = () => abort.abort();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGTSTP'] as const;
  for (const signal of signals) process.on(signal, cancel);
  try { await inputHelperMain(process.argv.slice(2), abort.signal); }
  catch (error) { console.error(inputFailureMessage(error)); process.exitCode = 1; }
  finally { for (const signal of signals) process.removeListener(signal, cancel); }
}
