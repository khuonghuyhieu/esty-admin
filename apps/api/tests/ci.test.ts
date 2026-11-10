import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { gzipSync } from 'node:zlib';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { cp, chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { artifactTarget, assembleArtifact, canonical, inventory, readArtifactFile, sha256, verifyArtifact } from '../scripts/artifact.js';
import type { FileRecord, VerifiedArtifact } from '../scripts/artifact.js';
import { artifactFixture, routineMigrationFixture } from './artifact-fixture.js';
import { checksContext } from '../scripts/ci.js';
import { acknowledgedId, deliver, deliverActivationCandidate, deliveryContext } from '../scripts/ci-delivery.js';
import { createActivationProvider, createProvider, repository } from '../scripts/ci-provider.js';
import type { ActivationProvider, DeliveryProvider, RunIdentity } from '../scripts/ci-provider.js';
import { verifyUploadedArchive } from '../scripts/ci-archive.js';
import { checkHostedHttp } from '../scripts/hosted-acceptance.js';
import type { CommandResult } from '../scripts/ci-tools.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { activationPhases, appendActivationEvent, createActivationJournal, finishActivationJournal, importFrontendJournal,
  readActivationJournal, reserveActivationJournal, saveActivationConfigurationReceipt } from '../scripts/activation-journal.js';
import type { ActivationPacket, ActivationPhase } from '../scripts/activation-journal.js';
import { completeActivation, confirmActivationPhase, executeActivationPhase, reconcileActivationAcknowledgement, reconcileActivationEffect } from '../scripts/activation.js';
import { phaseInputEnvironment } from '../scripts/activation-inputs.js';
import { configureActivation, ActivationConfigurationError } from '../scripts/activation-configuration.js';
import type { ActivationConfigurationReceipt } from '../scripts/activation-configuration.js';
import { readEvidence, writeReleaseEvidence } from '../scripts/release-journal.js';
import { activationSchema } from '../src/config/schema-transition.js';
import { approvedSchema, authorizeRoutineMigration, confirmedMigration, continueRoutineMigration, routinePacket } from '../scripts/ci-migrations.js';
import type { RoutineMigrationPacket, RoutineSchema } from '../scripts/ci-migrations.js';
import type { RoutineProvider } from '../scripts/ci-provider.js';
import type { MigrationReport } from '../scripts/migrations.js';
import { canonical as retainedCanonical, githubReader, manualContext, readSelection, retainedActivation,
  selectRetained, validateSelection, verifyRelay, verifySelectedBundle, verifyWorkflowHead } from '../scripts/activation-retained.mjs';
import { executeManualAction } from '../scripts/manual-activation.mjs';
const oldSchema: RoutineSchema = { digest: activationSchema.oldDigest };

interface Fixture { artifact: VerifiedArtifact; dispose(): Promise<void> }
async function fixture(): Promise<Fixture> {
  const migration = readFileSync(new URL('../../migrations/1792972800000-foundation.mjs', import.meta.url), 'utf8');
  const base = await artifactFixture('release', migration);
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'ci'), config: base.config,
    source: { ...base.artifact.manifest.source, repository: `https://github.com/${repository}` },
    migrations: base.artifact.manifest.migrations, build: base.artifact.manifest.build });
  return { artifact, dispose: base.dispose };
}
function context(): NodeJS.ProcessEnv {
  return { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push',
    GITHUB_RUN_ATTEMPT: '1', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/be-delivery.yml@refs/heads/main`,
    BE_DELIVERY_ENABLED: 'true', BE_DELIVERY_ENVIRONMENT: 'be-production', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123' };
}
const run: RunIdentity = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), run: '123' };
const credentials = { github: 'synthetic-github-token', vercel: 'synthetic-vercel-token', bearer: 'c'.repeat(64), bypass: 'synthetic-platform-bypass' };

test('untrusted, stale-attempt and unactivated contexts cannot enter production', () => {
  assert.deepEqual(deliveryContext(context(), run.tree), run);
  for (const change of [{ GITHUB_REPOSITORY: 'fork/esty-admin' }, { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_RUN_ATTEMPT: '2' },
    { GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/other.yml@refs/heads/main` }, { BE_DELIVERY_ENABLED: 'false' },
    { BE_DELIVERY_ENVIRONMENT: 'preview' }, { GITHUB_SHA: 'invalid' }, { GITHUB_RUN_ID: '0' }]) {
    assert.throws(() => deliveryContext({ ...context(), ...change }, run.tree));
  }
  assert.equal(checksContext({ ...context(), GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/1/merge' }), 'development');
  assert.throws(() => checksContext({ ...context(), GITHUB_EVENT_NAME: 'pull_request_target' }));
  assert.throws(() => checksContext({ ...context(), GITHUB_REF: 'refs/heads/not-main' }));
});

function harness(artifact: VerifiedArtifact, failure?: string) {
  const events: string[] = []; let creates = 0, promotions = 0, mainChecks = 0, alias = 'dpl_previous';
  const step = (name: string) => { events.push(name); if (failure === name) throw new Error('synthetic confidential failure'); };
  const provider: DeliveryProvider = {
    async currentMain() { step(`main${++mainChecks}`); }, async preflight() { step('preflight'); return alias; },
    async reserve() { step('reserve'); return 1; }, async record(_id, state, description) { step(`${state}:${description}`); },
    async inspect(id) { step('inspect'); return { id, origin: 'https://synthetic.vercel.app', ready: true }; },
    async attest() { step('attest'); }, async binding(id) { step('binding'); assert.equal(id, alias); },
    async http(_origin, candidate) { step(candidate ? 'candidate_http' : 'production_http'); },
  };
  const input = { artifact, run, schema: oldSchema, provider, signal: AbortSignal.timeout(10000),
    receipt(event: Record<string, unknown>) { step(`receipt:${event.phase}`); },
    cli: {
      async create(): Promise<CommandResult> { creates++; step('create'); return { code: 0, stdout: JSON.stringify({ deployment: { id: 'dpl_candidate' } }), aborted: false }; },
      async promote() { promotions++; step('promote'); alias = 'dpl_candidate'; return { code: 0, stdout: '', aborted: false }; },
    },
  };
  return { input, events, counts: () => ({ creates, promotions }) };
}
test('exact current-schema candidate acceptance precedes one promotion and final alias acceptance', async t => {
  const f = await fixture(); t.after(f.dispose);
  assert.equal(f.artifact.manifest.migrationDigest, activationSchema.oldDigest);
  const h = harness(f.artifact); assert.equal(await deliver(h.input), 'dpl_candidate');
  assert.deepEqual(h.counts(), { creates: 1, promotions: 1 });
  assert.ok(h.events.indexOf('receipt:acknowledged') < h.events.indexOf('inspect'));
  assert.ok(h.events.indexOf('candidate_http') < h.events.indexOf('promote'));
  assert.ok(h.events.indexOf('production_http') < h.events.indexOf('success:accepted:dpl_candidate'));
  assert.ok(h.events.indexOf('receipt:create_intent') < h.events.indexOf('create'));
});
test('current-only refuses an unapproved app schema and accepts explicitly approved TARGET without a migration phase', async t => {
  const base = await artifactFixture();
  t.after(base.dispose);
  const files = base.artifact.manifest.source.files.filter(entry => !entry.path.startsWith('apps/api/migrations/'));
  for (const migration of migrationManifest) {
    const path = `apps/api/migrations/${migration.name}.mjs`;
    const content = readFileSync(new URL(`../../migrations/${migration.name}.mjs`, import.meta.url));
    await writeFile(join(base.operator, path), content);
    files.push(file(path, content, 0o644));
  }
  const artifact = await assembleArtifact({
    raw: base.raw, operator: base.operator, destination: join(base.root, 'app-schema'), config: base.config,
    source: { ...base.artifact.manifest.source, repository: `https://github.com/${repository}`, files, digest: sha256(canonical(files)) },
    migrations: [...migrationManifest], build: base.artifact.manifest.build,
  });
  verifyArtifact(artifact.root, artifact.digest, { revision: run.revision, migrationDigest: artifact.manifest.migrationDigest,
    repository: `https://github.com/${repository}`, release: true });
  assert.notEqual(artifact.manifest.migrationDigest, activationSchema.oldDigest);
  const h = harness(artifact);
  await assert.rejects(deliver(h.input));
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  assert.deepEqual(h.events, []);
  const approved = harness(artifact); approved.input.schema = { digest: activationSchema.targetDigest };
  assert.equal(await deliver(approved.input), 'dpl_candidate');
  assert.deepEqual(approved.counts(), { creates: 1, promotions: 1 });
  let requests = 0;
  assert.throws(() => createProvider(artifact, run, oldSchema, credentials, AbortSignal.timeout(10000),
    async () => { requests++; throw new Error('Unexpected transport.'); }));
  assert.equal(requests, 0);
  for (const value of [undefined, '', 'not-a-digest']) assert.throws(() => approvedSchema(value));
});

function migrationPacketFor(artifact: VerifiedArtifact): RoutineMigrationPacket {
  return { version: 1, revision: run.revision, tree: run.tree, target: 'local', previous: migrationManifest,
    migrations: artifact.manifest.migrations, migrationInputDigest: sha256('synthetic-input'),
    predecessor: { id: 'dpl_previous', revision: 'e'.repeat(40), artifact: sha256('prior'), configDigest: sha256('config') },
    compatibilityApproval: sha256('reviewed-compatible-predecessor'), recoveryApproval: sha256('reviewed-recovery') };
}
test('routine migration approval rejects initial activation, altered prior checksums and unbound source', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact);
  assert.deepEqual(routinePacket(packet, sha256(canonical(packet)), f.artifact, run), packet);
  for (const changed of [{ ...packet, previous: packet.previous.slice(0, 1) },
    { ...packet, previous: packet.migrations }, { ...packet, previous: [...packet.previous].reverse() },
    { ...packet, previous: packet.previous.map((item, index) => index ? item : { ...item, sha256: 'f'.repeat(64) }) },
    { ...packet, revision: 'f'.repeat(40) }, { ...packet, compatibilityApproval: '' },
    { ...packet, recoveryApproval: '' }, { ...packet, extra: true }]) {
    assert.throws(() => routinePacket(changed, sha256(canonical(changed)), f.artifact, run));
  }
  assert.throws(() => routinePacket(packet, '0'.repeat(64), f.artifact, run));
});

