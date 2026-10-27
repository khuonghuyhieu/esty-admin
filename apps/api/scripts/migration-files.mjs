import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function migrationFiles(directory) {
  directory = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = readdirSync(directory, { withFileTypes: true }).filter(entry => !entry.name.startsWith('.'));
  if (entries.some(entry => !entry.isFile() || !/^\d{13}-[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$/.test(entry.name))) {
    throw new Error('Foundation migrations must use timestamp-name.mjs files.');
  }
  const names = entries.map(entry => entry.name.slice(0, -4)).sort();
  if (!names.length) throw new Error('The foundation migration manifest is empty.');
  if (new Set(names.map(name => name.slice(0, 13))).size !== names.length) {
    throw new Error('Foundation migration timestamps must be unique.');
  }
  return names.map(name => ({ name, sha256: createHash('sha256').update(readFileSync(join(directory, `${name}.mjs`))).digest('hex') }));
}

export function verifyMigrationFiles(directory, expected) {
  const actual = migrationFiles(directory);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Migration assets differ from the generated manifest; regenerate and rebuild the approved release.');
  }
  return actual;
}
