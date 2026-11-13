import fs, { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactTarget, canonical, inventory, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { activationPhases, appendActivationEvent, createActivationJournal, createRecoveredActivationJournal, finishActivationJournal,
  importFrontendJournal, readActivationJournal, reserveActivationJournal, saveActivationConfigurationReceipt, validateActivationPacket, verifyActivationArtifact } from './activation-journal.js';
import type { ActivationOutcome, ActivationPacket, ActivationPhase, ActivationState } from './activation-journal.js';
import { bootstrapInputs, decodePhaseInput, migrationInputs, phaseInputEnvironment, roleInputs, runtimeInputs } from './activation-inputs.js';
import { ActivationConfigurationError, configureActivation } from './activation-configuration.js';
import { AppRoleError, inspectAppRolePrerequisites, inspectAppRoles, inspectPrivateSchemaExposure, parseAppRoleInputs, provisionAppRoles, inspectRecoveredAppRoles } from './app-roles.js';
import type { AppRoleInputs, RecoveredRoleInspection, RoleProvisionDiagnostic } from './app-roles.js';
import { activationRecoveryExecution, activationRolesSuccessor, rolesReachability } from './activation-recovery-origin.js';
import { bridgeRecovery } from './activation-candidate-recovery.js';
import { inspectAppBootstrap, runAppOperator } from './bootstrap-app-owner.js';
import { migrationStatus, migrationsDirectory, runMigrations } from './migrations.js';
import { verifyMigrationFiles } from './migration-files.mjs';
import { inspectRolePrivilegeBaseline } from './activation-diagnostic.js';
import type { RolePrivilegeBaseline } from './activation-diagnostic.js';
import { saveMigrationReport } from './migration-report.js';
import { parseAppOperatorConfig, parseConfig, parseMigrationConfig } from '../src/config/config.js';
import { AuthAdmin } from '../src/app-foundation/adapters/auth-admin.js';
import type { AuthUserObservation } from '../src/app-foundation/adapters/auth-admin.js';
import { createActivationProvider, deploymentId } from './ci-provider.js';
import type { ActivationProvider, RunIdentity } from './ci-provider.js';
import { deliverActivationCandidate, deliveryContext, officialCli } from './ci-delivery.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';

export interface ActivationRun { directory: string; packet: ActivationPacket; digest: string }
export type ActivationPhaseProvider = Pick<ActivationProvider, 'currentMain' | 'binding' | 'record' | 'confirmJournal'>;
function refuse(): never { throw new Error('Activation remains fenced; inspect retained evidence without replaying effects.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, unknown>;
}
export function activationContext(env: NodeJS.ProcessEnv, packet: ActivationPacket): RunIdentity {
  if (env.BE_ACTIVATION_CONTEXT === 'operator') {
    if (env.BE_ACTIVATION_ENABLED !== 'true' || env.BE_DELIVERY_ENABLED !== 'true'
      || env.BE_DELIVERY_ENVIRONMENT !== 'be-production' || env.BE_ACTIVATION_OPERATOR_APPROVAL !== packet.runId
      || !/^[1-9][0-9]*$/.test(env.BE_ACTIVATION_BUILD_RUN ?? '')) refuse();
    return { revision: packet.revision, tree: packet.tree, run: env.BE_ACTIVATION_BUILD_RUN! };
  }
  if (env.BE_ACTIVATION_CONTEXT !== undefined && env.BE_ACTIVATION_CONTEXT !== 'actions') refuse();
  return deliveryContext(env, packet.tree);
}
function state(run: ActivationRun): ActivationState { return readActivationJournal(run.directory, run.packet, run.digest); }
function append(run: ActivationRun, phase: ActivationPhase, kind: Parameters<typeof appendActivationEvent>[4], value: unknown): ActivationState {
  return appendActivationEvent(run.directory, run.packet, run.digest, phase, kind, value);
}
function publicOutcome(value: object, databaseOutcome: ActivationOutcome['databaseOutcome'], count: number,
  id: string | null = null, result: ActivationOutcome['result'] = 'confirmed'): ActivationOutcome {
  return { result, databaseOutcome, count, deploymentId: id, reportDigest: sha256(canonical(value)) };
}
function knownId(current: ActivationState, phase: ActivationPhase): string | null {
  if (phase === 'bridge' && current.recovery) {
    const id = current.recovery.bridgeId;
    if (typeof id !== 'string' || !deploymentId.test(id)) refuse();
    return id;
  }
  const event = current.events.find(item => item.phase === phase && item.kind === 'acknowledged');
  if (!event) return null;
  const id = object(event.value).deploymentId;
  if (typeof id !== 'string' || !deploymentId.test(id)) refuse();
  return id;
}
function predecessor(current: ActivationState, phase: ActivationPhase): string {
  if (phase === 'bridge-config' || phase === 'bridge') return current.packet.predecessorId;
  const id = knownId(current, phase === 'fe' ? 'app' : 'bridge');
  if (!id) refuse();
  return id;
}
function requireNext(current: ActivationState, phase: ActivationPhase): void { if (current.next !== phase) refuse(); }
function proofPath(run: ActivationRun, name: 'initial' | 'postflight'): string {
  return join(run.directory, `${run.packet.runId}.${name}.json`);
}
function initialProof(run: ActivationRun): object {
  return { version: 1, packetDigest: run.digest, inputDigest: run.packet.roleInputDigest,
    history: run.packet.migrations.slice(0, 1).map(item => item.name), roles: 'compatible-or-absent' };
}
function postflightProof(run: ActivationRun): object {
  const started = state(run).events.find(event => event.phase === 'migration' && event.kind === 'started');
  if (!started) refuse();
  return { version: 1, packetDigest: run.digest, inputDigest: run.packet.roleInputDigest, startedHash: started.sha256,
    history: run.packet.migrations.map(item => item.name), roles: 'target-confirmed' };
}
function requireProof(run: ActivationRun, kind: 'initial' | 'postflight'): void {
  if (canonical(readEvidence(proofPath(run, kind)).value) !== canonical(kind === 'initial' ? initialProof(run) : postflightProof(run))) refuse();
}
async function exactHistory(database: ReturnType<typeof parseMigrationConfig>, packet: ActivationPacket, target: boolean): Promise<void> {
  const actual = await migrationStatus(database);
  const expected = packet.migrations.slice(0, target ? 3 : 1).map(item => item.name);
  if (!actual.initialized || !actual.ordered || actual.unexpected.length || canonical(actual.applied) !== canonical(expected)
    || canonical(actual.pending) !== canonical(packet.migrations.slice(expected.length).map(item => item.name))) refuse();
}
export async function authorizeActivationPhase(run: ActivationRun, phase: ActivationPhase, provider: ActivationPhaseProvider): Promise<void> {
  const current = state(run); requireNext(current, phase); requireProof(run, 'initial');
  if (phase === 'bootstrap' || phase === 'app-config' || phase === 'app' || phase === 'fe') requireProof(run, 'postflight');
  await provider.currentMain(); await provider.binding(predecessor(current, phase));
  const intent = append(run, phase, 'intent', { outcome: 'unknown' });
  const description = `activation:${phase}:intent:${intent.head}`;
  await provider.record(intent.journal, 'in_progress', description);
  await provider.confirmJournal(intent.journal, 'in_progress', description);
  append(run, phase, 'authorized', { intentHash: intent.head });
}
export async function confirmActivationPhase(run: ActivationRun, phase: ActivationPhase,
  provider: Pick<ActivationPhaseProvider, 'record' | 'confirmJournal'>): Promise<void> {
  const current = state(run); requireNext(current, phase);
  if (phase === 'migration') requireProof(run, 'postflight');
  const confirming = append(run, phase, 'confirming', { outcomeHash: current.head });
  const description = `activation:${phase}:outcome:${current.head}`;
  await provider.record(confirming.journal, 'in_progress', description);
  await provider.confirmJournal(confirming.journal, 'in_progress', description);
  append(run, phase, 'remote-confirmed', { outcomeHash: current.head });
}
export async function reconcileActivationAcknowledgement(run: ActivationRun, phase: ActivationPhase,
  provider: Pick<ActivationPhaseProvider, 'confirmJournal'>): Promise<void> {
  const current = state(run); requireNext(current, phase);
  const last = current.events.at(-1);
  if (last?.phase !== phase) refuse();
  if (last.kind === 'intent') {
    await provider.confirmJournal(current.journal, 'in_progress', `activation:${phase}:intent:${current.head}`);
    append(run, phase, 'authorized', { intentHash: current.head });
  } else if (last.kind === 'confirming') {
    if (phase === 'migration') requireProof(run, 'postflight');
    const hash = object(last.value).outcomeHash;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) refuse();
    await provider.confirmJournal(current.journal, 'in_progress', `activation:${phase}:outcome:${hash}`);
    append(run, phase, 'remote-confirmed', { outcomeHash: hash });
  } else refuse();
}
export async function executeActivationPhase(run: ActivationRun, phase: ActivationPhase,
  effect: () => Promise<ActivationOutcome>): Promise<void> {
  const current = state(run); requireNext(current, phase);
  append(run, phase, 'started', { outcome: 'unknown' });
  let outcome: ActivationOutcome;
  try { outcome = await effect(); }
  catch (error) {
    const databaseOutcome = error instanceof AppRoleError ? error.databaseOutcome
      : ['roles', 'migration', 'bootstrap'].includes(phase) ? 'unknown' : 'not_started';
    const result = error instanceof ActivationConfigurationError && error.outcome === 'not_started'
      || databaseOutcome === 'rolled_back' ? 'failed' : 'unknown';
    outcome = publicOutcome({ phase, error: 'unconfirmed' }, databaseOutcome, 0, knownId(state(run), phase), result);
  }
  append(run, phase, 'outcome', outcome);
  if (outcome.result !== 'confirmed') refuse();
}
export async function reconcileActivationEffect(run: ActivationRun, phase: ActivationPhase,
  inspect: () => Promise<ActivationOutcome>): Promise<void> {
  // One-way Secret metadata cannot resolve a missing write acknowledgement or receipt.
  if (phase === 'bridge-config' || phase === 'app-config') refuse();
  const current = state(run); requireNext(current, phase);
  const last = current.events.at(-1);
  if (!last || last.phase !== phase || !['started', 'acknowledged', 'candidate-attested', 'promotion-intent', 'outcome'].includes(last.kind)
    || (last.kind === 'outcome' && object(last.value).result === 'confirmed')) refuse();
  const result = await inspect();
  if (result.result !== 'confirmed') refuse();
  append(run, phase, 'reconciled', result);
}
export async function completeActivation(run: ActivationRun, provider: ActivationProvider, reconcile: boolean): Promise<void> {
  const current = state(run); if (current.next !== null) refuse();
  const id = knownId(current, 'app'); if (!id) refuse();
  await provider.currentMain(); await provider.binding(id);
  const intent = { packetDigest: run.digest, head: current.head, journal: current.journal };
  const path = join(run.directory, `${run.packet.runId}.activation-finishing.json`);
  if (reconcile) {
    if (canonical(readEvidence(path).value) !== canonical(intent)) refuse();
  } else writeReleaseEvidence(path, intent);
  const description = `activation_complete:${current.head}`;
  if (!reconcile) await provider.record(current.journal, 'success', description);
  await provider.confirmJournal(current.journal, 'success', description);
  finishActivationJournal(run.directory, run.packet, run.digest);
}
function phaseCredentials(env: NodeJS.ProcessEnv, phase: ActivationPhase): Record<string, string> {
  return phaseInputEnvironment(env, phase);
}
async function migrationEffect(run: ActivationRun, database: ReturnType<typeof parseMigrationConfig>,
  signal: AbortSignal, mode: 'run' | 'inspect' | 'noop'): Promise<ActivationOutcome> {
  const packet = run.packet;
  if (mode === 'inspect') {
    await exactHistory(database, packet, true);
    return publicOutcome({ history: packet.migrations, reconciliation: 'read-only-target' }, 'committed', 2);
  }
  const noop = mode === 'noop', before = packet.migrations.slice(0, noop ? 3 : 1).map(item => item.name);
  await exactHistory(database, packet, noop);
  const report = await runMigrations(database, { sourceRevision: packet.revision, target: packet.target, signal,
    expectedBefore: before });
  const saved = saveMigrationReport(report, join(run.directory, 'migration-reports'));
  const confirmed = saved && report.result === 'success' && report.database_outcome === 'committed'
    && report.attempted.length === (noop ? 0 : 2)
    && report.attempted.every((item, index) => item.outcome === 'applied_committed'
      && item.name === packet.migrations[index + 1]?.name && item.sha256 === packet.migrations[index + 1]?.sha256)
    && canonical(report.before) === canonical(before)
    && canonical(report.after) === canonical(packet.migrations.map(item => item.name));
  if (confirmed) {
    try { signal.throwIfAborted(); await exactHistory(database, packet, true); }
    catch { return publicOutcome(report, report.database_outcome, report.attempted.length, null, 'unknown'); }
  }
  return publicOutcome(report, report.database_outcome, report.attempted.length, null, confirmed ? 'confirmed'
    : ['not_started', 'rolled_back'].includes(report.database_outcome) ? 'failed' : 'unknown');
}
async function migrationPostflight(run: ActivationRun, roles: AppRoleInputs, signal: AbortSignal): Promise<void> {
  await exactHistory(roles.authority, run.packet, true);
  await inspectAppRoles(roles, true, signal);
  signal.throwIfAborted();
  writeReleaseEvidence(proofPath(run, 'postflight'), postflightProof(run));
}
async function worker(run: ActivationRun, phase: ActivationPhase, artifact: VerifiedArtifact, env: NodeJS.ProcessEnv,
  cli: string, signal: AbortSignal, inspect: boolean): Promise<ActivationOutcome> {
  signal.throwIfAborted(); verifyActivationArtifact(artifact, run.packet);
  const inputs = phaseCredentials(env, phase), packet = run.packet;
  if (phase === 'bridge-config' || phase === 'app-config') {
    if (inspect) refuse();
    const runtimePhase = phase === 'bridge-config' ? 'bridge' : 'app';
    const values = runtimeInputs(decodePhaseInput(inputs[phase === 'bridge-config' ? 'ACTIVATION_BRIDGE_INPUTS' : 'ACTIVATION_APP_INPUTS']), packet, runtimePhase);
    if (runtimePhase === 'app') {
      const config = parseConfig({ ...values, VERCEL: '1' });
      if (!config.appFoundation) refuse();
      await inspectPrivateSchemaExposure(config.appFoundation, signal);
    }
    const receipt = await configureActivation(values, packet, runtimePhase, inputs.VERCEL_CONFIGURATION_TOKEN ?? '', signal);
    return saveActivationConfigurationReceipt(run.directory, packet, run.digest, phase, receipt);
  }
  if (phase === 'roles') {
    const values = parseAppRoleInputs(roleInputs(decodePhaseInput(inputs.ACTIVATION_ROLE_INPUTS), packet));
    await exactHistory(values.authority, packet, false);
    if (inspect) { await inspectAppRoles(values, false, signal); return publicOutcome({ roles: 'confirmed-existing' }, 'committed', 0); }
    const result = await provisionAppRoles(values, signal);
    return publicOutcome(result, result.databaseOutcome, result.created);
  }
  if (phase === 'migration') {
    const values = migrationInputs(decodePhaseInput(inputs.ACTIVATION_MIGRATION_INPUTS), packet);
    return migrationEffect(run, parseMigrationConfig(values), signal, inspect ? 'inspect' : 'run');
  }
  if (phase === 'bootstrap') {
    const values = bootstrapInputs(decodePhaseInput(inputs.ACTIVATION_BOOTSTRAP_INPUTS), packet);
    const before = await inspectAppBootstrap(values);
    if (before === 'committed') return publicOutcome({ bootstrap: 'exact-committed', binding: packet.bootstrapBindingDigest }, 'committed', 0);
    if (inspect || before !== 'absent') refuse();
    await runAppOperator('bootstrap', values);
    try { if (await inspectAppBootstrap(values) !== 'committed') refuse(); }
    catch { return publicOutcome({ bootstrap: 'postcommit-inspection-unconfirmed', binding: packet.bootstrapBindingDigest }, 'committed', 1, null, 'unknown'); }
    return publicOutcome({ bootstrap: 'exact-committed', binding: packet.bootstrapBindingDigest }, 'committed', 1);
  }
  const activation = { packet, packetDigest: run.digest, phase: phase === 'bridge' ? 'bridge' as const : 'app' as const };
  const provider = createActivationProvider(artifact, activationContext(env, packet), { github: inputs.GITHUB_TOKEN ?? '',
    vercel: inputs.VERCEL_TOKEN ?? '', bearer: inputs.BE_PREVIEW_ACCESS_KEY ?? '' }, signal, activation);
  const current = state(run);
  if (phase === 'fe') {
    await provider.binding(predecessor(current, phase));
    const receipt = decodePhaseInput(inputs.ACTIVATION_FE_RECEIPT);
    await provider.acceptFrontend(receipt, env.BE_FE_ACCEPTANCE_SHA256 ?? '');
    await provider.binding(predecessor(current, phase));
    return publicOutcome(object(receipt), 'not_started', 1);
  }
  if (inspect) {
    const id = knownId(current, phase);
    if (!id || !current.events.some(event => event.phase === phase && event.kind === 'promotion-intent')) refuse();
    await provider.currentMain(); await provider.binding(id);
    if (!(await provider.inspect(id)).ready) refuse();
    await provider.attest(id); await provider.http('https://api.lovora.us', false); await provider.binding(id);
    return publicOutcome({ phase, deploymentId: id, config: phase === 'bridge' ? packet.bridgeConfigDigest : packet.appConfigDigest }, 'not_started', 1, id);
  }
  if (!cli.endsWith('/vercel/dist/vc.js')
    || JSON.parse(readFileSync(resolve(cli, '../../package.json'), 'utf8')).version !== '65.4.0') refuse();
  const official = await officialCli(artifact, cli, inputs.VERCEL_TOKEN ?? '', signal, activation);
  try {
    const id = await deliverActivationCandidate({ artifact, activation, provider, cli: official, predecessor: predecessor(current, phase),
      journal: current.journal, signal, persist: (kind, value) => { append(run, phase, kind, value); } });
    return publicOutcome({ phase, deploymentId: id, config: phase === 'bridge' ? packet.bridgeConfigDigest : packet.appConfigDigest }, 'not_started', 1, id);
  } finally { await official.dispose(); }
}
export async function runRecoveredActivationEffect(run: ActivationRun, phase: ActivationPhase, artifact: VerifiedArtifact,
  env: NodeJS.ProcessEnv, signal: AbortSignal, inspect = false): Promise<ActivationOutcome> {
  signal.throwIfAborted();
  if (!['roles', 'migration', 'bootstrap', 'app-config'].includes(phase) || (inspect && phase === 'app-config')) refuse();
  const current = state(run); requireNext(current, phase);
  if (!current.recovery) refuse();
  const last = current.events.at(-1);
  if (last?.phase !== phase || (inspect
    ? last.kind !== 'started' && (last.kind !== 'outcome' || object(last.value).result === 'confirmed')
    : last.kind !== 'started')) refuse();
  // Reject cross-phase credentials, then pass only the private phase's allowed inputs.
  const inputs = phaseCredentials(env, phase);
  return worker(run, phase, artifact, inputs, '', signal, inspect);
}
export async function runRecoveredActivationPostflight(run: ActivationRun, artifact: VerifiedArtifact,
  env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const current = state(run); requireNext(current, 'migration');
  if (!current.recovery) refuse();
  const last = current.events.at(-1);
  if (last?.phase !== 'migration' || !['outcome', 'reconciled'].includes(last.kind)
    || object(last.value).result !== 'confirmed') refuse();
  const inputs = phaseCredentials(env, 'roles');
  verifyActivationArtifact(artifact, run.packet);
  const roles = parseAppRoleInputs(roleInputs(decodePhaseInput(inputs.ACTIVATION_ROLE_INPUTS), run.packet));
  await migrationPostflight(run, roles, signal);
}

const reachabilityRolesHead = '68c594864050258ce965e3e6881dae4d6151ab45fa7faf80a0ba8d7253621c80';
export interface MigrationContinuationInputs {
  database?: ReturnType<typeof parseMigrationConfig>;
  roles?: AppRoleInputs;
  dispose(): void;
}
export interface MigrationContinuationResult {
  status: 'CONTINUED' | 'MIGRATION_COMPLETE' | 'NOOP_COMPLETE' | 'STOP';
  stage: 'guard' | 'assets' | 'provider' | 'input' | 'migration' | 'postflight' | 'confirmation' | 'noop' | 'complete';
  category: 'passed' | 'refused' | 'aborted'; sqlstate: null;
  head: string | null; next: ActivationPhase | null; events: number | null;
  databaseOutcome: ActivationOutcome['databaseOutcome'] | null; count: number | null;
}
function migrationBaseline(run: ActivationRun, expectedRolesHead: string, bootstrap = false) {
  const current = state(run), prefix = current.events.slice(0, 6);
  if (current.recovery?.executionId !== rolesReachability.executionId
    || current.recovery.bridgeId !== bridgeRecovery.candidate || !/^[a-f0-9]{64}$/.test(expectedRolesHead)
    || prefix.length !== 6 || prefix.some(event => event.phase !== 'roles')
    || canonical(prefix.map(event => event.kind)) !== canonical(['intent', 'authorized', 'started', 'outcome', 'confirming', 'remote-confirmed'])
    || prefix[5]?.sha256 !== expectedRolesHead
    || current.events.slice(6).some(event => event.phase !== 'migration' && (!bootstrap || event.phase !== 'bootstrap'))
    || !(bootstrap ? ['bootstrap', 'app-config'] : ['migration', 'bootstrap']).includes(current.next ?? '')) refuse();
  const outcome = object(prefix[3]!.value);
  if (outcome.result !== 'confirmed' || outcome.databaseOutcome !== 'committed' || outcome.count !== 2) refuse();
  const origin = object(readEvidence(join(run.directory, 'activation', run.packet.runId, 'recovery-origin.json')).value);
  const verification = { version: 1, executionId: rolesReachability.executionId,
    predecessorHead: object(origin.rolesPredecessor).head, outcomeHash: prefix[3]!.sha256,
    roles: ['app_runtime', 'app_operator'], inspection: 'exact-read-only-committed' };
  if (canonical(readEvidence(join(run.directory, `${run.packet.runId}.roles-verification.json`)).value) !== canonical(verification)
    || canonical(readEvidence(join(run.directory, `${run.packet.runId}.roles-complete.json`)).value)
      !== canonical({ ...verification, head: expectedRolesHead, status: 'ROLES_COMPLETE' })
    || sha256(readFileSync(new URL('./app-roles.js', import.meta.url))) !== rolesReachability.correction.moduleSha256) refuse();
  return current;
}
export async function continueReachabilityMigration(run: ActivationRun, action: string, artifact: VerifiedArtifact,
  provider: ActivationPhaseProvider, prepare: (phase: 'migration' | 'roles') => MigrationContinuationInputs,
  outerSignal: AbortSignal, expectedRolesHead = reachabilityRolesHead): Promise<MigrationContinuationResult> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(120000)]);
  let stage: MigrationContinuationResult['stage'] = 'guard';
  let noopOutcome: ActivationOutcome | undefined;
  const result = (status: MigrationContinuationResult['status'], category: MigrationContinuationResult['category']): MigrationContinuationResult => {
    let current: ActivationState | undefined;
    try { current = migrationBaseline(run, expectedRolesHead); } catch { /* Unverified state is never reported as durable. */ }
    const last = current?.events.findLast(event => event.phase === 'migration' && ['outcome', 'reconciled'].includes(event.kind));
    const outcome = action === 'verify-noop' ? noopOutcome : (last ? object(last.value) as unknown as ActivationOutcome : undefined);
    return { status, stage, category, sqlstate: null, head: current?.head ?? null, next: current?.next ?? null,
      events: current?.events.length ?? null, databaseOutcome: outcome?.databaseOutcome ?? null, count: outcome?.count ?? null };
  };
  try {
    if (!['state', 'authorize', 'run', 'postflight', 'confirm', 'reconcile-ack', 'inspect', 'verify-noop'].includes(action)) refuse();
    signal.throwIfAborted();
    const before = migrationBaseline(run, expectedRolesHead);
    stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet);
    if (action === 'state') {
      stage = 'complete'; return result(before.next === 'bootstrap' ? 'MIGRATION_COMPLETE' : 'CONTINUED', 'passed');
    }
    if (action === 'verify-noop' ? before.next !== 'bootstrap' : before.next !== 'migration') refuse();
    const last = before.events.at(-1)!;
    stage = 'provider';
    await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    signal.throwIfAborted();
    if (migrationBaseline(run, expectedRolesHead).head !== before.head) refuse();
    if (action === 'reconcile-ack') {
      stage = 'confirmation';
      await reconcileActivationAcknowledgement(run, 'migration', provider);
    } else {
      const intent = before.events.find(event => event.phase === 'migration' && event.kind === 'intent');
      const boundary = action === 'authorize' || action === 'verify-noop';
      if (boundary && last.kind !== 'remote-confirmed') refuse();
      if (!boundary && !intent) refuse();
      const description = boundary ? `activation:${last.phase}:outcome:${object(last.value).outcomeHash}`
        : `activation:migration:intent:${intent!.sha256}`;
      await provider.confirmJournal(before.journal, 'in_progress', description);
      signal.throwIfAborted();
      if (migrationBaseline(run, expectedRolesHead).head !== before.head) refuse();
      if (action === 'authorize') await authorizeActivationPhase(run, 'migration', provider);
      else if (action === 'confirm') {
        stage = 'confirmation'; await confirmActivationPhase(run, 'migration', provider);
      } else {
        if (action === 'run' && last.kind !== 'authorized') refuse();
        if (action === 'inspect' && (last.kind !== 'started'
          && (last.kind !== 'outcome' || object(last.value).result === 'confirmed'))) refuse();
        if (action === 'postflight' && (!['outcome', 'reconciled'].includes(last.kind) || object(last.value).result !== 'confirmed')) refuse();
        const noopPath = join(run.directory, `${run.packet.runId}.migration-noop`);
        const noopBinding = { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest, head: before.head };
        if (action === 'verify-noop') {
          requireProof(run, 'postflight');
          // Exclusive durable intent fences concurrent callers, partial input preparation and lost reports.
          writeReleaseEvidence(`${noopPath}-started.json`, noopBinding);
        }
        const effect = async () => {
          stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet); signal.throwIfAborted();
          stage = 'input';
          const prepared = prepare(action === 'postflight' ? 'roles' : 'migration');
          try {
            signal.throwIfAborted();
            if (action === 'postflight') {
              if (!prepared.roles) refuse();
              stage = 'postflight'; await migrationPostflight(run, prepared.roles, signal); return;
            }
            if (!prepared.database) refuse();
            stage = action === 'verify-noop' ? 'noop' : 'migration';
            return await migrationEffect(run, prepared.database, signal, action === 'inspect' ? 'inspect'
              : action === 'verify-noop' ? 'noop' : 'run');
          } finally { prepared.dispose(); }
        };
        if (action === 'run') await executeActivationPhase(run, 'migration', async () => (await effect())!);
        else if (action === 'inspect') await reconcileActivationEffect(run, 'migration', async () => (await effect())!);
        else if (action === 'postflight') await effect();
        else {
          noopOutcome = (await effect())!;
          writeReleaseEvidence(`${noopPath}-result.json`, { ...noopBinding, outcome: noopOutcome });
          if (noopOutcome.result !== 'confirmed' || noopOutcome.databaseOutcome !== 'committed' || noopOutcome.count !== 0) refuse();
        }
      }
    }
    signal.throwIfAborted();
    const current = migrationBaseline(run, expectedRolesHead);
    stage = 'complete';
    return result(action === 'verify-noop' ? 'NOOP_COMPLETE' : current.next === 'bootstrap' ? 'MIGRATION_COMPLETE' : 'CONTINUED', 'passed');
  } catch {
    return result('STOP', signal.aborted ? 'aborted' : 'refused');
  }
}