test('routine migration authorization is durable, confirmed and cannot be repeated after a lost acknowledgement', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineSchema = {
    digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  for (const fail of ['compatible', 'reserve', 'record', 'confirm', 'none']) {
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-routine-authorization-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const h = harness(f.artifact), events: string[] = [];
    const step = (name: string) => { events.push(name); if (fail === name) throw new Error('Synthetic unknown acknowledgement.'); };
    const provider: RoutineProvider = { ...h.input.provider, async compatiblePredecessor() { step('compatible'); },
      async reserve() { step('reserve'); return 44; }, async record() { step('record'); },
      async confirmRoutineJournal() { step('confirm'); } };
    const input = { artifact: f.artifact, run, schema, provider, directory };
    if (fail === 'none') {
      await authorizeRoutineMigration(input);
      assert.deepEqual(events, ['compatible', 'reserve', 'record', 'confirm']);
      assert.equal((readEvidence(join(directory, 'migration-authorized.json')).value as { journal: number }).journal, 44);
    } else {
      await assert.rejects(authorizeRoutineMigration(input));
      assert.equal(existsSync(join(directory, 'migration-authorized.json')), false);
    }
    const calls = [...events]; await assert.rejects(authorizeRoutineMigration(input)); assert.deepEqual(events, calls);
    await assert.rejects(continueRoutineMigration(input)); assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  }
});

test('routine committed continuation rejects unknown, incomplete or changed migration outcomes before provider work', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineSchema = {
    digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  const report: MigrationReport = { run_id: randomUUID(), source_revision: run.revision, target: 'local',
    manifest_digest: schema.digest, started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:01.000Z',
    duration_ms: 1000, result: 'success', stage: 'verification', failed_version: null, database_outcome: 'committed',
    before: packet.previous.map(item => item.name), after: packet.migrations.map(item => item.name),
    attempted: packet.migrations.slice(packet.previous.length).map(item => ({ ...item, outcome: 'applied_committed' })), reporting: 'written' };
  assert.equal(confirmedMigration(report, packet), true);
  for (const change of [{ database_outcome: 'unknown' }, { database_outcome: 'rolled_back' }, { reporting: 'failed' },
    { before: [] }, { after: [] }, { attempted: [] }, { source_revision: 'f'.repeat(40) }]) {
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-routine-outcome-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const auth = { version: 1, packetDigest: schema.migration!.digest, artifact: f.artifact.digest,
      run, journal: 44, predecessor: 'dpl_previous' };
    const broken = { ...report, ...change } as MigrationReport;
    writeReleaseEvidence(join(directory, 'migration-authorized.json'), auth);
    writeReleaseEvidence(join(directory, 'migration-outcome.json'), { authorization: sha256(canonical(auth)), report: broken });
    writeReleaseEvidence(join(directory, 'migration-confirmed.json'), { authorization: sha256(canonical(auth)), reportDigest: sha256(canonical(broken)) });
    let calls = 0;
    const provider: RoutineProvider = { ...harness(f.artifact).input.provider,
      async compatiblePredecessor() { calls++; }, async confirmRoutineJournal() { calls++; } };
    await assert.rejects(continueRoutineMigration({ artifact: f.artifact, run, schema, directory, provider }));
    assert.equal(calls, 0);
  }
});

test('routine remote confirmation binds run, packet and artifact rather than trusting a success-shaped status', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineSchema = {
    digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  const description = `migration_intent:${schema.migration!.digest}`;
  const valid = { id: 44, sha: run.revision, task: 'deploy:esty-be-ci', environment: 'be-production',
    payload: { version: 1, ...run, migrationPacket: schema.migration!.digest, artifact: f.artifact.digest,
      sourceDigest: f.artifact.manifest.source.digest, migrationDigest: schema.digest, project: artifactTarget.project } };
  for (const change of [{}, { artifact: 'f'.repeat(64) }, { migrationPacket: 'f'.repeat(64) }, { run: '124' },
    { tree: 'f'.repeat(40) }, { migrationDigest: activationSchema.oldDigest }]) {
    const provider = createProvider(f.artifact, run, schema, credentials, AbortSignal.timeout(10000),
      async raw => Response.json(String(raw).includes('/statuses') ? [{ state: 'in_progress', description }]
        : { ...valid, payload: { ...valid.payload, ...change } }));
    if (Object.keys(change).length) await assert.rejects(provider.confirmRoutineJournal(44, description));
    else await provider.confirmRoutineJournal(44, description);
  }
  const unconfirmed = createProvider(f.artifact, run, schema, credentials, AbortSignal.timeout(10000),
    async raw => Response.json(String(raw).includes('/statuses') ? [{ state: 'success', description }] : valid));
  await assert.rejects(unconfirmed.confirmRoutineJournal(44, description));
});

test('routine migration refuses an incompatible predecessor before SQL authorization', async t => {
  const f = await routineMigrationFixture(); t.after(f.dispose);
  const packet = migrationPacketFor(f.artifact), schema: RoutineSchema = {
    digest: f.artifact.manifest.migrationDigest, migration: { packet, digest: sha256(canonical(packet)) } };
  for (const mismatch of ['source', 'artifact', 'region', 'configuration']) {
    let http = 0;
    const provider = createProvider(f.artifact, run, schema, credentials, AbortSignal.timeout(10000), async raw => {
      const url = String(raw);
      if (url.includes('/domains/')) return Response.json({ name: 'api.lovora.us', projectId: artifactTarget.project, verified: true });
      if (url.includes('/aliases/')) return Response.json({ alias: 'api.lovora.us', projectId: artifactTarget.project, deploymentId: 'dpl_previous' });
      if (url.includes('/deployments/')) return Response.json({ id: 'dpl_previous', projectId: artifactTarget.project,
        ownerId: artifactTarget.owner, target: 'production', readyState: 'READY', regions: [mismatch === 'region' ? 'iad1' : 'icn1'],
        meta: { sourceCommit: mismatch === 'source' ? 'f'.repeat(40) : packet.predecessor.revision,
          artifactSha256: mismatch === 'artifact' ? 'f'.repeat(64) : packet.predecessor.artifact } });
      http++; return Response.json({ status: 'ok' }, { headers: { 'x-activation-config-digest': 'f'.repeat(64) } });
    });
    await assert.rejects(provider.compatiblePredecessor());
    assert.equal(http, mismatch === 'configuration' ? 1 : 0);
  }
});
test('stale source, previous intent, persistence and candidate failures prevent creation or promotion', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const failure of ['main1', 'preflight', 'reserve', 'receipt:reserved', 'in_progress:create_intent_unknown_until_acknowledged',
    'main2', 'receipt:create_intent', 'in_progress:ack:dpl_candidate', 'attest', 'candidate_http', 'main3', 'receipt:promotion_intent']) {
    await t.test(failure, async () => {
      const h = harness(f.artifact, failure); await assert.rejects(deliver(h.input));
      assert.equal(h.counts().promotions, 0);
      if (['main1', 'preflight', 'reserve', 'receipt:reserved', 'in_progress:create_intent_unknown_until_acknowledged', 'main2', 'receipt:create_intent'].includes(failure)) {
        assert.equal(h.counts().creates, 0);
      }
      assert.equal(h.events.some(event => event.startsWith('success:')), false);
    });
  }
  const stale = harness(f.artifact); stale.input.run = { ...run, tree: 'd'.repeat(40) };
  await assert.rejects(deliver(stale.input)); assert.deepEqual(stale.counts(), { creates: 0, promotions: 0 });
});
test('nonzero, interrupted and lost create responses retain known or unknown identity without promotion', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const result of [{ code: 1, stdout: '{"deployment":{"id":"dpl_known"}}', aborted: false },
    { code: null, stdout: '{"deployment":{"id":"dpl_known"}}', aborted: true }, { code: 0, stdout: '', aborted: false }]) {
    const h = harness(f.artifact);
    h.input.cli.create = async () => result;
    await assert.rejects(deliver(h.input), /retained intent/);
    assert.equal(h.counts().promotions, 0); assert.equal(h.events.includes('inspect'), false);
    assert.equal(h.events.includes('receipt:acknowledged'), result.stdout !== '');
  }
  assert.equal(acknowledgedId('{"url":"https://guess.vercel.app"}'), undefined);
  assert.equal(acknowledgedId('{"deployment":{"id":"../../bad"}}'), undefined);
});
test('failed promotion or final domain acceptance never clears the durable fence', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const failure of ['promote', 'production_http', 'receipt:accepted']) {
    const h = harness(f.artifact, failure); await assert.rejects(deliver(h.input));
    assert.equal(h.counts().promotions, 1); assert.equal(h.events.some(event => event.startsWith('success:')), false);
    assert.ok(h.events.includes('error:unresolved:dpl_candidate'));
  }
});

function tar(entries: Array<{ path: string; content: Buffer; mode: number; type?: string }>): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    header.write(entry.path, 0, 100); header.write(entry.mode.toString(8).padStart(7, '0') + '\0', 100);
    header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(entry.content.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header.write(entry.type ?? '0', 156); header.write('ustar\0', 257);
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, entry.content, Buffer.alloc((512 - entry.content.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024)); return gzipSync(Buffer.concat(chunks));
}
function file(path: string, content: Buffer, mode = 0o444): FileRecord {
  return { path, mode, size: content.length, sha256: sha256(content), sha1: createHash('sha1').update(content).digest('hex') };
}
test('archive bytes, identities and modes must match; links, traversal, duplicates and malformed headers fail', () => {
  const content = Buffer.from('actual content'), path = '.vercel/output/config.json', expected = [file(path, content)];
  const good = { path, content, mode: 0o444 };
  const verify = (bytes: Buffer) => verifyUploadedArchive(bytes, expected, createHash('sha1').update(bytes).digest('hex'));
  verify(tar([good]));
  for (const entries of [[{ ...good, content: Buffer.from('changed') }], [{ ...good, mode: 0o644 }],
    [{ ...good, path: '../secret' }], [{ ...good, type: '2' }], [good, good], [], [{ ...good, path: '.vercel/output/extra' }]]) {
    assert.throws(() => verify(tar(entries)));
  }
  const bytes = tar([good]); assert.throws(() => verifyUploadedArchive(bytes, expected, '0'.repeat(40)));
  assert.throws(() => verify(Buffer.from('not gzip')));
});

