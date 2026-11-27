import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MiB = 1024 * 1024;
const sensitive = /password|secret|token|authorization|cookie|credential|(?:api|private|access)[_-]?key/i;
interface Limits {
  secrets?: readonly string[]; outputLimit?: number; fileLimit?: number; totalLimit?: number; lineLimit?: number;
  scope?: 'checks' | 'release'; correlation?: string; runId?: string;
}
interface Stage {
  id: string; stage: string; parents: string[]; startedAt: string; durationMs: number; status: 'running' | 'passed' | 'failed';
  correlation: string; runId: string | null;
  command?: { binary: string; args: string[] }; code?: number | null; signal?: string | null; aborted?: boolean;
  outputLimit?: boolean; outputBytes?: number; stdout?: string; stderr?: string; error?: string;
  truncation: string[]; persistenceErrors: string[];
  omittedBytes?: number; omittedCharacters?: number;
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

const releaseErrorCategories: Readonly<Record<string, string>> = {
  EACCES: 'permission', EPERM: 'permission', ENOENT: 'io', ELOOP: 'io', ENOSPC: 'io', EIO: 'io',
  ECONNRESET: 'connection', ECONNREFUSED: 'connection', EPIPE: 'connection', ENOTFOUND: 'connection',
  EAI_AGAIN: 'connection', EHOSTUNREACH: 'connection', ENETUNREACH: 'connection',
  ETIMEDOUT: 'timeout', ABORT_ERR: 'cancelled', ERR_ASSERTION: 'validation', ERR_OUT_OF_RANGE: 'validation',
  '28P01': 'authentication', '28000': 'authentication', '42501': 'permission',
  '08000': 'connection', '08001': 'connection', '08003': 'connection', '08004': 'connection',
  '08006': 'connection', '08007': 'connection', '08P01': 'connection',
  '3D000': 'sql', '42P01': 'sql', '42703': 'sql', '53300': 'sql', '53400': 'sql',
  '57P01': 'connection', '57P02': 'connection', '57P03': 'connection',
  '57014': 'cancelled', '55P03': 'sql', '40001': 'sql', '40P01': 'sql',
  CERT_HAS_EXPIRED: 'tls', DEPTH_ZERO_SELF_SIGNED_CERT: 'tls', SELF_SIGNED_CERT_IN_CHAIN: 'tls',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls', UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'tls', ERR_TLS_CERT_ALTNAME_INVALID: 'tls',
};

/** Private errors retain stack locations/cause topology, never arbitrary messages or payloads. */
export function safeReleaseError(error: unknown): string {
  const parts: string[] = [], seen = new Set<unknown>();
  for (let depth = 0; error !== undefined && depth < 8; depth++) {
    if (seen.has(error)) { parts.push('[OMITTED circular cause]'); return parts.join('\nCaused by: '); }
    seen.add(error);
    if (!(error instanceof Error)) { parts.push('[REDACTED non-Error payload]'); return parts.join('\nCaused by: '); }
    const stage = (error as Error & { sqlStage?: unknown }).sqlStage;
    const sqlStage = typeof stage === 'string' && /^(?:assets|connect|begin|history-query|commit)$/.test(stage) ? stage : 'omitted';
    const detail = sqlStage !== 'omitted' && error.cause instanceof Error ? error.cause : error;
    const code = (detail as NodeJS.ErrnoException).code;
    const safeCode = typeof code === 'string' && Object.hasOwn(releaseErrorCategories, code) ? code : 'omitted';
    // Code-less driver timeout messages are compared exactly, never printed or inferred from elapsed time.
    const category = safeCode !== 'omitted' ? releaseErrorCategories[safeCode]!
      : detail.name === 'TimeoutError' || detail.message === 'timeout expired'
        || detail.message === 'Connection terminated due to connection timeout' ? 'timeout' : 'unknown';
    const locations = (error.stack ?? '').slice(0, 65536).split('\n').slice(1, 33).flatMap(line => {
      const match = line.match(/(?:\/|\\)((?:ci-delivery|ci-provider|ci-tools|ci-migrations|checks-diagnostics|routine-retained|activation-retained|activation-preflight-disposition|activation-held-proof|historical-release|etsy-release|hosted-acceptance|vercel-deploy|artifact|ci|release-journal|private-files|migrations|bounded|ci\.test|etsy\.test|integration\.test|release\.test)\.(?:m?js|ts)):(\d{1,8}):(\d{1,8})\)?$/);
      return match ? [`    at ${match[1]}:${match[2]}:${match[3]}`] : [];
    });
    parts.push(`[REDACTED error message; untrusted provider/SQL payload; code=${safeCode}; category=${category}; sqlStage=${sqlStage}]\n${locations.join('\n')}`);
    error = error.cause;
  }
  if (error !== undefined) parts.push('[OMITTED cause depth exceeds8]');
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
  readonly correlation: string;
  readonly scope: 'checks' | 'release';
  private eventSequence = 0;
  private eventBytes = 0;
  private omittedEvents = 0;
  private firstCheck?: string;
  private storageReady = false;
  readonly runId: string | null;
  constructor(directory: string, limits: Limits = {}) {
    this.directory = resolve(directory); this.secrets = [];
    this.scope = limits.scope ?? 'checks';
    this.correlation = limits.correlation && /^[a-zA-Z0-9_.:-]{1,120}$/.test(limits.correlation)
      ? limits.correlation : randomUUID();
    this.runId = limits.runId && /^[1-9][0-9]{0,15}$/.test(limits.runId) ? limits.runId : null;
    for (const secret of limits.secrets ?? []) this.secret(secret);
    this.outputLimit = limits.outputLimit ?? 4 * MiB; this.fileLimit = limits.fileLimit ?? 4 * MiB;
    this.totalLimit = limits.totalLimit ?? 64 * MiB; this.lineLimit = limits.lineLimit ?? 16384;
    for (const value of [this.outputLimit, this.fileLimit, this.totalLimit, this.lineLimit]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 64 * MiB) throw new Error('Invalid checks diagnostic bound.');
    }
    try {
      fs.mkdirSync(this.directory, { mode: 0o700, recursive: this.scope === 'release' });
      const info = fs.lstatSync(this.directory);
      if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) {
        throw new Error('Diagnostic directory must be owner-only.');
      }
      this.storageReady = true;
    } catch (error) {
      if (this.scope !== 'release') throw error;
      this.persistenceErrors.push(safeReleaseError(error));
      this.console({ event: 'diagnostics-init-failed', correlation: this.correlation, reason: 'storage-unavailable', error: safeReleaseError(error) }, true);
    }
  }
  private secret(value: string) {
    if (!value || this.secrets.includes(value)) return;
    if (value.length > 8192 || this.secrets.length >= 128) throw new Error('Checks redaction input exceeds its bound.');
    this.secrets.push(value);
  }
  error(error: unknown): string {
    try { return this.scope === 'release' ? safeChecksText(safeReleaseError(error), this.secrets) : safeChecksError(error, this.secrets); }
    catch { return '[OMITTED unreadable error properties; primary operation failure preserved]'; }
  }
  registerSecrets(values: readonly string[]): void {
    for (const value of values) {
      if (typeof value === 'string' && value.length <= 8192 && this.secrets.length < 128) this.secret(value);
      else this.event('redaction.registration', 'not-run', 'private-value-exceeds-mask-bound-payload-omitted');
    }
  }
  /** Values must already be public projections; strings are restricted to fixed codes, not payloads. */
  event(check: string, status: 'started' | 'passed' | 'failed' | 'not-run', reason: string,
    values: Record<string, number | boolean | null | string> = {}, error?: unknown): void {
    const safeName = (value: string) => /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : 'invalid-diagnostic-label';
    const metadata: Record<string, number | boolean | null | string> = {};
    for (const [key, value] of Object.entries(values).slice(0, 32)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,48}$/.test(key)) continue;
      if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) metadata[key] = value;
      else if (typeof value === 'string') {
        const pattern = /^(?:actual|expected)Revision$/.test(key) ? /^[a-f0-9]{40}$/
          : /^(?:actual|expected)Id$/.test(key) ? /^(?:[1-9][0-9]{0,15}|dpl_[A-Za-z0-9]{1,124})$/
          : /^(?:actual|expected)Mode$/.test(key) ? /^(?:current-schema-only|versioned-migration|etsy-strict-cutover|activation)$/
          : key === 'route' ? /^(?:artifact-metadata|run-metadata|run-jobs|run-artifacts|deployment|deployment-statuses|environment-binding|environment-gate|source-content|commit|artifact-download|artifact-blob|release-metadata|release-tag|release-asset|release-blob|unclassified)$/
          : /^(?:actual|expected)Context$/.test(key) ? /^(?:true|false|workflow_dispatch|push|pull_request|pull_request_target|be-production|preview|refs\/heads\/main|khuonghuyhieu\/esty-admin|khuonghuyhieu\/esty-admin\/\.github\/workflows\/be-delivery\.yml@refs\/heads\/main|[1-9][0-9]{0,2})$/ : null;
        if (pattern?.test(value)) metadata[key] = safeChecksText(value, this.secrets);
        else metadata[`${key}Omitted`] = true;
      }
    }
    const firstFailure = status === 'failed' && this.firstCheck === undefined;
    if (firstFailure) this.firstCheck = safeName(check);
    const record = { version: 1, runId: this.runId, correlation: this.correlation, sequence: ++this.eventSequence, time: new Date().toISOString(),
      check: safeName(check), status, reason: safeName(reason), values: metadata, firstFailure: this.firstCheck ?? null,
      ...(error === undefined ? {} : { error: this.error(error) }) };
    const bytes = JSON.stringify(record) + '\n';
    if (firstFailure) this.persist(`${this.correlation}-failure.json`, bytes);
    if (this.eventSequence > 8192 || this.eventBytes + Buffer.byteLength(bytes) > 8 * MiB) {
      this.omittedEvents++;
      if (firstFailure) this.console(record, true);
      if (this.omittedEvents === 1) this.console({ event: 'diagnostics-overflow', correlation: this.correlation, reason: 'event-or-byte-limit' }, true);
      this.persist(`${this.correlation}-limits.json`, JSON.stringify({ omittedEvents: this.omittedEvents, reason: 'event-or-byte-limit' }) + '\n');
      return;
    }
    this.eventBytes += Buffer.byteLength(bytes);
    this.persist(`${this.correlation}-events.jsonl`, bytes, true);
    this.console(record, status === 'failed');
  }
  check(name: string, condition: boolean, reason: string, values: Record<string, number | boolean | null | string> = {}): boolean {
    this.event(name, condition ? 'passed' : 'failed', condition ? 'condition-satisfied' : reason, values);
    return condition;
  }
  async boundary<T>(name: string, body: () => Promise<T> | T): Promise<T> {
    const start = performance.now();
    this.event(name, 'started', 'operation-started');
    try {
      const result = await body();
      this.event(name, 'passed', 'operation-completed', { durationMs: Math.round(performance.now() - start) });
      return result;
    } catch (error) {
      this.event(name, 'failed', 'operation-threw', { durationMs: Math.round(performance.now() - start) }, error);
      throw error;
    }
  }
  sync<T>(name: string, body: () => T): T {
    const start = performance.now();
    this.event(name, 'started', 'operation-started');
    try {
      const result = body();
      this.event(name, 'passed', 'operation-completed', { durationMs: Math.round(performance.now() - start) }); return result;
    } catch (error) {
      this.event(name, 'failed', 'operation-threw', { durationMs: Math.round(performance.now() - start) }, error); throw error;
    }
  }
  private console(record: object, failed = false) {
    try { (failed ? console.error : console.info)(JSON.stringify(record)); } catch { /* Never replace the primary failure with console failure. */ }
  }
  private persist(path: string, text: string, append = false) {
    if (!this.storageReady || (append && this.persistenceErrors.length)) return false;
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
      correlation: this.correlation, runId: this.runId,
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
      record.status = 'failed'; record.error = this.error(error);
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
      if (size + bytes > this.fileLimit || this.written + bytes > this.totalLimit) {
        record.omittedBytes = (record.omittedBytes ?? 0) + bytes; mark('disk-limit'); return;
      }
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
            record.omittedCharacters = (record.omittedCharacters ?? 0) + pending.length + end - offset;
            pending = ''; dropping = true; mark('line-limit'); emit('[TRUNCATED diagnostic line exceeds configured limit]\n');
          } else pending += chunk.slice(offset, end);
        }
        else record.omittedCharacters = (record.omittedCharacters ?? 0) + end - offset;
        if (newline < 0) return;
        if (!dropping) emit(pending + '\n');
        pending = ''; dropping = false; offset = newline + 1;
      }
    };
    return { write: (chunk: Buffer) => text(decoder.write(chunk)), end: (truncated: boolean) => {
      text(decoder.end());
      if (truncated) {
        record.omittedCharacters = (record.omittedCharacters ?? 0) + pending.length;
        if (pending) mark('incomplete-line'); pending = ''; mark('output-truncated');
      }
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

// Receipt data is advisory: only fixed labels and bounded scalar measurements reach the summary.
function checksTimingSummary(directory: string, outcomes: ReadonlyMap<string, string>): string[] {
  const setup = resolve(directory, '..', 'be-setup-diagnostics'), checks = resolve(directory, '..', 'be-checks-diagnostics');
  const stages = [
    ['install', 'Setup / install', join(setup, 'install'), 'install'],
    ['codegen', 'Codegen', join(setup, 'codegen'), 'codegen'],
    ['compile', 'Compile', join(setup, 'compile'), 'compile'],
    ['required-checks', 'Inner checks total', checks, 'native-functional-integration-package'],
    ['public-tools', 'Public tools', checks, 'native-functional-integration-package'],
    ['native-build', 'Native build', checks, 'native-functional-integration-package'],
    ['functional-tests', 'Functional tests', checks, 'native-functional-integration-package'],
    ['operator-staging', 'Operator staging', checks, 'native-functional-integration-package'],
    ['native-http-database-tests', 'Native HTTP → test DB', checks, 'native-functional-integration-package'],
    ['verified-transfer', 'Verified transfer', checks, 'native-functional-integration-package'],
  ] as const;
  type Timing = { status: 'passed' | 'failed' | 'running'; durationMs?: number };
  const receipts = new Map<string, Map<string, Timing | null>>();
  for (const path of new Set(stages.map(row => row[2]))) {
    const selected = new Map<string, Timing | null>();
    try {
      const info = fs.lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unavailable receipt directory.');
      const entries = fs.opendirSync(path);
      try {
        let count = 0, bytes = 0;
        for (let entry = entries.readSync(); entry; entry = entries.readSync()) {
          if (++count > 512) throw new Error('Receipt entry bound.');
          if (!/^(?:00[1-9]|0[1-9][0-9]|1[01][0-9]|12[0-8])-stage\.json$/.test(entry.name)) continue;
          const fd = fs.openSync(join(path, entry.name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
          let row;
          try {
            const info = fs.fstatSync(fd);
            if (!info.isFile() || info.size > 65536 || (bytes += info.size) > MiB) throw new Error('Receipt byte bound.');
            const buffer = Buffer.alloc(info.size + 1), size = fs.readSync(fd, buffer, 0, buffer.length, null);
            if (size !== info.size) throw new Error('Receipt changed while reading.');
            row = JSON.parse(buffer.subarray(0, size).toString('utf8'));
          } finally { fs.closeSync(fd); }
          if (!row || typeof row !== 'object' || !stages.some(stage => stage[2] === path && stage[0] === row.stage)) continue;
          const parents = path === checks && row.stage !== 'required-checks' ? ['required-checks'] : [];
          const valid = row.id === entry.name.slice(0, 3) && JSON.stringify(row.parents) === JSON.stringify(parents)
            && ['passed', 'failed', 'running'].includes(row.status)
            && Number.isSafeInteger(row.durationMs) && row.durationMs >= 0 && row.durationMs <= 45 * 60 * 1000;
          selected.set(row.stage, selected.has(row.stage) || !valid ? null
            : { status: row.status, ...(row.status === 'running' ? {} : { durationMs: row.durationMs }) });
        }
      } finally { entries.closeSync(); }
    } catch {
      // Missing, malformed, ambiguous or unreadable evidence cannot imply success or not-run.
      selected.clear();
    }
    receipts.set(path, selected);
  }
  const lines = ['', '#### Measured stages (advisory)', '',
    '| Stage | GitHub step outcome | Receipt status | Duration (s) |',
    '| --- | --- | --- | ---: |'];
  for (const [stage, label, path, step] of stages) {
    const outcome = outcomes.get(step) ?? 'unknown', timing = receipts.get(path)?.get(stage);
    const status = outcome === 'skipped' ? 'not-run' : timing?.status ?? 'unavailable';
    const duration = outcome !== 'skipped' && timing?.durationMs !== undefined ? (timing.durationMs / 1000).toFixed(3) : 'unavailable';
    lines.push(`| ${label} | ${outcome} | ${status} | ${duration} |`);
  }
  lines.push('', 'Durations come from existing stage receipts, not job wall time. Inner checks total includes its child stages; do not sum it with them.',
    'Checkout, Node setup and artifact upload are not timed here. Unavailable receipts do not prove a stage did not run; GitHub outcomes remain authoritative.');
  return lines;
}

// Canonical workflow uses this builtin-only entry before compilation; never provider/SQL commands.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, directory, name, ...args] = process.argv.slice(2);
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let diagnostics: ChecksDiagnostics | undefined;
  try {
    if (!directory || !name || !/^[a-z][a-z0-9-]{0,64}$/.test(name)) throw new Error('Explicit diagnostic directory and fixed phase required.');
    if (action === 'public-command') {
      if (!args[0]) throw new Error('Explicit public command required.');
      fs.mkdirSync(resolve(directory, '..'), { mode: 0o700, recursive: true });
      diagnostics = new ChecksDiagnostics(directory, { runId: process.env.GITHUB_RUN_ID });
      await diagnostics.stage(name, () => diagnostics!.command(args[0]!, args.slice(1), process.cwd(), process.env,
        AbortSignal.any([abort.signal, AbortSignal.timeout(1800000)])));
    } else if (action === 'summary') {
      diagnostics = new ChecksDiagnostics(directory, { scope: 'release', runId: process.env.GITHUB_RUN_ID });
      const lines = [`### BE ${name} diagnostic outcomes (not release approval)`];
      const outcomes = new Map<string, string>();
      if (name === 'checks') {
        const status = /^(?:success|failure|cancelled)$/.test(process.env.CHECKS_JOB_STATUS ?? '') ? process.env.CHECKS_JOB_STATUS : 'unknown';
        lines.push(`CI result before diagnostic uploads: **${status}** (GitHub job.status; not deployment acceptance).`);
      }
      for (const argument of args) {
        const match = argument.match(/^([a-z][a-z0-9-]{0,64})=(success|failure|cancelled|skipped|unknown)$/);
        if (!match) throw new Error('Invalid public step outcome.');
        const [, step, outcome] = match;
        outcomes.set(step!, outcome!);
        diagnostics.event(`workflow.${step}`, outcome === 'success' ? 'passed' : outcome === 'skipped' ? 'not-run' : 'failed',
          outcome === 'skipped' ? 'prerequisite-failed-or-mode-not-selected' : `github-step-${outcome}`);
        lines.push(`- ${step}: ${outcome}`);
      }
      if (name === 'checks') lines.push(...checksTimingSummary(directory, outcomes));
      lines.push('Provider/SQL payloads are omitted. Missing logs or upload failure are not evidence of no effect; inspect retained receipts.');
      if (process.env.GITHUB_STEP_SUMMARY) {
        try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n'); }
        catch (cause) { diagnostics.event('workflow.summary', 'failed', 'summary-write-failed', {}, cause); }
      }
    } else throw new Error('Unsupported diagnostic action.');
  } catch (error) {
    console.error(diagnostics?.error(error) ?? safeReleaseError(error)); process.exitCode = 1;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
