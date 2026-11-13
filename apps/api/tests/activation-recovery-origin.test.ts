import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync, mkdirSync, readdirSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { canonical, inventory, sha256, verifyArtifact } from '../scripts/artifact.js';
import { bridgeRecovery as target } from '../scripts/activation-candidate-recovery.js';
import { activationRecoveryExecution, activationRolesSuccessor, rolesReachability } from '../scripts/activation-recovery-origin.js';
import { appendActivationEvent, createRecoveredActivationJournal, readActivationJournal, saveActivationConfigurationReceipt,
  validateActivationPacket } from '../scripts/activation-journal.js';
import type { ActivationOutcome } from '../scripts/activation-journal.js';
import { authorizeActivationPhase, confirmActivationPhase, executeActivationPhase, reconcileActivationAcknowledgement,
  reconcileActivationEffect, runRecoveredActivationEffect, runRecoveredActivationPostflight, diagnoseRecoveredRoles,
  completeRecoveredRoles, reconcileRecoveredRolesAcknowledgement, diagnoseRecoveredRolePrivileges,
  continueReachabilityBootstrap, continueReachabilityBootstrapPretransaction, continueReachabilityMigration, inspectRetainedReachabilityBootstrap, observeReachabilityBootstrapAuth } from '../scripts/activation.js';
import { recoveredActivationProvider } from '../scripts/activation-recovered-provider.js';
import { writeReleaseEvidence } from '../scripts/release-journal.js';
import { Client } from 'pg';
import type { AppRoleInputs } from '../scripts/app-roles.js';
import { AppRoleError } from '../scripts/app-roles.js';
import { activationSchema } from '../src/config/schema-transition.js';
import { migrationsDirectory, migrationStatus, runMigrations } from '../scripts/migrations.js';
import { inspectAppBootstrap, runAppOperator } from '../scripts/bootstrap-app-owner.js';
import { AuthAdmin } from '../src/app-foundation/adapters/auth-admin.js';
import { parseAppOperatorConfig } from '../src/config/config.js';
import { bootstrapIdentity } from '../src/app-foundation/application/service.js';

// These are retained nonsecret journal/receipt fixtures, never prepared inputs or auth stores.
const original = process.env.RECOVERY_ORIGIN_TEST_ORIGINAL;
const promotion = process.env.RECOVERY_ORIGIN_TEST_PROMOTION;
const options = { skip: !original || !promotion };
function fixture(t: TestContext) {
  assert.ok(original && promotion);
  const root = mkdtempSync(join(tmpdir(), 'esty-recovered-origin-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'original'), receipts = join(root, 'promotion');
  cpSync(original, source, { recursive: true }); cpSync(promotion, receipts, { recursive: true });
  const packet = validateActivationPacket(JSON.parse(readFileSync(join(source, 'packet-input.json'), 'utf8')), target.packetDigest);
  const run = { directory: join(root, `activation-recovered-${activationRecoveryExecution}`), packet, digest: target.packetDigest };
  const before = [canonical(inventory(source)), canonical(inventory(receipts))];
  const create = () => createRecoveredActivationJournal(source, receipts, run.directory, packet, run.digest, activationRecoveryExecution);
  const state = () => readActivationJournal(run.directory, packet, run.digest);
  const unchanged = () => assert.deepEqual([canonical(inventory(source)), canonical(inventory(receipts))], before);
  return { root, source, receipts, run, create, state, unchanged };
}
function providerFixture() {
  const values: Record<string, unknown> = {
    '/commits/main': { sha: 'd3d2b0788d970377c9fee9d59c52e3d1baff7de2', commit: { tree: { sha: 'ff6611ac0eb82a250d8e3b44318468cfd15e2f42' } } },
    [`/v13/deployments/${target.candidate}`]: { id: target.candidate, projectId: target.project, ownerId: target.scope,
      target: 'production', readyState: 'READY', url: target.origin.slice(8), regions: ['icn1'], meta: {
        sourceCommit: target.revision, artifactSha256: target.artifactDigest, sourceDigest: target.sourceDigest,
        activationRun: target.activationRun, activationPacket: target.packetDigest, activationPhase: 'bridge', activationConfigDigest: target.configDigest } },
    [`/v9/projects/${target.project}/domains/api.lovora.us`]: { name: 'api.lovora.us', projectId: target.project, verified: true },
    [`/v4/aliases/api.lovora.us?projectId=${target.project}`]: { alias: 'api.lovora.us', projectId: target.project, deploymentId: target.candidate },
    [`/deployments/${target.journal}`]: { id: target.journal, environment: 'be-production', task: 'deploy:esty-be-ci', payload: {
      run: target.workflowRun, activationRun: target.activationRun, activationPacket: target.packetDigest,
      artifact: target.artifactDigest, project: target.project, sourceDigest: target.sourceDigest } },
  };
  const log_url = `https://github.com/khuonghuyhieu/esty-admin/actions/runs/${target.workflowRun}`;
  const statusPath = `/deployments/${target.journal}/statuses?per_page=100`;
  values[statusPath] = [{ state: 'in_progress', description: `ack:${target.candidate}`, log_url }];
  const writes: string[] = [];
  let loseAck = false;
  const read = async (path: string) => { assert.ok(Object.hasOwn(values, path), `Unexpected transport path ${path}`); return structuredClone(values[path]); };
  const provider = recoveredActivationProvider({ digest: sha256('synthetic-executable'), verify() { return {}; } }, AbortSignal.timeout(60000),
    { github: read, vercel: read, async promote() { throw new Error('Bridge promotion is forbidden'); } },
    async (_journal, state, description) => {
      writes.push(description); values[statusPath] = [{ state, description, log_url }];
      if (loseAck) throw new Error('Synthetic lost acknowledgement');
    });
  return { provider, values, writes, statusPath, loseAck(value: boolean) { loseAck = value; } };
}
const committed: ActivationOutcome = { result: 'confirmed', databaseOutcome: 'committed', count: 2, deploymentId: null, reportDigest: sha256('synthetic-roles') };

test('recovered origin adopts the exact promoted bridge at roles without rewriting historical UNKNOWN', options, t => {
  const f = fixture(t); f.create();
  assert.equal(f.state().next, 'roles'); assert.equal(f.state().events.length, 0);
  assert.equal(f.state().head, f.state().recovery?.originDigest);
  assert.equal(f.state().recovery?.bridgeId, target.candidate);
  // An ordinary copied journal must still fail its inode-bound lock; only the recovery importer can adopt it.
  assert.throws(() => readActivationJournal(f.source, f.run.packet, f.run.digest));
  assert.throws(f.create);
  assert.throws(() => createRecoveredActivationJournal(f.source, f.receipts, join(f.root, 'second'), f.run.packet, f.run.digest, activationRecoveryExecution));
  for (const phase of ['bridge-config', 'bridge', 'migration'] as const) assert.throws(() => appendActivationEvent(f.run.directory, f.run.packet, f.run.digest, phase, 'intent', { outcome: 'unknown' }));
  f.unchanged();
});

test('origin and recovery evidence drift fences every subsequent journal operation', options, async t => {
  for (const kind of ['original', 'receipt', 'extra-receipt', 'origin', 'initial', 'lock', 'relocated'] as const) await t.test(kind, sub => {
    const f = fixture(sub); f.create();
    if (kind === 'original') writeFileSync(join(f.source, 'activation', f.run.packet.runId, '010.json'), '{}');
    if (kind === 'receipt') writeFileSync(join(f.receipts, 'promotion-result.json'), '{}');
    if (kind === 'extra-receipt') writeFileSync(join(f.receipts, 'unapproved.json'), '{}');
    if (kind === 'origin') writeFileSync(join(f.run.directory, 'activation', f.run.packet.runId, 'recovery-origin.json'), '{}');
    if (kind === 'initial') writeFileSync(join(f.run.directory, `${f.run.packet.runId}.initial.json`), '{}');
    if (kind === 'lock') writeFileSync(join(f.run.directory, 'operator.lock'), '{}');
    if (kind === 'relocated') {
      const moved = join(f.root, 'relocated'); cpSync(f.run.directory, moved, { recursive: true });
      assert.throws(() => readActivationJournal(moved, f.run.packet, f.run.digest)); return;
    }
    assert.throws(f.state);
    assert.throws(() => appendActivationEvent(f.run.directory, f.run.packet, f.run.digest, 'roles', 'intent', { outcome: 'unknown' }));
  });
});

test('recovered roles effects are one-shot; lost provider ACK is reconciled without another write', options, async t => {
  const f = fixture(t), p = providerFixture(); f.create(); p.loseAck(true);
  await assert.rejects(authorizeActivationPhase(f.run, 'roles', p.provider));
  let effects = 0;
  await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { effects++; return committed; }));
  assert.equal(effects, 0); assert.equal(f.state().events.at(-1)?.kind, 'intent');
  p.loseAck(false); await reconcileActivationAcknowledgement(f.run, 'roles', p.provider);
  await executeActivationPhase(f.run, 'roles', async () => { effects++; return committed; });
  await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { effects++; return committed; }));
  p.loseAck(true); await assert.rejects(confirmActivationPhase(f.run, 'roles', p.provider));
  p.loseAck(false); await reconcileActivationAcknowledgement(f.run, 'roles', p.provider);
  assert.equal(f.state().next, 'migration'); assert.equal(effects, 1); assert.equal(p.writes.length, 2); f.unchanged();
});

test('unknown private outcome never reruns a phase and requires read-only reconciliation', options, async t => {
  const f = fixture(t), p = providerFixture(); f.create(); await authorizeActivationPhase(f.run, 'roles', p.provider);
  let effects = 0;
  await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { effects++; throw new Error('Synthetic unconfirmed commit'); }));
  await assert.rejects(confirmActivationPhase(f.run, 'roles', p.provider));
  await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { effects++; return committed; }));
  assert.equal(f.state().next, 'roles'); assert.equal(effects, 1);
  await reconcileActivationEffect(f.run, 'roles', async () => committed);
  await confirmActivationPhase(f.run, 'roles', p.provider);
  assert.equal(f.state().next, 'migration'); f.unchanged();
});

test('roles migration bootstrap and app-config remain ordered; strict app is not mistaken for another bridge', options, async t => {
  const f = fixture(t), p = providerFixture(); f.create();
  for (const phase of ['roles', 'migration', 'bootstrap', 'app-config'] as const) {
    await authorizeActivationPhase(f.run, phase, p.provider);
    await executeActivationPhase(f.run, phase, async () => {
      if (phase !== 'app-config') return { ...committed, count: phase === 'bootstrap' ? 1 : 2 };
      const packet = f.run.packet;
      return saveActivationConfigurationReceipt(f.run.directory, packet, f.run.digest, phase, {
        version: 2, runId: packet.runId, phase, projectId: packet.projectId, scopeId: packet.scopeId, packetDigest: f.run.digest,
        revision: packet.revision, tree: packet.tree, sourceDigest: packet.sourceDigest, artifactDigest: packet.artifactDigest,
        configDigest: packet.appConfigDigest, metadataDigest: sha256('synthetic-config'), count: 1, valueProof: 'pending-candidate-runtime' });
    });
    if (phase === 'migration') {
      await assert.rejects(confirmActivationPhase(f.run, phase, p.provider));
      const started = f.state().events.find(event => event.phase === phase && event.kind === 'started')!;
      writeReleaseEvidence(join(f.run.directory, `${f.run.packet.runId}.postflight.json`), {
        version: 1, packetDigest: f.run.digest, inputDigest: f.run.packet.roleInputDigest, startedHash: started.sha256,
        history: f.run.packet.migrations.map(item => item.name), roles: 'target-confirmed' });
    }
    await confirmActivationPhase(f.run, phase, p.provider);
  }
  assert.equal(f.state().next, 'app');
  const append = (kind: 'intent' | 'authorized' | 'started' | 'acknowledged', value: object) => appendActivationEvent(f.run.directory, f.run.packet, f.run.digest, 'app', kind, value);
  const intent = append('intent', { outcome: 'unknown' }); append('authorized', { intentHash: intent.head }); append('started', { outcome: 'unknown' });
  assert.throws(() => append('acknowledged', { deploymentId: target.candidate }));
  append('acknowledged', { deploymentId: 'dpl_syntheticStrictApp' });
  assert.equal(f.state().events.at(-1)?.kind, 'acknowledged'); f.unchanged();
});

test('recovered provider refuses drifted main, alias, metadata, exclusion and out-of-scope writes', async t => {
  for (const kind of ['main', 'alias', 'metadata', 'exclusion', 'bridge-write', 'wrong-journal'] as const) await t.test(kind, async () => {
    const p = providerFixture();
    if (kind === 'main') { p.values['/commits/main'] = { sha: target.revision }; await assert.rejects(p.provider.currentMain()); }
    if (kind === 'alias') { p.values[`/v4/aliases/api.lovora.us?projectId=${target.project}`] = { deploymentId: target.predecessor }; await assert.rejects(p.provider.binding(target.candidate)); }
    if (kind === 'metadata') { p.values[`/v13/deployments/${target.candidate}`] = { id: target.candidate }; await assert.rejects(p.provider.binding(target.candidate)); }
    if (kind === 'exclusion') { p.values[p.statusPath] = [{ state: 'success' }]; await assert.rejects(p.provider.confirmJournal(target.journal, 'in_progress', `ack:${target.candidate}`)); }
    if (kind === 'bridge-write') await assert.rejects(p.provider.record(target.journal, 'in_progress', `activation:bridge:intent:${sha256('x')}`));
    if (kind === 'wrong-journal') await assert.rejects(p.provider.record(1, 'in_progress', `activation:roles:intent:${sha256('x')}`));
    assert.equal(p.writes.length, 0);
  });
});

test('private recovered workers refuse before credentials when a phase is not durably started', options, async t => {
  const f = fixture(t), p = providerFixture(); f.create();
  let reads = 0;
  const inputs = new Proxy({}, { ownKeys() { reads++; throw new Error('Credentials must not be read'); } });
  for (const phase of ['roles', 'migration', 'bootstrap', 'app-config', 'bridge', 'app'] as const) {
    await assert.rejects(runRecoveredActivationEffect(f.run, phase, undefined as never, inputs, AbortSignal.timeout(5000)));
  }
  await authorizeActivationPhase(f.run, 'roles', p.provider);
  await assert.rejects(runRecoveredActivationEffect(f.run, 'roles', undefined as never, inputs, AbortSignal.timeout(5000)));
  await assert.rejects(runRecoveredActivationPostflight(f.run, undefined as never, inputs, AbortSignal.timeout(5000)));
  assert.equal(reads, 0); assert.equal(f.state().events.at(-1)?.kind, 'authorized'); f.unchanged();
});