const reachabilityMigrationHead = '09384d5f5adcd4900f479f347f035926e3a2b7c1745ebcb8fdc9f15bced0025c';
export interface BootstrapContinuationResult {
  status: 'CONTINUED' | 'BOOTSTRAP_COMPLETE' | 'STOP';
  stage: 'guard' | 'assets' | 'provider' | 'input' | 'preflight' | 'auth' | 'bootstrap' | 'inspection' | 'confirmation' | 'complete';
  category: 'passed' | 'refused' | 'aborted'; sqlstate: null;
  head: string | null; next: ActivationPhase | null; events: number | null;
  databaseOutcome: ActivationOutcome['databaseOutcome'] | null; count: number | null;
  inspection: 'absent' | 'committed' | 'conflict' | null;
}
function bootstrapBaseline(run: ActivationRun, heads: { roles: string; migration: string }) {
  const current = migrationBaseline(run, heads.roles, true), prefix = current.events.slice(6, 12);
  if (prefix.length !== 6 || prefix.some(event => event.phase !== 'migration')
    || canonical(prefix.map(event => event.kind)) !== canonical(['intent', 'authorized', 'started', 'outcome', 'confirming', 'remote-confirmed'])
    || prefix[5]!.sha256 !== heads.migration || current.events.slice(12).some(event => event.phase !== 'bootstrap')) refuse();
  const outcome = object(prefix[3]!.value), binding = { version: 1, executionId: rolesReachability.executionId,
    packetDigest: run.digest, head: heads.migration };
  const noopPath = join(run.directory, `${run.packet.runId}.migration-noop`);
  const noop = object(readEvidence(`${noopPath}-result.json`).value), nooped = object(noop.outcome);
  if (outcome.result !== 'confirmed' || outcome.databaseOutcome !== 'committed' || outcome.count !== 2
    || canonical(readEvidence(`${noopPath}-started.json`).value) !== canonical(binding)
    || canonical(noop) !== canonical({ ...binding, outcome: nooped })
    || nooped.result !== 'confirmed' || nooped.databaseOutcome !== 'committed' || nooped.count !== 0) refuse();
  requireProof(run, 'postflight');
  const directory = join(run.directory, 'migration-reports'), files = readdirSync(directory);
  if (files.length !== 2 || files.some(file => !/^[a-f0-9-]+\.json$/.test(file))) refuse();
  const reports = files.map(file => object(readEvidence(join(directory, file)).value));
  for (const [effect, count] of [[outcome, 2], [nooped, 0]] as const) {
    const report = reports.find(value => sha256(canonical(value)) === effect.reportDigest);
    const expected = run.packet.migrations.map(item => item.name);
    if (!report || report.result !== 'success' || report.database_outcome !== 'committed' || report.reporting !== 'written'
      || report.source_revision !== run.packet.revision || report.target !== run.packet.target
      || report.manifest_digest !== sha256(canonical(run.packet.migrations))
      || canonical(report.before) !== canonical(count ? expected.slice(0, 1) : expected)
      || canonical(report.after) !== canonical(expected)
      || canonical(report.attempted) !== canonical(count ? run.packet.migrations.slice(1).map(item => ({
        ...item, outcome: 'applied_committed' })) : [])) refuse();
  }
  return current;
}
export async function continueReachabilityBootstrap(run: ActivationRun, action: string, artifact: VerifiedArtifact,
  provider: ActivationPhaseProvider, prepare: () => { env: NodeJS.ProcessEnv; dispose(): void },
  outerSignal: AbortSignal, heads = { roles: reachabilityRolesHead, migration: reachabilityMigrationHead }): Promise<BootstrapContinuationResult> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(120000)]);
  let stage: BootstrapContinuationResult['stage'] = 'guard', inspection: BootstrapContinuationResult['inspection'] = null;
  const baseline = () => bootstrapBaseline(run, heads);
  const proofPath = join(run.directory, `${run.packet.runId}.bootstrap-verification.json`);
  const readyPath = join(run.directory, `${run.packet.runId}.bootstrap-ready.json`);
  const binding = { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest,
    migrationHead: heads.migration, bootstrapBindingDigest: run.packet.bootstrapBindingDigest };
  const proof = () => {
    const current = baseline(), started = current.events.find(event => event.phase === 'bootstrap' && event.kind === 'started');
    if (!started) refuse();
    return { ...binding, startedHash: started.sha256, inspection: 'exact-committed-profile-workspace-active-owner-audit' };
  };
  const requireVerification = () => { if (canonical(readEvidence(proofPath).value) !== canonical(proof())) refuse(); };
  const result = (status: BootstrapContinuationResult['status'], category: BootstrapContinuationResult['category']): BootstrapContinuationResult => {
    let current: ActivationState | undefined;
    try { current = baseline(); } catch { /* Do not report unverified state. */ }
    const last = current?.events.findLast(event => event.phase === 'bootstrap' && ['outcome', 'reconciled'].includes(event.kind));
    const outcome = last ? object(last.value) as unknown as ActivationOutcome : undefined;
    const started = current?.events.some(event => event.phase === 'bootstrap' && event.kind === 'started');
    return { status, stage, category, sqlstate: null, head: current?.head ?? null, next: current?.next ?? null,
      events: current?.events.length ?? null, databaseOutcome: outcome?.databaseOutcome ?? (current ? started ? 'unknown' : 'not_started' : null),
      count: outcome?.count ?? (current && !started ? 0 : null), inspection };
  };
  try {
    if (!['state', 'authorize', 'run', 'inspect', 'confirm', 'reconcile-ack'].includes(action)) refuse();
    signal.throwIfAborted();
    const before = baseline(), last = before.events.at(-1)!;
    stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet);
    if (action === 'state') { stage = 'complete'; return result(before.next === 'app-config' ? 'BOOTSTRAP_COMPLETE' : 'CONTINUED', 'passed'); }
    if (readdirSync(dirname(run.directory)).some(name => name.startsWith(`${run.packet.runId}.bootstrap-pretransaction-continuation-`))) refuse();
    if (before.next !== 'bootstrap') refuse();
    stage = 'provider';
    await provider.currentMain(); await provider.binding(bridgeRecovery.candidate); signal.throwIfAborted();
    if (baseline().head !== before.head) refuse();
    if (action === 'reconcile-ack') {
      if (last.kind === 'confirming') requireVerification();
      stage = 'confirmation'; await reconcileActivationAcknowledgement(run, 'bootstrap', provider);
    } else {
      const intent = before.events.find(event => event.phase === 'bootstrap' && event.kind === 'intent');
      if (action === 'authorize' ? last.kind !== 'remote-confirmed' || last.phase !== 'migration' : !intent) refuse();
      await provider.confirmJournal(before.journal, 'in_progress', action === 'authorize'
        ? `activation:migration:outcome:${object(last.value).outcomeHash}` : `activation:bootstrap:intent:${intent!.sha256}`);
      signal.throwIfAborted(); if (baseline().head !== before.head) refuse();
      if (action === 'authorize') await authorizeActivationPhase(run, 'bootstrap', provider);
      else if (action === 'confirm') {
        requireVerification(); stage = 'confirmation'; await confirmActivationPhase(run, 'bootstrap', provider);
      } else {
        if (action === 'run' && last.kind !== 'authorized') refuse();
        if (action === 'inspect' && !['authorized', 'started', 'outcome', 'reconciled'].includes(last.kind)) refuse();
        const attemptPath = join(run.directory, `${run.packet.runId}.bootstrap-attempt.json`);
        if (action === 'run') writeReleaseEvidence(attemptPath, { ...binding, authorizedHead: before.head });
        else if (!existsSync(attemptPath)) refuse();
        stage = 'input'; const prepared = prepare();
        try {
          signal.throwIfAborted();
          const config = parseAppOperatorConfig(prepared.env);
          stage = 'preflight'; inspection = await inspectAppBootstrap(prepared.env); signal.throwIfAborted();
          if (baseline().head !== before.head || inspection === 'conflict') refuse();
          if (action === 'run') {
            stage = 'auth'; await new AuthAdmin(config.appFoundation, config.key).verifiedUser(prepared.env.APP_OPERATOR_USER_ID ?? '', signal);
            signal.throwIfAborted(); if (baseline().head !== before.head) refuse();
            writeReleaseEvidence(readyPath, { ...binding, authorizedHead: before.head, before: inspection });
            const count = inspection === 'committed' ? 0 : 1;
            stage = 'bootstrap';
            await executeActivationPhase(run, 'bootstrap', async () => {
              if (count) await runAppOperator('bootstrap', prepared.env);
              signal.throwIfAborted();
              stage = 'inspection'; inspection = await inspectAppBootstrap(prepared.env);
              if (inspection !== 'committed') refuse();
              return publicOutcome({ bootstrap: 'exact-committed', binding: run.packet.bootstrapBindingDigest }, 'committed', count);
            });
          } else {
            stage = 'inspection';
            if (inspection !== 'committed' || last.kind === 'authorized') refuse();
            const ready = object(readEvidence(readyPath).value);
            const authorized = before.events.find(event => event.phase === 'bootstrap' && event.kind === 'authorized');
            if (!['absent', 'committed'].includes(String(ready.before))
              || canonical(ready) !== canonical({ ...binding, authorizedHead: authorized?.sha256, before: ready.before })) refuse();
            if (last.kind === 'started' || (last.kind === 'outcome' && object(last.value).result !== 'confirmed')) {
              await reconcileActivationEffect(run, 'bootstrap', async () => publicOutcome({
                bootstrap: 'exact-committed', binding: run.packet.bootstrapBindingDigest,
              }, 'committed', ready.before === 'committed' ? 0 : 1));
            }
          }
          if (!existsSync(proofPath)) writeReleaseEvidence(proofPath, proof());
          requireVerification();
        } finally { prepared.dispose(); }
      }
    }
    signal.throwIfAborted(); stage = 'complete';
    return result(baseline().next === 'app-config' ? 'BOOTSTRAP_COMPLETE' : 'CONTINUED', 'passed');
  } catch { return result('STOP', signal.aborted ? 'aborted' : 'refused'); }
}

