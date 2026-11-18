import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activationRuntimeKeys, runtimeConfigDigest } from '../src/config/activation-config.js';
import { parseConfig } from '../src/config/config.js';
import { privateDirectory } from './private-files.mjs';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { readHiddenPassword } from './hidden-input.mjs';

export class EtsySetupError extends Error {
  constructor() { super('Etsy setup input or private output refused; no activation or injection performed.'); }
}
function refuse(): never { throw new EtsySetupError(); }
export function setupObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, unknown>;
}
export function prepareEtsyConfiguration(value: unknown): {
  version: 1; state: 'OWNER_INPUT_PENDING'; runtime: Record<string, string>;
  runtimeDigest: string; enabledValidationDigest: string; backupPolicy: string;
} {
  try {
    const input = setupObject(value);
    if (Object.keys(input).sort().join(',') !== 'backupPolicy,runtime' || typeof input.backupPolicy !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(input.backupPolicy)) refuse();
    const supplied = setupObject(input.runtime), runtime: Record<string, string> = {};
    for (const [key, item] of Object.entries(supplied)) {
      if (!activationRuntimeKeys.includes(key) || typeof item !== 'string' || item.length > 16384) refuse();
      runtime[key] = item;
    }
    if (runtime.API_RUNTIME !== 'vercel' || runtime.APP_SCHEMA_MODE !== 'strict'
      || runtime.APP_FOUNDATION_ENABLED !== 'true' || !['true', 'false'].includes(runtime.ETSY_ENABLED ?? '')) refuse();
    // Validate the complete proposed enabled envelope even when deployment remains disabled.
    // Platform metadata is synthetic validation context, never part of the output bundle.
    const enabled = { ...runtime, ETSY_ENABLED: 'true' };
    const enabledValidationDigest = runtimeConfigDigest(enabled);
    const enabledConfig = parseConfig({ ...enabled, VERCEL: '1', APP_ACTIVATION_CONFIG_DIGEST: enabledValidationDigest });
    for (const key of enabledConfig.etsy!.keyring.values()) key.fill(0);
    const runtimeDigest = runtimeConfigDigest(runtime);
    const config = parseConfig({ ...runtime, VERCEL: '1', APP_ACTIVATION_CONFIG_DIGEST: runtimeDigest });
    for (const key of config.etsy?.keyring.values() ?? []) key.fill(0);
    return { version: 1, state: 'OWNER_INPUT_PENDING', runtime: { ...runtime, APP_ACTIVATION_CONFIG_DIGEST: runtimeDigest },
      runtimeDigest, enabledValidationDigest, backupPolicy: input.backupPolicy };
  } catch { return refuse(); }
}
export function saveEtsyConfiguration(value: unknown, output: string): void {
  try {
    const prepared = prepareEtsyConfiguration(value);
    privateDirectory(dirname(resolve(output)), false);
    writeReleaseEvidence(resolve(output), prepared);
  } catch { refuse(); }
}
export function saveEtsyKeyring(key: Buffer, keyId: string, backupPolicy: string, output: string): void {
  try {
    if (key.length !== 32 || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId)
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(backupPolicy)) refuse();
    privateDirectory(dirname(resolve(output)), false);
    writeReleaseEvidence(resolve(output), { version: 1, backupPolicy, activeKeyId: keyId,
      keyring: { [keyId]: key.toString('base64url') } });
  } catch { refuse(); }
  finally { key.fill(0); }
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!process.stdin.isTTY || !process.stdout.isTTY) refuse();
  if (args[0] === 'prepare' && args.length === 2) {
    const raw = await readHiddenPassword(process.stdin, process.stdout,
      'Paste the newly prepared runtime/backupPolicy JSON (hidden; no original file is loaded): ', { maxBytes: 65536, maxCharacters: 65536 });
    saveEtsyConfiguration(JSON.parse(raw), args[1]!);
  } else if (args[0] === 'validate' && args.length === 2) {
    // Explicit new snapshot only; no discovery or environment fallback.
    const input = readEvidence(resolve(args[1]!)).value;
    prepareEtsyConfiguration(input);
  } else if (args[0] === 'key' && args.length === 2) {
    const keyId = await readHiddenPassword(process.stdin, process.stdout, 'Approved new key ID (hidden): ');
    const backupPolicy = await readHiddenPassword(process.stdin, process.stdout, 'Approved backup policy reference (hidden): ');
    if (await readHiddenPassword(process.stdin, process.stdout, 'Type GENERATE NEW KEY (hidden): ') !== 'GENERATE NEW KEY') refuse();
    saveEtsyKeyring(randomBytes(32), keyId, backupPolicy, args[1]!);
  } else refuse();
  console.info('ETSY_SETUP_VALIDATED_OFFLINE; OWNER_INPUT_PENDING; no injection or activation.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error(new EtsySetupError().message); process.exitCode = 1; });
}
