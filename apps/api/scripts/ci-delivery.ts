import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { closeSync, fsyncSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { artifactTarget, canonical, inventory, removeArtifactTree, sha256, snapshotArtifact, verifyArtifact } from './artifact.js';
import type { ArtifactSnapshot, VerifiedArtifact } from './artifact.js';
import { createProvider, deploymentId, repository } from './ci-provider.js';
import type { ActivationDeliveryContext, ActivationProvider, Candidate, DeliveryProvider, RoutineDeliveryApproval, RunIdentity } from './ci-provider.js';
import { command, isolatedEnvironment } from './ci-tools.js';
import type { CommandResult } from './ci-tools.js';
import { validateActivationPacket, verifyActivationArtifact } from './activation-journal.js';
import { approvedSchema, authorizeRoutineMigration, continueRoutineMigration, executeRoutineMigration,
  routinePacket, runStrictRoutinePhase, verifyRoutineArtifact } from './ci-migrations.js';
import { decodePhaseInput } from './activation-inputs.js';
import { manifestDigest } from './migrations.js';
import type { Manifest, MigrationReport } from './migrations.js';
import { activationSchema } from '../src/config/schema-transition.js';
import { confirmRoutineSelection, loadRoutineContext, readRoutineRequest, readRoutineSelection, routineApproval,
  validateRoutineSelection, verifyRoutineBundle, verifyRoutineTransfer } from './routine-retained.mjs';
import { githubReader } from './activation-retained.mjs';
import { heldEtsyIncident, validateEtsyContinuationApproval, validateEtsyReleasePacket } from './etsy-release.js';
import type { EtsyContinuationApproval } from './etsy-release.js';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { privateDirectory } from './private-files.mjs';
import { emitRoutineResult, routineFailureResult } from './routine-retained.mjs';
import { ChecksDiagnostics } from './checks-diagnostics.js';
import { withRoutineDiagnostics } from './routine-retained.mjs';
import { historicalHandoffDigest } from './historical-release.js';

export interface ReleaseRequest {
  version: 1;
  mode: 'current-schema-only' | 'versioned-migration' | 'etsy-strict-cutover';
  repository: string;
  target: string;
  controller: RunIdentity;
  producer: RunIdentity;
  artifactId: string;
  artifactDigest: string;
  sourceDigest: string;
  archiveDigest: string;
  operatorDigest: string;
  configDigest: string;
  historicalHandoffDigest: string;
  continuation?: EtsyContinuationApproval;
  schema: { beforeDigest: string; targetDigest: string; before: Manifest; target: Manifest };
  migration: null | {
    packetDigest: string;
    predecessor: { id: string; revision: string; artifactDigest: string; configDigest: string };
    recoveryApproval: string;
    compatibilityApproval: string | null;
    maintenanceApproval: string | null;
  };
}
type ReleaseStage = 'request' | 'artifact' | 'configuration' | 'reserve' | 'history' | 'create' | 'pre-sql'
  | 'sql' | 'candidate' | 'promote' | 'domain' | 'receipt';
type ReleaseCategory = 'invalid-input' | 'unauthorized-context' | 'missing-prerequisite' | 'identity-mismatch'
  | 'configuration-mismatch' | 'history-mismatch' | 'unresolved-prior' | 'transport' | 'timeout' | 'validation'
  | 'outcome-unknown' | 'evidence-persistence';
type ReleaseNextAction = 'inspect-prerequisite' | 'select-approved-artifact' | 'approve-release-window'
  | 'inspect-known-deployment' | 'reconcile-migration' | 'reconcile-promotion' | 'inspect-retained-evidence'
  | 'run-acceptance' | 'none';
type ReleaseEffect = 'not-started' | 'ACKed' | 'unknown';
type ReleaseOperation = 'create' | 'migration' | 'promotion';
type ReleaseMigration = Pick<MigrationReport, 'result' | 'database_outcome' | 'before' | 'after' | 'attempted' | 'reporting'>;
interface ReleaseProof {
  deploymentId: string; artifactDigest: string; configDigest: string; schemaDigest: string;
  domain: 'api.lovora.us'; checks: 'passed';
}
export interface ReleaseResult {
  version: 1; request: ReleaseRequest | null;
  status: 'accepted' | 'refused' | 'failed' | 'unknown';
  stage: ReleaseStage; category: ReleaseCategory | null; nextAction: ReleaseNextAction;
  effects: Record<ReleaseOperation, ReleaseEffect>;
  deploymentId: string | null; migration: ReleaseMigration | null;
  receiptDigest: string | null; proof: ReleaseProof | null;
  evidence: 'confirmed' | 'unconfirmed';
}
const releaseStages = ['request', 'artifact', 'configuration', 'reserve', 'history', 'create', 'pre-sql', 'sql',
  'candidate', 'promote', 'domain', 'receipt'];
const releaseCategories = ['invalid-input', 'unauthorized-context', 'missing-prerequisite', 'identity-mismatch',
  'configuration-mismatch', 'history-mismatch', 'unresolved-prior', 'transport', 'timeout', 'validation',
  'outcome-unknown', 'evidence-persistence'];
const releaseActions = ['inspect-prerequisite', 'select-approved-artifact', 'approve-release-window',
  'inspect-known-deployment', 'reconcile-migration', 'reconcile-promotion', 'inspect-retained-evidence', 'run-acceptance', 'none'];
const releaseHex = /^[a-f0-9]{64}$/;
function releaseRefusal(): never { throw new Error('Release contract refused; inspect approved nonsecret evidence.'); }
function releaseObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))) releaseRefusal();
  return value as Record<string, unknown>;
}
function releaseString(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}
function releaseChoice(value: unknown, choices: readonly string[]): value is string {
  return typeof value === 'string' && choices.includes(value);
}
function releaseManifest(value: unknown): asserts value is Manifest {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) releaseRefusal();
  for (const entry of value) {
    const item = releaseObject(entry, ['name', 'sha256']);
    if (!releaseString(item.name, /^\d{13}-[a-z0-9-]{1,96}$/) || !releaseString(item.sha256, releaseHex)) releaseRefusal();
  }
  if (new Set(value.map(item => item.name)).size !== value.length) releaseRefusal();
}
function releaseRun(value: unknown): void {
  const data = releaseObject(value, ['revision', 'tree', 'run']);
  if (!releaseString(data.revision, /^[a-f0-9]{40}$/) || !releaseString(data.tree, /^[a-f0-9]{40}$/)
    || !releaseString(data.run, /^[1-9][0-9]{0,19}$/)) releaseRefusal();
}
function releaseRequestShape(value: unknown): asserts value is ReleaseRequest {
  const continuation = value !== null && typeof value === 'object' && Object.hasOwn(value, 'continuation');
  const data = releaseObject(value, ['version', 'mode', 'repository', 'target', 'controller', 'producer', 'artifactId',
    'artifactDigest', 'sourceDigest', 'archiveDigest', 'operatorDigest', 'configDigest', 'historicalHandoffDigest', 'schema', 'migration',
    ...(continuation ? ['continuation'] : [])]);
  if (data.version !== 1 || data.repository !== repository || !releaseString(data.target, /^supabase:[a-z]{20}$/)
    || typeof data.mode !== 'string' || !['current-schema-only', 'versioned-migration', 'etsy-strict-cutover'].includes(data.mode)
    || !releaseString(data.artifactId, /^[1-9][0-9]{0,19}$/) || data.historicalHandoffDigest !== historicalHandoffDigest
    || ![data.artifactDigest, data.sourceDigest, data.archiveDigest, data.operatorDigest, data.configDigest]
      .every(item => releaseString(item, releaseHex))) releaseRefusal();
  releaseRun(data.controller); releaseRun(data.producer);
  const schema = releaseObject(data.schema, ['beforeDigest', 'targetDigest', 'before', 'target']);
  releaseManifest(schema.before); releaseManifest(schema.target);
  if (schema.beforeDigest !== manifestDigest(schema.before) || schema.targetDigest !== manifestDigest(schema.target)
    || canonical(schema.before) !== canonical(schema.target.slice(0, schema.before.length))) releaseRefusal();
  if (data.mode === 'current-schema-only') {
    if (data.migration !== null || canonical(schema.before) !== canonical(schema.target)) releaseRefusal();
  } else {
    const migration = releaseObject(data.migration, ['packetDigest', 'predecessor', 'recoveryApproval', 'compatibilityApproval', 'maintenanceApproval']);
    const prior = releaseObject(migration.predecessor, ['id', 'revision', 'artifactDigest', 'configDigest']);
    if (schema.before.length < 3 || manifestDigest(schema.before.slice(0, 3)) !== activationSchema.targetDigest
      || schema.target.length <= schema.before.length || !releaseString(prior.id, deploymentId)
      || !releaseString(prior.revision, /^[a-f0-9]{40}$/)
      || ![migration.packetDigest, migration.recoveryApproval, prior.artifactDigest, prior.configDigest]
        .every(item => releaseString(item, releaseHex))) releaseRefusal();
    if (data.mode === 'versioned-migration') {
      if (!releaseString(migration.compatibilityApproval, releaseHex) || migration.maintenanceApproval !== null) releaseRefusal();
    } else if (migration.compatibilityApproval !== null || !releaseString(migration.maintenanceApproval, releaseHex)
      || schema.before.length !== 3 || schema.target.length !== 4 || manifestDigest(schema.before) !== activationSchema.targetDigest) releaseRefusal();
  }
  if (continuation) {
    if (data.mode !== 'etsy-strict-cutover') releaseRefusal();
    const approval = data.continuation as EtsyContinuationApproval;
    const approved = validateEtsyContinuationApproval(approval, (data.migration as ReleaseRequest['migration'])!.packetDigest,
      approval?.window?.start);
    const operator = approved.operator, controller = data.controller as RunIdentity, producer = data.producer as RunIdentity;
    if (controller.revision !== operator.revision || controller.tree !== operator.tree
      || producer.revision !== operator.revision || producer.tree !== operator.tree || producer.run !== operator.producerRun
      || data.artifactId !== operator.artifactId || data.configDigest !== approved.originalPacket.runtimeDigest
      || data.target !== approved.originalPacket.target || schema.beforeDigest !== approved.originalPacket.previousDigest
      || schema.targetDigest !== approved.originalPacket.targetDigest
      || (['artifactDigest', 'sourceDigest', 'archiveDigest', 'operatorDigest'] as const).some(key => data[key] !== operator[key])) releaseRefusal();
    const migration = data.migration as NonNullable<ReleaseRequest['migration']>, prior = approved.originalPacket.predecessor;
    if (canonical(migration.predecessor) !== canonical({ id: prior.id, revision: prior.revision,
      artifactDigest: prior.artifactDigest, configDigest: prior.configDigest })
      || migration.recoveryApproval !== sha256(canonical({ packet: migration.packetDigest, recovery: approved.originalPacket.grants.recovery }))
      || migration.maintenanceApproval !== sha256(canonical({ packet: migration.packetDigest, window: approved.window,
        maintenance: approved.originalPacket.grants.maintenance }))) releaseRefusal();
  }
}
function releaseSnapshot<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
  };
  freeze(copy);
  return copy;
}
/** The approval comes from the trusted caller, never from the selected bundle.
 * L1 must authenticate its origin and producer/controller metadata before effects. */
