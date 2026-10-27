import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';

import { migrationManifest } from '../src/generated/migrations.js';
import { migrationFiles, verifyMigrationFiles } from './migration-files.mjs';

export const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function migrate(database: ClientConfig, directory = migrationsDirectory): Promise<number> {
  if (directory === migrationsDirectory) verifyMigrationFiles(directory, migrationManifest);
  else migrationFiles(directory);
  const client = new Client({
    ...database, connectionTimeoutMillis: 1000, statement_timeout: 10000,
    query_timeout: 12000, lock_timeout: 5000,
  });
  // Connection error text may contain credentials or SQL; only the caller's safe error escapes.
  client.on('error', () => {});
  try {
    await client.connect();
    const migrations = await runner({
      dbClient: client,
      dir: directory,
      direction: 'up',
      migrationsTable: 'foundation_migrations',
      migrationsSchema: 'public',
      schema: 'public',
      checkOrder: true,
      singleTransaction: true,
      noLock: false,
      verbose: false,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    return migrations.length;
  } catch {
    throw new Error('Migration failed. Check database availability and migration ordering; no success is claimed.');
  } finally {
    await client.end();
  }
}
