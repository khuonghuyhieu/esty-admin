import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

const MiB = 1024 * 1024;
const sensitive = /password|secret|token|authorization|cookie|credential|(?:api|private|access)[_-]?key/i;
interface Limits { secrets?: readonly string[]; outputLimit?: number; fileLimit?: number; totalLimit?: number; lineLimit?: number }
interface Stage {
  id: string; stage: string; parents: string[]; startedAt: string; durationMs: number; status: 'running' | 'passed' | 'failed';
  command?: { binary: string; args: string[] }; code?: number | null; signal?: string | null; aborted?: boolean;
  outputLimit?: boolean; outputBytes?: number; stdout?: string; stderr?: string; error?: string;
  truncation: string[]; persistenceErrors: string[];
}

// Only explicit public/synthetic checks use this formatter. Unknown secrets cannot be inferred.
export function safeChecksText(text: string, secrets: readonly string[] = []): string {
  if (text.length > 65536) return '[TRUNCATED diagnostic field exceeds 65536 characters]';
  let safe = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  for (const secret of secrets) for (const part of secret.split(/[\r\n]+/)) if (part) {
    safe = safe.split(part).join('[REDACTED]');
    if (safe.length > 65536) return '[TRUNCATED redacted diagnostic field exceeds 65536 characters]';
  }
  return safe.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/]+@/gi, '$1[REDACTED]@')
    .replace(/((?:authorization|proxy-authorization|set-cookie|cookie)\s*:\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(/(["']?(?:[\w-]*(?:password|secret|token|credential|api[_-]?key|private[_-]?key|access[_-]?key))["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}&]+)/gi, '$1[REDACTED]')
    .replace(/\bsynthetic[-_][a-z0-9_-]+/gi, '[REDACTED]');
}
export function safeChecksError(error: unknown, secrets: readonly string[] = []): string {
  const seen = new Set<unknown>(); const parts: string[] = []; let size = 0;
  for (let depth = 0; error !== undefined && depth < 8; depth++) {
    if (seen.has(error)) { parts.push('[TRUNCATED circular cause]'); return parts.join('\nCaused by: '); }
    seen.add(error);
    const text = safeChecksText(error instanceof Error ? error.stack ?? `${error.name}: ${error.message}` : String(error), secrets);
    if (size + text.length > 65536) { parts.push('[TRUNCATED combined stack/cause limit]'); return parts.join('\nCaused by: '); }
    parts.push(text); size += text.length;
    if (!(error instanceof Error)) return parts.join('\nCaused by: ');
    error = error.cause;
  }
  if (error !== undefined) parts.push('[TRUNCATED cause depth exceeds8]');
  return parts.join('\nCaused by: ');
}