test('durable remote history blocks every unresolved outcome, including absent status, before POST', async t => {
  const f = await fixture(); t.after(f.dispose);
  for (const prior of [[], [{ state: 'in_progress' }], [{ state: 'error' }], [{ state: 'failure' }], [{ state: 'inactive' }]]) {
    let posts = 0;
    const transport: typeof fetch = async (url, init) => {
      if (init?.method === 'POST') { posts++; throw new Error('unexpected POST'); }
      return Response.json(String(url).includes('/statuses') ? prior : [{ id: 44, task: 'deploy:esty-be-ci', environment: 'be-production' }]);
    };
    const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
    await assert.rejects(provider.reserve(), /unresolved/); assert.equal(posts, 0);
  }
});
test('successful durable reservation uses exact commit, no auto-merge and no secret payload', async t => {
  const f = await fixture(); t.after(f.dispose); let posted: Record<string, any> | undefined;
  const transport: typeof fetch = async (_url, init) => {
    if (init?.method !== 'POST') return Response.json([]);
    posted = JSON.parse(String(init.body));
    return Response.json({ id: 45, sha: run.revision, task: 'deploy:esty-be-ci', environment: 'be-production' }, { status: 201 });
  };
  const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
  assert.equal(await provider.reserve(), 45);
  assert.equal(posted?.ref, run.revision); assert.equal(posted?.auto_merge, false); assert.equal(posted?.payload.artifact, f.artifact.digest);
  for (const value of Object.values(credentials)) assert.equal(JSON.stringify(posted).includes(value), false);
});
test('candidate metadata rejects source, owner, region and Git rebuild mismatches', async t => {
  const f = await fixture(); t.after(f.dispose);
  const valid = { id: 'dpl_candidate', projectId: f.artifact.manifest.target.project, ownerId: f.artifact.manifest.target.owner,
    target: 'production', readyState: 'READY', url: 'synthetic.vercel.app', regions: ['icn1'],
    meta: { sourceCommit: run.revision, artifactSha256: f.artifact.digest, sourceDigest: f.artifact.manifest.source.digest } };
  for (const change of [{ regions: ['iad1'] }, { ownerId: 'other' }, { gitSource: { ref: 'main' } }, { meta: {} },
    { url: 'other.example' }, { readyState: 'ERROR' }]) {
    const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), async () => Response.json({ ...valid, ...change }));
    await assert.rejects(provider.inspect('dpl_candidate'));
  }
});
test('candidate bypass is header-only and cannot mask final custom-domain application protection', async t => {
  const f = await fixture(); t.after(f.dispose); const observed: Array<{ url: string; headers: Headers }> = [];
  const transport: typeof fetch = async (raw, init) => {
    const url = String(raw), headers = new Headers(init?.headers); observed.push({ url, headers });
    if (init?.method === 'OPTIONS') return headers.get('origin') === 'https://app.lovora.us'
      ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://app.lovora.us' } })
      : Response.json({ status: 'unauthorized' }, { status: 401 });
    if (headers.get('authorization') !== `Bearer ${credentials.bearer}`) return Response.json({ status: 'unauthorized' }, { status: 401 });
    if (url.endsWith('/health/live')) return Response.json({ status: 'ok' });
    if (url.endsWith('/health/ready')) return Response.json({ status: 'ready', database: 'up', migrations: 'current' });
    return new Response(null, { status: 404 });
  };
  const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
  await provider.http('https://synthetic.vercel.app', true); await provider.http('https://api.lovora.us', false);
  assert.equal(observed.length, 16);
  assert.ok(observed.slice(0, 8).every(row => row.headers.get('x-vercel-protection-bypass') === credentials.bypass));
  assert.ok(observed.slice(8).every(row => !row.headers.has('x-vercel-protection-bypass')));
  assert.ok(observed.every(row => !row.url.includes(credentials.bypass) && row.headers.get('authorization') !== `Bearer ${credentials.vercel}`));
  await assert.rejects(checkHostedHttp('https://synthetic.vercel.app', 'https://app.lovora.us', credentials.bearer,
    async () => Response.json({ status: 'ready', database: 'down', migrations: 'pending' })), /contract differs/);
});

test('provider archive attestation requires every exact file and canonical namespace metadata', async t => {
  const f = await fixture(); t.after(f.dispose);
  const records = f.artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/'));
  const entries = records.map(file => ({ path: file.path, mode: file.mode, content: readArtifactFile(f.artifact.root, file.path, file) }));
  for (const scenario of ['exact', 'missing', 'changed', 'coerced-mode', 'extra-function', 'wrong-uid', 'bad-base64']) {
    const uploaded = scenario === 'missing' ? entries.slice(1) : entries.map((entry, index) =>
      scenario === 'changed' && index === 0 ? { ...entry, content: Buffer.from('different') } : entry);
    const bytes = tar(uploaded), uid = createHash('sha1').update(bytes).digest('hex');
    const roots = [
      { name: 'src', type: 'directory', mode: scenario === 'coerced-mode' ? '0x416d' : 0o40555,
        children: [{ name: 'project.tgz', type: 'file', uid: scenario === 'wrong-uid' ? '0'.repeat(40) : uid }] },
      { name: 'out', type: 'directory', mode: 0o40555, children: [
        { name: 'index', type: 'lambda', mode: 0o140666 },
        ...(scenario === 'extra-function' ? [{ name: 'extra', type: 'lambda', mode: 0o140666 }] : []),
      ] },
    ];
    const transport: typeof fetch = async raw => String(raw).includes('/v6/')
      ? Response.json(roots) : Response.json({ data: scenario === 'bad-base64' ? '!!' : bytes.toString('base64') });
    const provider = createProvider(f.artifact, run, oldSchema, credentials, AbortSignal.timeout(10000), transport);
    if (scenario === 'exact') await provider.attest('dpl_candidate');
    else await assert.rejects(provider.attest('dpl_candidate'));
  }
});

function activationPacket(): ActivationPacket {
  return { version: 1, runId: randomUUID(), revision: run.revision, tree: run.tree,
    projectId: artifactTarget.project, scopeId: artifactTarget.owner,
    sourceDigest: sha256('source'), artifactDigest: sha256('artifact'),
    contractDigest: '41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad',
    oldDigest: activationSchema.oldDigest, targetDigest: activationSchema.targetDigest,
    target: 'local', predecessorId: 'dpl_previous', bridgeConfigDigest: sha256('bridge'), appConfigDigest: sha256('app'),
    roleInputDigest: sha256('roles'), migrationInputDigest: sha256('migration'), bootstrapInputDigest: sha256('bootstrap'),
    bootstrapBindingDigest: sha256('bootstrap-binding'), sourceReviewDigest: sha256('review'), testReceiptDigest: sha256('tests'),
    retentionApprovalDigest: sha256('retention'), feRevision: 'f'.repeat(40), feSourceDigest: sha256('fe'),
    feConfigDigest: sha256('fe-config'), migrations: migrationManifest };
}
async function activationJournal(packet = activationPacket()) {
  const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-activation-test-'));
  const digest = sha256(canonical(packet));
  createActivationJournal(directory, packet, digest); reserveActivationJournal(directory, packet, digest, 123);
  return { directory, packet, digest };
}
function authorizeLocal(input: Awaited<ReturnType<typeof activationJournal>>, phase: ActivationPhase) {
  const intent = appendActivationEvent(input.directory, input.packet, input.digest, phase, 'intent', { outcome: 'unknown' });
  appendActivationEvent(input.directory, input.packet, input.digest, phase, 'authorized', { intentHash: intent.head });
}
function configurationReceiptFixture(packet: ActivationPacket, phase: 'bridge-config' | 'app-config'): ActivationConfigurationReceipt {
  return { version: 2, runId: packet.runId, phase, projectId: packet.projectId, scopeId: packet.scopeId,
    packetDigest: sha256(canonical(packet)), revision: packet.revision, tree: packet.tree,
    sourceDigest: packet.sourceDigest, artifactDigest: packet.artifactDigest,
    configDigest: phase === 'bridge-config' ? packet.bridgeConfigDigest : packet.appConfigDigest,
    metadataDigest: sha256(`synthetic-metadata:${phase}`), count: 1, valueProof: 'pending-candidate-runtime' };
}
test('unknown Secret writes stay fenced across restart and cannot be reconciled from metadata', async t => {
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  let writes = 0, inspections = 0;
  const effect = async () => { writes++; throw new Error('synthetic private transport uncertainty'); };
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  assert.equal(writes, 0);
  authorizeLocal(input, 'bridge-config');
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  assert.equal(writes, 1);
  const restarted = { ...input };
  await assert.rejects(executeActivationPhase(restarted, 'bridge-config', effect));
  await assert.rejects(executeActivationPhase(restarted, 'roles', effect));
  assert.equal(writes, 1);
  assert.throws(() => finishActivationJournal(input.directory, input.packet, input.digest));
  await assert.rejects(reconcileActivationEffect(restarted, 'bridge-config', async () => {
    inspections++; return { result: 'confirmed', databaseOutcome: 'not_started', count: 10, deploymentId: null, reportDigest: sha256('metadata') };
  }));
  assert.equal(inspections, 0);
  const current = readActivationJournal(input.directory, input.packet, input.digest);
  assert.equal(current.next, 'bridge-config');
  assert.throws(() => appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'confirming', { outcomeHash: current.head }));
  assert.throws(() => appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'reconciled',
    { result: 'confirmed', databaseOutcome: 'not_started', count: 10, deploymentId: null, reportDigest: sha256('metadata') }));
  await assert.rejects(executeActivationPhase(restarted, 'bridge', effect));
  assert.equal(writes, 1);
  assert.equal(readActivationJournal(input.directory, input.packet, input.digest).head, current.head);
  assert.equal(existsSync(join(input.directory, 'operator.lock')), true);
});