export interface BootstrapAuthObservationResult {
  status: 'AUTH_VERIFIED' | 'AUTH_REFUSED' | 'STOP';
  stage: 'guard' | 'assets' | 'provider' | 'input' | 'auth' | 'complete';
  category: AuthUserObservation['category']; sqlstate: null;
  auth: AuthUserObservation | null; head: string | null; events: number | null;
}
export async function observeReachabilityBootstrapAuth(run: ActivationRun, artifact: VerifiedArtifact,
  provider: ActivationPhaseProvider, prepare: () => { env: NodeJS.ProcessEnv; dispose(): void }, outerSignal: AbortSignal,
  expected = { roles: reachabilityRolesHead, migration: reachabilityMigrationHead,
    authorized: '15c9f8e0cfcfa48463a2b5035bbf2bbdd7997c736e395ddbacb832dec05d6e01' }): Promise<BootstrapAuthObservationResult> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(120000)]);
  let stage: BootstrapAuthObservationResult['stage'] = 'guard', auth: AuthUserObservation | null = null;
  let head: string | null = null, events: number | null = null;
  const result = (status: BootstrapAuthObservationResult['status'], category: BootstrapAuthObservationResult['category']): BootstrapAuthObservationResult =>
    ({ status, stage, category, sqlstate: null, auth, head, events });
  const baseline = () => {
    const current = bootstrapBaseline(run, expected);
    if (current.head !== expected.authorized || current.events.length !== 14 || current.next !== 'bootstrap'
      || current.events[12]!.kind !== 'intent' || current.events[13]!.kind !== 'authorized'
      || existsSync(join(run.directory, `${run.packet.runId}.bootstrap-ready.json`))
      || existsSync(join(run.directory, `${run.packet.runId}.bootstrap-verification.json`))) refuse();
    const binding = { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest,
      migrationHead: expected.migration, bootstrapBindingDigest: run.packet.bootstrapBindingDigest, authorizedHead: expected.authorized };
    if (canonical(readEvidence(join(run.directory, `${run.packet.runId}.bootstrap-attempt.json`)).value) !== canonical(binding)) refuse();
    return current;
  };
  try {
    signal.throwIfAborted();
    const before = baseline(), retained = canonical(inventory(run.directory));
    head = before.head; events = before.events.length;
    stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet);
    // Observation receipts are siblings, never activation events or changes to the attempted execution.
    const observation = join(dirname(run.directory), `${run.packet.runId}.bootstrap-auth-observation`);
    if (existsSync(`${observation}-started.json`) || existsSync(`${observation}-result.json`)) refuse();
    stage = 'provider';
    await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    await provider.confirmJournal(before.journal, 'in_progress', `activation:bootstrap:intent:${before.events[12]!.sha256}`);
    signal.throwIfAborted(); baseline();
    if (canonical(inventory(run.directory)) !== retained) refuse();
    const binding = { version: 1, kind: 'read-only-existing-user-auth', executionId: rolesReachability.executionId,
      packetDigest: run.digest, head: before.head, bootstrapBindingDigest: run.packet.bootstrapBindingDigest };
    writeReleaseEvidence(`${observation}-started.json`, binding);
    stage = 'input'; const prepared = prepare();
    try {
      signal.throwIfAborted();
      const config = parseAppOperatorConfig(prepared.env);
      stage = 'auth';
      auth = await new AuthAdmin(config.appFoundation, config.key).inspectVerifiedUser(prepared.env.APP_OPERATOR_USER_ID ?? '', signal);
    } finally { prepared.dispose(); }
    signal.throwIfAborted(); baseline();
    if (canonical(inventory(run.directory)) !== retained) refuse();
    writeReleaseEvidence(`${observation}-result.json`, { ...binding, auth, databaseAccess: false, journalUnchanged: true });
    stage = 'complete';
    return result(auth.status === 'verified' ? 'AUTH_VERIFIED' : 'AUTH_REFUSED', auth.category);
  } catch {
    try { const current = baseline(); head = current.head; events = current.events.length; }
    catch { head = null; events = null; }
    return result('STOP', signal.aborted ? 'aborted' : 'refused');
  }
}

