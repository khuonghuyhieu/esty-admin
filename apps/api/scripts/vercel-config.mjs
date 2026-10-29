import { X509Certificate } from 'node:crypto';
import { hostedTarget } from './hosted-config.mjs';

const tuple = Object.fromEntries(Object.entries(hostedTarget).filter(([key]) => key.startsWith('SUPABASE_')));
const fail = () => { throw new Error('Private configuration differs from the approved target or context.'); };
function validate(value, allowed, urlKey) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some(key => !allowed.includes(key) || typeof value[key] !== 'string' || !value[key].isWellFormed())) fail();
  for (const [key, expected] of Object.entries(tuple)) if (value[key] !== expected) fail();
  const raw = value[urlKey];
  let url, user, password, database;
  try {
    if (!raw || /\s/.test(raw) || raw.includes('?') || raw.includes('#')) fail();
    url = new URL(raw);
    user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); database = decodeURIComponent(url.pathname.slice(1));
  } catch { fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== tuple.SUPABASE_SESSION_HOST
    || url.port !== '5432' || user !== tuple.SUPABASE_DATABASE_USER || database !== tuple.SUPABASE_DATABASE_NAME
    || !password || /\p{Cc}/u.test(password) || !password.isWellFormed()) fail();
  if (value.DATABASE_CA_PEM !== undefined) {
    try {
      if (!/^-----BEGIN CERTIFICATE-----\r?\n/.test(value.DATABASE_CA_PEM)
        || !/\r?\n-----END CERTIFICATE-----\s*$/.test(value.DATABASE_CA_PEM)
        || !new X509Certificate(value.DATABASE_CA_PEM).ca) fail();
    } catch { fail(); }
  }
  return { ...tuple, [urlKey]: raw, ...(value.DATABASE_CA_PEM === undefined ? {} : { DATABASE_CA_PEM: value.DATABASE_CA_PEM }) };
}
export function vercelConfiguration(runtime, operator) {
  const common = [...Object.keys(tuple), 'DATABASE_CA_PEM'];
  const convertedRuntime = validate(runtime, [...common, 'DATABASE_URL', 'API_RUNTIME', 'RENDER', 'VERCEL', 'PORT', 'PREVIEW_ACCESS_KEY', 'BROWSER_ORIGIN'], 'DATABASE_URL');
  const convertedOperator = validate(operator, [...common, 'MIGRATION_DATABASE_URL', 'MIGRATION_TARGET', 'MIGRATION_CONFIRM_PROJECT_REF'], 'MIGRATION_DATABASE_URL');
  if (runtime.API_RUNTIME !== undefined && !['render', 'vercel'].includes(runtime.API_RUNTIME)) fail();
  if (runtime.RENDER !== undefined && (runtime.API_RUNTIME !== 'render' || runtime.RENDER !== 'true' || runtime.VERCEL !== undefined)) fail();
  if (runtime.VERCEL !== undefined && (runtime.API_RUNTIME !== 'vercel' || runtime.VERCEL !== '1' || runtime.RENDER !== undefined)) fail();
  if (runtime.PORT !== undefined && (!runtime.API_RUNTIME || !/^[1-9]\d{0,4}$/.test(runtime.PORT) || Number(runtime.PORT) > 65535)) fail();
  if (!/^[a-f0-9]{64}$/.test(runtime.PREVIEW_ACCESS_KEY ?? '')
    || (runtime.BROWSER_ORIGIN !== undefined && runtime.BROWSER_ORIGIN !== 'https://app.lovora.us')
    || (operator.MIGRATION_TARGET !== undefined && operator.MIGRATION_TARGET !== 'supabase')
    || (operator.MIGRATION_CONFIRM_PROJECT_REF !== undefined && operator.MIGRATION_CONFIRM_PROJECT_REF !== tuple.SUPABASE_PROJECT_REF)) fail();
  return { runtime: { ...convertedRuntime, API_RUNTIME: 'vercel', PREVIEW_ACCESS_KEY: runtime.PREVIEW_ACCESS_KEY, BROWSER_ORIGIN: 'https://app.lovora.us' }, operator: convertedOperator };
}
