import { canonical, sha256 } from './artifact.js';
import type { ActivationPacket } from './activation-journal.js';
import { parseConfig, parseMigrationConfig, parseAppOperatorConfig } from '../src/config/config.js';
import { parseAppRoleInputs } from './app-roles.js';
import { bootstrapIdentity } from '../src/app-foundation/application/service.js';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };
import { activationBaseKeys, activationAppKeys, activationRuntimeKeys } from '../src/config/activation-config.js';

export type RuntimePhase = 'bridge' | 'app';
const metadata = ['SUPABASE_PROJECT_REF', 'SUPABASE_SESSION_HOST', 'SUPABASE_DATABASE_NAME', 'SUPABASE_DATABASE_USER', 'DATABASE_CA_PEM'];
const runtimeKeys = activationBaseKeys;
const appKeys = activationAppKeys;
const migrationKeys = ['MIGRATION_TARGET', 'MIGRATION_DATABASE_URL', 'MIGRATION_CONFIRM_PROJECT_REF', 'DATABASE_URL', ...metadata];
const roleKeys = [...migrationKeys, 'APP_ROLES_APPROVAL_ID', 'APP_ROLES_CONFIRM_TARGET', 'APP_ROLES_RUNTIME_DATABASE_URL', 'APP_ROLES_OPERATOR_DATABASE_URL'];
const bootstrapKeys = [...metadata, ...appKeys, 'BROWSER_ORIGIN', 'APP_OPERATOR_TARGET', 'APP_OPERATOR_DATABASE_URL', 'APP_OPERATOR_AUTH_KEY',
  'APP_OPERATOR_CONFIRM_WORKSPACE', 'APP_OPERATOR_APPROVAL_ID', 'APP_OPERATOR_USER_ID', 'APP_OPERATOR_PROFILE_NAME',
  'APP_OPERATOR_WORKSPACE_NAME', 'APP_OPERATOR_CONFIRM_PROJECT_REF'];
export type PrivateInputs = Readonly<Record<string, string>>;
function refuse(): never { throw new Error('Activation phase inputs are invalid or cross a credential boundary.'); }
function strings(value: unknown, allowed: readonly string[]): PrivateInputs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.includes(key) || typeof item !== 'string' || item.length > 16384 || item.includes('\0')) refuse();
    output[key] = item;
  }
  if (Buffer.byteLength(canonical(output)) > 65536) refuse();
  return Object.freeze(output);
}
function bound(value: PrivateInputs, expected: string): void {
  if (sha256(canonical(value)) !== expected) refuse();
}
export function runtimeInputs(value: unknown, packet: ActivationPacket, phase: RuntimePhase): PrivateInputs {
  if (phase !== 'bridge' && phase !== 'app') refuse();
  const inputs = strings(value, phase === 'bridge' ? runtimeKeys : [...runtimeKeys, ...appKeys]);
  bound(inputs, phase === 'bridge' ? packet.bridgeConfigDigest : packet.appConfigDigest);
  if (inputs.API_RUNTIME !== 'vercel' || inputs.BROWSER_ORIGIN !== 'https://app.lovora.us'
    || inputs.APP_SCHEMA_MODE !== (phase === 'bridge' ? 'activation-bridge' : 'strict')
    || inputs.APP_FOUNDATION_ENABLED !== (phase === 'bridge' ? 'false' : 'true')
    || (phase === 'app' && inputs.APP_EMAIL_ENABLED !== 'false')) refuse();
  const parsed = parseConfig({ ...inputs, VERCEL: '1' });
  if (phase === 'app' && !parsed.appFoundation) refuse();
  return inputs;
}
export function roleInputs(value: unknown, packet: ActivationPacket): PrivateInputs {
  const inputs = strings(value, roleKeys); bound(inputs, packet.roleInputDigest);
  if (parseAppRoleInputs(inputs).target !== packet.target) refuse();
  return inputs;
}
export function migrationInputs(value: unknown, packet: ActivationPacket): PrivateInputs {
  const inputs = strings(value, migrationKeys); bound(inputs, packet.migrationInputDigest);
  parseMigrationConfig(inputs);
  if (inputs.MIGRATION_TARGET === 'supabase') for (const [key, expected] of Object.entries(approvedTarget)) {
    if (key.startsWith('SUPABASE_') && inputs[key] !== expected) refuse();
  }
  if ((inputs.MIGRATION_TARGET === 'supabase' ? `supabase:${inputs.SUPABASE_PROJECT_REF}` : 'local') !== packet.target) refuse();
  return inputs;
}
export function bootstrapInputs(value: unknown, packet: ActivationPacket): PrivateInputs {
  const inputs = strings(value, bootstrapKeys); bound(inputs, packet.bootstrapInputDigest);
  const parsed = parseAppOperatorConfig(inputs);
  if ((inputs.APP_OPERATOR_TARGET === 'supabase' ? `supabase:${inputs.SUPABASE_PROJECT_REF}` : 'local') !== packet.target
    || parsed.appFoundation.retentionPolicyId !== inputs.APP_RETENTION_POLICY_ID) refuse();
  const identity = bootstrapIdentity(parsed.appFoundation.workspaceId, { userId: inputs.APP_OPERATOR_USER_ID ?? '',
    profileName: inputs.APP_OPERATOR_PROFILE_NAME ?? '', workspaceName: inputs.APP_OPERATOR_WORKSPACE_NAME ?? '', approvalId: parsed.approvalId });
  if (sha256(canonical({ fingerprint: identity.fingerprint, approvalId: identity.approvalId,
    retentionPolicyId: parsed.appFoundation.retentionPolicyId ?? null })) !== packet.bootstrapBindingDigest) refuse();
  return inputs;
}
const credentialFields = ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'VERCEL_API_TOKEN', 'VERCEL_CONFIGURATION_TOKEN',
  'BE_PREVIEW_ACCESS_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET',
  'ACTIVATION_BRIDGE_INPUTS', 'ACTIVATION_APP_INPUTS', 'ACTIVATION_ROLE_INPUTS', 'ACTIVATION_MIGRATION_INPUTS',
  'ACTIVATION_BOOTSTRAP_INPUTS', 'ACTIVATION_FE_RECEIPT'];