const bootstrapContinuationLineage = {
  roles: reachabilityRolesHead, migration: reachabilityMigrationHead,
  authorized: '15c9f8e0cfcfa48463a2b5035bbf2bbdd7997c736e395ddbacb832dec05d6e01',
  inventory: '9bb5d4f89214b03a638bd3f8640c9854fc82fb264120046f07abb6e6fe48d0c6',
  attempt: 'df1534387874d5553d986b648c184ad55cea680052f12f7532bf078f21c0dc6f',
  observationStarted: 'e291d046d1502a328205604b4e49e39d4918274e748f4e51cd682db831ed46e7',
  receipts: {
    'p2-name-fix/actual-bootstrap-result.json': 'ee58d1940e2eb85720a7c26cbb1ab507abe1e48c418976a9466019f0dedc4028',
    'p2-name-fix/actual-bootstrap-durable-outcome.json': '2333108292002caddf7b1385c952271384d02dcb6c612e20860c0cce57a583b0',
    'auth-observation/actual-auth-observation-run.json': '50ba509d932c4bcd2d4fb01d8a90d148489623a50e3ae65276f8b4726142ab50',
    'auth-observation/actual-auth-observation-durable-outcome.json': '31f0823e15abb31294e896441f65da62ba2fb5855ded23e64222221c8f4e763d',
  },
};
// Only pinned, sealed public receipts use 0400; live release/journal evidence remains 0600.
function verifyImmutableBootstrapReceipt(path: string, expectedDigest: string): void {
  privateDirectory(dirname(path), false);
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.uid !== BigInt(process.getuid!()) || (before.mode & 0o777n) !== 0o400n
      || before.nlink !== 1n || before.size <= 0n || before.size > 65536n) refuse();
    const bytes = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) refuse();
      offset += count;
    }
    const after = fs.fstatSync(fd, { bigint: true }), linked = fs.lstatSync(path, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode
      || before.uid !== after.uid || before.gid !== after.gid || before.nlink !== after.nlink
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || after.dev !== linked.dev || after.ino !== linked.ino || after.mode !== linked.mode
      || after.uid !== linked.uid || after.gid !== linked.gid || after.nlink !== linked.nlink
      || after.size !== linked.size || after.mtimeNs !== linked.mtimeNs || after.ctimeNs !== linked.ctimeNs
      || linked.isSymbolicLink() || sha256(bytes) !== expectedDigest) refuse();
    privateDirectory(dirname(path), false);
  } finally { fs.closeSync(fd); }
}
const bootstrapContinuationEffects = {
  inspect: inspectAppBootstrap,
  bootstrap: (env: NodeJS.ProcessEnv) => runAppOperator('bootstrap', env),
};
type BootstrapContinuationStage = 'guard' | 'assets' | 'claim-persist' | 'provider-main' | 'provider-binding'
  | 'provider-intent' | 'post-provider-baseline' | 'post-provider-inventory' | 'input' | 'preflight'
  | 'pre-start-baseline' | 'pre-start-inventory' | 'ready-persist' | 'ready-link-persist' | 'started-persist'
  | 'product-bootstrap' | 'post-product-cancel' | 'post-product-baseline' | 'post-product-inventory'
  | 'postflight-inspection' | 'outcome-persist' | 'input-dispose' | 'verification-persist' | 'verification-readback'
  | 'confirming-persist' | 'provider-outcome-record' | 'provider-outcome-confirm' | 'confirmed-persist'
  | 'terminal-persist' | 'complete';
