import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { parseEnv } from 'node:util';
import type { ClientConfig } from 'pg';
import approvedTarget from '../../config/hosted-target.example.json' with { type: 'json' };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ConfigurationError extends Error {
  constructor(field: string, remedy: string) {
    super(`${field}: ${remedy}`);
    this.name = 'ConfigurationError';
  }
}

export interface AppFoundationConfig {
  workspaceId: string;
  authUrl: string;
  jwksUrl: string;
  audience: 'authenticated';
  apiKey: string;
  emailEnabled: boolean;
  adminKey?: string;
  invitationRedirect: string;
  retentionPolicyId?: string;
}

export interface ApiConfig {
  runtime: 'local' | 'vercel';
  host: string;
  port: number;
  browserOrigin: string;
  database: ClientConfig;
  previewAccessKey?: string;
  appFoundation?: AppFoundationConfig;
}

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
const sessionHost = /^aws-\d+-[a-z]{2}-[a-z]+(?:-[a-z]+)?-[1-9]\d*\.pooler\.supabase\.com$/;

function required(env: NodeJS.ProcessEnv, field: string, pattern: RegExp): string {
  const value = env[field];
  if (!value || !pattern.test(value)) {
    throw new ConfigurationError(field, 'supply the exact approved Supabase Session connection metadata.');
  }
  return value;
}

