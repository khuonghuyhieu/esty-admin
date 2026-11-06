import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { cp, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { artifactTarget, assembleArtifact, canonical, inventory, readArtifactFile, sha256, verifyArtifact } from '../scripts/artifact.js';
import type { FileRecord, VerifiedArtifact } from '../scripts/artifact.js';
import { artifactFixture } from './artifact-fixture.js';
import { checksContext } from '../scripts/ci.js';
import { acknowledgedId, deliver, deliverActivationCandidate, deliveryContext } from '../scripts/ci-delivery.js';
import { approvedMigrationDigest, createActivationProvider, createProvider, repository } from '../scripts/ci-provider.js';
import type { ActivationProvider, DeliveryProvider, RunIdentity } from '../scripts/ci-provider.js';
import { verifyUploadedArchive } from '../scripts/ci-archive.js';
import { checkHostedHttp } from '../scripts/hosted-acceptance.js';
import type { CommandResult } from '../scripts/ci-tools.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { activationPhases, appendActivationEvent, createActivationJournal, finishActivationJournal, importFrontendJournal,
  readActivationJournal, reserveActivationJournal } from '../scripts/activation-journal.js';
import type { ActivationPacket, ActivationPhase } from '../scripts/activation-journal.js';
import { completeActivation, executeActivationPhase, reconcileActivationEffect } from '../scripts/activation.js';
import { phaseInputEnvironment } from '../scripts/activation-inputs.js';
import { configureActivation, inspectActivationConfiguration, ActivationConfigurationError } from '../scripts/activation-configuration.js';
import { writeReleaseEvidence } from '../scripts/release-journal.js';
import { activationSchema } from '../src/config/schema-transition.js';

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
  const input = { artifact, run, provider, signal: AbortSignal.timeout(10000),
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
  assert.equal(f.artifact.manifest.migrationDigest, approvedMigrationDigest);
  const h = harness(f.artifact); assert.equal(await deliver(h.input), 'dpl_candidate');
  assert.deepEqual(h.counts(), { creates: 1, promotions: 1 });
  assert.ok(h.events.indexOf('receipt:acknowledged') < h.events.indexOf('inspect'));
  assert.ok(h.events.indexOf('candidate_http') < h.events.indexOf('promote'));
  assert.ok(h.events.indexOf('production_http') < h.events.indexOf('success:accepted:dpl_candidate'));
  assert.ok(h.events.indexOf('receipt:create_intent') < h.events.indexOf('create'));
});
test('current-schema-only delivery rejects the app migration manifest before any provider action', async t => {
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
  assert.notEqual(artifact.manifest.migrationDigest, approvedMigrationDigest);
  const h = harness(artifact);
  await assert.rejects(deliver(h.input));
  assert.deepEqual(h.counts(), { creates: 0, promotions: 0 });
  assert.deepEqual(h.events, []);
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
    const provider = createProvider(f.artifact, run, credentials, AbortSignal.timeout(10000), transport);
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
  const provider = createProvider(f.artifact, run, credentials, AbortSignal.timeout(10000), transport);
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
    const provider = createProvider(f.artifact, run, credentials, AbortSignal.timeout(10000), async () => Response.json({ ...valid, ...change }));
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
  const provider = createProvider(f.artifact, run, credentials, AbortSignal.timeout(10000), transport);
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
    const provider = createProvider(f.artifact, run, credentials, AbortSignal.timeout(10000), transport);
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
test('activation unknown effects are fenced across restart and only read-only reconciliation can advance', async t => {
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
  await reconcileActivationEffect(restarted, 'bridge-config', async () => {
    inspections++; return { result: 'confirmed', databaseOutcome: 'not_started', count: 10, deploymentId: null, reportDigest: sha256('readback') };
  });
  assert.equal(inspections, 1);
  let current = readActivationJournal(input.directory, input.packet, input.digest);
  assert.equal(current.next, 'bridge-config');
  appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'confirming', { outcomeHash: current.head });
  const confirming = readActivationJournal(input.directory, input.packet, input.digest);
  assert.throws(() => appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'reconciled',
    { result: 'confirmed', databaseOutcome: 'not_started', count: 10, deploymentId: null, reportDigest: sha256('second-readback') }));
  assert.equal(readActivationJournal(input.directory, input.packet, input.digest).head, confirming.head);
  appendActivationEvent(input.directory, input.packet, input.digest, 'bridge-config', 'remote-confirmed', { outcomeHash: current.head });
  current = readActivationJournal(input.directory, input.packet, input.digest);
  assert.equal(current.next, 'bridge');
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
    const completed = appendActivationEvent(input.directory, input.packet, input.digest, phase, 'outcome',
      { result: 'confirmed', databaseOutcome: ['roles', 'migration', 'bootstrap'].includes(phase) ? 'committed' : 'not_started',
        count: phase === 'roles' || phase === 'migration' ? 2 : 1, deploymentId, reportDigest: sha256(phase) });
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

test('configuration uses one scoped write then exact readback; partial and changed results remain uncertain', async () => {
  const values = { API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
    SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
    SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols',
    DATABASE_URL: 'postgresql://postgres.eotmpaliqcxxcotrcols:synthetic-only@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: 'a'.repeat(64) };
  const packet = { ...activationPacket(), bridgeConfigDigest: sha256(canonical(values)) };
  for (const scenario of ['exact', 'partial', 'changed', 'privileged', 'lost-ack']) {
    let writes = 0;
    const expected = { ...values, APP_ACTIVATION_CONFIG_DIGEST: packet.bridgeConfigDigest };
    const entries = Object.entries(expected).map(([key, value], index) =>
      ({ id: `env_${index}`, key, value, type: 'encrypted', target: ['production'], decrypted: true }));
    const transport: typeof fetch = async (raw, init) => {
      const url = new URL(String(raw));
      assert.equal(url.origin, 'https://api.vercel.com');
      assert.equal(url.searchParams.get('teamId'), artifactTarget.owner);
      assert.equal(url.searchParams.get('slug'), artifactTarget.scope);
      if (init?.method === 'POST') {
        writes++;
        if (scenario === 'lost-ack') throw new Error('synthetic secret transport failure');
        return Response.json({ failed: scenario === 'partial' ? [{ error: 'synthetic' }] : [] });
      }
      if (url.pathname.endsWith('/env')) return Response.json({ envs: scenario === 'privileged'
        ? [...entries, { key: 'APP_AUTH_ADMIN_KEY' }] : [...entries, { key: 'VERCEL_REGION', value: 'iad1' }] });
      const entry = entries.find(value => url.pathname.endsWith(`/${value.id}`));
      if (!entry) throw new Error('unexpected endpoint');
      return Response.json({ ...entry, value: scenario === 'changed' ? 'different' : entry.value });
    };
    const operation = configureActivation(values, packet, 'bridge', 'synthetic-configuration-token', AbortSignal.timeout(10000), transport);
    if (scenario === 'exact') {
      const receipt = await operation;
      assert.equal(receipt.configDigest, packet.bridgeConfigDigest);
      assert.equal(JSON.stringify(receipt).includes('synthetic-only'), false);
      await inspectActivationConfiguration(values, packet, 'bridge', 'synthetic-configuration-token', AbortSignal.timeout(10000), transport);
    } else await assert.rejects(operation, error => error instanceof ActivationConfigurationError
      && error.outcome === (scenario === 'privileged' ? 'not_started' : 'unknown'));
    assert.equal(writes, scenario === 'privileged' ? 0 : 1);
  }
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
    ({ id: `env_${index}`, key, value, type: 'encrypted', target: ['production'], decrypted: true }));
  const aliases = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY',
    'SUPABASE_ACCESS_TOKEN', 'SUPABASE_JWT_SECRET', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DATABASE_URL',
    'POSTGRES_PASSWORD', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL',
    'PGPASSWORD', 'PGPASSFILE', 'DATABASE_PASSWORD', 'DATABASE_ADMIN_URL', 'DIRECT_URL',
    'AUTH_ADMIN_KEY', 'AUTH_ADMIN_TOKEN', 'ADMIN_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET'];
  for (const key of aliases) {
    for (const stage of ['before-write', 'inspect', 'after-write'] as const) {
      let writes = 0, decryptions = 0, inventories = 0;
      const transport: typeof fetch = async (raw, init) => {
        const url = new URL(String(raw));
        if (init?.method === 'POST') { writes++; return Response.json({ failed: [] }); }
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
      const operation = stage === 'inspect' ? inspectActivationConfiguration : configureActivation;
      await assert.rejects(operation(values, packet, 'bridge', 'synthetic-configuration-token', AbortSignal.timeout(10000), transport),
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
