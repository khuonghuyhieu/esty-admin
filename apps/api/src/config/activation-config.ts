import { createHash } from 'node:crypto';

export const activationBaseKeys = Object.freeze(['API_RUNTIME', 'DATABASE_URL', 'BROWSER_ORIGIN', 'PREVIEW_ACCESS_KEY',
  'APP_SCHEMA_MODE', 'APP_FOUNDATION_ENABLED', 'SUPABASE_PROJECT_REF', 'SUPABASE_SESSION_HOST',
  'SUPABASE_DATABASE_NAME', 'SUPABASE_DATABASE_USER', 'DATABASE_CA_PEM']);
export const activationAppKeys = Object.freeze(['APP_WORKSPACE_ID', 'APP_AUTH_URL', 'APP_AUTH_API_KEY',
  'APP_EMAIL_ENABLED', 'APP_RETENTION_POLICY_ID']);
export const etsyRuntimeKeys = Object.freeze(['ETSY_ENABLED', 'ETSY_CLIENT_ID', 'ETSY_SHARED_SECRET',
  'ETSY_CALLBACK_URL', 'ETSY_RETURN_ORIGIN', 'ETSY_INVITATION_ORIGIN', 'ETSY_INVITATION_TTL_SECONDS',
  'ETSY_RETENTION_SECONDS', 'ETSY_TOKEN_ACTIVE_KEY_ID', 'ETSY_TOKEN_KEYRING']);
export const activationRuntimeKeys = Object.freeze([...activationBaseKeys, ...activationAppKeys, ...etsyRuntimeKeys].sort());

// The expected digest and provider-injected process metadata are deliberately excluded.
// This is the same canonical string-map encoding used by the approved private phase packet.
export function runtimeConfigDigest(env: NodeJS.ProcessEnv): string {
  const hash = createHash('sha256');
  hash.update('{');
  let first = true;
  for (const key of activationRuntimeKeys) {
    const value = env[key];
    if (value === undefined) continue;
    if (!first) hash.update(',');
    hash.update(JSON.stringify(key)); hash.update(':'); hash.update(JSON.stringify(value));
    first = false;
  }
  return hash.update('}').digest('hex');
}