export function validateReleaseRequest(value: unknown, approval: unknown): ReleaseRequest {
  releaseRequestShape(value);
  const approved = releaseObject(approval, ['version', 'requestDigest']);
  if (approved.version !== 1 || !releaseString(approved.requestDigest, releaseHex)
    || sha256(canonical(value)) !== approved.requestDigest) releaseRefusal();
  return releaseSnapshot(value);
}
function releaseMigration(value: unknown, request: ReleaseRequest): asserts value is ReleaseMigration {
  const data = releaseObject(value, ['result', 'database_outcome', 'before', 'after', 'attempted', 'reporting']);
  if (!request.migration || !releaseChoice(data.database_outcome, ['not_started', 'committed', 'rolled_back', 'unknown'])
    || !releaseChoice(data.result, ['success', 'failed'])
    || !releaseChoice(data.reporting, ['not_requested', 'written', 'failed']) || !Array.isArray(data.attempted)
    || (data.result === 'success' && data.database_outcome !== 'committed')) releaseRefusal();
  const before = request.schema.before.map(item => item.name), after = request.schema.target.map(item => item.name);
  if ((data.before !== null && canonical(data.before) !== canonical(before))
    || (data.after !== null && canonical(data.after) !== canonical(data.database_outcome === 'committed' ? after : before))) releaseRefusal();
  const pending = request.schema.target.slice(request.schema.before.length);
  if (data.attempted.length > pending.length) releaseRefusal();
  for (const [index, value] of data.attempted.entries()) {
    const item = releaseObject(value, ['name', 'sha256', 'outcome']);
    if (item.name !== pending[index]!.name || item.sha256 !== pending[index]!.sha256
      || !releaseChoice(item.outcome, ['executed_uncommitted', 'applied_committed', 'rolled_back', 'unknown'])) releaseRefusal();
    if ((data.database_outcome === 'committed' && item.outcome !== 'applied_committed')
      || (data.database_outcome === 'rolled_back' && item.outcome !== 'rolled_back')
      || (data.database_outcome === 'unknown' && item.outcome === 'applied_committed')) releaseRefusal();
  }
  if (data.database_outcome === 'committed' && (canonical(data.before) !== canonical(before)
    || canonical(data.after) !== canonical(after) || data.attempted.length !== pending.length)) releaseRefusal();
  if (data.database_outcome === 'not_started' && data.attempted.length !== 0) releaseRefusal();
}
// Serialization checks preserve inherited identity; only raw-origin and production
// admission grant execution authority. They never count inherited CREATE as ours.
function heldAcknowledgement(id: unknown): boolean {
  return releaseString(id, deploymentId) && sha256(`${JSON.stringify({
    packetDigest: heldEtsyIncident.packetDigest, deploymentId: id,
  }, null, 2)}\n`) === heldEtsyIncident.ackDigest;
}
/** Validates retained/serialized output; never accepts raw provider bodies or exception text. */
export function validateReleaseResult(value: unknown): ReleaseResult {
  const data = releaseObject(value, ['version', 'request', 'status', 'stage', 'category', 'nextAction', 'effects',
    'deploymentId', 'migration', 'receiptDigest', 'proof', 'evidence']);
  if (data.version !== 1 || !releaseChoice(data.status, ['accepted', 'refused', 'failed', 'unknown'])
    || !releaseChoice(data.stage, releaseStages) || !releaseChoice(data.nextAction, releaseActions)
    || (data.category !== null && !releaseChoice(data.category, releaseCategories))
    || (data.receiptDigest !== null && !releaseString(data.receiptDigest, releaseHex))
    || (data.deploymentId !== null && !releaseString(data.deploymentId, deploymentId))) releaseRefusal();
  if (!releaseChoice(data.evidence, ['confirmed', 'unconfirmed'])) releaseRefusal();
  const effects = releaseObject(data.effects, ['create', 'migration', 'promotion']);
  if (data.request === null) {
    if (!releaseChoice(data.status, data.evidence === 'unconfirmed' ? ['unknown'] : ['refused'])
      || !releaseChoice(data.stage, ['request', 'artifact', 'receipt']) || data.category === null
      || !releaseChoice(data.nextAction, ['inspect-prerequisite', 'select-approved-artifact', 'inspect-retained-evidence'])
      || Object.values(effects).some(effect => effect !== 'not-started')
      || data.deploymentId !== null || data.migration !== null || data.receiptDigest !== null || data.proof !== null) releaseRefusal();
    return releaseSnapshot(value as ReleaseResult);
  }
  releaseRequestShape(data.request);
  const inherited = data.request.continuation !== undefined;
  const known = inherited ? data.deploymentId !== null && heldAcknowledgement(data.deploymentId) : effects.create === 'ACKed';
  if (!Object.values(effects).every(effect => releaseChoice(effect, ['not-started', 'ACKed', 'unknown']))
    || (inherited ? effects.create !== 'not-started' || (data.deploymentId !== null && !known)
      : (effects.create === 'ACKed') !== (data.deploymentId !== null))
    || (effects.promotion !== 'not-started' && !known)
    || (data.request.mode === 'current-schema-only' && effects.migration !== 'not-started')) releaseRefusal();
  if (data.migration !== null) {
    releaseMigration(data.migration, data.request);
    if (effects.migration !== (data.migration.database_outcome === 'unknown' ? 'unknown' : 'ACKed')) releaseRefusal();
  } else if (effects.migration === 'ACKed') releaseRefusal();
  if (data.request.mode === 'etsy-strict-cutover' && effects.migration !== 'not-started' && !known) releaseRefusal();
  if (data.request.migration && (effects.promotion !== 'not-started'
    || (data.request.mode === 'versioned-migration' && effects.create !== 'not-started'))
    && !(data.status === 'unknown' && data.evidence === 'unconfirmed')
    && (data.migration === null || data.migration.database_outcome !== 'committed'
      || data.migration.result !== 'success' || data.migration.reporting !== 'written')) releaseRefusal();
  const started = Object.values(effects).some(effect => effect !== 'not-started');
  const unknown = Object.values(effects).includes('unknown') || data.category === 'outcome-unknown'
    || data.category === 'evidence-persistence' || data.evidence === 'unconfirmed';
  if (data.status === 'accepted') {
    const proof = releaseObject(data.proof, ['deploymentId', 'artifactDigest', 'configDigest', 'schemaDigest', 'domain', 'checks']);
    if (unknown || !known || effects.promotion !== 'ACKed' || data.receiptDigest === null
      || data.stage !== 'receipt' || data.category !== null || !releaseChoice(data.nextAction, ['run-acceptance', 'none'])
      || proof.deploymentId !== data.deploymentId
      || proof.artifactDigest !== (data.request.continuation?.originalPacket.artifactDigest ?? data.request.artifactDigest)
      || proof.configDigest !== data.request.configDigest || proof.schemaDigest !== manifestDigest(data.request.schema.target)
      || proof.domain !== 'api.lovora.us' || proof.checks !== 'passed'
      || (data.request.migration && (data.migration === null || data.migration.database_outcome !== 'committed'
        || data.migration.reporting !== 'written'))) releaseRefusal();
  } else if (data.proof !== null || data.category === null || data.status !== (unknown ? 'unknown' : started ? 'failed' : 'refused')
    || releaseChoice(data.nextAction, ['run-acceptance', 'none'])) releaseRefusal();
  if (unknown && !releaseChoice(data.nextAction,
    ['inspect-known-deployment', 'reconcile-migration', 'reconcile-promotion', 'inspect-retained-evidence'])) releaseRefusal();
  if ((data.nextAction === 'inspect-known-deployment' && data.deploymentId === null)
    || (data.nextAction === 'reconcile-migration' && effects.migration === 'not-started')
    || (data.nextAction === 'reconcile-promotion' && effects.promotion === 'not-started')
    || (data.nextAction === 'approve-release-window' && data.request.mode !== 'etsy-strict-cutover')) releaseRefusal();
  return releaseSnapshot(value as ReleaseResult);
}