test('transferred receipts permit only the untouched FE gate after separately approved inventory and remote confirmation', async t => {
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  const parent = await mkdtemp(join(realpathSync(tmpdir()), 'esty-activation-import-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  for (const phase of activationPhases.filter(value => value !== 'fe')) {
    authorizeLocal(input, phase);
    appendActivationEvent(input.directory, input.packet, input.digest, phase, 'started', { outcome: 'unknown' });
    const deploymentId = phase === 'bridge' || phase === 'app' ? `dpl_${phase}` : null;
    if (deploymentId) {
      appendActivationEvent(input.directory, input.packet, input.digest, phase, 'acknowledged', { deploymentId });
      appendActivationEvent(input.directory, input.packet, input.digest, phase, 'candidate-attested',
        { deploymentId, configDigest: phase === 'bridge' ? input.packet.bridgeConfigDigest : input.packet.appConfigDigest });
      appendActivationEvent(input.directory, input.packet, input.digest, phase, 'promotion-intent', { deploymentId });
    }
    const result = phase === 'bridge-config' || phase === 'app-config'
      ? saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, phase, configurationReceiptFixture(input.packet, phase))
      : { result: 'confirmed' as const, databaseOutcome: ['roles', 'migration', 'bootstrap'].includes(phase) ? 'committed' : 'not_started',
        count: phase === 'roles' || phase === 'migration' ? 2 : 1, deploymentId, reportDigest: sha256(phase) };
    const completed = appendActivationEvent(input.directory, input.packet, input.digest, phase, 'outcome', result);
    appendActivationEvent(input.directory, input.packet, input.digest, phase, 'confirming', { outcomeHash: completed.head });
    appendActivationEvent(input.directory, input.packet, input.digest, phase, 'remote-confirmed', { outcomeHash: completed.head });
  }
  for (const proof of ['initial', 'postflight']) writeReleaseEvidence(join(input.directory, `${input.packet.runId}.${proof}.json`), { proof });
  const transferred = join(parent, 'transferred'); await cp(input.directory, transferred, { recursive: true });
  assert.throws(() => readActivationJournal(transferred, input.packet, input.digest));
  const approved = sha256(canonical(inventory(transferred))), destination = join(parent, 'imported');
  let confirmed = 0;
  await assert.rejects(importFrontendJournal(transferred, destination, input.packet, input.digest, sha256('wrong'),
    async () => { confirmed++; }));
  assert.equal(confirmed, 0); assert.equal(existsSync(destination), false);
  await assert.rejects(importFrontendJournal(transferred, destination, input.packet, input.digest, approved,
    async () => { throw new Error('remote head changed'); }));
  assert.equal(existsSync(destination), false);
  await importFrontendJournal(transferred, destination, input.packet, input.digest, approved, async current => {
    confirmed++; assert.equal(current.next, 'fe');
  });
  const restored = { ...input, directory: destination };
  assert.equal(readActivationJournal(destination, input.packet, input.digest).next, 'fe');
  let effects = 0;
  await assert.rejects(executeActivationPhase(restored, 'migration', async () => {
    effects++; throw new Error('must not repeat SQL');
  }));
  assert.equal(effects, 0);
  assert.equal(sha256(canonical(inventory(transferred))), approved);
  authorizeLocal(restored, 'fe');
  await executeActivationPhase(restored, 'fe', async () => ({ result: 'confirmed', databaseOutcome: 'not_started',
    count: 1, deploymentId: null, reportDigest: sha256('approved-fe-receipt') }));
  const fe = readActivationJournal(destination, input.packet, input.digest);
  appendActivationEvent(destination, input.packet, input.digest, 'fe', 'confirming', { outcomeHash: fe.head });
  appendActivationEvent(destination, input.packet, input.digest, 'fe', 'remote-confirmed', { outcomeHash: fe.head });
  let finalWrites = 0, finalReads = 0;
  const unavailable = async (): Promise<never> => { throw new Error('Unexpected provider operation during completion'); };
  const completionProvider: ActivationProvider = {
    async currentMain() {}, async binding(id) { assert.equal(id, 'dpl_app'); },
    async record() { finalWrites++; throw new Error('Lost final acknowledgement'); },
    async confirmJournal() { finalReads++; },
    preflight: unavailable, reserve: unavailable, inspect: unavailable, attest: unavailable,
    http: unavailable, acceptFrontend: unavailable,
  };
  await assert.rejects(completeActivation(restored, completionProvider, false));
  await assert.rejects(completeActivation(restored, completionProvider, false));
  assert.equal(finalWrites, 1); assert.equal(finalReads, 0);
  assert.equal(existsSync(join(destination, 'operator.lock')), true);
  await completeActivation(restored, completionProvider, true);
  assert.equal(finalWrites, 1); assert.equal(finalReads, 1);
  assert.equal(existsSync(join(destination, 'operator.lock')), false);
});

test('phase credential boundaries reject privileged cross-phase inputs rather than silently dropping them', () => {
  for (const phase of ['bridge-config', 'app-config', 'roles', 'migration', 'bootstrap', 'bridge', 'app'] as const) {
    for (const key of ['DATABASE_URL', 'APP_AUTH_ADMIN_KEY', 'MIGRATION_DATABASE_URL', 'VERCEL_AUTOMATION_BYPASS_SECRET']) {
      assert.throws(() => phaseInputEnvironment({ [key]: 'synthetic-secret' }, phase));
    }
  }
  assert.throws(() => phaseInputEnvironment({ ACTIVATION_APP_INPUTS: '{}' }, 'bridge'));
  assert.throws(() => phaseInputEnvironment({ GITHUB_TOKEN: 'synthetic' }, 'roles'));
  assert.throws(() => phaseInputEnvironment({ VERCEL_TOKEN: 'synthetic' }, 'app-config'));
});

function secretConfiguration(phase: 'bridge' | 'app' = 'bridge') {
  const values: Record<string, string> = { API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
    SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
    SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
    DATABASE_URL: 'postgresql://postgres.eotmpaliqcxxcotrcols:synthetic-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: 'a'.repeat(64) };
  if (phase === 'app') Object.assign(values, { APP_SCHEMA_MODE: 'strict', APP_FOUNDATION_ENABLED: 'true',
    SUPABASE_DATABASE_USER: 'app_runtime.eotmpaliqcxxcotrcols',
    DATABASE_URL: values.DATABASE_URL!.replace('postgres.eotmpaliqcxxcotrcols:', 'app_runtime.eotmpaliqcxxcotrcols:'),
    APP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000005', APP_EMAIL_ENABLED: 'false',
    APP_AUTH_URL: 'https://eotmpaliqcxxcotrcols.supabase.co/auth/v1', APP_AUTH_API_KEY: 'sb_publishable_synthetic-only',
    APP_RETENTION_POLICY_ID: 'manual-retention-v1' });
  const packet = { ...activationPacket(), [phase === 'bridge' ? 'bridgeConfigDigest' : 'appConfigDigest']: sha256(canonical(values)) };
  const entries = Object.keys({ ...values, APP_ACTIVATION_CONFIG_DIGEST: sha256(canonical(values)) }).map((key, index) =>
    ({ id: `env_${index}`, key, type: 'sensitive', visibility: 'secret', target: ['production'] }));
  return { values, packet, entries };
}
test('Secret configuration accepts one-way201 acknowledgement without decrypting saved values', async () => {
  const { values, packet, entries } = secretConfiguration();
  let writes = 0;
  const transport: typeof fetch = async (raw, init) => {
    const url = new URL(String(raw));
    assert.equal(url.pathname, `/v10/projects/${packet.projectId}/env`);
    if (init?.method === 'POST') {
      writes++;
      const body = JSON.parse(String(init.body)) as Array<{ type: string }>;
      assert.ok(body.every(row => row.type === 'sensitive'));
      return Response.json({ created: entries, failed: [] }, { status: 201 });
    }
    assert.equal(url.searchParams.get('decrypt'), 'false');
    return Response.json({ envs: entries, pagination: null, hiddenProductionEnvCount: 0 });
  };
  const receipt = await configureActivation(values, packet, 'bridge', 'synthetic-configuration-token', AbortSignal.timeout(10000), transport);
  assert.equal(writes, 1);
  assert.equal(receipt.configDigest, packet.bridgeConfigDigest);
  assert.equal(receipt.valueProof, 'pending-candidate-runtime');
  assert.equal(receipt.packetDigest, sha256(canonical(packet)));
  assert.equal(JSON.stringify(receipt).includes('synthetic-only'), false);
});

test('Secret metadata respects authoritative visibility and binds both runtime phases', async () => {
  for (const phase of ['bridge', 'app'] as const) for (const kind of ['legacy-sensitive', 'encrypted-secret', 'upgrade-config']) {
    const { values, packet, entries } = secretConfiguration(phase);
    const final = entries.map(row => kind === 'legacy-sensitive' ? { ...row, visibility: undefined }
      : kind === 'encrypted-secret' ? { ...row, type: 'encrypted' } : row);
    let writes = 0;
    const transport: typeof fetch = async (_raw, init) => {
      if (init?.method === 'POST') { writes++; return Response.json({ created: final, failed: [] }, { status: 201 }); }
      return Response.json({ envs: !writes && kind === 'upgrade-config'
        ? entries.map(row => ({ ...row, type: 'encrypted', visibility: 'config' })) : final });
    };
    const receipt = await configureActivation(values, packet, phase, 'synthetic-config-token', AbortSignal.timeout(10000), transport);
    assert.equal(receipt.phase, `${phase}-config`); assert.equal(receipt.valueProof, 'pending-candidate-runtime');
    assert.equal(receipt.configDigest, sha256(canonical(values))); assert.equal(writes, 1);
  }
});

test('Secret configuration fences incomplete or changed acknowledgements and metadata without readback or retry', async t => {
  const scenarios = ['hidden', 'pagination', 'duplicate', 'preview', 'lost-ack', 'partial', 'missing-ack', 'duplicate-ack',
    'extra-ack', 'replaced-id', 'config-visibility', 'post-drift', 'post-missing', 'abort-before-write', 'abort-after-write'];
  for (const scenario of scenarios) await t.test(scenario, async () => {
    const { values, packet, entries } = secretConfiguration();
    const abort = new AbortController();
    let writes = 0, decryptions = 0;
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw));
      if (url.pathname !== `/v10/projects/${packet.projectId}/env`) { decryptions++; throw new Error('Forbidden readback'); }
      assert.equal(url.searchParams.get('teamId'), packet.scopeId);
      if (init?.method === 'POST') {
        writes++;
        if (scenario === 'lost-ack') throw new Error('synthetic-secret-canary');
        if (scenario === 'abort-after-write') abort.abort();
        const created = scenario === 'missing-ack' ? [] : scenario === 'duplicate-ack' ? entries.map(() => entries[0])
          : scenario === 'extra-ack' ? [...entries, { ...entries[0], id: 'extra', key: 'UNAPPROVED' }]
          : scenario === 'replaced-id' ? entries.map(row => ({ ...row, id: `${row.id}_replaced` }))
          : scenario === 'config-visibility' ? entries.map(row => ({ ...row, visibility: 'config' })) : entries;
        return Response.json({ created, failed: scenario === 'partial' ? [{ error: 'synthetic-secret-canary' }] : [] }, { status: 201 });
      }
      assert.equal(url.searchParams.get('decrypt'), 'false');
      if (scenario === 'abort-before-write') abort.abort();
      const envs = scenario === 'duplicate' ? [...entries, entries[0]]
        : scenario === 'preview' ? entries.map(row => ({ ...row, target: ['production', 'preview'] }))
        : writes && scenario === 'post-drift' ? entries.map(row => ({ ...row, id: `${row.id}_changed` }))
        : writes && scenario === 'post-missing' ? entries.slice(1) : entries;
      return Response.json({ envs, hiddenProductionEnvCount: scenario === 'hidden' ? 1 : 0,
        pagination: scenario === 'pagination' ? { next: 123 } : null });
    };
    const beforeWrite = ['hidden', 'pagination', 'duplicate', 'preview', 'abort-before-write'].includes(scenario);
    await assert.rejects(configureActivation(values, packet, 'bridge', 'synthetic-config-token', abort.signal, transport),
      error => error instanceof ActivationConfigurationError && error.outcome === (beforeWrite ? 'not_started' : 'unknown')
        && !error.message.includes('synthetic-secret-canary'));
    assert.equal(writes, beforeWrite ? 0 : 1); assert.equal(decryptions, 0);
  });
});

