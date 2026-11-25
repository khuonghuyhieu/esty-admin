import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { artifactTarget, canonical, removeArtifactTree, sha256 } from '../scripts/artifact.js';
import { readinessContinuationFixture, failedReplacementFixture, routineIngressFixture } from './artifact-fixture.js';
import { admitHeldProduction, readinessClaimStep } from '../scripts/routine-retained.mjs';
import { createProvider, proveHeldEtsyIncident, proveEtsyReplacement, repository } from '../scripts/ci-provider.js';
import { manualGithubIo } from '../scripts/activation-preflight-disposition.mjs';
import { etsyProviderOperations, etsyReadinessReplacement, heldEtsyIncident, heldContinuationPhases,
  runEtsyReleasePhase, validateEtsyContinuationApproval, continuationClaimKey } from '../scripts/etsy-release.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { readEvidence, writeReleaseEvidence } from '../scripts/release-journal.js';
import { ReleaseDiagnostics } from '../scripts/ci-delivery.js';

// Opt-in public evidence, never a history fallback. Every unrecorded route fails.
// The controller, HTTP outcomes, reservation transport and SQL/promotion are synthetic.
export async function readinessSuccessorSmoke(t: TestContext, evidence: string, verifiedRelease: string) {
  const json = (path: string): any => JSON.parse(fs.readFileSync(path, 'utf8'));
  const history = join(evidence, 'successor-history-readback');
  const candidateFiles = join(evidence, 'readiness-verification-be78791-modes022');
  const metadata = new Map<string, any>();
  for (const name of ['verified-route-map.json', 'verified-held-route-map.json']) {
    const map = json(join(history, 'proof-io', name));
    for (const [route, entry] of Object.entries(map.metadataRoutes) as Array<[string, any]>) {
      if (route === '/commits/main') continue;
      assert.equal(entry.projection, null);
      metadata.set(route, json(entry.path));
    }
  }
  for (const name of fs.readdirSync(history)) {
    const match = /^(run|jobs|artifacts|commit|journal|statuses)-([a-f0-9]+)\.json$/.exec(name);
    if (!match) continue;
    const [, kind, id] = match;
    const route = kind === 'run' ? `/actions/runs/${id}` : kind === 'commit' ? `/commits/${id}`
      : kind === 'journal' ? `/deployments/${id}` : kind === 'statuses' ? `/deployments/${id}/statuses?per_page=100`
        : `/actions/runs/${id}/${kind}?${kind === 'jobs' ? 'filter=all&' : ''}per_page=100`;
    metadata.set(route, json(join(history, name)));
  }
  for (const name of fs.readdirSync(history).filter(name => /^workflow-[a-f0-9]{40}\.yml$/.test(name))) {
    const bytes = fs.readFileSync(join(history, name)), revision = name.slice(9, -4);
    metadata.set(`/contents/.github/workflows/be-delivery.yml?ref=${revision}`,
      { type: 'file', path: '.github/workflows/be-delivery.yml', encoding: 'base64', content: bytes.toString('base64'), size: bytes.length });
  }
  const f = readinessContinuationFixture(), failed = failedReplacementFixture();
  t.mock.method(Date, 'now', () => f.now);
  const base = await routineIngressFixture(f.packet.runtimeDigest, true); t.after(base.dispose);
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'esty-readiness-successor-'));
  t.after(() => removeArtifactTree(root));
  const source = fs.readFileSync(new URL('../../../../.github/workflows/be-delivery.yml', import.meta.url));
  Object.assign(f.approval.operator, { artifactDigest: base.artifact.digest, sourceDigest: base.approval.sourceDigest,
    archiveDigest: base.approval.archiveDigest, operatorDigest: base.approval.operatorDigest, workflowDigest: sha256(source) });
  const digest = sha256(canonical(f.approval));
  const request = { ...f.request, artifactDigest: base.artifact.digest, sourceDigest: base.approval.sourceDigest,
    archiveDigest: base.approval.archiveDigest, operatorDigest: base.approval.operatorDigest,
    migration: { ...f.request.migration!, packetDigest: digest,
      recoveryApproval: sha256(canonical({ packet: digest, recovery: f.packet.grants.recovery })),
      maintenanceApproval: sha256(canonical({ packet: digest, window: f.approval.window, maintenance: f.packet.grants.maintenance })) } };
  const run = { id: Number(request.controller.run), workflow_id: 404086547, run_attempt: 1, head_sha: request.controller.revision,
    head_branch: 'main', path: '.github/workflows/be-delivery.yml', event: 'workflow_dispatch', status: 'in_progress', conclusion: null,
    repository: { id: 1430691691, full_name: repository }, head_repository: { id: 1430691691, full_name: repository } };
  const env = { GITHUB_JOB: 'production', GITHUB_RUN_ID: request.controller.run, GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: run.head_sha,
    GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/be-delivery.yml@refs/heads/main`, RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_NAME: 'synthetic-successor-runner', BE_HELD_INCIDENT: '45578212592' };
  metadata.set(`/actions/runs/${run.id}`, run);
  metadata.set('/commits/main', { sha: run.head_sha, commit: { tree: { sha: request.controller.tree } } });
  metadata.set(`/actions/runs/${run.id}/jobs?filter=all&per_page=100`, { total_count: 1, jobs: [{ id: 456, run_id: run.id,
    run_attempt: 1, head_sha: run.head_sha, name: 'BE production delivery', status: 'in_progress', conclusion: null,
    runner_id: 789, runner_name: env.RUNNER_NAME, steps: [{ name: readinessClaimStep, status: 'in_progress', conclusion: null }] }] });
  metadata.set(`/contents/.github/workflows/be-delivery.yml?ref=${run.head_sha}`,
    { type: 'file', path: '.github/workflows/be-delivery.yml', encoding: 'base64', content: source.toString('base64'), size: source.length });
  const dispatches = json(join(history, 'dispatch-list.json'));
  assert.equal(dispatches.total_count, dispatches.workflow_runs.length);
  assert.equal(dispatches.workflow_runs.some((entry: any) => entry.id === run.id), false);
  metadata.set('/actions/workflows/404086547/runs?event=workflow_dispatch&branch=main&per_page=100&page=1',
    { ...dispatches, total_count: dispatches.total_count + 1, workflow_runs: [run, ...dispatches.workflow_runs] });
  metadata.set(`/actions/runs/${failed.run.id}`, failed.run);
  metadata.set(`/actions/runs/${failed.run.id}/jobs?filter=all&per_page=100`, failed.jobs);
  metadata.set('/actions/runs/45578212592', f.readinessSnapshots.run);
  metadata.set('/actions/runs/45578212592/jobs?filter=all&per_page=100', f.readinessSnapshots.jobs);
  const archives = new Map<number, Buffer>();
  for (const [id, entry] of Object.entries(json(join(evidence, 'evidence-map.json')).artifacts) as Array<[string, any]>) {
    const bytes = fs.readFileSync(entry.path); assert.equal(sha256(bytes), entry.sha256); archives.set(Number(id), bytes);
  }
  const release = json(verifiedRelease), newZip = fs.readFileSync(release.archivePath);
  assert.equal(sha256(newZip), etsyReadinessReplacement.zipDigest);
  archives.set(etsyReadinessReplacement.artifactId, newZip);
  archives.set(15005622501, f.readinessZip); archives.set(15000196718, failed.zip);
  const retainedRelease = json(join(history, 'retained-release.json'));
  const retainedAsset = retainedRelease.assets.find((entry: any) => entry.name === 'be-tested-42404748672-1.zip');
  assert.ok(retainedAsset);
  const originalRows = json(join(history, 'journal-page-1.json')), originalDigest = sha256(canonical(originalRows));
  let rows = structuredClone(originalRows), alias = f.packet.predecessor.id, fault = '', migrations = 3;
  const statuses = new Map<number, any[]>();
  const count = { metadata: 0, downloads: 0, posts: 0, sql: 0, promotions: 0, create: 0, external: 0 };
  t.mock.method(globalThis, 'fetch', async () => { count.external++; throw new Error('Live transport is forbidden'); });
  const read = async (path: string) => {
    count.metadata++;
    if (path === '/deployments?task=deploy%3Aesty-be-ci&environment=be-production&per_page=100&page=1') return structuredClone(rows);
    if (/^\/deployments\/\d+\/statuses\?per_page=1$/.test(path)) {
      const id = Number(path.split('/')[2]);
      return structuredClone((statuses.get(id) ?? metadata.get(path.replace('per_page=1', 'per_page=100'))).slice(0, 1));
    }
    const current = /^\/deployments\/(\d+)(\/statuses\?per_page=100)?$/.exec(path);
    if (current && statuses.has(Number(current[1]))) return structuredClone(current[2] ? statuses.get(Number(current[1])) : rows.find((r: any) => r.id === Number(current[1])));
    assert.ok(metadata.has(path), `Missing genuine metadata route: ${path}`);
    const value = structuredClone(metadata.get(path));
    if (fault === 'changed-status' && path === '/deployments/8052686808/statuses?per_page=100') value[0].state = 'success';
    return value;
  };
  const candidate = json(join(candidateFiles, 'candidate.json'));
  const tree = json(join(candidateFiles, 'uploaded-tree.json'));
  const uploaded = fs.readFileSync(join(candidateFiles, 'uploaded-source.tgz'));
  assert.equal(sha256(uploaded), etsyReadinessReplacement.uploadedArchiveDigest);
  const vercel: Record<string, any> = {
    [`/v9/projects/${artifactTarget.project}`]: json(join(history, 'vercel-project.json')),
    [`/v9/projects/${artifactTarget.project}/domains/api.lovora.us`]: json(join(history, 'vercel-domain.json')),
    [`/v10/projects/${artifactTarget.project}/env`]: json(join(history, 'vercel-env-metadata-only.json')),
    [`/v13/deployments/${f.packet.predecessor.id}`]: json(join(history, 'vercel-predecessor.json')),
    [`/v6/deployments/${f.packet.predecessor.id}/files`]: json(join(history, 'vercel-predecessor-tree.json')),
    [`/v13/deployments/${candidate.id}`]: candidate,
    [`/v6/deployments/${candidate.id}/files`]: tree,
  };
  const credentials = { github: 'synthetic-github-token', vercel: 'synthetic-vercel-token', bearer: 'a'.repeat(64), bypass: 'synthetic-bypass-token' };
  const transport: typeof fetch = async (raw, init = {}) => {
    const url = new URL(String(raw)), method = init.method ?? 'GET';
    if (url.hostname === 'api.github.com') {
      assert.ok(url.pathname.startsWith(`/repos/${repository}/`));
      const path = url.pathname.slice(`/repos/${repository}`.length);
      if (method === 'POST') {
        count.posts++;
        const body = JSON.parse(String(init.body));
        if (path === '/deployments') {
          assert.equal(fault, '');
          const record = { ...body, id: 999123, sha: body.ref };
          rows.unshift(record); statuses.set(record.id, []);
          return Response.json(record, { status: 201 });
        }
        const status = /^\/deployments\/(\d+)\/statuses$/.exec(path); assert.ok(status);
        const id = Number(status[1]); assert.equal(id, 999123);
        statuses.get(id)!.unshift({ ...body, id: 900000 + count.posts, created_at: new Date(f.now).toISOString() });
        return Response.json(statuses.get(id)![0], { status: 201 });
      }
      assert.equal(method, 'GET');
      const artifact = /^\/actions\/artifacts\/(\d+)\/zip$/.exec(path);
      if (artifact) return new Response(null, { status: 302, headers: { location: `https://fixture.actions.githubusercontent.com/${artifact[1]}` } });
      if (path === `/releases/assets/${retainedAsset.id}`) {
        count.downloads++; return new Response(new Uint8Array(archives.get(13587251015)!));
      }
      return Response.json(await read(path + url.search));
    }
    if (url.hostname === 'fixture.actions.githubusercontent.com') {
      assert.equal(method, 'GET'); assert.ok(archives.has(Number(url.pathname.slice(1)))); count.downloads++;
      return new Response(new Uint8Array(archives.get(Number(url.pathname.slice(1)))!));
    }
    if (url.hostname === 'api.vercel.com') {
      if (method !== 'GET') count.create++;
      assert.equal(method, 'GET', 'No CREATE or real promotion transport is available');
      if (url.pathname === '/v4/aliases/api.lovora.us') {
        return Response.json({ ...json(join(history, 'vercel-alias.json')), deploymentId: alias, deployment: { id: alias } });
      }
      if (url.pathname.startsWith(`/v8/deployments/${candidate.id}/files/`)) {
        const bytes = Buffer.from(uploaded); if (fault === 'wrong-bytes') bytes[100] = bytes[100]! ^ 1;
        return Response.json({ data: bytes.toString('base64') });
      }
      if (url.pathname.startsWith(`/v8/deployments/${f.packet.predecessor.id}/files/`)) return Response.json(json(join(history, 'vercel-predecessor-archive.json')));
      assert.ok(Object.hasOwn(vercel, url.pathname), `Missing genuine provider route: ${url.pathname}`);
      const value = structuredClone(vercel[url.pathname]);
      if (fault === 'wrong-candidate' && url.pathname === `/v13/deployments/${candidate.id}`) value.id = f.origin.id;
      return Response.json(value);
    }
    if (![candidate.url, 'api.lovora.us'].includes(url.hostname)) { count.external++; assert.fail(`Unrecorded network destination: ${url.hostname}`); }
    const headers = new Headers(init.headers), candidateHttp = url.hostname === candidate.url;
    if (method === 'OPTIONS') {
      const allowed = headers.get('origin') === f.packet.browserOrigin;
      return new Response(null, { status: allowed && !(fault === 'wrong-cors' && candidateHttp) ? 204 : 401,
        headers: allowed ? { 'access-control-allow-origin': f.packet.browserOrigin } : {} });
    }
    if (headers.get('authorization') !== `Bearer ${credentials.bearer}`) return Response.json({ status: 'unauthorized' }, { status: fault === 'wrong-bearer' && candidateHttp ? 200 : 401 });
    if (url.pathname === '/__release_unknown_route') return Response.json({ code: 'not_found' }, { status: 404 });
    const pending = migrations === 3 && candidateHttp || migrations === 4 && !candidateHttp && alias !== candidate.id;
    const digest = fault === 'wrong-config' && candidateHttp ? '0'.repeat(64)
      : candidateHttp || alias === candidate.id ? f.packet.runtimeDigest : f.packet.predecessor.configDigest;
    return Response.json(url.pathname === '/health/live' ? { status: 'ok' } : pending
      ? fault === 'wrong-health' && candidateHttp ? { code: 'dependency_unavailable', requestId: randomUUID() } : { status: 'degraded', reason: 'migrations_pending' }
      : { status: 'ready', database: 'up', migrations: 'current' },
    { status: url.pathname === '/health/ready' && pending ? 503 : 200, headers: { 'x-activation-config-digest': digest } });
  };
  const signal = AbortSignal.timeout(180000), io = manualGithubIo(credentials.github, signal, transport);
  const execution = await admitHeldProduction(request, env, io.read, source, true, io.download);
  let held = await proveHeldEtsyIncident(f.approval, io, join(root, 'original'), signal);
  held = await proveEtsyReplacement(f.approval, held, io, join(root, 'replacement'), signal);
  assert.equal(held.application.digest, etsyReadinessReplacement.artifactDigest);
  const schema = { digest: request.schema.targetDigest, configDigest: request.configDigest, request,
    requestDigest: sha256(canonical(request)), strictPacketDigest: digest, held, heldExecution: execution };
  const provider = () => createProvider(base.artifact, request.controller, schema, credentials, signal, transport);
  for (const problem of ['changed-status', 'wrong-bytes', 'wrong-candidate', 'wrong-config', 'wrong-health', 'wrong-bearer', 'wrong-cors']) {
    await t.test(problem + ' refuses before durable POST', async () => {
      fault = problem;
      await assert.rejects(provider().reserve());
      assert.deepEqual({ posts: count.posts, sql: count.sql, promotions: count.promotions }, { posts: 0, sql: 0, promotions: 0 });
      assert.equal(sha256(canonical(rows)), originalDigest);
    });
  }
  fault = '';
  const p = provider(), journal = await p.reserve(); assert.equal(journal, 999123);
  assert.equal(rows[0].payload.heldContinuation.replacement.id, candidate.id);
  assert.equal(rows[0].payload.heldContinuation.readinessDisposition.journal, 8052686808);
  assert.deepEqual(rows.slice(1), originalRows);
  await p.record(journal, 'in_progress', `strict:reserved:${schema.requestDigest}`);
  await p.confirmRoutineJournal(journal, `strict:reserved:${schema.requestDigest}`);
  const postsBeforeReplay = count.posts; await assert.rejects(provider().reserve()); assert.equal(count.posts, postsBeforeReplay);
  const receipts = join(root, 'receipts'); fs.mkdirSync(receipts, { mode: 0o700 });
  writeReleaseEvidence(join(receipts, 'claim.json'), { version: 1, key: continuationClaimKey(f.approval), journal, execution });
  const claim = readEvidence(join(receipts, 'claim.json'));
  const continuation = { approval: f.approval, origin: held.origin, claimDigest: claim.identity.sha256,
    stoppedReceipt: held.stopped!.receiptZip, readinessReceipt: held.readinessStopped!.receiptZip };
  const remote = etsyProviderOperations(f.packet, heldEtsyIncident.packetDigest, held.application,
    { token: credentials.vercel, bearer: credentials.bearer, predecessorBearer: credentials.bearer,
      bypass: credentials.bypass, github: credentials.github }, signal, transport, undefined, f.approval);
  const diagnostics = new ReleaseDiagnostics(request, receipts, signal); diagnostics.load(); diagnostics.inheritedHeld(candidate.id);
  const operations = { ...remote, verify() { validateEtsyContinuationApproval(f.approval, digest); },
    async history() { return migrationManifest.slice(0, migrations).map(row => row.name); },
    async migrate() {
      count.sql++; const before = migrationManifest.slice(0, migrations).map(row => row.name); migrations = 4;
      return { run_id: randomUUID(), source_revision: f.packet.revision, target: f.packet.target,
        manifest_digest: f.packet.targetDigest, started_at: new Date(f.now).toISOString(), ended_at: new Date(f.now).toISOString(), duration_ms: 0,
        result: 'success' as const, stage: 'verification' as const, failed_version: null, database_outcome: 'committed' as const,
        before, after: migrationManifest.map(row => row.name), attempted: [{ ...migrationManifest[3]!, outcome: 'applied_committed' as const }], reporting: 'written' as const };
    },
    async promote(id: string) { assert.equal(id, candidate.id); count.promotions++; alias = id; return { code: 0, aborted: false, stdout: '' }; },
  };
  assert.equal(Object.hasOwn(operations, 'create'), false);
  for (const phase of heldContinuationPhases) await runEtsyReleasePhase({ packet: f.packet, packetDigest: digest, phase,
    operations, signal, diagnostics, continuation, durability: { directory: receipts,
      async intent(current, intent) {
        const description = `strict:${current}:intent:${sha256(canonical({ requestDigest: schema.requestDigest, intent }))}`;
        await p.record(journal, 'in_progress', description); await p.confirmRoutineJournal(journal, description);
      },
      async acknowledged() { assert.fail('Successor has no CREATE acknowledgement'); },
      async confirmed(current) {
        const receipt = readEvidence(join(receipts, f.approval.runId, `${current}.receipt.json`)).identity.sha256;
        const description = `strict:${current}:receipt:${sha256(canonical({ requestDigest: schema.requestDigest, receipt }))}`;
        await p.record(journal, 'in_progress', description); await p.confirmRoutineJournal(journal, description);
      },
    } });
  diagnostics.verified(); const result = diagnostics.complete()!;
  assert.equal(result.status, 'accepted'); assert.equal(result.proof!.deploymentId, candidate.id);
  assert.equal(result.proof!.artifactDigest, etsyReadinessReplacement.artifactDigest);
  assert.deepEqual({ create: count.create, sql: count.sql, promotions: count.promotions, external: count.external },
    { create: 0, sql: 1, promotions: 1, external: 0 });
  assert.deepEqual(rows.slice(1), originalRows);
  t.diagnostic(JSON.stringify({ ...count, historicalDispatches: dispatches.total_count, journal, candidate: candidate.id,
    applicationRevision: f.packet.revision, finalDomain: alias === candidate.id, mode: 'genuine-evidence-synthetic-transport' }));
}