test('recovered roles diagnostic binds the UNKNOWN head and reconciles only exact committed inspection', options, async t => {
  for (const scenario of ['head', 'input-stage', 'absent', 'partial', 'committed', 'lost-write-ack', 'lost-read-ack',
    'state-drift', 'provider-drift', 'late-provider-drift'] as const) await t.test(scenario, async sub => {
    const f = fixture(sub), p = providerFixture(); f.create();
    await authorizeActivationPhase(f.run, 'roles', p.provider);
    await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { throw new Error('Synthetic unresolved execution'); }));
    const head = f.state().head, retained = f.state().events.map(event => event.sha256);
    const retainedBytes = f.state().events.map((_, index) => readFileSync(join(f.run.directory, 'activation',
      f.run.packet.runId, `${String(index).padStart(3, '0')}.json`)));
    if (scenario === 'lost-write-ack') p.loseAck(true);
    let loseReadAck = scenario === 'lost-read-ack';
    const confirm = p.provider.confirmJournal.bind(p.provider);
    sub.mock.method(p.provider, 'confirmJournal', async (...[journal, state, description]: Parameters<typeof confirm>) => {
      if (loseReadAck && description.startsWith('activation:roles:outcome:')) throw new Error('Synthetic lost read ACK');
      await confirm(journal, state, description);
    });
    const config = { user: 'postgres', database: 'postgres', password: 'private-sentinel' };
    const inputs: AppRoleInputs = { authority: config, runtime: { ...config, user: 'app_runtime' },
      operator: { ...config, user: 'app_operator' }, approvalId: f.run.packet.runId, target: f.run.packet.target };
    let preparations = 0, connections = 0, disposed = 0;
    sub.mock.method(Client.prototype, 'connect', async () => { connections++; });
    sub.mock.method(Client.prototype, 'end', async () => {});
    sub.mock.method(Client.prototype, 'query', async function(this: Client, text: string) {
      assert.match(text, /^(SELECT |BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/);
      let rows: unknown[] = [];
      if (text.startsWith('SELECT current_user')) {
        rows = [{ name: this.user, database: 'postgres', read_only: 'on' }];
        if (this.user === 'app_operator' && scenario === 'state-drift') {
          writeFileSync(join(f.receipts, 'extra.json'), '{}');
        }
        if (this.user === 'app_operator' && scenario === 'late-provider-drift') p.values[p.statusPath] = [{ state: 'success' }];
      } else if (text.startsWith('SELECT name FROM')) rows = activationSchema.oldNames.map(name => ({ name }));
      else if (text.startsWith('SELECT rolname')) rows = (scenario === 'absent' ? [] : scenario === 'partial' ? ['app_runtime'] : ['app_operator', 'app_runtime'])
        .map(rolname => ({ rolname, rolcanlogin: true, rolinherit: false, rolsuper: false, rolcreatedb: false,
          rolcreaterole: false, rolreplication: false, rolbypassrls: false, unlimited_validity: true }));
      else if (text.startsWith('SELECT has_database_privilege')) rows = [{ can_create: false, is_owner: false }];
      return { rows, rowCount: rows.length };
    });
    if (scenario === 'provider-drift') p.values[p.statusPath] = [{ state: 'success' }];
    const result = await diagnoseRecoveredRoles(f.run, scenario === 'head' ? sha256('wrong-head') : head, p.provider, observe => {
      preparations++;
      if (scenario === 'input-stage') { observe('role-validation'); throw new Error('private-sentinel'); }
      return { inputs, dispose() { disposed++; } };
    }, AbortSignal.timeout(10000));
    assert.doesNotMatch(JSON.stringify(result), /private-sentinel/);
    const committedInspection = ['committed', 'lost-write-ack', 'lost-read-ack'].includes(scenario);
    assert.equal(p.writes.length, committedInspection ? 2 : 1);
    if (committedInspection) {
      assert.equal(connections, 3); assert.equal(preparations, 1);
      if (scenario !== 'committed') {
        assert.deepEqual(result, { stage: 'reconciliation', category: 'refused', roles: 'unavailable', reconciled: false });
        assert.equal(f.state().next, 'roles'); assert.equal(f.state().events.length, 6);
        assert.equal(f.state().events.at(-1)?.kind, 'confirming');
        const pendingHead = f.state().head, expectedStatus = p.values[p.statusPath];
        await assert.rejects(authorizeActivationPhase(f.run, 'migration', p.provider));
        await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { assert.fail('No role replay'); }));
        const pendingReplay = await diagnoseRecoveredRoles(f.run, head, p.provider,
          () => { assert.fail('No repeated input preparation'); }, AbortSignal.timeout(5000));
        assert.equal(pendingReplay.stage, 'guard'); assert.equal(pendingReplay.reconciled, false);
        loseReadAck = false; p.loseAck(false);
        p.values[p.statusPath] = [{ state: 'success' }];
        await assert.rejects(reconcileActivationAcknowledgement(f.run, 'roles', p.provider));
        assert.equal(f.state().head, pendingHead); assert.equal(f.state().next, 'roles');
        p.values[p.statusPath] = expectedStatus;
        await reconcileActivationAcknowledgement(f.run, 'roles', p.provider);
        assert.equal(connections, 3); assert.equal(preparations, 1); assert.equal(p.writes.length, 2);
      } else assert.deepEqual(result, { stage: 'complete', category: 'passed', roles: 'committed', reconciled: true });
      assert.equal(f.state().events.length, 7); assert.equal(f.state().next, 'migration');
      assert.deepEqual(f.state().events.slice(4).map(event => event.kind), ['reconciled', 'confirming', 'remote-confirmed']);
      assert.deepEqual(f.state().events.slice(0, 4).map(event => event.sha256), retained);
      assert.deepEqual(retainedBytes.map((_, index) => readFileSync(join(f.run.directory, 'activation',
        f.run.packet.runId, `${String(index).padStart(3, '0')}.json`))), retainedBytes);
      const replay = await diagnoseRecoveredRoles(f.run, head, p.provider, () => { throw new Error('Must not read inputs'); }, AbortSignal.timeout(5000));
      assert.equal(replay.stage, 'guard'); assert.equal(replay.reconciled, false);
    } else {
      assert.equal(result.reconciled, false);
      if (scenario === 'state-drift') { assert.equal(result.stage, 'guard'); assert.throws(f.state); }
      else { assert.equal(f.state().head, head); assert.equal(f.state().events.length, 4); assert.equal(f.state().next, 'roles'); }
      if (scenario === 'absent') assert.equal(result.roles, 'absent');
      if (scenario === 'partial') assert.equal(result.roles, 'partial_or_unexpected');
      if (scenario === 'input-stage') assert.equal(result.stage, 'role-validation');
    }
    if (scenario === 'head' || scenario === 'provider-drift') assert.equal(preparations, 0);
    if (['head', 'provider-drift', 'input-stage'].includes(scenario)) assert.equal(connections, 0);
    else assert.equal(disposed, 1);
    if (scenario !== 'state-drift') f.unchanged();
  });
});

test('bounded roles successor requires fresh absence and exact exclusion before the corrected one-shot effect',
  { skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT }, async t => {
    const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
    for (const scenario of ['success', 'head', 'assets', 'provider-drift', 'late-provider-drift', 'present',
      'presence-race', 'create-denied', 'credential-denied', 'lost-intent-ack', 'lost-outcome-ack'] as const) await t.test(scenario, async sub => {
      const f = fixture(sub), p = providerFixture(); f.create();
      await authorizeActivationPhase(f.run, 'roles', p.provider);
      await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { throw new Error('Synthetic UNKNOWN'); }));
      const head = f.state().head, retained = canonical(inventory(f.run.directory));
      const successor = { ...f.run, directory: join(f.root, `activation-recovered-${activationRolesSuccessor}`) };
      const successorState = () => readActivationJournal(successor.directory, successor.packet, successor.digest);
      let present = scenario === 'present' ? 2 : 0, committed = false, readWrite = false;
      let connections = 0, preparations = 0, disposals = 0, creates = 0, queries = 0;
      const flags = () => ['app_operator', 'app_runtime'].slice(0, present).map(rolname => ({ rolname,
        rolcanlogin: true, rolinherit: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false,
        rolreplication: false, rolbypassrls: false, unlimited_validity: true }));
      sub.mock.method(Client.prototype, 'connect', async function(this: Client) {
        connections++;
        if (scenario === 'credential-denied' && committed && this.user === 'app_runtime') {
          throw Object.assign(new Error('private-sentinel'), { code: '28P01' });
        }
      });
      sub.mock.method(Client.prototype, 'end', async () => {});
      sub.mock.method(Client.prototype, 'query', async function(this: Client, text: string) {
        queries++;
        assert.match(text, /^(SELECT |BEGIN|ROLLBACK$|COMMIT$|SET LOCAL |CREATE ROLE app_(runtime|operator) )/);
        let rows: unknown[] = [];
        if (text === 'BEGIN') readWrite = true;
        else if (text.startsWith('SELECT current_user')) rows = [{ name: this.user, database: 'postgres', read_only: 'on' }];
        else if (text.startsWith('SELECT to_regclass')) rows = [{ present: true }];
        else if (text.startsWith('SELECT name FROM')) rows = activationSchema.oldNames.map(name => ({ name }));
        else if (text.startsWith('SELECT rolname')) {
          if (readWrite && scenario === 'presence-race') present = 2;
          rows = flags();
        } else if (text.startsWith('SELECT has_database_privilege')) rows = [{ can_create: false, is_owner: false }];
        else if (text.startsWith('CREATE ROLE ')) {
          creates++;
          if (scenario === 'create-denied') throw Object.assign(new Error('private-sentinel'), { code: '42501' });
          present++;
        } else if (text === 'COMMIT' && readWrite) { committed = true; readWrite = false; }
        else if (text === 'ROLLBACK') {
          if (readWrite && !committed) present = 0;
          readWrite = false;
          if (scenario === 'late-provider-drift') p.values[p.statusPath] = [{ state: 'success' }];
          if (scenario === 'lost-outcome-ack' && committed) p.loseAck(true);
        }
        return { rows, rowCount: rows.length };
      });
      if (scenario === 'provider-drift') p.values[p.statusPath] = [{ state: 'success' }];
      if (scenario === 'lost-intent-ack') p.loseAck(true);
      const config = { user: 'postgres', database: 'postgres', password: 'private-sentinel' };
      const result = await completeRecoveredRoles(f.run, scenario === 'head' ? sha256('wrong-head') : head,
        scenario === 'assets' ? { ...artifact, digest: sha256('wrong-artifact') } : artifact, p.provider, () => {
          preparations++;
          return { inputs: { authority: { ...config }, runtime: { ...config, user: 'app_runtime' },
            operator: { ...config, user: 'app_operator' }, approvalId: f.run.packet.runId, target: f.run.packet.target },
          dispose() { disposals++; } };
        }, AbortSignal.timeout(30000));
      assert.doesNotMatch(JSON.stringify(result), /private-sentinel/);
      assert.equal(canonical(inventory(f.run.directory)), retained);
      f.unchanged();
      const completed = scenario === 'success' || scenario === 'lost-outcome-ack';
      if (completed) {
        if (scenario === 'lost-outcome-ack') {
          assert.equal(result.status, 'STOP'); assert.equal(result.stage, 'confirmation');
          assert.equal(successorState().next, 'roles'); assert.equal(successorState().events.at(-1)?.kind, 'confirming');
          const beforeQueries = queries, beforeConnections = connections, beforeWrites = p.writes.length;
          const exactStatus = p.values[p.statusPath];
          p.values[p.statusPath] = [{ state: 'success' }];
          assert.equal((await reconcileRecoveredRolesAcknowledgement(f.run, head, p.provider, AbortSignal.timeout(5000))).status, 'STOP');
          assert.equal(successorState().next, 'roles');
          p.values[p.statusPath] = exactStatus;
          const recovered = await reconcileRecoveredRolesAcknowledgement(f.run, head, p.provider, AbortSignal.timeout(5000));
          assert.equal(recovered.status, 'ROLES_COMPLETE');
          assert.equal(queries, beforeQueries); assert.equal(connections, beforeConnections); assert.equal(p.writes.length, beforeWrites);
        } else assert.deepEqual(result, { status: 'ROLES_COMPLETE', stage: 'complete', category: 'passed', sqlstate: null, roles: 'committed' });
        assert.equal(creates, 2); assert.equal(successorState().next, 'migration');
        assert.deepEqual(successorState().events.map(event => event.kind),
          ['intent', 'authorized', 'started', 'outcome', 'confirming', 'remote-confirmed']);
        assert.equal(successorState().events.filter(event => event.phase !== 'roles').length, 0);
        const connectionsBeforeReplay = connections;
        const replay = await completeRecoveredRoles(f.run, head, artifact, p.provider,
          () => assert.fail('No repeated prepared input'), AbortSignal.timeout(5000));
        assert.equal(replay.status, 'STOP'); assert.equal(replay.stage, 'guard'); assert.equal(connections, connectionsBeforeReplay);
        writeFileSync(join(f.run.directory, 'activation', f.run.packet.runId, '003.json'), '{}');
        assert.throws(successorState);
      } else {
        assert.equal(result.status, 'STOP');
        if (['head', 'assets', 'provider-drift', 'late-provider-drift', 'present'].includes(scenario)) {
          assert.equal(existsSync(successor.directory), false); assert.equal(creates, 0); assert.equal(p.writes.length, 1);
        } else {
          assert.equal(successorState().next, 'roles');
          assert.equal(successorState().events.some(event => event.kind === 'remote-confirmed'), false);
          if (scenario === 'lost-intent-ack') { assert.equal(successorState().events.length, 1); assert.equal(creates, 0); }
          if (scenario === 'presence-race') { assert.equal(creates, 0); assert.equal(result.stage, 'roles'); }
          if (scenario === 'create-denied') {
            assert.equal(creates, 1); assert.equal(result.stage, 'create'); assert.equal(result.sqlstate, '42501');
            assert.equal((successorState().events.at(-1)?.value as ActivationOutcome).databaseOutcome, 'rolled_back');
          }
          if (scenario === 'credential-denied') {
            assert.equal(creates, 2); assert.equal(result.stage, 'credentials'); assert.equal(result.sqlstate, '28P01');
            assert.equal(result.category, 'authentication_error');
            assert.equal((successorState().events.at(-1)?.value as ActivationOutcome).databaseOutcome, 'committed');
          }
        }
      }
      if (['head', 'assets', 'provider-drift'].includes(scenario)) { assert.equal(preparations, 0); assert.equal(connections, 0); }
      else { assert.equal(preparations, 1); assert.equal(disposals, 1); }
    });
  });

