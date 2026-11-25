import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { artifactTarget, assembleArtifact, builderConfig, canonical, finalRoutes, inventory, readArtifactFile, sha256, sourceFiles, toolPins, removeArtifactTree } from '../scripts/artifact.js';
import type { FileRecord, SourceIdentity, ToolEvidence, VerifiedArtifact } from '../scripts/artifact.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { readFile } from 'node:fs/promises';
import { crc32, gzipSync, gunzipSync } from 'node:zlib';
import { routineContext, selectRoutine } from '../scripts/routine-retained.mjs';
import { activationRuntimeKeys, runtimeConfigDigest } from '../src/config/activation-config.js';
import { manifestDigest } from '../scripts/migrations.js';
import { heldEtsyIncident, verifyHeldEtsyReceipts, stoppedEtsyContinuation, etsyReplacement, continuationApplication } from '../scripts/etsy-release.js';
import type { EtsyReleasePacket, EtsyContinuationApproval } from '../scripts/etsy-release.js';
import type { ReleaseRequest } from '../scripts/ci-delivery.js';
import { historicalHandoffDigest } from '../scripts/historical-release.js';
import { historicalReleaseEvidence } from '../scripts/historical-release-evidence.js';
import { heldAppPolicy, heldD2 } from '../scripts/activation-held-contract.mjs';
import { retainedActivation } from '../scripts/activation-retained.mjs';
export function tar(entries: Array<{ path: string; content: Buffer; mode: number; type?: string }>): Buffer {
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

export const routineRuntime = Object.freeze({ ...Object.fromEntries(activationRuntimeKeys.map(key => [key, `synthetic-${key}`])),
  PREVIEW_ACCESS_KEY: 'c'.repeat(64), ETSY_ENABLED: 'false', APP_ACTIVATION_CONFIG_DIGEST: 'f'.repeat(64) });

export function routineProviderFixture(artifact: VerifiedArtifact, fault = '', afterCreate?: () => Promise<void>,
  strict?: { packet: EtsyReleasePacket; http?: (url: string, init: RequestInit, predecessor: boolean) => Promise<Response> }) {
  const run = { revision: artifact.manifest.source.revision, tree: artifact.manifest.source.tree, run: '123' };
  const configDigest = runtimeConfigDigest(routineRuntime), schema = {
    digest: artifact.manifest.migrationDigest, configDigest, requestDigest: sha256('independently-approved-synthetic-request') };
  const credentials = { github: 'synthetic-github-token', vercel: 'synthetic-vercel-token', bearer: 'c'.repeat(64), bypass: 'synthetic-platform-bypass' };
  const archive = tar(artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/'))
    .map(file => ({ path: file.path, mode: file.mode, content: readArtifactFile(artifact.root, file.path, file) })));
  const uid = createHash('sha1').update(archive).digest('hex'), events: string[] = [], receipts: Record<string, unknown>[] = [];
  let alias = strict?.packet.predecessor.id ?? 'dpl_previous', creates = 0, promotions = 0, mainReads = 0, reserved = false, sqlDone = false;
  let reservation: { payload: Record<string, unknown> } | undefined;
  const statuses: Array<{ id: number; state: string; description: string }> = [];
  const transport: typeof fetch = async (raw, init) => {
    const url = new URL(String(raw)), path = url.pathname, headers = new Headers(init?.headers), method = init?.method ?? 'GET';
    if (url.hostname === 'api.github.com') {
      if (strict && path.endsWith(`/commits/${strict.packet.predecessor.revision}`) && method === 'GET') {
        return Response.json({ sha: strict.packet.predecessor.revision, commit: { tree: { sha: strict.packet.predecessor.tree } } });
      }
      if (headers.get('authorization') !== `Bearer ${credentials.github}`) throw new Error('Synthetic GitHub authentication missing.');
      if (path.endsWith('/commits/main')) { events.push('main'); mainReads++; return Response.json({
        sha: fault === 'main-drift' && mainReads >= 3 ? 'f'.repeat(40) : run.revision, commit: { tree: { sha: run.tree } } }); }
      if (path.endsWith('/deployments') && method === 'GET') return Response.json(reserved
        ? [{ id: 44, task: 'deploy:esty-be-ci', environment: 'be-production', payload: reservation?.payload }] : []);
      if (path.endsWith('/deployments') && method === 'POST') {
        events.push('reserve'); reserved = true; reservation = JSON.parse(String(init?.body));
        return Response.json({ id: 44, sha: run.revision, task: 'deploy:esty-be-ci', environment: 'be-production' }, { status: 201 });
      }
      if (path.endsWith('/deployments/44') && method === 'GET') {
        return Response.json({ id: 44, sha: run.revision, task: 'deploy:esty-be-ci', environment: 'be-production', payload: reservation?.payload });
      }
      if (path.endsWith('/deployments/44/statuses') && method === 'POST') {
        const body = JSON.parse(String(init?.body)); events.push(`${body.state}:${body.description}`);
        const status = { id: 45 + statuses.length, state: String(body.state), description: String(body.description) };
        statuses.unshift(status);
        const fail = (fault === 'remote-intent' && status.description.includes('held-create:intent:'))
          || (fault === 'remote-create-ack' && status.description.startsWith('ack:'))
          || (fault === 'remote-sql-intent' && status.description.includes('sql-apply:intent:'))
          || (fault === 'remote-sql-receipt' && status.description.includes('sql-apply:receipt:'))
          || (fault === 'remote-promote-ack' && status.description.includes('promote-only:receipt:'))
          || (fault === 'remote-final-ack' && status.description.includes('final-domain-ack:receipt:'));
        if (fail) throw new Error('Synthetic lost remote acknowledgement.');
        return Response.json(status, { status: 201 });
      }
      if (path.endsWith('/deployments/44/statuses') && method === 'GET') {
        return Response.json(url.searchParams.get('per_page') === '100' ? statuses : statuses.slice(0, 1));
      }
    } else if (url.hostname === 'api.vercel.com') {
      if (headers.get('authorization') !== `Bearer ${credentials.vercel}` || method !== 'GET') throw new Error('Synthetic provider authority differs.');
      if (path === `/v9/projects/${artifactTarget.project}`) return Response.json({ id: artifactTarget.project, name: 'esty-admin-api',
        accountId: artifactTarget.owner, rootDirectory: 'apps/api', framework: 'nestjs', nodeVersion: '24.x',
        buildCommand: null, installCommand: null, outputDirectory: null,
        link: { type: 'github', org: 'khuonghuyhieu', repo: 'esty-admin', productionBranch: 'main', repoId: 42, deployHooks: [] } });
      if (path.includes('/domains/')) return Response.json({ name: 'api.lovora.us', projectId: artifactTarget.project, verified: true });
      if (path.includes('/aliases/')) return Response.json({ alias: 'api.lovora.us', projectId: artifactTarget.project,
        deploymentId: fault === 'alias-drift' && creates ? 'dpl_other' : alias });
      if (strict && path.includes('/env')) return Response.json({ envs: strict.packet.runtimeKeys.map(key =>
        ({ id: `env_${key}`, key, type: 'sensitive', target: ['production'] })) });
      if (strict && path === `/v13/deployments/${strict.packet.predecessor.id}`) return Response.json({
        id: strict.packet.predecessor.id, projectId: artifactTarget.project, ownerId: artifactTarget.owner,
        target: 'production', readyState: 'READY', regions: ['icn1'],
        meta: { sourceCommit: strict.packet.predecessor.revision, artifactSha256: strict.packet.predecessor.artifactDigest,
          sourceDigest: strict.packet.predecessor.sourceDigest } });
      if (path === '/v13/deployments/dpl_candidate') {
        events.push('inspect'); return Response.json({ id: 'dpl_candidate', projectId: artifactTarget.project, ownerId: artifactTarget.owner,
          target: 'production', readyState: 'READY', regions: ['icn1'], url: 'synthetic.vercel.app',
          meta: { sourceCommit: run.revision, artifactSha256: artifact.digest, sourceDigest: artifact.manifest.source.digest,
            activationConfigDigest: configDigest, ...(strict ? { etsySetupRun: strict.packet.runId,
              etsySetupPacket: sha256(canonical(strict.packet)), etsyRuntimeDigest: strict.packet.runtimeDigest } : {}) } });
      }
      if (path === '/v6/deployments/dpl_candidate/files') {
        events.push('attest'); return Response.json([
          { name: 'src', type: 'directory', mode: 0o40555, children: [{ name: 'project.tgz', type: 'file', uid }] },
          { name: 'out', type: 'directory', mode: 0o40555, children: [{ name: 'index', type: 'lambda', mode: 0o140666 }] } ]);
      }
      if (path === `/v8/deployments/dpl_candidate/files/${uid}`) return Response.json({
        data: fault === 'archive-drift' ? Buffer.from('changed').toString('base64') : archive.toString('base64') });
    } else if (['synthetic.vercel.app', 'api.lovora.us'].includes(url.hostname)) {
      const phase = url.hostname === 'synthetic.vercel.app' ? 'candidate'
        : strict && alias === strict.packet.predecessor.id ? 'predecessor' : 'final';
      events.push(`${phase}:${method}:${path}`);
      if (headers.has('x-vercel-protection-bypass') !== (phase === 'candidate')) throw new Error('Synthetic bypass isolation differs.');
      const predecessor = phase === 'predecessor';
      if (strict?.http) return strict.http(url.href, init ?? {}, predecessor);
      if (method === 'OPTIONS') return headers.get('origin') === 'https://app.lovora.us'
        ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://app.lovora.us' } })
        : Response.json({ status: 'unauthorized' }, { status: 401 });
      if (headers.get('authorization') !== `Bearer ${credentials.bearer}`) return Response.json({ status: 'unauthorized' }, {
        status: 401, headers: fault === 'denial-leak' ? { 'x-activation-config-digest': configDigest } : {} });
      if (path === '/__release_unknown_route') return new Response(null, { status: 404 });
      const actual = fault === `${phase}-etsy-drift` ? runtimeConfigDigest({ ...routineRuntime, ETSY_CLIENT_ID: 'changed-client' })
        : fault === `${phase}-wrong` ? '0'.repeat(64) : strict ? predecessor ? strict.packet.predecessor.configDigest : strict.packet.runtimeDigest : configDigest;
      const attestation = fault === `${phase}-missing` ? {} : { 'x-activation-config-digest': actual };
      if (path === '/health/live') return Response.json({ status: 'ok' }, { headers: attestation });
      if (strict && path === '/health/ready' && (predecessor ? sqlDone : !sqlDone) && fault !== 'unexpected-ready') {
        return Response.json({ status: 'degraded', reason: fault === 'unexpected-503' ? 'database_timeout' : 'migrations_pending' },
          { status: 503, headers: attestation });
      }
      if (path === '/health/ready') return fault === 'pending-history'
        ? Response.json({ status: 'not_ready', database: 'up', migrations: 'pending' }, { status: 503, headers: attestation })
        : Response.json({ status: 'ready', database: 'up', migrations: 'current' }, { headers: attestation });
    }
    throw new Error('Unexpected synthetic request; no network fallback.');
  };
  const cli = {
    async create() {
      creates++; events.push('create'); await afterCreate?.();
      return { code: fault === 'create-unknown' || fault === 'create-known-nonzero' ? 1 : 0,
        stdout: fault === 'create-unknown' ? 'synthetic-secret-canary' : JSON.stringify({ deployment: { id: 'dpl_candidate' } }), aborted: false };
    },
    async promote(id: string) {
      if (id !== 'dpl_candidate') throw new Error('Synthetic promotion identity differs.');
      promotions++; events.push('promote'); alias = id;
      return { code: fault === 'promote-unknown' ? 1 : 0, stdout: 'synthetic-secret-canary', aborted: false };
    },
  };
  return { run, schema, credentials, transport, cli, events, receipts, statuses,
    setFault(value: string) { fault = value; }, committed() { sqlDone = true; },
    receipt(event: Record<string, unknown>) { receipts.push(structuredClone(event)); events.push(`receipt:${event.phase}`); },
    counts: () => ({ creates, promotions }), reservation: () => reservation };
}

export function routineMetadataFixture(approvalDigest = 'd'.repeat(64), schemaDigest = 'e'.repeat(64), configDigest = 'c'.repeat(64)) {
  const now = Date.now(), revision = 'a'.repeat(40), tree = 'b'.repeat(40), repository = 'khuonghuyhieu/esty-admin';
  const env: NodeJS.ProcessEnv = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/be-delivery.yml@refs/heads/main`,
    GITHUB_SHA: revision, GITHUB_RUN_ID: '123', BE_DELIVERY_ENABLED: 'true', BE_DELIVERY_ENVIRONMENT: 'be-production',
    BE_DELIVERY_MODE: 'current-schema-only', BE_RELEASE_CONTROLLER_SHA: revision, BE_RELEASE_APPROVAL_SHA256: approvalDigest,
    BE_DELIVERY_SCHEMA_SHA256: schemaDigest, BE_DELIVERY_CONFIG_SHA256: configDigest, BE_RELEASE_TARGET: 'supabase:abcdefghijklmnopqrst' };
  const event = { inputs: { mode: 'current-schema-only', release_run_id: '122', release_artifact_id: '456' } };
  const run = { run_attempt: 1, head_sha: revision, head_branch: 'main', path: '.github/workflows/be-delivery.yml',
    repository: { id: 42, full_name: repository }, head_repository: { id: 42, full_name: repository } };
  const records: Record<string, any> = {
    '/commits/main': { sha: revision, commit: { tree: { sha: tree } } },
    '/actions/runs/123': { ...run, id: 123, event: 'workflow_dispatch', status: 'in_progress', conclusion: null },
    '/actions/runs/122': { ...run, id: 122, event: 'push', status: 'completed', conclusion: 'success' },
    '/actions/runs/122/jobs?filter=all&per_page=100': { total_count: 1, jobs: [{ id: 789, run_id: 122, run_attempt: 1, head_sha: revision,
      name: 'BE required checks', status: 'completed', conclusion: 'success',
      started_at: new Date(now - 60000).toISOString(), completed_at: new Date(now - 10000).toISOString() }] },
    '/actions/artifacts/456': { id: 456, name: 'be-tested-122-1', expired: false, digest: `sha256:${'f'.repeat(64)}`, size_in_bytes: 1000,
      created_at: new Date(now - 30000).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
      workflow_run: { id: 122, head_sha: revision, head_branch: 'main', repository_id: 42, head_repository_id: 42 } },
  };
  let reads = 0;
  const read = async (path: string) => { reads++; assertFixturePath(path, records); return structuredClone(records[path]); };
  return { env, event, records, read, reads: () => reads, now, context: routineContext(env, event) };
}
function assertFixturePath(path: string, records: Record<string, unknown>): void {
  if (!Object.hasOwn(records, path)) throw new Error('Unexpected synthetic GitHub request; no network fallback.');
}

export async function routineIngressFixture(configDigest = 'c'.repeat(64), strict = false) {
  const sourceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const migration = await readFile(new URL('../../migrations/1792972800000-foundation.mjs', import.meta.url), 'utf8');
  const base = await artifactFixture('release', migration), bundle = join(base.root, 'bundle'), transfer = join(base.root, 'transfer');
  await mkdir(bundle); await mkdir(transfer, { mode: 0o700 });
  const build = structuredClone(base.artifact.manifest.build);
  if (strict) {
    for (const entry of migrationManifest) await cp(new URL(`../../migrations/${entry.name}.mjs`, import.meta.url),
      join(base.operator, `apps/api/migrations/${entry.name}.mjs`));
    await cp(new URL('../scripts/etsy-release.js', import.meta.url), join(base.operator, 'apps/api/build/scripts/etsy-release.js'));
    const cliRoot = join(base.root, 'tools/vercel');
    await mkdir(join(cliRoot, 'dist'), { recursive: true });
    await writeFile(join(cliRoot, 'package.json'), '{"version":"65.4.0"}');
    await writeFile(join(cliRoot, 'dist/vc.js'), 'throw new Error("Synthetic CLI transport must be injected");\n');
    build.tools.find(tool => tool.name === 'vercel')!.filesDigest = sha256(canonical(inventory(cliRoot).files));
  }
  const files = sourceFiles(sourceRoot);
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(bundle, 'artifact'),
    config: base.config, source: { ...base.artifact.manifest.source, repository: 'https://github.com/khuonghuyhieu/esty-admin',
      files, digest: sha256(canonical(files)) }, migrations: strict ? [...migrationManifest] : base.artifact.manifest.migrations, build });
  await cp(join(artifact.root, 'operator'), join(bundle, 'runner'), { recursive: true });
  const runner = inventory(join(bundle, 'runner'));
  await writeFile(join(bundle, 'receipt.json'), JSON.stringify({ version: 1, revision: artifact.manifest.source.revision,
    tree: artifact.manifest.source.tree, artifact: artifact.digest, source: artifact.manifest.source.digest,
    nativeHttpDatabase: 'passed', functional: 'passed', mode: 'release', node: '24.22.1', runner }), { mode: 0o600 });
  const archivePath = join(transfer, 'be-release.tar.gz');
  execFileSync('/usr/bin/tar', ['--format=pax', '--no-xattrs', '-czf', archivePath, '-C', bundle, 'artifact', 'runner', 'receipt.json'],
    { env: { PATH: '/usr/bin:/bin', COPYFILE_DISABLE: '1' } });
  const archive = await readFile(archivePath);
  const approval = { version: 1, mode: 'release', producer: { revision: artifact.manifest.source.revision, tree: artifact.manifest.source.tree, run: '122' },
    artifactDigest: artifact.digest, sourceDigest: artifact.manifest.source.digest, archiveDigest: sha256(archive),
    operatorDigest: sha256(canonical(runner)), schemaDigest: artifact.manifest.migrationDigest };
  const bytes = canonical(approval) + '\n';
  const metadata = routineMetadataFixture(sha256(bytes), artifact.manifest.migrationDigest, configDigest);
  const selection = await selectRoutine(metadata.context, metadata.read, metadata.now), selectionBytes = canonical(selection) + '\n';
  await writeFile(join(transfer, 'be-release-approval.json'), bytes, { mode: 0o600 });
  await writeFile(join(transfer, 'selection.json'), selectionBytes, { mode: 0o600 });
  const eventPath = join(base.root, 'event.json');
  await writeFile(eventPath, JSON.stringify(metadata.event), { mode: 0o600 });
  Object.assign(metadata.env, { GITHUB_EVENT_PATH: eventPath, BE_RELEASE_SELECTION_SHA256: sha256(selectionBytes) });
  return { ...metadata, artifact, sourceRoot, bundle, transfer, selection, approval, archive, root: base.root, dispose: base.dispose };
}

export async function strictReleaseFixture(configDigest = runtimeConfigDigest(routineRuntime), migrationInputDigest = '1'.repeat(64),
  target = 'supabase:abcdefghijklmnopqrst', predecessorDigest = runtimeConfigDigest({ ...routineRuntime, ETSY_CLIENT_ID: 'previous-client' })) {
  const { approvedRoutineRequest } = await import('../scripts/ci-delivery.js');
  const { currentAppMetadata } = await import('../scripts/activation-configuration.js');
  const { etsyReleasePhases } = await import('../scripts/etsy-release.js');
  const f = await routineIngressFixture(configDigest, true);
  const runtimeKeys = [...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].sort();
  const envs = runtimeKeys.map(key => ({ id: `env_${key}`, key, type: 'sensitive', target: ['production'] }));
  const packet: EtsyReleasePacket = { version: 1, runId: randomUUID(), ledgerRoot: join(f.root, 'unused-owner-home-ledger'),
    revision: f.artifact.manifest.source.revision, tree: f.artifact.manifest.source.tree, sourceDigest: f.artifact.manifest.source.digest,
    artifactDigest: f.artifact.digest, runtimeDigest: configDigest, configBundleDigest: 'f'.repeat(64), migrationInputDigest,
    previousDigest: manifestDigest(migrationManifest.slice(0, 3)), targetDigest: manifestDigest(migrationManifest), target,
    driverDigest: f.artifact.manifest.files.find(file => file.path === 'operator/apps/api/build/scripts/etsy-release.js')!.sha256,
    nodeDigest: f.artifact.manifest.build.nodeSha256, cliDigest: sha256(await readFile(join(f.root, 'tools/vercel/dist/vc.js'))),
    cliOwnFilesDigest: f.artifact.manifest.build.tools.find(tool => tool.name === 'vercel')!.filesDigest,
    browserOrigin: 'https://app.lovora.us', runtimeKeys,
    metadataDigest: currentAppMetadata({ envs }, Object.fromEntries(runtimeKeys.map(key => [key, '']))).metadataDigest,
    predecessor: { id: 'dpl_previous', revision: '7'.repeat(40), tree: '8'.repeat(40), sourceDigest: '9'.repeat(64),
      artifactDigest: 'a'.repeat(64), configDigest: predecessorDigest },
    window: { start: Date.now() - 1000, end: Date.now() + 600000 },
    grants: { exclusiveOwnerLease: 'synthetic-routine-strict', automatedDelivery: 'disabled',
      maintenance: 'approved-readiness-interruption', recovery: 'approved-roll-forward-only', phases: [...etsyReleasePhases] } };
  const packetDigest = sha256(canonical(packet));
  Object.assign(f.env, { BE_DELIVERY_MODE: 'etsy-strict-cutover', BE_RELEASE_TARGET: target,
    BE_MIGRATION_PACKET_JSON: JSON.stringify(packet), BE_MIGRATION_PACKET_SHA256: packetDigest });
  f.event.inputs.mode = 'etsy-strict-cutover';
  const context = routineContext(f.env, f.event), selection = await selectRoutine(context, f.read), bytes = canonical(selection) + '\n';
  const request = await approvedRoutineRequest(f.artifact, selection, f.approval, context, packet);
  await writeFile(join(f.transfer, 'selection.json'), bytes, { mode: 0o600 });
  await writeFile(f.env.GITHUB_EVENT_PATH!, JSON.stringify(f.event), { mode: 0o600 });
  f.env.BE_RELEASE_SELECTION_SHA256 = sha256(bytes);
  const requestBytes = canonical(request) + '\n';
  await writeFile(join(f.transfer, 'request.json'), requestBytes, { mode: 0o600 });
  f.env.BE_RELEASE_REQUEST_SHA256 = sha256(requestBytes);
  return { ...f, context, selection, packet, packetDigest, request, cli: join(f.root, 'tools/vercel/dist/vc.js') };
}

// Synthetic packaging inputs: these prove rejection/consumption, not native execution.
export async function artifactFixture(mode: SourceIdentity['mode'] = 'release', migrationSource = 'export function up() {}\n') {
  const root = await mkdtemp(join(realpathSync(tmpdir()), 'esty-artifact-test-'));
  const raw = join(root, 'raw'), operator = join(root, 'operator');
  await mkdir(raw); await mkdir(operator);
  const put = async (base: string, path: string, value: string | object) => {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const config = { $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'nestjs', git: { deploymentEnabled: false }, functions: { 'src/main.ts': { maxDuration: 10, supportsCancellation: true } } };
  const migration = { name: '1792972800000-foundation', sha256: sha256(migrationSource) };
  const record = (path: string, bytes: string): FileRecord => ({ path, mode: 0o644, size: Buffer.byteLength(bytes), sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
  const files = [record('apps/api/vercel.json', JSON.stringify(config)), record(`apps/api/migrations/${migration.name}.mjs`, migrationSource)];
  const source: SourceIdentity = { mode, revision: 'a'.repeat(40), tree: 'b'.repeat(40), repository: 'https://github.com/synthetic/repository', files, digest: sha256(canonical(files)) };
  await put(raw, 'config.json', { version: 3, routes: [{ handle: 'error' }, { status: 404, src: '^(?!/api).*$', dest: '/404.html' }, ...finalRoutes], framework: { slug: 'nestjs', version: '12.2.0' } });
  const prefix = 'functions/index.func/';
  await put(raw, prefix + '.vc-config.json', { handler: 'apps/api/src/main.js', runtime: 'nodejs24.x', architecture: 'x86_64', environment: {}, framework: { slug: 'nestjs' },
    shouldDisableAutomaticFetchInstrumentation: false, launcherType: 'Nodejs', shouldAddHelpers: true, shouldAddSourcemapSupport: true, awsLambdaHandler: '' });
  for (const name of ['main.js', 'app.js', 'generated/migrations.js']) await put(raw, prefix + 'apps/api/src/' + name, 'export {};\n');
  await put(raw, prefix + 'apps/api/package.json', { type: 'module' });
  for (const name of ['@nestjs/core', 'pg', '@vercel/functions', 'reflect-metadata']) await put(raw, prefix + `node_modules/${name}/package.json`, { name });
  await put(operator, 'apps/api/build/scripts/migrate.js', 'export {};\n');
  await put(operator, `apps/api/migrations/${migration.name}.mjs`, migrationSource);
  const tools: ToolEvidence[] = Object.entries(toolPins).map(([name, pin]) => ({ name: name as keyof typeof toolPins, ...pin, filesDigest: sha256('synthetic-package') }));
  const artifact = await assembleArtifact({ raw, operator, destination: join(root, 'sealed'), source, config, migrations: [migration],
    build: { node: artifactTarget.node, nodeSha256: sha256('synthetic-node'), npm: '11.19.1', platform: 'linux', arch: 'x64', tools, builderConfigDigest: sha256(canonical(builderConfig(config))), metadata: artifactTarget } });
  return { artifact, root, raw, operator, config, dispose: () => removeArtifactTree(root) };
}
export async function routineMigrationFixture(extra = 'export function up(pgm) { pgm.sql("CREATE TABLE public.routine_delivery_probe (id integer PRIMARY KEY)"); }\n') {
  const base = await artifactFixture();
  const files = base.artifact.manifest.source.files.filter(file => !file.path.startsWith('apps/api/migrations/'));
  const next = `${Number(migrationManifest.at(-1)!.name.slice(0, 13)) + 1}-routine-delivery`;
  const migrations = [...migrationManifest, { name: next, sha256: sha256(extra) }];
  for (const entry of migrations) {
    const path = `apps/api/migrations/${entry.name}.mjs`;
    const bytes = entry.name === next ? Buffer.from(extra) : await readFile(new URL(`../../migrations/${entry.name}.mjs`, import.meta.url));
    await writeFile(join(base.operator, path), bytes);
    files.push({ path, size: bytes.length, mode: 0o644, sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
  }
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'routine'),
    config: base.config, source: { ...base.artifact.manifest.source, repository: 'https://github.com/khuonghuyhieu/esty-admin',
      files, digest: sha256(canonical(files)) }, migrations, build: base.artifact.manifest.build });
  return { ...base, artifact };
}

export function historicalProviderFixture(artifact: VerifiedArtifact, fault = '') {
  const h = routineProviderFixture(artifact), selected = historicalReleaseEvidence;
  const predecessor = { id: heldD2.candidate, revision: heldAppPolicy.revision, tree: heldAppPolicy.tree,
    artifactDigest: heldAppPolicy.artifactDigest, sourceDigest: heldAppPolicy.sourceDigest, configDigest: heldD2.configDigest };
  const prior: ReleaseRequest = { version: 1, mode: 'etsy-strict-cutover', repository: 'khuonghuyhieu/esty-admin',
    target: retainedActivation.target, controller: { revision: 'c'.repeat(40), tree: 'd'.repeat(40), run: '120' },
    producer: { revision: 'c'.repeat(40), tree: 'd'.repeat(40), run: '119' }, artifactId: '118', artifactDigest: '9'.repeat(64),
    sourceDigest: '8'.repeat(64), archiveDigest: '7'.repeat(64), operatorDigest: '6'.repeat(64), configDigest: h.schema.configDigest,
    historicalHandoffDigest, schema: { before: [...migrationManifest].slice(0, 3), beforeDigest: manifestDigest(migrationManifest.slice(0, 3)),
      target: [...migrationManifest], targetDigest: manifestDigest(migrationManifest) },
    migration: { packetDigest: '5'.repeat(64), predecessor: { id: predecessor.id, revision: predecessor.revision,
      artifactDigest: predecessor.artifactDigest, configDigest: predecessor.configDigest },
    compatibilityApproval: null, maintenanceApproval: '4'.repeat(64), recoveryApproval: '3'.repeat(64) } };
  const request: ReleaseRequest = { ...prior, mode: 'current-schema-only', controller: h.run, producer: { ...h.run, run: '122' },
    artifactId: '456', artifactDigest: artifact.digest, sourceDigest: artifact.manifest.source.digest, migration: null,
    schema: { before: artifact.manifest.migrations, target: artifact.manifest.migrations,
      beforeDigest: artifact.manifest.migrationDigest, targetDigest: artifact.manifest.migrationDigest } };
  const schema = { ...h.schema, request, requestDigest: sha256(canonical(request)) };
  const historic = (accepted: boolean) => ({ id: accepted ? selected.accepted.id : selected.failed.id,
    sha: heldAppPolicy.revision, task: 'deploy:esty-be-ci', environment: 'be-production', production_environment: true,
    payload: { version: 1, revision: heldAppPolicy.revision, tree: heldAppPolicy.tree,
      run: accepted ? selected.accepted.run : selected.failed.proof.workflowRun, artifact: heldAppPolicy.artifactDigest,
      sourceDigest: heldAppPolicy.sourceDigest, migrationDigest: prior.schema.beforeDigest, project: heldAppPolicy.project,
      activationPacket: accepted ? heldAppPolicy.packetDigest : selected.failed.proof.packetDigest,
      activationRun: accepted ? selected.accepted.activationRun : selected.failed.proof.activationRun } });
  const marker = { version: 1, evidenceDigest: historicalHandoffDigest, predecessorRecord: null, predecessor };
  const consumed = { id: 900, sha: prior.controller.revision, task: 'deploy:esty-be-ci', environment: 'be-production',
    production_environment: true, payload: { version: 1, ...prior.controller, artifact: prior.artifactDigest,
      sourceDigest: prior.sourceDigest, migrationDigest: prior.schema.targetDigest, project: heldAppPolicy.project,
      requestDigest: sha256(canonical(prior)), configDigest: prior.configDigest, migrationPacket: prior.migration!.packetDigest,
      historicalHandoff: marker, releaseRequest: prior } };
  const success = { id: 901, state: 'success', description: `strict:accepted:${'2'.repeat(64)}` };
  const records: Array<{ id: number; sha: string; task: string; environment: string; production_environment: boolean; payload: Record<string, unknown> }>
    = [consumed, historic(true), historic(false)];
  let lists = 0, aliases = 0;
  const transport: typeof fetch = async (raw, init) => {
    const url = new URL(String(raw)), path = url.pathname, method = init?.method ?? 'GET';
    if (url.hostname === 'api.github.com' && method === 'GET') {
      if (path.endsWith('/deployments')) {
        lists++;
        const rows = structuredClone(records);
        const successor = rows[0], accepted = rows[1];
        if (!successor || !accepted) throw new Error('Historical fixture inventory differs.');
        if (fault === 'missing-failed') rows.pop();
        if (fault === 'duplicate') rows.push(accepted);
        if (fault === 'unknown' || (fault === 'concurrent' && lists > 1)) rows.unshift({ ...successor, id: 999, payload: {} });
        if (fault === 'replay') successor.payload.requestDigest = schema.requestDigest;
        if (fault === 'marker-digest') successor.payload.historicalHandoff = { ...marker, evidenceDigest: '0'.repeat(64) };
        if (fault === 'marker-fork') successor.payload.historicalHandoff = { ...marker, predecessorRecord: 999 };
        if (fault === 'request-tamper') successor.payload.releaseRequest = { ...prior, artifactDigest: '0'.repeat(64) };
        if (fault === 'schema') successor.payload.migrationDigest = '0'.repeat(64);
        if (fault === 'record-drift' && lists > 1) accepted.payload.sourceDigest = '0'.repeat(64);
        const current = h.reservation();
        if (current) rows.unshift({ id: 44, sha: h.run.revision, task: 'deploy:esty-be-ci', environment: 'be-production',
          production_environment: true, payload: current.payload });
        return Response.json(rows);
      }
      if (path.endsWith('/deployments/900/statuses')) {
        const status = fault === 'unresolved-successor' ? { ...success, state: 'error' } : success;
        return Response.json(url.searchParams.get('per_page') === '100'
          ? [status, { id: 899, state: 'in_progress', description: fault === 'missing-ack' ? 'strict:unresolved' : 'ack:dpl_previous' }]
          : [status]);
      }
      if (path.endsWith('/deployments/999/statuses')) return Response.json([{ state: 'in_progress' }]);
      for (const selectedRecord of [selected.accepted, selected.failed]) {
        if (path.endsWith(`/deployments/${selectedRecord.id}/statuses`)) return Response.json([{
          ...selectedRecord.status, ...(fault === 'status-drift' && lists > 1 ? { id: 1 } : {}),
          ...(fault === 'forged-status' ? { description: 'failed_preflight_no_effects:' + '0'.repeat(64) } : {}) }]);
      }
      if (path.endsWith(`/commits/${prior.controller.revision}`)) return Response.json({ sha: prior.controller.revision,
        commit: { tree: { sha: fault === 'source' ? '0'.repeat(40) : prior.controller.tree } } });
      if (fault === 'main' && path.endsWith('/commits/main')) return Response.json({ sha: '0'.repeat(40), commit: { tree: { sha: h.run.tree } } });
    }
    if (url.hostname === 'api.vercel.com') {
      if (path === '/v13/deployments/dpl_previous') return Response.json({ id: 'dpl_previous', projectId: artifactTarget.project,
        ownerId: artifactTarget.owner, target: 'production', readyState: 'READY', regions: ['icn1'], meta: {
          sourceCommit: prior.controller.revision, sourceDigest: prior.sourceDigest,
          artifactSha256: fault === 'artifact' ? '0'.repeat(64) : prior.artifactDigest } });
      if (path === '/v4/aliases/api.lovora.us') {
        aliases++;
        if (fault === 'alias' || (fault === 'alias-drift' && aliases > 1)) return Response.json({
          alias: 'api.lovora.us', projectId: artifactTarget.project, deploymentId: 'dpl_other' });
      }
    }
    const response = await h.transport(raw, init);
    if (fault === 'runtime' && url.hostname === 'api.lovora.us' && response.headers.has('x-activation-config-digest')) {
      response.headers.set('x-activation-config-digest', '0'.repeat(64));
    }
    return response;
  };
  return { ...h, schema, request, prior, records, transport, marker };
}


export function fileTree(current: VerifiedArtifact, decimalModes = false): any[] {
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
export function receiptZip(members: Array<[string, Buffer]>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, bytes] of members) {
    const encoded = Buffer.from(name), local = Buffer.alloc(30), header = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(bytes), 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(encoded.length, 26);
    header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6);
    header.writeUInt32LE(crc32(bytes), 16); header.writeUInt32LE(bytes.length, 20); header.writeUInt32LE(bytes.length, 24);
    header.writeUInt16LE(encoded.length, 28); header.writeUInt32LE(offset, 42);
    locals.push(local, encoded, bytes); central.push(header, encoded); offset += local.length + encoded.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(members.length, 8); end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// Authentic immutable incident bytes; synthetic current execution identities below.
export function heldContinuationFixture(now = 1795500000000) {
  const zip = Buffer.from("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", 'base64');
  const packet: EtsyReleasePacket = {"artifactDigest":"06afb0ae722be3afead286181137fddb1c769f9de6416fe8c71ef8ce4b4c08f1","browserOrigin":"https://app.lovora.us","cliDigest":"fbfdf168c47080d8055d307e1713e3737870419ff2fd7adb2c2a77cb6635dcc1","cliOwnFilesDigest":"c92fd2a7440a10ae025f4ae3ccb61bb3c8c442b8dc10141bfeb1a9cdfb3d34b4","configBundleDigest":"5a4a129ee4790d6e194e6d76383857f7013a03c61b5069c962596b232db9b3b9","driverDigest":"103afc77d8c2250e2e4b2e9ba4718227514640b3f2b94e0eff51f05fb4df676e","grants":{"automatedDelivery":"disabled","exclusiveOwnerLease":"owner-manual-17900717-24bf-4b64-8c1d-8e6a456412d6","maintenance":"approved-readiness-interruption","phases":["history","held-create","pre-sql-check","sql-apply","post-sql-check","promote-only","final-domain-ack"],"recovery":"approved-roll-forward-only"},"ledgerRoot":"/home/runner/.local/state/lovora-etsy-setup","metadataDigest":"a825199e3ac815bac3fa282231eb7da29611d5f4d18e2cfa8c9a748e22e0c9d5","migrationInputDigest":"33389f19c86fbbfa78862e2b119fa7661e9ab84fe1b823cd1423bea31d466882","nodeDigest":"e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb","predecessor":{"artifactDigest":"82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2","configDigest":"249e18e93eb01e5fa1f66117c82a8cca2e0777938655308cc43af437095e7892","id":"dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7","revision":"f162c8db8ec149724c0a25537a4a0674bd012035","sourceDigest":"73e8f1f5cb7683da2f337b6f3092d6cdcd6dd42ea15a224ce35aa3ea0b77c3e8","tree":"181b2c014f9373e4d6cdf055cba01eac11ed5a5e"},"previousDigest":"149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3","revision":"b12a8fb31b2fa017ac87d191aa5cc2652a5691d3","runId":"17900717-24bf-4b64-8c1d-8e6a456412d6","runtimeDigest":"2735b4ec8d3d26b9a5e14f81954c25729159b96b62bc6d508754d7b4f337064a","runtimeKeys":["API_RUNTIME","APP_ACTIVATION_CONFIG_DIGEST","APP_AUTH_API_KEY","APP_AUTH_URL","APP_EMAIL_ENABLED","APP_FOUNDATION_ENABLED","APP_RETENTION_POLICY_ID","APP_SCHEMA_MODE","APP_WORKSPACE_ID","BROWSER_ORIGIN","DATABASE_CA_PEM","DATABASE_URL","ETSY_CALLBACK_URL","ETSY_CLIENT_ID","ETSY_ENABLED","ETSY_INVITATION_ORIGIN","ETSY_INVITATION_TTL_SECONDS","ETSY_RETENTION_SECONDS","ETSY_RETURN_ORIGIN","ETSY_SHARED_SECRET","ETSY_TOKEN_ACTIVE_KEY_ID","ETSY_TOKEN_KEYRING","PREVIEW_ACCESS_KEY","SUPABASE_DATABASE_NAME","SUPABASE_DATABASE_USER","SUPABASE_PROJECT_REF","SUPABASE_SESSION_HOST"],"sourceDigest":"9423a4a1c7d6810807c1afdaef5cd25e2ae4c55dfec796e78732019e5cca8e02","target":"supabase:eotmpaliqcxxcotrcols","targetDigest":"1abeceddcc07eadf5b7929ed52a786ec8a807a73568f1e214bfab556c3859540","tree":"a4175ef8e71afe7a1d45f4b8af54f693be05244c","version":1,"window":{"end":1795412007767,"start":1795404747766}};
  const origin = verifyHeldEtsyReceipts(zip, packet);
  const operator = { revision: 'a'.repeat(40), tree: 'b'.repeat(40), producerRun: '122', artifactId: '456',
    artifactDigest: '1'.repeat(64), sourceDigest: '2'.repeat(64), archiveDigest: '3'.repeat(64), operatorDigest: '4'.repeat(64),
    workflowDigest: sha256(readFileSync(new URL('../../../../.github/workflows/be-delivery.yml', import.meta.url))),
    driverDigest: '5'.repeat(64), nodeDigest: '6'.repeat(64), cliDigest: '7'.repeat(64), cliOwnFilesDigest: '8'.repeat(64) };
  const approval: EtsyContinuationApproval = { version: 1, kind: 'held-etsy-continuation', incident: heldEtsyIncident,
    runId: '74d25a24-e560-4e0e-a067-129a1f159654', lease: 'synthetic-serialized-production-job',
    window: { start: now - 1000, end: now + 600000 }, originalPacket: packet, operator };
  const digest = sha256(canonical(approval));
  const request: ReleaseRequest = { ...origin.request, controller: { revision: operator.revision, tree: operator.tree, run: '123' },
    producer: { revision: operator.revision, tree: operator.tree, run: operator.producerRun }, artifactId: operator.artifactId,
    artifactDigest: operator.artifactDigest, sourceDigest: operator.sourceDigest, archiveDigest: operator.archiveDigest,
    operatorDigest: operator.operatorDigest, continuation: approval, migration: { ...origin.request.migration!, packetDigest: digest,
      recoveryApproval: sha256(canonical({ packet: digest, recovery: packet.grants.recovery })),
      maintenanceApproval: sha256(canonical({ packet: digest, window: approval.window, maintenance: packet.grants.maintenance })) } };
  return { zip, packet, origin, approval, digest, request, now };
}

// Genuine archived stopped receipt and public GitHub snapshots; no production transport.
export function replacementContinuationFixture(now = 1795587000000) {
  const archived = JSON.parse(gunzipSync(Buffer.from(
    "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",
    'base64')).toString('utf8'));
  const original = heldContinuationFixture(now), approval: EtsyContinuationApproval = { ...original.approval,
    kind: 'replacement-etsy-continuation', priorContinuation: stoppedEtsyContinuation, replacement: etsyReplacement };
  const digest = sha256(canonical(approval)), packet = continuationApplication(approval);
  const request: ReleaseRequest = { ...original.request, continuation: approval, migration: { ...original.request.migration!,
    packetDigest: digest, recoveryApproval: sha256(canonical({ packet: digest, recovery: packet.grants.recovery })),
    maintenanceApproval: sha256(canonical({ packet: digest, window: approval.window, maintenance: packet.grants.maintenance })) } };
  return { ...original, packet, approval, digest, request, stoppedZip: Buffer.from(archived.zip, 'base64'), snapshots: archived.snapshots };
}
