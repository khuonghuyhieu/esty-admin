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
interface EnvironmentBinding {
  id: string; key: string; type: string; visibility: 'config' | 'secret'; target: ['production'];
}
function environmentEntry(value: unknown, secret: boolean): EnvironmentBinding {
  const row = object(value);
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
    || typeof row.key !== 'string' || !Array.isArray(row.target)
    || canonical(row.target) !== canonical(['production']) || !['plain', 'encrypted', 'sensitive'].includes(String(row.type))
    || row.configurationId || row.contentHint || row.internalContentHint || row.edgeConfigId || row.edgeConfigTokenId
    || row.gitBranch || row.sunsetSecretId || row.system
    || (row.customEnvironmentIds !== undefined && canonical(row.customEnvironmentIds) !== '[]')) throw new Error('Ambiguous configuration binding.');
  const visibility = row.visibility === undefined ? (row.type === 'sensitive' ? 'secret' : 'config') : row.visibility;
  if (!['config', 'secret'].includes(String(visibility)) || (secret && visibility !== 'secret')) {
    throw new Error('Configuration is not a Secret.');
  }
  return { id: row.id, key: row.key, type: String(row.type), visibility: visibility as 'config' | 'secret', target: ['production'] };
}
function metadata(value: unknown, expected: Readonly<Record<string, string>>, complete: boolean, secret: boolean): Map<string, EnvironmentBinding> {
  const response = object(value);
  if (!Array.isArray(response.envs) || response.envs.length > 256
    || (response.hiddenProductionEnvCount !== undefined && response.hiddenProductionEnvCount !== 0)
    || (response.pagination != null && object(response.pagination).next != null)) throw new Error('Incomplete configuration metadata.');
  const result = new Map<string, EnvironmentBinding>(), ids = new Set<string>();
  for (const raw of response.envs) {
    const row = object(raw);
    if (typeof row.key !== 'string') throw new Error('Invalid configuration key.');
    // A runtime privilege or ambiguous controlled key is a stop, not permission to delete or repair it.
    if (privileged.test(row.key) || privilegedCredentialNames.has(row.key)) throw new Error('Privileged project runtime input.');
    if (!controlled.has(row.key)) continue;
    const entry = environmentEntry(row, secret);
    if (!Object.hasOwn(expected, row.key) || result.has(row.key) || ids.has(entry.id)) throw new Error('Unexpected configuration input.');
    result.set(row.key, entry); ids.add(entry.id);
  }
  if (complete && result.size !== Object.keys(expected).length) throw new Error('Configuration inputs are missing.');
  return result;
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
