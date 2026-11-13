import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  readdirSync, readlinkSync, readSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, sha256 } from './artifact.js';
import { command } from './ci-tools.js';
import { bridgeRecovery } from './activation-candidate-recovery.js';
import type { RecoveryGuard, RecoveryIo } from './activation-candidate-recovery.js';

function refuse(): never { throw new Error('Recovery transport identity or acknowledgement differs.'); }
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function path(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || resolve(value) !== value || /[\u0000-\u0020]/.test(value)) refuse();
  return value;
}
export function recoveryToolInventory(rootArg: string): string {
  const root = path(rootArg); if (realpathSync(root) !== root) refuse();
  const entries: object[] = []; let total = 0;
  const buffer = Buffer.alloc(65536);
  function visit(directory: string): void {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid!() || (stat.mode & 0o022)) refuse();
    entries.push({ path: relative(root, directory), kind: 'directory', mode: stat.mode & 0o777 });
    for (const name of readdirSync(directory).sort()) {
      if (entries.length >= 50000) refuse();
      const filename = join(directory, name), info = lstatSync(filename), child = relative(root, filename);
      if (info.uid !== process.getuid!()) refuse();
      if (info.isSymbolicLink()) {
        const actual = relative(root, realpathSync(filename));
        if (!actual || actual === '..' || actual.startsWith('../')) refuse();
        entries.push({ path: child, kind: 'link', target: readlinkSync(filename) });
      } else if (info.isDirectory()) visit(filename);
      else {
        if (!info.isFile() || (info.mode & 0o022) || info.size > 512 * 1024 * 1024) refuse();
        const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const before = fstatSync(fd), hash = createHash('sha256'); let size = 0, count: number;
          if (before.ino !== info.ino || before.dev !== info.dev || before.size !== info.size) refuse();
          while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
            size += count; total += count; if (total > 2 * 1024 * 1024 * 1024) refuse();
            hash.update(buffer.subarray(0, count));
          }
          const after = fstatSync(fd);
          if (size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
            || after.ctimeMs !== before.ctimeMs || after.mode !== before.mode) refuse();
          entries.push({ path: child, kind: 'file', mode: info.mode & 0o777, size, sha256: hash.digest('hex') });
        } finally { closeSync(fd); }
      }
    }
  }
  visit(root); return sha256(canonical(entries));
}
function approvedTool(guard: RecoveryGuard) {
  const manifest = guard.verify();
  if (!record(manifest) || !record(manifest.recoveryVercel)) refuse();
  const tool = manifest.recoveryVercel;
  if (Object.keys(tool).sort().join(',') !== 'configDirectory,home,inventoryDigest,root'
    || typeof tool.inventoryDigest !== 'string' || !/^[a-f0-9]{64}$/.test(tool.inventoryDigest)) refuse();
  const root = path(tool.root), home = path(tool.home), configDirectory = path(tool.configDirectory);
  // Auth/profile paths are approved lexical bindings; only the official CLI opens them.
  if (recoveryToolInventory(root) !== tool.inventoryDigest) refuse();
  const metadata: unknown = JSON.parse(readFileSync(join(root, 'vercel/package.json'), 'utf8'));
  if (!record(metadata) || metadata.version !== '65.4.0') refuse();
  return { root, home, configDirectory };
}
export function recoveryIo(guard: RecoveryGuard, signal: AbortSignal): RecoveryIo {
  const target = bridgeRecovery;
  const endpoints = [
    `/v13/deployments/${target.candidate}`,
    `/v9/projects/${target.project}/domains/api.lovora.us`,
    `/v4/aliases/api.lovora.us?projectId=${target.project}`,
    `/v6/deployments/${target.candidate}/files`,
    `/v8/deployments/${target.candidate}/files/${target.partitionUid}`,
  ];
  async function invoke(args: string[], promotion: boolean) {
    signal.throwIfAborted(); const tool = approvedTool(guard);
    const scratch = mkdtempSync(join(realpathSync('/tmp'), 'esty-bridge-recovery-cli-'));
    const home = join(scratch, 'cache'); mkdirSync(home, { mode: 0o700 });
    const env = { PATH: '/usr/bin:/bin', HOME: tool.home, TMPDIR: scratch, XDG_CACHE_HOME: home,
      XDG_STATE_HOME: home, VERCEL_CLI_USE_NATIVE_BINARY: '0', VERCEL_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1', NODE_DISABLE_COMPILE_CACHE: '1', NO_COLOR: '1', CI: '1' };
    try {
      const cli = fileURLToPath(new URL('./activation-recovery-tool.mjs', import.meta.url));
      const result = await command(process.execPath, [cli, tool.root, ...args, '--scope', target.scope,
        '--global-config', tool.configDirectory, '--non-interactive'], scratch, env,
      AbortSignal.any([signal, AbortSignal.timeout(promotion ? 300000 : 45000)]));
      if (result.aborted || result.code !== 0) refuse();
      return result;
    } finally {
      // Only this owned public-cache scratch is removed; profile/auth state is never inspected.
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  return {
    async github(pathname) {
      const { recoveryGithubRead } = await import('./activation-input-transfer.js');
      return recoveryGithubRead(pathname, guard, signal);
    },
    async vercel(pathname) {
      if (!endpoints.includes(pathname)) refuse();
      const result = await invoke(['api', pathname, '--method', 'GET'], false);
      return JSON.parse(result.stdout) as unknown;
    },
    async promote() {
      const result = await invoke(['promote', target.candidate, '--timeout', '5m'], true);
      return { code: result.code, aborted: result.aborted };
    },
  };
}
