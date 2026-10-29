import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import { runner } from 'node-pg-migrate';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { migrationManifest } from '../src/generated/migrations.js';
import { migrationFiles, verifyMigrationFiles } from './migration-files.mjs';
import { bounded } from './bounded.js';

export const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
export type Manifest = ReadonlyArray<{ readonly name: string; readonly sha256: string }>;
export type Stage = 'config' | 'assets' | 'connect' | 'lock/order' | 'migration' | 'commit' | 'verification';
export interface MigrationStatus {
  initialized: boolean;
  applied: string[];
  pending: string[];
  unexpected: string[];
  ordered: boolean;
}
export interface MigrationReport {
  run_id: string;
  source_revision: string | null;
  target: string;
  manifest_digest: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  result: 'success' | 'failed';
  stage: Stage;
  failed_version: string | null;
  database_outcome: 'not_started' | 'committed' | 'rolled_back' | 'unknown';
  before: string[] | null;
  after: string[] | null;
  attempted: Array<{ name: string; sha256: string; outcome: 'executed_uncommitted' | 'applied_committed' | 'rolled_back' | 'unknown' }>;
  reporting: 'not_requested' | 'written' | 'failed';
}
export function manifestDigest(manifest: Manifest): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}
function manifestFor(directory: string): Manifest {
  return directory === migrationsDirectory ? verifyMigrationFiles(directory, migrationManifest) : migrationFiles(directory);
}
function safeName(value: unknown): string {
  return typeof value === 'string' && /^\d{13}-[a-z0-9-]{1,96}$/.test(value) ? value : '<invalid-version>';
}
async function history(client: Client, manifest: Manifest): Promise<MigrationStatus> {
  const exists = await client.query("SELECT to_regclass('public.foundation_migrations') IS NOT NULL AS present");
  const initialized = exists.rows[0].present === true;
  const applied: string[] = initialized ? (await client.query('SELECT name FROM public.foundation_migrations ORDER BY id')).rows.map(row => safeName(row.name)) : [];
  const names = manifest.map(entry => entry.name);
  return { initialized, applied, pending: names.filter(name => !applied.includes(name)),
    unexpected: applied.filter(name => !names.includes(name)),
    ordered: applied.every((name, index) => names[index] === name) };
}
function connection(database: ClientConfig): Client {
  const client = new Client({ ...database, connectionTimeoutMillis: 1000, statement_timeout: 10000,
    query_timeout: 12000, lock_timeout: 5000 });
  client.on('error', () => {});
  return client;
}
export async function migrationStatus(database: ClientConfig, directory = migrationsDirectory): Promise<MigrationStatus> {
  const manifest = manifestFor(directory);
  const client = connection(database);
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const status = await history(client, manifest);
    await client.query('COMMIT');
    return status;
  } catch { throw new Error('Migration status failed; check approved assets, target and history.'); }
  finally { await client.end().catch(() => {}); }
}
export async function runMigrations(database: ClientConfig, options: {
  directory?: string; sourceRevision?: string; target?: string; signal?: AbortSignal;
} = {}): Promise<MigrationReport> {
  const start = Date.now();
  const report: MigrationReport = { run_id: randomUUID(), source_revision: null, target: 'local', manifest_digest: '',
    started_at: new Date(start).toISOString(), ended_at: '', duration_ms: 0, result: 'failed', stage: 'config',
    failed_version: null, database_outcome: 'not_started', before: null, after: null, attempted: [], reporting: 'not_requested' };
  let client: Client | undefined;
  let manifest: Manifest = [];
  let active = false;
  let commitAttempted = false;
  let committed = false;
  let rolledBack = false;
  let current: string | null = null;
  const signal = options.signal ?? AbortSignal.timeout(60000);
  const abort = () => { void client?.end().catch(() => {}); };
  try {
    if (options.sourceRevision !== undefined && !/^[a-f0-9]{40}$/.test(options.sourceRevision)) throw new Error();
    if (options.target !== undefined && !/^(local|supabase-local|supabase:[a-z]{20})$/.test(options.target)) throw new Error();
    report.source_revision = options.sourceRevision ?? null;
    report.target = options.target ?? 'local';
    signal.throwIfAborted();
    report.stage = 'assets';
    const directory = options.directory ?? migrationsDirectory;
    manifest = manifestFor(directory);
    report.manifest_digest = manifestDigest(manifest);
    report.stage = 'connect';
    client = connection(database);
    signal.addEventListener('abort', abort, { once: true });
    await client.connect();
    report.stage = 'lock/order';
    const db = client;
    // v9 accepts a connected client. Observe transaction acknowledgements, never
    // upstream SQL/error text. The runner retains its own advisory lock and batch.
    const observed = new Proxy(db, { get(target, property) {
      if (property !== 'query') { const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value; }
      return async (query: string | { text: string }, values?: unknown[]) => {
        const text = typeof query === 'string' ? query : query.text;
        const command = text.trim().replace(/;$/, '').toUpperCase();
        if (command === 'BEGIN') active = true;
        if (command === 'COMMIT') { commitAttempted = true; report.stage = 'commit'; current = null; }
        const result = await db.query(query, values);
        if (command === 'COMMIT') { committed = true; active = false; }
        if (command === 'ROLLBACK') { rolledBack = true; active = false; }
        if (text.startsWith('SELECT pg_try_advisory_lock(') && result.rows[0]?.lockObtained === true) {
          const before = await history(db, manifest);
          report.before = before.applied;
          if (!before.ordered || before.unexpected.length) throw new Error('History order mismatch.');
        }
        return result;
      };
    } });
    await runner({ dbClient: observed, dir: directory, direction: 'up', migrationsTable: 'foundation_migrations',
      migrationsSchema: 'public', schema: 'public', checkOrder: true, singleTransaction: true, noLock: false,
      verbose: false, logger: { debug() {}, info() {}, warn() {}, error() {} },
      migrationLoaderStrategies: [{ extensions: ['.mjs'], loader: async paths => {
        const units = [];
        for (const path of paths) {
          const name = basename(path, '.mjs');
          const entry = manifest.find(item => item.name === name);
          if (!entry) throw new Error('Unapproved migration.');
          // Loading errors are assets-stage, with no guessed action attribution.
          report.stage = 'assets';
          const module = await bounded(import(pathToFileURL(path).href), signal);
          if (typeof module.up !== 'function') throw new Error('Migration has no up action.');
          units.push({ id: path, filePaths: [path], actions: { ...module, up: async (pgm: import('node-pg-migrate').MigrationBuilder) => {
            signal.throwIfAborted();
            current = name;
            report.stage = 'migration';
            report.attempted.push({ ...entry, outcome: 'executed_uncommitted' });
            pgm.noTransaction = () => { throw new Error('The application requires one transaction.'); };
            const action = module.up.length === 2 ? new Promise<void>(resolve => module.up(pgm, resolve)) : Promise.resolve(module.up(pgm));
            await bounded(action, signal);
          } } });
        }
        report.stage = 'lock/order';
        return units;
      } }],
    });
    report.stage = 'verification';
    current = null;
    const after = await history(db, manifest);
    report.after = after.applied;
    if (!after.ordered || after.pending.length || after.unexpected.length) throw new Error('Committed history is not current.');
    // A no-op run has no transaction, but verifies already committed history.
    report.database_outcome = 'committed';
    report.result = 'success';
  } catch {
    report.failed_version = report.stage === 'migration' ? current : null;
    report.database_outcome = committed ? 'committed' : commitAttempted ? 'unknown' : rolledBack ? 'rolled_back' : active ? 'unknown' : 'not_started';
    if (client && manifest.length && report.database_outcome !== 'unknown') {
      try { report.after = (await history(client, manifest)).applied; }
      catch { if (report.database_outcome !== 'not_started') report.database_outcome = 'unknown'; }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await client?.end().catch(() => {});
    for (const attempt of report.attempted) attempt.outcome = report.database_outcome === 'committed' ? 'applied_committed'
      : report.database_outcome === 'rolled_back' ? 'rolled_back' : 'unknown';
    report.duration_ms = Date.now() - start;
    report.ended_at = new Date().toISOString();
  }
  return report;
}
export async function migrate(database: ClientConfig, directory = migrationsDirectory): Promise<number> {
  const report = await runMigrations(database, { directory });
  if (report.result !== 'success') throw new Error(`Migration failed: stage=${report.stage}, version=${report.failed_version ?? 'unknown'}, database=${report.database_outcome}.`);
  return report.attempted.length;
}