test('lost remote acknowledgement after a durable Secret receipt is read-only recoverable without another write', async t => {
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  authorizeLocal(input, 'bridge-config');
  await executeActivationPhase(input, 'bridge-config', async () =>
    saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, 'bridge-config', configurationReceiptFixture(input.packet, 'bridge-config')));
  let writes = 0, reads = 0;
  const forbidden = async (): Promise<never> => { throw new Error('Unexpected provider effect'); };
  const provider: ActivationProvider = { currentMain: forbidden, preflight: forbidden, reserve: forbidden, binding: forbidden,
    inspect: forbidden, attest: forbidden, http: forbidden, acceptFrontend: forbidden,
    async record() { writes++; }, async confirmJournal() { reads++; if (reads === 1) throw new Error('Lost remote ACK'); } };
  await assert.rejects(confirmActivationPhase(input, 'bridge-config', provider));
  await assert.rejects(confirmActivationPhase(input, 'bridge-config', provider));
  assert.equal(readActivationJournal(input.directory, input.packet, input.digest).next, 'bridge-config');
  await reconcileActivationAcknowledgement(input, 'bridge-config', provider);
  assert.equal(readActivationJournal(input.directory, input.packet, input.digest).next, 'bridge');
  assert.equal(writes, 1); assert.equal(reads, 2);
});

test('missing or substituted durable Secret receipts prevent candidate execution after restart', async t => {
  for (const change of ['missing', 'startedHash', 'packetDigest', 'artifactDigest', 'metadataDigest', 'valueProof', 'count']) {
    const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
    authorizeLocal(input, 'bridge-config');
    await executeActivationPhase(input, 'bridge-config', async () =>
      saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, 'bridge-config', configurationReceiptFixture(input.packet, 'bridge-config')));
    const current = readActivationJournal(input.directory, input.packet, input.digest);
    appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'confirming', { outcomeHash: current.head });
    appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'remote-confirmed', { outcomeHash: current.head });
    const path = join(input.directory, `${input.packet.runId}.bridge-config.configuration.json`);
    if (change === 'missing') await rm(path);
    else {
      const envelope = JSON.parse(readFileSync(path, 'utf8'));
      if (change === 'startedHash') envelope.startedHash = sha256('substituted');
      else envelope.receipt[change] = change === 'count' ? 2 : change === 'valueProof' ? 'confirmed' : sha256('substituted');
      await writeFile(path, JSON.stringify(envelope));
    }
    let effects = 0;
    await assert.rejects(executeActivationPhase(input, 'bridge', async () => { effects++; throw new Error('Forbidden candidate'); }));
    await assert.rejects(reconcileActivationEffect(input, 'bridge-config', async () => { effects++; throw new Error('Forbidden reconciliation'); }));
    assert.equal(effects, 0, change);
    assert.equal(existsSync(join(input.directory, 'operator.lock')), true);
  }
});

test('configuration receipt persistence failure cannot be repaired by replaying the Secret write', async t => {
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  authorizeLocal(input, 'bridge-config');
  writeReleaseEvidence(join(input.directory, `${input.packet.runId}.bridge-config.configuration.json`), { partial: true });
  let writes = 0;
  const effect = async () => {
    writes++;
    return saveActivationConfigurationReceipt(input.directory, input.packet, input.digest, 'bridge-config', configurationReceiptFixture(input.packet, 'bridge-config'));
  };
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  const current = readActivationJournal(input.directory, input.packet, input.digest);
  assert.equal((current.events.at(-1)!.value as { result: string }).result, 'unknown');
  assert.equal(current.next, 'bridge-config'); assert.equal(writes, 1);
});


test('configuration refuses privileged credential aliases before mutation or decryption and fences post-write discovery', async () => {
  const values = { API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
    SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
    SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
    DATABASE_URL: 'postgresql://postgres.eotmpaliqcxxcotrcols:synthetic-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: 'a'.repeat(64) };
  const packet = { ...activationPacket(), bridgeConfigDigest: sha256(canonical(values)) };
  const expected = { ...values, APP_ACTIVATION_CONFIG_DIGEST: packet.bridgeConfigDigest };
  const entries = Object.entries(expected).map(([key, value], index) =>
    ({ id: `env_${index}`, key, value, type: 'sensitive', target: ['production'] }));
  const aliases = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY',
    'SUPABASE_ACCESS_TOKEN', 'SUPABASE_JWT_SECRET', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DATABASE_URL',
    'POSTGRES_PASSWORD', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL',
    'PGPASSWORD', 'PGPASSFILE', 'DATABASE_PASSWORD', 'DATABASE_ADMIN_URL', 'DIRECT_URL',
    'AUTH_ADMIN_KEY', 'AUTH_ADMIN_TOKEN', 'ADMIN_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET'];
  for (const key of aliases) {
    for (const stage of ['before-write', 'after-write'] as const) {
      let writes = 0, decryptions = 0, inventories = 0;
      const transport: typeof fetch = async (raw, init) => {
        const url = new URL(String(raw));
        if (init?.method === 'POST') { writes++; return Response.json({ created: entries, failed: [] }, { status: 201 }); }
        if (url.pathname.endsWith('/env')) {
          inventories++;
          const present = stage !== 'after-write' || writes > 0;
          return Response.json({ envs: present
            ? [...entries, { id: 'env_privileged', key, type: 'encrypted', target: ['production'] }] : entries });
        }
        decryptions++;
        const entry = entries.find(value => url.pathname.endsWith(`/${value.id}`));
        assert.ok(entry);
        return Response.json(entry);
      };
      await assert.rejects(configureActivation(values, packet, 'bridge', 'synthetic-configuration-token', AbortSignal.timeout(10000), transport),
        error => error instanceof ActivationConfigurationError && error.outcome === (stage === 'after-write' ? 'unknown' : 'not_started'),
        `${key}: ${stage}`);
      assert.equal(writes, stage === 'after-write' ? 1 : 0, `${key}: no forbidden write or replay`);
      assert.equal(decryptions, 0, `${key}: no credential readback after refusal`);
      assert.equal(inventories, stage === 'after-write' ? 2 : 1);
    }
  }
});

async function activationArtifact() {
  const base = await artifactFixture();
  const files = base.artifact.manifest.source.files.filter(entry => !entry.path.startsWith('apps/api/migrations/'));
  for (const migration of migrationManifest) {
    const path = `apps/api/migrations/${migration.name}.mjs`;
    const bytes = readFileSync(new URL(`../../migrations/${migration.name}.mjs`, import.meta.url));
    await writeFile(join(base.operator, path), bytes); files.push(file(path, bytes, 0o644));
  }
  const contractPath = 'specs/001-connectivity-foundation/contracts/openapi.json';
  const contract = readFileSync(new URL(`../../../../${contractPath}`, import.meta.url));
  await mkdir(dirname(join(base.operator, contractPath)), { recursive: true });
  await writeFile(join(base.operator, contractPath), contract); files.push(file(contractPath, contract, 0o644));
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'activation'),
    config: base.config, source: { ...base.artifact.manifest.source, repository: `https://github.com/${repository}`,
      files, digest: sha256(canonical(files)) }, migrations: [...migrationManifest], build: base.artifact.manifest.build });
  const packet = { ...activationPacket(), artifactDigest: artifact.digest, sourceDigest: artifact.manifest.source.digest,
    target: 'supabase:eotmpaliqcxxcotrcols' };
  return { artifact, packet, dispose: base.dispose };
}
test('activation preserves known IDs and refuses promotion after unknown acknowledgement or runtime attestation failure', async t => {
  const f = await activationArtifact(); t.after(f.dispose);
  for (const failure of [undefined, 'lost-create', 'known-nonzero', 'lost-ack', 'candidate_http', 'promote', 'production_http']) {
    const h = harness(f.artifact, failure);
    const provider: ActivationProvider = { ...h.input.provider,
      async confirmJournal() { if (failure === 'lost-ack') throw new Error('unknown acknowledgement'); },
      async acceptFrontend() { throw new Error('not a frontend operation'); } };
    const create = h.input.cli.create;
    h.input.cli.create = async () => {
      const result = await create();
      return failure === 'lost-create' ? { ...result, stdout: '' } : failure === 'known-nonzero' ? { ...result, code: 1 } : result;
    };
    const retained: Array<{ kind: string; value: Record<string, string> }> = [];
    const operation = deliverActivationCandidate({ artifact: f.artifact,
      activation: { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'bridge' },
      provider, cli: h.input.cli, predecessor: 'dpl_previous', journal: 1, signal: AbortSignal.timeout(10000),
      persist(kind, value) { retained.push({ kind, value }); } });
    if (failure) await assert.rejects(operation); else assert.equal(await operation, 'dpl_candidate');
    assert.equal(h.counts().creates, 1);
    assert.equal(h.counts().promotions, [undefined, 'promote', 'production_http'].includes(failure) ? 1 : 0);
    assert.equal(retained.some(event => event.kind === 'acknowledged'), failure !== 'lost-create');
    if (retained.some(event => event.kind === 'promotion-intent')) {
      assert.deepEqual(retained.find(event => event.kind === 'candidate-attested')?.value,
        { deploymentId: 'dpl_candidate', configDigest: f.packet.bridgeConfigDigest });
    }
  }
});

test('provider runtime configuration attestation cannot be replaced by deployment metadata or leaked on denial', async t => {
  const f = await activationArtifact(); t.after(f.dispose);
  for (const mode of ['exact', 'missing', 'changed', 'leaked']) {
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw)), headers = new Headers(init?.headers);
      assert.equal(headers.has('x-vercel-protection-bypass'), false);
      if (init?.method === 'OPTIONS') return headers.get('origin') === 'https://app.lovora.us'
        ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://app.lovora.us' } })
        : new Response(null, { status: 401 });
      const authorized = headers.get('authorization') === `Bearer ${credentials.bearer}`;
      const responseHeaders: Record<string, string> = {};
      if (mode !== 'missing' && (authorized || mode === 'leaked')) {
        responseHeaders['x-activation-config-digest'] = mode === 'changed' ? sha256('different') : f.packet.bridgeConfigDigest;
      }
      if (!authorized) return Response.json({ status: 'unauthorized' }, { status: 401, headers: responseHeaders });
      if (url.pathname === '/health/live') return Response.json({ status: 'ok' }, { headers: responseHeaders });
      if (url.pathname === '/health/ready') return Response.json({ status: 'ready', database: 'up', migrations: 'current' }, { headers: responseHeaders });
      return new Response(null, { status: 404 });
    };
    const provider = createActivationProvider(f.artifact, run, credentials, AbortSignal.timeout(10000),
      { packet: f.packet, packetDigest: sha256(canonical(f.packet)), phase: 'bridge' }, transport);
    if (mode === 'exact') await provider.http('https://synthetic.vercel.app', true);
    else await assert.rejects(provider.http('https://synthetic.vercel.app', true), /configuration attestation/);
  }
});