export interface BootstrapPretransactionResult {
  status: 'BOOTSTRAP_COMPLETE' | 'STOP'; stage: BootstrapContinuationStage; failedStage: BootstrapContinuationStage | null;
  category: 'passed' | 'refused' | 'aborted'; head: string | null; events: number | null; next: ActivationPhase | null;
  databaseOutcome: 'not_started' | 'committed' | 'unknown'; count: 0 | 1 | null;
}
export async function continueReachabilityBootstrapPretransaction(run: ActivationRun, artifact: VerifiedArtifact,
  provider: ActivationPhaseProvider, prepare: () => { env: NodeJS.ProcessEnv; dispose(): void },
  evidenceDirectory: string, executableDigest: string, outerSignal: AbortSignal,
  expected = bootstrapContinuationLineage, effects = bootstrapContinuationEffects): Promise<BootstrapPretransactionResult> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(120000)]);
  const prefix = `${run.packet.runId}.bootstrap-pretransaction-continuation-`, parent = dirname(run.directory);
  const observation = `${run.packet.runId}.bootstrap-auth-observation-`;
  const readyName = `${run.packet.runId}.bootstrap-ready.json`, verificationName = `${run.packet.runId}.bootstrap-verification.json`;
  const attemptPath = join(run.directory, `${run.packet.runId}.bootstrap-attempt.json`);
  const binding = { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest,
    migrationHead: expected.migration, bootstrapBindingDigest: run.packet.bootstrapBindingDigest };
  let stage: BootstrapContinuationStage = 'guard', failedStage: BootstrapContinuationStage | null = null;
  let retained = '', ownedHead = expected.authorized, claimed = false, terminalAttempted = false, committedProof = false;
  const owned = new Map<string, { sha256: string; size: number }>(), siblings = new Map<string, string>();
  const baseline = () => bootstrapBaseline(run, expected);
  const result = (status: BootstrapPretransactionResult['status']): BootstrapPretransactionResult => {
    let current: ActivationState | undefined;
    try { current = baseline(); } catch { /* Invalid or partial journal state is never certified. */ }
    const started = current?.events.some(event => event.phase === 'bootstrap' && event.kind === 'started');
    const databaseOutcome = committedProof ? 'committed' : current && !started ? 'not_started' : 'unknown';
    return { status, stage, failedStage, category: status === 'BOOTSTRAP_COMPLETE' ? 'passed' : signal.aborted ? 'aborted' : 'refused',
      head: current?.head ?? null, events: current?.events.length ?? null, next: current?.next ?? null,
      databaseOutcome, count: databaseOutcome === 'committed' ? 1 : databaseOutcome === 'not_started' ? 0 : null };
  };
  const historical = () => {
    const attempt = readEvidence(attemptPath);
    if (attempt.identity.sha256 !== expected.attempt
      || canonical(attempt.value) !== canonical({ ...binding, authorizedHead: expected.authorized })) refuse();
    const names = readdirSync(parent);
    if (canonical(names.filter(name => name.startsWith(observation)).sort()) !== canonical([`${observation}started.json`])
      || readEvidence(join(parent, `${observation}started.json`)).identity.sha256 !== expected.observationStarted) refuse();
    for (const [path, digest] of Object.entries(expected.receipts)) {
      verifyImmutableBootstrapReceipt(join(evidenceDirectory, path), digest);
    }
    if (canonical(names.filter(name => name.startsWith(prefix)).sort()) !== canonical([...siblings.keys()].sort())) refuse();
    for (const [name, digest] of siblings) if (readEvidence(join(parent, name)).identity.sha256 !== digest) refuse();
  };
  const checkBaseline = () => {
    signal.throwIfAborted(); historical();
    const current = baseline();
    if (current.head !== ownedHead) refuse();
    return current;
  };
  const checkInventory = () => {
    const current = inventory(run.directory);
    for (const [name, expectedFile] of owned) {
      const file = current.files.find(file => file.path === name);
      if (!file || file.sha256 !== expectedFile.sha256 || file.size !== expectedFile.size || file.mode !== 0o600) refuse();
    }
    if (canonical({ files: current.files.filter(file => !owned.has(file.path)), directories: current.directories }) !== retained) refuse();
  };
  const remember = (name: string, value: unknown) => {
    const bytes = JSON.stringify(value, null, 2) + '\n';
    owned.set(name, { sha256: sha256(bytes), size: Buffer.byteLength(bytes) });
  };
  const persistSibling = (suffix: string, value: unknown) => {
    const name = `${prefix}${suffix}.json`, digest = sha256(JSON.stringify(value, null, 2) + '\n');
    writeReleaseEvidence(join(parent, name), value);
    if (readEvidence(join(parent, name)).identity.sha256 !== digest) refuse();
    siblings.set(name, digest);
    return digest;
  };
  const appendOwned = (kind: 'started' | 'outcome' | 'confirming' | 'remote-confirmed', value: unknown) => {
    const before = checkBaseline(); checkInventory();
    const after = append(run, 'bootstrap', kind, value), event = after.events.at(-1)!;
    if (after.events.length !== before.events.length + 1 || event.previousHash !== before.head
      || event.kind !== kind || canonical(event.value) !== canonical(value)) refuse();
    remember(`activation/${run.packet.runId}/${String(event.sequence).padStart(3, '0')}.json`, event);
    ownedHead = after.head; checkInventory();
    return after;
  };
  const claim = { ...binding, kind: 'fixed-pretransaction-continuation', authorizedHead: expected.authorized,
    attemptSha256: expected.attempt, observationStartedSha256: expected.observationStarted,
    priorReceipts: expected.receipts, retainedInventoryDigest: expected.inventory, executableDigest };
  try {
    signal.throwIfAborted();
    if (!/^[a-f0-9]{64}$/.test(executableDigest)) refuse();
    historical();
    const before = baseline();
    if (before.head !== expected.authorized || before.events.length !== 14 || before.next !== 'bootstrap'
      || before.events[12]!.kind !== 'intent' || before.events[13]!.kind !== 'authorized'
      || existsSync(join(run.directory, readyName)) || existsSync(join(run.directory, verificationName))) refuse();
    retained = canonical(inventory(run.directory));
    if (sha256(retained) !== expected.inventory) refuse();
    stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet);
    stage = 'claim-persist'; const claimDigest = persistSibling('started', claim); claimed = true;
    stage = 'provider-main'; await provider.currentMain();
    stage = 'provider-binding'; await provider.binding(bridgeRecovery.candidate);
    stage = 'provider-intent'; await provider.confirmJournal(before.journal, 'in_progress', `activation:bootstrap:intent:${before.events[12]!.sha256}`);
    stage = 'post-provider-baseline'; checkBaseline();
    stage = 'post-provider-inventory'; checkInventory();
    stage = 'input'; const prepared = prepare();
    let startedHash = '';
    try {
      parseAppOperatorConfig(prepared.env); signal.throwIfAborted();
      stage = 'preflight'; if (await effects.inspect(prepared.env) !== 'absent') refuse();
      stage = 'pre-start-baseline'; checkBaseline();
      stage = 'pre-start-inventory'; checkInventory();
      const ready = { ...binding, authorizedHead: expected.authorized, before: 'absent' };
      stage = 'ready-persist'; writeReleaseEvidence(join(run.directory, readyName), ready); remember(readyName, ready); checkInventory();
      stage = 'ready-link-persist'; persistSibling('ready', { ...binding, claimDigest, readySha256: owned.get(readyName)!.sha256 });
      stage = 'started-persist'; startedHash = appendOwned('started', { outcome: 'unknown' }).head;
      stage = 'product-bootstrap';
      try {
        // Only the existing product service verifies Auth. Historical observation is not an authorization substitute.
        await effects.bootstrap(prepared.env);
        stage = 'post-product-cancel'; signal.throwIfAborted();
        stage = 'post-product-baseline'; checkBaseline();
        stage = 'post-product-inventory'; checkInventory();
        stage = 'postflight-inspection'; if (await effects.inspect(prepared.env) !== 'committed') refuse();
      } catch {
        failedStage = stage;
        // Preserve UNKNOWN without invoking the product again; cancellation must not fabricate a confirmed outcome.
        if (!signal.aborted) {
          stage = 'outcome-persist';
          appendOwned('outcome', publicOutcome({ phase: 'bootstrap', error: 'unconfirmed' }, 'unknown', 0, null, 'unknown'));
        }
        refuse();
      }
      stage = 'outcome-persist';
      appendOwned('outcome', publicOutcome({ bootstrap: 'exact-committed', binding: run.packet.bootstrapBindingDigest }, 'committed', 1));
    } catch (error) { failedStage ??= stage; throw error; }
    finally {
      const previousStage = stage;
      try { stage = 'input-dispose'; prepared.dispose(); }
      catch (error) {
        const primaryFailed = failedStage !== null;
        failedStage ??= 'input-dispose';
        if (!primaryFailed) throw error;
      }
      stage = previousStage;
    }
    const proof = { ...binding, startedHash, inspection: 'exact-committed-profile-workspace-active-owner-audit' };
    stage = 'verification-persist'; writeReleaseEvidence(join(run.directory, verificationName), proof); remember(verificationName, proof);
    stage = 'verification-readback';
    if (canonical(readEvidence(join(run.directory, verificationName)).value) !== canonical(proof)) refuse();
    checkBaseline(); checkInventory(); committedProof = true;
    const outcomeHash = ownedHead;
    stage = 'confirming-persist'; appendOwned('confirming', { outcomeHash });
    stage = 'provider-outcome-record'; await provider.record(before.journal, 'in_progress', `activation:bootstrap:outcome:${outcomeHash}`);
    stage = 'provider-outcome-confirm'; await provider.confirmJournal(before.journal, 'in_progress', `activation:bootstrap:outcome:${outcomeHash}`);
    stage = 'confirmed-persist'; appendOwned('remote-confirmed', { outcomeHash });
    stage = 'terminal-persist'; terminalAttempted = true;
    persistSibling('result', { ...binding, claimDigest, result: { ...result('BOOTSTRAP_COMPLETE'), stage: 'complete' } });
    stage = 'complete'; return result('BOOTSTRAP_COMPLETE');
  } catch {
    failedStage ??= stage;
    const stopped = result('STOP');
    if (claimed && !terminalAttempted) {
      try {
        terminalAttempted = true;
        persistSibling('result', { ...binding, claimDigest: siblings.get(`${prefix}started.json`), result: stopped });
      } catch { stage = 'terminal-persist'; }
    }
    return result('STOP');
  }
}

