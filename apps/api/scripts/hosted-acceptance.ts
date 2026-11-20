import type { ChecksDiagnostics } from './checks-diagnostics.js';
export type HostedRequest = (url: string, init?: RequestInit) => Promise<Response>;
async function exact(response: Response, status: number, expected: Record<string, string>,
  diagnostics?: ChecksDiagnostics, name = 'health'): Promise<void> {
  diagnostics?.check(`${name}.status`, response.status === status && !response.redirected && response.body !== null,
    'unexpected-status-redirect-or-empty-body', { actual: response.status, expected: status, redirected: response.redirected });
  if (response.status !== status || response.redirected || !response.body) {
    await response.body?.cancel(); throw new Error('Hosted application acceptance failed.');
  }
  const reader = response.body.getReader(); let text = '', bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.length;
      if (bytes > 4096) {
        diagnostics?.event(`${name}.body-size`, 'failed', 'response-exceeds-bound', { actual: bytes, maximum: 4096 });
        throw new Error('Hosted response exceeds bounds.');
      }
      text += Buffer.from(part.value).toString('utf8');
    }
  } catch (cause) {
    diagnostics?.event(`${name}.body`, 'failed', 'body-read-failed-or-exceeds-bound', { bytes }, cause); throw cause;
  } finally {
    await reader.cancel().catch(cause => diagnostics?.event(`${name}.body-cancel`, 'failed', 'best-effort-body-cancel-failed', {}, cause));
    reader.releaseLock();
  }
  diagnostics?.event(`${name}.body`, 'passed', 'bounded-body-read-payload-omitted', { bytes, maximum: 4096 });
  const value: unknown = diagnostics ? diagnostics.sync(`${name}.json`, () => JSON.parse(text)) : JSON.parse(text);
  const valid = Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value!).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, entry]) => (value as Record<string, unknown>)[key] === entry);
  diagnostics?.check(`${name}.schema`, valid, 'response-contract-differs');
  if (!valid) throw new Error('Hosted application contract differs.');
}
// Shared candidate/final-domain acceptance; caller independently establishes deployment binding and TLS origin.
export async function checkHostedHttp(origin: string, browserOrigin: string, key: string, request: HostedRequest,
  readiness: 'current' | 'migrations_pending' = 'current', diagnostics?: ChecksDiagnostics): Promise<void> {
  if (readiness !== 'current' && readiness !== 'migrations_pending') throw new Error('Explicit hosted readiness predicate required.');
  const authorization = { Authorization: `Bearer ${key}` };
  await exact(await request(origin + '/health/live', { headers: authorization }), 200, { status: 'ok' }, diagnostics, 'health.live');
  await exact(await request(origin + '/health/ready', { headers: authorization }), readiness === 'current' ? 200 : 503,
    readiness === 'current' ? { status: 'ready', database: 'up', migrations: 'current' }
      : { status: 'degraded', reason: 'migrations_pending' }, diagnostics, 'health.ready');
  for (const token of [undefined, 'malformed', '0'.repeat(64) === key ? '1'.repeat(64) : '0'.repeat(64)]) {
    await exact(await request(origin + '/health/ready', { headers: token ? { Authorization: `Bearer ${token}` } : {} }), 401,
      { status: 'unauthorized' }, diagnostics, token === undefined ? 'health.no-auth' : token === 'malformed' ? 'health.malformed-auth' : 'health.wrong-auth');
  }
  const unknown = await request(origin + '/__release_unknown_route', { headers: authorization });
  await unknown.body?.cancel();
  diagnostics?.check('health.unknown-route', unknown.status === 404 && !unknown.redirected, 'unexpected-route-status', { actual: unknown.status, expected: 404 });
  if (unknown.status !== 404 || unknown.redirected) throw new Error('Hosted route acceptance failed.');
  for (const allowedOrigin of [browserOrigin, 'https://untrusted.example']) {
    const response = await request(origin + '/health/ready', { method: 'OPTIONS', headers: {
      Origin: allowedOrigin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization',
    } });
    await response.body?.cancel();
    const valid = !response.redirected && response.status === (allowedOrigin === browserOrigin ? 204 : 401)
      && (allowedOrigin !== browserOrigin || response.headers.get('access-control-allow-origin') === browserOrigin);
    diagnostics?.check(allowedOrigin === browserOrigin ? 'health.allowed-origin' : 'health.denied-origin', valid,
      'cors-contract-differs', { actual: response.status, expected: allowedOrigin === browserOrigin ? 204 : 401 });
    if (!valid) throw new Error('Hosted origin acceptance failed.');
  }
}