test('privilege baseline observation fences both retained executions and never advances either journal', options, async t => {
  for (const scenario of ['baseline', 'old-head', 'failed-head', 'provider-before', 'provider-after', 'journal-after'] as const) await t.test(scenario, async sub => {
    const f = fixture(sub), p = providerFixture(); f.create();
    await authorizeActivationPhase(f.run, 'roles', p.provider);
    await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { throw new Error('Synthetic UNKNOWN'); }));
    const oldHead = f.state().head;
    const successor = { ...f.run, directory: join(f.root, `activation-recovered-${activationRolesSuccessor}`) };
    createRecoveredActivationJournal(f.source, f.receipts, successor.directory, f.run.packet, f.run.digest, activationRolesSuccessor, oldHead);
    await authorizeActivationPhase(successor, 'roles', p.provider);
    await assert.rejects(executeActivationPhase(successor, 'roles', async () => { throw new AppRoleError('rolled_back'); }));
    const failedHead = readActivationJournal(successor.directory, f.run.packet, f.run.digest).head;
    const retained = [canonical(inventory(f.run.directory)), canonical(inventory(successor.directory))];
    let connections = 0, preparations = 0, disposals = 0;
    sub.mock.method(Client.prototype, 'connect', async () => { connections++; });
    sub.mock.method(Client.prototype, 'end', async () => {});
    sub.mock.method(Client.prototype, 'query', async (text: string) => {
      assert.match(text, /^(SELECT |WITH namespaces AS|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/);
      let rows: unknown[] = [];
      if (text.startsWith('SELECT current_user')) rows = [{ name: 'postgres', database: 'postgres', read_only: 'on' }];
      else if (text.startsWith('SELECT name')) rows = activationSchema.oldNames.map(name => ({ name }));
      else if (text.startsWith('SELECT to_regrole')) rows = [{ roles_absent: true }];
      else if (text.startsWith('WITH namespaces')) {
        rows = [{ predicate: 'public_schema_create', scope: 'public', schema_usage: true }];
        if (scenario === 'provider-after') p.values[p.statusPath] = [{ state: 'success' }];
        if (scenario === 'journal-after') writeFileSync(join(successor.directory, 'activation', f.run.packet.runId, '003.json'), '{}');
      }
      return { rows, rowCount: rows.length };
    });
    if (scenario === 'provider-before') p.values[p.statusPath] = [{ state: 'success' }];
    const result = await diagnoseRecoveredRolePrivileges(f.run, scenario === 'old-head' ? sha256('wrong') : oldHead,
      scenario === 'failed-head' ? sha256('wrong') : failedHead, p.provider, () => {
        preparations++;
        return { inputs: { authority: { user: 'postgres', database: 'postgres', password: 'private-sentinel' },
          runtime: {}, operator: {}, approvalId: f.run.packet.runId, target: f.run.packet.target }, dispose() { disposals++; } };
      }, AbortSignal.timeout(10000));
    assert.equal(result.historicalPredicate, 'unresolved'); assert.doesNotMatch(JSON.stringify(result), /private-sentinel/);
    assert.equal(p.writes.length, 2); assert.equal(canonical(inventory(f.run.directory)), retained[0]);
    if (scenario !== 'journal-after') assert.equal(canonical(inventory(successor.directory)), retained[1]);
    f.unchanged();
    if (scenario === 'baseline') {
      assert.equal(result.category, 'passed');
      assert.deepEqual(result.observations, [{ predicate: 'public_schema_create', scope: 'public', schemaUsage: true, kind: 'guard-conflict' }]);
    } else { assert.equal(result.category, 'refused'); assert.deepEqual(result.observations, []); }
    if (['old-head', 'failed-head', 'provider-before'].includes(scenario)) {
      assert.equal(preparations, 0); assert.equal(connections, 0);
    } else { assert.equal(preparations, 1); assert.equal(connections, 1); assert.equal(disposals, 1); }
  });
});

test('reachability successor preserves both predecessors and fences replay mismatch concurrency and ACK loss',
  { skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT }, async t => {
    const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
    for (const scenario of ['success', 'head', 'packet', 'partial', 'unknown', 'not-started', 'committed',
      'correction-drift', 'present', 'presence-partial', 'provider-drift', 'late-provider-drift',
      'existing-partial', 'concurrent', 'lost-intent-ack', 'lost-outcome-ack'] as const) await t.test(scenario, async sub => {
      const f = fixture(sub), p = providerFixture(); f.create();
      await authorizeActivationPhase(f.run, 'roles', p.provider);
      await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { throw new Error('Synthetic UNKNOWN'); }));
      const originalHead = f.state().head;
      const failed = { ...f.run, directory: join(f.root, `activation-recovered-${activationRolesSuccessor}`) };
      createRecoveredActivationJournal(f.source, f.receipts, failed.directory, failed.packet, failed.digest,
        activationRolesSuccessor, originalHead);
      await authorizeActivationPhase(failed, 'roles', p.provider);
      if (scenario !== 'partial') {
        if (scenario === 'committed') await executeActivationPhase(failed, 'roles', async () => committed);
        else await assert.rejects(executeActivationPhase(failed, 'roles', async () => {
          throw new AppRoleError(scenario === 'unknown' ? 'unknown' : scenario === 'not-started' ? 'not_started' : 'rolled_back');
        }));
      }
      const failedState = () => readActivationJournal(failed.directory, failed.packet, failed.digest);
      const head = failedState().head, retained = [canonical(inventory(f.run.directory)), canonical(inventory(failed.directory))];
      const successor = { ...failed, directory: join(f.root, `activation-recovered-${rolesReachability.executionId}`) };
      const successorState = () => readActivationJournal(successor.directory, successor.packet, successor.digest);
      let present = scenario === 'present' ? 2 : scenario === 'presence-partial' ? 1 : 0;
      let committedRoles = false, creates = 0, connections = 0, preparations = 0, queries = 0;
      const writing = new WeakSet<Client>();
      sub.mock.method(Client.prototype, 'connect', async () => { connections++; });
      sub.mock.method(Client.prototype, 'end', async () => {});
      sub.mock.method(Client.prototype, 'query', async function(this: Client, text: string) {
        queries++;
        assert.match(text, /^(SELECT |BEGIN|ROLLBACK$|COMMIT$|SET LOCAL |CREATE ROLE app_(runtime|operator) )/);
        let rows: unknown[] = [];
        if (text === 'BEGIN') writing.add(this);
        else if (text.startsWith('SELECT current_user')) rows = [{ name: this.user, database: 'postgres', read_only: 'on' }];
        else if (text.startsWith('SELECT to_regclass')) rows = [{ present: true }];
        else if (text.startsWith('SELECT name FROM')) rows = activationSchema.oldNames.map(name => ({ name }));
        else if (text.startsWith('SELECT rolname')) rows = ['app_operator', 'app_runtime'].slice(0, present).map(rolname => ({
          rolname, rolcanlogin: true, rolinherit: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false,
          rolreplication: false, rolbypassrls: false, unlimited_validity: true }));
        else if (text.startsWith('SELECT has_database_privilege')) rows = [{ can_create: false, is_owner: false }];
        else if (text.startsWith('CREATE ROLE ')) { creates++; present++; }
        else if (text === 'COMMIT' && writing.has(this)) {
          committedRoles = true; writing.delete(this);
          if (scenario === 'lost-outcome-ack') p.loseAck(true);
        } else if (text === 'ROLLBACK') {
          if (writing.has(this) && !committedRoles) present = 0;
          writing.delete(this);
          if (scenario === 'late-provider-drift') p.values[p.statusPath] = [{ state: 'success' }];
        }
        return { rows, rowCount: rows.length };
      });
      const writesBefore = p.writes.length;
      if (scenario === 'provider-drift') p.values[p.statusPath] = [{ state: 'success' }];
      if (scenario === 'lost-intent-ack') p.loseAck(true);
      if (scenario === 'existing-partial') fs.mkdirSync(successor.directory, { mode: 0o700 });
      const nativeRead = fs.readFileSync;
      const drift = scenario === 'correction-drift' ? sub.mock.method(fs, 'readFileSync',
        (...args: Parameters<typeof fs.readFileSync>) => {
          if (args[0] instanceof URL && args[0].pathname.endsWith('/scripts/app-roles.js')) return Buffer.from('unapproved-correction');
          return Reflect.apply(nativeRead, fs, args);
        }) : undefined;
      if (drift) syncBuiltinESMExports();
      const prepare = () => {
        preparations++;
        const config = { user: 'postgres', database: 'postgres', password: 'synthetic-private-sentinel' };
        return { inputs: { authority: { ...config }, runtime: { ...config, user: 'app_runtime' },
          operator: { ...config, user: 'app_operator' }, approvalId: failed.packet.runId, target: failed.packet.target },
        dispose() {} };
      };
      const selected = scenario === 'packet' ? { ...failed, packet: { ...failed.packet, roleInputDigest: sha256('wrong-envelope') } } : failed;
      const invoke = () => completeRecoveredRoles(selected, scenario === 'head' ? sha256('wrong-head') : head,
        artifact, p.provider, prepare, AbortSignal.timeout(30000));
      let results;
      try { results = scenario === 'concurrent' ? await Promise.all([invoke(), invoke()]) : [await invoke()]; }
      finally { if (drift) { drift.mock.restore(); syncBuiltinESMExports(); } }
      assert.doesNotMatch(JSON.stringify(results), /synthetic-private-sentinel/);
      assert.deepEqual([canonical(inventory(f.run.directory)), canonical(inventory(failed.directory))], retained);
      f.unchanged();
      if (['success', 'concurrent', 'lost-outcome-ack'].includes(scenario)) {
        if (scenario === 'lost-outcome-ack') {
          assert.equal(results[0]!.status, 'STOP'); assert.equal(results[0]!.stage, 'confirmation');
          assert.equal(successorState().events.at(-1)?.kind, 'confirming');
          const before = [queries, connections, creates, p.writes.length];
          assert.equal((await reconcileRecoveredRolesAcknowledgement(failed, head, p.provider, AbortSignal.timeout(10000))).status, 'ROLES_COMPLETE');
          assert.deepEqual([queries, connections, creates, p.writes.length], before);
        } else {
          assert.equal(results.filter(result => result.status === 'ROLES_COMPLETE').length, 1);
          if (scenario === 'concurrent') assert.equal(results.filter(result => result.status === 'STOP').length, 1);
        }
        assert.equal(creates, 2); assert.equal(successorState().next, 'migration');
        assert.deepEqual(successorState().events.map(event => event.kind),
          ['intent', 'authorized', 'started', 'outcome', 'confirming', 'remote-confirmed']);
        assert.equal(successorState().events.every(event => event.phase === 'roles'), true);
        const originPath = join(successor.directory, 'activation', failed.packet.runId, 'recovery-origin.json');
        const origin = JSON.parse(readFileSync(originPath, 'utf8'));
        assert.equal(origin.rolesPredecessor.executionId, activationRolesSuccessor);
        assert.equal(origin.rolesPredecessor.head, head);
        assert.equal(origin.rolesPredecessor.cause, 'schema-usage-reachability');
        assert.deepEqual(origin.rolesPredecessor.correction, rolesReachability.correction);
        const before = [queries, connections, creates, p.writes.length, preparations];
        assert.equal((await invoke()).status, 'STOP');
        assert.equal((await completeRecoveredRoles(successor, successorState().head, artifact, p.provider,
          () => assert.fail('No second successor'), AbortSignal.timeout(10000))).status, 'STOP');
        assert.deepEqual([queries, connections, creates, p.writes.length, preparations], before);
        assert.deepEqual([canonical(inventory(f.run.directory)), canonical(inventory(failed.directory))], retained);
        origin.rolesPredecessor.correction.sourceSha256 = sha256('wrong-source');
        writeFileSync(originPath, JSON.stringify(origin)); assert.throws(successorState);
      } else {
        assert.equal(results[0]!.status, 'STOP'); assert.equal(creates, 0);
        if (scenario === 'lost-intent-ack') {
          assert.deepEqual(successorState().events.map(event => event.kind), ['intent']);
          const before = [connections, preparations, p.writes.length];
          assert.equal((await invoke()).status, 'STOP');
          assert.deepEqual([connections, preparations, p.writes.length], before);
        } else {
          assert.equal(existsSync(successor.directory), scenario === 'existing-partial');
          assert.equal(p.writes.length, writesBefore);
        }
        if (['head', 'packet', 'partial', 'unknown', 'not-started', 'committed', 'correction-drift', 'provider-drift', 'existing-partial'].includes(scenario)) {
          assert.equal(preparations, 0); assert.equal(connections, 0);
        }
      }
    });
  });