const retainedBootstrapLineage = {
  ...bootstrapContinuationLineage,
  head: '99f6123eb3b53cd6c23124d45977f16d2e0b9b4bb56abfccbd228c26d913d4d7',
  inventory: '14fd17d3fc7ac53d9554ba4d334ebd192977805765855bee570e8367e7845b7a',
  productExecutable: 'd0ef179b97deb3ac696f735faa04be3bfdc356e1f82cedee607703797f7ada76',
  claim: 'b7fe277830450949da3eb31e2e9f4bfb8f06cd571c798fe4b6db279959e817b3',
  readyLink: '808a0180af5748088655f3b08ca3d413574a876706aaa8e68af4b8990ebdcb7d',
  terminal: '5858cea581f649f6cf1fbd5311b63341bfaa044002332313337024d6db752ca0',
  ready: '8f89eb41f0c613c7a59521569d63a370aaa0c543a0080729a9b1da548ae5869a',
  startedFile: 'e6647f3a9a4e07cd9f7c84bb3af58219fc7c0370d7b3b6630f5716fc4c6a0787',
  outcomeFile: '9f067bd75bb22227f848abae4cc6e240c65a62c7f2e1bdd3591168a4cd97c15d',
  receipts: {
    ...bootstrapContinuationLineage.receipts,
    'pretransaction-continuation/immutable-receipt-fix/actual-product-bootstrap-run.json':
      '85c8bb98438f3a50d42bac3c1a0febb42de307d36dd2f869b79f5f1caa845d58',
    'pretransaction-continuation/immutable-receipt-fix/actual-product-bootstrap-durable-outcome.json':
      '43ed2922a4e010558b08bc0413eef1fe011eceb74acc16766fcf210b1f01c453',
  },
};
type RetainedInspectionStage = 'guard' | 'assets' | 'observation-start' | 'provider-main' | 'provider-binding'
  | 'provider-intent' | 'post-provider' | 'input' | 'pre-inspection' | 'inspection' | 'post-inspection'
  | 'input-dispose' | 'observation-result' | 'complete';
export interface RetainedBootstrapInspectionResult {
  status: 'INSPECTED' | 'STOP'; stage: RetainedInspectionStage; failedStage: RetainedInspectionStage | null;
  category: 'passed' | 'refused' | 'aborted'; inspection: 'absent' | 'committed' | 'conflict' | null;
  cleanupFailed: boolean; head: string | null; events: number | null; next: ActivationPhase | null;
}
export async function inspectRetainedReachabilityBootstrap(run: ActivationRun, artifact: VerifiedArtifact,
  provider: ActivationPhaseProvider, prepare: () => { env: NodeJS.ProcessEnv; dispose(): void },
  evidenceDirectory: string, executableDigest: string, outerSignal: AbortSignal,
  expected = retainedBootstrapLineage, inspect = inspectAppBootstrap): Promise<RetainedBootstrapInspectionResult> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(120000)]), parent = dirname(run.directory);
  const id = run.packet.runId, continuation = `${id}.bootstrap-pretransaction-continuation-`;
  const observation = `${id}.bootstrap-retained-inspection-`, owned = new Map<string, string>();
  const binding = { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest,
    head: expected.head, continuationClaimSha256: expected.claim, executableDigest };
  let stage: RetainedInspectionStage = 'guard', failedStage: RetainedInspectionStage | null = null;
  let inspection: RetainedBootstrapInspectionResult['inspection'] = null, cleanupFailed = false;
  let claimed = false, terminalAttempted = false;
  const baseline = () => bootstrapBaseline(run, expected);
  const result = (status: RetainedBootstrapInspectionResult['status']): RetainedBootstrapInspectionResult => {
    let current: ActivationState | undefined;
    try { current = baseline(); } catch { /* Never certify invalid local state. */ }
    return { status, stage, failedStage, category: status === 'INSPECTED' ? 'passed' : signal.aborted ? 'aborted' : 'refused',
      inspection, cleanupFailed, head: current?.head ?? null, events: current?.events.length ?? null, next: current?.next ?? null };
  };
  const check = () => {
    signal.throwIfAborted();
    const current = baseline(), names = readdirSync(parent);
    if (current.head !== expected.head || current.events.length !== 16 || current.next !== 'bootstrap'
      || current.events[13]!.sha256 !== expected.authorized || current.events[14]!.kind !== 'started'
      || current.events[15]!.kind !== 'outcome'
      || canonical(current.events[15]!.value) !== canonical(publicOutcome({
        bootstrap: 'exact-committed', binding: run.packet.bootstrapBindingDigest }, 'committed', 1))
      || sha256(canonical(inventory(run.directory))) !== expected.inventory
      || existsSync(join(run.directory, `${id}.bootstrap-verification.json`))) refuse();
    for (const [path, digest] of Object.entries(expected.receipts)) verifyImmutableBootstrapReceipt(join(evidenceDirectory, path), digest);
    for (const [path, digest] of [
      [`${id}.bootstrap-attempt.json`, expected.attempt], [`${id}.bootstrap-ready.json`, expected.ready],
      [`activation/${id}/014.json`, expected.startedFile], [`activation/${id}/015.json`, expected.outcomeFile],
    ]) if (readEvidence(join(run.directory, path!)).identity.sha256 !== digest) refuse();
    const authPrefix = `${id}.bootstrap-auth-observation-`;
    if (canonical(names.filter(name => name.startsWith(authPrefix)).sort()) !== canonical([`${authPrefix}started.json`])
      || readEvidence(join(parent, `${authPrefix}started.json`)).identity.sha256 !== expected.observationStarted
      || canonical(names.filter(name => name.startsWith(continuation)).sort())
        !== canonical(['ready', 'result', 'started'].map(suffix => `${continuation}${suffix}.json`))) refuse();
    const claim = readEvidence(join(parent, `${continuation}started.json`));
    const ready = readEvidence(join(parent, `${continuation}ready.json`));
    const terminal = readEvidence(join(parent, `${continuation}result.json`));
    if (claim.identity.sha256 !== expected.claim || ready.identity.sha256 !== expected.readyLink
      || terminal.identity.sha256 !== expected.terminal || object(claim.value).executableDigest !== expected.productExecutable
      || object(ready.value).claimDigest !== expected.claim || object(ready.value).readySha256 !== expected.ready
      || object(terminal.value).claimDigest !== expected.claim
      || canonical(object(terminal.value).result) !== canonical({ status: 'STOP', stage: 'input-dispose',
        failedStage: 'input-dispose', category: 'refused', head: expected.head, events: 16, next: 'bootstrap',
        databaseOutcome: 'unknown', count: null })) refuse();
    if (canonical(names.filter(name => name.startsWith(observation)).sort()) !== canonical([...owned.keys()].sort())) refuse();
    for (const [name, digest] of owned) if (readEvidence(join(parent, name)).identity.sha256 !== digest) refuse();
    return current;
  };
  const persist = (suffix: string, value: unknown) => {
    const name = `${observation}${suffix}.json`, digest = sha256(JSON.stringify(value, null, 2) + '\n');
    writeReleaseEvidence(join(parent, name), value);
    if (readEvidence(join(parent, name)).identity.sha256 !== digest) refuse();
    owned.set(name, digest);
  };
  try {
    if (!/^[a-f0-9]{64}$/.test(executableDigest)) refuse();
    const before = check();
    stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet);
    stage = 'observation-start';
    persist('started', { ...binding, kind: 'retained-bootstrap-read-only-inspection', inventoryDigest: expected.inventory });
    claimed = true;
    stage = 'provider-main'; await provider.currentMain();
    stage = 'provider-binding'; await provider.binding(bridgeRecovery.candidate);
    stage = 'provider-intent'; await provider.confirmJournal(before.journal, 'in_progress',
      `activation:bootstrap:intent:${before.events[12]!.sha256}`);
    stage = 'post-provider'; check();
    stage = 'input'; const prepared = prepare();
    let primaryFailed = false;
    try {
      parseAppOperatorConfig(prepared.env);
      stage = 'pre-inspection'; check();
      stage = 'inspection';
      const observed = await inspect(prepared.env);
      if (!['absent', 'committed', 'conflict'].includes(observed)) refuse();
      inspection = observed;
      if (inspection !== 'committed') refuse();
      stage = 'post-inspection'; check();
    } catch (error) { primaryFailed = true; failedStage ??= stage; throw error; }
    finally {
      const previousStage = stage;
      try { stage = 'input-dispose'; prepared.dispose(); }
      catch (error) { cleanupFailed = true; failedStage ??= stage; if (!primaryFailed) throw error; }
      stage = previousStage;
    }
    stage = 'observation-result'; terminalAttempted = true;
    persist('result', { ...binding, result: { ...result('INSPECTED'), stage: 'complete' } });
    stage = 'complete'; return result('INSPECTED');
  } catch {
    failedStage ??= stage;
    if (claimed && !terminalAttempted) {
      terminalAttempted = true;
      try { persist('result', { ...binding, result: result('STOP') }); }
      catch { stage = 'observation-result'; }
    }
    return result('STOP');
  }
}

