import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { artifactTarget, toolPins } from './artifact.js';
import { verifyToolPackage } from './build-artifact.js';

export interface CommandResult { code: number | null; stdout: string; aborted: boolean }
// Raw provider stdout stays in memory for identity acknowledgement; stderr is never logged.
export async function command(binary: string, args: string[], cwd: string, env: NodeJS.ProcessEnv,
  signal: AbortSignal): Promise<CommandResult> {
  signal.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', bytes = 0, overflow = false, timer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
      timer ??= setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 2000);
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 4 * 1024 * 1024) { overflow = true; stop(); } else stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) { overflow = true; stop(); } });
    signal.addEventListener('abort', stop, { once: true });
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
    child.once('error', () => { finish(); reject(new Error('CI subprocess could not start.')); });
    child.once('close', code => { finish(); resolveResult({ code, stdout, aborted: signal.aborted || overflow }); });
    if (signal.aborted) stop();
  });
}
export async function checked(binary: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<string> {
  const result = await command(binary, args, cwd, env, signal);
  if (result.code !== 0 || result.aborted) throw new Error('CI subprocess failed; no delivery is authorized.');
  return result.stdout.trim();
}
export async function isolatedEnvironment(root: string): Promise<NodeJS.ProcessEnv> {
  await mkdir(root, { mode: 0o700 });
  await mkdir(join(root, 'home'), { mode: 0o700 });
  await writeFile(join(root, 'user.npmrc'), '', { flag: 'wx' });
  await writeFile(join(root, 'global.npmrc'), '', { flag: 'wx' });
  return { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: join(root, 'home'), XDG_CONFIG_HOME: join(root, 'home'),
    XDG_DATA_HOME: join(root, 'home'), TMPDIR: root, NPM_CONFIG_USERCONFIG: join(root, 'user.npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(root, 'global.npmrc'), NPM_CONFIG_CACHE: join(root, 'cache'),
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org', VERCEL_CLI_USE_NATIVE_BINARY: '0', VERCEL_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1', CI: '1' };
}
export async function responseBytes(response: Response, maximum: number): Promise<Buffer> {
  if (response.redirected || !response.body) throw new Error('Unconfirmed bounded response.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maximum) throw new Error('Response exceeds the approved bound.');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function bootstrapTools(root: string, signal: AbortSignal): Promise<string> {
  if (process.versions.node !== artifactTarget.node) throw new Error('Pinned Node is required.');
  await mkdir(root, { mode: 0o700 });
  const env = await isolatedEnvironment(join(root, 'environment'));
  const dependencies = Object.fromEntries(Object.entries(toolPins).map(([name, pin]) => [name, pin.version]));
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, dependencies }), { flag: 'wx' });
  await checked('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], root, env, signal);
  const cli = join(root, 'node_modules/vercel/dist/vc.js'), resolver = createRequire(cli);
  for (const name of Object.keys(toolPins) as Array<keyof typeof toolPins>) {
    const pin = toolPins[name], directory = join(root, name.replaceAll('/', '-').replace('@', ''));
    await mkdir(directory);
    const response = await fetch(`https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${pin.version}.tgz`, {
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
    if (response.status !== 200) throw new Error('Public tool download failed.');
    const bytes = await responseBytes(response, 32 * 1024 * 1024);
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pin.integrity) throw new Error('Public tool integrity differs.');
    const archive = join(directory, 'package.tgz'); await writeFile(archive, bytes, { flag: 'wx' });
    await checked('/usr/bin/tar', ['-xzf', archive, '-C', directory], root, env, signal);
    verifyToolPackage(name, dirname(resolver.resolve(`${name}/package.json`)), join(directory, 'package'));
  }
  return cli;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root || process.argv.length !== 3) { console.error('Explicit new public tools directory required.'); process.exitCode = 1; }
  else try {
    const cli = await bootstrapTools(resolve(root), AbortSignal.timeout(900000));
    console.info(JSON.stringify({ cli, version: JSON.parse(readFileSync(join(dirname(dirname(cli)), 'package.json'), 'utf8')).version }));
  } catch { console.error('Public tools bootstrap failed.'); process.exitCode = 1; }
}