/** In-memory contract state only: callers persist intent before submission and ACK before further effects.
 * No workflow, environment, transport or durability authority is supplied by this object. */
export class ReleaseOutcome {
  readonly #request: ReleaseRequest;
  get request(): ReleaseRequest { return this.#request; }
  #effects: Record<ReleaseOperation, ReleaseEffect> = { create: 'not-started', migration: 'not-started', promotion: 'not-started' };
  #id: string | null = null;
  #migration: ReleaseMigration | null = null;
  constructor(value: unknown, approval: unknown) { this.#request = validateReleaseRequest(value, approval); }
  static admit(value: unknown, approval: unknown): ReleaseOutcome | ReleaseResult {
    try { return new ReleaseOutcome(value, approval); }
    catch {
      return validateReleaseResult({ version: 1, request: null, status: 'refused', stage: 'request',
        category: 'invalid-input', nextAction: 'inspect-prerequisite', evidence: 'confirmed',
        effects: { create: 'not-started', migration: 'not-started', promotion: 'not-started' },
        deploymentId: null, migration: null, receiptDigest: null, proof: null });
    }
  }
  restore(value: unknown): void {
    const prior = validateReleaseResult(value);
    if (canonical(prior.request) !== canonical(this.request)) releaseRefusal();
    this.#effects = { ...prior.effects }; this.#id = prior.deploymentId; this.#migration = prior.migration;
  }
  inheritHeld(id: string): void {
    if (!this.request.continuation || this.#id !== null || !heldAcknowledgement(id)
      || Object.values(this.#effects).some(effect => effect !== 'not-started')) releaseRefusal();
    this.#id = id;
  }
  submitted(operation: ReleaseOperation): void {
    if (!Object.hasOwn(this.#effects, operation) || this.#effects[operation] !== 'not-started'
      || (operation === 'create' && this.request.continuation !== undefined)
      || (operation === 'create' && this.request.mode === 'versioned-migration'
        && (this.#migration?.database_outcome !== 'committed' || this.#migration.result !== 'success' || this.#migration.reporting !== 'written'))
      || (operation === 'migration' && (!this.request.migration
        || (this.request.mode === 'etsy-strict-cutover' && this.#id === null)))
      || (operation === 'promotion' && (this.#id === null
        || (this.request.migration && (this.#migration?.database_outcome !== 'committed'
          || this.#migration.result !== 'success' || this.#migration.reporting !== 'written'))))) releaseRefusal();
    this.#effects[operation] = 'unknown';
  }
  acknowledgeCreate(id: unknown): void {
    if (this.#effects.create !== 'unknown' || !releaseString(id, deploymentId)) releaseRefusal();
    this.#id = id; this.#effects.create = 'ACKed';
  }
  acknowledgeMigration(report: MigrationReport): void {
    if (!report || typeof report !== 'object' || this.#effects.migration !== 'unknown'
      || report.source_revision !== (this.request.continuation?.originalPacket.revision ?? this.request.producer.revision) || report.target !== this.request.target
      || report.manifest_digest !== manifestDigest(this.request.schema.target)) releaseRefusal();
    const safe = { result: report.result, database_outcome: report.database_outcome, before: report.before, after: report.after,
      attempted: report.attempted, reporting: report.reporting };
    releaseMigration(safe, this.request);
    this.#migration = releaseSnapshot(safe);
    this.#effects.migration = safe.database_outcome === 'unknown' ? 'unknown' : 'ACKed';
  }
  acknowledgePromotion(): void {
    if (this.#effects.promotion !== 'unknown') releaseRefusal();
    this.#effects.promotion = 'ACKed';
  }
  finish(input: { stage: ReleaseStage; category: ReleaseCategory | null; nextAction: ReleaseNextAction;
    receiptDigest: string | null; proof?: unknown; evidence?: 'confirmed' | 'unconfirmed' }): ReleaseResult {
    releaseObject(input, ['stage', 'category', 'nextAction', 'receiptDigest',
      ...(Object.hasOwn(input, 'proof') ? ['proof'] : []), ...(Object.hasOwn(input, 'evidence') ? ['evidence'] : [])]);
    const started = Object.values(this.#effects).some(effect => effect !== 'not-started');
    const unknown = Object.values(this.#effects).includes('unknown') || input.category === 'outcome-unknown'
      || input.category === 'evidence-persistence' || input.evidence === 'unconfirmed';
    return validateReleaseResult({ version: 1, request: this.request,
      status: input.proof !== undefined ? 'accepted' : unknown ? 'unknown' : started ? 'failed' : 'refused',
      stage: input.stage, category: input.category, nextAction: input.nextAction, effects: this.#effects,
      deploymentId: this.#id, migration: this.#migration, receiptDigest: input.receiptDigest, proof: input.proof ?? null,
      evidence: input.evidence ?? 'confirmed' });
  }
}

export class ReleaseFailure extends Error {
  result?: ReleaseResult;
  reported = false;
  constructor(readonly stage: ReleaseStage, readonly category: ReleaseCategory, cause?: unknown) {
    super('Release not accepted; inspect the bounded result and retained evidence.', cause === undefined ? undefined : { cause });
  }
}

/** Diagnostic observations never grant permission to resume or repeat a phase. */
export class ReleaseDiagnostics {
  #outcome: ReleaseOutcome;
  #stage: ReleaseStage = 'request';
  #category: ReleaseCategory = 'invalid-input';
  #failure?: ReleaseFailure;
  #unconfirmed = false;
  #digest: string | null = null;
  #sequence = 0;
  #final = false;
  constructor(readonly request: ReleaseRequest, readonly directory: string, readonly signal: AbortSignal,
    readonly trace?: ChecksDiagnostics) {
    this.#outcome = new ReleaseOutcome(request, { version: 1, requestDigest: sha256(canonical(request)) });
  }
  load(allowTerminal = false): void {
    this.at('receipt', 'evidence-persistence');
    privateDirectory(this.directory);
    const names = readdirSync(this.directory).filter(name => /^release-outcome-\d{4}\.json$/.test(name)).sort();
    if (names.length > 256) throw this.capture();
    let previous: string | null = null, prior: ReleaseResult | undefined, terminal = false;
    for (const [index, name] of names.entries()) {
      if (name !== `release-outcome-${String(index).padStart(4, '0')}.json`) throw this.capture();
      const entry = readEvidence(join(this.directory, name));
      const value = releaseObject(entry.value, ['requestDigest', 'previous', 'result', 'terminal']);
      const result = validateReleaseResult(value.result);
      if (!result.request || typeof value.terminal !== 'boolean' || value.requestDigest !== sha256(canonical(result.request)) || value.previous !== previous
        || (prior && canonical(prior.request) !== canonical(result.request))) throw this.capture();
      prior = result; previous = entry.identity.sha256;
      terminal = value.terminal as boolean;
      this.#outcome = new ReleaseOutcome(result.request, { version: 1, requestDigest: sha256(canonical(result.request)) });
      this.#outcome.restore(result); this.#unconfirmed = result.evidence === 'unconfirmed';
      this.#digest = previous; this.#sequence = index + 1;
    }
    if (prior?.request) {
      if (canonical(prior.request) !== canonical(this.request)) {
        this.at('artifact', 'identity-mismatch'); throw this.capture();
      }
      if (terminal && prior.status !== 'accepted' && !allowTerminal) {
        throw this.capture(new ReleaseFailure(prior.stage, prior.category!));
      }
    }
    this.at('request', 'invalid-input');
  }
  at(stage: ReleaseStage, category: ReleaseCategory = 'validation'): void {
    this.#stage = stage; this.#category = category;
    this.trace?.event(`release.${stage}`, 'started', category);
  }
  check(name: string, condition: boolean, values: Record<string, number | boolean | null> = {}): void {
    this.trace?.check(`${this.#stage}.${name}`, condition, 'condition-mismatch', values);
    if (!condition) throw this.capture(new Error(`Release predicate failed: ${name}.`));
  }
  /** Wrap async provider operations once; arguments/results stay private and no operation is repeated. */
  operations<T extends object>(prefix: string, operations: T): T {
    if (!this.trace) return operations;
    for (const [name, operation] of Object.entries(operations)) {
      if (typeof operation !== 'function') continue;
      Object.assign(operations, { [name]: (...args: unknown[]) => this.trace!.boundary(`${prefix}.${name}`, () => operation(...args)) });
    }
    return operations;
  }
  capture(cause?: unknown): ReleaseFailure {
    if (!this.#failure) {
      this.#failure = cause instanceof ReleaseFailure ? cause
        : new ReleaseFailure(this.#stage, this.signal.aborted ? 'timeout' : this.#category, cause);
      this.trace?.event(`release.${this.#failure.stage}`, 'failed', this.#failure.category,
        { aborted: this.signal.aborted }, cause ?? this.#failure);
      const state = this.snapshot();
      for (const operation of ['create', 'migration', 'promotion'] as const) {
        if (state.effects[operation] === 'not-started') this.trace?.event(`release.${operation}`, 'not-run', 'first-failure-before-submission');
      }
    }
    if (this.#failure.category === 'evidence-persistence') this.#unconfirmed = true;
    return this.#failure;
  }
  reject(category: ReleaseCategory): never { throw this.capture(new ReleaseFailure(this.#stage, category)); }
  evidenceFailed(): void { this.#unconfirmed = true; }
  async guard<T>(category: ReleaseCategory, body: () => Promise<T>): Promise<T> {
    const previous = this.#category; this.#category = category;
    try { return this.trace ? await this.trace.boundary(`${this.#stage}.${category}`, body) : await body(); }
    catch (cause) {
      if (category === 'evidence-persistence') this.#unconfirmed = true;
      throw this.capture(cause);
    } finally { this.#category = previous; }
  }
  observe(body: () => void): void {
    try { if (this.trace) this.trace.sync(`${this.#stage}.receipt-write`, body); else body(); }
    catch (cause) { this.#unconfirmed = true; throw this.capture(new ReleaseFailure(this.#stage, 'evidence-persistence', cause)); }
  }
  submitted(operation: ReleaseOperation): void {
    this.#outcome.submitted(operation);
    this.trace?.event(`effect.${operation}`, 'started', 'submitted-outcome-unknown'); this.persist();
  }
  created(id: string): void {
    this.#outcome.acknowledgeCreate(id);
    this.trace?.event('effect.create', 'passed', 'deployment-id-acknowledged', { actualId: id }); this.persist();
  }
  inheritedHeld(id: string): void {
    this.#outcome.inheritHeld(id);
    this.trace?.event('effect.create', 'not-run', 'inherited-original-ack-zero-create', { actualId: id });
    this.persist();
  }
  migrated(report: MigrationReport): void {
    this.#outcome.acknowledgeMigration(report);
    this.trace?.event('effect.migration', report.database_outcome === 'committed' ? 'passed' : 'failed',
      `database-${report.database_outcome}`, { committed: report.database_outcome === 'committed', reportingWritten: report.reporting === 'written' });
    if (report.reporting === 'failed') this.#unconfirmed = true;
    this.persist();
  }
  promoted(): void {
    this.#outcome.acknowledgePromotion();
    this.trace?.event('effect.promotion', 'passed', 'promotion-acknowledged'); this.persist();
  }
  verified(): void { this.#final = true; this.at('receipt'); }
  remote(descriptions: readonly string[]): void {
    // Remote intent/ID observations are diagnostic only. A report hash is not a SQL report.
    const ids = [...new Set(descriptions.filter(value => value.startsWith('ack:')).map(value => value.slice(4)))];
    const state = this.snapshot(), id = ids[0] ?? state.deploymentId;
    if (ids.length > 1 || (state.deploymentId && id !== state.deploymentId)) this.reject('identity-mismatch');
    const create = this.request.continuation ? 'not-started' : id ? 'ACKed' : descriptions.includes('create_intent_unknown_until_acknowledged')
      || descriptions.some(value => value.startsWith('strict:held-create:intent:')) ? 'unknown' : state.effects.create;
    const migration = state.effects.migration === 'not-started' && descriptions.some(value => value.startsWith('strict:sql-apply:intent:')
      || value.startsWith('migration_intent:')) ? 'unknown' : state.effects.migration;
    const promotion = state.effects.promotion === 'not-started' && descriptions.some(value => value.startsWith('promoting:')
      || value.startsWith('strict:promote-only:intent:')) ? 'unknown' : state.effects.promotion;
    this.#unconfirmed = true;
    this.#outcome.restore({ ...state, status: 'unknown', category: 'outcome-unknown', evidence: 'unconfirmed', deploymentId: id,
      effects: { create, migration, promotion } });
  }
  private snapshot(): ReleaseResult {
    return this.#outcome.finish({ stage: this.#stage, category: 'outcome-unknown', nextAction: 'inspect-retained-evidence',
      receiptDigest: this.#digest, evidence: this.#unconfirmed ? 'unconfirmed' : 'confirmed' });
  }
  persist(result?: ReleaseResult): void {
    const terminal = result !== undefined;
    result ??= this.snapshot();
    this.trace?.event('release.receipt-finalization', 'started', terminal ? 'terminal-outcome' : 'intermediate-outcome');
    this.observe(() => {
      if (this.#sequence >= 256) throw new Error('Bounded diagnostic history exhausted.');
      const path = join(this.directory, `release-outcome-${String(this.#sequence).padStart(4, '0')}.json`);
      writeReleaseEvidence(path, { requestDigest: sha256(canonical(result!.request)), previous: this.#digest, result, terminal });
      this.#digest = readEvidence(path).identity.sha256; this.#sequence++;
    });
    this.trace?.event('release.receipt-finalization', 'passed', 'durable-outcome-readback-confirmed');
  }
  failure(cause?: unknown): ReleaseResult {
    const failure = this.capture(cause), state = this.snapshot();
    const nextAction: ReleaseNextAction = state.effects.promotion !== 'not-started' ? 'reconcile-promotion'
      : state.effects.migration !== 'not-started' && state.migration?.database_outcome !== 'committed' ? 'reconcile-migration'
      : state.deploymentId ? 'inspect-known-deployment'
      : ['invalid-input', 'unauthorized-context', 'missing-prerequisite'].includes(failure.category) && !this.#unconfirmed
        ? 'inspect-prerequisite' : 'inspect-retained-evidence';
    return this.#outcome.finish({ stage: failure.stage, category: failure.category, nextAction,
      receiptDigest: this.#digest, evidence: this.#unconfirmed ? 'unconfirmed' : 'confirmed' });
  }
  complete(): ReleaseResult | undefined {
    if (!this.#final) { this.persist(); return; }
    const state = this.snapshot();
    return this.#outcome.finish({ stage: 'receipt', category: null, nextAction: 'run-acceptance', receiptDigest: this.#digest,
      evidence: this.#unconfirmed ? 'unconfirmed' : 'confirmed', proof: { deploymentId: state.deploymentId,
        artifactDigest: this.request.continuation?.originalPacket.artifactDigest ?? this.request.artifactDigest, configDigest: this.request.configDigest,
        schemaDigest: this.request.schema.targetDigest, domain: 'api.lovora.us', checks: 'passed' } });
  }
}

export function deliveryContext(env: NodeJS.ProcessEnv, tree: string): RunIdentity {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1'
    || env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/be-delivery.yml@refs/heads/main`
    || env.BE_DELIVERY_ENABLED !== 'true' || env.BE_DELIVERY_ENVIRONMENT !== 'be-production'
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || !/^[a-f0-9]{40}$/.test(tree)
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')) throw new Error('Production workflow context is not authorized.');
  return { revision: env.GITHUB_SHA!, tree, run: env.GITHUB_RUN_ID! };
}

/** Builds nonsecret expectations from separately approved producer/config/schema/packet inputs.
 * The resulting request is persisted by the verified checkout before the operator receives credentials. */
export async function approvedRoutineRequest(artifact: VerifiedArtifact, selection: unknown, approval: unknown,
  context: unknown, packetValue: unknown): Promise<ReleaseRequest> {
  const selected = validateRoutineSelection(selection, context), controls = selected.context;
  const approved = routineApproval(approval, controls.approvalDigest, selected);
  if (artifact.digest !== approved.artifactDigest || artifact.manifest.source.digest !== approved.sourceDigest
    || artifact.manifest.source.revision !== selected.producer.revision || artifact.manifest.source.tree !== selected.producer.tree
    || artifact.manifest.migrationDigest !== controls.schemaDigest) releaseRefusal();
  const request: ReleaseRequest = { version: 1, mode: controls.mode, repository, target: controls.target,
    controller: { ...controls.controller, tree: selected.controllerTree }, producer: selected.producer, artifactId: controls.artifactId,
    artifactDigest: approved.artifactDigest, sourceDigest: approved.sourceDigest, archiveDigest: approved.archiveDigest,
    operatorDigest: approved.operatorDigest, configDigest: controls.configDigest, historicalHandoffDigest,
    schema: { beforeDigest: controls.schemaDigest, targetDigest: controls.schemaDigest,
      before: artifact.manifest.migrations, target: artifact.manifest.migrations }, migration: null };
  if (controls.mode === 'versioned-migration') {
    const packet = routinePacket(packetValue, controls.packetDigest, artifact, { ...selected.producer, run: controls.controller.run });
    if (packet.target !== controls.target) releaseRefusal();
    request.schema.before = packet.previous; request.schema.beforeDigest = manifestDigest(packet.previous);
    request.migration = { packetDigest: controls.packetDigest, predecessor: { id: packet.predecessor.id,
      revision: packet.predecessor.revision, artifactDigest: packet.predecessor.artifact, configDigest: packet.predecessor.configDigest },
      compatibilityApproval: packet.compatibilityApproval, recoveryApproval: packet.recoveryApproval, maintenanceApproval: null };
  } else if (controls.mode === 'etsy-strict-cutover') {
    const continuation = controls.heldIncident ? validateEtsyContinuationApproval(packetValue, controls.packetDigest) : undefined;
    const packet = continuation?.originalPacket ?? validateEtsyReleasePacket(packetValue, controls.packetDigest);
    if (continuation) {
      request.continuation = continuation;
      if (controls.heldIncident !== heldEtsyIncident.run) releaseRefusal();
    } else if (packet.revision !== selected.producer.revision || packet.tree !== selected.producer.tree
      || packet.artifactDigest !== artifact.digest || packet.sourceDigest !== approved.sourceDigest) releaseRefusal();
    if (packet.runtimeDigest !== controls.configDigest || packet.target !== controls.target || packet.targetDigest !== controls.schemaDigest) releaseRefusal();
    request.schema.before = artifact.manifest.migrations.slice(0, 3); request.schema.beforeDigest = packet.previousDigest;
    request.migration = { packetDigest: controls.packetDigest, predecessor: { id: packet.predecessor.id,
      revision: packet.predecessor.revision, artifactDigest: packet.predecessor.artifactDigest, configDigest: packet.predecessor.configDigest },
      compatibilityApproval: null, recoveryApproval: sha256(canonical({ packet: controls.packetDigest, recovery: packet.grants.recovery })),
      maintenanceApproval: sha256(canonical({ packet: controls.packetDigest, window: continuation?.window ?? packet.window,
        maintenance: packet.grants.maintenance })) };
  } else if (packetValue !== undefined) releaseRefusal();
  return validateReleaseRequest(request, { version: 1, requestDigest: sha256(canonical(request)) });
}

async function prepareRoutineDelivery(input: { bundle: string; transfer: string; env: NodeJS.ProcessEnv }) {
  const context = loadRoutineContext(input.env);
  const selection = readRoutineSelection(input.transfer, input.env.BE_RELEASE_SELECTION_SHA256, context);
  const { approval } = verifyRoutineTransfer(input.transfer, selection, context, true);
  const artifact = await verifyRoutineBundle(input.bundle, approval, selection, context, undefined);
  const expected = await approvedRoutineRequest(artifact, selection, approval, context,
    context.packetDigest === null ? undefined : decodePhaseInput(input.env.BE_MIGRATION_PACKET_JSON));
  const request = validateReleaseRequest(readRoutineRequest(input.transfer, input.env.BE_RELEASE_REQUEST_SHA256),
    { version: 1, requestDigest: sha256(canonical(expected)) });
  return { artifact, request, selection, context };
}
export async function authenticateRoutineDelivery(input: { bundle: string; transfer: string; env: NodeJS.ProcessEnv;
  read(path: string): Promise<unknown> }): Promise<{ artifact: VerifiedArtifact; request: ReleaseRequest }> {
  const prepared = await prepareRoutineDelivery(input);
  await confirmRoutineSelection(prepared.selection, prepared.context, input.read);
  return { artifact: prepared.artifact, request: prepared.request };
}
export interface DeliveryCli { create(): Promise<CommandResult>; promote(id: string): Promise<CommandResult> }
export interface OfficialCli extends DeliveryCli { dispose(): Promise<void> }
export function acknowledgedId(stdout: string): string | undefined {
  try {
    const id: unknown = JSON.parse(stdout).deployment?.id;
    return typeof id === 'string' && deploymentId.test(id) ? id : undefined;
  } catch { return undefined; }
}
export async function deliver(input: { artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineDeliveryApproval;
  provider: DeliveryProvider; cli: DeliveryCli; reservation?: { journal: number; predecessor: string };
  signal: AbortSignal; receipt(event: Record<string, unknown>): void; pause?: () => Promise<void>;
  diagnostics?: ReleaseDiagnostics }): Promise<string> {
  const { artifact, run, provider, cli, signal, diagnostics } = input;
  const receipt = (event: Record<string, unknown>) => diagnostics ? diagnostics.observe(() => input.receipt(event)) : input.receipt(event);
  const configDigest = input.schema.configDigest;
  diagnostics?.trace?.check('request.configuration-approval', typeof configDigest === 'string' && releaseHex.test(configDigest), 'independent-runtime-digest-required');
  diagnostics?.trace?.check('request.migration-continuation', Boolean(input.schema.migration) === Boolean(input.reservation), 'reservation-and-migration-mode-must-agree');
  if (typeof configDigest !== 'string' || !releaseHex.test(configDigest)) throw new Error('Independent runtime configuration approval is required.');
  if (Boolean(input.schema.migration) !== Boolean(input.reservation)) throw new Error('Migration continuation is required.');
  const verify = () => {
    signal.throwIfAborted();
    if (diagnostics?.trace) diagnostics.trace.sync('artifact.inventory-and-source', () => verifyRoutineArtifact(artifact, run, input.schema));
    else verifyRoutineArtifact(artifact, run, input.schema);
  };
  diagnostics?.at('artifact', 'identity-mismatch');
  verify();
  await provider.currentMain();
  diagnostics?.at('configuration');
  const predecessor = await provider.preflight();
  if (input.reservation) diagnostics?.trace?.check('configuration.migrated-predecessor', predecessor === input.reservation.predecessor,
    'predecessor-binding-changed', { actualId: predecessor, expectedId: input.reservation.predecessor });
  if (input.reservation && predecessor !== input.reservation.predecessor) throw new Error('Migrated predecessor binding changed.');
  let journal: number | undefined = input.reservation?.journal, id: string | undefined;
  try {
    journal ??= await provider.reserve();
    diagnostics?.at('create', 'outcome-unknown');
    receipt({ phase: 'reserved', journal, run, artifact: artifact.digest, configDigest, predecessor });
    if (diagnostics) await diagnostics.guard('evidence-persistence', () => provider.record(journal!, 'in_progress', 'create_intent_unknown_until_acknowledged'));
    else await provider.record(journal, 'in_progress', 'create_intent_unknown_until_acknowledged');
    await provider.currentMain(); await provider.binding(predecessor); verify();
    receipt({ phase: 'create_intent', journal });
    diagnostics?.submitted('create');
    const created = await cli.create();
    id = acknowledgedId(created.stdout);
    if (id) {
      // Persist even a nonzero/aborted CLI's valid ID, before inspect or any other provider operation.
      diagnostics?.created(id);
      receipt({ phase: 'acknowledged', journal, id });
      if (diagnostics) await diagnostics.guard('evidence-persistence', () => provider.record(journal!, 'in_progress', `ack:${id}`));
      else await provider.record(journal, 'in_progress', `ack:${id}`);
    }
    diagnostics?.trace?.check('create.cli-acknowledgement', Boolean(id) && created.code === 0 && !created.aborted,
      'missing-id-nonzero-exit-or-cancelled-reconcile-without-replay', { idKnown: Boolean(id), code: created.code, aborted: created.aborted });
    if (!id || created.code !== 0 || created.aborted) throw new Error('Create outcome requires reconciliation.');
    diagnostics?.at('candidate');
    let candidate: Candidate;
    for (;;) {
      signal.throwIfAborted(); candidate = await provider.inspect(id);
      if (candidate.ready) break;
      await (input.pause?.() ?? delay(4000, undefined, { signal }));
    }
    await provider.attest(id); await provider.binding(predecessor);
    await provider.http(candidate.origin, true);
    await provider.currentMain(); await provider.binding(predecessor); verify();
    const candidateReady = (await provider.inspect(id)).ready;
    diagnostics?.trace?.check('candidate.pre-promotion-readiness', candidateReady, 'candidate-no-longer-ready');
    if (!candidateReady) throw new Error('Candidate readiness changed.');
    await provider.attest(id);
    diagnostics?.at('promote', 'outcome-unknown');
    receipt({ phase: 'promotion_intent', journal, id });
    if (diagnostics) await diagnostics.guard('evidence-persistence', () => provider.record(journal!, 'in_progress', `promoting:${id}`));
    else await provider.record(journal, 'in_progress', `promoting:${id}`);
    signal.throwIfAborted();
    diagnostics?.submitted('promotion');
    const promoted = await cli.promote(id);
    diagnostics?.trace?.check('promotion.cli-acknowledgement', promoted.code === 0 && !promoted.aborted,
      'nonzero-exit-or-cancelled-reconcile-without-replay', { code: promoted.code, aborted: promoted.aborted });
    if (promoted.code !== 0 || promoted.aborted) throw new Error('Promotion outcome requires reconciliation.');
    diagnostics?.promoted(); diagnostics?.at('domain');
    await provider.binding(id);
    const finalReady = (await provider.inspect(id)).ready;
    diagnostics?.trace?.check('domain.final-readiness', finalReady, 'promoted-candidate-not-ready');
    if (!finalReady) throw new Error('Promoted candidate is not ready.');
    await provider.attest(id); await provider.http('https://api.lovora.us', false); await provider.binding(id);
    diagnostics?.at('receipt', 'evidence-persistence');
    verify(); receipt({ phase: 'accepted', journal, id, artifact: artifact.digest, configDigest, region: 'icn1', cases: 8 });
    if (diagnostics) await diagnostics.guard('evidence-persistence', () => provider.record(journal!, 'success', `accepted:${id}`));
    else await provider.record(journal, 'success', `accepted:${id}`);
    diagnostics?.verified();
    return id;
  } catch (cause) {
    const failure = diagnostics?.capture(cause);
    try { receipt({ phase: 'unresolved', journal: journal ?? null, id: id ?? null }); }
    catch { diagnostics?.evidenceFailed(); }
    if (journal !== undefined) await provider.record(journal, 'error', id ? `unresolved:${id}` : 'unresolved_create_identity')
      .catch(() => diagnostics?.evidenceFailed());
    throw failure ?? new Error('Delivery not accepted; retained intent blocks automatic retry.');
  }
}
export async function deliverActivationCandidate(input: {
  artifact: VerifiedArtifact; activation: ActivationDeliveryContext; provider: ActivationProvider; cli: DeliveryCli;
  predecessor: string; journal: number; signal: AbortSignal; pause?: () => Promise<void>;
  persist(kind: 'acknowledged' | 'candidate-attested' | 'promotion-intent', value: Record<string, string>): void;
}): Promise<string> {
  const { artifact, activation, provider, cli, predecessor, journal, signal, persist } = input;
  validateActivationPacket(activation.packet, activation.packetDigest);
  const verify = () => { signal.throwIfAborted(); verifyActivationArtifact(artifact, activation.packet); };
  verify(); await provider.currentMain(); await provider.binding(predecessor);
  const created = await cli.create(), id = acknowledgedId(created.stdout);
  if (id) {
    persist('acknowledged', { deploymentId: id });
    await provider.record(journal, 'in_progress', `ack:${id}`);
    await provider.confirmJournal(journal, 'in_progress', `ack:${id}`);
  }
  if (!id || created.code !== 0 || created.aborted) throw new Error('Activation create outcome requires read-only reconciliation.');
  let candidate: Candidate;
  for (;;) {
    signal.throwIfAborted(); candidate = await provider.inspect(id);
    if (candidate.ready) break;
    await (input.pause?.() ?? delay(4000, undefined, { signal }));
  }
  await provider.attest(id); await provider.binding(predecessor); await provider.http(candidate.origin, true);
  persist('candidate-attested', { deploymentId: id,
    configDigest: activation.phase === 'bridge' ? activation.packet.bridgeConfigDigest : activation.packet.appConfigDigest });
  await provider.currentMain(); await provider.binding(predecessor); verify();
  if (!(await provider.inspect(id)).ready) throw new Error('Activation candidate readiness changed.');
  await provider.attest(id);
  persist('promotion-intent', { deploymentId: id });
  await provider.record(journal, 'in_progress', `promoting:${id}`);
  await provider.confirmJournal(journal, 'in_progress', `promoting:${id}`);
  signal.throwIfAborted();
  const promoted = await cli.promote(id);
  if (promoted.code !== 0 || promoted.aborted) throw new Error('Activation promotion outcome is unknown.');
  await provider.binding(id);
  if (!(await provider.inspect(id)).ready) throw new Error('Activation final candidate is not ready.');
  await provider.attest(id); await provider.http('https://api.lovora.us', false); await provider.binding(id);
  verify();
  return id;
}
export async function stagePrebuiltOutput(artifact: VerifiedArtifact, stage: string): Promise<void> {
  await mkdir(join(stage, '.vercel'));
  await mkdir(join(stage, 'apps/api'), { recursive: true });
  await cp(join(artifact.root, '.vercel/output'), join(stage, '.vercel/output'), { recursive: true, preserveTimestamps: true, errorOnExist: true });
  await writeFile(join(stage, '.vercel/project.json'), JSON.stringify({ projectId: artifactTarget.project, orgId: artifactTarget.owner }));
}
export function prebuiltCreateArguments(artifact: VerifiedArtifact, common: string[], activation?: ActivationDeliveryContext): string[] {
  if (activation) { validateActivationPacket(activation.packet, activation.packetDigest); verifyActivationArtifact(artifact, activation.packet); }
  const metadata = activation ? ['--meta', `activationRun=${activation.packet.runId}`, '--meta', `activationPhase=${activation.phase}`,
    '--meta', `activationPacket=${activation.packetDigest}`, '--meta',
    `activationConfigDigest=${activation.phase === 'bridge' ? activation.packet.bridgeConfigDigest : activation.packet.appConfigDigest}`] : [];
  return ['deploy', '--prebuilt', '--archive=tgz', '--prod', '--regions', 'icn1', '--skip-domain', '--no-wait', '--json', '--no-guidance',
    ...common, '--meta', `sourceCommit=${artifact.manifest.source.revision}`, '--meta', `artifactSha256=${artifact.digest}`,
    '--meta', `sourceDigest=${artifact.manifest.source.digest}`, ...metadata];
}

export async function officialCli(artifact: VerifiedArtifact, cli: string, token: string, signal: AbortSignal,
  activation?: ActivationDeliveryContext, diagnostics?: ReleaseDiagnostics): Promise<OfficialCli> {
  if (!/^[\x21-\x7e]{16,512}$/.test(token) || !cli.endsWith('/vercel/dist/vc.js')) throw new Error('Invalid isolated CLI input.');
  if (activation) {
    validateActivationPacket(activation.packet, activation.packetDigest);
    if (!['bridge', 'app'].includes(activation.phase)) throw new Error('Invalid activation phase.');
    verifyActivationArtifact(artifact, activation.packet);
  }
  const root = await mkdtemp(join(realpathSync(tmpdir()), 'esty-ci-delivery-'));
  try {
    const env = await isolatedEnvironment(join(root, 'environment'));
    const auth = join(root, 'auth'), stage = join(root, 'stage'); await mkdir(auth, { mode: 0o700 }); await mkdir(stage);
    await writeFile(join(auth, 'auth.json'), JSON.stringify({ token }), { flag: 'wx', mode: 0o600 });
    await stagePrebuiltOutput(artifact, stage);
    const common = ['--non-interactive', '--cwd', stage, '--global-config', auth, '--scope', artifactTarget.scope];
    let created = false, promoted = false;
    return {
      async create() {
        if (created) throw new Error('CLI create is one-shot.'); created = true;
        const uploaded = inventory(join(stage, '.vercel/output')).files.map(file => ({ ...file, path: `.vercel/output/${file.path}` }));
        if (canonical(uploaded) !== canonical(artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/')))) {
          throw new Error('CLI staging bytes differ from the tested artifact.');
        }
        return command(process.execPath, [cli, ...prebuiltCreateArguments(artifact, common, activation)], stage, env, signal, diagnostics?.trace);
      },
      async promote(id) {
        if (!created || promoted || !deploymentId.test(id)) throw new Error('CLI promotion is one-shot.'); promoted = true;
        return command(process.execPath, [cli, 'promote', id, '--timeout', '5m', ...common], stage, env, signal, diagnostics?.trace);
      },
      async dispose() { await removeArtifactTree(root); },
    };
  } catch { await removeArtifactTree(root); throw new Error('Isolated CLI preparation failed.'); }
}

function routinePhaseContext(env: NodeJS.ProcessEnv) {
  const mode = env.BE_DELIVERY_MODE, action = env.BE_ROUTINE_ACTION;
  if (!['current-schema-only', 'versioned-migration', 'etsy-strict-cutover'].includes(mode ?? '')
    || !['authorize', 'history', 'held', 'migrate', 'deliver', 'reconcile'].includes(action ?? '')
    || (mode === 'current-schema-only' && action !== 'deliver')
    || (mode === 'versioned-migration' && !['authorize', 'migrate', 'deliver'].includes(action ?? ''))) {
    throw new Error('Explicit routine delivery mode/action required.');
  }
  const providerSecrets = ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'BE_PREVIEW_ACCESS_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET'];
  const forbidden = ['VERCEL_CONFIGURATION_TOKEN', 'ACTIVATION_ROLE_INPUTS', 'ACTIVATION_BOOTSTRAP_INPUTS',
    'ACTIVATION_MIGRATION_INPUTS', 'ACTIVATION_BRIDGE_INPUTS', 'ACTIVATION_APP_INPUTS'];
  if (forbidden.some(key => env[key] !== undefined)
    || Object.keys(env).some(key => /^(?:APP_AUTH_|APP_OPERATOR_|APP_ROLES_|SUPABASE_SERVICE_ROLE_KEY$)/.test(key) && env[key] !== undefined)
    || (action === 'migrate' || action === 'history' ? providerSecrets.some(key => env[key] !== undefined)
      : env.BE_MIGRATION_INPUTS !== undefined)) throw new Error('Routine phase credential boundary differs.');
  return { mode, action };
}

// The CLI calls this phase only after authenticated ingress and exact executing-operator verification.
// Keeping the existing dispatch together makes zero SQL-runner calls observable without bypassing those CLI gates.
export interface RoutinePhaseInput {
  artifact: VerifiedArtifact; request: ReleaseRequest; env: NodeJS.ProcessEnv;
  cli: string; reports: string; signal: AbortSignal; emit?: boolean; trace?: ChecksDiagnostics;
}
export async function runRoutinePhase(input: RoutinePhaseInput): Promise<ReleaseResult | undefined> {
  let diagnostics: ReleaseDiagnostics | undefined;
  try {
    diagnostics = new ReleaseDiagnostics(input.request, input.reports, input.signal, input.trace);
    diagnostics.load(input.env.BE_ROUTINE_ACTION === 'reconcile');
    if (input.trace) await input.trace.boundary('routine.execute-phase', () => executeRoutinePhase(input, diagnostics!));
    else await executeRoutinePhase(input, diagnostics);
    if (input.env.BE_ROUTINE_ACTION === 'reconcile') return;
    const result = diagnostics.complete();
    if (result) {
      diagnostics.persist(result);
      if (input.emit !== false) {
        const emitted = validateReleaseResult(emitRoutineResult(result, input.env, input.trace));
        if (emitted.status !== result.status) {
          const failure = new ReleaseFailure(emitted.stage, emitted.category!);
          failure.result = emitted; failure.reported = true; throw failure;
        }
      }
      return result;
    }
    console.info(JSON.stringify({ version: 1, event: 'phase-confirmed', phase: input.env.BE_ROUTINE_ACTION, releaseAccepted: false }));
    return;
  } catch (cause) {
    if (cause instanceof ReleaseFailure && cause.reported && cause.result) {
      try { diagnostics?.persist(cause.result); } catch { /* Already emitted unconfirmed evidence. */ }
      throw cause;
    }
    const failure = diagnostics?.capture(cause) ?? new ReleaseFailure('request', 'invalid-input');
    let result = diagnostics?.failure(cause) ?? validateReleaseResult(routineFailureResult());
    try { diagnostics?.persist(result); }
    catch { diagnostics?.evidenceFailed(); result = diagnostics?.failure(cause) ?? result; }
    if (input.emit !== false) {
      const emitted = validateReleaseResult(emitRoutineResult(result, input.env, input.trace));
      if (emitted.evidence !== result.evidence || emitted.nextAction !== result.nextAction) {
        try { diagnostics?.persist(emitted); } catch { /* Emitted evidence is already unconfirmed. */ }
      }
      result = emitted;
    }
    failure.result = result;
    throw failure;
  }
}
async function executeRoutinePhase(input: RoutinePhaseInput, diagnostics: ReleaseDiagnostics): Promise<void> {
  diagnostics.at('request', 'unauthorized-context');
  const { artifact, request, env, cli, reports, signal } = input, { mode, action } = routinePhaseContext(env);
  releaseRequestShape(request);
  if ((env.BE_HELD_INCIDENT ?? '') !== (request.continuation ? heldEtsyIncident.run : '')) releaseRefusal();
  diagnostics.at('artifact', 'identity-mismatch');
  if (request.mode !== mode || request.artifactDigest !== artifact.digest || request.sourceDigest !== artifact.manifest.source.digest
    || request.schema.targetDigest !== artifact.manifest.migrationDigest
    || canonical(request.schema.target) !== canonical(artifact.manifest.migrations)) releaseRefusal();
  const run = request.controller, schema: RoutineDeliveryApproval = { digest: request.schema.targetDigest,
    configDigest: request.configDigest, requestDigest: sha256(canonical(request)), request };
  if (mode === 'etsy-strict-cutover') {
    await runStrictRoutinePhase({ artifact, request, env, action: action!, cli, directory: reports, signal, diagnostics });
    return;
  }
  if (mode === 'versioned-migration') {
    const packetDigest = approvedSchema(env.BE_MIGRATION_PACKET_SHA256);
    const packet = routinePacket(decodePhaseInput(env.BE_MIGRATION_PACKET_JSON), packetDigest, artifact, run);
    if (packet.target === 'local' || packet.target !== request.target || packetDigest !== request.migration?.packetDigest) {
      throw new Error('Actions migration must use the approved cloud target and packet.');
    }
    schema.migration = { packet, digest: packetDigest };
  }
  verifyRoutineArtifact(artifact, run, schema);
  await mkdir(reports, { mode: 0o700, recursive: true });
  if (action === 'migrate') {
    diagnostics.at('sql');
    await executeRoutineMigration({ artifact, run, schema, directory: reports, values: decodePhaseInput(env.BE_MIGRATION_INPUTS), signal, diagnostics });
    return;
  }
  // Public tooling was bootstrapped in an earlier secret-free step, never installed with this environment.
  diagnostics.at('configuration', 'missing-prerequisite');
  if (JSON.parse(readFileSync(resolve(cli, '../../package.json'), 'utf8')).version !== '65.4.0') throw new Error('CLI pin differs.');
  const provider = createProvider(artifact, run, schema, { github: env.GITHUB_TOKEN ?? '', vercel: env.VERCEL_TOKEN ?? '',
    bearer: env.BE_PREVIEW_ACCESS_KEY ?? '', bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '' }, signal, fetch, diagnostics);
  if (action === 'authorize') {
    await authorizeRoutineMigration({ artifact, run, schema, provider, directory: reports, diagnostics });
    return;
  }
  const reservation = schema.migration
    ? await continueRoutineMigration({ artifact, run, schema, provider, directory: reports, diagnostics }) : undefined;
  if (!schema.migration) diagnostics.trace?.event('sql.runner', 'not-run', 'unchanged-schema-zero-runner');
  const official = await officialCli(artifact, resolve(cli), env.VERCEL_TOKEN ?? '', signal, undefined, diagnostics);
  try {
    let index = 0;
    const receipt = (event: Record<string, unknown>) => {
      const fd = openSync(join(reports, `${String(index++).padStart(3, '0')}.json`), 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(event) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
      const directory = openSync(reports, 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
    };
    await deliver({ artifact, run, schema, provider, cli: official, signal, receipt, reservation, diagnostics });
  } finally {
    try { await official.dispose(); } catch (cause) { diagnostics.evidenceFailed(); throw diagnostics.capture(cause); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [bundle, transfer, cli, reports] = process.argv.slice(2);
  let isolated: ArtifactSnapshot | undefined;
  let terminal: ReleaseResult | undefined, diagnostics: ReleaseDiagnostics | undefined;
  let entryStage: 'request' | 'artifact' = 'request';
  const trace = new ChecksDiagnostics(join(process.env.RUNNER_TEMP ?? tmpdir(), 'be-release-diagnostics'),
    { scope: 'release', runId: process.env.GITHUB_RUN_ID });
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    trace.check('entry.arguments', Boolean(bundle && transfer && cli && reports && process.argv.length === 6), 'four-explicit-paths-required');
    trace.check('entry.node-version', process.versions.node === artifactTarget.node, 'pinned-node-required');
    trace.check('entry.platform', process.platform === 'linux' && process.arch === 'x64', 'linux-x64-required');
    if (!bundle || !transfer || !cli || !reports || process.argv.length !== 6 || process.versions.node !== artifactTarget.node
      || process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Exact delivery arguments/platform required.');
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(900000)]);
    // Read only the independently hashed diagnostic envelope before a later
    // ingress/credential failure. This never substitutes for execution approval.
    entryStage = 'artifact';
    const diagnosticRequest = trace.sync('request.contract-shape', () => {
      const value = withRoutineDiagnostics(trace, () => readRoutineRequest(transfer, process.env.BE_RELEASE_REQUEST_SHA256));
      releaseRequestShape(value); return value;
    });
    diagnostics = new ReleaseDiagnostics(diagnosticRequest, reports, signal, trace);
    diagnostics.load(process.env.BE_ROUTINE_ACTION === 'reconcile');
    diagnostics.at('request', 'unauthorized-context');
    const { action } = routinePhaseContext(process.env);
    diagnostics.at('artifact', 'identity-mismatch');
    // SQL-only continuation has no provider credential or authenticated-network call.
    const { artifact: selected, request } = await withRoutineDiagnostics(trace, () => trace.boundary<{ artifact: VerifiedArtifact; request: ReleaseRequest }>('delivery.authenticated-ingress', () =>
      action === 'migrate' || action === 'history'
        ? prepareRoutineDelivery({ bundle, transfer, env: process.env })
        : authenticateRoutineDelivery({ bundle, transfer, env: process.env, read: githubReader(process.env.GITHUB_TOKEN, signal, fetch, trace) })));
    if (canonical(request) !== canonical(diagnosticRequest)
      || canonical(deliveryContext(process.env, request.controller.tree)) !== canonical(request.controller)) releaseRefusal();
    isolated = await snapshotArtifact(selected);
    const executing = inventory(fileURLToPath(new URL('../../../../', import.meta.url)));
    const expectedFiles = isolated.manifest.files.filter(file => file.path.startsWith('operator/'))
      .map(file => ({ ...file, path: file.path.slice(9) }));
    const expectedDirectories = isolated.manifest.directories.filter(entry => entry.path.startsWith('operator/'))
      .map(entry => ({ ...entry, path: entry.path.slice(9) }));
    if (canonical(executing.files) !== canonical(expectedFiles) || canonical(executing.directories) !== canonical(expectedDirectories)) {
      throw new Error('Executing operator differs from the tested artifact.');
    }
    terminal = await runRoutinePhase({ artifact: isolated, request, env: process.env, cli, reports, signal, emit: false, trace });
  } catch (cause) {
    trace.event('delivery.entry', 'failed', 'entry-or-phase-refused', {}, cause);
    terminal = cause instanceof ReleaseFailure && cause.result ? cause.result : diagnostics?.failure(cause)
      ?? validateReleaseResult(routineFailureResult(entryStage, entryStage === 'artifact' ? 'identity-mismatch' : 'invalid-input'));
    process.exitCode = 1;
  } finally {
    try { await isolated?.dispose(); }
    catch {
      if (!terminal) {
        try { diagnostics?.load(true); } catch { diagnostics?.evidenceFailed(); }
        terminal = diagnostics?.failure(new ReleaseFailure('receipt', 'evidence-persistence'))
          ?? validateReleaseResult(routineFailureResult('receipt', 'evidence-persistence'));
      }
      terminal = validateReleaseResult({ ...terminal, status: 'unknown', evidence: 'unconfirmed', proof: null,
        stage: terminal.status === 'accepted' ? 'receipt' : terminal.stage,
        category: terminal.category ?? 'evidence-persistence', nextAction: 'inspect-retained-evidence' });
      process.exitCode = 1;
    }
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  }
  if (terminal) {
    let retained: ReleaseDiagnostics | undefined;
    if (terminal.request && reports) {
      try {
        retained = new ReleaseDiagnostics(terminal.request, reports, abort.signal, trace);
        retained.load(true); retained.persist(terminal);
      } catch {
        terminal = validateReleaseResult({ ...terminal, status: 'unknown', evidence: 'unconfirmed', proof: null,
          stage: terminal.status === 'accepted' ? 'receipt' : terminal.stage,
          category: terminal.category ?? 'evidence-persistence', nextAction: 'inspect-retained-evidence' });
        process.exitCode = 1;
      }
    }
    const emitted = validateReleaseResult(emitRoutineResult(terminal, process.env, trace));
    if (emitted.evidence !== terminal.evidence || emitted.nextAction !== terminal.nextAction) {
      try { retained?.persist(emitted); } catch { /* Emitted evidence is already unconfirmed. */ }
    }
  }
}