export type RecoveredRolesDiagnosticStage = RecoveredRoleInspection['stage'] | 'guard' | 'provider' | 'artifact'
  | 'request' | 'packet' | 'receipt' | 'role-input' | 'role-validation' | 'reconciliation';
export interface RecoveredRolesDiagnostic extends Omit<RecoveredRoleInspection, 'stage'> {
  stage: RecoveredRolesDiagnosticStage;
  reconciled: boolean;
}
function verifyRecoveredRolesUnknown(run: ActivationRun, expectedHead: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const current = state(run), last = current.events.at(-1);
  if (!/^[a-f0-9]{64}$/.test(expectedHead) || current.head !== expectedHead || current.next !== 'roles'
    || current.recovery?.executionId !== activationRecoveryExecution || current.recovery.bridgeId !== bridgeRecovery.candidate
    || current.events.length !== 4 || current.events.some(event => event.phase !== 'roles')
    || canonical(current.events.map(event => event.kind)) !== canonical(['intent', 'authorized', 'started', 'outcome'])
    || canonical(last?.value) !== canonical(publicOutcome({ phase: 'roles', error: 'unconfirmed' }, 'unknown', 0, null, 'unknown'))) refuse();
  return current;
}
export async function diagnoseRecoveredRoles(run: ActivationRun, expectedHead: string,
  provider: ActivationPhaseProvider,
  prepare: (observe: (stage: RecoveredRolesDiagnosticStage) => void) => { inputs: AppRoleInputs; dispose(): void },
  signal: AbortSignal): Promise<RecoveredRolesDiagnostic> {
  let stage: RecoveredRolesDiagnosticStage = 'guard';
  let prepared: { inputs: AppRoleInputs; dispose(): void } | undefined;
  const verify = () => verifyRecoveredRolesUnknown(run, expectedHead, signal);
  const remote = async () => {
    const current = verify();
    await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    await provider.confirmJournal(current.journal, 'in_progress', `activation:roles:intent:${current.events[0]!.sha256}`);
    verify();
  };
  try {
    verify(); stage = 'provider'; await remote();
    prepared = prepare(value => { stage = value; });
    verify();
    const result = await inspectRecoveredAppRoles(prepared.inputs, signal);
    stage = 'guard'; verify();
    if (result.category !== 'passed' || result.roles !== 'committed') return { ...result, reconciled: false };
    stage = 'provider'; await remote();
    stage = 'reconciliation';
    await reconcileActivationEffect(run, 'roles', async () => {
      verify();
      return publicOutcome({ phase: 'roles', reconciliation: 'exact-read-only', unknownHead: expectedHead }, 'committed', 0);
    });
    await confirmActivationPhase(run, 'roles', provider);
    return { ...result, reconciled: true };
  } catch {
    return { stage, category: signal.aborted ? 'aborted' : 'refused', roles: 'unavailable', reconciled: false };
  } finally {
    prepared?.dispose();
    if (prepared) for (const config of [prepared.inputs.authority, prepared.inputs.runtime, prepared.inputs.operator]) config.password = undefined;
  }
}

