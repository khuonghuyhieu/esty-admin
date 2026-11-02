export type HostedRequest = (url: string, init?: RequestInit) => Promise<Response>;
async function exact(response: Response, status: number, expected: Record<string, string>): Promise<void> {
  if (response.status !== status || response.redirected || !response.body) {
    await response.body?.cancel(); throw new Error('Hosted application acceptance failed.');
  }
  const reader = response.body.getReader(); let text = '', bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.length;
      if (bytes > 4096) throw new Error('Hosted response exceeds bounds.');
      text += Buffer.from(part.value).toString('utf8');
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== Object.keys(expected).length
    || Object.entries(expected).some(([key, entry]) => (value as Record<string, unknown>)[key] !== entry)) {
    throw new Error('Hosted application contract differs.');
  }
}
// Shared candidate/final-domain acceptance; caller independently establishes deployment binding and TLS origin.
export async function checkHostedHttp(origin: string, browserOrigin: string, key: string, request: HostedRequest): Promise<void> {
  const authorization = { Authorization: `Bearer ${key}` };
  await exact(await request(origin + '/health/live', { headers: authorization }), 200, { status: 'ok' });
  await exact(await request(origin + '/health/ready', { headers: authorization }), 200, { status: 'ready', database: 'up', migrations: 'current' });
  for (const token of [undefined, 'malformed', '0'.repeat(64) === key ? '1'.repeat(64) : '0'.repeat(64)]) {
    await exact(await request(origin + '/health/ready', { headers: token ? { Authorization: `Bearer ${token}` } : {} }), 401, { status: 'unauthorized' });
  }
  const unknown = await request(origin + '/__release_unknown_route', { headers: authorization });
  await unknown.body?.cancel();
  if (unknown.status !== 404 || unknown.redirected) throw new Error('Hosted route acceptance failed.');
  for (const allowedOrigin of [browserOrigin, 'https://untrusted.example']) {
    const response = await request(origin + '/health/ready', { method: 'OPTIONS', headers: {
      Origin: allowedOrigin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization',
    } });
    await response.body?.cancel();
    if (response.redirected || response.status !== (allowedOrigin === browserOrigin ? 204 : 401)
      || (allowedOrigin === browserOrigin && response.headers.get('access-control-allow-origin') !== browserOrigin)) {
      throw new Error('Hosted origin acceptance failed.');
    }
  }
}
