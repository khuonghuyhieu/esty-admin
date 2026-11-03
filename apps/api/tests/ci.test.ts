import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assembleArtifact, canonical, readArtifactFile, sha256, verifyArtifact } from '../scripts/artifact.js';
import type { FileRecord, VerifiedArtifact } from '../scripts/artifact.js';
import { artifactFixture } from './artifact-fixture.js';
import { checksContext } from '../scripts/ci.js';
import { acknowledgedId, deliver, deliveryContext } from '../scripts/ci-delivery.js';
import { approvedMigrationDigest, createProvider, repository } from '../scripts/ci-provider.js';
import type { DeliveryProvider, RunIdentity } from '../scripts/ci-provider.js';
import { verifyUploadedArchive } from '../scripts/ci-archive.js';
import { checkHostedHttp } from '../scripts/hosted-acceptance.js';
import type { CommandResult } from '../scripts/ci-tools.js';
import { migrationManifest } from '../src/generated/migrations.js';

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
