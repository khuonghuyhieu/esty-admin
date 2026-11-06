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
import type { RoutineProvider, RunIdentity } from './ci-provider.js';

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
interface Authorization { version: 1; packetDigest: string; artifact: string; run: RunIdentity; journal: number; predecessor: string }
function authorization(directory: string, artifact: VerifiedArtifact, run: RunIdentity, schema: RoutineSchema): Authorization {
  verifyRoutineArtifact(artifact, run, schema);
  if (!schema.migration) refuse();
  const data = object(readEvidence(join(directory, 'migration-authorized.json')).value,
    ['version', 'packetDigest', 'artifact', 'run', 'journal', 'predecessor']);
  if (data.version !== 1 || data.packetDigest !== schema.migration.digest || data.artifact !== artifact.digest
    || canonical(data.run) !== canonical(run) || !Number.isSafeInteger(data.journal) || Number(data.journal) <= 0
    || data.predecessor !== schema.migration.packet.predecessor.id) refuse();
  return data as unknown as Authorization;
}
export async function authorizeRoutineMigration(input: {
  artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineSchema; provider: RoutineProvider; directory: string;
}): Promise<void> {
  const { artifact, run, schema, provider, directory } = input;
  verifyRoutineArtifact(artifact, run, schema);
  if (!schema.migration) refuse();
  privateDirectory(directory);
  // Exclusivity survives partial authorization and prevents reusing this local execution directory.
  writeReleaseEvidence(join(directory, 'migration-reserving.json'), { run, artifact: artifact.digest, packetDigest: schema.migration.digest });
  await provider.currentMain();
  if (await provider.preflight() !== schema.migration.packet.predecessor.id) refuse();
  await provider.compatiblePredecessor();
  const journal = await provider.reserve();
  const description = `migration_intent:${schema.migration.digest}`;
  await provider.record(journal, 'in_progress', description);
  await provider.confirmRoutineJournal(journal, description);
  await provider.currentMain(); await provider.binding(schema.migration.packet.predecessor.id);
  const value: Authorization = { version: 1, packetDigest: schema.migration.digest, artifact: artifact.digest,
    run, journal, predecessor: schema.migration.packet.predecessor.id };
  writeReleaseEvidence(join(directory, 'migration-authorized.json'), value);
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
  artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineSchema; directory: string; values: unknown; signal: AbortSignal;
}): Promise<void> {
  const { artifact, run, schema, directory, signal } = input;
  const auth = authorization(directory, artifact, run, schema), packet = schema.migration!.packet;
  const values = migrationInputs(input.values, { target: packet.target, migrationInputDigest: packet.migrationInputDigest });
  const database = parseMigrationConfig(values), migrations = join(artifact.root, 'operator/apps/api/migrations');
  signal.throwIfAborted();
  // Never remove this marker, including on preflight failure or loss of the commit acknowledgement.
  writeReleaseEvidence(join(directory, 'migration-started.json'), { authorization: sha256(canonical(auth)), outcome: 'unknown' });
  const before = await migrationStatus(database, migrations);
  if (!before.initialized || !before.ordered || before.unexpected.length
    || canonical(before.applied) !== canonical(packet.previous.map(item => item.name))
    || canonical(before.pending) !== canonical(packet.migrations.slice(packet.previous.length).map(item => item.name))) refuse();
  signal.throwIfAborted(); verifyRoutineArtifact(artifact, run, schema);
  const report = await runMigrations(database, { directory: migrations, sourceRevision: run.revision, target: packet.target, signal,
    expectedBefore: packet.previous.map(item => item.name) });
  const reports = join(directory, 'migration-reports'); privateDirectory(reports);
  if (!saveMigrationReport(report, reports)) refuse();
  writeReleaseEvidence(join(directory, 'migration-outcome.json'), { authorization: sha256(canonical(auth)), report });
  if (!confirmedMigration(report, packet)) refuse();
  const after = await migrationStatus(database, migrations);
  if (!after.initialized || !after.ordered || after.unexpected.length || after.pending.length
    || canonical(after.applied) !== canonical(packet.migrations.map(item => item.name))) refuse();
  signal.throwIfAborted(); verifyRoutineArtifact(artifact, run, schema);
  writeReleaseEvidence(join(directory, 'migration-confirmed.json'), { authorization: sha256(canonical(auth)), reportDigest: sha256(canonical(report)) });
}
export async function continueRoutineMigration(input: {
  artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineSchema; provider: RoutineProvider; directory: string;
}): Promise<{ journal: number; predecessor: string }> {
  const { artifact, run, schema, provider, directory } = input;
  const auth = authorization(directory, artifact, run, schema);
  const outcome = object(readEvidence(join(directory, 'migration-outcome.json')).value, ['authorization', 'report']);
  const confirmed = object(readEvidence(join(directory, 'migration-confirmed.json')).value, ['authorization', 'reportDigest']);
  const hash = sha256(canonical(auth));
  if (outcome.authorization !== hash || confirmed.authorization !== hash
    || confirmed.reportDigest !== sha256(canonical(outcome.report))
    || !confirmedMigration(outcome.report as MigrationReport, schema.migration!.packet)) refuse();
  writeReleaseEvidence(join(directory, 'migration-delivering.json'), { authorization: hash });
  await provider.confirmRoutineJournal(auth.journal, `migration_intent:${schema.migration!.digest}`);
  await provider.currentMain(); await provider.binding(auth.predecessor); await provider.compatiblePredecessor();
  const description = `migration_committed:${confirmed.reportDigest}`;
  await provider.record(auth.journal, 'in_progress', description);
  await provider.confirmRoutineJournal(auth.journal, description);
  return { journal: auth.journal, predecessor: auth.predecessor };
}
