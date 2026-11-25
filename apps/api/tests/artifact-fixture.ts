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
import { crc32, gzipSync } from 'node:zlib';
import { routineContext, selectRoutine } from '../scripts/routine-retained.mjs';
import { activationRuntimeKeys, runtimeConfigDigest } from '../src/config/activation-config.js';
import { manifestDigest } from '../scripts/migrations.js';
import { heldEtsyIncident, verifyHeldEtsyReceipts } from '../scripts/etsy-release.js';
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
