import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { assertSourceApproval } from '../scripts/release-core.js';
import { parseDeployConfig, vercelDeployment } from '../scripts/vercel-deploy.js';
import { artifactFixture } from './artifact-fixture.js';
import { artifactTarget } from '../scripts/artifact.js';
import type { VerifiedArtifact } from '../scripts/artifact.js';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
let artifact: VerifiedArtifact;
let dispose: () => Promise<void>;
before(async () => { const fixture = await artifactFixture(); artifact = fixture.artifact; dispose = fixture.dispose; });
after(async () => { await dispose?.(); });
function fileTree(current: VerifiedArtifact, decimalModes = false): any[] {
  const root: any[] = [];
  for (const file of current.manifest.files.filter(file => file.path.startsWith('.vercel/output/'))) {
    const parts = file.path.split('/'); let children = root;
    for (const name of parts.slice(0, -1)) {
      let directory = children.find(entry => entry.name === name);
      if (!directory) { directory = { name, type: 'directory', children: [] }; children.push(directory); }
      children = directory.children;
    }
    const mode = 0o100000 | file.mode;
    children.push({ name: parts.at(-1), type: 'file', mode: decimalModes ? String(mode) : mode, uid: file.sha1 });
  }
  return [
    { name: 'src', type: 'directory', mode: 0o40555, children: root },
    { name: 'out', type: 'directory', mode: 0o40555, children: [{ name: 'index', type: 'lambda', mode: 0o140666 }] },
  ];
}

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
function synthetic(options: { project?: unknown; domain?: unknown; deployment?: unknown; alias?: (count: number) => unknown; smoke?: () => Response; postStatus?: number; files?: unknown; onUpload?: () => Promise<void>; artifact?: VerifiedArtifact } = {}) {
  let bindings = 0, requests = 0;
  const selected = options.artifact ?? artifact;
  let uploads = 0, creates = 0;
  const received = new Map<string, Uint8Array>();
  const transport: typeof fetch = async (input, init) => {
    requests++;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(init?.redirect, 'error');
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
        return Response.json({ id: deployment.id, meta: { githubCommitSha: revision } }, { status: options.postStatus ?? 200 });
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
    await assert.rejects(adapter.preflight(signal())); await assert.rejects(adapter.trigger(revision, signal()));
  }
  for (const changes of [{ verified: false }, { projectId: 'prj_other' }, { redirect: 'https://other.example' }, { gitBranch: 'other' }]) {
    await assert.rejects(synthetic({ domain: { ...domain, ...changes } }).adapter.preflight(signal()));
  }
});
test('provider identity must match the created prebuilt invocation, not source metadata', async () => {
  for (const changes of [{ gitSource: { sha: revision } }, { id: 'dpl_other' }, { projectId: 'prj_other' },
    { ownerId: 'team_other' }, { target: 'preview' }, { readyState: 'UNKNOWN' }]) {
    const { adapter } = synthetic({ deployment: { ...deployment, ...changes } });
    await adapter.preflight(signal()); await assert.rejects(adapter.trigger(revision, signal()));
  }
  for (const postStatus of [202, 302, 500]) {
    const { adapter } = synthetic({ postStatus }); await adapter.preflight(signal()); await assert.rejects(adapter.trigger(revision, signal()));
  }
});
test('normalized pending and terminal provider states are never READY success', async () => {
  for (const [readyState, expected] of [['QUEUED', 'queued'], ['INITIALIZING', 'building'], ['BUILDING', 'building'], ['ERROR', 'failed'], ['BLOCKED', 'failed'], ['CANCELED', 'canceled']] as const) {
    const { adapter } = synthetic({ deployment: { ...deployment, readyState } });
    await adapter.preflight(signal()); const state = await adapter.trigger(revision, signal());
    assert.equal(state.status, expected); await assert.rejects(adapter.smoke(state, signal()));
  }
});
test('same-deployment domain binding and safe HTTP must both hold before and after smoke', async () => {
  const valid = synthetic(); await valid.adapter.preflight(signal());
  const state = await valid.adapter.trigger(revision, signal());
  await valid.adapter.smoke(state, signal()); assert.equal(valid.bindings(), 2);
  for (const changes of [{ deploymentId: 'dpl_old' }, { projectId: 'prj_other' }, { deployment: { id: 'dpl_old' } },
    { deletedAt: 1 }, { redirect: 'https://other.example' }, { microfrontends: {} }]) {
    const current = synthetic({ alias: () => ({ ...alias, ...changes }) });
    await current.adapter.preflight(signal()); const currentState = await current.adapter.trigger(revision, signal());
    await assert.rejects(current.adapter.smoke(currentState, signal()));
  }
  const changed = synthetic({ alias: count => count === 1 ? alias : { ...alias, deploymentId: 'dpl_old' } });
  await changed.adapter.preflight(signal()); const changedState = await changed.adapter.trigger(revision, signal());
  await assert.rejects(changed.adapter.smoke(changedState, signal())); assert.equal(changed.bindings(), 2);
  for (const smoke of [() => new Response('<html>Loading</html>'), () => Response.json({ status: 'ready' }), () => new Response(null, { status: 302 })]) {
    const current = synthetic({ smoke }); await current.adapter.preflight(signal()); const currentState = await current.adapter.trigger(revision, signal());
    await assert.rejects(current.adapter.smoke(currentState, signal()));
  }
});
test('missing or altered provider file attestation cannot become ready', async () => {
  for (const files of [[], [{ name: '.vercel', type: 'directory', children: [] }], [{ name: '../secret', type: 'file' }]]) {
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal()));
  }
});
test('canonical decimal provider modes attest the complete approved artifact', async () => {
  const current = synthetic({ files: fileTree(artifact, true) });
  await current.adapter.preflight(signal());
  const state = await current.adapter.trigger(revision, signal());
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
    await assert.rejects(current.adapter.trigger(revision, signal()));
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
    await assert.rejects(current.adapter.trigger(revision, signal()));
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
    await assert.rejects(current.adapter.trigger(revision, signal()));
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
    await assert.rejects(current.adapter.trigger(revision, controller.signal));
    assert.equal(current.creates(), 0);
    if (mode === 'cancel') assert.equal(current.uploads(), 1);
  });
});