test('journal mode and event tampering prevent all later phase effects', async t => {
  const input = await activationJournal(); t.after(() => rm(input.directory, { recursive: true, force: true }));
  authorizeLocal(input, 'bridge-config');
  const path = join(input.directory, 'activation', input.packet.runId, '000.json');
  await chmod(path, 0o644);
  let effects = 0;
  const effect = async () => { effects++; throw new Error('forbidden effect'); };
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  await chmod(path, 0o600);
  const event = JSON.parse(readFileSync(path, 'utf8')); event.value = { outcome: 'confirmed' };
  await writeFile(path, JSON.stringify(event));
  await assert.rejects(executeActivationPhase(input, 'bridge-config', effect));
  assert.equal(effects, 0);
});

interface RetainedRunMetadata {
  id: number;
  run_attempt: number;
  head_sha: string;
  head_branch: string;
  event: string;
  path: string;
  repository: { full_name: string };
  head_repository: { full_name: string };
  status: string;
  conclusion: string | null;
}
interface RetainedMetadata {
  main: { sha: string; commit: { tree: { sha: string } } };
  source: { sha: string; commit: { tree: { sha: string } } };
  retainedRun: RetainedRunMetadata;
  jobs: { total_count: number; jobs: Array<{ id: number; name: string; run_id: number; run_attempt: number;
    head_sha: string; status: string; conclusion: string }> };
  artifact: { id: number; name: string; expired: boolean; size_in_bytes: number; digest: string;
    created_at: string; expires_at: string; workflow_run: { id: number; head_sha: string; head_branch: string } };
  activeRun: RetainedRunMetadata;
}

function retainedManualFixture(now = Date.now()) {
  const pin = retainedActivation;
  const packet: ActivationPacket = { ...activationPacket(), runId: '11111111-1111-4111-8111-111111111111',
    revision: pin.revision, tree: pin.tree, sourceDigest: pin.sourceDigest, artifactDigest: pin.artifactDigest,
    projectId: pin.project, scopeId: pin.scope, target: pin.target };
  const packetJson = retainedCanonical(packet);
  const env: NodeJS.ProcessEnv = { ...context(), GITHUB_EVENT_NAME: 'workflow_dispatch', BE_DELIVERY_ENABLED: 'false',
    BE_DELIVERY_MODE: 'activation', BE_ACTIVATION_ENABLED: 'true', BE_ACTIVATION_WORKFLOW_SHA: run.revision,
    BE_ACTIVATION_PACKET_JSON: packetJson, BE_ACTIVATION_PACKET_SHA256: sha256(packetJson) };
  const event = { inputs: { mode: 'activation', activation_artifact_id: pin.artifactId } };
  const active = manualContext(env, event), repo = { full_name: pin.repository };
  const retainedRun = { id: Number(pin.runId), run_attempt: 1, head_sha: pin.revision, head_branch: 'main',
    event: 'push', path: pin.workflowPath, repository: repo, head_repository: repo, status: 'completed', conclusion: 'failure' };
  const metadata: RetainedMetadata = {
    main: { sha: run.revision, commit: { tree: { sha: run.tree } } },
    source: { sha: pin.revision, commit: { tree: { sha: pin.tree } } },
    retainedRun,
    jobs: { total_count: 1, jobs: [{ id: Number(pin.checksJobId), name: 'BE required checks',
      run_id: Number(pin.runId), run_attempt: 1, head_sha: pin.revision, status: 'completed', conclusion: 'success' }] },
    artifact: { id: Number(pin.artifactId), name: `be-tested-${pin.runId}-1`, expired: false, size_in_bytes: 1024,
      digest: `sha256:${pin.zipDigest}`, created_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 3_600_000).toISOString(),
      workflow_run: { id: Number(pin.runId), head_sha: pin.revision, head_branch: 'main' } },
    activeRun: { ...retainedRun, id: Number(run.run), head_sha: run.revision, event: 'workflow_dispatch',
      status: 'in_progress', conclusion: null },
  };
  const read = async (path: string) => {
    const values: Record<string, unknown> = { '/commits/main': metadata.main, [`/commits/${pin.revision}`]: metadata.source,
      [`/actions/runs/${pin.runId}`]: metadata.retainedRun,
      [`/actions/runs/${pin.runId}/jobs?filter=all&per_page=100`]: metadata.jobs,
      [`/actions/artifacts/${pin.artifactId}`]: metadata.artifact, [`/actions/runs/${run.run}`]: metadata.activeRun };
    assert.ok(Object.hasOwn(values, path), `Unexpected retained metadata path: ${path}`);
    return structuredClone(values[path]);
  };
  return { now, packet, env, event, context: active, metadata, read };
}

test('manual retained approval binds the new workflow without opening ordinary production gates', () => {
  const f = retainedManualFixture();
  assert.deepEqual(f.context.workflow, { revision: run.revision, run: run.run, ref: 'refs/heads/main',
    workflowRef: `${repository}/.github/workflows/be-delivery.yml@refs/heads/main` });
  assert.equal(f.context.packet.revision, retainedActivation.revision);
  assert.notEqual(f.context.packet.revision, f.context.workflow.revision);
  for (const enabled of [undefined, '', 'false']) {
    assert.deepEqual(manualContext({ ...f.env, BE_DELIVERY_ENABLED: enabled }, f.event), f.context);
    for (const event of ['push', 'workflow_dispatch']) for (const mode of ['current-schema-only', 'versioned-migration']) {
      const env = { ...context(), GITHUB_EVENT_NAME: event, BE_DELIVERY_MODE: mode, BE_DELIVERY_ENABLED: enabled,
        BE_ACTIVATION_ENABLED: 'true', BE_ACTIVATION_WORKFLOW_SHA: run.revision };
      assert.throws(() => deliveryContext(env, run.tree), `${event}/${mode} remains broad-gated`);
      assert.deepEqual(deliveryContext({ ...env, BE_DELIVERY_ENABLED: 'true' }, run.tree), run);
    }
  }
});

