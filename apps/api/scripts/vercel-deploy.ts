import type { Deployment, DeploymentDiagnostics, DeployState } from './release-core.js';
import { artifactTarget, readArtifactFile, safePath, verifyArtifact } from './artifact.js';
import type { VerifiedArtifact } from './artifact.js';

const projectId = 'prj_uITHKLUGGE98VxrEcs5FoktBbcls';
const scope = 'khuonghuyhieu0705s-projects';
export interface DeployConfig {
  VERCEL_TOKEN: string; VERCEL_PROJECT_ID: string; VERCEL_SCOPE: string; VERCEL_TEAM_ID: string;
  REPOSITORY: string; DEPLOYMENT_TARGET: 'production'; PREVIEW_ACCESS_KEY: string; API_ORIGIN: string; BROWSER_ORIGIN: string;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
}
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Invalid response object.');
  return value;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid string field.');
  return value;
}
function fileMode(value: unknown): number {
  // The upstream SDK accepts numeric strings; retain only canonical bounded decimal integers.
  const mode = typeof value === 'string' && value.length <= 5 ? Number(value) : value;
  if (typeof mode !== 'number' || !Number.isInteger(mode) || mode < 0 || mode > 0xffff
    || (typeof value === 'string' && String(mode) !== value)) throw new Error('Invalid provider file mode.');
  return mode;
}
const transportCategories: Readonly<Record<string, DeploymentDiagnostics['category']>> = {
  ENOTFOUND: 'dns', EAI_AGAIN: 'dns',
  ECONNREFUSED: 'tcp', ECONNRESET: 'tcp', EHOSTUNREACH: 'tcp', ENETUNREACH: 'tcp', EPIPE: 'tcp', UND_ERR_SOCKET: 'tcp',
  ETIMEDOUT: 'timeout', UND_ERR_CONNECT_TIMEOUT: 'timeout', UND_ERR_HEADERS_TIMEOUT: 'timeout', UND_ERR_BODY_TIMEOUT: 'timeout',
  ERR_TLS_CERT_ALTNAME_INVALID: 'tls', CERT_HAS_EXPIRED: 'tls', DEPTH_ZERO_SELF_SIGNED_CERT: 'tls',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls', UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'tls',
};
function failureCategory(error: unknown, signal: AbortSignal): DeploymentDiagnostics['category'] {
  try {
    if (signal.aborted) return signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted';
    for (let depth = 0; depth < 3 && error && typeof error === 'object'; depth++) {
      const value = error as { name?: unknown; code?: unknown; cause?: unknown };
      if (value.name === 'TimeoutError') return 'timeout';
      if (value.name === 'AbortError') return 'aborted';
      if (typeof value.code === 'string' && Object.hasOwn(transportCategories, value.code)) return transportCategories[value.code]!;
      error = value.cause;
    }
  } catch { /* Classification must not replace the original failure. */ }
  return 'unclassified';
}
export function parseDeployConfig(value: unknown): DeployConfig {
  const keys = ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_SCOPE', 'VERCEL_TEAM_ID', 'REPOSITORY', 'DEPLOYMENT_TARGET', 'PREVIEW_ACCESS_KEY', 'API_ORIGIN', 'BROWSER_ORIGIN'];
  const raw = object(value);
  if (Object.keys(raw).length !== keys.length || keys.some(key => typeof raw[key] !== 'string')) throw new Error('Invalid private deploy configuration.');
  const config = {
    VERCEL_TOKEN: string(raw.VERCEL_TOKEN), VERCEL_PROJECT_ID: string(raw.VERCEL_PROJECT_ID),
    VERCEL_SCOPE: string(raw.VERCEL_SCOPE), VERCEL_TEAM_ID: string(raw.VERCEL_TEAM_ID),
    REPOSITORY: string(raw.REPOSITORY), DEPLOYMENT_TARGET: string(raw.DEPLOYMENT_TARGET),
    PREVIEW_ACCESS_KEY: string(raw.PREVIEW_ACCESS_KEY), API_ORIGIN: string(raw.API_ORIGIN), BROWSER_ORIGIN: string(raw.BROWSER_ORIGIN),
  };
  if (!/^[\x21-\x7e]{16,512}$/.test(config.VERCEL_TOKEN) || config.VERCEL_PROJECT_ID !== projectId || config.VERCEL_SCOPE !== scope
    || !/^team_[A-Za-z0-9]+$/.test(config.VERCEL_TEAM_ID) || config.DEPLOYMENT_TARGET !== 'production'
    || !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(config.REPOSITORY) || config.REPOSITORY.endsWith('.git')
    || !/^[a-f0-9]{64}$/.test(config.PREVIEW_ACCESS_KEY) || config.API_ORIGIN !== 'https://api.lovora.us'
    || config.BROWSER_ORIGIN !== 'https://app.lovora.us') throw new Error('Invalid private deploy configuration.');
  return Object.freeze({ ...config, DEPLOYMENT_TARGET: 'production' });
}
async function json(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > 65536) throw new Error('Unexpected response size.');
  return object(JSON.parse(text));
}
export function vercelDeployment(input: DeployConfig, artifact: VerifiedArtifact, transport: typeof fetch = fetch): Deployment {
  const config = parseDeployConfig(input);
  const identity = Object.freeze({ provider: 'vercel', project: projectId, owner: config.VERCEL_TEAM_ID, target: config.DEPLOYMENT_TARGET });
  const [org, repo] = config.REPOSITORY.slice('https://github.com/'.length).split('/');
  let repositoryId: string | undefined;
  let createdId: string | undefined;
  let triggered = false;
  let operation: DeploymentDiagnostics['operation'] = 'preflight';
  let requestState: DeploymentDiagnostics['request_state'] = 'not_started';
  let category: DeploymentDiagnostics['category'] | undefined;
  let httpStatus: number | null = null;
  let requestSignal: AbortSignal | undefined;
  function begin(next: DeploymentDiagnostics['operation']) {
    operation = next; requestState = 'not_started'; category = undefined; httpStatus = null; requestSignal = undefined;
  }
  const verify = () => verifyArtifact(artifact.root, artifact.digest, { revision: artifact.manifest.source.revision,
    migrationDigest: artifact.manifest.migrationDigest, repository: config.REPOSITORY, release: true });
  const uploads = artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/'));
  if (config.VERCEL_TEAM_ID !== artifactTarget.owner || !uploads.length) throw new Error('Artifact target differs.');
  const request = async (url: string, signal: AbortSignal, init: RequestInit = {}) => {
    requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    requestState = 'in_flight'; category = undefined; httpStatus = null;
    try {
      const response = await transport(url, { ...init, redirect: 'error', signal: requestSignal });
      requestState = 'response_received';
      httpStatus = response.status >= 100 && response.status <= 599 ? response.status : null;
      return response;
    } catch (error) { category = failureCategory(error, requestSignal); throw error; }
  };
  async function provider(path: string, signal: AbortSignal, init: RequestInit = {}, expectsJson = true) {
    const url = new URL(path, 'https://api.vercel.com');
    if (url.origin !== 'https://api.vercel.com') throw new Error('Invalid provider endpoint.');
    url.searchParams.set('teamId', config.VERCEL_TEAM_ID); url.searchParams.set('slug', scope);
    const response = await request(url.href, signal, { ...init, headers: { Authorization: `Bearer ${config.VERCEL_TOKEN}`, 'Content-Type': 'application/json', ...init.headers } });
    if (response.status !== 200 || response.redirected) {
      category = 'http'; await response.body?.cancel(); throw new Error('Provider response not confirmed.');
    }
    if (!expectsJson) { await response.body?.cancel(); return {}; }
    return json(response);
  }
  function state(value: Record<string, unknown>, expectedId: string): DeployState {
    const states: Record<string, DeployState['status']> = { QUEUED: 'queued', INITIALIZING: 'building', BUILDING: 'building', READY: 'ready', ERROR: 'failed', BLOCKED: 'failed', CANCELED: 'canceled' };
    const status = typeof value.readyState === 'string' && Object.hasOwn(states, value.readyState) ? states[value.readyState] : undefined;
    if (typeof value.id !== 'string' || value.id !== expectedId || value.projectId !== projectId
      || value.ownerId !== identity.owner || value.target !== identity.target || !status || value.gitSource) throw new Error('Unverified deployment identity.');
    return { ...identity, id: value.id, revision: artifact.manifest.source.revision, artifactDigest: artifact.digest, status };
  }
  async function inspect(id: string, signal: AbortSignal) {
    begin('inspect');
    if (!/^dpl_[A-Za-z0-9]{1,124}$/.test(id)) throw new Error('Invalid deployment identity.');
    verify();
    const result = state(await provider(`/v13/deployments/${id}`, signal), id);
    if (result.id !== id) throw new Error('Deployment identity changed.');
    if (result.status === 'ready') await attest(id, signal);
    return result;
  }
  async function attest(id: string, signal: AbortSignal) {
    begin('attest');
    verify();
    const url = new URL(`/v6/deployments/${id}/files`, 'https://api.vercel.com');
    url.searchParams.set('teamId', config.VERCEL_TEAM_ID); url.searchParams.set('slug', scope);
    const response = await request(url.href, signal, { headers: { Authorization: `Bearer ${config.VERCEL_TOKEN}` } });
    if (response.status !== 200 || response.redirected) { category = 'http'; throw new Error('Artifact attestation unavailable.'); }
    const text = await response.text();
    if (text.length > 8 * 1024 * 1024) throw new Error('Artifact attestation exceeds bounds.');
    const seen = new Set<string>();
    function walk(entries: unknown, prefix: string) {
      if (!Array.isArray(entries)) throw new Error('Unsupported provider file evidence.');
      for (const raw of entries) {
        const entry = object(raw), name = string(entry.name);
        if (name.includes('/')) throw new Error('Ambiguous provider path.');
        const path = prefix + name; safePath(path);
        if (entry.type === 'directory') { walk(entry.children, path + '/'); continue; }
        const expected = uploads.find(file => file.path === path);
        if (!expected || seen.has(path) || entry.type !== 'file' || entry.uid !== expected.sha1
          || fileMode(entry.mode) !== (0o100000 | expected.mode)) throw new Error('Provider artifact evidence differs.');
        seen.add(path);
      }
    }
    // GETv6 separates uploaded source evidence from provider-generated output.
    const roots: unknown = JSON.parse(text);
    if (!Array.isArray(roots) || roots.length !== 2) throw new Error('Unsupported provider file envelope.');
    const source = object(roots.find(entry => isObject(entry) && entry.name === 'src'));
    const output = object(roots.find(entry => isObject(entry) && entry.name === 'out'));
    if (source.type !== 'directory' || output.type !== 'directory'
      || fileMode(source.mode) !== 0o40555 || fileMode(output.mode) !== 0o40555
      || !Array.isArray(output.children) || output.children.length !== 1) throw new Error('Provider file namespaces differ.');
    const runtime = object(output.children[0]);
    if (runtime.name !== 'index' || runtime.type !== 'lambda' || fileMode(runtime.mode) !== 0o140666
      || (runtime.children !== undefined && (!Array.isArray(runtime.children) || runtime.children.length !== 0))) {
      throw new Error('Provider output differs from the single approved function.');
    }
    // Lambda metadata never replaces the complete source path/uid/full-mode proof.
    walk(source.children, '');
    if (seen.size !== uploads.length) throw new Error('Provider artifact evidence is incomplete.');
  }
  async function domain(signal: AbortSignal) {
    const value = await provider(`/v9/projects/${projectId}/domains/api.lovora.us`, signal);
    if (value?.name !== 'api.lovora.us' || value.projectId !== projectId || value.verified !== true
      || value.redirect || value.gitBranch || value.customEnvironmentId) throw new Error('Unverified project domain.');
  }
  async function binding(expected: DeployState, signal: AbortSignal) {
    await domain(signal);
    const alias = await provider(`/v4/aliases/api.lovora.us?projectId=${projectId}`, signal);
    if (alias?.alias !== 'api.lovora.us' || alias.projectId !== projectId || alias.deploymentId !== expected.id
      || (alias.deployment != null && object(alias.deployment).id !== expected.id) || alias.deletedAt || alias.redirect || alias.microfrontends) throw new Error('Domain does not bind the approved deployment.');
    const actual = await inspect(expected.id, signal);
    if (actual.revision !== expected.revision || actual.status !== 'ready') throw new Error('Deployment changed during verification.');
  }
  return {
    identity,
    artifact: Object.freeze({ revision: artifact.manifest.source.revision, digest: artifact.digest, manifestDigest: artifact.manifest.migrationDigest }),
    diagnostics(error, signal) {
      return { operation, request_state: requestState, category: category ?? failureCategory(error, requestSignal ?? signal),
        http_status: httpStatus, deploy_id: createdId ?? null };
    },
    async preflight(signal) {
      begin('preflight');
      repositoryId = undefined;
      verify();
      const project = await provider(`/v9/projects/${projectId}`, signal);
      const link = object(project.link);
      if (project?.id !== projectId || project.name !== 'esty-admin-api' || project.accountId !== identity.owner
        || project.rootDirectory !== 'apps/api' || project.framework !== 'nestjs' || project.nodeVersion !== '24.x'
        || project.buildCommand !== null || project.installCommand !== null || project.outputDirectory !== null
        || project.commandForIgnoringBuildStep || link?.type !== 'github' || link.org !== org || link.repo !== repo
        || link.productionBranch !== 'main' || typeof link.repoId !== 'number' || !Number.isSafeInteger(link.repoId) || link.repoId <= 0
        || !Array.isArray(link.deployHooks) || link.deployHooks.length !== 0) throw new Error('Project settings differ from approval.');
      await domain(signal);
      repositoryId = String(link.repoId);
    },
    async trigger(revision, signal, checkpoints) {
      begin('upload');
      verify();
      if (!repositoryId || triggered || revision !== artifact.manifest.source.revision
        || typeof checkpoints?.beforeCreate !== 'function' || typeof checkpoints?.acknowledged !== 'function') throw new Error('Exact-artifact durable release required.');
      triggered = true;
      for (const file of uploads) {
        signal.throwIfAborted();
        const bytes = readArtifactFile(artifact.root, file.path, file);
        await provider('/v2/files', signal, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream',
          'Content-Length': String(file.size), 'x-now-digest': file.sha1, 'x-now-size': String(file.size) },
          body: new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength) }, false);
      }
      verify(); signal.throwIfAborted();
      await checkpoints.beforeCreate();
      verify(); signal.throwIfAborted();
      begin('create');
      const response = await provider('/v13/deployments?prebuilt=1', signal, { method: 'POST', body: JSON.stringify({
        name: 'esty-admin-api', project: projectId, target: config.DEPLOYMENT_TARGET,
        files: uploads.map(file => ({ file: file.path, sha: file.sha1, size: file.size, mode: 0o100000 | file.mode })),
      }) });
      const id = string(response.id);
      if (!/^dpl_[A-Za-z0-9]{1,124}$/.test(id)) throw new Error('Invalid deployment identity.');
      createdId = id;
      await checkpoints.acknowledged(id);
      signal.throwIfAborted();
      return inspect(createdId, signal);
    },
    inspect,
    async smoke(expected, signal) {
      begin('smoke');
      if ((['provider', 'project', 'owner', 'target'] as const).some(key => expected[key] !== identity[key])
        || expected.artifactDigest !== artifact.digest || expected.status !== 'ready') throw new Error('Unverified smoke identity.');
      await binding(expected, signal);
      begin('smoke');
      const authorization = { Authorization: `Bearer ${config.PREVIEW_ACCESS_KEY}` };
      for (const [path, expectedBody] of [
        ['/health/live', { status: 'ok' }], ['/health/ready', { status: 'ready', database: 'up', migrations: 'current' }],
      ] as const) {
        const response = await request(config.API_ORIGIN + path, signal, { headers: authorization });
        const body = await json(response);
        if (response.status !== 200 || response.redirected || !body || Object.keys(body).length !== Object.keys(expectedBody).length
          || Object.entries(expectedBody).some(([key, value]) => body[key] !== value)) throw new Error('Hosted application smoke failed.');
      }
      for (const key of [undefined, 'malformed', '0'.repeat(64) === config.PREVIEW_ACCESS_KEY ? '1'.repeat(64) : '0'.repeat(64)]) {
        const response = await request(`${config.API_ORIGIN}/health/ready`, signal, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
        const body = await json(response);
        if (response.status !== 401 || response.redirected || body?.status !== 'unauthorized' || Object.keys(body).length !== 1) throw new Error('Hosted access check failed.');
      }
      const unknown = await request(`${config.API_ORIGIN}/__release_unknown_route`, signal, { headers: authorization });
      await unknown.body?.cancel();
      if (unknown.status !== 404 || unknown.redirected) throw new Error('Hosted route check failed.');
      for (const origin of [config.BROWSER_ORIGIN, 'https://untrusted.example']) {
        const response = await request(`${config.API_ORIGIN}/health/ready`, signal, { method: 'OPTIONS', headers: {
          Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization',
        } });
        await response.body?.cancel();
        if (response.redirected || response.status !== (origin === config.BROWSER_ORIGIN ? 204 : 401)
          || (origin === config.BROWSER_ORIGIN && response.headers.get('access-control-allow-origin') !== origin)) throw new Error('Hosted origin check failed.');
      }
      await binding(expected, signal);
    },
  };
}
