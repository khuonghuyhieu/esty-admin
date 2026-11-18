import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import type { TestContext } from 'node:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { assertSourceApproval } from '../scripts/release-core.js';
import { parseDeployConfig, vercelDeployment } from '../scripts/vercel-deploy.js';
import { artifactFixture, fileTree } from './artifact-fixture.js';
import { artifactTarget, canonical, sha256 } from '../scripts/artifact.js';
import type { VerifiedArtifact } from '../scripts/artifact.js';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReleaseJournal, describeRetainedRun, readReleaseJournal, writeReleaseEvidence } from '../scripts/release-journal.js';
import type { ReleaseBinding, SupersessionApproval } from '../scripts/release-journal.js';
import { bounded } from '../scripts/bounded.js';
import { etsyReleasePhases, etsyProviderOperations, runEtsyReleasePhase, validateEtsyReleasePacket } from '../scripts/etsy-release.js';
import type { EtsyReleaseOperations, EtsyReleasePacket, EtsyReleasePhase } from '../scripts/etsy-release.js';
import { activationRuntimeKeys } from '../src/config/activation-config.js';
import { currentAppMetadata } from '../scripts/activation-configuration.js';
import { manifestDigest } from '../scripts/migrations.js';
import type { MigrationReport } from '../scripts/migrations.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { readEvidence } from '../scripts/release-journal.js';
// Protocol-only cases isolate storage; durability is exercised with real journals below.
const checkpoints = { beforeCreate() {}, acknowledged(_id: string) {} };
let artifact: VerifiedArtifact;
let dispose: () => Promise<void>;
before(async () => { const fixture = await artifactFixture(); artifact = fixture.artifact; dispose = fixture.dispose; });
after(async () => { await dispose?.(); });

const revision = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const deploy = parseDeployConfig({ VERCEL_TOKEN: 'synthetic-provider-token', VERCEL_PROJECT_ID: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls',
  VERCEL_SCOPE: 'khuonghuyhieu0705s-projects', VERCEL_TEAM_ID: artifactTarget.owner, REPOSITORY: 'https://github.com/synthetic/repository',
  DEPLOYMENT_TARGET: 'production', PREVIEW_ACCESS_KEY: 'c'.repeat(64), API_ORIGIN: 'https://api.lovora.us', BROWSER_ORIGIN: 'https://app.lovora.us' });
const project = { id: deploy.VERCEL_PROJECT_ID, name: 'esty-admin-api', accountId: deploy.VERCEL_TEAM_ID,
  rootDirectory: 'apps/api', framework: 'nestjs', nodeVersion: '24.x', buildCommand: null, installCommand: null, outputDirectory: null,
  link: { type: 'github', org: 'synthetic', repo: 'repository', repoId: 123, productionBranch: 'main', deployHooks: [] } };
const deployment = { id: 'dpl_synthetic', projectId: deploy.VERCEL_PROJECT_ID, ownerId: deploy.VERCEL_TEAM_ID, target: 'production', readyState: 'READY' };
const domain = { name: 'api.lovora.us', projectId: deploy.VERCEL_PROJECT_ID, verified: true };
const alias = { alias: 'api.lovora.us', projectId: deploy.VERCEL_PROJECT_ID, deploymentId: deployment.id, deployment: { id: deployment.id } };
function synthetic(options: { project?: unknown; domain?: unknown; deployment?: unknown; alias?: (count: number) => unknown; smoke?: () => Response; postStatus?: number; createId?: string; files?: unknown; onUpload?: () => Promise<void>; onRequest?: (url: URL, init?: RequestInit) => void; artifact?: VerifiedArtifact } = {}) {
  let bindings = 0, requests = 0;
  const selected = options.artifact ?? artifact;
  let uploads = 0, creates = 0;
  const received = new Map<string, Uint8Array>();
  const transport: typeof fetch = async (input, init) => {
    requests++;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(init?.redirect, 'error');
    options.onRequest?.(url, init);
    if (url.origin === 'https://api.vercel.com') {
      assert.equal(headers.get('authorization'), `Bearer ${deploy.VERCEL_TOKEN}`);
      assert.equal(url.searchParams.get('teamId'), deploy.VERCEL_TEAM_ID);
      assert.equal(url.searchParams.get('slug'), deploy.VERCEL_SCOPE);
      if (url.pathname === `/v9/projects/${deploy.VERCEL_PROJECT_ID}`) return Response.json(options.project ?? project);
      if (url.pathname.endsWith('/domains/api.lovora.us')) return Response.json(options.domain ?? domain);
      if (url.pathname === '/v2/files') {
        uploads++;
        assert.equal(init?.method, 'POST'); assert.equal(headers.get('content-type'), 'application/octet-stream');
        assert.ok(init?.body instanceof Uint8Array);
        const bytes = init.body;
        const digest = createHash('sha1').update(bytes).digest('hex');
        assert.equal(headers.get('x-now-digest'), digest);
        assert.equal(Number(headers.get('x-now-size')), bytes.byteLength);
        assert.equal(Number(headers.get('content-length')), bytes.byteLength);
        received.set(digest, bytes);
        await options.onUpload?.();
        return new Response(null, { status: 200 });
      }
      if (url.pathname === `/v6/deployments/${deployment.id}/files`) return Response.json(options.files ?? fileTree(selected));
      if (url.pathname === '/v13/deployments' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        creates++;
        assert.equal(url.searchParams.get('prebuilt'), '1'); assert.equal(body.gitSource, undefined);
        assert.deepEqual(body.files, selected.manifest.files.filter(file => file.path.startsWith('.vercel/output/')).map(file => ({ file: file.path, sha: file.sha1, size: file.size, mode: 0o100000 | file.mode })));
        for (const file of body.files) assert.equal(received.get(file.sha)?.byteLength, file.size);
        assert.equal(body.project, deploy.VERCEL_PROJECT_ID); assert.equal(body.target, 'production');
        return Response.json({ id: options.createId ?? deployment.id, meta: { githubCommitSha: revision } }, { status: options.postStatus ?? 200 });
      }
      if (url.pathname === `/v13/deployments/${deployment.id}`) {
        return Response.json(options.deployment ?? deployment);
      }
      if (url.pathname === '/v4/aliases/api.lovora.us') { bindings++; return Response.json(options.alias?.(bindings) ?? alias); }
      throw new Error('Unexpected synthetic provider route; no network fallback.');
    }
    assert.equal(url.origin, deploy.API_ORIGIN);
    assert.notEqual(headers.get('authorization'), `Bearer ${deploy.VERCEL_TOKEN}`);
    if (options.smoke) return options.smoke();
    if (init?.method === 'OPTIONS') return headers.get('origin') === deploy.BROWSER_ORIGIN
      ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': deploy.BROWSER_ORIGIN } }) : Response.json({ status: 'unauthorized' }, { status: 401 });
    if (headers.get('authorization') !== `Bearer ${deploy.PREVIEW_ACCESS_KEY}`) return Response.json({ status: 'unauthorized' }, { status: 401 });
    if (url.pathname === '/health/live') return Response.json({ status: 'ok' });
    if (url.pathname === '/health/ready') return Response.json({ status: 'ready', database: 'up', migrations: 'current' });
    if (url.pathname === '/__release_unknown_route') return new Response(null, { status: 404 });
    throw new Error('Unexpected synthetic application route; no network fallback.');
  };
  return { adapter: vercelDeployment(deploy, selected, transport), bindings: () => bindings, requests: () => requests, uploads: () => uploads, creates: () => creates };
}
const signal = () => AbortSignal.timeout(5000);
test('source approval rejects dirty, mismatched revision and changed manifest', () => {
  for (const actual of [{ revision, dirty: true, digest }, { revision: 'c'.repeat(40), dirty: false, digest }, { revision, dirty: false, digest: 'd'.repeat(64) }]) {
    assert.throws(() => assertSourceApproval(actual, revision, digest), /exact clean/);
  }
  assertSourceApproval({ revision, dirty: false, digest }, revision, digest);
});
test('deploy context rejects retired, mixed, wrong project, implicit target and unsafe origins', () => {
  for (const changes of [{ RENDER_API_KEY: 'synthetic' }, { DATABASE_URL: 'synthetic' }, { MIGRATION_DATABASE_URL: 'synthetic' },
    { API_ORIGIN: 'http://api.lovora.us' }, { API_ORIGIN: 'https://other.example' }, { VERCEL_PROJECT_ID: 'prj_other' },
    { VERCEL_SCOPE: 'other' }, { VERCEL_TEAM_ID: '../other' }, { DEPLOYMENT_TARGET: undefined }, { DEPLOYMENT_TARGET: 'preview' },
    { REPOSITORY: deploy.REPOSITORY + '.git' }, { PREVIEW_ACCESS_KEY: 'wrong' }]) assert.throws(() => parseDeployConfig({ ...deploy, ...changes }));
});
test('project and verified domain mismatches block deployment', async () => {
  for (const changes of [{ id: 'prj_other' }, { accountId: 'team_other' }, { rootDirectory: 'apps/web' }, { framework: 'nextjs' },
    { nodeVersion: '22.x' }, { commandForIgnoringBuildStep: 'exit 0' }, { link: { ...project.link, productionBranch: 'other' } },
    { buildCommand: 'unapproved-build' }, { installCommand: 'unapproved-install' }, { outputDirectory: 'other' },
    { link: { ...project.link, deployHooks: [{}] } }, { link: { ...project.link, repoId: undefined } }]) {
    const { adapter } = synthetic({ project: { ...project, ...changes } });
    await assert.rejects(adapter.preflight(signal())); await assert.rejects(adapter.trigger(revision, signal(), checkpoints));
  }
  for (const changes of [{ verified: false }, { projectId: 'prj_other' }, { redirect: 'https://other.example' }, { gitBranch: 'other' }]) {
    await assert.rejects(synthetic({ domain: { ...domain, ...changes } }).adapter.preflight(signal()));
  }
});
test('provider identity must match the created prebuilt invocation, not source metadata', async () => {
  for (const changes of [{ gitSource: { sha: revision } }, { id: 'dpl_other' }, { projectId: 'prj_other' },
    { ownerId: 'team_other' }, { target: 'preview' }, { readyState: 'UNKNOWN' }]) {
    const { adapter } = synthetic({ deployment: { ...deployment, ...changes } });
    await adapter.preflight(signal()); await assert.rejects(adapter.trigger(revision, signal(), checkpoints));
  }
  for (const postStatus of [202, 302, 500]) {
    const { adapter } = synthetic({ postStatus }); await adapter.preflight(signal()); await assert.rejects(adapter.trigger(revision, signal(), checkpoints));
  }
});

