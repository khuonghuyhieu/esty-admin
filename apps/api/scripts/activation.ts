import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactTarget, canonical, inventory, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { activationPhases, appendActivationEvent, createActivationJournal, finishActivationJournal,
  importFrontendJournal, readActivationJournal, reserveActivationJournal, validateActivationPacket, verifyActivationArtifact } from './activation-journal.js';
import type { ActivationOutcome, ActivationPacket, ActivationPhase, ActivationState } from './activation-journal.js';
import { bootstrapInputs, decodePhaseInput, migrationInputs, phaseInputEnvironment, roleInputs, runtimeInputs } from './activation-inputs.js';
import { ActivationConfigurationError, configureActivation, inspectActivationConfiguration } from './activation-configuration.js';
import { AppRoleError, inspectAppRolePrerequisites, inspectAppRoles, inspectPrivateSchemaExposure, parseAppRoleInputs, provisionAppRoles } from './app-roles.js';
import { inspectAppBootstrap, runAppOperator } from './bootstrap-app-owner.js';
import { migrationStatus, runMigrations } from './migrations.js';
import { saveMigrationReport } from './migration-report.js';
import { parseConfig, parseMigrationConfig } from '../src/config/config.js';
import { createActivationProvider, deploymentId } from './ci-provider.js';
import type { ActivationProvider, RunIdentity } from './ci-provider.js';
import { deliverActivationCandidate, deliveryContext, officialCli } from './ci-delivery.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';

export interface ActivationRun { directory: string; packet: ActivationPacket; digest: string }
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
export async function authorizeActivationPhase(run: ActivationRun, phase: ActivationPhase, provider: ActivationProvider): Promise<void> {
  const current = state(run); requireNext(current, phase); requireProof(run, 'initial');
  if (phase === 'bootstrap' || phase === 'app-config' || phase === 'app' || phase === 'fe') requireProof(run, 'postflight');
  await provider.currentMain(); await provider.binding(predecessor(current, phase));
  const intent = append(run, phase, 'intent', { outcome: 'unknown' });
  const description = `activation:${phase}:intent:${intent.head}`;
  await provider.record(intent.journal, 'in_progress', description);
  await provider.confirmJournal(intent.journal, 'in_progress', description);
  append(run, phase, 'authorized', { intentHash: intent.head });
}
export async function confirmActivationPhase(run: ActivationRun, phase: ActivationPhase, provider: ActivationProvider): Promise<void> {
  const current = state(run); requireNext(current, phase);
  if (phase === 'migration') requireProof(run, 'postflight');
  const confirming = append(run, phase, 'confirming', { outcomeHash: current.head });
  const description = `activation:${phase}:outcome:${current.head}`;
  await provider.record(confirming.journal, 'in_progress', description);
  await provider.confirmJournal(confirming.journal, 'in_progress', description);
  append(run, phase, 'remote-confirmed', { outcomeHash: current.head });
}
export async function reconcileActivationAcknowledgement(run: ActivationRun, phase: ActivationPhase, provider: ActivationProvider): Promise<void> {
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
async function worker(run: ActivationRun, phase: ActivationPhase, artifact: VerifiedArtifact, env: NodeJS.ProcessEnv,
  cli: string, signal: AbortSignal, inspect: boolean): Promise<ActivationOutcome> {
  signal.throwIfAborted(); verifyActivationArtifact(artifact, run.packet);
  const inputs = phaseCredentials(env, phase), packet = run.packet;
  if (phase === 'bridge-config' || phase === 'app-config') {
    const runtimePhase = phase === 'bridge-config' ? 'bridge' : 'app';
    const values = runtimeInputs(decodePhaseInput(inputs[phase === 'bridge-config' ? 'ACTIVATION_BRIDGE_INPUTS' : 'ACTIVATION_APP_INPUTS']), packet, runtimePhase);
    if (runtimePhase === 'app') {
      const config = parseConfig({ ...values, VERCEL: '1' });
      if (!config.appFoundation) refuse();
      await inspectPrivateSchemaExposure(config.appFoundation, signal);
    }
    const receipt = await (inspect ? inspectActivationConfiguration : configureActivation)(values, packet, runtimePhase,
      inputs.VERCEL_CONFIGURATION_TOKEN ?? '', signal);
    return { ...publicOutcome(receipt, 'not_started', receipt.count), reportDigest: receipt.reportDigest };
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
    const database = parseMigrationConfig(values);
    if (inspect) {
      await exactHistory(database, packet, true);
      return publicOutcome({ history: packet.migrations, reconciliation: 'read-only-target' }, 'committed', 2);
    }
    await exactHistory(database, packet, false);
    const report = await runMigrations(database, { sourceRevision: packet.revision, target: packet.target, signal });
    const saved = saveMigrationReport(report, join(run.directory, 'migration-reports'));
    const confirmed = saved && report.result === 'success' && report.database_outcome === 'committed'
      && report.attempted.length === 2 && report.attempted.every(item => item.outcome === 'applied_committed')
      && canonical(report.before) === canonical(packet.migrations.slice(0, 1).map(item => item.name))
      && canonical(report.after) === canonical(packet.migrations.map(item => item.name));
    if (confirmed) {
      try { await exactHistory(database, packet, true); }
      catch { return publicOutcome(report, report.database_outcome, report.attempted.length, null, 'unknown'); }
    }
    return publicOutcome(report, report.database_outcome, report.attempted.length, null, confirmed ? 'confirmed'
      : ['not_started', 'rolled_back'].includes(report.database_outcome) ? 'failed' : 'unknown');
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