for (const phase of ['migration', 'bootstrap', 'bootstrap-names']) test(`fixed675 ${phase} uses native OLD to TARGET and bounded no-op with truthful failure fences`, {
  skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT || !process.env.MIGRATION_POSTGRES_BIN,
  timeout: 360000,
}, async t => {
  const bin = process.env.MIGRATION_POSTGRES_BIN!, root = mkdtempSync(join(realpathSync('/tmp'), 'esty-migration-'));
  const data = join(root, 'data'), env = { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, LC_ALL: 'C' };
  const command = (name: string, args: string[]) => {
    const result = spawnSync(join(bin, name), args, { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `Owned PostgreSQL ${name} failed; output withheld.`);
    return result.stdout;
  };
  let started = false, admin: Client | undefined;
  t.after(async () => {
    try { await admin?.end(); } finally {
      if (started) command('pg_ctl', ['-D', data, '-w', '-t', '10', '-m', 'fast', 'stop']);
      rmSync(root, { recursive: true, force: true });
    }
  });
  assert.match(command('postgres', ['--version']), /^postgres \(PostgreSQL\) 17\./);
  command('initdb', ['-D', data, '--username=fixture', '--auth=trust', '--no-locale', '--encoding=UTF8', '--no-sync']);
  command('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-w', '-t', '10',
    '-o', `-c listen_addresses='' -c unix_socket_directories=${root} -p 55439`, 'start']);
  started = true;
  const base = { host: root, port: 55439, database: 'postgres', user: 'fixture',
    connectionTimeoutMillis: 1000, statement_timeout: 3000, query_timeout: 5000 };
  admin = new Client(base); await admin.connect();
  assert.equal((await admin.query("SELECT current_setting('listen_addresses') AS listeners")).rows[0].listeners, '');
  await admin.query('CREATE ROLE app_runtime LOGIN NOINHERIT; CREATE ROLE app_operator LOGIN NOINHERIT');
  const old = join(root, 'old'); mkdirSync(old, { mode: 0o700 });
  cpSync(join(migrationsDirectory, '1792972800000-foundation.mjs'), join(old, '1792972800000-foundation.mjs'));
  const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
  let index = 0;
  for (const scenario of (['success', 'wrong-head', 'receipt-drift', 'provider-drift', 'pre-cancel',
    'concurrent', 'lost-intent-ack', 'lost-outcome-ack', 'old-drift', 'under-lock-drift', 'lock-held',
    'commit-ack-unknown', 'cancel-in-transaction', 'report-failure', 'postflight-refusal', 'noop-drift', 'noop-concurrent',
    'bootstrap-success', 'bootstrap-existing', 'bootstrap-conflict', 'bootstrap-auth', 'bootstrap-input',
    'bootstrap-provider', 'bootstrap-head', 'bootstrap-noop-drift', 'bootstrap-report-drift', 'bootstrap-pre-cancel',
    'bootstrap-concurrent', 'bootstrap-commit-unknown', 'bootstrap-started-only', 'bootstrap-lost-intent', 'bootstrap-lost-outcome',
    'bootstrap-names-exact', 'bootstrap-names-profile', 'bootstrap-names-workspace'] as const)
    .filter(name => phase === 'bootstrap-names' ? name.startsWith('bootstrap-names-')
      : !name.startsWith('bootstrap-names-') && name.startsWith('bootstrap-') === (phase === 'bootstrap'))) {
    await t.test(scenario, async sub => {
      const f = fixture(sub), p = providerFixture(); f.create();
      await authorizeActivationPhase(f.run, 'roles', p.provider);
      await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { throw new Error('Synthetic UNKNOWN'); }));
      const failed = { ...f.run, directory: join(f.root, `activation-recovered-${activationRolesSuccessor}`) };
      createRecoveredActivationJournal(f.source, f.receipts, failed.directory, failed.packet, failed.digest,
        activationRolesSuccessor, f.state().head);
      await authorizeActivationPhase(failed, 'roles', p.provider);
      await assert.rejects(executeActivationPhase(failed, 'roles', async () => { throw new AppRoleError('rolled_back'); }));
      const failedHead = readActivationJournal(failed.directory, failed.packet, failed.digest).head;
      const run = { ...failed, directory: join(f.root, `activation-recovered-${rolesReachability.executionId}`) };
      createRecoveredActivationJournal(f.source, f.receipts, run.directory, run.packet, run.digest, rolesReachability.executionId, failedHead);
      await authorizeActivationPhase(run, 'roles', p.provider);
      await executeActivationPhase(run, 'roles', async () => committed);
      await confirmActivationPhase(run, 'roles', p.provider);
      const state = () => readActivationJournal(run.directory, run.packet, run.digest), rolesState = state();
      const rolesProof = { version: 1, executionId: rolesReachability.executionId, predecessorHead: failedHead,
        outcomeHash: rolesState.events[3]!.sha256, roles: ['app_runtime', 'app_operator'], inspection: 'exact-read-only-committed' };
      writeReleaseEvidence(join(run.directory, `${run.packet.runId}.roles-verification.json`), rolesProof);
      const rolesReceipt = join(run.directory, `${run.packet.runId}.roles-complete.json`);
      writeReleaseEvidence(rolesReceipt, { ...rolesProof, head: rolesState.head, status: 'ROLES_COMPLETE' });
      const retained = [canonical(inventory(f.run.directory)), canonical(inventory(failed.directory))];
      const database = { ...base, database: `migration_${++index}` };
      await admin!.query(`CREATE DATABASE ${database.database}`);
      const client = new Client(database); await client.connect(); sub.after(() => client.end());
      await client.query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz); ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY');
      const initialized = await runMigrations(database, { directory: old });
      assert.equal(initialized.result, 'success'); assert.equal(initialized.attempted.length, 1);
      const roles = { authority: database, runtime: { ...database, user: 'app_runtime' },
        operator: { ...database, user: 'app_operator' }, approvalId: run.packet.runId, target: 'local' };
      let preparations = 0, disposed = 0, schemaCreates = 0, faulted = false;
      const cancel = new AbortController();
      const query = Client.prototype.query;
      sub.mock.method(Client.prototype, 'query', async function(this: Client, text: string, values?: unknown[]) {
        const commandText = typeof text === 'string' ? text : '';
        if (!faulted && commandText.startsWith('SELECT pg_try_advisory_lock(')
          && ['under-lock-drift', 'lock-held'].includes(scenario)) {
          faulted = true;
          if (scenario === 'under-lock-drift') await client.query('INSERT INTO public.foundation_migrations(name,run_on) VALUES($1,now())',
            [run.packet.migrations[1]!.name]);
          else {
            const lock = /^SELECT pg_try_advisory_lock\((\d+)\)/.exec(commandText); assert.ok(lock);
            await client.query('SELECT pg_advisory_lock($1)', [lock[1]]);
          }
        }
        const result = await Reflect.apply(query, this, values === undefined ? [text] : [text, values]);
        if (commandText.includes('CREATE SCHEMA app_private')) {
          schemaCreates++;
          if (scenario === 'cancel-in-transaction') cancel.abort();
        }
        if (!faulted && schemaCreates > 0 && scenario === 'commit-ack-unknown' && commandText.trim().replace(/;$/, '') === 'COMMIT') {
          faulted = true; throw new Error('synthetic-private-error-must-not-escape');
        }
        return result;
      });
      const prepare = (phase: 'roles' | 'migration') => {
        preparations++;
        return { ...(phase === 'roles' ? { roles } : { database }), dispose() { disposed++; } };
      };
      const invoke = (action: string) => continueReachabilityMigration(run, action, artifact, p.provider, prepare,
        cancel.signal, scenario === 'wrong-head' ? sha256('wrong-head') : rolesState.head);
      if (scenario === 'receipt-drift') writeFileSync(rolesReceipt, canonical({ ...rolesProof, head: sha256('wrong-head'), status: 'ROLES_COMPLETE' }));
      if (scenario === 'provider-drift') p.values[p.statusPath] = [{ state: 'success' }];
      if (scenario === 'pre-cancel') cancel.abort();
      if (scenario === 'lost-intent-ack') p.loseAck(true);
      const authorized = await invoke('authorize');
      if (['wrong-head', 'receipt-drift', 'provider-drift', 'pre-cancel'].includes(scenario)) {
        assert.equal(authorized.status, 'STOP'); assert.equal(preparations, 0); assert.equal(state().events.length, 6); return;
      }
      if (scenario === 'lost-intent-ack') {
        assert.equal(authorized.status, 'STOP'); assert.equal(state().events.at(-1)?.kind, 'intent');
        const before = [preparations, p.writes.length];
        assert.equal((await invoke('reconcile-ack')).status, 'CONTINUED');
        assert.deepEqual([preparations, p.writes.length], before); p.loseAck(false);
      } else assert.equal(authorized.status, 'CONTINUED');
      if (scenario === 'old-drift') await client.query('INSERT INTO public.foundation_migrations(name,run_on) VALUES($1,now())', [run.packet.migrations[1]!.name]);
      if (scenario === 'report-failure') writeFileSync(join(run.directory, 'migration-reports'), 'synthetic-report-collision');
      const outcomes = scenario === 'concurrent' ? await Promise.all([invoke('run'), invoke('run')]) : [await invoke('run')];
      assert.doesNotMatch(JSON.stringify(outcomes), /synthetic-private-error|password|postgresql:\/\//);
      assert.equal(preparations, disposed);
      if (['old-drift', 'under-lock-drift', 'lock-held', 'commit-ack-unknown', 'cancel-in-transaction', 'report-failure'].includes(scenario)) {
        assert.equal(outcomes[0]!.status, 'STOP');
        const before = [preparations, schemaCreates, p.writes.length];
        assert.equal((await invoke('run')).status, 'STOP'); assert.equal((await invoke('confirm')).status, 'STOP');
        assert.deepEqual([preparations, schemaCreates, p.writes.length], before);
        if (['old-drift', 'under-lock-drift', 'lock-held'].includes(scenario)) assert.equal(schemaCreates, 0);
        if (scenario === 'under-lock-drift' || scenario === 'lock-held') {
          const reports = join(run.directory, 'migration-reports');
          const report = JSON.parse(readFileSync(join(reports, readdirSync(reports)[0]!), 'utf8'));
          assert.deepEqual(report.attempted, []); assert.equal(report.stage, 'lock/order');
          assert.equal((await client.query("SELECT to_regnamespace('app_private') AS present")).rows[0].present, null);
        }
        if (scenario === 'cancel-in-transaction') {
          assert.equal(outcomes[0]!.category, 'aborted');
          assert.notEqual(outcomes[0]!.databaseOutcome, 'committed');
        }
        if (scenario === 'commit-ack-unknown' || scenario === 'report-failure') {
          assert.equal(state().next, 'migration');
          assert.equal((await migrationStatus(database)).pending.length, 0);
          assert.equal((state().events.at(-1)!.value as ActivationOutcome).result, 'unknown');
        }
        return;
      }
      assert.equal(outcomes.filter(result => result.status === 'CONTINUED').length, 1);
      if (scenario === 'concurrent') assert.equal(outcomes.filter(result => result.status === 'STOP').length, 1);
      assert.equal(schemaCreates, 1);
      const applied = state().events.at(-1)!.value as ActivationOutcome;
      assert.equal(applied.databaseOutcome, 'committed'); assert.equal(applied.count, 2);
      const reportDirectory = join(run.directory, 'migration-reports');
      const report = JSON.parse(readFileSync(join(reportDirectory, readdirSync(reportDirectory)[0]!), 'utf8'));
      assert.deepEqual(report.before, activationSchema.oldNames);
      assert.deepEqual(report.after, run.packet.migrations.map(item => item.name));
      assert.deepEqual(report.attempted, run.packet.migrations.slice(1).map(item => ({ ...item, outcome: 'applied_committed' })));
      assert.equal(report.reporting, 'written');
      if (scenario === 'postflight-refusal') await client.query('GRANT CREATE ON SCHEMA app_private TO app_runtime');
      const postflight = await invoke('postflight');
      if (scenario === 'postflight-refusal') {
        assert.equal(postflight.status, 'STOP'); assert.equal((await invoke('confirm')).status, 'STOP'); return;
      }
      assert.equal(postflight.status, 'CONTINUED');
      if (scenario === 'lost-outcome-ack') p.loseAck(true);
      const confirmation = await invoke('confirm');
      if (scenario === 'lost-outcome-ack') {
        assert.equal(confirmation.status, 'STOP'); assert.equal(state().events.at(-1)?.kind, 'confirming');
        const before = [preparations, p.writes.length, schemaCreates];
        assert.equal((await invoke('reconcile-ack')).status, 'MIGRATION_COMPLETE');
        assert.deepEqual([preparations, p.writes.length, schemaCreates], before); p.loseAck(false);
      } else assert.equal(confirmation.status, 'MIGRATION_COMPLETE');
      const confirmedHead = state().head, providerWrites = p.writes.length;
      if (scenario === 'noop-drift') await client.query('DELETE FROM public.foundation_migrations WHERE name=$1', [run.packet.migrations[2]!.name]);
      const noops = scenario === 'noop-concurrent' ? await Promise.all([invoke('verify-noop'), invoke('verify-noop')]) : [await invoke('verify-noop')];
      if (scenario === 'noop-drift') {
        assert.equal(noops[0]!.status, 'STOP');
        assert.equal(noops[0]!.databaseOutcome, null); assert.equal(noops[0]!.count, null);
      } else {
        assert.equal(noops.filter(result => result.status === 'NOOP_COMPLETE').length, 1);
        assert.equal(noops.find(result => result.status === 'NOOP_COMPLETE')!.count, 0);
        assert.equal(readdirSync(reportDirectory).length, 2);
        const reports = readdirSync(reportDirectory).map(name => JSON.parse(readFileSync(join(reportDirectory, name), 'utf8')));
        const noop = reports.find(value => value.attempted.length === 0);
        assert.deepEqual(noop.before, noop.after); assert.deepEqual(noop.after, run.packet.migrations.map(item => item.name));
        assert.equal(noop.database_outcome, 'committed'); assert.equal(noop.reporting, 'written');
      }
      const beforeReplay = preparations;
      assert.equal((await invoke('verify-noop')).status, 'STOP'); assert.equal(preparations, beforeReplay);
      assert.equal(state().head, confirmedHead); assert.equal(state().next, 'bootstrap');
      assert.equal(p.writes.length, providerWrites); assert.equal(schemaCreates, 1);
      assert.deepEqual([canonical(inventory(f.run.directory)), canonical(inventory(failed.directory))], retained);
      assert.deepEqual(state().events.slice(0, 6), rolesState.events);
      if (scenario.startsWith('bootstrap-')) {
        const migrationState = state(), heads = { roles: rolesState.head, migration: migrationState.head };
        const userId = randomUUID(), workspaceId = randomUUID(), approvalId = randomUUID();
        const bootstrapEnv = {
          APP_OPERATOR_TARGET: 'local', APP_OPERATOR_DATABASE_URL: `postgresql://app_operator:synthetic@127.0.0.1:55439/${database.database}`,
          APP_OPERATOR_AUTH_KEY: 'synthetic-auth-admin', APP_OPERATOR_CONFIRM_WORKSPACE: workspaceId,
          APP_OPERATOR_APPROVAL_ID: approvalId, APP_OPERATOR_USER_ID: userId, APP_OPERATOR_PROFILE_NAME: 'Synthetic Owner',
          APP_OPERATOR_WORKSPACE_NAME: 'Synthetic Workspace', APP_WORKSPACE_ID: workspaceId,
          APP_AUTH_URL: 'http://127.0.0.1:55438', APP_AUTH_API_KEY: 'synthetic-api-key',
          BROWSER_ORIGIN: 'http://127.0.0.1:55437', APP_RETENTION_POLICY_ID: 'manual-retention-v1',
        };
        let reads = 0, authReads = 0, released = 0, writeTransactions = 0, lostCommit = false;
        const connect = Client.prototype.connect, bootstrapQuery = Client.prototype.query;
        sub.mock.method(Client.prototype, 'connect', function(this: Client, ...args: unknown[]) {
          const connection = this as Client & { host: string; port: number; user: string };
          if (connection.host === '127.0.0.1') {
            assert.equal(connection.user, 'app_operator'); Object.assign(connection, { host: root, port: 55439 });
          }
          assert.equal(connection.host, root, 'Only the owned private Unix socket is allowed.');
          return Reflect.apply(connect, this, args);
        });
        sub.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
          assert.equal(String(url), `${bootstrapEnv.APP_AUTH_URL}/admin/users/${userId}`);
          assert.equal(options?.method, 'GET'); assert.equal(options?.body, undefined); authReads++;
          return new Response(JSON.stringify({ id: userId, email: 'synthetic-owner@example.test',
            email_confirmed_at: '2026-01-01T00:00:00Z' }), { status: scenario === 'bootstrap-auth' ? 403 : 200 });
        });
        sub.mock.method(Client.prototype, 'query', async function(this: Client, text: string, values?: unknown[]) {
          if (typeof text === 'string' && text.startsWith('BEGIN; SET LOCAL lock_timeout')) writeTransactions++;
          const result = await Reflect.apply(bootstrapQuery, this, values === undefined ? [text] : [text, values]);
          if (scenario === 'bootstrap-commit-unknown' && !lostCommit && writeTransactions && text === 'COMMIT') {
            lostCommit = true; throw new Error('Synthetic lost COMMIT acknowledgement; must not escape.');
          }
          return result;
        });
        const existingBootstrap = scenario === 'bootstrap-existing' || scenario === 'bootstrap-conflict' || scenario.startsWith('bootstrap-names-');
        const nameDrift = scenario === 'bootstrap-names-profile' || scenario === 'bootstrap-names-workspace';
        const persistedBootstrap = async () => {
          const rows: unknown[][] = [];
          for (const table of ['profiles', 'workspaces', 'memberships', 'audit_events']) {
            rows.push((await client.query(`SELECT to_jsonb(t) AS row FROM app_private.${table} t`)).rows);
          }
          return rows;
        };
        let driftSnapshot: Awaited<ReturnType<typeof persistedBootstrap>> | undefined;
        if (existingBootstrap) {
          await runAppOperator('bootstrap', bootstrapEnv); await runAppOperator('bootstrap', bootstrapEnv);
          assert.equal((await client.query('SELECT count(*)::integer AS count FROM app_private.audit_events')).rows[0].count, 1);
          assert.equal(await inspectAppBootstrap(bootstrapEnv), 'committed');
          if (nameDrift) {
            const table = scenario === 'bootstrap-names-profile' ? 'profiles' : 'workspaces';
            await client.query(`UPDATE app_private.${table} SET display_name=$1`, ['Synthetic Drift']);
            driftSnapshot = await persistedBootstrap();
            assert.equal(await inspectAppBootstrap(bootstrapEnv), 'conflict');
            await assert.rejects(runAppOperator('bootstrap', bootstrapEnv), { code: 'bootstrap_conflict' });
            assert.deepEqual(await persistedBootstrap(), driftSnapshot, 'Idempotent bootstrap must not rename or repair drift.');
          }
          if (scenario === 'bootstrap-conflict') {
            await client.query("UPDATE app_private.audit_events SET request_id=$1 WHERE action='workspace.bootstrap'", [randomUUID()]);
          }
        }
        const transactionsBefore = writeTransactions;
        const bootstrapCancel = new AbortController();
        const bootstrap = (action: string) => continueReachabilityBootstrap(run, action, artifact, p.provider, () => {
          reads++;
          if (scenario === 'bootstrap-input') throw new Error('Synthetic private input must not escape.');
          return { env: { ...bootstrapEnv }, dispose() { released++; } };
        }, bootstrapCancel.signal, heads);
        if (scenario === 'bootstrap-head') heads.migration = sha256('wrong migration head');
        if (scenario === 'bootstrap-noop-drift') {
          const path = join(run.directory, `${run.packet.runId}.migration-noop-result.json`);
          const value = JSON.parse(readFileSync(path, 'utf8')); value.head = sha256('wrong no-op head');
          writeFileSync(path, JSON.stringify(value));
        }
        if (scenario === 'bootstrap-report-drift') {
          const path = join(reportDirectory, readdirSync(reportDirectory)[0]!);
          const value = JSON.parse(readFileSync(path, 'utf8')); value.before = []; writeFileSync(path, JSON.stringify(value));
        }
        if (scenario === 'bootstrap-provider') p.values['/commits/main'] = {};
        if (scenario === 'bootstrap-pre-cancel') bootstrapCancel.abort();
        if (scenario === 'bootstrap-lost-intent') p.loseAck(true);
        const authorization = await bootstrap('authorize');
        if (['bootstrap-head', 'bootstrap-noop-drift', 'bootstrap-report-drift', 'bootstrap-provider', 'bootstrap-pre-cancel'].includes(scenario)) {
          assert.equal(authorization.status, 'STOP'); assert.equal(reads, 0); assert.equal(authReads, 0);
          assert.equal(writeTransactions, 0); assert.equal(state().head, migrationState.head); return;
        }
        if (scenario === 'bootstrap-lost-intent') {
          assert.equal(authorization.status, 'STOP'); assert.equal(state().events.at(-1)?.kind, 'intent');
          assert.equal(reads, 0); const writes = p.writes.length;
          assert.equal((await bootstrap('reconcile-ack')).status, 'CONTINUED');
          assert.equal(p.writes.length, writes); assert.equal(reads, 0); p.loseAck(false);
        } else assert.equal(authorization.status, 'CONTINUED');
        if (scenario === 'bootstrap-started-only') {
          appendActivationEvent(run.directory, run.packet, run.digest, 'bootstrap', 'started', { outcome: 'unknown' });
          const unknown = await bootstrap('state');
          assert.equal(unknown.databaseOutcome, 'unknown'); assert.equal(unknown.count, null);
          assert.equal((await bootstrap('run')).status, 'STOP');
          assert.equal(reads, 0); assert.equal(writeTransactions, 0); return;
        }
        const attempts = scenario === 'bootstrap-concurrent' ? await Promise.all([bootstrap('run'), bootstrap('run')]) : [await bootstrap('run')];
        if (nameDrift || ['bootstrap-conflict', 'bootstrap-auth', 'bootstrap-input'].includes(scenario)) {
          assert.equal(attempts[0]!.status, 'STOP'); assert.equal(attempts[0]!.databaseOutcome, 'not_started');
          assert.equal(attempts[0]!.count, 0); assert.equal(state().events.at(-1)?.kind, 'authorized');
          assert.equal(attempts[0]!.stage, scenario === 'bootstrap-auth' ? 'auth' : scenario === 'bootstrap-input' ? 'input' : 'preflight');
          if (scenario === 'bootstrap-auth') assert.equal(authReads, 1);
          assert.equal(writeTransactions, transactionsBefore);
          if (nameDrift) {
            assert.equal((await bootstrap('confirm')).status, 'STOP');
            assert.deepEqual(await persistedBootstrap(), driftSnapshot);
            assert.deepEqual(state().events.slice(0, 12), migrationState.events);
          }
          const beforeRetry = reads; assert.equal((await bootstrap('run')).status, 'STOP'); assert.equal(reads, beforeRetry);
          assert.equal((await bootstrap('inspect')).status, 'STOP'); return;
        }
        if (scenario === 'bootstrap-commit-unknown') {
          assert.equal(attempts[0]!.status, 'STOP'); assert.equal(attempts[0]!.databaseOutcome, 'unknown');
          assert.equal((await client.query('SELECT count(*)::integer AS count FROM app_private.workspaces')).rows[0].count, 1);
          const beforeInspect = writeTransactions;
          assert.equal((await bootstrap('inspect')).status, 'CONTINUED'); assert.equal(writeTransactions, beforeInspect);
        } else {
          assert.equal(attempts.filter(result => result.status === 'CONTINUED').length, 1);
          if (scenario === 'bootstrap-concurrent') assert.equal(attempts.filter(result => result.status === 'STOP').length, 1);
        }
        const outcome = state().events.at(-1)!.value as ActivationOutcome;
        assert.equal(outcome.databaseOutcome, 'committed'); assert.equal(outcome.count, existingBootstrap ? 0 : 1);
        const profile = await client.query('SELECT user_id,display_name FROM app_private.profiles');
        assert.deepEqual(profile.rows, [{ user_id: userId, display_name: 'Synthetic Owner' }]);
        assert.deepEqual((await client.query('SELECT id,display_name FROM app_private.workspaces')).rows,
          [{ id: workspaceId, display_name: 'Synthetic Workspace' }]);
        assert.deepEqual((await client.query('SELECT user_id,workspace_id,role_code,status FROM app_private.memberships')).rows,
          [{ user_id: userId, workspace_id: workspaceId, role_code: 'owner', status: 'active' }]);
        const audit = await client.query('SELECT action,actor_user_id,workspace_id,request_id FROM app_private.audit_events');
        assert.deepEqual(audit.rows, [{ action: 'workspace.bootstrap', actor_user_id: userId, workspace_id: workspaceId, request_id: approvalId }]);
        if (scenario === 'bootstrap-lost-outcome') p.loseAck(true);
        const confirmed = await bootstrap('confirm');
        if (scenario === 'bootstrap-lost-outcome') {
          assert.equal(confirmed.status, 'STOP'); assert.equal(state().events.at(-1)?.kind, 'confirming');
          const beforeAck = [reads, authReads, writeTransactions, p.writes.length];
          assert.equal((await bootstrap('reconcile-ack')).status, 'BOOTSTRAP_COMPLETE');
          assert.deepEqual([reads, authReads, writeTransactions, p.writes.length], beforeAck); p.loseAck(false);
        } else assert.equal(confirmed.status, 'BOOTSTRAP_COMPLETE');
        assert.equal(state().next, 'app-config'); assert.equal(reads, released);
        const beforeReplay = [reads, authReads, writeTransactions, p.writes.length];
        assert.equal((await bootstrap('run')).status, 'STOP');
        assert.deepEqual([reads, authReads, writeTransactions, p.writes.length], beforeReplay);
        assert.deepEqual(state().events.slice(0, 12), migrationState.events);
        assert.deepEqual([canonical(inventory(f.run.directory)), canonical(inventory(failed.directory))], retained);
      }
      f.unchanged();
    });
  }
});