test('deployment diagnostics classify transport failures without retaining upstream data', async t => {
  for (const [name, code, expected] of [
    ['dns', 'ENOTFOUND', 'dns'], ['tcp', 'ECONNRESET', 'tcp'], ['tls', 'ERR_TLS_CERT_ALTNAME_INVALID', 'tls'],
    ['timeout', 'UND_ERR_HEADERS_TIMEOUT', 'timeout'], ['unknown', 'synthetic-private-code', 'unclassified'],
  ]) await t.test(name!, async () => {
    const upstream = new TypeError('synthetic-private-message', { cause: Object.assign(new Error('synthetic-private-cause'), { code }) });
    const current = synthetic({ onRequest() { throw upstream; } });
    const active = signal();
    await assert.rejects(current.adapter.preflight(active));
    const diagnostics = current.adapter.diagnostics(upstream, active);
    assert.deepEqual(diagnostics, { operation: 'preflight', request_state: 'in_flight', category: expected, http_status: null, deploy_id: null });
    assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic-private|https:|ENOTFOUND|ECONNRESET/);
  });
});
test('deployment diagnostics distinguish upload and uncertain create from acknowledged inspection and attestation', async t => {
  for (const [operation, path, acknowledged] of [
    ['upload', '/v2/files', false], ['create', '/v13/deployments', false],
    ['inspect', `/v13/deployments/${deployment.id}`, true], ['attest', `/v6/deployments/${deployment.id}/files`, true],
  ] as const) await t.test(operation, async () => {
    const upstream = new TypeError('synthetic-private-message', { cause: { code: 'ECONNRESET' } });
    const current = synthetic({ onRequest(url) { if (url.pathname === path) throw upstream; } });
    const active = signal();
    await current.adapter.preflight(active);
    await assert.rejects(current.adapter.trigger(revision, active, checkpoints));
    assert.deepEqual(current.adapter.diagnostics(upstream, active), {
      operation, request_state: 'in_flight', category: 'tcp', http_status: null, deploy_id: acknowledged ? deployment.id : null,
    });
    assert.equal(current.creates(), acknowledged ? 1 : 0);
  });
});
test('HTTP rejection is recorded without turning a create response into acknowledgement', async () => {
  const current = synthetic({ postStatus: 429 }), active = signal();
  await current.adapter.preflight(active);
  await assert.rejects(current.adapter.trigger(revision, active, checkpoints));
  assert.deepEqual(current.adapter.diagnostics(undefined, active), {
    operation: 'create', request_state: 'response_received', category: 'http', http_status: 429, deploy_id: null,
  });
  assert.equal(current.creates(), 1);
});
test('active cancellation classification survives the outer bounded race', async t => {
  for (const [category, reason] of [['aborted', new Error('synthetic-private-reason')], ['timeout', new DOMException('synthetic-private-reason', 'TimeoutError')]] as const) {
    await t.test(category, async () => {
      const controller = new AbortController();
      const current = synthetic({ onUpload: () => {
        queueMicrotask(() => controller.abort(reason));
        return new Promise<void>(() => {});
      } });
      await current.adapter.preflight(signal());
      let failure: unknown;
      await assert.rejects(bounded(current.adapter.trigger(revision, controller.signal, checkpoints), controller.signal), error => { failure = error; return true; });
      assert.deepEqual(current.adapter.diagnostics(failure, controller.signal), {
        operation: 'upload', request_state: 'in_flight', category, http_status: null, deploy_id: null,
      });
      assert.equal(current.creates(), 0);
    });
  }
});
test('unsafe or oversized create identifiers never enter diagnostic reports', async () => {
  for (const createId of ['https://synthetic-private.example/token', 'dpl_' + 'a'.repeat(125)]) {
    const current = synthetic({ createId }), active = signal();
    await current.adapter.preflight(active);
    await assert.rejects(current.adapter.trigger(revision, active, checkpoints));
    const diagnostics = current.adapter.diagnostics(undefined, active);
    assert.equal(diagnostics.operation, 'create'); assert.equal(diagnostics.request_state, 'response_received');
    assert.equal(diagnostics.deploy_id, null);
    assert.ok(!JSON.stringify(diagnostics).includes(createId));
  }
});
test('normalized pending and terminal provider states are never READY success', async () => {
  for (const [readyState, expected] of [['QUEUED', 'queued'], ['INITIALIZING', 'building'], ['BUILDING', 'building'], ['ERROR', 'failed'], ['BLOCKED', 'failed'], ['CANCELED', 'canceled']] as const) {
    const { adapter } = synthetic({ deployment: { ...deployment, readyState } });
    await adapter.preflight(signal()); const state = await adapter.trigger(revision, signal(), checkpoints);
    assert.equal(state.status, expected); await assert.rejects(adapter.smoke(state, signal()));
  }
});
test('same-deployment domain binding and safe HTTP must both hold before and after smoke', async () => {
  const valid = synthetic(); await valid.adapter.preflight(signal());
  const state = await valid.adapter.trigger(revision, signal(), checkpoints);
  await valid.adapter.smoke(state, signal()); assert.equal(valid.bindings(), 2);
  for (const changes of [{ deploymentId: 'dpl_old' }, { projectId: 'prj_other' }, { deployment: { id: 'dpl_old' } },
    { deletedAt: 1 }, { redirect: 'https://other.example' }, { microfrontends: {} }]) {
    const current = synthetic({ alias: () => ({ ...alias, ...changes }) });
    await current.adapter.preflight(signal()); const currentState = await current.adapter.trigger(revision, signal(), checkpoints);
    await assert.rejects(current.adapter.smoke(currentState, signal()));
  }
  const changed = synthetic({ alias: count => count === 1 ? alias : { ...alias, deploymentId: 'dpl_old' } });
  await changed.adapter.preflight(signal()); const changedState = await changed.adapter.trigger(revision, signal(), checkpoints);
  await assert.rejects(changed.adapter.smoke(changedState, signal())); assert.equal(changed.bindings(), 2);
  for (const smoke of [() => new Response('<html>Loading</html>'), () => Response.json({ status: 'ready' }), () => new Response(null, { status: 302 })]) {
    const current = synthetic({ smoke }); await current.adapter.preflight(signal()); const currentState = await current.adapter.trigger(revision, signal(), checkpoints);
    await assert.rejects(current.adapter.smoke(currentState, signal()));
  }
});
test('missing or altered provider file attestation cannot become ready', async () => {
  for (const files of [[], [{ name: '.vercel', type: 'directory', children: [] }], [{ name: '../secret', type: 'file' }]]) {
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
  }
});
test('canonical decimal provider modes attest the complete approved artifact', async () => {
  const current = synthetic({ files: fileTree(artifact, true) });
  await current.adapter.preflight(signal());
  const state = await current.adapter.trigger(revision, signal(), checkpoints);
  assert.equal(state.status, 'ready');
  assert.equal(state.artifactDigest, artifact.digest);
  await current.adapter.smoke(state, signal());
  assert.equal(current.bindings(), 2);
});
test('provider mode normalization rejects coercion, overflow and changed full POSIX values', async t => {
  const expected = 0o100000 | artifact.manifest.files.find(file => file.path.startsWith('.vercel/output/'))!.mode;
  const rejected: [string, unknown][] = [
    ['missing', undefined], ['null', null], ['boolean', true], ['array', [expected]], ['object', { value: expected }],
    ['empty', ''], ['whitespace', ` ${expected}`], ['trailing whitespace', `${expected}\n`],
    ['leading zero', `0${expected}`], ['positive sign', `+${expected}`], ['negative', -expected],
    ['decimal fraction', `${expected}.0`], ['numeric fraction', expected + 0.5], ['exponent', `${expected}e0`],
    ['hexadecimal', `0x${expected.toString(16)}`], ['octal prefix', `0o${expected.toString(8)}`],
    ['octal digits', expected.toString(8)], ['suffix', `${expected}x`], ['oversized string', '9'.repeat(100)],
    ['mode range overflow', 65536], ['bitwise wrap', expected + 2 ** 32], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['permissions only', expected & 0o777], ['special bit', expected | 0o4000],
    ['different permissions', expected ^ 0o100], ['wrong file type', 0o120000 | (expected & 0o777)],
    ['wrong decimal mode', String(expected ^ 0o100)],
  ];
  for (const [name, mode] of rejected) await t.test(name, async () => {
    const files = fileTree(artifact, true);
    const leaves = (entries: any[]): any[] => entries.flatMap(entry => entry.type === 'directory' ? leaves(entry.children) : [entry]);
    leaves(files)[0].mode = mode;
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
    assert.equal(current.bindings(), 0);
  });
});
test('decimal modes do not excuse changed file identity, root or duplicate evidence', async t => {
  for (const name of ['uid', 'type', 'root', 'path', 'duplicate', 'missing', 'extra']) await t.test(name, async () => {
    const files = fileTree(artifact, true), directory = files[0].children[0].children[0];
    const file = directory.children.find((entry: any) => entry.type === 'file');
    if (name === 'uid') file.uid = '0'.repeat(40);
    if (name === 'type') file.type = 'symlink';
    if (name === 'root') files[0].name = 'rebased';
    if (name === 'path') file.name = '../' + file.name;
    if (name === 'duplicate') directory.children.push({ ...file });
    if (name === 'missing') directory.children.splice(directory.children.indexOf(file), 1);
    if (name === 'extra') directory.children.push({ ...file, name: 'unapproved.json' });
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
    assert.equal(current.bindings(), 0);
  });
});
test('provider envelope requires exact source namespace and single generated output', async t => {
  for (const name of ['bare tree', 'missing source', 'duplicate source', 'extra namespace', 'wrong source type',
    'wrong directory mode', 'missing output', 'extra function', 'wrong function name', 'wrong output type',
    'wrong output mode', 'nested output', 'rebased source contents']) await t.test(name, async () => {
    let files: any[] = fileTree(artifact);
    const source = files[0], output = files[1], runtime = output.children[0];
    if (name === 'bare tree') files = source.children;
    if (name === 'missing source') files = [output];
    if (name === 'duplicate source') files = [source, source];
    if (name === 'extra namespace') files.push({ name: 'other', type: 'directory', mode: 0o40555, children: [] });
    if (name === 'wrong source type') source.type = 'file';
    if (name === 'wrong directory mode') source.mode = 0o40755;
    if (name === 'missing output') output.children = [];
    if (name === 'extra function') output.children.push({ ...runtime, name: 'unapproved' });
    if (name === 'wrong function name') runtime.name = 'other';
    if (name === 'wrong output type') runtime.type = 'file';
    if (name === 'wrong output mode') runtime.mode = 0o100666;
    if (name === 'nested output') runtime.children = [{ name: 'unapproved', type: 'file' }];
    if (name === 'rebased source contents') source.children = source.children[0].children;
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
    assert.equal(current.bindings(), 0);
  });
});
test('mutation during upload and cancellation never create a deployment or retry', async t => {
  for (const mode of ['mutate', 'cancel']) await t.test(mode, async t => {
    const fixture = await artifactFixture(); t.after(fixture.dispose);
    const controller = new AbortController();
    const current = synthetic({ artifact: fixture.artifact, onUpload: async () => {
      if (mode === 'cancel') { controller.abort(); return; }
      const path = join(fixture.artifact.root, '.vercel/output/functions/index.func/apps/api/src/main.js');
      await chmod(path, 0o600); await writeFile(path, 'tampered');
    } });
    await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, controller.signal, checkpoints));
    assert.equal(current.creates(), 0);
    if (mode === 'cancel') assert.equal(current.uploads(), 1);
  });
});

