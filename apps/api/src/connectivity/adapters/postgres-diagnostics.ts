import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import { TLSSocket } from 'node:tls';
import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import type { DatabaseState } from '../application/readiness.js';

type Phase = 'pool_acquire' | 'dns' | 'tcp' | 'ssl_request' | 'tls_handshake'
  | 'authentication' | 'server_ready' | 'schema_query' | 'history_query';

const codes: Record<string, true> = {
  ENOTFOUND: true, EAI_AGAIN: true, ENETUNREACH: true, EHOSTUNREACH: true,
  ECONNREFUSED: true, ECONNRESET: true, ETIMEDOUT: true, EPIPE: true,
  ERR_TLS_CERT_ALTNAME_INVALID: true, CERT_HAS_EXPIRED: true, CERT_NOT_YET_VALID: true,
  DEPTH_ZERO_SELF_SIGNED_CERT: true, SELF_SIGNED_CERT_IN_CHAIN: true,
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: true, UNABLE_TO_GET_ISSUER_CERT_LOCALLY: true,
  '08001': true, '08004': true, '08006': true, '08P01': true, '28000': true, '28P01': true,
  '3D000': true, '42501': true, '42P01': true, '3F000': true,
  '53300': true, '57014': true, '57P01': true, '57P02': true, '57P03': true,
};

export const acquisitionDiagnostic = new AsyncLocalStorage<ReadinessDiagnostic>();

export class ReadinessDiagnostic {
  private readonly started = performance.now();
  private phase: Phase = 'pool_acquire';
  private readonly phases: Partial<Record<Phase, number>> = { pool_acquire: 0 };
  private finished = false;
  private tlsVerified = false;

  enter(phase: Phase): void {
    if (this.finished || this.phases[phase] !== undefined) return;
    this.phase = phase;
    this.phases[phase] = Math.round(performance.now() - this.started);
  }

  verifiedTls(): void {
    if (this.finished) return;
    this.tlsVerified = true;
    this.enter('authentication');
  }

  finish(state: DatabaseState, error?: unknown): void {
    if (this.finished) return;
    this.finished = true;
    const errorClass = error instanceof TypeError ? 'TypeError' : error instanceof RangeError ? 'RangeError'
      : error instanceof Error ? 'Error' : undefined;
    // pg-pool may wrap the original connection error. Never serialize that error.
    const source = error instanceof Error && !('code' in error) && error.cause instanceof Error ? error.cause : error;
    const candidate = source instanceof Error && 'code' in source ? source.code : undefined;
    const code = typeof candidate === 'string' && codes[candidate] === true ? candidate : undefined;
    try {
      console.info(JSON.stringify({ event: 'readiness_diagnostic', phase: this.phase, state,
        elapsed_ms: Math.round(performance.now() - this.started), phases_ms: this.phases,
        tls_verified_this_attempt: this.tlsVerified, errorClass, code }));
    } catch { /* Diagnostic output must not change readiness or resource cleanup. */ }
  }
}

// Observe the pinned pg client's own transport. Do not replace sockets, TLS,
// authentication or connect callbacks. Async context isolates concurrent probes.
export class DiagnosticClient extends Client {
  constructor(config?: ClientConfig) {
    super(config);
    const diagnostic = acquisitionDiagnostic.getStore();
    if (!diagnostic) return;
    const connection = this.connection;
    diagnostic.enter(this.host && !isIP(this.host) && !this.host.startsWith('/') ? 'dns' : 'tcp');
    connection.stream.once('lookup', (error: unknown) => { if (!error) diagnostic.enter('tcp'); });
    connection.once('connect', () => diagnostic.enter(this.ssl ? 'ssl_request' : 'authentication'));
    connection.once('sslconnect', () => {
      diagnostic.enter('tls_handshake');
      const secure = connection.stream;
      secure.once('secureConnect', () => {
        if (secure instanceof TLSSocket && secure.authorized) diagnostic.verifiedTls();
      });
    });
    connection.once('authenticationOk', () => diagnostic.enter('server_ready'));
  }
}
