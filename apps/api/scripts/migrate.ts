import { ConfigurationError, loadMigrationConfig } from '../src/config/config.js';
import { migrate } from './migrations.js';

try {
  const hosted = process.argv.includes('--hosted');
  if (hosted) process.env.MIGRATION_TARGET = 'supabase';
  else if (process.env.MIGRATION_TARGET === 'supabase') {
    throw new ConfigurationError('MIGRATION_TARGET', 'use the explicit --hosted operator command for remote migrations.');
  }
  const applied = await migrate(loadMigrationConfig());
  console.info(`Migrations complete: ${applied} applied.`);
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'Migration failed. Check database availability, approved assets and migration ordering.');
  process.exitCode = 1;
}