async function authorizedBootstrapFixture(sub: TestContext) {
  const f = fixture(sub), p = providerFixture(); f.create();
  await authorizeActivationPhase(f.run, 'roles', p.provider);
  await assert.rejects(executeActivationPhase(f.run, 'roles', async () => { throw new Error('Synthetic UNKNOWN'); }));
  const failed = { ...f.run, directory: join(f.root, `activation-recovered-${activationRolesSuccessor}`) };
  createRecoveredActivationJournal(f.source, f.receipts, failed.directory, failed.packet, failed.digest, activationRolesSuccessor, f.state().head);
  await authorizeActivationPhase(failed, 'roles', p.provider);
  await assert.rejects(executeActivationPhase(failed, 'roles', async () => { throw new AppRoleError('rolled_back'); }));
  const failedHead = readActivationJournal(failed.directory, failed.packet, failed.digest).head;
  const run = { ...failed, directory: join(f.root, `activation-recovered-${rolesReachability.executionId}`) };
  createRecoveredActivationJournal(f.source, f.receipts, run.directory, run.packet, run.digest, rolesReachability.executionId, failedHead);
  const state = () => readActivationJournal(run.directory, run.packet, run.digest);
  await authorizeActivationPhase(run, 'roles', p.provider); await executeActivationPhase(run, 'roles', async () => committed);
  await confirmActivationPhase(run, 'roles', p.provider);
  const roleState = state(), proof = { version: 1, executionId: rolesReachability.executionId, predecessorHead: failedHead,
    outcomeHash: roleState.events[3]!.sha256, roles: ['app_runtime', 'app_operator'], inspection: 'exact-read-only-committed' };
  writeReleaseEvidence(join(run.directory, `${run.packet.runId}.roles-verification.json`), proof);
  writeReleaseEvidence(join(run.directory, `${run.packet.runId}.roles-complete.json`), { ...proof, head: roleState.head, status: 'ROLES_COMPLETE' });
  const names = run.packet.migrations.map(item => item.name), report = {
    source_revision: run.packet.revision, target: run.packet.target, manifest_digest: sha256(canonical(run.packet.migrations)),
    before: names.slice(0, 1), after: names, attempted: run.packet.migrations.slice(1).map(item => ({ ...item, outcome: 'applied_committed' })),
    result: 'success', database_outcome: 'committed', reporting: 'written' };
  const reports = join(run.directory, 'migration-reports'); mkdirSync(reports, { mode: 0o700 });
  writeReleaseEvidence(join(reports, `${randomUUID()}.json`), report);
  const noop = { ...report, before: names, attempted: [] };
  writeReleaseEvidence(join(reports, `${randomUUID()}.json`), noop);
  await authorizeActivationPhase(run, 'migration', p.provider);
  await executeActivationPhase(run, 'migration', async () => ({ ...committed, reportDigest: sha256(canonical(report)) }));
  writeReleaseEvidence(join(run.directory, `${run.packet.runId}.postflight.json`), { version: 1, packetDigest: run.digest,
    inputDigest: run.packet.roleInputDigest, startedHash: state().events[8]!.sha256, history: names, roles: 'target-confirmed' });
  await confirmActivationPhase(run, 'migration', p.provider);
  const migrationHead = state().head, binding = { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest, head: migrationHead };
  writeReleaseEvidence(join(run.directory, `${run.packet.runId}.migration-noop-started.json`), binding);
  writeReleaseEvidence(join(run.directory, `${run.packet.runId}.migration-noop-result.json`), {
    ...binding, outcome: { ...committed, count: 0, reportDigest: sha256(canonical(noop)) } });
  await authorizeActivationPhase(run, 'bootstrap', p.provider);
  const authorized = state(), expected = { roles: roleState.head, migration: migrationHead, authorized: authorized.head };
  const attempt = join(run.directory, `${run.packet.runId}.bootstrap-attempt.json`);
  writeReleaseEvidence(attempt, { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest,
    migrationHead, bootstrapBindingDigest: run.packet.bootstrapBindingDigest, authorizedHead: authorized.head });
  const retained = [canonical(inventory(f.run.directory)), canonical(inventory(failed.directory)), canonical(inventory(run.directory))];
  return { f, p, failed, run, state, expected, attempt, retained, authorized };
}

