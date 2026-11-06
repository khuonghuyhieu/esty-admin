import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import type { Socket } from 'node:net';
import { TLSSocket, createSecureContext } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';

// Generated certificates and private keys are disposable test material, not
// project credentials. All sockets are hard-bound to the authorized local fixture.
export async function tlsPostgres(t: TestContext, hostname: string, onSecure?: (socket: TLSSocket) => void) {
  const profile = process.env.TEST_FIXTURE_PROFILE;
  if (profile !== undefined && profile !== 'activation001') throw new Error('Unknown synthetic fixture profile.');
  const upstreamPort = profile === 'activation001' ? 55532 : 55432;
  const directory = await mkdtemp(join(tmpdir(), 'esty-synthetic-tls-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'certificate.cnf'), `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\nCN=${hostname}\n[extensions]\nsubjectAltName=DNS:${hostname}\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n`);
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', 'key.pem', '-out', 'cert.pem', '-config', 'certificate.cnf'],
  { cwd: directory, stdio: 'ignore', timeout: 10000 });
  const ca = await readFile(join(directory, 'cert.pem'), 'utf8');
  const context = createSecureContext({ cert: ca, key: await readFile(join(directory, 'key.pem')) });
  const sockets = new Set<Socket>();
  let connections = 0;
  const track = <T extends Socket>(socket: T): T => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
    return socket;
  };
  const server = createServer(socket => {
    connections++;
    track(socket);
    socket.once('data', request => {
      if (request.length !== 8 || request.readInt32BE(0) !== 8 || request.readInt32BE(4) !== 80877103) {
        socket.destroy(); return;
      }
      socket.write('S');
      const secure = track(new TLSSocket(socket, { isServer: true, secureContext: context }));
      secure.once('secure', () => {
        if (onSecure) { onSecure(secure); return; }
        const upstream = track(connect(upstreamPort, '127.0.0.1'));
        secure.pipe(upstream).pipe(secure);
        secure.once('close', () => upstream.destroy());
        upstream.once('close', () => secure.destroy());
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TLS fixture did not bind.');
  return { ca, port: address.port, sockets, get connections() { return connections; } };
}