function journalFixture(t: TestContext) {
  const directory = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'esty-journal-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previousId = randomUUID(), previousRevision = 'd'.repeat(40);
  writeReleaseEvidence(join(directory, 'operator.lock'), { run_id: previousId, revision: previousRevision });
  writeReleaseEvidence(join(directory, `${previousId}.json`), {
    run_id: previousId, revision: previousRevision, artifact_digest: 'e'.repeat(64), manifest_digest: artifact.manifest.migrationDigest,
    target: 'local', result: 'failed', stage: 'deploy', deployment: 'unknown', deploy_id: null, lock_retained: true, reporting: 'written',
    migration: { result: 'success', database_outcome: 'committed', manifest_digest: artifact.manifest.migrationDigest, source_revision: previousRevision },
  });
  const binding: ReleaseBinding = { run_id: randomUUID(), revision, artifact_digest: artifact.digest,
    manifest_digest: artifact.manifest.migrationDigest, target: 'local', schema_mode: 'current-schema-only' };
  const previous = describeRetainedRun(directory, previousId);
  const approval: SupersessionApproval = { version: 1, decision: 'accept-late-create-alias-risk-and-unresolved-https', previous, next: binding };
  const original = { lock: fs.readFileSync(join(directory, 'operator.lock')), report: fs.readFileSync(join(directory, `${previousId}.json`)) };
  const unchanged = () => {
    assert.deepEqual(describeRetainedRun(directory, previousId), previous);
    assert.deepEqual(fs.readFileSync(join(directory, 'operator.lock')), original.lock);
    assert.deepEqual(fs.readFileSync(join(directory, `${previousId}.json`)), original.report);
  };
  return { directory, binding, approval, unchanged, run: join(directory, 'runs', binding.run_id) };
}
function observeFsync(t: TestContext, visit: (path: string, sync: () => void) => void) {
  const opened = new Map<number, string>();
  const open = fs.openSync, close = fs.closeSync, sync = fs.fsyncSync;
  t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => { const fd = open(...args); opened.set(fd, String(args[0])); return fd; });
  t.mock.method(fs, 'closeSync', (fd: number) => { opened.delete(fd); return close(fd); });
  t.mock.method(fs, 'fsyncSync', (fd: number) => visit(opened.get(fd) ?? '', () => sync(fd)));
}