function databaseConfig(env: NodeJS.ProcessEnv, hosted: boolean, field: string): ClientConfig {
  const invalid = (): never => {
    throw new ConfigurationError(field, 'use an explicit PostgreSQL user, password, approved host, port and database; no URL options or fragments.');
  };
  const raw = env[field];
  if (!raw || /\s/.test(raw)) invalid();
  let url: URL;
  try { url = new URL(raw!); } catch { return invalid(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !url.port || !url.username || !url.password || raw!.includes('?') || raw!.includes('#')
    || !/^\/[^/]+$/.test(url.pathname)) invalid();
  let user: string, password: string, database: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch { return invalid(); }
  if ([user, password, database].some(value => !value || /[\u0000-\u001f\u007f]/.test(value))) invalid();
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid();
  let ssl: ClientConfig['ssl'] = false;
  if (hosted) {
    const project = required(env, 'SUPABASE_PROJECT_REF', /^[a-z]{20}$/);
    const host = required(env, 'SUPABASE_SESSION_HOST', sessionHost);
    const name = required(env, 'SUPABASE_DATABASE_NAME', /^[a-zA-Z_][a-zA-Z0-9_]*$/);
    const username = required(env, 'SUPABASE_DATABASE_USER', /^[a-z_][a-z0-9_]*\.[a-z]{20}$/);
    if (!username.endsWith(`.${project}`) || url.hostname !== host || port !== 5432
      || database !== name || user !== username) invalid();
    const ca = env.DATABASE_CA_PEM;
    if (ca !== undefined) {
      try {
        if (!/^-----BEGIN CERTIFICATE-----\r?\n/.test(ca)
          || !/\r?\n-----END CERTIFICATE-----\s*$/.test(ca)
          || !new X509Certificate(ca).ca) throw new Error();
      } catch {
        throw new ConfigurationError('DATABASE_CA_PEM', 'supply a valid trusted CA certificate in PEM form, or omit to use system roots.');
      }
    }
    ssl = { rejectUnauthorized: true, servername: host, ...(ca === undefined ? {} : { ca }) };
  } else if (!loopback.has(url.hostname)) invalid();
  return {
    host: url.hostname === '[::1]' ? '::1' : url.hostname,
    port, user, password, database, ssl,
    application_name: 'esty-admin-foundation', options: '-c search_path=public',
    connectionTimeoutMillis: 1000, statement_timeout: 1000, query_timeout: 1500,
  };
}

function appFoundationConfig(env: NodeJS.ProcessEnv, hosted: boolean, browserOrigin: string): AppFoundationConfig | undefined {
  if (env.APP_FOUNDATION_ENABLED === undefined || env.APP_FOUNDATION_ENABLED === 'false') return undefined;
  if (env.APP_FOUNDATION_ENABLED !== 'true') throw new ConfigurationError('APP_FOUNDATION_ENABLED', 'use true or false.');
  if (!uuidPattern.test(env.APP_WORKSPACE_ID ?? '')) {
    throw new ConfigurationError('APP_WORKSPACE_ID', 'supply the explicitly provisioned workspace UUID.');
  }
  let authUrl: URL;
  try {
    authUrl = new URL(env.APP_AUTH_URL ?? '');
    const expected = `https://${env.SUPABASE_PROJECT_REF}.supabase.co/auth/v1`;
    if (hosted ? authUrl.href !== expected : (
      authUrl.protocol !== 'http:' || authUrl.hostname !== '127.0.0.1' || Number(authUrl.port) < 1
      || authUrl.pathname !== '/' || authUrl.search || authUrl.hash || authUrl.username || authUrl.password
    )) throw new Error();
  } catch {
    throw new ConfigurationError('APP_AUTH_URL', 'use the exact project HTTPS Auth endpoint or an explicit loopback-only local fixture origin.');
  }
  const apiKey = env.APP_AUTH_API_KEY;
  if (!apiKey || apiKey.length > 8192 || /[\s\u0000-\u001f\u007f]/u.test(apiKey)) {
    throw new ConfigurationError('APP_AUTH_API_KEY', 'supply the server-held Auth API key without whitespace.');
  }
  const emailEnabled = env.APP_EMAIL_ENABLED ?? 'false';
  if (!['true', 'false'].includes(emailEnabled)) throw new ConfigurationError('APP_EMAIL_ENABLED', 'use true or false.');
  const adminKey = env.APP_AUTH_ADMIN_KEY;
  if (emailEnabled === 'true') {
    if (!adminKey || adminKey.length > 8192 || /[\s\u0000-\u001f\u007f]/u.test(adminKey)) {
      throw new ConfigurationError('APP_AUTH_ADMIN_KEY', 'enabled invitation delivery requires the separately provisioned server-only admin key.');
    }
  } else if (adminKey !== undefined) {
    throw new ConfigurationError('APP_AUTH_ADMIN_KEY', 'omit unused admin credentials while email delivery is disabled.');
  }
  const retentionPolicyId = env.APP_RETENTION_POLICY_ID;
  if ((hosted && retentionPolicyId === undefined)
    || (retentionPolicyId !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(retentionPolicyId))) {
    throw new ConfigurationError('APP_RETENTION_POLICY_ID', 'hosted activation requires an explicitly approved retention policy identifier; no duration is assumed.');
  }
  const base = authUrl.href.replace(/\/$/, '');
  return {
    workspaceId: env.APP_WORKSPACE_ID!.toLowerCase(), authUrl: base,
    jwksUrl: `${base}/.well-known/jwks.json`, audience: 'authenticated', apiKey,
    emailEnabled: emailEnabled === 'true', ...(adminKey === undefined ? {} : { adminKey }),
    invitationRedirect: `${browserOrigin}/auth/invitation`,
    ...(retentionPolicyId === undefined ? {} : { retentionPolicyId }),
  };
}

export function parseConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const runtime = env.API_RUNTIME ?? 'local';
  if (!['local', 'vercel'].includes(runtime)
    || (env.VERCEL === '1' && runtime !== 'vercel')
    || Object.keys(env).some(key => (key === 'RENDER' || key.startsWith('RENDER_')) && env[key] !== undefined)) {
    throw new ConfigurationError('API_RUNTIME', 'select explicit local or vercel mode; retired provider fields are forbidden.');
  }
  const hosted = runtime !== 'local';
  if (runtime === 'vercel' && env.VERCEL !== '1') {
    throw new ConfigurationError('VERCEL', 'hosted API mode requires the Vercel runtime marker.');
  }
  if (runtime === 'vercel') {
    if (!/^[a-f0-9]{64}$/.test(env.PREVIEW_ACCESS_KEY ?? '')) throw new ConfigurationError('PREVIEW_ACCESS_KEY', 'supply a separate private 32-byte lowercase hex key.');
    for (const key of Object.keys(env)) {
      if (env[key] !== undefined && (key.startsWith('MIGRATION_') || key.startsWith('APP_OPERATOR_') || ['VERCEL_TOKEN', 'VERCEL_API_TOKEN', 'DEPLOYMENT_TARGET'].includes(key))) {
        throw new ConfigurationError('operator/deploy context', 'never put operator or deployment credentials in the API runtime.');
      }
    }
    for (const [key, value] of Object.entries(approvedTarget)) {
      const expected = env.APP_FOUNDATION_ENABLED === 'true' && key === 'SUPABASE_DATABASE_USER'
        ? `app_runtime.${env.SUPABASE_PROJECT_REF}` : value;
      if (key.startsWith('SUPABASE_') && env[key] !== expected) throw new ConfigurationError(key, 'use the exact reviewed Session target and selected runtime role.');
    }
  } else if (env.APP_FOUNDATION_ENABLED === 'true') {
    if (!/^[a-f0-9]{64}$/.test(env.PREVIEW_ACCESS_KEY ?? '')) throw new ConfigurationError('PREVIEW_ACCESS_KEY', 'app-enabled local mode also requires a separate private 32-byte lowercase hex key.');
  } else if (env.PREVIEW_ACCESS_KEY !== undefined) {
    throw new ConfigurationError('PREVIEW_ACCESS_KEY', 'preview access requires Vercel or explicitly enabled app mode.');
  }
  if (hosted && (env.API_HOST !== undefined || env.API_PORT !== undefined)) {
    throw new ConfigurationError('API_HOST/API_PORT', 'omit local binding settings in hosted mode; the platform supplies PORT.');
  }
  const portField = hosted ? 'PORT' : 'API_PORT';
  const port = env[portField] ?? (hosted ? '3000' : '3001');
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) {
    throw new ConfigurationError(portField, 'use an integer from 1 to 65535.');
  }
  const host = hosted ? '0.0.0.0' : (env.API_HOST ?? '127.0.0.1');
  if (!hosted && !['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new ConfigurationError('API_HOST', 'use a loopback address for local execution.');
  }
  const browserOrigin = env.BROWSER_ORIGIN ?? (hosted ? '' : 'http://127.0.0.1:3000');
  try {
    const origin = new URL(browserOrigin);
    if (!(hosted ? ['https:'] : ['http:', 'https:']).includes(origin.protocol)
      || origin.origin !== browserOrigin || origin.username || origin.password) throw new Error();
  } catch {
    throw new ConfigurationError('BROWSER_ORIGIN', 'use one exact origin without credentials, path, query or fragment; hosted origins require HTTPS.');
  }
  const appFoundation = appFoundationConfig(env, hosted, browserOrigin);
  const database = databaseConfig(env, hosted, 'DATABASE_URL');
  if (appFoundation && database.user !== (hosted ? `app_runtime.${env.SUPABASE_PROJECT_REF}` : 'app_runtime')) {
    throw new ConfigurationError('DATABASE_URL', 'app mode requires the separately provisioned least-privilege app_runtime identity.');
  }
  return { runtime: runtime as ApiConfig['runtime'], host, port: Number(port), browserOrigin, database,
    ...(appFoundation ? { appFoundation } : {}),
    ...(runtime === 'vercel' || appFoundation ? { previewAccessKey: env.PREVIEW_ACCESS_KEY } : {}) };
}