function bootstrapObservationInputs() {
  const userId = randomUUID(), workspaceId = randomUUID();
  const env = { APP_OPERATOR_TARGET: 'local', APP_OPERATOR_DATABASE_URL: 'postgresql://app_operator:synthetic@127.0.0.1:55439/postgres',
    APP_OPERATOR_AUTH_KEY: 'SYNTHETIC_PRIVATE_KEY_MUST_NOT_ESCAPE', APP_OPERATOR_CONFIRM_WORKSPACE: workspaceId,
    APP_OPERATOR_APPROVAL_ID: randomUUID(), APP_OPERATOR_USER_ID: userId, APP_OPERATOR_PROFILE_NAME: 'Synthetic Owner',
    APP_OPERATOR_WORKSPACE_NAME: 'Synthetic Workspace', APP_WORKSPACE_ID: workspaceId,
    APP_AUTH_URL: 'http://127.0.0.1:55438', APP_AUTH_API_KEY: 'synthetic-public', BROWSER_ORIGIN: 'http://127.0.0.1:55437' };
  return { env, userId, config: parseAppOperatorConfig(env) };
}
test('bootstrap auth observation classifies existing predicates without exposing user or credential data', async t => {
  for (const scenario of ['valid', 'missing-key', 'invalid-id', 'transport', 'body', 'oversize', 'json', 'json-before-status',
    'http-status', 'schema', 'user-id', 'anonymous', 'confirmation-type', 'confirmation-date', 'email', 'cancelled'] as const) {
    await t.test(scenario, async sub => {
      const { env, userId, config } = bootstrapObservationInputs(), cancel = new AbortController();
      const user = { id: userId, email: 'Synthetic.Owner@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
        private_data: env.APP_OPERATOR_AUTH_KEY };
      let calls = 0;
      sub.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
        calls++; assert.equal(String(url), `${config.appFoundation.authUrl}/admin/users/${userId}`);
        assert.equal(options?.method, 'GET'); assert.equal(options?.body, undefined);
        if (scenario === 'transport') throw new Error(env.APP_OPERATOR_AUTH_KEY);
        const value: unknown = scenario === 'schema' ? [] : scenario === 'user-id' ? { ...user, id: randomUUID() }
          : scenario === 'anonymous' ? { ...user, is_anonymous: true }
          : scenario === 'confirmation-type' ? { ...user, email_confirmed_at: 123 }
          : scenario === 'confirmation-date' ? { ...user, email_confirmed_at: 'not-a-date' }
          : scenario === 'email' ? { ...user, email: 'invalid email@example.test' } : user;
        return new Response(scenario === 'body' ? null : scenario === 'oversize' ? 'x'.repeat(65537)
          : ['json', 'json-before-status'].includes(scenario) ? '{invalid-json' : JSON.stringify(value),
        { status: ['http-status', 'json-before-status'].includes(scenario) ? 403 : 200 });
      });
      if (scenario === 'cancelled') cancel.abort();
      const auth = new AuthAdmin(config.appFoundation, scenario === 'missing-key' ? undefined : config.key);
      const result = await auth.inspectVerifiedUser(scenario === 'invalid-id' ? 'invalid' : userId, cancel.signal);
      const expectedStage = scenario === 'valid' ? 'complete' : ['missing-key', 'invalid-id', 'cancelled'].includes(scenario) ? 'input'
        : scenario === 'oversize' ? 'body' : scenario === 'json-before-status' ? 'json'
        : scenario.startsWith('confirmation-') ? 'confirmed' : scenario;
      assert.equal(result.substage, expectedStage);
      assert.equal(result.status, scenario === 'valid' ? 'verified' : 'refused');
      assert.equal(result.category, scenario === 'valid' ? 'passed' : scenario === 'cancelled' ? 'aborted'
        : ['transport', 'body', 'oversize', 'json', 'json-before-status', 'http-status'].includes(scenario) ? 'unavailable' : 'refused');
      assert.equal(result.httpStatus, ['missing-key', 'invalid-id', 'cancelled', 'transport'].includes(scenario) ? null
        : ['json-before-status', 'http-status'].includes(scenario) ? 403 : 200);
      assert.equal(calls, ['missing-key', 'invalid-id', 'cancelled'].includes(scenario) ? 0 : 1);
      assert.deepEqual(Object.keys(result).sort(), ['category', 'httpStatus', 'status', 'substage']);
      for (const secret of [env.APP_OPERATOR_AUTH_KEY, userId, user.email]) assert.equal(JSON.stringify(result).includes(secret), false);
      if (scenario === 'valid') {
        assert.deepEqual(await auth.verifiedUser(userId, cancel.signal), { userId, email: user.email.toLowerCase() });
      } else if (!['cancelled', 'invalid-id', 'missing-key'].includes(scenario)) {
        await assert.rejects(auth.verifiedUser(userId, cancel.signal), { code: result.category === 'unavailable'
          ? 'dependency_unavailable' : scenario === 'email' ? 'invalid_request' : 'forbidden' });
      }
    });
  }
});

test('bootstrap auth observation is one-shot read-only and bound to the refused attempt', {
  skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT,
}, async t => {
  for (const scenario of ['verified', 'http-refused', 'wrong-head', 'attempt-drift', 'ready-exists', 'provider-drift',
    'concurrent', 'input-refused', 'cancelled', 'post-read-drift'] as const) await t.test(scenario, async sub => {
    const { f, p, failed, run, state, expected, attempt, retained, authorized } = await authorizedBootstrapFixture(sub);
    const { env, userId } = bootstrapObservationInputs(), abort = new AbortController();
    let prepared = 0, disposed = 0, lookups = 0, connections = 0;
    sub.mock.method(Client.prototype, 'connect', () => { connections++; throw new Error('Database access forbidden in Auth-only observation.'); });
    sub.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(String(url), `${env.APP_AUTH_URL}/admin/users/${userId}`); assert.equal(options?.method, 'GET'); assert.equal(options?.body, undefined);
      lookups++;
      if (scenario === 'post-read-drift') writeFileSync(attempt, '{}');
      return new Response(JSON.stringify({ id: userId, email: 'synthetic@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }),
        { status: scenario === 'http-refused' ? 403 : 200 });
    });
    if (scenario === 'wrong-head') expected.authorized = sha256('wrong-head');
    if (scenario === 'attempt-drift') writeFileSync(attempt, '{}');
    if (scenario === 'ready-exists') writeReleaseEvidence(join(run.directory, `${run.packet.runId}.bootstrap-ready.json`), {});
    if (scenario === 'provider-drift') p.values['/commits/main'] = {};
    if (scenario === 'cancelled') abort.abort();
    const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
    const invoke = () => observeReachabilityBootstrapAuth(run, artifact, p.provider, () => {
      prepared++; if (scenario === 'input-refused') throw new Error(env.APP_OPERATOR_AUTH_KEY);
      return { env: { ...env }, dispose() { disposed++; } };
    }, abort.signal, expected);
    const writes = p.writes.length, results = scenario === 'concurrent' ? await Promise.all([invoke(), invoke()]) : [await invoke()];
    assert.equal(connections, 0); assert.equal(p.writes.length, writes); assert.deepEqual(state(), authorized);
    if (['wrong-head', 'attempt-drift', 'ready-exists', 'provider-drift', 'cancelled'].includes(scenario)) {
      assert.equal(results[0]!.status, 'STOP'); assert.equal(lookups, 0); assert.equal(prepared, 0);
    } else if (scenario === 'input-refused') {
      assert.equal(results[0]!.stage, 'input'); assert.equal(results[0]!.status, 'STOP'); assert.equal(lookups, 0);
    } else if (scenario === 'post-read-drift') {
      assert.equal(results[0]!.status, 'STOP'); assert.equal(results[0]!.head, null); assert.equal(lookups, 1);
    } else {
      assert.equal(results.filter(result => result.status === (scenario === 'http-refused' ? 'AUTH_REFUSED' : 'AUTH_VERIFIED')).length, 1);
      assert.equal(lookups, 1); assert.equal(prepared, disposed);
      if (scenario === 'http-refused') assert.deepEqual(results[0]!.auth,
        { status: 'refused', substage: 'http-status', httpStatus: 403, category: 'unavailable' });
      assert.deepEqual([canonical(inventory(f.run.directory)), canonical(inventory(failed.directory)), canonical(inventory(run.directory))], retained);
    }
    const beforeRetry = [lookups, prepared, connections, p.writes.length];
    assert.equal((await invoke()).status, 'STOP'); assert.deepEqual([lookups, prepared, connections, p.writes.length], beforeRetry);
    assert.equal(JSON.stringify(results).includes(env.APP_OPERATOR_AUTH_KEY), false); f.unchanged();
  });
});

async function pretransactionFixture(t: TestContext) {
  const fixture = await authorizedBootstrapFixture(t), { f, run, attempt, expected, retained } = fixture;
  const evidence = join(f.root, 'continuation-evidence');
  for (const child of ['p2-name-fix', 'auth-observation']) mkdirSync(join(evidence, child), { recursive: true, mode: 0o700 });
  const receipts = {
    'p2-name-fix/actual-bootstrap-result.json': '',
    'p2-name-fix/actual-bootstrap-durable-outcome.json': '',
    'auth-observation/actual-auth-observation-run.json': '',
    'auth-observation/actual-auth-observation-durable-outcome.json': '',
  };
  for (const path of Object.keys(receipts) as (keyof typeof receipts)[]) {
    writeReleaseEvidence(join(evidence, path), { version: 1, fixture: path, authorizedHead: expected.authorized });
    fs.chmodSync(join(evidence, path), 0o400);
    receipts[path] = sha256(readFileSync(join(evidence, path)));
  }
  const observation = join(f.root, `${run.packet.runId}.bootstrap-auth-observation-started.json`);
  writeReleaseEvidence(observation, { version: 1, executionId: rolesReachability.executionId, packetDigest: run.digest,
    kind: 'read-only-existing-user-auth', head: expected.authorized, bootstrapBindingDigest: run.packet.bootstrapBindingDigest });
  return { ...fixture, evidence, observation, expected: { ...expected, receipts,
    inventory: sha256(retained[2]!), attempt: sha256(readFileSync(attempt)), observationStarted: sha256(readFileSync(observation)) } };
}

test('fixed pretransaction continuation fences lineage and preserves truthful one-shot outcomes', {
  skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT, timeout: 240000,
}, async t => {
  const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
  for (const scenario of ['success', 'concurrent', 'wrong-head', 'attempt-tamper', 'receipt-tamper', 'extra-child',
    'unknown-sibling', 'observation-result', 'partial-claim', 'provider-drift', 'preflight-committed', 'preflight-conflict',
    'ready-failure', 'ready-link-failure', 'started-partial', 'product-failure', 'post-product-baseline',
    'post-product-inventory', 'postflight-conflict', 'outcome-partial', 'dispose-failure', 'verification-failure',
    'lost-ack', 'terminal-failure', 'cancel-product'] as const) await t.test(scenario, async sub => {
    const f = await pretransactionFixture(sub), { run, p, expected, evidence, state, authorized } = f;
    const { env } = bootstrapObservationInputs(), abort = new AbortController();
    const prefix = join(f.f.root, `${run.packet.runId}.bootstrap-pretransaction-continuation-`);
    const originals = inventory(run.directory).files;
    let preparations = 0, disposed = 0, inspections = 0, products = 0, forbidden = 0;
    sub.mock.method(Client.prototype, 'connect', () => { forbidden++; throw new Error('No DB in synthetic cases.'); });
    sub.mock.method(globalThis, 'fetch', () => { forbidden++; throw new Error('No network Auth/provider in synthetic cases.'); });
    const effects = {
      inspect: async () => {
        inspections++;
        if (inspections === 1) return scenario === 'preflight-committed' ? 'committed' as const
          : scenario === 'preflight-conflict' ? 'conflict' as const : 'absent' as const;
        return scenario === 'postflight-conflict' ? 'conflict' as const : 'committed' as const;
      },
      bootstrap: async () => {
        products++; assert.equal(state().events.at(-1)?.kind, 'started');
        assert.equal(existsSync(`${prefix}started.json`), true);
        assert.equal(existsSync(`${prefix}ready.json`), true);
        if (scenario === 'product-failure') throw new Error(env.APP_OPERATOR_AUTH_KEY);
        if (scenario === 'post-product-baseline') writeFileSync(f.attempt, '{}');
        if (scenario === 'post-product-inventory') writeReleaseEvidence(join(run.directory, 'unexpected.json'), {});
        if (scenario === 'cancel-product') abort.abort();
      },
    };
    if (scenario === 'wrong-head') expected.authorized = sha256('wrong-head');
    if (scenario === 'attempt-tamper') writeFileSync(f.attempt, '{}');
    if (scenario === 'receipt-tamper') {
      const path = join(evidence, 'auth-observation/actual-auth-observation-run.json');
      fs.chmodSync(path, 0o600); writeFileSync(path, '{}'); fs.chmodSync(path, 0o400);
    }
    if (scenario === 'extra-child') writeReleaseEvidence(join(run.directory, 'unexpected.json'), {});
    if (scenario === 'unknown-sibling') writeReleaseEvidence(`${prefix}unknown.json`, {});
    if (scenario === 'observation-result') writeReleaseEvidence(join(f.f.root, `${run.packet.runId}.bootstrap-auth-observation-result.json`), {});
    if (scenario === 'partial-claim') writeFileSync(`${prefix}started.json`, '{');
    if (scenario === 'provider-drift') p.values['/commits/main'] = {};
    if (scenario === 'lost-ack') p.loseAck(true);
    const faultPath = scenario === 'ready-failure' ? join(run.directory, `${run.packet.runId}.bootstrap-ready.json`)
      : scenario === 'ready-link-failure' ? `${prefix}ready.json`
      : scenario === 'started-partial' ? join(run.directory, 'activation', run.packet.runId, '014.json')
      : scenario === 'outcome-partial' ? join(run.directory, 'activation', run.packet.runId, '015.json')
      : scenario === 'verification-failure' ? join(run.directory, `${run.packet.runId}.bootstrap-verification.json`)
      : scenario === 'terminal-failure' ? `${prefix}result.json` : null;
    const open = fs.openSync;
    sub.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
      if (String(args[0]) === faultPath && typeof args[1] === 'number' && (args[1] & fs.constants.O_CREAT)) {
        if (scenario.endsWith('-partial')) { const fd = Reflect.apply(open, fs, args); fs.writeSync(fd, '{'); fs.closeSync(fd); }
        throw new Error('Synthetic persistence refusal');
      }
      return Reflect.apply(open, fs, args);
    });
    const invoke = () => continueReachabilityBootstrapPretransaction(run, artifact, p.provider, () => {
      preparations++; return { env: { ...env }, dispose() { disposed++; if (scenario === 'dispose-failure') throw new Error('Synthetic cleanup refusal'); } };
    }, evidence, sha256('synthetic-executable'), abort.signal, expected, effects);
    const results = scenario === 'concurrent' ? await Promise.all([invoke(), invoke()]) : [await invoke()];
    assert.equal(forbidden, 0);
    const success = results.find(result => result.status === 'BOOTSTRAP_COMPLETE'), outcome = results[0]!;
    if (scenario === 'success' || scenario === 'concurrent') {
      assert.ok(success, JSON.stringify(results)); assert.equal(success.databaseOutcome, 'committed'); assert.equal(success.count, 1);
      assert.equal(success.next, 'app-config'); assert.equal(products, 1); assert.equal(preparations, 1); assert.equal(disposed, 1);
      assert.deepEqual(state().events.slice(0, 14), authorized.events);
      assert.deepEqual(state().events.slice(14).map(event => event.kind), ['started', 'outcome', 'confirming', 'remote-confirmed']);
      assert.equal(existsSync(`${prefix}result.json`), true);
    } else {
      assert.equal(outcome.status, 'STOP', scenario);
      const early = ['wrong-head', 'attempt-tamper', 'receipt-tamper', 'extra-child', 'unknown-sibling', 'observation-result', 'partial-claim', 'provider-drift'].includes(scenario);
      if (early) { assert.equal(preparations, 0); assert.equal(products, 0); assert.equal(disposed, 0); }
      else {
        assert.equal(preparations, 1); assert.equal(disposed, 1);
        const expectedStage = scenario === 'preflight-committed' || scenario === 'preflight-conflict' ? 'preflight'
          : scenario === 'ready-failure' ? 'ready-persist' : scenario === 'ready-link-failure' ? 'ready-link-persist'
          : scenario === 'started-partial' ? 'started-persist' : scenario === 'product-failure' ? 'product-bootstrap'
          : scenario === 'postflight-conflict' ? 'postflight-inspection' : scenario === 'outcome-partial' ? 'outcome-persist'
          : scenario === 'dispose-failure' ? 'input-dispose' : scenario === 'verification-failure' ? 'verification-persist'
          : scenario === 'lost-ack' ? 'provider-outcome-record' : scenario === 'terminal-failure' ? 'terminal-persist'
          : scenario === 'cancel-product' ? 'post-product-cancel' : scenario;
        assert.equal(outcome.failedStage, expectedStage, JSON.stringify(outcome));
        if (['lost-ack', 'terminal-failure'].includes(scenario)) assert.equal(outcome.databaseOutcome, 'committed');
        else if (products || scenario === 'started-partial') { assert.equal(outcome.databaseOutcome, 'unknown'); assert.equal(outcome.count, null); }
        else assert.equal(outcome.databaseOutcome, 'not_started');
      }
    }
    const counts = [preparations, products, inspections, disposed, p.writes.length];
    assert.equal((await invoke()).status, 'STOP'); assert.deepEqual([preparations, products, inspections, disposed, p.writes.length], counts);
    if (existsSync(`${prefix}started.json`)) {
      assert.equal((await continueReachabilityBootstrap(run, 'inspect', artifact, p.provider,
        () => { throw new Error('Legacy path must remain fenced'); }, abort.signal, expected)).status, 'STOP');
    }
    for (const file of originals) {
      if ((scenario === 'attempt-tamper' || scenario === 'post-product-baseline') && file.path.endsWith('.bootstrap-attempt.json')) continue;
      assert.equal(sha256(readFileSync(join(run.directory, file.path))), file.sha256);
    }
    assert.deepEqual([canonical(inventory(f.f.run.directory)), canonical(inventory(f.failed.directory))], f.retained.slice(0, 2));
    assert.equal(JSON.stringify(results).includes(env.APP_OPERATOR_AUTH_KEY), false); f.f.unchanged();
  });
});

