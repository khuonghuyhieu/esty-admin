import { artifactTarget, canonical, sha256 } from './artifact.js';
import { responseBytes } from './ci-tools.js';
import { runtimeInputs } from './activation-inputs.js';
import type { RuntimePhase } from './activation-inputs.js';
import type { ActivationPacket } from './activation-journal.js';
import { activationRuntimeKeys } from '../src/config/activation-config.js';

export class ActivationConfigurationError extends Error {
  constructor(readonly outcome: 'not_started' | 'unknown') {
    super('Activation configuration is unconfirmed; no create or automatic write replay is permitted.');
  }
}
export interface ActivationConfigurationReceipt {
  version: 2; runId: string; phase: 'bridge-config' | 'app-config'; projectId: string; scopeId: string;
  packetDigest: string; revision: string; tree: string; sourceDigest: string; artifactDigest: string;
  configDigest: string; metadataDigest: string; count: number; valueProof: 'pending-candidate-runtime';
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid configuration response.');
  return value as Record<string, unknown>;
}
const controlled = new Set([...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST']);
const privileged = /^(?:MIGRATION_|APP_OPERATOR_|APP_ROLES_|ACTIVATION_|GITHUB_TOKEN$|VERCEL_(?:TOKEN|API_TOKEN|CONFIGURATION_TOKEN)$|APP_AUTH_ADMIN_KEY$)/;
// Provider integrations may inject credential aliases outside our controlled runtime inputs.
// Their presence is a stop regardless of value; never decrypt, delete or silently retain them.
const privilegedCredentialNames = new Set([
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_JWT_SECRET', 'SUPABASE_AUTH_ADMIN_KEY', 'SUPABASE_ADMIN_KEY', 'SUPABASE_ADMIN_TOKEN',
  'SUPABASE_DB_PASSWORD', 'SUPABASE_DATABASE_PASSWORD', 'SUPABASE_DB_URL', 'SUPABASE_DATABASE_URL',
  'POSTGRES_PASSWORD', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL',
  'PGPASSWORD', 'PGPASSFILE', 'DATABASE_PASSWORD', 'DB_PASSWORD', 'DB_URL', 'DIRECT_URL',
  'DIRECT_DATABASE_URL', 'DATABASE_DIRECT_URL', 'DATABASE_ADMIN_URL',
  'AUTH_ADMIN_KEY', 'AUTH_ADMIN_TOKEN', 'ADMIN_KEY', 'ADMIN_TOKEN', 'SERVICE_ROLE_KEY', 'JWT_SECRET',
]);
export type AppMetadataIssue = 'transport' | 'http' | 'body' | 'json' | 'list-incomplete' | 'privileged-name'
  | 'controlled-key-mismatch' | 'target-binding-mismatch' | 'secret-type-mismatch';
export interface AppMetadataDiagnostic {
  issue: AppMetadataIssue; httpStatus: number | null;
  missingKeys: readonly string[]; unexpectedKeys: readonly string[];
}
export class AppMetadataError extends Error {
  readonly diagnostic: Readonly<AppMetadataDiagnostic>;
  constructor(issue: AppMetadataIssue, httpStatus: number | null = null,
    missingKeys: readonly string[] = [], unexpectedKeys: readonly string[] = []) {
    super('Application metadata observation refused.');
    const names = (keys: readonly string[]) => Object.freeze([...new Set(keys.filter(key => controlled.has(key)))].sort());
    this.diagnostic = Object.freeze({ issue,
      httpStatus: Number.isInteger(httpStatus) && httpStatus! >= 100 && httpStatus! <= 599 ? httpStatus : null,
      missingKeys: names(missingKeys), unexpectedKeys: names(unexpectedKeys) });
  }
}
function metadataObject(value: unknown): Record<string, unknown> {
  try { return object(value); } catch { throw new AppMetadataError('list-incomplete'); }
}
interface EnvironmentBinding {
  id: string; key: string; type: string; visibility: 'config' | 'secret'; target: ['production'];
}
function environmentEntry(value: unknown, secret: boolean): EnvironmentBinding {
  const row = metadataObject(value);
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
    || typeof row.key !== 'string' || !Array.isArray(row.target)
    || canonical(row.target) !== canonical(['production'])
    || row.configurationId || row.contentHint || row.internalContentHint || row.edgeConfigId || row.edgeConfigTokenId
    || row.gitBranch || row.sunsetSecretId || row.system
    || (row.customEnvironmentIds !== undefined && canonical(row.customEnvironmentIds) !== '[]')) throw new AppMetadataError('target-binding-mismatch');
  if (!['plain', 'encrypted', 'sensitive'].includes(String(row.type))) throw new AppMetadataError('secret-type-mismatch');
  const visibility = row.visibility === undefined ? (row.type === 'sensitive' ? 'secret' : 'config') : row.visibility;
  if (!['config', 'secret'].includes(String(visibility)) || (secret && visibility !== 'secret')) {
    throw new AppMetadataError('secret-type-mismatch');
  }
  return { id: row.id, key: row.key, type: String(row.type), visibility: visibility as 'config' | 'secret', target: ['production'] };
}
function metadata(value: unknown, expected: Readonly<Record<string, string>>, complete: boolean, secret: boolean): Map<string, EnvironmentBinding> {
  const response = metadataObject(value);
  if (!Array.isArray(response.envs) || response.envs.length > 256
    || (response.hiddenProductionEnvCount !== undefined && response.hiddenProductionEnvCount !== 0)
    || (response.pagination != null && metadataObject(response.pagination).next != null)) throw new AppMetadataError('list-incomplete');
  const result = new Map<string, EnvironmentBinding>(), ids = new Set<string>();
  for (const raw of response.envs) {
    const row = metadataObject(raw);
    if (typeof row.key !== 'string') throw new AppMetadataError('list-incomplete');
    // A runtime privilege or ambiguous controlled key is a stop, not permission to delete or repair it.
    if (privileged.test(row.key) || privilegedCredentialNames.has(row.key)) throw new AppMetadataError('privileged-name');
    if (!controlled.has(row.key)) continue;
    const entry = environmentEntry(row, secret);
    if (!Object.hasOwn(expected, row.key) || result.has(row.key) || ids.has(entry.id)) {
      throw new AppMetadataError('controlled-key-mismatch', null, [], [row.key]);
    }
    result.set(row.key, entry); ids.add(entry.id);
  }
  if (complete && result.size !== Object.keys(expected).length) {
    throw new AppMetadataError('controlled-key-mismatch', null, Object.keys(expected).filter(key => !result.has(key)));
  }
  return result;
}

export interface CurrentAppMetadata { metadataDigest: string; keyCount: number }
export function currentAppMetadata(value: unknown, expected: Readonly<Record<string, string>>): CurrentAppMetadata {
  try {
    const entries = metadata(value, expected, true, true);
    if ([...entries.values()].some(entry => entry.type !== 'sensitive')) throw new AppMetadataError('secret-type-mismatch');
    return { metadataDigest: sha256(canonical(Object.fromEntries(entries))), keyCount: entries.size };
  } catch (error) {
    if (error instanceof AppMetadataError) throw error;
    throw new AppMetadataError('list-incomplete');
  }
}
async function readAppMetadata<T>(value: unknown, packet: ActivationPacket, token: string,
  signal: AbortSignal, transport: typeof fetch, validate: (body: unknown, expected: Readonly<Record<string, string>>) => T): Promise<T> {
  if (packet.projectId !== artifactTarget.project || packet.scopeId !== artifactTarget.owner
    || !/^[\x21-\x7e]{16,512}$/.test(token)) throw new Error('Invalid metadata authority.');
  const inputs = runtimeInputs(value, packet, 'app');
  const url = new URL(`/v10/projects/${packet.projectId}/env`, 'https://api.vercel.com');
  url.searchParams.set('decrypt', 'false'); url.searchParams.set('teamId', packet.scopeId);
  url.searchParams.set('slug', artifactTarget.scope);
  let response: Response;
  try {
    signal.throwIfAborted();
    response = await transport(url.href, { method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  } catch { throw new AppMetadataError('transport'); }
  if (response.status !== 200 || response.redirected) {
    // Cancellation failure must not replace the first observed HTTP failure.
    try { await response.body?.cancel(); } catch { /* Only the numeric status is retained. */ }
    throw new AppMetadataError('http', response.status);
  }
  let bytes: Buffer;
  try { bytes = await responseBytes(response, 1024 * 1024); }
  catch { throw new AppMetadataError('body', response.status); }
  let body: unknown;
  try { body = JSON.parse(bytes.toString('utf8')); }
  catch { throw new AppMetadataError('json', response.status); }
  // Project only approved metadata. The provider may include value fields even with decrypt=false.
  try { return validate(body, { ...inputs, APP_ACTIVATION_CONFIG_DIGEST: packet.appConfigDigest }); }
  catch (error) {
    if (error instanceof AppMetadataError) {
      const { issue, missingKeys, unexpectedKeys } = error.diagnostic;
      throw new AppMetadataError(issue, response.status, missingKeys, unexpectedKeys);
    }
    throw new AppMetadataError('list-incomplete', response.status);
  }
}
export function observeAppMetadata(value: unknown, packet: ActivationPacket, token: string,
  signal: AbortSignal, transport: typeof fetch = fetch): Promise<CurrentAppMetadata> {
  return readAppMetadata(value, packet, token, signal, transport, currentAppMetadata);
}

export const appMissingFiveKeys = ['APP_AUTH_API_KEY', 'APP_AUTH_URL', 'APP_EMAIL_ENABLED',
  'APP_RETENTION_POLICY_ID', 'APP_WORKSPACE_ID'] as const;
type MissingFiveKey = typeof appMissingFiveKeys[number];
export interface MissingFiveMetadata extends CurrentAppMetadata {
  bindings: Readonly<Record<string, EnvironmentBinding>>;
}
export interface MissingFiveAck {
  outcome: 'acknowledged' | 'unknown'; httpStatus: number | null;
  issue: 'none' | 'transport' | 'http' | 'body' | 'json' | 'partial-ack' | 'invalid-ack';
  keys: Record<MissingFiveKey, { status: 'acknowledged' | 'failed' | 'unknown'; ids: string[] }>;
}
export function observeMissingFiveMetadata(value: unknown, packet: ActivationPacket, token: string,
  signal: AbortSignal, transport: typeof fetch = fetch): Promise<MissingFiveMetadata> {
  return readAppMetadata(value, packet, token, signal, transport, (body, expected) => {
    const entries = metadata(body, expected, false, true);
    if ([...entries.values()].some(entry => entry.type !== 'sensitive')) throw new AppMetadataError('secret-type-mismatch');
    const missing = Object.keys(expected).filter(key => !entries.has(key)).sort();
    if (canonical(missing) !== canonical(appMissingFiveKeys)) {
      throw new AppMetadataError('controlled-key-mismatch', null, missing,
        appMissingFiveKeys.filter(key => entries.has(key)));
    }
    const bindings = Object.fromEntries(entries);
    return { bindings, metadataDigest: sha256(canonical(bindings)), keyCount: entries.size };
  });
}
export async function postMissingFive(value: unknown, packet: ActivationPacket, token: string,
  signal: AbortSignal, transport: typeof fetch = fetch): Promise<MissingFiveAck> {
  if (packet.projectId !== artifactTarget.project || packet.scopeId !== artifactTarget.owner
    || !/^[\x21-\x7e]{16,512}$/.test(token)) throw new Error('Invalid correction authority.');
  const inputs = runtimeInputs(value, packet, 'app');
  const result: MissingFiveAck = { outcome: 'unknown', httpStatus: null, issue: 'transport',
    keys: Object.fromEntries(appMissingFiveKeys.map((key): [MissingFiveKey, MissingFiveAck['keys'][MissingFiveKey]] =>
      [key, { status: 'unknown', ids: [] }])) as MissingFiveAck['keys'] };
  const url = new URL(`/v10/projects/${packet.projectId}/env`, 'https://api.vercel.com');
  // The provider's documented create-only boundary is intentional: never send upsert.
  url.searchParams.set('teamId', packet.scopeId); url.searchParams.set('slug', artifactTarget.scope);
  let response: Response;
  try {
    signal.throwIfAborted();
    response = await transport(url.href, { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(appMissingFiveKeys.map(key => ({ key, value: inputs[key], type: 'sensitive', target: ['production'] }))),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  } catch { return result; }
  result.httpStatus = response.status;
  const httpOk = response.status === 201 && !response.redirected;
  let bytes: Buffer;
  try { bytes = await responseBytes(response, 1024 * 1024); }
  catch { result.issue = httpOk ? 'body' : 'http'; return result; }
  let body: Record<string, unknown>;
  try { body = object(JSON.parse(bytes.toString('utf8'))); }
  catch { result.issue = httpOk ? 'json' : 'http'; return result; }
  const created = Array.isArray(body.created) ? body.created : [];
  const failed = Array.isArray(body.failed) ? body.failed : [];
  const seen = new Map<string, number>(), rejected = new Set<string>(), ids = new Map<string, MissingFiveKey>();
  let valid = Array.isArray(body.created) && Array.isArray(body.failed);
  const keyOf = (key: unknown): MissingFiveKey | undefined =>
    appMissingFiveKeys.find(candidate => candidate === key);
  const retainId = (key: MissingFiveKey, id: unknown) => {
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
      && !result.keys[key].ids.includes(id)) result.keys[key].ids.push(id);
  };
  for (const raw of created) {
    try {
      const row = object(raw), key = keyOf(row.key);
      if (!key) { valid = false; continue; }
      retainId(key, row.id); seen.set(key, (seen.get(key) ?? 0) + 1);
      const entry = environmentEntry(row, true);
      const duplicate = ids.get(entry.id);
      if (duplicate) { result.keys[duplicate].status = 'unknown'; valid = false; continue; }
      if (entry.type !== 'sensitive') { valid = false; continue; }
      ids.set(entry.id, key);
      if (httpOk) result.keys[key].status = 'acknowledged';
    } catch { valid = false; }
  }
  for (const raw of failed) {
    try {
      const row = object(object(raw).error), key = keyOf(row.envVarKey ?? row.key);
      if (!key) { valid = false; continue; }
      rejected.add(key); retainId(key, row.envVarId);
    } catch { valid = false; }
  }
  // Error messages and provider value fields are never copied, logged or hashed.
  for (const key of appMissingFiveKeys) {
    if ((seen.get(key) ?? 0) > 1 || (seen.has(key) && rejected.has(key))) {
      result.keys[key].status = 'unknown'; valid = false;
    } else if (rejected.has(key)) result.keys[key].status = 'failed';
  }
  const complete = valid && created.length === 5 && failed.length === 0
    && appMissingFiveKeys.every(key => result.keys[key].status === 'acknowledged' && result.keys[key].ids.length === 1);
  result.outcome = httpOk && complete ? 'acknowledged' : 'unknown';
  result.issue = !httpOk ? 'http' : !valid ? 'invalid-ack' : !complete ? 'partial-ack' : 'none';
  return result;
}
export function verifyMissingFiveMetadata(value: unknown, packet: ActivationPacket, token: string,
  before: MissingFiveMetadata, ack: MissingFiveAck, signal: AbortSignal,
  transport: typeof fetch = fetch): Promise<CurrentAppMetadata> {
  if (ack.outcome !== 'acknowledged') throw new Error('Correction acknowledgement is incomplete.');
  return readAppMetadata(value, packet, token, signal, transport, (body, expected) => {
    const observed = currentAppMetadata(body, expected), entries = metadata(body, expected, true, true);
    for (const [key, entry] of entries) {
      const correction = appMissingFiveKeys.find(candidate => candidate === key);
      if (correction ? ack.keys[correction].ids.length !== 1 || entry.id !== ack.keys[correction].ids[0]
        : canonical(entry) !== canonical(before.bindings[key])) throw new AppMetadataError('target-binding-mismatch');
    }
    return observed;
  });
}
export async function configureActivation(value: unknown, packet: ActivationPacket, phase: RuntimePhase, token: string,
  signal: AbortSignal, transport: typeof fetch = fetch): Promise<ActivationConfigurationReceipt> {
  let mutationStarted = false;
  try {
    if (!/^[\x21-\x7e]{16,512}$/.test(token) || packet.projectId !== artifactTarget.project || packet.scopeId !== artifactTarget.owner) {
      throw new Error('Invalid configuration authority.');
    }
    const inputs = runtimeInputs(value, packet, phase);
    const configDigest = phase === 'bridge' ? packet.bridgeConfigDigest : packet.appConfigDigest;
    const expected: Record<string, string> = { ...inputs, APP_ACTIVATION_CONFIG_DIGEST: configDigest };
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
    async function request(path: string, init: RequestInit = {}): Promise<unknown> {
      deadline.throwIfAborted();
      const url = new URL(path, 'https://api.vercel.com');
      if (url.origin !== 'https://api.vercel.com') throw new Error('Invalid configuration origin.');
      url.searchParams.set('teamId', packet.scopeId); url.searchParams.set('slug', artifactTarget.scope);
      const response = await transport(url.href, { ...init, redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]) });
      if ((response.status !== 200 && !(init.method === 'POST' && response.status === 201)) || response.redirected) {
        await response.body?.cancel(); throw new Error('Unconfirmed configuration response.');
      }
      return JSON.parse((await responseBytes(response, 1024 * 1024)).toString('utf8'));
    }
    const base = `/v10/projects/${packet.projectId}/env`;
    const before = metadata(await request(`${base}?decrypt=false`), expected, false, false);
    deadline.throwIfAborted();
    mutationStarted = true;
    const result = object(await request(`${base}?upsert=true`, { method: 'POST', body: JSON.stringify(
      Object.entries(expected).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => ({ key, value: item, type: 'sensitive', target: ['production'] }))) }));
    if (!Array.isArray(result.failed) || result.failed.length !== 0
      || !Array.isArray(result.created) || result.created.length !== Object.keys(expected).length) {
      throw new Error('Partial configuration acknowledgement.');
    }
    const acknowledged = metadata({ envs: result.created }, expected, true, true);
    for (const [key, entry] of before) if (acknowledged.get(key)?.id !== entry.id) throw new Error('Existing configuration identity changed.');
    const entries = metadata(await request(`${base}?decrypt=false`), expected, true, true);
    const acknowledgedMetadata = canonical(Object.fromEntries(acknowledged));
    if (canonical(Object.fromEntries(entries)) !== acknowledgedMetadata) throw new Error('Configuration metadata changed after acknowledgement.');
    deadline.throwIfAborted();
    // This proves the write acknowledgement and metadata only. Saved Secret values cannot be read back.
    // Exact values must still be attested by the held, file-verified candidate's computed runtime digest.
    return { version: 2, runId: packet.runId, phase: phase === 'bridge' ? 'bridge-config' : 'app-config',
      projectId: packet.projectId, scopeId: packet.scopeId, packetDigest: sha256(canonical(packet)),
      revision: packet.revision, tree: packet.tree, sourceDigest: packet.sourceDigest, artifactDigest: packet.artifactDigest,
      configDigest, metadataDigest: sha256(acknowledgedMetadata), count: entries.size, valueProof: 'pending-candidate-runtime' };
  } catch { throw new ActivationConfigurationError(mutationStarted ? 'unknown' : 'not_started'); }
}
