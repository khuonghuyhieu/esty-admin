import { join } from 'node:path';
import { canonical, sha256, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { manifestDigest, migrationStatus, runMigrations } from './migrations.js';
import type { Manifest, MigrationReport } from './migrations.js';
import { migrationInputs } from './activation-inputs.js';
import { parseMigrationConfig } from '../src/config/config.js';
import { activationSchema } from '../src/config/schema-transition.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { saveMigrationReport } from './migration-report.js';
import { privateDirectory } from './private-files.mjs';
import { createProvider } from './ci-provider.js';
import type { RoutineDeliveryApproval, RoutineProvider, RunIdentity } from './ci-provider.js';
import type { ReleaseDiagnostics, ReleaseRequest } from './ci-delivery.js';
import { decodePhaseInput } from './activation-inputs.js';
import { etsyProviderOperations, etsyReleasePhases, isolatedEtsyCli, runEtsyReleasePhase,
  validateEtsyReleasePacket } from './etsy-release.js';
import type { EtsyCli, EtsyReleaseDurability, EtsyReleaseIntent, EtsyReleaseOperations, EtsyReleasePacket, EtsyReleasePhase } from './etsy-release.js';

function writeObserved(diagnostics: ReleaseDiagnostics | undefined, path: string, value: unknown): void {
  if (diagnostics) diagnostics.observe(() => writeReleaseEvidence(path, value));
  else writeReleaseEvidence(path, value);
}
export interface RoutineMigrationPacket {
  version: 1; revision: string; tree: string; target: string;
  previous: Manifest; migrations: Manifest; migrationInputDigest: string;
  predecessor: { id: string; revision: string; artifact: string; configDigest: string };
  compatibilityApproval: string; recoveryApproval: string;
}
export interface RoutineSchema {
  digest: string;
  migration?: { packet: RoutineMigrationPacket; digest: string };
}
const hex = /^[a-f0-9]{64}$/;
function refuse(): never { throw new Error('Routine schema delivery requires exact approved, compatible and confirmed evidence.'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) refuse();
  return value as Record<string, unknown>;
}
export function approvedSchema(value: string | undefined): string {
  if (!value || !hex.test(value)) refuse();
  return value;
}
export function routinePacket(value: unknown, digest: string, artifact: VerifiedArtifact, run: RunIdentity): RoutineMigrationPacket {
  const data = object(value, ['version', 'revision', 'tree', 'target', 'previous', 'migrations', 'migrationInputDigest',
    'predecessor', 'compatibilityApproval', 'recoveryApproval']);
  const prior = object(data.predecessor, ['id', 'revision', 'artifact', 'configDigest']);
  if (data.version !== 1 || data.revision !== run.revision || data.tree !== run.tree
    || typeof data.target !== 'string' || !/^(local|supabase:[a-z]{20})$/.test(data.target)
    || ![data.migrationInputDigest, data.compatibilityApproval, data.recoveryApproval, prior.artifact, prior.configDigest]
      .every(item => typeof item === 'string' && hex.test(item))
    || typeof prior.id !== 'string' || !/^dpl_[A-Za-z0-9]{1,124}$/.test(prior.id)
    || typeof prior.revision !== 'string' || !/^[a-f0-9]{40}$/.test(prior.revision)
    || !Array.isArray(data.previous) || !Array.isArray(data.migrations)
    || data.previous.length < 3 || data.previous.length >= data.migrations.length
    || canonical(data.migrations) !== canonical(artifact.manifest.migrations)
    || canonical(data.previous) !== canonical(data.migrations.slice(0, data.previous.length))
    || manifestDigest(data.previous.slice(0, 3)) !== activationSchema.targetDigest
    || !hex.test(digest) || sha256(canonical(value)) !== digest) refuse();
  const packet = JSON.parse(canonical(value)) as RoutineMigrationPacket;
  verifyRoutineArtifact(artifact, run, { digest: manifestDigest(packet.migrations) });
  return packet;
}
export function verifyRoutineArtifact(artifact: VerifiedArtifact, run: RunIdentity, schema: RoutineSchema): void {
  const actual = verifyArtifact(artifact.root, artifact.digest, { revision: run.revision,
    migrationDigest: approvedSchema(schema.digest), repository: 'https://github.com/khuonghuyhieu/esty-admin', release: true });
  if (actual.manifest.source.tree !== run.tree) refuse();
  if (schema.migration) routinePacket(schema.migration.packet, schema.migration.digest, artifact, run);
}
interface Authorization { version: 1; packetDigest: string; artifact: string; run: RunIdentity; journal: number; predecessor: string;
  requestDigest: string; configDigest: string; authorizedAt: number }
function authorization(directory: string, artifact: VerifiedArtifact, run: RunIdentity, schema: RoutineDeliveryApproval): Authorization {
  verifyRoutineArtifact(artifact, run, schema);
  if (!schema.migration) refuse();
  const data = object(readEvidence(join(directory, 'migration-authorized.json')).value,
    ['version', 'packetDigest', 'artifact', 'run', 'journal', 'predecessor', 'requestDigest', 'configDigest', 'authorizedAt']);
  if (data.version !== 1 || data.packetDigest !== schema.migration.digest || data.artifact !== artifact.digest
    || canonical(data.run) !== canonical(run) || !Number.isSafeInteger(data.journal) || Number(data.journal) <= 0
    || data.predecessor !== schema.migration.packet.predecessor.id || data.requestDigest !== approvedSchema(schema.requestDigest)
    || data.configDigest !== approvedSchema(schema.configDigest) || !Number.isSafeInteger(data.authorizedAt) || Number(data.authorizedAt) > Date.now()) refuse();
  return data as unknown as Authorization;
}
export async function authorizeRoutineMigration(input: {
  artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineDeliveryApproval; provider: RoutineProvider; directory: string;
  diagnostics?: ReleaseDiagnostics;
}): Promise<void> {
  const { artifact, run, schema, provider, directory, diagnostics } = input;
  diagnostics?.at('configuration');
  verifyRoutineArtifact(artifact, run, schema);
  if (!schema.migration) refuse();
  approvedSchema(schema.requestDigest); approvedSchema(schema.configDigest);
  privateDirectory(directory);
  // Exclusivity survives partial authorization and prevents reusing this local execution directory.
  writeObserved(diagnostics, join(directory, 'migration-reserving.json'), { run, artifact: artifact.digest, packetDigest: schema.migration.digest });
  await provider.currentMain();
  const predecessor = await provider.preflight();
  diagnostics?.trace?.check('migration.predecessor-binding', predecessor === schema.migration.packet.predecessor.id, 'approved-compatible-predecessor-differs');
  if (predecessor !== schema.migration.packet.predecessor.id) refuse();
  await provider.compatiblePredecessor();
  const journal = await provider.reserve();
  diagnostics?.at('reserve', 'evidence-persistence');
  const description = `migration_intent:${schema.migration.digest}`;
  const confirmIntent = async () => {
    await provider.record(journal, 'in_progress', description);
    await provider.confirmRoutineJournal(journal, description);
  };
  if (diagnostics) await diagnostics.guard('evidence-persistence', confirmIntent); else await confirmIntent();
  await provider.currentMain(); await provider.binding(schema.migration.packet.predecessor.id);
  const value: Authorization = { version: 1, packetDigest: schema.migration.digest, artifact: artifact.digest,
    run, journal, predecessor: schema.migration.packet.predecessor.id,
    requestDigest: schema.requestDigest, configDigest: schema.configDigest, authorizedAt: Date.now() };
  writeObserved(diagnostics, join(directory, 'migration-authorized.json'), value);
}
export function confirmedMigration(report: MigrationReport, packet: RoutineMigrationPacket): boolean {
  const pending = packet.migrations.slice(packet.previous.length);
  return report.result === 'success' && report.database_outcome === 'committed' && report.reporting === 'written'
    && report.source_revision === packet.revision && report.target === packet.target
    && report.manifest_digest === manifestDigest(packet.migrations)
    && canonical(report.before) === canonical(packet.previous.map(item => item.name))
    && canonical(report.after) === canonical(packet.migrations.map(item => item.name))
    && canonical(report.attempted) === canonical(pending.map(item => ({ ...item, outcome: 'applied_committed' })));
}
export async function executeRoutineMigration(input: {
  artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineDeliveryApproval; directory: string; values: unknown; signal: AbortSignal;
  diagnostics?: ReleaseDiagnostics;
}): Promise<void> {
  const { artifact, run, schema, directory, signal, diagnostics } = input;
  diagnostics?.at('pre-sql', 'evidence-persistence');
  const auth = diagnostics?.trace ? diagnostics.trace.sync('migration.authorization', () => authorization(directory, artifact, run, schema))
    : authorization(directory, artifact, run, schema), packet = schema.migration!.packet;
  const age = Date.now() - auth.authorizedAt;
  diagnostics?.trace?.check('migration.authorization-fresh', age <= 60000, 'authorization-expired', { ageMs: age, maximumMs: 60000 });
  if (age > 60000) refuse();
  const consume = () => migrationInputs(input.values, { target: packet.target, migrationInputDigest: packet.migrationInputDigest });
  const values = diagnostics?.trace ? diagnostics.trace.sync('migration.private-input-binding', consume) : consume();
  diagnostics?.trace?.registerSecrets([values.MIGRATION_DATABASE_URL ?? '', values.DATABASE_CA_PEM ?? '']);
  const database = diagnostics?.trace ? diagnostics.trace.sync('migration.configuration', () => parseMigrationConfig(values)) : parseMigrationConfig(values);
  const migrations = join(artifact.root, 'operator/apps/api/migrations');
  signal.throwIfAborted();
  // Never remove this marker, including on preflight failure or loss of the commit acknowledgement.
  writeObserved(diagnostics, join(directory, 'migration-started.json'), { authorization: sha256(canonical(auth)), outcome: 'unknown' });
  diagnostics?.at('history', 'history-mismatch');
  const before = diagnostics?.trace
    ? await diagnostics.trace.boundary('sql.history-before', () => migrationStatus(database, migrations)) : await migrationStatus(database, migrations);
  const beforeMatches = before.initialized && before.ordered && !before.unexpected.length
    && canonical(before.applied) === canonical(packet.previous.map(item => item.name))
    && canonical(before.pending) === canonical(packet.migrations.slice(packet.previous.length).map(item => item.name));
  diagnostics?.trace?.check('sql.expected-history-before', beforeMatches, 'approved-history-or-pending-suffix-differs',
    { appliedCount: before.applied.length, pendingCount: before.pending.length, unexpectedCount: before.unexpected.length });
  if (!beforeMatches) refuse();
  signal.throwIfAborted(); verifyRoutineArtifact(artifact, run, schema);
  diagnostics?.at('sql', 'outcome-unknown'); diagnostics?.submitted('migration');
  const invoke = () => runMigrations(database, { directory: migrations, sourceRevision: run.revision, target: packet.target, signal,
    expectedBefore: packet.previous.map(item => item.name) });
  const report = diagnostics?.trace ? await diagnostics.trace.boundary('sql.runner', invoke) : await invoke();
  diagnostics?.trace?.event('sql.runner', report.result === 'success' ? 'passed' : 'failed',
    `database-${report.database_outcome}`, { attempted: report.attempted.length, before: report.before?.length ?? null, after: report.after?.length ?? null });
  const reports = join(directory, 'migration-reports'); privateDirectory(reports);
  let saved = false;
  try { saved = saveMigrationReport(report, reports); } finally { diagnostics?.migrated(report); }
  if (!saved) { diagnostics?.reject('evidence-persistence'); refuse(); }
  writeObserved(diagnostics, join(directory, 'migration-outcome.json'), { authorization: sha256(canonical(auth)), report });
  const confirmed = confirmedMigration(report, packet);
  diagnostics?.trace?.check('sql.confirmed-report', confirmed, 'commit-or-report-binding-unconfirmed');
  if (!confirmed) refuse();
  diagnostics?.at('history', 'history-mismatch');
  const after = diagnostics?.trace
    ? await diagnostics.trace.boundary('sql.history-after', () => migrationStatus(database, migrations)) : await migrationStatus(database, migrations);
  const afterMatches = after.initialized && after.ordered && !after.unexpected.length && !after.pending.length
    && canonical(after.applied) === canonical(packet.migrations.map(item => item.name));
  diagnostics?.trace?.check('sql.expected-history-after', afterMatches, 'committed-history-differs',
    { appliedCount: after.applied.length, pendingCount: after.pending.length, unexpectedCount: after.unexpected.length });
  if (!afterMatches) refuse();
  signal.throwIfAborted(); verifyRoutineArtifact(artifact, run, schema);
  writeObserved(diagnostics, join(directory, 'migration-confirmed.json'), { authorization: sha256(canonical(auth)), reportDigest: sha256(canonical(report)) });
}
export async function continueRoutineMigration(input: {
  artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineDeliveryApproval; provider: RoutineProvider; directory: string;
  diagnostics?: ReleaseDiagnostics;
}): Promise<{ journal: number; predecessor: string }> {
  const { artifact, run, schema, provider, directory, diagnostics } = input;
  diagnostics?.at('sql', 'evidence-persistence');
  const auth = authorization(directory, artifact, run, schema);
  const outcome = object(readEvidence(join(directory, 'migration-outcome.json')).value, ['authorization', 'report']);
  const confirmed = object(readEvidence(join(directory, 'migration-confirmed.json')).value, ['authorization', 'reportDigest']);
  const hash = sha256(canonical(auth));
  const binding = outcome.authorization === hash && confirmed.authorization === hash
    && confirmed.reportDigest === sha256(canonical(outcome.report))
    && confirmedMigration(outcome.report as MigrationReport, schema.migration!.packet);
  diagnostics?.trace?.check('migration.committed-continuation', binding, 'authorization-report-or-confirmation-mismatch');
  if (!binding) refuse();
  writeObserved(diagnostics, join(directory, 'migration-delivering.json'), { authorization: hash });
  await provider.confirmRoutineJournal(auth.journal, `migration_intent:${schema.migration!.digest}`);
  await provider.currentMain(); await provider.binding(auth.predecessor); await provider.compatiblePredecessor();
  const description = `migration_committed:${confirmed.reportDigest}`;
  const confirmCommit = async () => {
    await provider.record(auth.journal, 'in_progress', description);
    await provider.confirmRoutineJournal(auth.journal, description);
  };
  if (diagnostics) await diagnostics.guard('evidence-persistence', confirmCommit); else await confirmCommit();
  return { journal: auth.journal, predecessor: auth.predecessor };
}

interface StrictReservation { version: 1; requestDigest: string; packetDigest: string; journal: number }
interface StrictAuthorization extends StrictReservation {
  phase: EtsyReleasePhase; intent: EtsyReleaseIntent; description: string; confirmedAt: number;
}
function strictBinding(artifact: VerifiedArtifact, request: ReleaseRequest, value: unknown): EtsyReleasePacket {
  if (request.mode !== 'etsy-strict-cutover' || !request.migration) refuse();
  const digest = request.migration.packetDigest, packet = validateEtsyReleasePacket(value, digest);
  if (packet.target === 'local' || packet.target !== request.target || packet.revision !== request.controller.revision
    || packet.tree !== request.controller.tree || packet.artifactDigest !== artifact.digest || packet.artifactDigest !== request.artifactDigest
    || packet.sourceDigest !== request.sourceDigest || packet.runtimeDigest !== request.configDigest
    || packet.previousDigest !== request.schema.beforeDigest || packet.targetDigest !== request.schema.targetDigest
    || packet.nodeDigest !== artifact.manifest.build.nodeSha256
    || packet.driverDigest !== artifact.manifest.files.find(file => file.path === 'operator/apps/api/build/scripts/etsy-release.js')?.sha256
    || packet.cliOwnFilesDigest !== artifact.manifest.build.tools.find(tool => tool.name === 'vercel')?.filesDigest
    || canonical(request.migration.predecessor) !== canonical({ id: packet.predecessor.id, revision: packet.predecessor.revision,
      artifactDigest: packet.predecessor.artifactDigest, configDigest: packet.predecessor.configDigest })
    || request.migration.recoveryApproval !== sha256(canonical({ packet: digest, recovery: packet.grants.recovery }))
    || request.migration.maintenanceApproval !== sha256(canonical({ packet: digest, window: packet.window, maintenance: packet.grants.maintenance }))) refuse();
  verifyRoutineArtifact(artifact, request.controller, { digest: request.schema.targetDigest });
  return packet;
}

// The remote reservation, not this disposable directory, is the production exclusion.
// Lost local receipts cannot be regenerated into permission to repeat a mutation.
export async function runStrictRoutinePhase(input: { artifact: VerifiedArtifact; request: ReleaseRequest; env: NodeJS.ProcessEnv;
  action: string; cli: string; directory: string; signal: AbortSignal; diagnostics?: ReleaseDiagnostics }): Promise<void> {
  const { artifact, request, env, action, signal, diagnostics } = input;
  const bind = () => strictBinding(artifact, request, decodePhaseInput(env.BE_MIGRATION_PACKET_JSON));
  const packet = diagnostics?.trace ? diagnostics.trace.sync('strict.packet-binding', bind) : bind();
  const packetDigest = request.migration!.packetDigest, requestDigest = sha256(canonical(request));
  diagnostics?.trace?.check('strict.packet-input-digest', env.BE_MIGRATION_PACKET_SHA256 === packetDigest, 'packet-digest-differs-from-approved-request');
  if (env.BE_MIGRATION_PACKET_SHA256 !== packetDigest) refuse();
  const root = privateDirectory(join(input.directory, 'strict')), directory = join(root, packet.runId);
  const reservationPath = join(root, 'reservation.json');
  const schema: RoutineDeliveryApproval = { digest: request.schema.targetDigest, configDigest: request.configDigest,
    requestDigest, strictPacketDigest: packetDigest };
  const verify = () => { signal.throwIfAborted(); strictBinding(artifact, request, packet); };
  const unavailable = async (): Promise<never> => refuse();
  function reservation(): StrictReservation {
    const value = object(readEvidence(reservationPath).value, ['version', 'requestDigest', 'packetDigest', 'journal']);
    if (value.version !== 1 || value.requestDigest !== requestDigest || value.packetDigest !== packetDigest
      || !Number.isSafeInteger(value.journal) || Number(value.journal) <= 0) refuse();
    return value as unknown as StrictReservation;
  }
  const intentDescription = (value: EtsyReleaseIntent) => `strict:${value.phase}:intent:${sha256(canonical({ requestDigest, intent: value }))}`;
  function authorization(phase: EtsyReleasePhase, intent: EtsyReleaseIntent, fresh: boolean): StrictAuthorization {
    const value = object(readEvidence(join(root, `${phase}.authorized.json`)).value,
      ['version', 'requestDigest', 'packetDigest', 'journal', 'phase', 'intent', 'description', 'confirmedAt']);
    if (canonical({ version: value.version, requestDigest: value.requestDigest, packetDigest: value.packetDigest, journal: value.journal }) !== canonical(reservation())
      || value.phase !== phase || canonical(value.intent) !== canonical(intent) || value.description !== intentDescription(intent)
      || !Number.isSafeInteger(value.confirmedAt) || Number(value.confirmedAt) > Date.now()
      || Number(value.confirmedAt) < packet.window.start || (fresh && Date.now() - Number(value.confirmedAt) > 60000)) refuse();
    return value as unknown as StrictAuthorization;
  }
  if (action === 'history' || action === 'migrate') {
    const phase = action === 'history' ? 'history' : 'sql-apply';
    const consume = () => migrationInputs(decodePhaseInput(env.BE_MIGRATION_INPUTS), packet);
    const values = diagnostics?.trace ? diagnostics.trace.sync('strict.migration-input-binding', consume) : consume();
    diagnostics?.trace?.registerSecrets([values.MIGRATION_DATABASE_URL ?? '', values.DATABASE_CA_PEM ?? '']);
    const database = diagnostics?.trace ? diagnostics.trace.sync('strict.migration-configuration', () => parseMigrationConfig(values)) : parseMigrationConfig(values);
    const migrations = join(artifact.root, 'operator/apps/api/migrations');
    let authorized = false;
    const operations: EtsyReleaseOperations = {
      verify,
      async currentMain() {
        if (!authorized) refuse();
        // Fresh prior authenticated main/remote intent proof; this worker has no GitHub authority.
        return { revision: request.controller.revision, tree: request.controller.tree };
      },
      async history() {
        if (!authorized) refuse();
        const status = diagnostics?.trace ? await diagnostics.trace.boundary('sql.strict-history', () => migrationStatus(database, migrations))
          : await migrationStatus(database, migrations);
        const valid = status.initialized && status.ordered && !status.unexpected.length;
        diagnostics?.trace?.check('sql.strict-history-valid', valid, 'uninitialized-unordered-or-unexpected-history',
          { appliedCount: status.applied.length, pendingCount: status.pending.length, unexpectedCount: status.unexpected.length });
        if (!valid) refuse();
        return status.applied;
      },
      async migrate() {
        if (!authorized || phase !== 'sql-apply') refuse();
        const report = await runMigrations(database, { directory: migrations, sourceRevision: packet.revision, target: packet.target, signal,
          expectedBefore: request.schema.before.map(entry => entry.name) });
        try { saveMigrationReport(report, privateDirectory(join(directory, 'migration-reports'))); }
        catch (cause) { diagnostics?.migrated(report); throw cause; }
        return report;
      },
      predecessor: unavailable, candidate: unavailable, create: unavailable, promote: unavailable, alias: unavailable,
    };
    await runEtsyReleasePhase({ packet, packetDigest, phase, operations, signal, diagnostics, durability: {
      directory: root,
      async intent(current, value) {
        if (diagnostics?.trace) diagnostics.trace.sync('strict.fresh-sql-authorization', () => authorization(current, value, true));
        else authorization(current, value, true);
        authorized = true;
      },
      acknowledged: unavailable,
      async confirmed(current) {
        if (current === 'sql-apply' && (readEvidence(join(directory, 'migration-report.json')).value as MigrationReport).reporting !== 'written') refuse();
      },
    } });
    return;
  }
  const provider = createProvider(artifact, request.controller, schema, { github: env.GITHUB_TOKEN ?? '', vercel: env.VERCEL_TOKEN ?? '',
    bearer: env.BE_PREVIEW_ACCESS_KEY ?? '', bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '' }, signal, fetch, diagnostics);
  if (action === 'reconcile') {
    const journal = Number(env.BE_ROUTINE_JOURNAL);
    if (!/^[1-9][0-9]{0,14}$/.test(env.BE_ROUTINE_JOURNAL ?? '') || !Number.isSafeInteger(journal)) refuse();
    const observed = await provider.reconcileRoutineJournal(journal);
    console.info(JSON.stringify({ status: 'read-only-reconciliation', ...observed, nextAction: 'inspect-retained-evidence' }));
    return;
  }
  const remote = etsyProviderOperations(packet, packetDigest, artifact, { token: env.VERCEL_TOKEN ?? '', bearer: env.BE_PREVIEW_ACCESS_KEY ?? '',
    predecessorBearer: env.BE_PREVIEW_ACCESS_KEY ?? '', bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '' }, signal, fetch, diagnostics);
  let journal: number | undefined;
  let cli: EtsyCli | undefined;
  async function record(description: string, state: 'in_progress' | 'success' = 'in_progress') {
    const work = async () => {
      verify(); await provider.record(journal!, state, description);
      await provider.confirmRoutineJournal(journal!, description, state); verify();
    };
    if (diagnostics) await diagnostics.guard('evidence-persistence', work); else await work();
  }
  async function authorize(phase: 'history' | 'sql-apply', intent: EtsyReleaseIntent) {
    await provider.currentMain(); verify();
    const description = intentDescription(intent);
    await record(description);
    writeObserved(diagnostics, join(root, `${phase}.authorized.json`), { ...reservation(), phase, intent, description, confirmedAt: Date.now() });
  }
  function receipt(phase: EtsyReleasePhase) {
    const entry = readEvidence(join(directory, `${phase}.receipt.json`));
    const value = object(entry.value, ['packetDigest', 'phase', 'previous', 'deploymentId', 'completed', 'reportDigest']);
    if (value.packetDigest !== packetDigest || value.phase !== phase || !Number.isSafeInteger(value.completed)
      || Number(value.completed) < packet.window.start || Number(value.completed) > Date.now()) refuse();
    return { entry, value, description: `strict:${phase}:receipt:${sha256(canonical({ requestDigest, receipt: entry.identity.sha256 }))}` };
  }
  async function confirmPrevious(phase: EtsyReleasePhase) {
    const previous = etsyReleasePhases[etsyReleasePhases.indexOf(phase) - 1];
    if (!previous) refuse();
    const proof = receipt(previous), path = join(root, `${previous}.remote.json`);
    if (previous === 'history' || previous === 'sql-apply') {
      const intent = readEvidence(join(directory, `${previous}.intent.json`)).value as EtsyReleaseIntent;
      const auth = authorization(previous, intent, false);
      await provider.confirmRoutineJournal(journal!, auth.description);
      if (previous === 'sql-apply') {
        const report = readEvidence(join(directory, 'migration-report.json'));
        if ((report.value as MigrationReport).reporting !== 'written' || proof.value.reportDigest !== report.identity.sha256) refuse();
      }
      await record(proof.description);
      writeObserved(diagnostics, path, { requestDigest, journal, receiptDigest: proof.entry.identity.sha256, description: proof.description });
    } else {
      if (canonical(readEvidence(path).value) !== canonical({ requestDigest, journal,
        receiptDigest: proof.entry.identity.sha256, description: proof.description })) refuse();
      await provider.confirmRoutineJournal(journal!, proof.description);
    }
  }
  let expectedRemote = '';
  const durability: EtsyReleaseDurability = {
    directory: root,
    async intent(phase, value) {
      await confirmPrevious(phase);
      expectedRemote = intentDescription(value);
      await record(expectedRemote);
    },
    async acknowledged(id) {
      await provider.confirmRoutineJournal(journal!, expectedRemote);
      expectedRemote = `ack:${id}`;
      await record(expectedRemote);
    },
    async confirmed(phase) {
      await provider.confirmRoutineJournal(journal!, expectedRemote);
      const proof = receipt(phase); await record(proof.description);
      writeObserved(diagnostics, join(root, `${phase}.remote.json`),
        { requestDigest, journal, receiptDigest: proof.entry.identity.sha256, description: proof.description });
    },
  };
  try {
    if (action === 'authorize') {
      diagnostics?.at('reserve', 'evidence-persistence');
      writeObserved(diagnostics, join(root, 'reserving.json'), { requestDigest, packetDigest });
      await provider.currentMain();
      if (await provider.preflight() !== packet.predecessor.id) refuse();
      journal = await provider.reserve();
      writeObserved(diagnostics, reservationPath, { version: 1, requestDigest, packetDigest, journal });
      await record(`strict:reserved:${requestDigest}`);
      await remote.predecessor(false);
      await authorize('history', { packetDigest, phase: 'history', previous: null, deploymentId: null });
      return;
    }
    journal = reservation().journal;
    if (action !== 'held' && action !== 'deliver') refuse();
    cli = await isolatedEtsyCli(packet, packetDigest, artifact, input.cli, env.VERCEL_TOKEN ?? '', signal, diagnostics);
    const operations: EtsyReleaseOperations = { ...remote, verify, history: unavailable, migrate: unavailable,
      async currentMain() { await provider.currentMain(); return { revision: packet.revision, tree: packet.tree }; },
      create: () => cli!.create(), promote: id => cli!.promote(id) };
    const phases: EtsyReleasePhase[] = action === 'held' ? ['held-create', 'pre-sql-check'] : ['post-sql-check', 'promote-only', 'final-domain-ack'];
    for (const phase of phases) await runEtsyReleasePhase({ packet, packetDigest, phase, operations, signal, diagnostics, durability });
    if (action === 'held') {
      const prior = receipt('pre-sql-check');
      await provider.confirmRoutineJournal(journal, prior.description);
      await authorize('sql-apply', { packetDigest, phase: 'sql-apply', previous: prior.entry.identity.sha256,
        deploymentId: String(prior.value.deploymentId) });
    } else {
      const final = receipt('final-domain-ack');
      await provider.confirmRoutineJournal(journal, final.description);
      await record(`strict:accepted:${final.entry.identity.sha256}`, 'success');
      diagnostics?.verified();
    }
  } catch (cause) {
    const failure = diagnostics?.capture(cause);
    if (journal !== undefined) await provider.record(journal, 'error', 'strict:unresolved').catch(() => diagnostics?.evidenceFailed());
    if (failure) throw failure;
    refuse();
  } finally {
    try { await cli?.dispose(); } catch (cause) { diagnostics?.evidenceFailed(); throw diagnostics?.capture(cause) ?? cause; }
  }
}