test('fixed pretransaction native bootstrap keeps normal Auth and exact committed business state', {
  skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT || !process.env.MIGRATION_POSTGRES_BIN, timeout: 120000,
}, async t => {
  const bin = process.env.MIGRATION_POSTGRES_BIN!, root = mkdtempSync(join(realpathSync('/tmp'), 'esty-migration-'));
  const data = join(root, 'data'), commandEnv = { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, LC_ALL: 'C' };
  const command = (name: string, args: string[]) => {
    const result = spawnSync(join(bin, name), args, { env: commandEnv, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `Owned PostgreSQL ${name} failed; output withheld.`); return result.stdout;
  };
  let started = false, admin: Client | undefined;
  t.after(async () => {
    try { await admin?.end(); } finally {
      if (started) command('pg_ctl', ['-D', data, '-w', '-t', '10', '-m', 'fast', 'stop']);
      rmSync(root, { recursive: true, force: true });
    }
  });
  assert.match(command('postgres', ['--version']), /^postgres \(PostgreSQL\) 17\./);
  command('initdb', ['-D', data, '--username=fixture', '--auth=trust', '--no-locale', '--encoding=UTF8', '--no-sync']);
  command('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-w', '-t', '10',
    '-o', `-c listen_addresses='' -c unix_socket_directories=${root} -p 55439`, 'start']);
  started = true;
  const base = { host: root, port: 55439, database: 'postgres', user: 'fixture', connectionTimeoutMillis: 1000, statement_timeout: 3000, query_timeout: 5000 };
  admin = new Client(base); await admin.connect();
  assert.equal((await admin.query("SELECT current_setting('listen_addresses') AS listeners")).rows[0].listeners, '');
  await admin.query('CREATE ROLE app_runtime LOGIN NOINHERIT; CREATE ROLE app_operator LOGIN NOINHERIT');
  const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
  for (const scenario of ['success', 'auth-refusal', 'commit-unknown'] as const) await t.test(scenario, async sub => {
    const database = { ...base, database: scenario.replaceAll('-', '_') };
    await admin!.query(`CREATE DATABASE ${database.database}`);
    const client = new Client(database); await client.connect(); sub.after(() => client.end());
    await client.query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz); ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY');
    assert.equal((await runMigrations(database)).result, 'success');
    const f = await pretransactionFixture(sub), { env, userId } = bootstrapObservationInputs();
    env.APP_OPERATOR_DATABASE_URL = `postgresql://app_operator:synthetic@127.0.0.1:55439/${database.database}`;
    let authCalls = 0, writeTransactions = 0, lostCommit = false;
    const connect = Client.prototype.connect, query = Client.prototype.query;
    sub.mock.method(Client.prototype, 'connect', function(this: Client, ...args: unknown[]) {
      const connection = this as Client & { host: string; port: number; user: string };
      if (connection.host === '127.0.0.1') {
        assert.equal(connection.user, 'app_operator'); Object.assign(connection, { host: root, port: 55439 });
      }
      assert.equal(connection.host, root); return Reflect.apply(connect, this, args);
    });
    sub.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
      authCalls++; assert.equal(String(url), `${env.APP_AUTH_URL}/admin/users/${userId}`);
      assert.equal(options?.method, 'GET'); assert.equal(options?.body, undefined);
      return new Response(JSON.stringify({ id: userId, email: 'synthetic@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }),
        { status: scenario === 'auth-refusal' ? 403 : 200 });
    });
    sub.mock.method(Client.prototype, 'query', async function(this: Client, text: string, values?: unknown[]) {
      if (typeof text === 'string' && text.startsWith('BEGIN; SET LOCAL lock_timeout')) writeTransactions++;
      const result = await Reflect.apply(query, this, values === undefined ? [text] : [text, values]);
      if (scenario === 'commit-unknown' && writeTransactions && text === 'COMMIT' && !lostCommit) {
        lostCommit = true; throw new Error('Synthetic lost commit acknowledgement');
      }
      return result;
    });
    const invoke = () => continueReachabilityBootstrapPretransaction(f.run, artifact, f.p.provider,
      () => ({ env: { ...env }, dispose() {} }), f.evidence, sha256('synthetic-executable'), AbortSignal.timeout(30000), f.expected);
    const result = await invoke();
    assert.equal(authCalls, 1, 'Only normal product Auth verification is invoked.');
    assert.equal(writeTransactions, scenario === 'auth-refusal' ? 0 : 1);
    const rows: unknown[][] = [];
    for (const table of ['profiles', 'workspaces', 'memberships', 'audit_events']) rows.push((await client.query(`SELECT to_jsonb(t) AS row FROM app_private.${table} t`)).rows);
    if (scenario === 'success') {
      assert.equal(result.status, 'BOOTSTRAP_COMPLETE', JSON.stringify(result)); assert.equal(result.next, 'app-config');
      assert.equal(await inspectAppBootstrap(env), 'committed');
      const workspace = (await client.query('SELECT id,display_name,bootstrap_request_id FROM app_private.workspaces')).rows;
      assert.deepEqual(workspace, [{ id: env.APP_WORKSPACE_ID, display_name: env.APP_OPERATOR_WORKSPACE_NAME, bootstrap_request_id: env.APP_OPERATOR_APPROVAL_ID }]);
      assert.deepEqual((await client.query('SELECT user_id,display_name FROM app_private.profiles')).rows,
        [{ user_id: userId, display_name: env.APP_OPERATOR_PROFILE_NAME }]);
      assert.deepEqual((await client.query('SELECT user_id,workspace_id,role_code,status FROM app_private.memberships')).rows,
        [{ user_id: userId, workspace_id: env.APP_WORKSPACE_ID, role_code: 'owner', status: 'active' }]);
      assert.equal((await client.query("SELECT count(*)::integer AS count FROM app_private.audit_events WHERE action='workspace.bootstrap'")).rows[0].count, 1);
    } else {
      assert.equal(result.status, 'STOP'); assert.equal(result.databaseOutcome, 'unknown'); assert.equal(result.count, null);
      assert.equal(result.failedStage, 'product-bootstrap');
      if (scenario === 'auth-refusal') assert.deepEqual(rows, [[], [], [], []]);
      else assert.equal(await inspectAppBootstrap(env), 'committed');
    }
    assert.equal((await invoke()).status, 'STOP'); assert.equal(authCalls, 1);
    const after: unknown[][] = [];
    for (const table of ['profiles', 'workspaces', 'memberships', 'audit_events']) after.push((await client.query(`SELECT to_jsonb(t) AS row FROM app_private.${table} t`)).rows);
    assert.deepEqual(after, rows);
  });
});

test('fixed pretransaction immutable receipt reader enforces sealed metadata and stable raw bytes', {
  skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT, timeout: 180000,
}, async t => {
  const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
  for (const scenario of ['sealed-0400', 'maximum-size', 'mode-0600', 'mode-0444', 'symlink', 'parent-symlink',
    'parent-mode', 'directory', 'fifo', 'owner', 'hardlink', 'empty', 'oversize', 'hash', 'mtime-drift', 'ctime-drift', 'inode-drift',
    'mode-drift', 'owner-drift', 'nlink-drift', 'size-drift', 'path-replaced', 'short-read'] as const) await t.test(scenario, async sub => {
    const f = await pretransactionFixture(sub), receiptName = 'p2-name-fix/actual-bootstrap-result.json';
    const path = join(f.evidence, receiptName), bytes = readFileSync(path), parent = join(f.evidence, 'p2-name-fix');
    if (scenario === 'mode-0600') fs.chmodSync(path, 0o600);
    if (scenario === 'mode-0444') fs.chmodSync(path, 0o444);
    if (['empty', 'oversize', 'maximum-size', 'hash'].includes(scenario)) {
      fs.chmodSync(path, 0o600);
      const contents = scenario === 'empty' ? '' : scenario === 'hash' ? '{"changed":true}\n'
        : `"${'x'.repeat(scenario === 'maximum-size' ? 65533 : 65534)}"\n`;
      writeFileSync(path, contents); fs.chmodSync(path, 0o400);
      if (scenario !== 'hash') f.expected.receipts[receiptName] = sha256(readFileSync(path));
    }
    if (scenario === 'symlink') {
      const target = join(f.f.root, 'synthetic-receipt-target'); writeFileSync(target, bytes, { mode: 0o400 });
      fs.unlinkSync(path); fs.symlinkSync(target, path);
    }
    if (scenario === 'parent-symlink') {
      const target = join(f.f.root, 'synthetic-receipt-directory'); fs.renameSync(parent, target); fs.symlinkSync(target, parent);
    }
    if (scenario === 'parent-mode') fs.chmodSync(parent, 0o755);
    if (scenario === 'hardlink') fs.linkSync(path, join(f.f.root, 'synthetic-receipt-hardlink'));
    if (scenario === 'directory' || scenario === 'fifo') {
      fs.unlinkSync(path);
      if (scenario === 'directory') fs.mkdirSync(path, { mode: 0o700 });
      else assert.equal(spawnSync('/usr/bin/mkfifo', [path], { encoding: 'utf8', timeout: 5000 }).status, 0);
    }
    const before = canonical(inventory(f.run.directory));
    let preparations = 0, products = 0, inspections = 0, providerReads = 0, forbidden = 0;
    const descriptors = new Set<number>(), statReads = new Map<number, number>();
    const open = fs.openSync, close = fs.closeSync, stat = fs.fstatSync, read = fs.readSync;
    sub.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
      const fd = Reflect.apply(open, fs, args);
      if (String(args[0]) === path) { descriptors.add(fd); statReads.set(fd, 0); }
      return fd;
    });
    sub.mock.method(fs, 'closeSync', (fd: number) => { descriptors.delete(fd); return close(fd); });
    sub.mock.method(fs, 'fstatSync', (...args: Parameters<typeof fs.fstatSync>) => {
      const value = Reflect.apply(stat, fs, args);
      if (!descriptors.has(args[0]) || !('mtimeNs' in value)) return value;
      const count = (statReads.get(args[0]) ?? 0) + 1; statReads.set(args[0], count);
      const changes = scenario === 'owner' && count === 1 ? { uid: value.uid + 1n }
        : count !== 2 ? {} : scenario === 'mtime-drift' ? { mtimeNs: value.mtimeNs + 1n }
        : scenario === 'ctime-drift' ? { ctimeNs: value.ctimeNs + 1n }
        : scenario === 'inode-drift' ? { ino: value.ino + 1n }
        : scenario === 'mode-drift' ? { mode: value.mode | 0o200n }
        : scenario === 'owner-drift' ? { uid: value.uid + 1n }
        : scenario === 'nlink-drift' ? { nlink: value.nlink + 1n }
        : scenario === 'size-drift' ? { size: value.size + 1n } : {};
      return Object.assign(Object.create(Object.getPrototypeOf(value)), value, changes);
    });
    sub.mock.method(fs, 'readSync', (...args: Parameters<typeof fs.readSync>) => {
      if (descriptors.has(args[0]) && scenario === 'short-read') return 0;
      const count = Reflect.apply(read, fs, args);
      if (descriptors.has(args[0]) && scenario === 'path-replaced') {
        const replacement = join(f.f.root, 'synthetic-replacement'); writeFileSync(replacement, bytes, { mode: 0o400 });
        fs.renameSync(replacement, path);
      }
      return count;
    });
    const currentMain = f.p.provider.currentMain;
    sub.mock.method(f.p.provider, 'currentMain', async () => { providerReads++; return Reflect.apply(currentMain, f.p.provider, []); });
    sub.mock.method(globalThis, 'fetch', () => { forbidden++; throw new Error('No network in receipt verification.'); });
    sub.mock.method(Client.prototype, 'connect', () => { forbidden++; throw new Error('No database in receipt verification.'); });
    const { env } = bootstrapObservationInputs();
    const result = await continueReachabilityBootstrapPretransaction(f.run, artifact, f.p.provider,
      () => { preparations++; return { env: { ...env }, dispose() {} }; }, f.evidence, sha256('synthetic-executable'),
      AbortSignal.timeout(30000), f.expected, {
        inspect: async () => ++inspections === 1 ? 'absent' : 'committed',
        bootstrap: async () => { products++; },
      });
    assert.equal(forbidden, 0); assert.equal(descriptors.size, 0);
    if (scenario === 'sealed-0400' || scenario === 'maximum-size') {
      assert.equal(result.status, 'BOOTSTRAP_COMPLETE', JSON.stringify(result));
      assert.equal(preparations, 1); assert.equal(products, 1); assert.equal(providerReads, 1);
      assert.equal(fs.statSync(path).mode & 0o777, 0o400);
      assert.equal(sha256(readFileSync(path)), f.expected.receipts[receiptName]);
    } else {
      assert.equal(result.status, 'STOP'); assert.equal(result.stage, 'guard'); assert.equal(result.failedStage, 'guard');
      assert.equal(preparations, 0); assert.equal(products, 0); assert.equal(providerReads, 0);
      assert.equal(canonical(inventory(f.run.directory)), before);
      assert.equal(readdirSync(f.f.root).some(name => name.startsWith(`${f.run.packet.runId}.bootstrap-pretransaction-continuation-`)), false);
    }
    assert.equal(JSON.stringify(result).includes(env.APP_OPERATOR_AUTH_KEY), false);
    f.f.unchanged();
  });
});

