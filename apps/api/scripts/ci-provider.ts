import { artifactTarget, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';
import { fileMode, vercelDeployment } from './vercel-deploy.js';
import { checkHostedHttp } from './hosted-acceptance.js';
import { responseBytes } from './ci-tools.js';
import { verifyUploadedArchive } from './ci-archive.js';

export const repository = 'khuonghuyhieu/esty-admin';
export const approvedMigrationDigest = '243818c0ebe11bc6ea8b12b3224810c88e888b18ec30dd5bfe58394f1f209496';
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
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unconfirmed provider object.');
  return value as Record<string, any>;
}
function numeric(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
export function createProvider(artifact: VerifiedArtifact, run: RunIdentity,
  credentials: { github: string; vercel: string; bearer: string; bypass: string }, signal: AbortSignal,
  transport: typeof fetch = fetch): DeliveryProvider {
  for (const token of [credentials.github, credentials.vercel, credentials.bypass]) {
    if (!/^[\x21-\x7e]{16,512}$/.test(token)) throw new Error('Required environment secret is absent or invalid.');
  }
  if (!/^[a-f0-9]{64}$/.test(credentials.bearer)) throw new Error('Required application secret is absent or invalid.');
  const verify = () => verifyArtifact(artifact.root, artifact.digest, { revision: run.revision,
    repository: `https://github.com/${repository}`, migrationDigest: approvedMigrationDigest, release: true });
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
          sourceDigest: artifact.manifest.source.digest, migrationDigest: approvedMigrationDigest, project: artifactTarget.project } }) }, 201));
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
    async inspect(id) {
      verify(); if (!deploymentId.test(id)) throw new Error('Invalid deployment ID.');
      const value = object(await provider(`/v13/deployments/${id}`)), meta = object(value.meta);
      if (value.id !== id || value.projectId !== artifactTarget.project || value.ownerId !== artifactTarget.owner
        || value.target !== 'production' || value.gitSource || meta.sourceCommit !== run.revision
        || meta.artifactSha256 !== artifact.digest || meta.sourceDigest !== artifact.manifest.source.digest
        || !Array.isArray(value.regions) || value.regions.length !== 1 || value.regions[0] !== 'icn1'
        || typeof value.url !== 'string' || !/^[a-z0-9-]+\.vercel\.app$/.test(value.url)
        || !['QUEUED', 'INITIALIZING', 'BUILDING', 'READY'].includes(value.readyState)) throw new Error('Candidate identity or state differs.');
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
    async binding(id) { if (await alias() !== id) throw new Error('Production alias changed.'); },
    async http(origin, candidate) {
      if (candidate ? !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) : origin !== 'https://api.lovora.us') throw new Error('Invalid acceptance origin.');
      await checkHostedHttp(origin, 'https://app.lovora.us', credentials.bearer, (url, init) => request(url, { ...init,
        headers: { ...init?.headers, ...(candidate ? { 'x-vercel-protection-bypass': credentials.bypass } : {}) } }));
    },
  };
}