test('manual retained context refuses implicit activation, unreviewed workflows and untrusted attempts', () => {
  const f = retainedManualFixture();
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'fork/esty-admin' },
    { GITHUB_REF: 'refs/heads/topic' }, { GITHUB_REF: 'refs/tags/main' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ID: retainedActivation.runId },
    { GITHUB_RUN_ID: '0' }, { GITHUB_SHA: 'invalid' },
    { GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/other.yml@refs/heads/main` },
    { BE_DELIVERY_ENVIRONMENT: 'preview' }, { BE_DELIVERY_MODE: 'current-schema-only' },
    { BE_ACTIVATION_ENABLED: 'false' }, { BE_ACTIVATION_ENABLED: undefined },
    { BE_ACTIVATION_WORKFLOW_SHA: retainedActivation.revision }, { BE_ACTIVATION_WORKFLOW_SHA: undefined }]) {
    assert.throws(() => manualContext({ ...f.env, ...change }, f.event), JSON.stringify(change));
  }
  for (const event of [{}, { inputs: {} }, { inputs: { ...f.event.inputs, mode: 'current-schema-only' } },
    { inputs: { mode: 'activation' } }, { inputs: { ...f.event.inputs, activation_artifact_id: '13587251016' } },
    { inputs: { ...f.event.inputs, activation_artifact_id: Number(retainedActivation.artifactId) } }]) {
    assert.throws(() => manualContext(f.env, event));
  }
});

test('manual retained packet approval rejects substituted release pins and noncanonical bytes', () => {
  const f = retainedManualFixture();
  for (const change of [{ version: 2 }, { revision: run.revision }, { tree: run.tree }, { sourceDigest: sha256('different-source') },
    { artifactDigest: sha256('different-artifact') }, { projectId: 'prj_other' }, { scopeId: 'team_other' }, { target: 'local' }]) {
    const json = retainedCanonical({ ...f.packet, ...change });
    assert.throws(() => manualContext({ ...f.env, BE_ACTIVATION_PACKET_JSON: json, BE_ACTIVATION_PACKET_SHA256: sha256(json) }, f.event));
  }
  for (const json of [JSON.stringify(f.packet, null, 2), `${f.env.BE_ACTIVATION_PACKET_JSON}\n`, '{', 'null']) {
    assert.throws(() => manualContext({ ...f.env, BE_ACTIVATION_PACKET_JSON: json, BE_ACTIVATION_PACKET_SHA256: sha256(json) }, f.event));
  }
  assert.throws(() => manualContext({ ...f.env, BE_ACTIVATION_PACKET_SHA256: sha256('unapproved') }, f.event));
});

test('retained selection accepts successful exact checks despite failed old completion and keeps workflow identity separate', async () => {
  const f = retainedManualFixture(Date.parse('2026-10-31T00:00:00.000Z'));
  const selected = await selectRetained(f.context, f.read, f.now);
  assert.deepEqual(selected.retained, retainedActivation);
  assert.deepEqual(selected.workflow, { ...f.context.workflow, tree: run.tree });
  assert.deepEqual(selected.checks, { id: retainedActivation.checksJobId, conclusion: 'success' });
  assert.equal(selected.packetDigest, f.context.packetDigest);
  assert.equal(selected.expiresAt, f.metadata.artifact.expires_at);
  assert.equal(selected.selectedAt, new Date(f.now).toISOString());
  await verifyWorkflowHead(selected, f.read);
  f.metadata.main.sha = retainedActivation.revision;
  await assert.rejects(verifyWorkflowHead(selected, f.read));
  f.metadata.main.sha = run.revision;
  f.metadata.main.commit.tree.sha = retainedActivation.tree;
  await assert.rejects(verifyWorkflowHead(selected, f.read));
  f.metadata.main.commit.tree.sha = run.tree;
  f.metadata.source.commit.tree.sha = run.tree;
  await assert.rejects(verifyWorkflowHead(selected, f.read));
});

test('retained selector refuses changed metadata, incomplete checks and expired transport before issuing approval', async () => {
  const now = Date.parse('2026-10-31T00:00:00.000Z');
  const changes: Array<[string, (metadata: RetainedMetadata) => void]> = [
    ['live main changed', m => { m.main.sha = retainedActivation.revision; }],
    ['source tree changed', m => { m.source.commit.tree.sha = run.tree; }],
    ['retained run changed', m => { m.retainedRun.id++; }],
    ['retained rerun', m => { m.retainedRun.run_attempt = 2; }],
    ['retained source changed', m => { m.retainedRun.head_sha = run.revision; }],
    ['retained branch changed', m => { m.retainedRun.head_branch = 'topic'; }],
    ['retained pull request', m => { m.retainedRun.event = 'pull_request'; }],
    ['retained workflow changed', m => { m.retainedRun.path = '.github/workflows/other.yml'; }],
    ['retained fork', m => { m.retainedRun.head_repository = { full_name: 'fork/esty-admin' }; }],
    ['retained incomplete', m => { m.retainedRun.status = 'in_progress'; }],
    ['checks missing', m => { m.jobs.jobs = []; m.jobs.total_count = 0; }],
    ['checks pagination incomplete', m => { m.jobs.total_count = 101; }],
    ['checks duplicated', m => { m.jobs.jobs.push({ ...m.jobs.jobs[0]! }); m.jobs.total_count = 2; }],
    ['checks renamed', m => { m.jobs.jobs[0]!.name = 'Different checks'; }],
    ['checks failed', m => { m.jobs.jobs[0]!.conclusion = 'failure'; }],
    ['checks incomplete', m => { m.jobs.jobs[0]!.status = 'in_progress'; }],
    ['checks rerun', m => { m.jobs.jobs[0]!.run_attempt = 2; }],
    ['checks different run', m => { m.jobs.jobs[0]!.run_id++; }],
    ['checks different source', m => { m.jobs.jobs[0]!.head_sha = run.revision; }],
    ['artifact substituted', m => { m.artifact.id++; }],
    ['artifact renamed', m => { m.artifact.name = 'be-tested-other'; }],
    ['artifact digest changed', m => { m.artifact.digest = `sha256:${sha256('different-zip')}`; }],
    ['artifact expired flag', m => { m.artifact.expired = true; }],
    ['artifact expiry boundary', m => { m.artifact.expires_at = new Date(now).toISOString(); }],
    ['artifact invalid expiry', m => { m.artifact.expires_at = 'not-a-date'; }],
    ['artifact from future', m => { m.artifact.created_at = new Date(now + 1).toISOString(); }],
    ['artifact unbounded', m => { m.artifact.size_in_bytes = 64 * 1024 * 1024 + 1; }],
    ['artifact empty', m => { m.artifact.size_in_bytes = 0; }],
    ['artifact wrong run', m => { m.artifact.workflow_run.id++; }],
    ['artifact wrong source', m => { m.artifact.workflow_run.head_sha = run.revision; }],
    ['active run changed', m => { m.activeRun.id++; }],
    ['active rerun', m => { m.activeRun.run_attempt = 2; }],
    ['active push', m => { m.activeRun.event = 'push'; }],
    ['active source impersonates release', m => { m.activeRun.head_sha = retainedActivation.revision; }],
    ['active workflow changed', m => { m.activeRun.path = '.github/workflows/other.yml'; }],
    ['active run completed', m => { m.activeRun.status = 'completed'; }],
    ['active fork', m => { m.activeRun.repository = { full_name: 'fork/esty-admin' }; }],
  ];
  for (const [label, change] of changes) {
    const f = retainedManualFixture(now); change(f.metadata);
    await assert.rejects(selectRetained(f.context, f.read, now), label);
  }
});

test('selection receipts cannot cross workflow, packet, artifact or expiry boundaries', async () => {
  const f = retainedManualFixture(Date.parse('2026-10-31T00:00:00.000Z'));
  const selected = await selectRetained(f.context, f.read, f.now);
  for (const changed of [{ ...selected, version: 2 }, { ...selected, extra: true },
    { ...selected, retained: { ...selected.retained, archiveDigest: sha256('substituted') } },
    { ...selected, workflow: { ...selected.workflow, revision: retainedActivation.revision } },
    { ...selected, workflow: { ...selected.workflow, run: '124' } },
    { ...selected, workflow: { ...selected.workflow, tree: 'invalid' } },
    { ...selected, packetDigest: sha256('different-packet') },
    { ...selected, checks: { ...selected.checks, id: '128499919012' } },
    { ...selected, checks: { ...selected.checks, conclusion: 'failure' } },
    { ...selected, selectedAt: new Date(f.now + 1).toISOString() },
    { ...selected, expiresAt: new Date(f.now).toISOString() }]) {
    assert.throws(() => validateSelection(changed, f.context, f.now));
  }
  assert.throws(() => validateSelection(selected, f.context, Date.parse(selected.expiresAt)));
});

test('retained metadata reader refuses redirects and unsafe paths without exposing its credential', async () => {
  const token = 'synthetic-retained-read-token';
  let calls = 0;
  const reader = githubReader(token, AbortSignal.timeout(10000), async (raw, init) => {
    calls++;
    assert.equal(new URL(String(raw)).origin, 'https://api.github.com');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token}`);
    return new Response(null, { status: 302, headers: { location: 'https://untrusted.invalid/credential-sink' } });
  });
  for (const path of ['https://untrusted.invalid', '/../deployments', '/commits/main#ignored', '/commits/ main', '/commits\\main']) {
    await assert.rejects(reader(path));
  }
  assert.equal(calls, 0);
  await assert.rejects(reader('/commits/main'), error => error instanceof Error && !error.message.includes(token));
  assert.equal(calls, 1);
});

test('relay rejects substituted archive bytes, unbound receipts and symbolic-link selections', async t => {
  const f = retainedManualFixture(), selected = await selectRetained(f.context, f.read, f.now);
  const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-retained-relay-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'selection.json'), bytes = retainedCanonical(selected) + '\n', digest = sha256(bytes);
  await writeFile(path, bytes, { mode: 0o600 });
  assert.deepEqual(readSelection(path, digest, f.context), selected);
  assert.throws(() => readSelection(path, sha256('wrong-receipt'), f.context));
  await writeFile(join(directory, 'be-release.tar.gz'), 'substituted archive', { mode: 0o600 });
  assert.throws(() => verifyRelay(directory, digest, f.context));
  await writeFile(path, retainedCanonical({ ...selected, packetDigest: sha256('changed') }) + '\n');
  const changedHash = sha256(readFileSync(path));
  assert.throws(() => readSelection(path, changedHash, f.context));
  await rm(path);
  const target = join(directory, 'selection-target.json');
  await writeFile(target, bytes, { mode: 0o600 });
  await symlink(target, path);
  assert.throws(() => readSelection(path, digest, f.context));
});

test('actual retained bundle manual reservation uses sealed provider and durable journal with unknown acknowledgements fenced',
  { skip: !process.env.MANUAL_ACTIVATION_TEST_BUNDLE }, async t => {
    const f = retainedManualFixture(), selected = await selectRetained(f.context, f.read, f.now);
    const bundleRoot = realpathSync(process.env.MANUAL_ACTIVATION_TEST_BUNDLE!);
    const bundle = await verifySelectedBundle(bundleRoot, selected, f.context);
    assert.equal(bundle.artifact.digest, retainedActivation.artifactDigest);
    assert.equal(bundle.artifact.manifest.source.revision, retainedActivation.revision);
    assert.notEqual(bundle.context.workflow.revision, bundle.artifact.manifest.source.revision);
    for (const changed of [{ ...f.packet, oldDigest: sha256('wrong-old') }, { ...f.packet, migrations: [] },
      { ...f.packet, bridgeConfigDigest: f.packet.appConfigDigest }, { ...f.packet, extra: true }]) {
      assert.throws(() => bundle.modules.journal.validateActivationPacket(changed, sha256(retainedCanonical(changed))));
    }
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-retained-manual-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const eventPath = join(directory, 'event.json');
    await writeFile(eventPath, JSON.stringify(f.event), { mode: 0o600 });
    const relay = join(directory, 'relay'); await mkdir(relay, { mode: 0o700 });
    const selectionBytes = retainedCanonical(selected) + '\n';
    await writeFile(join(relay, 'selection.json'), selectionBytes, { mode: 0o600 });
    await cp(join(dirname(bundleRoot), 'be-release.tar.gz'), join(relay, 'be-release.tar.gz'));
    assert.deepEqual(verifyRelay(relay, sha256(selectionBytes), f.context), selected);
    await writeFile(join(relay, 'unexpected.json'), '{}', { mode: 0o600 });
    assert.throws(() => verifyRelay(relay, sha256(selectionBytes), f.context));
    const env = { ...f.env, GITHUB_EVENT_PATH: eventPath, GITHUB_TOKEN: credentials.github,
      VERCEL_TOKEN: credentials.vercel, BE_PREVIEW_ACCESS_KEY: credentials.bearer };
    for (const scenario of ['confirmed', 'lost-reservation-ack', 'changed-main', 'changed-predecessor']) {
      const journalDirectory = join(directory, scenario);
      bundle.modules.privateFiles.privateDirectory(journalDirectory);
      bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, 'packet-input.json'), bundle.packet);
      let posts = 0;
      const transport: typeof fetch = async (raw, init) => {
        const url = new URL(String(raw)), headers = new Headers(init?.headers);
        if (url.origin === 'https://api.github.com') {
          assert.equal(headers.get('authorization'), `Bearer ${credentials.github}`);
          const path = url.pathname.slice(`/repos/${repository}`.length);
          if (path === '/commits/main') return Response.json(scenario === 'changed-main'
            ? { ...f.metadata.main, sha: retainedActivation.revision } : f.metadata.main);
          if (path === `/commits/${retainedActivation.revision}`) return Response.json(f.metadata.source);
          if (path === '/deployments' && init?.method !== 'POST') return Response.json([]);
          if (path === '/deployments' && init?.method === 'POST') {
            posts++;
            const lock = bundle.modules.releaseJournal.readEvidence(join(journalDirectory, 'operator.lock')).value;
            assert.equal(lock.packetDigest, f.context.packetDigest);
            const body = JSON.parse(String(init.body));
            assert.equal(body.ref, retainedActivation.revision);
            assert.equal(body.auto_merge, false);
            assert.deepEqual(body.required_contexts, []);
            assert.equal(body.payload.run, f.context.workflow.run);
            assert.equal(body.payload.revision, retainedActivation.revision);
            assert.equal(body.payload.tree, retainedActivation.tree);
            assert.equal(body.payload.artifact, retainedActivation.artifactDigest);
            assert.equal(body.payload.activationPacket, f.context.packetDigest);
            for (const value of Object.values(credentials)) assert.equal(JSON.stringify(body).includes(value), false);
            if (scenario === 'lost-reservation-ack') throw new Error('Synthetic lost reservation acknowledgement.');
            return Response.json({ id: 45, sha: retainedActivation.revision,
              task: 'deploy:esty-be-ci', environment: 'be-production' }, { status: 201 });
          }
        } else if (url.origin === 'https://api.vercel.com') {
          assert.equal(headers.get('authorization'), `Bearer ${credentials.vercel}`);
          assert.notEqual(init?.method, 'POST');
          if (url.pathname === `/v9/projects/${retainedActivation.project}`) return Response.json({
            id: retainedActivation.project, name: 'esty-admin-api', accountId: retainedActivation.scope,
            rootDirectory: 'apps/api', framework: 'nestjs', nodeVersion: '24.x',
            buildCommand: null, installCommand: null, outputDirectory: null,
            link: { type: 'github', org: 'khuonghuyhieu', repo: 'esty-admin', productionBranch: 'main', repoId: 1, deployHooks: [] },
          });
          if (url.pathname === `/v9/projects/${retainedActivation.project}/domains/api.lovora.us`) {
            return Response.json({ name: 'api.lovora.us', projectId: retainedActivation.project, verified: true });
          }
          if (url.pathname === '/v4/aliases/api.lovora.us') return Response.json({ alias: 'api.lovora.us',
            projectId: retainedActivation.project, deploymentId: scenario === 'changed-predecessor' ? 'dpl_changed' : f.packet.predecessorId });
        }
        throw new Error(`Unexpected synthetic activation request: ${url.origin}${url.pathname}`);
      };
      const execute = () => executeManualAction(bundle, 'reserve', '-', env, journalDirectory,
        join(directory, 'unused-vercel-cli.js'), AbortSignal.timeout(30000), transport);
      if (scenario === 'confirmed') {
        await execute();
        const journal = bundle.modules.journal.readActivationJournal(journalDirectory, bundle.packet, f.context.packetDigest);
        assert.equal(journal.journal, 45);
        assert.equal(journal.next, 'bridge-config');
        assert.deepEqual(journal.events, []);
        await assert.rejects(execute());
        assert.equal(posts, 1);
      } else if (scenario === 'lost-reservation-ack') {
        await assert.rejects(execute());
        assert.equal(posts, 1);
        assert.equal(existsSync(join(journalDirectory, 'operator.lock')), true);
        assert.throws(() => bundle.modules.journal.readActivationJournal(journalDirectory, bundle.packet, f.context.packetDigest));
        await assert.rejects(execute());
        assert.equal(posts, 1);
      } else {
        await assert.rejects(execute());
        assert.equal(posts, 0);
        assert.equal(existsSync(join(journalDirectory, 'operator.lock')), false);
      }
    }
  });