export function parseMigrationConfig(env: NodeJS.ProcessEnv): ClientConfig {
  const target = env.MIGRATION_TARGET ?? 'local';
  if (!['local', 'supabase'].includes(target)) {
    throw new ConfigurationError('MIGRATION_TARGET', 'select local or supabase for a separately authorized migration.');
  }
  if (env.VERCEL === '1' || env.RENDER === 'true') {
    throw new ConfigurationError('MIGRATION_TARGET', 'run migrations separately from the hosted API.');
  }
  if (target === 'supabase') {
    const project = required(env, 'SUPABASE_PROJECT_REF', /^[a-z]{20}$/);
    if (env.MIGRATION_CONFIRM_PROJECT_REF !== project) {
      throw new ConfigurationError('MIGRATION_CONFIRM_PROJECT_REF', 'explicitly confirm the approved project ref before migration.');
    }
    return databaseConfig(env, true, 'MIGRATION_DATABASE_URL');
  }
  return databaseConfig(env, false, 'DATABASE_URL');
}

export function parseAppOperatorConfig(env: NodeJS.ProcessEnv) {
  const target = env.APP_OPERATOR_TARGET;
  if (!['local', 'supabase'].includes(target ?? '') || env.VERCEL !== undefined) {
    throw new ConfigurationError('APP_OPERATOR_TARGET', 'select explicit local or supabase outside the API platform.');
  }
  const hosted = target === 'supabase';
  if (env.APP_OPERATOR_CONFIRM_WORKSPACE !== env.APP_WORKSPACE_ID
    || !uuidPattern.test(env.APP_OPERATOR_APPROVAL_ID ?? '')) {
    throw new ConfigurationError('APP_OPERATOR_CONFIRM_WORKSPACE/APP_OPERATOR_APPROVAL_ID', 'supply an explicit matching workspace and recorded approval UUID.');
  }
  if (hosted) {
    for (const [key, value] of Object.entries(approvedTarget)) {
      const expected = key === 'SUPABASE_DATABASE_USER' ? `app_operator.${env.SUPABASE_PROJECT_REF}` : value;
      if (key.startsWith('SUPABASE_') && env[key] !== expected) throw new ConfigurationError(key, 'use the reviewed target and separately provisioned app_operator role.');
    }
    if (env.APP_OPERATOR_CONFIRM_PROJECT_REF !== env.SUPABASE_PROJECT_REF) {
      throw new ConfigurationError('APP_OPERATOR_CONFIRM_PROJECT_REF', 'explicitly confirm the reviewed project.');
    }
  }
  const database = databaseConfig(env, hosted, 'APP_OPERATOR_DATABASE_URL');
  if (database.user !== (hosted ? `app_operator.${env.SUPABASE_PROJECT_REF}` : 'app_operator')) {
    throw new ConfigurationError('APP_OPERATOR_DATABASE_URL', 'use only the separately provisioned app_operator identity.');
  }
  const key = env.APP_OPERATOR_AUTH_KEY;
  if (!key || key.length > 8192 || /[\s\u0000-\u001f\u007f]/u.test(key)) {
    throw new ConfigurationError('APP_OPERATOR_AUTH_KEY', 'supply the separate server-only Auth admin credential.');
  }
  const browserOrigin = env.BROWSER_ORIGIN ?? '';
  try {
    const origin = new URL(browserOrigin);
    if (origin.origin !== browserOrigin || origin.username || origin.password
      || !(hosted ? ['https:'] : ['http:', 'https:']).includes(origin.protocol)) throw new Error();
  } catch { throw new ConfigurationError('BROWSER_ORIGIN', 'use an exact approved origin.'); }
  const appFoundation = appFoundationConfig({ ...env, APP_FOUNDATION_ENABLED: 'true', APP_EMAIL_ENABLED: 'false',
    APP_AUTH_ADMIN_KEY: undefined }, hosted, browserOrigin)!;
  return { database, appFoundation, key, approvalId: env.APP_OPERATOR_APPROVAL_ID! };
}

