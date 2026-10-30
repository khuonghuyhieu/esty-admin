import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import type { TestContext } from 'node:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { assertSourceApproval } from '../scripts/release-core.js';
import { parseDeployConfig, vercelDeployment } from '../scripts/vercel-deploy.js';
import { artifactFixture, fileTree } from './artifact-fixture.js';
import { artifactTarget } from '../scripts/artifact.js';
import type { VerifiedArtifact } from '../scripts/artifact.js';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReleaseJournal, describeRetainedRun, readReleaseJournal, writeReleaseEvidence } from '../scripts/release-journal.js';
import type { ReleaseBinding, SupersessionApproval } from '../scripts/release-journal.js';
import { bounded } from '../scripts/bounded.js';
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
