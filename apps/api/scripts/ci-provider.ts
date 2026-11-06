import { artifactTarget, canonical, sha256 } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { fileMode, vercelDeployment } from './vercel-deploy.js';
import { checkHostedHttp } from './hosted-acceptance.js';
import { responseBytes } from './ci-tools.js';
import { verifyUploadedArchive } from './ci-archive.js';
import { validateActivationPacket, verifyActivationArtifact } from './activation-journal.js';
import type { ActivationPacket } from './activation-journal.js';
import { verifyRoutineArtifact } from './ci-migrations.js';
import type { RoutineSchema } from './ci-migrations.js';

export const repository = 'khuonghuyhieu/esty-admin';
export const deploymentId = /^dpl_[A-Za-z0-9]{1,124}$/;
const task = 'deploy:esty-be-ci';
export interface RunIdentity { revision: string; tree: string; run: string }
export interface Candidate { id: string; origin: string; ready: boolean }
export interface DeliveryProvider {
  currentMain(): Promise<void>;
  preflight(): Promise<string>;
  reserve(): Promise<number>;
  record(journal: number, state: 'in_progress' | 'success' | 'error', description: string): Promise<void>;
  inspect(id: string): Promise<Candidate>;
  attest(id: string): Promise<void>;
  binding(id: string): Promise<void>;
  http(origin: string, candidate: boolean): Promise<void>;
}
export interface RoutineProvider extends DeliveryProvider {
  confirmRoutineJournal(journal: number, description: string): Promise<void>;
  compatiblePredecessor(): Promise<void>;
}
export interface ActivationProvider extends DeliveryProvider {
  confirmJournal(journal: number, state: 'in_progress' | 'success', description: string): Promise<void>;
  acceptFrontend(receipt: unknown, approvedDigest: string): Promise<void>;
}
export interface ActivationDeliveryContext {
  packet: ActivationPacket; packetDigest: string; phase: 'bridge' | 'app';
}
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unconfirmed provider object.');
  return value as Record<string, any>;
}
function numeric(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
export function createProvider(artifact: VerifiedArtifact, run: RunIdentity, schema: RoutineSchema,
  credentials: { github: string; vercel: string; bearer: string; bypass: string }, signal: AbortSignal,
  transport: typeof fetch = fetch): RoutineProvider {
  return providerImplementation(artifact, run, credentials, signal, transport, undefined, schema);
}
export function createActivationProvider(artifact: VerifiedArtifact, run: RunIdentity,
  credentials: { github: string; vercel: string; bearer: string }, signal: AbortSignal,
  activation: ActivationDeliveryContext, transport: typeof fetch = fetch): ActivationProvider {
  validateActivationPacket(activation.packet, activation.packetDigest);
  if (activation.packet.target === 'local' || !['bridge', 'app'].includes(activation.phase)
    || activation.packet.revision !== run.revision || activation.packet.tree !== run.tree) throw new Error('Activation delivery binding differs.');
  return providerImplementation(artifact, run, { ...credentials, bypass: '' }, signal, transport, activation);
}
function providerImplementation(artifact: VerifiedArtifact, run: RunIdentity,
  credentials: { github: string; vercel: string; bearer: string; bypass: string }, signal: AbortSignal,
  transport: typeof fetch, activation?: ActivationDeliveryContext, schema?: RoutineSchema): ActivationProvider & RoutineProvider {
  for (const token of [credentials.github, credentials.vercel, ...(activation ? [] : [credentials.bypass])]) {
    if (!/^[\x21-\x7e]{16,512}$/.test(token)) throw new Error('Required environment secret is absent or invalid.');
  }
  if (!/^[a-f0-9]{64}$/.test(credentials.bearer)) throw new Error('Required application secret is absent or invalid.');
  const verify = () => {
    if (activation) verifyActivationArtifact(artifact, activation.packet);
    else {
      if (!schema) throw new Error('An approved routine schema is required.');
      verifyRoutineArtifact(artifact, run, schema);
    }
  };
  verify();
  const request = (url: string, init: RequestInit = {}) => transport(url, { ...init, redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  async function json(url: string, token: string, init: RequestInit = {}, status = 200, maximum = 8 * 1024 * 1024): Promise<any> {
    const response = await request(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      Accept: 'application/json', 'X-GitHub-Api-Version': '2026-03-10', ...init.headers } });
    if (response.status !== status || response.redirected) { await response.body?.cancel(); throw new Error('Provider response not confirmed.'); }
    return JSON.parse((await responseBytes(response, maximum)).toString('utf8'));
  }
  const github = (path: string, init?: RequestInit, status?: number) => {
    if (!path.startsWith('/') || path.includes('..')) throw new Error('Invalid GitHub path.');
    return json(`https://api.github.com/repos/${repository}${path}`, credentials.github, init, status);
  };
  const provider = (path: string, maximum?: number) => {
    const url = new URL(path, 'https://api.vercel.com');
    if (url.origin !== 'https://api.vercel.com') throw new Error('Invalid provider origin.');
    url.searchParams.set('teamId', artifactTarget.owner); url.searchParams.set('slug', artifactTarget.scope);
    return json(url.href, credentials.vercel, {}, 200, maximum);
  };
  async function alias(): Promise<string> {
    const domain = object(await provider(`/v9/projects/${artifactTarget.project}/domains/api.lovora.us`));
    if (domain.name !== 'api.lovora.us' || domain.projectId !== artifactTarget.project || domain.verified !== true
      || domain.redirect || domain.gitBranch || domain.customEnvironmentId) throw new Error('Unverified production domain.');
    const value = object(await provider(`/v4/aliases/api.lovora.us?projectId=${artifactTarget.project}`));
    if (value.alias !== 'api.lovora.us' || value.projectId !== artifactTarget.project || !deploymentId.test(value.deploymentId)
      || (value.deployment != null && object(value.deployment).id !== value.deploymentId)
      || value.deletedAt || value.redirect || value.microfrontends) throw new Error('Unverified production alias.');
    return value.deploymentId;
  }
  return {
    async currentMain() {
      const commit = object(await github('/commits/main'));
      if (commit.sha !== run.revision || object(object(commit.commit).tree).sha !== run.tree) throw new Error('Run no longer identifies current main.');
    },
    async preflight() {
      await vercelDeployment({ VERCEL_TOKEN: credentials.vercel, VERCEL_PROJECT_ID: artifactTarget.project,
        VERCEL_SCOPE: artifactTarget.scope, VERCEL_TEAM_ID: artifactTarget.owner, REPOSITORY: `https://github.com/${repository}`,
        DEPLOYMENT_TARGET: 'production', PREVIEW_ACCESS_KEY: credentials.bearer, API_ORIGIN: 'https://api.lovora.us',
        BROWSER_ORIGIN: 'https://app.lovora.us' }, artifact, transport).preflight(signal);
      return alias();
    },
    async reserve() {
      // Every unresolved intent survives runner loss. No reset, retry, auto-merge or implicit unlock.
      for (let page = 1; ; page++) {
        if (page > 20) throw new Error('Journal exceeds bounded reconciliation window.');
        const entries: unknown = await github(`/deployments?task=${encodeURIComponent(task)}&environment=be-production&per_page=100&page=${page}`);
        if (!Array.isArray(entries)) throw new Error('Durable intent history is unavailable.');
        for (const raw of entries) {
          const entry = object(raw);
          if (!numeric(entry.id) || entry.task !== task || entry.environment !== 'be-production') throw new Error('Journal identity differs.');
          const statuses: unknown = await github(`/deployments/${entry.id}/statuses?per_page=1`);
          if (!Array.isArray(statuses) || statuses.length !== 1 || object(statuses[0]).state !== 'success') {
            throw new Error('A previous delivery outcome is unresolved; owner reconciliation is required.');
          }
        }
        if (entries.length < 100) break;
      }
      const result = object(await github('/deployments', { method: 'POST', body: JSON.stringify({ ref: run.revision, task,
        environment: 'be-production', auto_merge: false, required_contexts: [], production_environment: true,
        description: 'Exact tested BE artifact delivery intent', payload: { version: 1, ...run, artifact: artifact.digest,
          sourceDigest: artifact.manifest.source.digest, migrationDigest: activation?.packet.targetDigest ?? schema!.digest,
          project: artifactTarget.project, ...(activation ? { activationPacket: activation.packetDigest, activationRun: activation.packet.runId } : {}),
          ...(schema?.migration ? { migrationPacket: schema.migration.digest } : {}) } }) }, 201));
      if (!numeric(result.id) || result.sha !== run.revision || result.task !== task || result.environment !== 'be-production') {
        throw new Error('Durable intent acknowledgement is unknown.');
      }
      return result.id;
    },
    async record(journal, state, description) {
      if (!numeric(journal) || description.length > 140 || !/^[a-zA-Z0-9_: .-]+$/.test(description)) throw new Error('Invalid public journal status.');
      const result = object(await github(`/deployments/${journal}/statuses`, { method: 'POST', body: JSON.stringify({ state, description,
        auto_inactive: false, log_url: `https://github.com/${repository}/actions/runs/${run.run}`,
        environment_url: 'https://api.lovora.us' }) }, 201));
      if (!numeric(result.id) || result.state !== state) throw new Error('Durable status acknowledgement is unknown.');
    },
    async confirmRoutineJournal(journal, description) {
      if (!schema?.migration || !numeric(journal)) throw new Error('Routine migration binding is absent.');
      const entry = object(await github(`/deployments/${journal}`)), payload = object(entry.payload);
      if (entry.id !== journal || entry.sha !== run.revision || entry.task !== task || entry.environment !== 'be-production'
        || payload.version !== 1 || payload.run !== run.run || payload.revision !== run.revision || payload.tree !== run.tree
        || payload.migrationPacket !== schema.migration.digest || payload.artifact !== artifact.digest
        || payload.sourceDigest !== artifact.manifest.source.digest || payload.migrationDigest !== schema.digest
        || payload.project !== artifactTarget.project) throw new Error('Routine journal identity differs.');
      const statuses: unknown = await github(`/deployments/${journal}/statuses?per_page=1`);
      if (!Array.isArray(statuses) || statuses.length !== 1 || object(statuses[0]).state !== 'in_progress'
        || object(statuses[0]).description !== description) throw new Error('Routine journal acknowledgement is unknown.');
    },
    async compatiblePredecessor() {
      if (!schema?.migration) throw new Error('A compatible predecessor approval is required.');
      const expected = schema.migration.packet.predecessor;
      if (await alias() !== expected.id) throw new Error('Compatible predecessor alias differs.');
      const value = object(await provider(`/v13/deployments/${expected.id}`)), meta = object(value.meta);
      if (value.id !== expected.id || value.projectId !== artifactTarget.project || value.ownerId !== artifactTarget.owner
        || value.target !== 'production' || value.readyState !== 'READY' || value.gitSource
        || meta.sourceCommit !== expected.revision || meta.artifactSha256 !== expected.artifact
        || !Array.isArray(value.regions) || canonical(value.regions) !== canonical(['icn1'])) {
        throw new Error('Approved compatible predecessor identity differs.');
      }
      await checkHostedHttp('https://api.lovora.us', 'https://app.lovora.us', credentials.bearer, async (url, init) => {
        const response = await request(url, init);
        if (init?.method !== 'OPTIONS' && ['/health/live', '/health/ready'].includes(new URL(url).pathname)) {
          const authorized = new Headers(init?.headers).get('authorization') === `Bearer ${credentials.bearer}`;
          if (response.headers.get('x-activation-config-digest') !== (authorized ? expected.configDigest : null)) {
            await response.body?.cancel(); throw new Error('Compatible predecessor configuration differs.');
          }
        }
        return response;
      });
      if (await alias() !== expected.id) throw new Error('Compatible predecessor binding changed.');
    },
    async confirmJournal(journal, state, description) {
      if (!activation || !numeric(journal)) throw new Error('Activation journal binding is absent.');
      const entry = object(await github(`/deployments/${journal}`)), payload = object(entry.payload);
      if (entry.id !== journal || entry.sha !== run.revision || entry.task !== task || entry.environment !== 'be-production'
        || payload.activationPacket !== activation.packetDigest || payload.activationRun !== activation.packet.runId
        || payload.artifact !== artifact.digest || payload.sourceDigest !== activation.packet.sourceDigest
        || payload.migrationDigest !== activation.packet.targetDigest || payload.project !== artifactTarget.project) throw new Error('Activation journal identity differs.');
      const statuses: unknown = await github(`/deployments/${journal}/statuses?per_page=1`);
      if (!Array.isArray(statuses) || statuses.length !== 1 || object(statuses[0]).state !== state
        || object(statuses[0]).description !== description) throw new Error('Activation journal acknowledgement is unknown.');
    },
    async inspect(id) {
      verify(); if (!deploymentId.test(id)) throw new Error('Invalid deployment ID.');
      const value = object(await provider(`/v13/deployments/${id}`)), meta = object(value.meta);
      if (value.id !== id || value.projectId !== artifactTarget.project || value.ownerId !== artifactTarget.owner
        || value.target !== 'production' || value.gitSource || meta.sourceCommit !== run.revision
        || meta.artifactSha256 !== artifact.digest || meta.sourceDigest !== artifact.manifest.source.digest
        || !Array.isArray(value.regions) || value.regions.length !== 1 || value.regions[0] !== 'icn1'
        || typeof value.url !== 'string' || !/^[a-z0-9-]+\.vercel\.app$/.test(value.url)
        || !['QUEUED', 'INITIALIZING', 'BUILDING', 'READY'].includes(value.readyState)) throw new Error('Candidate identity or state differs.');
      if (activation && (meta.activationRun !== activation.packet.runId || meta.activationPhase !== activation.phase
        || meta.activationPacket !== activation.packetDigest || meta.activationConfigDigest !==
          (activation.phase === 'bridge' ? activation.packet.bridgeConfigDigest : activation.packet.appConfigDigest))) {
        throw new Error('Candidate activation declaration differs.');
      }
      return { id, origin: `https://${value.url}`, ready: value.readyState === 'READY' };
    },
    async attest(id) {
      verify(); if (!deploymentId.test(id)) throw new Error('Invalid deployment ID.');
      const roots: unknown = await provider(`/v6/deployments/${id}/files`);
      if (!Array.isArray(roots) || roots.length !== 2) throw new Error('Unsupported uploaded file envelope.');
      const source = object(roots.find(entry => object(entry).name === 'src'));
      const output = object(roots.find(entry => object(entry).name === 'out'));
      if (source.type !== 'directory' || output.type !== 'directory' || fileMode(source.mode) !== 0o40555 || fileMode(output.mode) !== 0o40555
        || !Array.isArray(source.children) || source.children.length !== 1 || !Array.isArray(output.children) || output.children.length !== 1) {
        throw new Error('Uploaded archive namespaces differ.');
      }
      const file = object(source.children[0]), lambda = object(output.children[0]);
      if (file.name !== 'project.tgz' || file.type !== 'file' || !/^[a-f0-9]{40}$/.test(file.uid)
        || lambda.name !== 'index' || lambda.type !== 'lambda' || fileMode(lambda.mode) !== 0o140666
        || (lambda.children !== undefined && (!Array.isArray(lambda.children) || lambda.children.length))) throw new Error('Uploaded archive identity differs.');
      const content = object(await provider(`/v8/deployments/${id}/files/${file.uid}`, 350 * 1024 * 1024));
      if (typeof content.data !== 'string' || content.data.length > 350 * 1024 * 1024) throw new Error('Archive content is unavailable.');
      const bytes = Buffer.from(content.data, 'base64');
      if (bytes.toString('base64') !== content.data) throw new Error('Noncanonical archive encoding.');
      verifyUploadedArchive(bytes, artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/')), file.uid);
    },
    async acceptFrontend(receipt, approvedDigest) {
      if (!activation || !/^[a-f0-9]{64}$/.test(approvedDigest) || sha256(canonical(receipt)) !== approvedDigest) {
        throw new Error('Separately approved final FE evidence is missing.');
      }
      const value = object(receipt), packet = activation.packet;
      const keys = ['version', 'packetDigest', 'projectId', 'deploymentId', 'origin', 'revision',
        'sourceDigest', 'configDigest', 'contractDigest', 'checks'];
      const checks = ['final-origin-login', 'current-me', 'workspace-capabilities', 'protected-routes', 'refresh',
        'local-logout', 'old-jwt-denial', 'current-negative-admission', 'cross-user-isolation', 'csrf-csp-public-regressions'];
      if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
        || value.version !== 1 || value.packetDigest !== activation.packetDigest || value.origin !== 'https://app.lovora.us'
        || !/^prj_[A-Za-z0-9]{1,124}$/.test(value.projectId) || value.projectId === artifactTarget.project
        || !deploymentId.test(value.deploymentId) || value.revision !== packet.feRevision
        || value.sourceDigest !== packet.feSourceDigest || value.configDigest !== packet.feConfigDigest
        || value.contractDigest !== packet.contractDigest || Object.keys(object(value.checks)).length !== checks.length
        || checks.some(key => value.checks[key] !== 'passed')) throw new Error('Final FE acceptance evidence differs.');
      const project = object(await provider(`/v9/projects/${value.projectId}`));
      if (project.id !== value.projectId || project.name !== 'esty-admin' || project.accountId !== artifactTarget.owner
        || project.framework !== 'nextjs' || project.rootDirectory !== 'apps/web') throw new Error('FE project identity is unverified.');
      const deployed = object(await provider(`/v13/deployments/${value.deploymentId}`));
      const meta = object(deployed.meta);
      if (deployed.id !== value.deploymentId || deployed.projectId !== value.projectId || deployed.ownerId !== artifactTarget.owner
        || deployed.target !== 'production' || deployed.readyState !== 'READY' || meta.githubCommitSha !== packet.feRevision
        || (deployed.gitSource && object(deployed.gitSource).sha !== packet.feRevision)) throw new Error('FE source/deployment identity differs.');
      const checkBinding = async () => {
        const domain = object(await provider(`/v9/projects/${value.projectId}/domains/app.lovora.us`));
        const bound = object(await provider(`/v4/aliases/app.lovora.us?projectId=${value.projectId}`));
        if (domain.name !== 'app.lovora.us' || domain.projectId !== value.projectId || domain.verified !== true
          || domain.redirect || domain.gitBranch || domain.customEnvironmentId || bound.alias !== 'app.lovora.us'
          || bound.projectId !== value.projectId || bound.deploymentId !== value.deploymentId
          || bound.deletedAt || bound.redirect || bound.microfrontends) throw new Error('FE final domain differs.');
      };
      await checkBinding();
      const response = await request('https://app.lovora.us/login', { cache: 'no-store', credentials: 'omit' });
      const policy = response.headers.get('content-security-policy') ?? '';
      const scripts = policy.split(';').map(part => part.trim()).find(part => part.startsWith('script-src ')) ?? '';
      if (response.status !== 200 || response.redirected || !response.headers.get('content-type')?.startsWith('text/html')
        || !response.headers.get('cache-control')?.includes('no-store')
        || !/'nonce-[A-Za-z0-9+/_=-]+'/.test(scripts) || !scripts.includes("'strict-dynamic'")
        || scripts.includes("'unsafe-inline'") || scripts.includes("'unsafe-eval'")) {
        await response.body?.cancel(); throw new Error('FE final-origin public protection acceptance failed.');
      }
      await responseBytes(response, 1024 * 1024);
      await checkBinding();
    },
    async binding(id) { if (await alias() !== id) throw new Error('Production alias changed.'); },
    async http(origin, candidate) {
      if (candidate ? !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) : origin !== 'https://api.lovora.us') throw new Error('Invalid acceptance origin.');
      await checkHostedHttp(origin, 'https://app.lovora.us', credentials.bearer, async (url, init) => {
        const response = await request(url, { ...init,
          headers: { ...init?.headers, ...(candidate && !activation ? { 'x-vercel-protection-bypass': credentials.bypass } : {}) } });
        if (activation && init?.method !== 'OPTIONS' && ['/health/live', '/health/ready'].includes(new URL(url).pathname)) {
          const authorized = new Headers(init?.headers).get('authorization') === `Bearer ${credentials.bearer}`;
          const expected = activation.phase === 'bridge' ? activation.packet.bridgeConfigDigest : activation.packet.appConfigDigest;
          if (response.headers.get('x-activation-config-digest') !== (authorized ? expected : null)) {
            await response.body?.cancel(); throw new Error('Actual runtime configuration attestation differs.');
          }
        }
        return response;
      });
    },
  };
}