/** No ambient env/private reads. Passing this context is the only logging opt-in. */
export class ChecksDiagnostics {
  readonly directory: string;
  private readonly secrets: string[];
  private readonly outputLimit: number;
  private readonly fileLimit: number;
  private readonly totalLimit: number;
  private readonly lineLimit: number;
  private readonly active: Stage[] = [];
  private sequence = 0;
  private written = 0;
  private failed = false;
  private readonly consoleBytes = { stdout: 0, stderr: 0 };
  private readonly persistenceErrors: string[] = [];
  constructor(directory: string, limits: Limits = {}) {
    this.directory = resolve(directory); this.secrets = [];
    for (const secret of limits.secrets ?? []) this.secret(secret);
    this.outputLimit = limits.outputLimit ?? 4 * MiB; this.fileLimit = limits.fileLimit ?? 4 * MiB;
    this.totalLimit = limits.totalLimit ?? 64 * MiB; this.lineLimit = limits.lineLimit ?? 16384;
    for (const value of [this.outputLimit, this.fileLimit, this.totalLimit, this.lineLimit]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 64 * MiB) throw new Error('Invalid checks diagnostic bound.');
    }
    fs.mkdirSync(this.directory, { mode: 0o700 });
  }
  private secret(value: string) {
    if (!value || this.secrets.includes(value)) return;
    if (value.length > 8192 || this.secrets.length >= 128) throw new Error('Checks redaction input exceeds its bound.');
    this.secrets.push(value);
  }
  error(error: unknown): string { return safeChecksError(error, this.secrets); }
  private console(record: object, failed = false) {
    try { (failed ? console.error : console.info)(JSON.stringify(record)); } catch { /* Never replace the primary failure with console failure. */ }
  }
  private persist(path: string, text: string, append = false) {
    if (append && this.persistenceErrors.length) return false;
    try {
      if (append) fs.appendFileSync(join(this.directory, path), text, { mode: 0o600 });
      else fs.writeFileSync(join(this.directory, path), text, { mode: 0o600 });
      return true;
    } catch (error) {
      if (this.persistenceErrors.length < 8) {
        const detail = this.error(error);
        this.persistenceErrors.push(detail.length <= 4096 ? detail : detail.slice(0, 4096) + '[TRUNCATED persistence detail]');
        this.console({ event: 'diagnostics-write-failed', file: path, error: detail }, true);
      }
      return false;
    }
  }
  async stage<T>(name: string, action: (record: Stage) => Promise<T> | T, command?: { binary: string; args: string[] }): Promise<T> {
    if (++this.sequence > 128) throw new Error('Checks diagnostic stage limit exceeded.');
    const record: Stage = { id: String(this.sequence).padStart(3, '0'), stage: safeChecksText(name, this.secrets),
      parents: this.active.map(parent => parent.stage), startedAt: new Date().toISOString(), durationMs: 0, status: 'running',
      truncation: [], persistenceErrors: [], ...(command ? { command } : {}) };
    const path = `${record.id}-stage.json`, start = performance.now();
    this.active.push(record); this.persist(path, JSON.stringify(record) + '\n');
    this.console({ event: 'checks-stage-start', ...record });
    try {
      const result = await action(record);
      if (this.persistenceErrors.length) throw new Error('Required checks diagnostics could not be persisted.');
      record.status = 'passed'; return result;
    } catch (error) {
      record.status = 'failed'; record.error = safeChecksError(error, this.secrets);
      record.durationMs = Math.round(performance.now() - start); record.persistenceErrors = [...this.persistenceErrors];
      // The deepest/first failure remains the pointer even when an outer boundary or cleanup also fails.
      if (!this.failed) { this.failed = true; this.persist('failed-stage.json', JSON.stringify(record) + '\n'); }
      this.console({ event: 'checks-stage-failed', ...record }, true);
      throw error;
    } finally {
      record.durationMs = Math.round(performance.now() - start); record.persistenceErrors = [...this.persistenceErrors];
      this.persist(path, JSON.stringify(record) + '\n'); this.active.pop();
      let finalPersistenceError: Error | undefined;
      if (record.status === 'passed' && this.persistenceErrors.length) {
        finalPersistenceError = new Error('Required checks final diagnostic persistence failed.');
        record.status = 'failed'; record.error = this.error(finalPersistenceError); record.persistenceErrors = [...this.persistenceErrors];
        if (!this.failed) { this.failed = true; this.persist('failed-stage.json', JSON.stringify(record) + '\n'); }
        this.console({ event: 'checks-stage-failed', ...record }, true);
      }
      this.console({ event: 'checks-stage-end', id: record.id, stage: record.stage, status: record.status, durationMs: record.durationMs,
        truncation: record.truncation, persistenceErrors: record.persistenceErrors });
      if (finalPersistenceError) throw finalPersistenceError;
    }
  }
  private stream(record: Stage, channel: 'stdout' | 'stderr') {
    const path = `${record.id}-${channel}.log`; record[channel] = path;
    this.persist(path, ''); const decoder = new StringDecoder('utf8');
    let pending = '', dropping = false, size = 0;
    const mark = (reason: string) => { const value = `${channel}:${reason}`; if (!record.truncation.includes(value)) record.truncation.push(value); };
    const emit = (text: string) => {
      const safe = safeChecksText(text, this.secrets), bytes = Buffer.byteLength(safe);
      if (size + bytes > this.fileLimit || this.written + bytes > this.totalLimit) { mark('disk-limit'); return; }
      if (!this.persist(path, safe, true)) {
        mark('persistence');
        if (this.consoleBytes[channel] + bytes <= 65536) {
          this.consoleBytes[channel] += bytes;
          this.console({ event: 'checks-output-fallback', id: record.id, channel, text: safe }, true);
        } else mark('console-fallback-limit');
      }
      size += bytes; this.written += bytes;
    };
    const text = (chunk: string) => {
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf('\n', offset), end = newline < 0 ? chunk.length : newline;
        if (!dropping) {
          if (pending.length + end - offset > this.lineLimit) {
            pending = ''; dropping = true; mark('line-limit'); emit('[TRUNCATED diagnostic line exceeds configured limit]\n');
          } else pending += chunk.slice(offset, end);
        }
        if (newline < 0) return;
        if (!dropping) emit(pending + '\n');
        pending = ''; dropping = false; offset = newline + 1;
      }
    };
    return { write: (chunk: Buffer) => text(decoder.write(chunk)), end: (truncated: boolean) => {
      text(decoder.end());
      if (truncated) { if (pending) mark('incomplete-line'); pending = ''; mark('output-truncated'); }
      else if (!dropping && pending) emit(pending);
    } };
  }
  async command(binary: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<{ code: number | null; stdout: string; aborted: boolean }> {
    // Only the explicitly supplied isolated/synthetic command env is inspected, never process.env.
    for (const [key, value] of Object.entries(env)) {
      if (value && sensitive.test(key)) this.secret(value);
      if (value) {
        const credentials = value.match(/[a-z][a-z0-9+.-]*:\/\/([^\s/]+)@/i);
        if (credentials) {
          this.secret(credentials[1]!);
          const password = credentials[1]!.slice(credentials[1]!.indexOf(':') + 1);
          this.secret(password);
          try { this.secret(decodeURIComponent(password)); } catch { /* Encoded bytes remain masked even for malformed URL input. */ }
        }
      }
    }
    const safeArgs = [...args];
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]!;
      if (arg.startsWith('-') && (sensitive.test(arg.split('=')[0]!) || ['--header', '-H'].includes(arg))) {
        const equal = arg.indexOf('=');
        if (equal >= 0) { this.secret(arg.slice(equal + 1)); safeArgs[index] = arg.slice(0, equal + 1) + '[REDACTED]'; }
        else if (args[index + 1] !== undefined) { this.secret(args[index + 1]!); safeArgs[++index] = '[REDACTED]'; }
      }
    }
    // Inline programs can contain reconstructed secrets; show the invocation, never their source text.
    for (let index = 0; index < safeArgs.length; index++) {
      if (/^--(?:eval|print|command)=/.test(safeArgs[index]!)) safeArgs[index] = safeArgs[index]!.split('=')[0] + '=[INLINE CODE OMITTED]';
      if (['-e', '--eval', '-p', '--print', '-c', '--command'].includes(safeArgs[index]!) && safeArgs[index + 1] !== undefined) {
        safeArgs[++index] = '[INLINE CODE OMITTED]';
      }
    }
    const displayArgs: string[] = []; let displaySize = 0;
    for (const arg of safeArgs) {
      const safe = safeChecksText(arg, this.secrets);
      if (displayArgs.length >= 128 || displaySize + safe.length > 16384) { displayArgs.push('[TRUNCATED command argument display]'); break; }
      displayArgs.push(safe); displaySize += safe.length;
    }
    return this.stage(`command-${basename(binary)}`, async record => {
      record.code = null; record.signal = null; record.aborted = signal.aborted; record.outputLimit = false; record.outputBytes = 0;
      if (signal.aborted) throw new Error('Checks command aborted before spawn.', { cause: signal.reason });
      const out = this.stream(record, 'stdout'), err = this.stream(record, 'stderr');
      const result = await new Promise<{ code: number | null; stdout: string; aborted: boolean }>((done, reject) => {
        const child = spawn(binary, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', spawnError: Error | undefined, timer: NodeJS.Timeout | undefined, stopping = false;
        const stdoutDecoder = new StringDecoder('utf8');
        const stop = () => {
          if (stopping) return;
          stopping = true;
          if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
          timer ??= setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 2000);
        };
        const receive = (channel: 'stdout' | 'stderr', chunk: Buffer) => {
          const before = record.outputBytes!; record.outputBytes! += chunk.length;
          const retained = chunk.subarray(0, Math.max(0, this.outputLimit - before));
          if (channel === 'stdout') { stdout += stdoutDecoder.write(retained); out.write(retained); } else err.write(retained);
          if (record.outputBytes! > this.outputLimit) { record.outputLimit = true; stop(); }
        };
        child.stdout.on('data', (chunk: Buffer) => receive('stdout', chunk)); child.stderr.on('data', (chunk: Buffer) => receive('stderr', chunk));
        child.once('error', error => { spawnError = error; });
        child.stdout.once('error', error => { spawnError = error; stop(); });
        child.stderr.once('error', error => { spawnError = error; stop(); });
        signal.addEventListener('abort', stop, { once: true });
        child.once('close', (code, childSignal) => {
          clearTimeout(timer); signal.removeEventListener('abort', stop);
          record.code = code; record.signal = childSignal; record.aborted = signal.aborted;
          stdout += stdoutDecoder.end();
          out.end(record.outputLimit! || signal.aborted); err.end(record.outputLimit! || signal.aborted);
          if (spawnError) reject(spawnError);
          else if (code !== 0 || signal.aborted || record.outputLimit) reject(new Error(
            `Public checks subprocess failed: exit=${code}, signal=${childSignal}, aborted=${signal.aborted}, outputLimit=${record.outputLimit}; stdout=${record.stdout}; stderr=${record.stderr}`,
            signal.aborted ? { cause: signal.reason } : undefined));
          else done({ code, stdout, aborted: false });
        });
        if (signal.aborted) stop();
      });
      return result;
    }, { binary: safeChecksText(binary, this.secrets), args: displayArgs });
  }
}
