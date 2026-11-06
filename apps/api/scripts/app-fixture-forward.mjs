import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, unlink } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureProfile } from './app-fixture-profile.mjs';

const profile = fixtureProfile();
const project = profile.project;
const localHost = 'unix:///Users/khuonghuyhieu/.orbstack/run/docker.sock';
const executable = '/usr/local/bin/docker';
const source = fileURLToPath(import.meta.url);
const routes = [[profile.databasePort, 'db', '5432'], [profile.authPort, '127.0.0.1', '9999'], [profile.mailPort, 'mail', '8025']];
const limits = { connections: 16, identityMs: 1000, firstResponseMs: 3000, idleMs: 15000, totalMs: 60000, killMs: 500 };

async function context(directory) {
  const prefix = join(await realpath(tmpdir()), profile.prefix);
  if (!directory.startsWith(prefix) || await realpath(directory) !== directory || (await lstat(directory)).isSymbolicLink()) throw new Error('FIXTURE_DIRECTORY_REFUSED');
  const stat = await lstat(directory);
  if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('FIXTURE_DIRECTORY_PERMISSIONS');
  async function ownedJson(name) {
    const handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > 65536) throw new Error('FIXTURE_FILE_REFUSED');
      return JSON.parse(await handle.readFile('utf8'));
    } finally { await handle.close(); }
  }
  const state = await ownedJson('state.json');
  if (state.project !== project || (state.profile ?? '006') !== profile.name || (state.timebox ?? 'false') !== String(profile.timebox)
    || !/^[a-f0-9]{32}$/.test(state.nonce) || !/^f005_[a-f0-9]{32}$/.test(state.database)
    || (profile.name === 'activation001' && state.nonce !== process.env.F001_RUN_NONCE)) throw new Error('FIXTURE_IDENTITY_REFUSED');
  if (Object.keys(await ownedJson('docker/config.json')).length !== 0 || process.env.DOCKER_HOST !== localHost) throw new Error('FIXTURE_DOCKER_CONTEXT_REFUSED');
  const control = join(directory, profile.name === 'activation001' ? 'f001.sock' : 'forwarder.sock');
  if (Buffer.byteLength(control) >= 104) throw new Error('FORWARDER_CONTROL_PATH_REFUSED');
  return { directory, state, ownedJson, env: { PATH: process.env.PATH, HOME: directory, DOCKER_HOST: localHost },
    base: ['--config', join(directory, 'docker')], marker: join(directory, 'forwarder.json'), control };
}
function inspect(ctx, args, signal) {
  return new Promise((resolve, reject) => {
    execFile(executable, [...ctx.base, ...args], { env: ctx.env, signal, timeout: limits.identityMs,
      maxBuffer: 65536, encoding: 'utf8' }, (error, stdout) => error ? reject(new Error('FIXTURE_INSPECTION_FAILED')) : resolve(stdout.trim()));
  });
}
async function initialIdentity(ctx) {
  const signal = AbortSignal.timeout(3000);
  const ids = (await inspect(ctx, ['ps', '-q', '--filter', `label=com.docker.compose.project=${project}`,
    '--filter', 'label=com.docker.compose.service=auth'], signal)).split('\n').filter(Boolean);
  const networks = (await inspect(ctx, ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`], signal)).split('\n').filter(Boolean);
  if (ids.length !== 1 || networks.length !== 1 || ![...ids, ...networks].every(id => /^[a-f0-9]{12,64}$/.test(id))) throw new Error('FIXTURE_RESOURCE_SET_REFUSED');
  const id = await inspect(ctx, ['inspect', '--format', '{{.Id}}', ids[0]], signal);
  const network = await inspect(ctx, ['network', 'inspect', '--format', '{{.Id}}', networks[0]], signal);
  if (![id, network].every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error('FIXTURE_RESOURCE_ID_REFUSED');
  await verifyIdentity(ctx, { id, network }, signal);
  return { id, network };
}
async function verifyIdentity(ctx, identity, signal) {
  const container = JSON.parse(await inspect(ctx, ['inspect', '--format',
    '{"id":{{json .Id}},"labels":{{json .Config.Labels}},"running":{{json .State.Running}},"networks":{{json .NetworkSettings.Networks}}}', identity.id], signal));
  const network = JSON.parse(await inspect(ctx, ['network', 'inspect', '--format',
    '{"id":{{json .Id}},"labels":{{json .Labels}},"internal":{{json .Internal}},"containers":{{json .Containers}}}', identity.network], signal));
  const labelsMatch = labels => labels?.['esty005.run'] === ctx.state.nonce && labels?.['com.docker.compose.project'] === project;
  const attached = Object.values(container.networks ?? {});
  if (container.id !== identity.id || !container.running || !labelsMatch(container.labels)
    || container.labels['com.docker.compose.service'] !== 'auth' || attached.length !== 1 || attached[0].NetworkID !== identity.network
    || network.id !== identity.network || network.internal !== true || !labelsMatch(network.labels)
    || !Object.hasOwn(network.containers ?? {}, identity.id)) throw new Error('FIXTURE_RESOURCE_IDENTITY_CHANGED');
}
async function start(ctx) {
  if (process.argv[4] !== '--approved-local-forward') throw new Error('FORWARDER_APPROVAL_REQUIRED');
  if (await lstat(ctx.marker).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
    || await lstat(ctx.control).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) throw new Error('EXISTING_FORWARDER_REFUSED');
  const identity = await initialIdentity(ctx), signature = randomUUID();
  const sockets = new Set(), children = new Map(), servers = [];
  const shutdown = new AbortController();
  let stopping = false, control, markerWritten = false;
  async function stop(reply) {
    if (stopping) { reply?.destroy(); return; }
    stopping = true;
    shutdown.abort();
    for (const socket of sockets) socket.destroy();
    await Promise.all([...children.values()]);
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    if (reply) { reply.end(JSON.stringify({ stopped: true, runId: ctx.state.nonce, pid: process.pid }) + '\n'); }
    if (control) await new Promise(resolve => control.close(resolve));
    if (markerWritten) {
      const marker = await ctx.ownedJson('forwarder.json');
      if (marker.startSignature !== signature || marker.pid !== process.pid) throw new Error('FORWARDER_MARKER_CHANGED');
      await unlink(ctx.marker);
    }
  }
  function accept(socket, host, port) {
    if (stopping || sockets.size >= limits.connections) { socket.destroy(); return; }
    sockets.add(socket); socket.pause();
    const abort = new AbortController();
    let child, killTimer, closed = false;
    const first = setTimeout(() => socket.destroy(), limits.firstResponseMs);
    const total = setTimeout(() => socket.destroy(), limits.totalMs);
    socket.setTimeout(limits.idleMs, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.once('close', () => {
      closed = true; sockets.delete(socket); abort.abort(); clearTimeout(first); clearTimeout(total);
      socket.setTimeout(0);
      if (child) {
        socket.unpipe(child.stdin); child.stdin.destroy(); child.stdout.unpipe(socket);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), limits.killMs);
        }
      }
    });
    void (async () => {
      await verifyIdentity(ctx, identity, AbortSignal.any([shutdown.signal, abort.signal]));
      if (closed || stopping) return;
      child = spawn(executable, [...ctx.base, 'exec', '-i', identity.id, '/bin/busybox', 'nc', host, port],
        { env: ctx.env, stdio: ['pipe', 'pipe', 'pipe'] });
      let resolveClosed;
      children.set(child, new Promise(resolve => { resolveClosed = resolve; }));
      child.stderr.resume(); // Discard raw Docker/provider stderr, never log traffic.
      child.stdin.on('error', () => socket.destroy());
      child.stdout.on('error', () => socket.destroy());
      child.stdout.once('data', () => clearTimeout(first));
      child.once('error', () => socket.destroy());
      child.once('close', code => {
        clearTimeout(killTimer); children.delete(child); resolveClosed();
        if (code === 0) socket.end(); else socket.destroy();
      });
      socket.pipe(child.stdin); child.stdout.pipe(socket); socket.resume();
    })().catch(() => socket.destroy());
  }
  try {
    for (const [port, host, targetPort] of routes) {
      const server = createServer({ allowHalfOpen: true }, socket => accept(socket, host, targetPort));
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port, exclusive: true }, () => { server.removeListener('error', reject); resolve(); });
      });
      server.on('error', () => { void stop().catch(() => { process.exitCode = 1; }); });
    }
    control = createServer(socket => {
      let bytes = '';
      socket.setTimeout(1000, () => socket.destroy());
      socket.on('error', () => socket.destroy());
      socket.on('data', chunk => {
        bytes += chunk.toString('utf8');
        if (bytes.length > 512) { socket.destroy(); return; }
        if (!bytes.includes('\n')) return;
        try {
          const request = JSON.parse(bytes);
          if (request.action !== 'stop' || request.runId !== ctx.state.nonce || request.startSignature !== signature) { socket.destroy(); return; }
          socket.setTimeout(0); socket.removeAllListeners('data');
          void stop(socket).catch(() => { socket.destroy(); process.exitCode = 1; });
        } catch { socket.destroy(); }
      });
    });
    await new Promise((resolve, reject) => { control.once('error', reject); control.listen(ctx.control, resolve); });
    const marker = await open(ctx.marker, 'wx', 0o600);
    try {
      await marker.writeFile(JSON.stringify({ project, runId: ctx.state.nonce, pid: process.pid, startSignature: signature,
        source, sourceSha256: createHash('sha256').update(await readFile(source)).digest('hex'), identity, limits }) + '\n');
      await marker.sync(); markerWritten = true;
    } finally { await marker.close(); }
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void stop().catch(() => { process.exitCode = 1; }); });
    console.info(JSON.stringify({ status: 'forwarding', project, runId: ctx.state.nonce, pid: process.pid, ports: routes.map(route => route[0]), limits }));
  } catch {
    await stop();
    throw new Error('FORWARDER_START_FAILED_NO_RESOURCE_ADOPTION');
  }
}
async function requestStop(ctx) {
  const marker = await ctx.ownedJson('forwarder.json');
  if (marker.project !== project || marker.runId !== ctx.state.nonce || marker.source !== source
    || !Number.isSafeInteger(marker.pid) || marker.pid < 1 || !/^[a-f0-9-]{36}$/.test(marker.startSignature)) throw new Error('FORWARDER_STOP_IDENTITY_REFUSED');
  await new Promise((resolve, reject) => {
    const socket = createConnection(ctx.control);
    let result = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('FORWARDER_STOP_TIMEOUT')));
    socket.once('connect', () => socket.write(JSON.stringify({ action: 'stop', runId: ctx.state.nonce, startSignature: marker.startSignature }) + '\n'));
    socket.on('data', chunk => { result += chunk; if (result.length > 512) socket.destroy(new Error('FORWARDER_STOP_REPLY_REFUSED')); });
    socket.once('error', reject);
    socket.once('end', () => {
      try {
        const value = JSON.parse(result);
        if (!value.stopped || value.runId !== ctx.state.nonce || value.pid !== marker.pid) throw new Error('FORWARDER_STOP_REPLY_REFUSED');
        resolve();
      } catch { reject(new Error('FORWARDER_STOP_REPLY_REFUSED')); }
    });
  });
  console.info('Owned forwarder stopped by run-bound control socket; no PID signal was used.');
}
try {
  const ctx = await context(process.argv[3] ?? '');
  if (process.argv[2] === 'start') await start(ctx);
  else if (process.argv[2] === 'stop') await requestStop(ctx);
  else throw new Error('FORWARDER_COMMAND_REFUSED');
} catch (error) {
  console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'FORWARDER_FAILED_SAFELY');
  process.exitCode = 1;
}
