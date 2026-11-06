import { createHash } from 'node:crypto';
import { expectedMigrations, migrationManifest } from '../generated/migrations.js';

export type AppSchemaMode = 'strict' | 'activation-bridge';
export const activationSchema = Object.freeze({
  oldDigest: '243818c0ebe11bc6ea8b12b3224810c88e888b18ec30dd5bfe58394f1f209496',
  targetDigest: '149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3',
  oldNames: Object.freeze([migrationManifest[0].name]),
  targetNames: Object.freeze(expectedMigrations),
});
const validManifest = createHash('sha256').update(JSON.stringify(migrationManifest)).digest('hex') === activationSchema.targetDigest
  && createHash('sha256').update(JSON.stringify([migrationManifest[0]])).digest('hex') === activationSchema.oldDigest;
export function assertActivationManifest(): void {
  if (!validManifest) throw new Error('The compiled activation migration identity differs.');
}
export function assertAppManifest(manifest: readonly { name: string; sha256: string }[] = migrationManifest): void {
  if (manifest.length < 3 || createHash('sha256').update(JSON.stringify(manifest.slice(0, 3))).digest('hex') !== activationSchema.targetDigest) {
    throw new Error('The activated application migration prefix differs.');
  }
  for (let index = 3; index < manifest.length; index++) {
    const entry = manifest[index]!;
    if (!/^\d{13}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || entry.name.slice(0, 13) <= manifest[index - 1]!.name.slice(0, 13)) {
      throw new Error('The strict application migration sequence differs.');
    }
  }
}
export function exactHistory(history: readonly { name: string }[], expected: readonly string[]): boolean {
  if (history.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index++) if (history[index]!.name !== expected[index]) return false;
  return true;
}
export function readyHistory(history: readonly { name: string }[], expected: readonly string[], mode: AppSchemaMode): boolean {
  if (mode === 'strict') return exactHistory(history, expected);
  assertActivationManifest();
  if (expected.length !== activationSchema.targetNames.length
    || expected.some((name, index) => name !== activationSchema.targetNames[index])) return false;
  return exactHistory(history, activationSchema.oldNames) || exactHistory(history, activationSchema.targetNames);
}