test('private mutations recheck authorized main before spawning and keep provider credentials out of real children',
  { skip: !process.env.MANUAL_ACTIVATION_TEST_BUNDLE || process.platform !== 'linux' }, async t => {
    const base = retainedManualFixture(), selected = await selectRetained(base.context, base.read, base.now);
    const bundle = await verifySelectedBundle(realpathSync(process.env.MANUAL_ACTIVATION_TEST_BUNDLE!), selected, base.context);
    const directory = await mkdtemp(join(realpathSync(tmpdir()), 'esty-private-main-guard-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const eventPath = join(directory, 'event.json');
    await writeFile(eventPath, JSON.stringify(base.event), { mode: 0o600 });
    const childObservations: Array<{ phase: string; providerNames: string[]; error?: unknown }> = [];
    const originalSpawn = childProcess.spawn;
    t.mock.method(childProcess, 'spawn', ((...args: Parameters<typeof childProcess.spawn>) => {
      const child = Reflect.apply(originalSpawn, childProcess, args);
      child.once('spawn', () => {
        try {
          // Read only this newly spawned synthetic worker, once, on its spawn event; never poll or inspect other processes.
          const names = readFileSync(`/proc/${child.pid}/environ`, 'utf8').split('\0').map(item => item.split('=', 1)[0]!);
          childObservations.push({ phase: args[1]![2]!, providerNames: names.filter(name =>
            name.startsWith('GITHUB_') || ['VERCEL_TOKEN', 'VERCEL_API_TOKEN', 'BE_PREVIEW_ACCESS_KEY',
              'VERCEL_AUTOMATION_BYPASS_SECRET'].includes(name)) });
        } catch (error) { childObservations.push({ phase: args[1]![2]!, providerNames: [], error }); }
      });
      return child;
    }) as typeof childProcess.spawn);
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const fields = { 'bridge-config': 'ACTIVATION_BRIDGE_INPUTS', roles: 'ACTIVATION_ROLE_INPUTS',
      migration: 'ACTIVATION_MIGRATION_INPUTS', bootstrap: 'ACTIVATION_BOOTSTRAP_INPUTS', 'app-config': 'ACTIVATION_APP_INPUTS' };
    for (const phase of Object.keys(fields) as Array<keyof typeof fields>) {
      for (const scenario of ['unchanged', 'main-sha', 'main-tree', 'api-failure', 'missing-token', 'vercel-token']) {
        await t.test(`${phase}/${scenario}`, async () => {
          const f = retainedManualFixture(), journalDirectory = join(directory, `${phase}-${scenario}`);
          const input = { directory: journalDirectory, packet: bundle.packet, digest: base.context.packetDigest };
          const j = bundle.modules.journal;
          j.createActivationJournal(journalDirectory, input.packet, input.digest);
          j.reserveActivationJournal(journalDirectory, input.packet, input.digest, 45);
          bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, 'packet-input.json'), input.packet);
          // Synthetic prior phases use the existing journal fixture protocol; no external phase is executed.
          for (const prior of activationPhases) {
            if (prior === phase) break;
            const intent = j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'intent', { outcome: 'unknown' });
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'authorized', { intentHash: intent.head });
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'started', { outcome: 'unknown' });
            const deploymentId = prior === 'bridge' || prior === 'app' ? `dpl_${prior}` : null;
            if (deploymentId) {
              j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'acknowledged', { deploymentId });
              j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'candidate-attested',
                { deploymentId, configDigest: prior === 'bridge' ? input.packet.bridgeConfigDigest : input.packet.appConfigDigest });
              j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'promotion-intent', { deploymentId });
            }
            const result = prior === 'bridge-config' || prior === 'app-config'
              ? j.saveActivationConfigurationReceipt(journalDirectory, input.packet, input.digest, prior, configurationReceiptFixture(input.packet, prior))
              : { result: 'confirmed', databaseOutcome: ['roles', 'migration', 'bootstrap'].includes(prior) ? 'committed' : 'not_started',
                count: prior === 'roles' || prior === 'migration' ? 2 : 1, deploymentId, reportDigest: sha256(prior) };
            const completed = j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'outcome', result);
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'confirming', { outcomeHash: completed.head });
            j.appendActivationEvent(journalDirectory, input.packet, input.digest, prior, 'remote-confirmed', { outcomeHash: completed.head });
          }
          bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, `${input.packet.runId}.initial.json`),
            { version: 1, packetDigest: input.digest, inputDigest: input.packet.roleInputDigest,
              history: input.packet.migrations.slice(0, 1).map((item: { name: string }) => item.name), roles: 'compatible-or-absent' });
          if (phase === 'bootstrap' || phase === 'app-config') {
            const started = j.readActivationJournal(journalDirectory, input.packet, input.digest).events
              .find((event: { phase: string; kind: string }) => event.phase === 'migration' && event.kind === 'started');
            bundle.modules.releaseJournal.writeReleaseEvidence(join(journalDirectory, `${input.packet.runId}.postflight.json`),
              { version: 1, packetDigest: input.digest, inputDigest: input.packet.roleInputDigest, startedHash: started.sha256,
                history: input.packet.migrations.map((item: { name: string }) => item.name), roles: 'target-confirmed' });
          }
          let authorization = '';
          await bundle.modules.activation.authorizeActivationPhase(input, phase, {
            currentMain: () => verifyWorkflowHead(selected, f.read),
            async binding(id: string) { assert.equal(id, phase === 'bridge-config' ? input.packet.predecessorId : 'dpl_bridge'); },
            async record(_id: number, _state: string, description: string) { authorization = description; },
            async confirmJournal(_id: number, _state: string, description: string) { assert.equal(description, authorization); },
          });
          const before = j.readActivationJournal(journalDirectory, input.packet, input.digest);
          assert.equal(before.events.at(-1).kind, 'authorized');
          if (scenario === 'main-sha') f.metadata.main.sha = retainedActivation.revision;
          if (scenario === 'main-tree') f.metadata.main.commit.tree.sha = retainedActivation.tree;
          const env: NodeJS.ProcessEnv = { ...f.env, GITHUB_EVENT_PATH: eventPath, GITHUB_TOKEN: credentials.github,
            [fields[phase]]: '{}' };
          if (phase === 'bridge-config' || phase === 'app-config') env.VERCEL_CONFIGURATION_TOKEN = 'synthetic-config-token';
          if (scenario === 'missing-token') delete env.GITHUB_TOKEN;
          if (scenario === 'vercel-token') env.VERCEL_TOKEN = credentials.vercel;
          let requests = 0;
          const transport: typeof fetch = async (raw, init) => {
            requests++;
            assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${credentials.github}`);
            assert.equal(init?.method ?? 'GET', 'GET');
            if (scenario === 'api-failure') throw new Error('Synthetic metadata API unavailable.');
            const url = new URL(String(raw));
            assert.equal(url.origin, 'https://api.github.com');
            return Response.json(await f.read(url.pathname.slice(`/repos/${repository}`.length)));
          };
          const childrenBefore = childObservations.length;
          // Unchanged head admits the real sealed worker. Deliberately invalid synthetic phase inputs then fence it before external work.
          await assert.rejects(executeManualAction(bundle, 'run', phase, env, journalDirectory,
            join(directory, 'unused-cli.js'), AbortSignal.timeout(30000), transport));
          const after = j.readActivationJournal(journalDirectory, input.packet, input.digest);
          if (scenario === 'unchanged') {
            assert.equal(requests, 2);
            assert.equal(childObservations.length, childrenBefore + 1);
            assert.deepEqual(childObservations.at(-1), { phase, providerNames: [] });
            assert.ok(after.events.some((event: { phase: string; kind: string }) => event.phase === phase && event.kind === 'started'));
          } else {
            assert.equal(requests, scenario === 'missing-token' || scenario === 'vercel-token' ? 0 : 1);
            assert.equal(childObservations.length, childrenBefore);
            assert.equal(after.head, before.head);
          }
        });
      }
    }
  });