test('supersession durably claims one successor while preserving the unknown predecessor inode and bytes', t => {
  const fixture = journalFixture(t);
  const journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, fixture.approval));
  const other = { ...fixture.binding, run_id: randomUUID() };
  assert.throws(() => createReleaseJournal(fixture.directory, other, { ...fixture.approval, next: other }));
  journal.beforeCreate();
  assert.throws(() => journal.beforeCreate());
  journal.acknowledge(deployment.id);
  assert.throws(() => journal.acknowledge('dpl_other'));
  assert.equal(journal.finish({ result: 'failed', stage: 'deploy', deployment: 'unknown', deploy_id: deployment.id, retain_lock: true }), true);
  const state = readReleaseJournal(fixture.directory, fixture.binding);
  assert.equal(state.deploy_id, deployment.id);
  assert.equal(state.create_intent, true);
  assert.equal(state.outcome?.retain_lock, true);
  fixture.unchanged();
});

test('supersession refuses stale approval, wrong binding, changed original report and substituted historical lock', async t => {
  for (const mode of ['decision', 'manifest', 'artifact', 'revision', 'run', 'report-hash', 'inode', 'old-known-id', 'old-terminal', 'old-lock-replaced']) {
    await t.test(mode, t => {
      const fixture = journalFixture(t), approval = structuredClone(fixture.approval);
      if (mode === 'decision') (approval as any).decision = 'not-accepted';
      if (mode === 'manifest') approval.next.manifest_digest = '0'.repeat(64);
      if (mode === 'artifact') approval.next.artifact_digest = '0'.repeat(64);
      if (mode === 'revision') approval.next.revision = '0'.repeat(40);
      if (mode === 'run') approval.next.run_id = randomUUID();
      if (mode === 'report-hash') approval.previous.report_sha256 = '0'.repeat(64);
      if (mode === 'inode') approval.previous.lock.ino = '0';
      if (mode.startsWith('old-') && mode !== 'old-lock-replaced') {
        const path = join(fixture.directory, `${approval.previous.run_id}.json`);
        const report = JSON.parse(fs.readFileSync(path, 'utf8'));
        if (mode === 'old-known-id') report.deploy_id = deployment.id;
        else report.deployment = 'ready';
        fs.writeFileSync(path, JSON.stringify(report));
      }
      if (mode === 'old-lock-replaced') {
        const path = join(fixture.directory, 'operator.lock'), bytes = fs.readFileSync(path);
        fs.renameSync(path, join(fixture.directory, 'original-lock-preserved'));
        fs.writeFileSync(path, bytes, { mode: 0o600 });
      }
      assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, approval));
      assert.equal(fs.existsSync(join(fixture.run, 'create-intent.json')), false);
    });
  }
});

