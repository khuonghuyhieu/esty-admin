import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EtsyConfig } from '../config/config.js';
import { AppError } from '../app-foundation/application/errors.js';
import { EtsyService } from './service.js';
import type { previewAccess } from '../platform/preview-access.js';

export function callbackInput(raw: string): { state: string; code: string | null } {
  if (Buffer.byteLength(raw) > 4096 || /%(?![a-f0-9]{2})/i.test(raw)) throw new AppError('invalid_request');
  const params = new URLSearchParams(raw), keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || !/^[A-Za-z0-9_-]{43}$/.test(params.get('state') ?? '')) throw new AppError('invalid_request');
  if (params.has('code')) {
    if (keys.length !== 2 || !/^[\x21-\x7e]{1,2048}$/.test(params.get('code') ?? '')) throw new AppError('invalid_request');
    return { state: params.get('state')!, code: params.get('code')! };
  }
  if (!params.get('error') || keys.some(key => !['state', 'error', 'error_description', 'error_uri'].includes(key))) throw new AppError('invalid_request');
  return { state: params.get('state')!, code: null };
}

async function boundedBody(request: IncomingMessage, maximum: number, signal: AbortSignal): Promise<unknown> {
  if (request.headers['content-type'] !== 'application/json'
    || (request.headers['content-length'] !== undefined && (!/^\d+$/.test(request.headers['content-length']) || Number(request.headers['content-length']) > maximum))) throw new AppError('invalid_request');
  const chunks: Buffer[] = [];
  let size = 0;
  const abort = (): void => { request.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for await (const chunk of request) {
      signal.throwIfAborted();
      size += Buffer.byteLength(chunk);
      if (size > maximum) throw new AppError('invalid_request');
      chunks.push(Buffer.from(chunk));
    }
    signal.throwIfAborted();
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
  } catch { throw new AppError('invalid_request'); }
  finally { signal.removeEventListener('abort', abort); }
}

export function etsyIngress(config: EtsyConfig, service: EtsyService, authorize: ReturnType<typeof previewAccess>) {
  const callbackHost = new URL(config.callbackUrl).host;
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const raw = request.url ?? '';
    let hostCount = 0;
    for (let i = 0; i < request.rawHeaders.length; i += 2) if (request.rawHeaders[i]?.toLowerCase() === 'host') hostCount++;
    const callback = request.method === 'GET' && (raw === '/integrations/etsy/callback' || raw.startsWith('/integrations/etsy/callback?'))
      && request.headers.host === callbackHost && hostCount === 1;
    const start = request.method === 'POST' && raw === '/integrations/etsy/invite/start'
      && request.headers.host === callbackHost && hostCount === 1;
    if (!callback && !start) { next(); return; }
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (start) {
      let authenticated = false;
      authorize(request, response, () => { authenticated = true; });
      if (!authenticated) return;
    }
    const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 8000);
    const abort = (): void => { if (!response.writableEnded) controller.abort(); };
    response.once('close', abort);
    void (async () => {
      try {
        let location: string;
        if (start) {
          if (request.headers.origin !== config.invitationOrigin || request.headers['sec-fetch-site'] === 'cross-site') throw new AppError('invalid_request');
          const body = await boundedBody(request, 8192, controller.signal);
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('secret' in body) || typeof body.secret !== 'string') throw new AppError('invalid_request');
          location = await service.start(body.secret, controller.signal);
        } else {
          const input = callbackInput(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '');
          try { await service.callback(input.state, input.code, controller.signal); }
          catch (error) {
            if (!(error instanceof AppError) || !['upstream_unavailable', 'upstream_rate_limited', 'outcome_unknown', 'reconnect_required'].includes(error.code)) throw error;
          }
          location = `${config.returnOrigin}/`;
        }
        if (!response.destroyed) {
          response.statusCode = 303;
          response.setHeader('Location', location);
          response.end();
        }
      } catch (error) {
        if (!response.destroyed) {
          response.statusCode = error instanceof AppError && error.code !== 'dependency_unavailable' ? 400 : 503;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end('Connection request unavailable.');
        }
      } finally {
        clearTimeout(deadline);
        response.removeListener('close', abort);
      }
    })();
  };
}

export function etsyBodyLimit(request: IncomingMessage & { body?: unknown }, response: ServerResponse, next: () => void): void {
  if (request.method !== 'POST' || !(request.url ?? '').startsWith('/v1/app/integrations/etsy/')) { next(); return; }
  const signal = AbortSignal.timeout(8000);
  void boundedBody(request, 16384, signal).then(body => { request.body = body; next(); }).catch(() => {
    if (!response.destroyed) {
      response.statusCode = 400;
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ code: 'invalid_request', requestId: randomUUID() }));
    }
  });
}