function localEnvironment(): NodeJS.ProcessEnv {
  // Locate our own package in either source, compiled or staged layout, never cwd.
  let directory = new URL('.', import.meta.url);
  while (true) {
    try {
      const pkg = JSON.parse(readFileSync(new URL('package.json', directory), 'utf8')) as { name?: string };
      if (pkg.name === '@esty-admin/api') break;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new ConfigurationError('package.json', 'use a complete API package.');
      }
    }
    const parent = new URL('../', directory);
    if (parent.href === directory.href) throw new ConfigurationError('package.json', 'use a complete API package.');
    directory = parent;
  }
  let file: NodeJS.ProcessEnv = {};
  try { file = parseEnv(readFileSync(new URL('.env', directory), 'utf8')); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw new ConfigurationError('.env', 'use a readable local environment file or exported configuration.');
    }
  }
  return { ...file, ...process.env };
}

export function loadConfig(): ApiConfig {
  return parseConfig((process.env.API_RUNTIME !== undefined && process.env.API_RUNTIME !== 'local') || process.env.VERCEL === '1' || Object.keys(process.env).some(key => key === 'RENDER' || key.startsWith('RENDER_'))
    ? process.env : localEnvironment());
}

export function loadMigrationConfig(): ClientConfig {
  return parseMigrationConfig(process.env.MIGRATION_TARGET === 'supabase' || process.env.VERCEL === '1' || process.env.RENDER === 'true'
    ? process.env : localEnvironment());
}
