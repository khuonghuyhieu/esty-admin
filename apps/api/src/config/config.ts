import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { parseEnv } from 'node:util';
import type { ClientConfig } from 'pg';

export class ConfigurationError extends Error {
  constructor(field: string, remedy: string) {
    super(`${field}: ${remedy}`);
    this.name = 'ConfigurationError';
  }
}

export interface ApiConfig {
  runtime: 'local' | 'vercel';
  host: string;
  port: number;
  browserOrigin: string;
  database: ClientConfig;
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

export function parseConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const runtime = env.API_RUNTIME ?? 'local';
  if (!['local', 'vercel'].includes(runtime) || (runtime === 'local' && env.VERCEL === '1')) {
    throw new ConfigurationError('API_RUNTIME', 'select local, or explicitly select vercel on Vercel.');
  }
  const hosted = runtime === 'vercel';
  if (hosted && env.VERCEL !== '1') {
    throw new ConfigurationError('VERCEL', 'hosted API mode requires the Vercel runtime marker.');
  }
  if (hosted && (env.API_HOST !== undefined || env.API_PORT !== undefined)) {
    throw new ConfigurationError('API_HOST/API_PORT', 'omit local binding settings in Vercel mode; the platform supplies PORT.');
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
  return { runtime: hosted ? 'vercel' : 'local', host, port: Number(port), browserOrigin,
    database: databaseConfig(env, hosted, 'DATABASE_URL') };
}

export function parseMigrationConfig(env: NodeJS.ProcessEnv): ClientConfig {
  const target = env.MIGRATION_TARGET ?? 'local';
  if (!['local', 'supabase'].includes(target)) {
    throw new ConfigurationError('MIGRATION_TARGET', 'select local or supabase for a separately authorized migration.');
  }
  if (env.VERCEL === '1') {
    throw new ConfigurationError('MIGRATION_TARGET', 'run migrations separately from the Vercel function.');
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
  return parseConfig(process.env.API_RUNTIME === 'vercel' || process.env.VERCEL === '1'
    ? process.env : localEnvironment());
}

export function loadMigrationConfig(): ClientConfig {
  return parseMigrationConfig(process.env.MIGRATION_TARGET === 'supabase' || process.env.VERCEL === '1'
    ? process.env : localEnvironment());
}
