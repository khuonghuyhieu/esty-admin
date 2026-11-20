import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { artifactTarget, toolPins } from './artifact.js';
import { verifyToolPackage } from './build-artifact.js';
import { ChecksDiagnostics } from './checks-diagnostics.js';

export interface CommandResult { code: number | null; stdout: string; aborted: boolean }
// Default provider stdout stays in memory for identity acknowledgement; stderr is never logged without explicit checks opt-in.
export async function command(binary: string, args: string[], cwd: string, env: NodeJS.ProcessEnv,
  signal: AbortSignal, diagnostics?: ChecksDiagnostics): Promise<CommandResult> {
  if (diagnostics?.scope === 'checks') return diagnostics.command(binary, args, cwd, env, signal);
  const commandId = diagnostics ? `provider-command.${args.includes('deploy') ? 'deploy' : args.includes('promote') ? 'promote' : 'exec'}.${randomUUID()}` : '';
  diagnostics?.event(commandId, 'started', 'private-command-output-projected');
  if (signal.aborted) {
    diagnostics?.event(commandId, 'not-run', 'aborted-before-spawn');
    signal.throwIfAborted();
  }
  return new Promise((resolveResult, reject) => {
    const start = diagnostics ? performance.now() : 0;
    let child;
    try { child = spawn(binary, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (cause) {
      diagnostics?.event(commandId, 'failed', 'spawn-error', { durationMs: Math.round(performance.now() - start) }, cause);
      throw cause;
    }
    let stdout = '', bytes = 0, stderrBytes = 0, overflow = false, timer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
      timer ??= setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 2000);
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 4 * 1024 * 1024) { overflow = true; stop(); } else stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; bytes += chunk.length; if (bytes > 4 * 1024 * 1024) { overflow = true; stop(); } });
    signal.addEventListener('abort', stop, { once: true });
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
    child.once('error', cause => {
      finish();
      diagnostics?.event(commandId, 'failed', 'spawn-error', {}, cause);
      reject(new Error('CI subprocess could not start.', diagnostics ? { cause } : undefined));
    });
    child.once('close', (code, childSignal) => {
      finish();
      diagnostics?.event(commandId, code === 0 && !signal.aborted && !overflow ? 'passed' : 'failed',
        `exit-${childSignal ?? 'no-signal'}-stdout-stderr-omitted-private-payload`, { code, aborted: signal.aborted, overflow, outputBytes: bytes,
          stdoutBytes: bytes - stderrBytes, stderrBytes, signaled: childSignal != null, durationMs: Math.round(performance.now() - start) });
      resolveResult({ code, stdout, aborted: signal.aborted || overflow });
    });
    if (signal.aborted) stop();
  });
}
export async function checked(binary: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal, diagnostics?: ChecksDiagnostics): Promise<string> {
  const result = await command(binary, args, cwd, env, signal, diagnostics);
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
export async function responseBytes(response: Response, maximum: number, diagnostics?: ChecksDiagnostics): Promise<Buffer> {
  diagnostics?.event('http.body', 'started', 'bounded-body-read', { maximum });
  diagnostics?.check('http.body-present', !response.redirected && response.body !== null, 'redirected-or-missing-body');
  if (response.redirected || !response.body) throw new Error('Unconfirmed bounded response.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maximum) {
        diagnostics?.event('http.body-size', 'failed', 'response-exceeds-bound', { actual: size, maximum });
        throw new Error('Response exceeds the approved bound.');
      }
      chunks.push(value);
    }
    diagnostics?.event('http.body', 'passed', 'bounded-body-complete-payload-omitted', { size, maximum });
    return Buffer.concat(chunks, size);
  } catch (cause) {
    diagnostics?.event('http.body', 'failed', 'body-read-failed', { size, maximum }, cause); throw cause;
  } finally {
    await reader.cancel().catch(cause => diagnostics?.event('http.body-cancel', 'failed', 'cleanup-failed', {}, cause));
    reader.releaseLock();
  }
}
export async function bootstrapTools(root: string, signal: AbortSignal, diagnostics?: ChecksDiagnostics): Promise<string> {
  if (process.versions.node !== artifactTarget.node) throw new Error('Pinned Node is required.');
  await mkdir(root, { mode: 0o700 });
  const env = await isolatedEnvironment(join(root, 'environment'));
  const dependencies = Object.fromEntries(Object.entries(toolPins).map(([name, pin]) => [name, pin.version]));
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, dependencies }), { flag: 'wx' });
  await checked('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], root, env, signal, diagnostics);
  const cli = join(root, 'node_modules/vercel/dist/vc.js'), resolver = createRequire(cli);
  for (const name of Object.keys(toolPins) as Array<keyof typeof toolPins>) {
    const pin = toolPins[name], directory = join(root, name.replaceAll('/', '-').replace('@', ''));
    await mkdir(directory);
    const response = await fetch(`https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${pin.version}.tgz`, {
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
    if (response.status !== 200) throw new Error('Public tool download failed.');
    const bytes = await responseBytes(response, 32 * 1024 * 1024, diagnostics);
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pin.integrity) throw new Error('Public tool integrity differs.');
    const archive = join(directory, 'package.tgz'); await writeFile(archive, bytes, { flag: 'wx' });
    await checked('/usr/bin/tar', ['-xzf', archive, '-C', directory], root, env, signal, diagnostics);
    verifyToolPackage(name, dirname(resolver.resolve(`${name}/package.json`)), join(directory, 'package'));
  }
  return cli;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, diagnosticDirectory] = process.argv.slice(2);
  let diagnostics: ChecksDiagnostics | undefined;
  if (!root || ![3, 4].includes(process.argv.length)) { console.error('Explicit new public tools directory required.'); process.exitCode = 1; }
  else try {
    if (diagnosticDirectory) diagnostics = new ChecksDiagnostics(diagnosticDirectory);
    const cli = diagnostics
      ? await diagnostics.stage('public-tools-bootstrap', () => bootstrapTools(resolve(root), AbortSignal.timeout(900000), diagnostics))
      : await bootstrapTools(resolve(root), AbortSignal.timeout(900000));
    console.info(JSON.stringify({ cli, version: JSON.parse(readFileSync(join(dirname(dirname(cli)), 'package.json'), 'utf8')).version }));
  } catch (cause) {
    console.error('Public tools bootstrap failed.' + (diagnostics ? '\n' + diagnostics.error(cause) : '')); process.exitCode = 1;
  }
}
