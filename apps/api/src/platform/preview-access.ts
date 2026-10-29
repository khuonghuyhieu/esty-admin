import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function previewAccess(key: string, origin: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid preview access configuration.');
  const expected = Buffer.from(key, 'hex');
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method === 'OPTIONS') {
      const headers = request.headers['access-control-request-headers'];
      if (request.headers.origin === origin && request.headers['access-control-request-method'] === 'GET'
        && (headers === undefined || (typeof headers === 'string' && headers.split(',').every(value => value.trim().toLowerCase() === 'authorization')))) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
        response.setHeader('Access-Control-Allow-Methods', 'GET');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization');
        response.statusCode = 204;
        response.end();
        return;
      }
    } else {
      const authorization = request.headers.authorization;
      let count = 0;
      for (let i = 0; i < request.rawHeaders.length; i += 2) if (request.rawHeaders[i]?.toLowerCase() === 'authorization') count++;
      if (count === 1 && typeof authorization === 'string' && /^Bearer [a-f0-9]{64}$/.test(authorization)
        && timingSafeEqual(Buffer.from(authorization.slice(7), 'hex'), expected)) { next(); return; }
    }
    response.statusCode = 401;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end('{"status":"unauthorized"}');
  };
}