test('read-only journal validation rejects altered records, receipts and replacement locks', async t => {
  for (const mode of ['intent.json', 'locked.json', 'create-intent.json', 'acknowledged.json', 'receipt', 'child-lock', 'extra', 'permissions', 'symlink', 'wrong-artifact']) {
    await t.test(mode, t => {
      const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
      journal.beforeCreate(); journal.acknowledge(deployment.id);
      if (mode === 'extra') fs.writeFileSync(join(fixture.run, 'unapproved.json'), '{}', { mode: 0o600 });
      else if (mode === 'permissions') fs.chmodSync(join(fixture.run, 'acknowledged.json'), 0o644);
      else if (mode === 'symlink') {
        const path = join(fixture.run, 'acknowledged.json');
        fs.renameSync(path, join(fixture.directory, 'original-ack'));
        fs.symlinkSync(join(fixture.directory, 'original-ack'), path);
      } else if (mode === 'child-lock') {
        const path = join(fixture.run, 'operator.lock'), bytes = fs.readFileSync(path);
        fs.renameSync(path, join(fixture.directory, 'original-child-lock'));
        fs.writeFileSync(path, bytes, { mode: 0o600 });
      } else if (mode !== 'wrong-artifact') {
        const path = mode === 'receipt' ? join(fixture.directory, 'supersessions', `${fixture.approval.previous.run_id}.json`) : join(fixture.run, mode);
        const value = JSON.parse(fs.readFileSync(path, 'utf8'));
        value.binding.artifact_digest = 'f'.repeat(64);
        fs.writeFileSync(path, JSON.stringify(value));
      }
      const binding = mode === 'wrong-artifact' ? { ...fixture.binding, artifact_digest: 'f'.repeat(64) } : fixture.binding;
      assert.throws(() => readReleaseJournal(fixture.directory, binding));
      assert.throws(() => journal.beforeCreate());
      fixture.unchanged();
    });
  }
});

test('failed file or directory fsync leaves blocking evidence and never permits a create retry', async t => {
  for (const phase of ['intent', 'lock', 'locked', 'receipt', 'receipt-directory', 'create', 'ack']) {
    await t.test(phase, t => {
      const fixture = journalFixture(t);
      const suffix = { intent: '/intent.json', lock: '/operator.lock', locked: '/locked.json',
        receipt: `/supersessions/${fixture.approval.previous.run_id}.json`, 'receipt-directory': '/supersessions',
        create: '/create-intent.json', ack: '/acknowledged.json' }[phase]!;
      let failed = false;
      observeFsync(t, (path, sync) => {
        if (path.endsWith(suffix) && (phase !== 'receipt-directory' || fs.existsSync(join(path, `${fixture.approval.previous.run_id}.json`)))) {
          failed = true; throw Object.assign(new Error('Synthetic storage failure'), { code: 'EIO' });
        }
        sync();
      });
      assert.throws(() => {
        const journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
        journal.beforeCreate(); journal.acknowledge(deployment.id);
      });
      assert.equal(failed, true);
      t.mock.restoreAll();
      assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, fixture.approval));
      fixture.unchanged();
    });
  }
});

test('adapter waits for durable acknowledgement before inspect and refuses a second trigger', async t => {
  const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  let inspected = 0;
  let release!: () => void, entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const current = synthetic({ onRequest(url, init) {
    if (url.pathname === '/v13/deployments' && init?.method === 'POST') {
      assert.equal(readReleaseJournal(fixture.directory, fixture.binding).create_intent, true);
    }
    if (url.pathname === `/v13/deployments/${deployment.id}`) {
      inspected++;
      assert.equal(readReleaseJournal(fixture.directory, fixture.binding).deploy_id, deployment.id);
    }
  } });
  await current.adapter.preflight(signal());
  const pending = current.adapter.trigger(revision, signal(), {
    beforeCreate: () => journal.beforeCreate(),
    async acknowledged(id) { entered(); await blocked; journal.acknowledge(id); },
  });
  await waiting;
  assert.equal(current.creates(), 1); assert.equal(inspected, 0);
  assert.equal(readReleaseJournal(fixture.directory, fixture.binding).deploy_id, null);
  release(); await pending;
  assert.equal(inspected, 1);
  await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
  assert.equal(current.creates(), 1);
  fixture.unchanged();
});

test('acknowledgement fsync failure blocks inspection but retains the acknowledged identity and lock', async t => {
  const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  let inspected = 0;
  const current = synthetic({ onRequest(url) { if (url.pathname === `/v13/deployments/${deployment.id}`) inspected++; } });
  await current.adapter.preflight(signal());
  observeFsync(t, (path, sync) => { if (path.endsWith('/acknowledged.json')) throw new Error('Synthetic fsync failure'); sync(); });
  await assert.rejects(current.adapter.trigger(revision, signal(), { beforeCreate: () => journal.beforeCreate(), acknowledged: id => journal.acknowledge(id) }));
  assert.equal(current.creates(), 1); assert.equal(inspected, 0);
  assert.equal(current.adapter.diagnostics(undefined, signal()).deploy_id, deployment.id);
  assert.equal(fs.existsSync(join(fixture.run, 'operator.lock')), true);
  t.mock.restoreAll();
  await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
  assert.equal(current.creates(), 1);
  fixture.unchanged();
});

test('cancellation after a valid create response still records the ID before refusing inspection', async t => {
  const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  const controller = new AbortController();
  let inspected = 0;
  const current = synthetic({ onRequest(url, init) {
    if (url.pathname === '/v13/deployments' && init?.method === 'POST') controller.abort();
    if (url.pathname === `/v13/deployments/${deployment.id}`) inspected++;
  } });
  await current.adapter.preflight(signal());
  await assert.rejects(current.adapter.trigger(revision, controller.signal, {
    beforeCreate: () => journal.beforeCreate(), acknowledged: id => journal.acknowledge(id),
  }));
  assert.equal(current.creates(), 1); assert.equal(inspected, 0);
  assert.equal(readReleaseJournal(fixture.directory, fixture.binding).deploy_id, deployment.id);
  fixture.unchanged();
});

