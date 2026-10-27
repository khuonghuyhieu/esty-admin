import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import { createApplication } from '../src/app.js';
import { parseConfig } from '../src/config/config.js';
import type { components } from '../src/generated/api.js';

const contract = JSON.parse(readFileSync(new URL('../../../../specs/001-connectivity-foundation/contracts/openapi.json', import.meta.url), 'utf8'));

export function assertContract<S extends keyof components['schemas']>(body: unknown, schema: S): asserts body is components['schemas'][S] {
  const definition = contract.components.schemas[schema];
  assert.ok(body && typeof body === 'object' && !Array.isArray(body));
  assert.deepEqual(Object.keys(body).sort(), [...definition.required].sort());
  for (const [key, value] of Object.entries(body)) {
    const property = definition.properties[key];
    assert.equal(typeof value, property.type);
    if ('const' in property) assert.equal(value, property.const);
    if ('enum' in property) assert.ok(property.enum.includes(value));
  }
}

export async function startApi(databaseUrl: string) {
  const config = parseConfig({ DATABASE_URL: databaseUrl });
  const app = await createApplication(config);
  await app.listen(0, '127.0.0.1');
  return { app, origin: await app.getUrl() };
}

export async function silentPeer() {
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    // Consume input without replying, so peer FIN/close is observable.
    socket.resume();
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    port: address.port,
    sockets,
    async close() {
      for (const socket of sockets) socket.destroy();
      const closed = once(server, 'close');
      server.close();
      await closed;
    },
  };
}

export async function get(origin: string, path: string) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(4500) });
  return { status: response.status, body: await response.json() };
}
