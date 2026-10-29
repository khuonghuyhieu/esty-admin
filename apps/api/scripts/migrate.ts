import { randomUUID } from 'node:crypto';
import { ConfigurationError, loadMigrationConfig } from '../src/config/config.js';
import { runMigrations } from './migrations.js';
import type { MigrationReport } from './migrations.js';
import { saveMigrationReport, reportSummary } from './migration-report.js';

const started = new Date().toISOString();
let report: MigrationReport = { run_id: randomUUID(), source_revision: null, target: 'local', manifest_digest: '',
  started_at: started, ended_at: started, duration_ms: 0, result: 'failed', stage: 'config', failed_version: null,
  database_outcome: 'not_started', before: null, after: null, attempted: [], reporting: 'not_requested' };
let reportDirectory: string | undefined;
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report-dir' && args[i + 1]) reportDirectory = args[++i];
    else if (args[i] !== '--hosted') throw new ConfigurationError('arguments', 'use only --hosted and optional --report-dir <private-directory>.');
  }
  const hosted = args.includes('--hosted');
  if (hosted) process.env.MIGRATION_TARGET = 'supabase';
  else if (process.env.MIGRATION_TARGET === 'supabase') {
    throw new ConfigurationError('MIGRATION_TARGET', 'use the explicit --hosted operator command for remote migrations.');
  }
  report = await runMigrations(loadMigrationConfig(), { target: hosted ? `supabase:${process.env.SUPABASE_PROJECT_REF}` : 'local',
    sourceRevision: process.env.RELEASE_REVISION, signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60000)]) });
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'Migration configuration failed.');
} finally {
  const written = saveMigrationReport(report, reportDirectory);
  console.info(reportSummary(report));
  if (!written || report.result !== 'success') process.exitCode = 1;
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
}