test('process loss at receipt lock create and acknowledgement boundaries never reopens create', async t => {
  for (const phase of ['intent', 'lock', 'locked', 'receipt-partial', 'receipt', 'create', 'remote-accepted', 'ack-partial', 'ack']) {
    await t.test(phase, t => {
      const fixture = journalFixture(t);
      const source = `
import fs from 'node:fs';
import {createReleaseJournal, writeReleaseEvidence} from ${JSON.stringify(new URL('../scripts/release-journal.js', import.meta.url).href)};
const directory=${JSON.stringify(fixture.directory)}, binding=${JSON.stringify(fixture.binding)}, approval=${JSON.stringify(fixture.approval)}, phase=${JSON.stringify(phase)};
const opened=new Map(), open=fs.openSync, close=fs.closeSync, sync=fs.fsyncSync, write=fs.writeFileSync;
fs.openSync=(path,flags,mode)=>{const fd=open(path,flags,mode);opened.set(fd,String(path));return fd;};
fs.closeSync=fd=>{opened.delete(fd);return close(fd);};
const suffix={intent:'/intent.json',lock:'/operator.lock',locked:'/locked.json',receipt:'/supersessions/'+approval.previous.run_id+'.json',create:'/create-intent.json',ack:'/acknowledged.json'}[phase];
fs.fsyncSync=fd=>{sync(fd);if(suffix && opened.get(fd)?.endsWith(suffix)) process.exit(73);};
fs.writeFileSync=(fd,value,...args)=>{
  const path=opened.get(fd)??'';
  if((phase==='receipt-partial'&&path.endsWith('/supersessions/'+approval.previous.run_id+'.json'))||(phase==='ack-partial'&&path.endsWith('/acknowledged.json'))){write(fd,'{');process.exit(73);}
  return write(fd,value,...args);
};
const journal=createReleaseJournal(directory,binding,approval);
journal.beforeCreate();
writeReleaseEvidence(directory+'/remote-create.json',{count:1});
if(phase==='remote-accepted')process.exit(73);
journal.acknowledge('dpl_synthetic');
process.exit(74);
`;
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8', timeout: 10000,
        env: { PATH: process.env.PATH, HOME: fixture.directory } });
      assert.equal(child.status, 73, child.stderr);
      assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, fixture.approval));
      if (['receipt', 'create', 'remote-accepted', 'ack'].includes(phase)) {
        const state = readReleaseJournal(fixture.directory, fixture.binding);
        assert.equal(state.create_intent, phase !== 'receipt');
        assert.equal(state.deploy_id, phase === 'ack' ? deployment.id : null);
      } else assert.throws(() => readReleaseJournal(fixture.directory, fixture.binding));
      const accepted = ['remote-accepted', 'ack-partial', 'ack'].includes(phase);
      assert.equal(fs.existsSync(join(fixture.directory, 'remote-create.json')), accepted);
      if (accepted) assert.equal(JSON.parse(fs.readFileSync(join(fixture.directory, 'remote-create.json'), 'utf8')).count, 1);
      fixture.unchanged();
    });
  }
});

