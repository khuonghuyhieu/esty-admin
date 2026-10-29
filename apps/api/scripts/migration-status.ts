import { ConfigurationError, loadMigrationConfig } from '../src/config/config.js';
import { migrationStatus } from './migrations.js';

try {
  if (process.argv.slice(2).some(arg => arg !== '--hosted')) throw new Error();
  if (process.argv.includes('--hosted')) process.env.MIGRATION_TARGET = 'supabase';
  else if (process.env.MIGRATION_TARGET === 'supabase') throw new ConfigurationError('MIGRATION_TARGET', 'use explicit --hosted for the approved remote read-only target.');
  const status = await migrationStatus(loadMigrationConfig());
  console.info(JSON.stringify(status));
  if (!status.ordered || status.unexpected.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'Migration status failed; stage=assets/connect/history. No history is initialized by status.');
  process.exitCode = 1;
}