const phaseCredentials = {
  provider: ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'BE_PREVIEW_ACCESS_KEY'],
  bridge: ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'BE_PREVIEW_ACCESS_KEY'],
  app: ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'BE_PREVIEW_ACCESS_KEY'],
  'bridge-config': ['VERCEL_CONFIGURATION_TOKEN', 'ACTIVATION_BRIDGE_INPUTS'],
  'app-config': ['VERCEL_CONFIGURATION_TOKEN', 'ACTIVATION_APP_INPUTS'],
  roles: ['ACTIVATION_ROLE_INPUTS'],
  migration: ['ACTIVATION_MIGRATION_INPUTS'],
  bootstrap: ['ACTIVATION_BOOTSTRAP_INPUTS'],
  fe: ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'BE_PREVIEW_ACCESS_KEY', 'ACTIVATION_FE_RECEIPT'],
} as const;
export function phaseInputEnvironment(env: NodeJS.ProcessEnv, phase: keyof typeof phaseCredentials): Record<string, string> {
  if (!Object.hasOwn(phaseCredentials, phase)) refuse();
  const allowed: readonly string[] = phaseCredentials[phase];
  for (const field of credentialFields) if (env[field] !== undefined && !allowed.includes(field)) refuse();
  for (const key of Object.keys(env)) {
    if (env[key] !== undefined && (activationRuntimeKeys.includes(key) || key === 'APP_ACTIVATION_CONFIG_DIGEST'
      || key.startsWith('MIGRATION_') || key.startsWith('APP_OPERATOR_') || key.startsWith('APP_ROLES_') || key.startsWith('APP_AUTH_')
      || (key.startsWith('ACTIVATION_') && key.endsWith('_INPUTS') && !allowed.includes(key)))) refuse();
  }
  const output: Record<string, string> = {};
  for (const field of allowed) if (env[field] !== undefined) output[field] = env[field]!;
  return output;
}
export function decodePhaseInput(value: string | undefined): unknown {
  if (!value || Buffer.byteLength(value) > 65536) refuse();
  try { return JSON.parse(value); } catch { return refuse(); }
}