export function verifyRecoveredRoleAssets(artifact: VerifiedArtifact, packet: ActivationPacket): void {
  verifyActivationArtifact(artifact, packet);
  verifyMigrationFiles(migrationsDirectory, packet.migrations);
}
export interface RolesSuccessorResult {
  status: 'ROLES_COMPLETE' | 'STOP';
  stage: RecoveredRolesDiagnosticStage | RoleProvisionDiagnostic['stage'] | 'assets' | 'authorize' | 'provision' | 'verification' | 'confirmation';
  category: RecoveredRoleInspection['category']; sqlstate: string | null;
  roles: RecoveredRoleInspection['roles'];
}
function verifyRolesPredecessor(run: ActivationRun, expectedHead: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const current = state(run);
  if (current.recovery?.executionId === activationRecoveryExecution) return verifyRecoveredRolesUnknown(run, expectedHead, signal);
  if (!/^[a-f0-9]{64}$/.test(expectedHead) || current.head !== expectedHead || current.next !== 'roles'
    || current.recovery?.executionId !== activationRolesSuccessor || current.recovery.bridgeId !== bridgeRecovery.candidate
    || current.events.length !== 4 || current.events.some(event => event.phase !== 'roles')
    || canonical(current.events.map(event => event.kind)) !== canonical(['intent', 'authorized', 'started', 'outcome'])
    || canonical(current.events.at(-1)?.value) !== canonical(publicOutcome({ phase: 'roles', error: 'unconfirmed' }, 'rolled_back', 0, null, 'failed'))
    || sha256(readFileSync(new URL('./app-roles.js', import.meta.url))) !== rolesReachability.correction.moduleSha256) refuse();
  return current;
}
function rolesSuccessorExecution(run: ActivationRun): string {
  const predecessor = state(run).recovery?.executionId;
  if (predecessor === activationRecoveryExecution) return activationRolesSuccessor;
  if (predecessor === activationRolesSuccessor) return rolesReachability.executionId;
  refuse();
}
function rolesSuccessorRun(run: ActivationRun): ActivationRun {
  return { ...run, directory: join(dirname(run.directory), `activation-recovered-${rolesSuccessorExecution(run)}`) };
}
function rolesVerification(run: ActivationRun, predecessorHead: string) {
  const current = state(run), executionId = current.recovery?.executionId;
  if (executionId !== activationRolesSuccessor && executionId !== rolesReachability.executionId) refuse();
  const outcome = current.events.find(event => event.phase === 'roles' && event.kind === 'outcome');
  if (!outcome || object(outcome.value).result !== 'confirmed' || object(outcome.value).databaseOutcome !== 'committed'
    || object(outcome.value).count !== 2) refuse();
  return { version: 1, executionId, predecessorHead, outcomeHash: outcome.sha256,
    roles: ['app_runtime', 'app_operator'], inspection: 'exact-read-only-committed' };
}
function saveRolesComplete(run: ActivationRun, predecessorHead: string): RolesSuccessorResult {
  const current = state(run);
  if (![activationRolesSuccessor, rolesReachability.executionId].includes(current.recovery?.executionId ?? '') || current.next !== 'migration'
    || current.events.length !== 6 || current.events.at(-1)?.kind !== 'remote-confirmed') refuse();
  writeReleaseEvidence(join(run.directory, `${run.packet.runId}.roles-complete.json`),
    { ...rolesVerification(run, predecessorHead), head: current.head, status: 'ROLES_COMPLETE' });
  return { status: 'ROLES_COMPLETE', stage: 'complete', category: 'passed', sqlstate: null, roles: 'committed' };
}
export async function completeRecoveredRoles(run: ActivationRun, expectedHead: string, artifact: VerifiedArtifact,
  provider: ActivationPhaseProvider,
  prepare: (observe: (stage: RecoveredRolesDiagnosticStage) => void) => { inputs: AppRoleInputs; dispose(): void },
  outerSignal: AbortSignal): Promise<RolesSuccessorResult> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(120000)]);
  let successor: ActivationRun;
  let stage: RolesSuccessorResult['stage'] = 'guard', failure: RoleProvisionDiagnostic | undefined;
  let prepared: ReturnType<typeof prepare> | undefined;
  const verify = () => verifyRolesPredecessor(run, expectedHead, signal);
  const remote = async () => {
    const current = verify();
    await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    await provider.confirmJournal(current.journal, 'in_progress', `activation:roles:intent:${current.events[0]!.sha256}`);
    verify();
  };
  try {
    verify(); successor = rolesSuccessorRun(run); if (existsSync(successor.directory)) refuse();
    stage = 'assets'; verifyRecoveredRoleAssets(artifact, run.packet);
    stage = 'provider'; await remote();
    prepared = prepare(value => { stage = value; });
    stage = 'verification';
    const absent = await inspectRecoveredAppRoles(prepared.inputs, signal);
    verify();
    if (absent.category !== 'passed' || absent.roles !== 'absent') return { ...absent, status: 'STOP', sqlstate: null };
    const observedAt = performance.now();
    stage = 'provider'; await remote();
    const origin = object(readEvidence(join(run.directory, 'activation', run.packet.runId, 'recovery-origin.json')).value);
    const source = object(origin.source).directory, promotion = object(origin.promotion).directory;
    if (typeof source !== 'string' || typeof promotion !== 'string' || performance.now() - observedAt > 30000) refuse();
    stage = 'guard'; verify();
    createRecoveredActivationJournal(source, promotion, successor.directory, run.packet, run.digest, rolesSuccessorExecution(run), expectedHead);
    stage = 'authorize'; await authorizeActivationPhase(successor, 'roles', provider);
    const authorized = state(successor);
    await provider.confirmJournal(authorized.journal, 'in_progress', `activation:roles:intent:${authorized.events[0]!.sha256}`);
    verify(); if (performance.now() - observedAt > 30000) refuse();
    await executeActivationPhase(successor, 'roles', async () => {
      stage = 'history'; await exactHistory(prepared!.inputs.authority, run.packet, false);
      stage = 'provision';
      try {
        const result = await provisionAppRoles(prepared!.inputs, signal, true);
        return publicOutcome(result, result.databaseOutcome, result.created);
      } catch (error) {
        if (error instanceof AppRoleError) failure = error.diagnostic;
        throw error;
      }
    });
    stage = 'verification';
    const committed = await inspectRecoveredAppRoles(prepared.inputs, signal);
    if (committed.category !== 'passed' || committed.roles !== 'committed') return { ...committed, status: 'STOP', sqlstate: null };
    verify();
    writeReleaseEvidence(join(successor.directory, `${run.packet.runId}.roles-verification.json`), rolesVerification(successor, expectedHead));
    stage = 'provider'; await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    await provider.confirmJournal(authorized.journal, 'in_progress', `activation:roles:intent:${authorized.events[0]!.sha256}`);
    verify();
    stage = 'confirmation'; await confirmActivationPhase(successor, 'roles', provider);
    return saveRolesComplete(successor, expectedHead);
  } catch {
    return { status: 'STOP', stage, category: signal.aborted ? 'aborted' : 'refused', sqlstate: null, roles: 'unavailable', ...failure };
  } finally {
    prepared?.dispose();
    if (prepared) for (const config of [prepared.inputs.authority, prepared.inputs.runtime, prepared.inputs.operator]) config.password = undefined;
  }
}
export async function reconcileRecoveredRolesAcknowledgement(run: ActivationRun, expectedHead: string,
  provider: ActivationPhaseProvider, signal: AbortSignal): Promise<RolesSuccessorResult> {
  let stage: RolesSuccessorResult['stage'] = 'guard';
  try {
    verifyRolesPredecessor(run, expectedHead, signal);
    const successor = rolesSuccessorRun(run), current = state(successor);
    if (current.recovery?.executionId !== rolesSuccessorExecution(run) || current.events.at(-1)?.kind !== 'confirming'
      || canonical(readEvidence(join(successor.directory, `${run.packet.runId}.roles-verification.json`)).value)
        !== canonical(rolesVerification(successor, expectedHead))) refuse();
    stage = 'provider'; await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    verifyRolesPredecessor(run, expectedHead, signal);
    stage = 'confirmation'; await reconcileActivationAcknowledgement(successor, 'roles', provider);
    return saveRolesComplete(successor, expectedHead);
  } catch {
    return { status: 'STOP', stage, category: signal.aborted ? 'aborted' : 'refused', sqlstate: null, roles: 'unavailable' };
  }
}
export interface RecoveredPrivilegeBaseline extends Omit<RolePrivilegeBaseline, 'stage'> {
  stage: RolePrivilegeBaseline['stage'] | RecoveredRolesDiagnosticStage;
}
export async function diagnoseRecoveredRolePrivileges(run: ActivationRun, expectedHead: string, failedHead: string,
  provider: Pick<ActivationPhaseProvider, 'currentMain' | 'binding' | 'confirmJournal'>,
  prepare: (observe: (stage: RecoveredRolesDiagnosticStage) => void) => { inputs: AppRoleInputs; dispose(): void },
  signal: AbortSignal): Promise<RecoveredPrivilegeBaseline> {
  let stage: RecoveredPrivilegeBaseline['stage'] = 'guard', prepared: ReturnType<typeof prepare> | undefined;
  const verify = () => {
    verifyRecoveredRolesUnknown(run, expectedHead, signal);
    const current = state(rolesSuccessorRun(run));
    if (!/^[a-f0-9]{64}$/.test(failedHead) || current.head !== failedHead || current.next !== 'roles'
      || current.recovery?.executionId !== activationRolesSuccessor || current.events.length !== 4
      || current.events.some(event => event.phase !== 'roles')
      || canonical(current.events.map(event => event.kind)) !== canonical(['intent', 'authorized', 'started', 'outcome'])
      || canonical(current.events.at(-1)?.value) !== canonical(publicOutcome({ phase: 'roles', error: 'unconfirmed' }, 'rolled_back', 0, null, 'failed'))) refuse();
    return current;
  };
  const remote = async () => {
    const current = verify();
    await provider.currentMain(); await provider.binding(bridgeRecovery.candidate);
    await provider.confirmJournal(current.journal, 'in_progress', `activation:roles:intent:${current.events[0]!.sha256}`);
    verify();
  };
  try {
    verify(); stage = 'provider'; await remote();
    prepared = prepare(value => { stage = value; });
    verify();
    const result = await inspectRolePrivilegeBaseline(prepared.inputs.authority, signal);
    stage = 'provider'; await remote();
    return result;
  } catch {
    return { stage, category: signal.aborted ? 'aborted' : 'refused', sqlstate: null,
      basis: 'current-public-baseline', historicalPredicate: 'unresolved', observations: [] };
  } finally {
    prepared?.dispose();
    if (prepared) for (const config of [prepared.inputs.authority, prepared.inputs.runtime, prepared.inputs.operator]) config.password = undefined;
  }
}
async function cliMain(args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  const [action, phaseName, packetPath, digest, artifactPath, directory, cli] = args;
  if (args.length !== 7 || !action || !phaseName || !packetPath || !digest || !artifactPath || !directory || !cli
    || env.BE_ACTIVATION_ENABLED !== 'true' || env.BE_ACTIVATION_PACKET_SHA256 !== digest
    || resolve(packetPath) !== join(resolve(directory), 'packet-input.json')) refuse();
  privateDirectory(directory);
  if (action === 'prepare') {
    if (Object.keys(phaseInputEnvironment(env, 'provider')).length) refuse();
    const packet = validateActivationPacket(decodePhaseInput(env.BE_ACTIVATION_PACKET_JSON), digest);
    activationContext(env, packet);
    writeReleaseEvidence(packetPath, packet); return;
  }
  const packet = validateActivationPacket(readEvidence(packetPath).value, digest);
  const identity = activationContext(env, packet);
  const artifact = verifyArtifact(artifactPath, packet.artifactDigest);
  verifyActivationArtifact(artifact, packet);
  if (packet.target === 'local' || process.versions.node !== artifactTarget.node || process.platform !== 'linux' || process.arch !== 'x64') refuse();
  const executingRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const expectedOperator = artifact.manifest.files.filter(file => file.path.startsWith('operator/')).map(file => ({ ...file, path: file.path.slice(9) }));
  const expectedDirectories = artifact.manifest.directories.filter(entry => entry.path.startsWith('operator/'))
    .map(entry => ({ ...entry, path: entry.path.slice(9) }));
  const executing = inventory(executingRoot);
  if (canonical(executing.files) !== canonical(expectedOperator) || canonical(executing.directories) !== canonical(expectedDirectories)) refuse();
  const run: ActivationRun = { directory, packet, digest };
  const phase = activationPhases.find(value => value === phaseName);
  const providerFor = () => {
    const values = phaseInputEnvironment(env, 'provider');
    return createActivationProvider(artifact, identity, { github: values.GITHUB_TOKEN ?? '', vercel: values.VERCEL_TOKEN ?? '',
      bearer: values.BE_PREVIEW_ACCESS_KEY ?? '' }, signal, { packet, packetDigest: digest, phase: phase === 'app' || phase === 'fe' ? 'app' : 'bridge' });
  };
  if (action === 'reserve') {
    const provider = providerFor(); await provider.currentMain();
    if (await provider.preflight() !== packet.predecessorId) refuse();
    createActivationJournal(directory, packet, digest);
    reserveActivationJournal(directory, packet, digest, await provider.reserve());
  } else if (action === 'import-fe') {
    if (env.BE_ACTIVATION_CONTEXT !== 'operator' || phase !== 'fe' || !env.BE_ACTIVATION_RECEIPTS_DIRECTORY) refuse();
    const provider = providerFor();
    await importFrontendJournal(env.BE_ACTIVATION_RECEIPTS_DIRECTORY, directory, packet, digest,
      env.BE_ACTIVATION_RECEIPTS_SHA256 ?? '', async (retained, outcomeHash) => {
        await provider.currentMain(); await provider.binding(predecessor(retained, 'fe'));
        await provider.confirmJournal(retained.journal, 'in_progress', `activation:app:outcome:${outcomeHash}`);
      });
    requireProof(run, 'initial'); requireProof(run, 'postflight');
  } else if (action === 'preflight' || action === 'postflight') {
    const current = state(run);
    if (action === 'preflight' ? current.next !== 'bridge-config' || current.events.length !== 0 : current.next !== 'migration') refuse();
    const values = phaseInputEnvironment(env, 'roles');
    const roles = parseAppRoleInputs(roleInputs(decodePhaseInput(values.ACTIVATION_ROLE_INPUTS), packet));
    await exactHistory(roles.authority, packet, action === 'postflight');
    if (action === 'preflight') await inspectAppRolePrerequisites(roles, signal);
    else await inspectAppRoles(roles, true, signal);
    writeReleaseEvidence(proofPath(run, action === 'preflight' ? 'initial' : 'postflight'), action === 'preflight' ? initialProof(run) : postflightProof(run));
  } else if (action === 'finish' || action === 'reconcile-finish') {
    await completeActivation(run, providerFor(), action === 'reconcile-finish');
  } else {
    if (!phase) refuse();
    if (action === 'authorize') await authorizeActivationPhase(run, phase, providerFor());
    else if (action === 'confirm') await confirmActivationPhase(run, phase, providerFor());
    else if (action === 'reconcile-ack') await reconcileActivationAcknowledgement(run, phase, providerFor());
    else if (action === 'run') await executeActivationPhase(run, phase, () => worker(run, phase, artifact, env, cli, signal, false));
    else if (action === 'reconcile-effect') await reconcileActivationEffect(run, phase, () => worker(run, phase, artifact, env, cli, signal, true));
    else refuse();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    await cliMain(process.argv.slice(2), process.env, AbortSignal.any([abort.signal, AbortSignal.timeout(900000)]));
    console.info(JSON.stringify({ activation: 'step-confirmed', action: process.argv[2], phase: process.argv[3] }));
  } catch { console.error('ACTIVATION_FENCED: preserve the journal and inspect without blind replay.'); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