function etsyPacket(root: string): EtsyReleasePacket {
  return { version: 1, runId: randomUUID(), ledgerRoot: root, revision: 'a'.repeat(40), tree: 'b'.repeat(40),
    sourceDigest: 'c'.repeat(64), artifactDigest: 'd'.repeat(64), runtimeDigest: 'e'.repeat(64), configBundleDigest: 'f'.repeat(64),
    migrationInputDigest: '1'.repeat(64), previousDigest: manifestDigest(migrationManifest.slice(0, 3)), targetDigest: manifestDigest(migrationManifest),
    target: 'local', driverDigest: '2'.repeat(64), nodeDigest: '3'.repeat(64), cliDigest: '4'.repeat(64), cliOwnFilesDigest: '5'.repeat(64),
    browserOrigin: 'https://app.lovora.us', runtimeKeys: [...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].sort(), metadataDigest: '6'.repeat(64),
    predecessor: { id: 'dpl_old', revision: '7'.repeat(40), tree: '8'.repeat(40), sourceDigest: '9'.repeat(64), artifactDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64) },
    window: { start: Date.now() - 1000, end: Date.now() + 600000 },
    grants: { exclusiveOwnerLease: 'synthetic-exclusive-lease', automatedDelivery: 'disabled', maintenance: 'approved-readiness-interruption',
      recovery: 'approved-roll-forward-only', phases: [...etsyReleasePhases] } };
}
function etsyReleaseFixture(t: TestContext) {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'esty-setup-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packet = etsyPacket(root), packetDigest = sha256(canonical(packet)), calls: string[] = [];
  let names = migrationManifest.slice(0, 3).map(entry => entry.name), alias = packet.predecessor.id;
  const operations: EtsyReleaseOperations = {
    verify() {},
    async currentMain() { calls.push('main'); return { revision: packet.revision, tree: packet.tree }; },
    async history() { return [...names]; },
    async predecessor(pending) {
      calls.push(`old:${pending}`);
      assert.equal(alias, packet.predecessor.id);
      assert.equal(names.length, pending ? 4 : 3);
    },
    async create() {
      assert.ok(fs.existsSync(join(root, packet.runId, 'held-create.intent.json')));
      calls.push('CREATE'); return { code: 0, aborted: false, stdout: '{"deployment":{"id":"dpl_new"}}' };
    },
    async candidate(id, pending, final) {
      assert.equal(id, 'dpl_new'); assert.equal(names.length, pending ? 3 : 4);
      const ack = readEvidence(join(root, packet.runId, 'create-ack.json')).value;
      assert.deepEqual(ack, { packetDigest, deploymentId: id });
      calls.push(`candidate:${pending}:${final}`);
    },
    async migrate() {
      calls.push('SQL');
      const before = [...names]; names = migrationManifest.map(entry => entry.name);
      return { run_id: randomUUID(), source_revision: packet.revision, target: packet.target, manifest_digest: packet.targetDigest,
        started_at: new Date().toISOString(), ended_at: new Date().toISOString(), duration_ms: 1, result: 'success', stage: 'verification',
        failed_version: null, database_outcome: 'committed', before, after: [...names],
        attempted: [{ ...migrationManifest[3]!, outcome: 'applied_committed' }], reporting: 'not_requested' };
    },
    async promote(id) { assert.equal(id, 'dpl_new'); calls.push('PROMOTE'); alias = id; return { code: 0, aborted: false, stdout: '' }; },
    async alias(id) { assert.equal(id, alias); calls.push(`alias:${id}`); },
  };
  const run = (phase: EtsyReleasePhase, controllerSignal = signal()) => runEtsyReleasePhase({ packet, packetDigest, phase, operations, signal: controllerSignal });
  return { root, packet, packetDigest, calls, operations, run };
}
test('Etsy setup release persists same-ID one-create ordered phase receipts through final ACK', async t => {
  const fixture = etsyReleaseFixture(t);
  for (const phase of etsyReleasePhases) await fixture.run(phase);
  assert.deepEqual(fixture.calls.filter(call => ['CREATE', 'SQL', 'PROMOTE'].includes(call)), ['CREATE', 'SQL', 'PROMOTE']);
  assert.ok(fixture.calls.includes('old:true'));
  assert.ok(fixture.calls.includes('candidate:true:false'));
  assert.ok(fixture.calls.includes('candidate:false:true'));
  const final = readEvidence(join(fixture.root, fixture.packet.runId, 'final-domain-ack.receipt.json')).value;
  assert.ok(final && typeof final === 'object' && 'deploymentId' in final && final.deploymentId === 'dpl_new');
  assert.equal(fs.existsSync(join(fixture.root, 'active.lock')), false);
  assert.ok(fs.existsSync(join(fixture.root, 'operator.lock')));
});
test('Etsy setup release refuses stale packets grants history configuration and phase evidence before later mutation', async t => {
  for (const fault of ['main', 'tree', 'unknown-history', 'extra-migration', 'missing-receipt', 'missing-intent', 'missing-ack',
    'changed-main-before-sql', 'changed-report', 'alias-drift', 'candidate-failure', 'expired-window', 'missing-grant', 'changed-packet', 'sql-unknown', 'promote-unknown', 'missing-final-ack']) {
    await t.test(fault, async t => {
      const f = etsyReleaseFixture(t);
      if (fault === 'expired-window' || fault === 'missing-grant' || fault === 'changed-packet') {
        const value = structuredClone(f.packet);
        if (fault === 'expired-window') value.window.end = Date.now() - 1;
        if (fault === 'missing-grant') value.grants.phases = [];
        if (fault === 'changed-packet') value.runtimeDigest = '0'.repeat(64);
        assert.throws(() => validateEtsyReleasePacket(value, fault === 'changed-packet' ? f.packetDigest : sha256(canonical(value))));
        assert.equal(f.calls.length, 0); return;
      }
      if (fault === 'main' || fault === 'tree') {
        f.operations.currentMain = async () => ({ revision: fault === 'main' ? '0'.repeat(40) : f.packet.revision,
          tree: fault === 'tree' ? '0'.repeat(40) : f.packet.tree });
        await assert.rejects(f.run('history')); assert.equal(f.calls.includes('CREATE'), false); return;
      }
      if (fault === 'unknown-history') {
        f.operations.history = async () => ['unknown'];
        await assert.rejects(f.run('history')); assert.equal(f.calls.includes('CREATE'), false); return;
      }
      await f.run('history'); await f.run('held-create');
      const runRoot = join(f.root, f.packet.runId);
      if (fault === 'missing-receipt' || fault === 'missing-intent' || fault === 'missing-ack') {
        fs.unlinkSync(join(runRoot, fault === 'missing-receipt' ? 'held-create.receipt.json'
          : fault === 'missing-intent' ? 'held-create.intent.json' : 'create-ack.json'));
      }
      if (fault === 'alias-drift') f.operations.alias = async () => { throw new Error('synthetic drift'); };
      if (fault === 'candidate-failure') f.operations.candidate = async () => { throw new Error('synthetic configuration/health refusal'); };
      if (['missing-receipt', 'missing-intent', 'missing-ack', 'alias-drift', 'candidate-failure'].includes(fault)) {
        await assert.rejects(f.run('pre-sql-check')); assert.equal(f.calls.includes('SQL'), false);
      } else {
        await f.run('pre-sql-check');
        const migrate = f.operations.migrate;
        if (fault === 'extra-migration') f.operations.history = async () => [...migrationManifest.map(entry => entry.name), 'extra'];
        if (fault === 'sql-unknown') f.operations.migrate = async () => { await migrate(); throw new Error('lost SQL acknowledgement'); };
        if (fault === 'changed-main-before-sql') f.operations.currentMain = async () => ({ revision: '0'.repeat(40), tree: f.packet.tree });
        if (['extra-migration', 'sql-unknown', 'changed-main-before-sql'].includes(fault)) {
          await assert.rejects(f.run('sql-apply')); assert.equal(f.calls.includes('PROMOTE'), false);
        } else {
          await f.run('sql-apply');
          if (fault === 'changed-report') {
            const reportPath = join(runRoot, 'migration-report.json');
            const report = readEvidence(reportPath).value as MigrationReport;
            fs.writeFileSync(reportPath, JSON.stringify({ ...report, run_id: randomUUID() }));
            await assert.rejects(f.run('post-sql-check')); assert.equal(f.calls.includes('PROMOTE'), false);
          } else {
            await f.run('post-sql-check');
            if (fault === 'promote-unknown') {
              f.operations.promote = async () => { f.calls.push('PROMOTE'); return { code: 1, aborted: true, stdout: '' }; };
              await assert.rejects(f.run('promote-only'));
              await assert.rejects(f.run('promote-only'));
              assert.equal(f.calls.filter(call => call === 'PROMOTE').length, 1);
            } else {
              await f.run('promote-only');
              assert.equal(fs.existsSync(join(runRoot, 'final-domain-ack.receipt.json')), false);
              f.operations.candidate = async () => { throw new Error('final acceptance unavailable'); };
              await assert.rejects(f.run('final-domain-ack'));
              assert.equal(fs.existsSync(join(runRoot, 'final-domain-ack.receipt.json')), false);
            }
          }
        }
      }
      assert.ok(fs.existsSync(join(f.root, 'active.lock')));
      await assert.rejects(f.run('held-create'));
      assert.equal(f.calls.filter(call => call === 'CREATE').length, 1);
    });
  }
});
test('Etsy setup release concurrent and aborted CREATE retain acknowledged ID before any follow-up', async t => {
  for (const fault of ['concurrent', 'aborted-id', 'missing-id']) await t.test(fault, async t => {
    const f = etsyReleaseFixture(t); await f.run('history');
    const arrived = Promise.withResolvers<void>(), continueCreate = Promise.withResolvers<void>();
    const controller = new AbortController();
    f.operations.create = async () => {
      f.calls.push('CREATE'); arrived.resolve(); await continueCreate.promise;
      return { code: fault === 'concurrent' ? 0 : 1, aborted: fault !== 'concurrent',
        stdout: fault === 'missing-id' ? '{}' : '{"deployment":{"id":"dpl_new"}}' };
    };
    const pending = f.run('held-create', controller.signal);
    await arrived.promise;
    if (fault === 'concurrent') await assert.rejects(f.run('held-create'));
    else controller.abort();
    continueCreate.resolve();
    if (fault === 'concurrent') await pending; else await assert.rejects(pending);
    const path = join(f.root, f.packet.runId, 'create-ack.json');
    assert.equal(fs.existsSync(path), fault !== 'missing-id');
    if (fault !== 'missing-id') assert.deepEqual(readEvidence(path).value, { packetDigest: f.packetDigest, deploymentId: 'dpl_new' });
    assert.equal(f.calls.filter(call => call === 'CREATE').length, 1);
    assert.equal(f.calls.some(call => call.startsWith('candidate:')), false);
  });
});
test('Etsy setup release new processes cannot repeat CREATE or promote with consumed intent', async t => {
  for (const phase of ['held-create', 'promote-only'] as const) await t.test(phase, async t => {
    const f = etsyReleaseFixture(t);
    for (const next of etsyReleasePhases) { await f.run(next); if (next === phase) break; }
    const program = `import {runEtsyReleasePhase} from ${JSON.stringify(new URL('../scripts/etsy-release.js', import.meta.url).href)};
const unexpected=async()=>{console.log('MUTATION_CALLED');throw Error()};
try{await runEtsyReleasePhase({packet:${JSON.stringify(f.packet)},packetDigest:${JSON.stringify(f.packetDigest)},phase:${JSON.stringify(phase)},
signal:AbortSignal.timeout(3000),operations:{verify(){},currentMain:unexpected,history:unexpected,predecessor:unexpected,create:unexpected,candidate:unexpected,migrate:unexpected,promote:unexpected,alias:unexpected}});process.exitCode=2}catch{process.exitCode=1}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], { env: {}, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /MUTATION_CALLED| at /);
  });
});
test('Etsy setup provider checks exact pending503 reason config archive and alias rather than accepting arbitrary unready', async t => {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'esty-setup-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packet = etsyPacket(root);
  packet.revision = artifact.manifest.source.revision; packet.tree = artifact.manifest.source.tree;
  packet.sourceDigest = artifact.manifest.source.digest; packet.artifactDigest = artifact.digest;
  const archivePath = join(root, 'project.tgz');
  execFileSync('/usr/bin/tar', ['--format=ustar', '-czf', archivePath, '-C', artifact.root, '.vercel/output'],
    { env: { PATH: '/usr/bin:/bin', COPYFILE_DISABLE: '1' }, timeout: 10000 });
  const archive = fs.readFileSync(archivePath), uid = createHash('sha1').update(archive).digest('hex');
  const envs = packet.runtimeKeys.map(key => ({ id: `env_${key}`, key, type: 'sensitive', target: ['production'] }));
  packet.metadataDigest = currentAppMetadata({ envs }, Object.fromEntries(packet.runtimeKeys.map(key => [key, '']))).metadataDigest;
  const packetDigest = sha256(canonical(packet));
  let fault = '', sqlDone = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers);
    if (url.origin === 'https://api.github.com') return Response.json({ sha: packet.predecessor.revision, commit: { tree: { sha: packet.predecessor.tree } } });
    if (url.origin === 'https://api.vercel.com') {
      if (url.pathname.endsWith('/domains/api.lovora.us')) return Response.json(domain);
      if (url.pathname === '/v4/aliases/api.lovora.us') return Response.json({ ...alias, deploymentId: fault === 'alias' ? 'dpl_other' : 'dpl_old', deployment: { id: fault === 'alias' ? 'dpl_other' : 'dpl_old' } });
      if (url.pathname === `/v9/projects/${artifactTarget.project}`) return Response.json({ ...project, link: { ...project.link, org: 'khuonghuyhieu', repo: 'esty-admin' } });
      if (url.pathname.includes('/env')) return Response.json({ envs: fault === 'metadata' ? envs.slice(1) : envs });
      if (url.pathname === '/v13/deployments/dpl_old') return Response.json({ ...deployment, id: 'dpl_old', regions: ['icn1'],
        meta: { sourceCommit: packet.predecessor.revision, artifactSha256: packet.predecessor.artifactDigest, sourceDigest: packet.predecessor.sourceDigest } });
      if (url.pathname === '/v13/deployments/dpl_new') return Response.json({ ...deployment, id: 'dpl_new', regions: ['icn1'], url: 'synthetic.vercel.app',
        meta: { sourceCommit: packet.revision, artifactSha256: packet.artifactDigest, sourceDigest: packet.sourceDigest,
          etsySetupRun: packet.runId, etsySetupPacket: packetDigest, etsyRuntimeDigest: packet.runtimeDigest } });
      if (url.pathname === '/v6/deployments/dpl_new/files') return Response.json([
        { name: 'src', type: 'directory', mode: 0o40555, children: [{ name: 'project.tgz', type: 'file', uid }] },
        { name: 'out', type: 'directory', mode: 0o40555, children: [{ name: 'index', type: 'lambda', mode: 0o140666 }] },
      ]);
      if (url.pathname.startsWith('/v8/')) return Response.json({ data: (fault === 'archive' ? Buffer.from('changed') : archive).toString('base64') });
      throw new Error('Unapproved synthetic provider route');
    }
    assert.ok(['https://synthetic.vercel.app', 'https://api.lovora.us'].includes(url.origin));
    const old = url.origin === 'https://api.lovora.us', digest = old ? packet.predecessor.configDigest : packet.runtimeDigest;
    if (init?.method === 'OPTIONS') return headers.get('origin') === packet.browserOrigin
      ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': packet.browserOrigin } }) : new Response(null, { status: 401 });
    if (headers.get('authorization') !== `Bearer ${'c'.repeat(64)}`) return Response.json({ status: 'unauthorized' }, { status: 401 });
    if (url.pathname === '/__release_unknown_route') return new Response(null, { status: 404 });
    const responseHeaders = { 'x-activation-config-digest': fault === 'config' ? '0'.repeat(64) : digest };
    if (url.pathname === '/health/live') return Response.json({ status: 'ok' }, { headers: responseHeaders });
    const pending = old ? sqlDone : !sqlDone;
    return pending && fault !== 'unexpected-ready'
      ? Response.json({ status: 'degraded', reason: fault === 'reason' ? 'database_timeout' : 'migrations_pending' }, { status: 503, headers: responseHeaders })
      : Response.json({ status: 'ready', database: 'up', migrations: 'current' }, { headers: responseHeaders });
  };
  const operations = etsyProviderOperations(packet, packetDigest, artifact,
    { token: 'synthetic-provider-token', bearer: 'c'.repeat(64), predecessorBearer: 'c'.repeat(64), bypass: 'synthetic-bypass-key' }, signal(), transport);
  await operations.predecessor(false); await operations.candidate('dpl_new', true, false);
  for (fault of ['unexpected-ready', 'reason', 'config', 'archive']) await assert.rejects(operations.candidate('dpl_new', true, false), Error, fault);
  for (fault of ['alias', 'metadata']) await assert.rejects(operations.predecessor(false), Error, fault);
  fault = ''; sqlDone = true;
  await operations.predecessor(true); await operations.candidate('dpl_new', false, false);
});

test('Etsy setup release fsync failures retain a terminal lock even when receipt bytes exist', async t => {
  for (const boundary of ['intent', 'ack', 'receipt']) await t.test(boundary, async t => {
    const f = etsyReleaseFixture(t); await f.run('history');
    let failNextSync = false, failed = false;
    const write = fs.writeFileSync, sync = fs.fsyncSync;
    t.mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
      const data = args[1];
      if (typeof data === 'string' && data.startsWith('{')) {
        const value: unknown = JSON.parse(data);
        if (value && typeof value === 'object' && !failed) {
          failNextSync = boundary === 'ack'
            ? 'deploymentId' in value && !('phase' in value)
            : 'phase' in value && value.phase === 'held-create' && 'previous' in value
              && (boundary === 'receipt' ? 'completed' in value : !('completed' in value));
        }
      }
      return write(...args);
    });
    t.mock.method(fs, 'fsyncSync', (fd: number) => {
      if (failNextSync && !failed) { failed = true; failNextSync = false; throw new Error('synthetic fsync failure'); }
      return sync(fd);
    });
    await assert.rejects(f.run('held-create'));
    assert.equal(failed, true);
    assert.equal(f.calls.filter(call => call === 'CREATE').length, boundary === 'intent' ? 0 : 1);
    await assert.rejects(f.run('pre-sql-check'));
    assert.equal(f.calls.includes('SQL'), false);
    assert.equal(f.calls.some(call => call.startsWith('candidate:')), false);
    assert.ok(fs.existsSync(join(f.root, 'active.lock')));
  });
});