async function retainedInspectionFixture(t: TestContext, artifact: ReturnType<typeof verifyArtifact>) {
  const f = await pretransactionFixture(t), { env } = bootstrapObservationInputs(), productExecutable = sha256('synthetic-product-executable');
  let inspections = 0;
  const stopped = await continueReachabilityBootstrapPretransaction(f.run, artifact, f.p.provider,
    () => ({ env: { ...env }, dispose() { throw new Error('Synthetic retained cleanup refusal'); } }),
    f.evidence, productExecutable, AbortSignal.timeout(30000), f.expected,
    { inspect: async () => ++inspections === 1 ? 'absent' : 'committed', bootstrap: async () => {} });
  assert.equal(stopped.failedStage, 'input-dispose'); assert.equal(stopped.events, 16);
  const reportNames = ['pretransaction-continuation/immutable-receipt-fix/actual-product-bootstrap-run.json',
    'pretransaction-continuation/immutable-receipt-fix/actual-product-bootstrap-durable-outcome.json'] as const;
  mkdirSync(join(f.evidence, 'pretransaction-continuation/immutable-receipt-fix'), { recursive: true, mode: 0o700 });
  for (const name of reportNames) {
    writeReleaseEvidence(join(f.evidence, name), { fixture: name, result: stopped });
    fs.chmodSync(join(f.evidence, name), 0o400);
  }
  const raw = (path: string) => sha256(readFileSync(path)), id = f.run.packet.runId;
  const continuation = join(f.f.root, `${id}.bootstrap-pretransaction-continuation-`);
  return { ...f, env, continuation, expected: { ...f.expected, head: f.state().head,
    inventory: sha256(canonical(inventory(f.run.directory))), productExecutable,
    claim: raw(`${continuation}started.json`), readyLink: raw(`${continuation}ready.json`), terminal: raw(`${continuation}result.json`),
    ready: raw(join(f.run.directory, `${id}.bootstrap-ready.json`)),
    startedFile: raw(join(f.run.directory, `activation/${id}/014.json`)),
    outcomeFile: raw(join(f.run.directory, `activation/${id}/015.json`)),
    receipts: { ...f.expected.receipts, [reportNames[0]]: raw(join(f.evidence, reportNames[0])),
      [reportNames[1]]: raw(join(f.evidence, reportNames[1])) } } };
}

test('retained bootstrap inspection is exact, read-only and one-shot across failures', {
  skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT, timeout: 240000,
}, async t => {
  const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
  for (const scenario of ['committed', 'absent', 'conflict', 'concurrent', 'wrong-head', 'wrong-inventory',
    'claim-tamper', 'ready-link-tamper', 'terminal-tamper', 'receipt-tamper', 'extra-sibling', 'extra-file',
    'verification', 'partial-observation', 'provider-refusal', 'provider-drift', 'input-refusal',
    'inspection-refusal', 'inspection-drift', 'cancelled', 'cleanup-refusal', 'primary-and-cleanup',
    'terminal-partial'] as const) await t.test(scenario, async sub => {
    const f = await retainedInspectionFixture(sub, artifact), id = f.run.packet.runId, cancel = new AbortController();
    const prefix = join(f.f.root, `${id}.bootstrap-retained-inspection-`);
    if (scenario === 'wrong-head') f.expected.head = sha256('wrong head');
    if (scenario === 'wrong-inventory') f.expected.inventory = sha256('wrong inventory');
    if (scenario.endsWith('-tamper')) {
      const path = scenario === 'receipt-tamper' ? join(f.evidence, 'p2-name-fix/actual-bootstrap-result.json')
        : `${f.continuation}${scenario === 'claim-tamper' ? 'started' : scenario === 'ready-link-tamper' ? 'ready' : 'result'}.json`;
      fs.chmodSync(path, 0o600); writeFileSync(path, '{}'); if (scenario === 'receipt-tamper') fs.chmodSync(path, 0o400);
    }
    if (scenario === 'extra-sibling') writeReleaseEvidence(`${f.continuation}unknown.json`, {});
    if (scenario === 'extra-file') writeReleaseEvidence(join(f.run.directory, 'unexpected.json'), {});
    if (scenario === 'verification') writeReleaseEvidence(join(f.run.directory, `${id}.bootstrap-verification.json`), {});
    if (scenario === 'partial-observation') writeReleaseEvidence(`${prefix}started.json`, {});
    if (scenario === 'cancelled') cancel.abort();
    const before = canonical(inventory(f.run.directory));
    const originals = ['started', 'ready', 'result'].map(suffix => readFileSync(`${f.continuation}${suffix}.json`));
    let db = 0, prepares = 0, disposals = 0, providerReads = 0, writes = 0, forbidden = 0;
    sub.mock.method(globalThis, 'fetch', async () => { forbidden++; throw new Error('Auth forbidden'); });
    sub.mock.method(Client.prototype, 'connect', async () => { forbidden++; throw new Error('Real DB forbidden'); });
    const provider = { ...f.p.provider, async currentMain() {
      providerReads++; if (scenario === 'provider-refusal') throw new Error('private provider sentinel');
      if (scenario === 'provider-drift') writeReleaseEvidence(join(f.run.directory, 'provider-drift.json'), {});
      return f.p.provider.currentMain();
    }, async record() { writes++; throw new Error('Provider write forbidden'); } };
    if (scenario === 'terminal-partial') {
      const open = fs.openSync;
      sub.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
        if (String(args[0]) === `${prefix}result.json` && (Number(args[1]) & fs.constants.O_EXCL)) {
          writeFileSync(`${prefix}result.json`, '{', { mode: 0o600 }); throw new Error('Synthetic partial result');
        }
        return Reflect.apply(open, fs, args);
      });
    }
    const invoke = () => inspectRetainedReachabilityBootstrap(f.run, artifact, provider, () => {
      prepares++; if (scenario === 'input-refusal') throw new Error('private input sentinel');
      return { env: { ...f.env }, dispose() {
        disposals++; if (['cleanup-refusal', 'primary-and-cleanup'].includes(scenario)) throw new Error('private cleanup sentinel');
      } };
    }, f.evidence, sha256('synthetic-inspection-executable'), cancel.signal, f.expected, async () => {
      db++; await new Promise(resolve => setImmediate(resolve));
      if (['inspection-refusal', 'primary-and-cleanup'].includes(scenario)) throw new Error('private inspection sentinel');
      if (scenario === 'inspection-drift') writeReleaseEvidence(join(f.run.directory, 'inspection-drift.json'), {});
      return scenario === 'absent' ? 'absent' : scenario === 'conflict' ? 'conflict' : 'committed';
    });
    const results = scenario === 'concurrent' ? await Promise.all([invoke(), invoke()]) : [await invoke()];
    const observed = results.find(result => result.inspection !== null) ?? results[0]!;
    if (scenario === 'committed' || scenario === 'concurrent') {
      assert.equal(results.filter(result => result.status === 'INSPECTED').length, 1);
      assert.equal(observed.inspection, 'committed'); assert.equal(observed.head, f.expected.head);
    } else assert.ok(results.every(result => result.status === 'STOP'));
    const reachesDb = ['committed', 'absent', 'conflict', 'concurrent', 'inspection-refusal', 'inspection-drift',
      'cleanup-refusal', 'primary-and-cleanup', 'terminal-partial'].includes(scenario);
    assert.equal(db, reachesDb ? 1 : 0);
    if (scenario === 'absent' || scenario === 'conflict') {
      assert.equal(observed.inspection, scenario); assert.equal(observed.failedStage, 'inspection');
    }
    if (scenario === 'primary-and-cleanup') {
      assert.equal(observed.failedStage, 'inspection'); assert.equal(observed.cleanupFailed, true);
    }
    if (scenario === 'cleanup-refusal') {
      assert.equal(observed.failedStage, 'input-dispose'); assert.equal(observed.inspection, 'committed');
    }
    if (!['provider-drift', 'inspection-drift'].includes(scenario)) assert.equal(canonical(inventory(f.run.directory)), before);
    assert.deepEqual(['started', 'ready', 'result'].map(suffix => readFileSync(`${f.continuation}${suffix}.json`)), originals);
    assert.equal(f.state().events.length, 16); assert.equal(writes, 0); assert.equal(forbidden, 0);
    assert.equal(disposals, prepares - (scenario === 'input-refusal' ? 1 : 0));
    const counts = [db, prepares, providerReads, disposals];
    assert.equal((await invoke()).status, 'STOP'); assert.deepEqual([db, prepares, providerReads, disposals], counts);
    assert.doesNotMatch(JSON.stringify(results), /private .* sentinel|SYNTHETIC_PRIVATE_KEY|Synthetic Owner/);
    f.f.unchanged();
  });
});

test('retained bootstrap native inspection reads exact state without Auth or writes', {
  skip: !original || !promotion || !process.env.RECOVERY_ORIGIN_TEST_ARTIFACT || !process.env.MIGRATION_POSTGRES_BIN, timeout: 120000,
}, async t => {
  const bin = process.env.MIGRATION_POSTGRES_BIN!, root = mkdtempSync(join(realpathSync('/tmp'), 'esty-migration-'));
  const data = join(root, 'data'), commandEnv = { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, LC_ALL: 'C' };
  const command = (name: string, args: string[]) => {
    const result = spawnSync(join(bin, name), args, { env: commandEnv, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `Owned PostgreSQL ${name} failed; output withheld.`); return result.stdout;
  };
  let started = false, admin: Client | undefined;
  t.after(async () => {
    try { await admin?.end(); } finally {
      if (started) command('pg_ctl', ['-D', data, '-w', '-t', '10', '-m', 'fast', 'stop']);
      rmSync(root, { recursive: true, force: true });
    }
  });
  assert.match(command('postgres', ['--version']), /^postgres \(PostgreSQL\) 17\./);
  command('initdb', ['-D', data, '--username=fixture', '--auth=trust', '--no-locale', '--encoding=UTF8', '--no-sync']);
  command('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-w', '-t', '10',
    '-o', `-c listen_addresses='' -c unix_socket_directories=${root} -p 55439`, 'start']);
  started = true;
  const base = { host: root, port: 55439, database: 'postgres', user: 'fixture', connectionTimeoutMillis: 1000, statement_timeout: 3000, query_timeout: 5000 };
  admin = new Client(base); await admin.connect();
  assert.equal((await admin.query("SELECT current_setting('listen_addresses') AS listeners")).rows[0].listeners, '');
  await admin.query('CREATE ROLE app_runtime LOGIN NOINHERIT; CREATE ROLE app_operator LOGIN NOINHERIT');
  const artifact = verifyArtifact(process.env.RECOVERY_ORIGIN_TEST_ARTIFACT!, target.artifactDigest);
  for (const scenario of ['committed', 'absent', 'extra-audit', 'wrong-name'] as const) await t.test(scenario, async sub => {
    const database = { ...base, database: 'inspection_' + scenario.replaceAll('-', '_') };
    await admin!.query(`CREATE DATABASE ${database.database}`);
    const client = new Client(database); await client.connect(); sub.after(() => client.end());
    await client.query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz); ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY');
    assert.equal((await runMigrations(database)).result, 'success');
    const f = await retainedInspectionFixture(sub, artifact), env = f.env;
    env.APP_OPERATOR_DATABASE_URL = `postgresql://app_operator:synthetic@127.0.0.1:55439/${database.database}`;
    const identity = bootstrapIdentity(env.APP_WORKSPACE_ID, { userId: env.APP_OPERATOR_USER_ID,
      profileName: env.APP_OPERATOR_PROFILE_NAME, workspaceName: env.APP_OPERATOR_WORKSPACE_NAME, approvalId: env.APP_OPERATOR_APPROVAL_ID });
    if (scenario !== 'absent') {
      await client.query('BEGIN');
      await client.query('INSERT INTO app_private.profiles(user_id,display_name) VALUES($1,$2)',
        [identity.userId, scenario === 'wrong-name' ? 'Different fixture name' : identity.profileName]);
      await client.query('INSERT INTO app_private.workspaces(id,display_name,bootstrap_request_id,bootstrap_fingerprint) VALUES($1,$2,$3,$4)',
        [identity.workspaceId, identity.workspaceName, identity.approvalId, identity.fingerprint]);
      await client.query("INSERT INTO app_private.memberships(workspace_id,user_id,role_code,status) VALUES($1,$2,'owner','active')",
        [identity.workspaceId, identity.userId]);
      for (let index = 0; index < (scenario === 'extra-audit' ? 2 : 1); index++) {
        await client.query(`INSERT INTO app_private.audit_events
          (id,workspace_id,actor_user_id,action,target_id,outcome,request_id,after_revision,after_role,after_status)
          VALUES($1,$2,$3,'workspace.bootstrap',$2,'accepted',$4,1,'owner','active')`,
        [randomUUID(), identity.workspaceId, identity.userId, index ? randomUUID() : identity.approvalId]);
      }
      await client.query('COMMIT');
    }
    const rows = async () => {
      const result: unknown[][] = [];
      for (const table of ['profiles', 'workspaces', 'memberships', 'audit_events']) {
        result.push((await client.query(`SELECT to_jsonb(t) AS row FROM app_private.${table} t ORDER BY to_jsonb(t)::text`)).rows);
      }
      return result;
    };
    const before = await rows(), journal = canonical(inventory(f.run.directory));
    let connections = 0, auth = 0; const statements: string[] = [];
    const connect = Client.prototype.connect, query = Client.prototype.query;
    sub.mock.method(Client.prototype, 'connect', function(this: Client, ...args: unknown[]) {
      const connection = this as Client & { host: string; port: number; user: string };
      assert.equal(connection.user, 'app_operator'); assert.equal(connection.host, '127.0.0.1');
      Object.assign(connection, { host: root, port: 55439 }); connections++;
      return Reflect.apply(connect, this, args);
    });
    sub.mock.method(Client.prototype, 'query', function(this: Client, text: string, values?: unknown[]) {
      if ((this as Client & { user: string }).user === 'app_operator') {
        assert.match(text, /^(?:BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY|SELECT |COMMIT)/); statements.push(text);
      }
      return Reflect.apply(query, this, values === undefined ? [text] : [text, values]);
    });
    sub.mock.method(globalThis, 'fetch', async () => { auth++; throw new Error('Auth forbidden'); });
    const invoke = () => inspectRetainedReachabilityBootstrap(f.run, artifact, f.p.provider,
      () => ({ env: { ...env }, dispose() {} }), f.evidence, sha256('synthetic-inspection-executable'),
      AbortSignal.timeout(30000), f.expected);
    const result = await invoke();
    assert.equal(result.status, scenario === 'committed' ? 'INSPECTED' : 'STOP');
    assert.equal(result.inspection, scenario === 'committed' ? 'committed' : scenario === 'absent' ? 'absent' : 'conflict');
    assert.equal(connections, 1); assert.equal(auth, 0);
    assert.equal(statements[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(statements.filter(text => text.startsWith('SELECT ')).length, 4); assert.equal(statements.at(-1), 'COMMIT');
    assert.deepEqual(await rows(), before); assert.equal(canonical(inventory(f.run.directory)), journal);
    assert.equal((await invoke()).status, 'STOP'); assert.equal(connections, 1); assert.equal(statements.length, 6);
    assert.equal(existsSync(join(f.run.directory, `${f.run.packet.runId}.bootstrap-verification.json`)), false);
    f.f.unchanged();
  });
});
