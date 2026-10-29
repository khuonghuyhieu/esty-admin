import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSourceApproval } from '../scripts/release-core.js';
import { parseDeployConfig, vercelDeployment } from '../scripts/vercel-deploy.js';

const revision = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const deploy = parseDeployConfig({ VERCEL_TOKEN: 'synthetic-provider-token', VERCEL_PROJECT_ID: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls',
  VERCEL_SCOPE: 'khuonghuyhieu0705s-projects', VERCEL_TEAM_ID: 'team_synthetic', REPOSITORY: 'https://github.com/synthetic/repository',
  DEPLOYMENT_TARGET: 'production', PREVIEW_ACCESS_KEY: 'c'.repeat(64), API_ORIGIN: 'https://api.lovora.us', BROWSER_ORIGIN: 'https://app.lovora.us' });
const project = { id: deploy.VERCEL_PROJECT_ID, name: 'esty-admin-api', accountId: deploy.VERCEL_TEAM_ID,
  rootDirectory: 'apps/api', framework: 'nestjs', nodeVersion: '24.x',
  link: { type: 'github', org: 'synthetic', repo: 'repository', repoId: 123, productionBranch: 'main', deployHooks: [] } };
const deployment = { id: 'dpl_synthetic', projectId: deploy.VERCEL_PROJECT_ID, ownerId: deploy.VERCEL_TEAM_ID, target: 'production', readyState: 'READY',
  gitSource: { type: 'github', repoId: '123', ref: 'main', sha: revision } };
const domain = { name: 'api.lovora.us', projectId: deploy.VERCEL_PROJECT_ID, verified: true };
const alias = { alias: 'api.lovora.us', projectId: deploy.VERCEL_PROJECT_ID, deploymentId: deployment.id, deployment: { id: deployment.id } };
function synthetic(options: { project?: unknown; domain?: unknown; deployment?: unknown; alias?: (count: number) => unknown; smoke?: () => Response; postStatus?: number } = {}) {
  let bindings = 0, requests = 0;
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
      if (url.pathname === '/v13/deployments' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        assert.deepEqual(body.gitSource, { type: 'github', repoId: '123', ref: 'main', sha: revision });
        assert.equal(body.project, deploy.VERCEL_PROJECT_ID); assert.equal(body.target, 'production');
        return Response.json({ id: deployment.id, meta: { githubCommitSha: revision } }, { status: options.postStatus ?? 200 });
      }
      if (url.pathname === `/v13/deployments/${deployment.id}`) {
        assert.equal(url.searchParams.get('withGitRepoInfo'), 'true');
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
  return { adapter: vercelDeployment(deploy, transport), bindings: () => bindings, requests: () => requests };
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
    { link: { ...project.link, deployHooks: [{}] } }, { link: { ...project.link, repoId: undefined } }]) {
    const { adapter } = synthetic({ project: { ...project, ...changes } });
    await assert.rejects(adapter.preflight(signal())); await assert.rejects(adapter.trigger(revision, signal()));
  }
  for (const changes of [{ verified: false }, { projectId: 'prj_other' }, { redirect: 'https://other.example' }, { gitBranch: 'other' }]) {
    await assert.rejects(synthetic({ domain: { ...domain, ...changes } }).adapter.preflight(signal()));
  }
});
test('provider source, project, owner and target must be returned rather than echoed metadata', async () => {
  for (const changes of [{ gitSource: undefined, meta: { githubCommitSha: revision } }, { gitSource: { ...deployment.gitSource, sha: 'b'.repeat(40) } },
    { gitSource: { ...deployment.gitSource, repoId: '456' } }, { id: 'dpl_other' }, { projectId: 'prj_other' },
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
    await current.adapter.preflight(signal()); await assert.rejects(current.adapter.smoke(state, signal()));
  }
  const changed = synthetic({ alias: count => count === 1 ? alias : { ...alias, deploymentId: 'dpl_old' } });
  await changed.adapter.preflight(signal()); await assert.rejects(changed.adapter.smoke(state, signal())); assert.equal(changed.bindings(), 2);
  for (const smoke of [() => new Response('<html>Loading</html>'), () => Response.json({ status: 'ready' }), () => new Response(null, { status: 302 })]) {
    const current = synthetic({ smoke }); await current.adapter.preflight(signal()); await assert.rejects(current.adapter.smoke(state, signal()));
  }
});
