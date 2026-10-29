import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const app = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(app, '../../.openai/cloud-tools/supabase-2.122.0/supabase');
const project = 'esty-admin-local';
const network = 'esty-admin-local-loopback';
const excluded = 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const home = mkdtempSync(join(tmpdir(), 'esty-supabase-local-'));
// Never inherit provider tokens, project overrides, profile/config paths or PG*.
const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: home, SUPABASE_HOME: home };
function run(binary, args, allowFailure = false) {
  const result = spawnSync(binary, args, { env, cwd: app, encoding: 'utf8', timeout: 600000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 && !allowFailure) throw new Error('Local stack operation failed; inspect Docker availability, port conflicts and cached image availability. Raw CLI output is suppressed because it may contain keys.');
  return result;
}
function containers() {
  const names = run('docker', ['ps', '-a', '--format', '{{.Names}}']).stdout.trim().split('\n')
    .filter(name => name.startsWith('supabase_') && name.endsWith(`_${project}`));
  return names.length ? JSON.parse(run('docker', ['inspect', ...names]).stdout) : [];
}
function safeBindings(items) {
  for (const item of items) {
    for (const values of Object.values(item.NetworkSettings.Ports ?? {})) {
      for (const binding of values ?? []) {
        if (binding.HostIp !== '127.0.0.1') throw new Error('Unsafe local binding detected. Stop only esty-admin-local and correct its network before use.');
      }
    }
  }
}
async function freePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => server.close(resolve));
}
try {
  if (process.env.DOCKER_HOST) {
    if (!process.env.DOCKER_HOST.startsWith('unix://')) throw new Error('Only a local Docker socket is supported.');
    env.DOCKER_HOST = process.env.DOCKER_HOST;
  }
  const operation = process.argv[2];
  if (!['start', 'status', 'stop'].includes(operation) || process.argv.length !== 3) throw new Error('Use start, status or stop only; remote operations are not supported.');
  if (run(cli, ['--version']).stdout.trim() !== '2.122.0') throw new Error('Use the approved installed Supabase CLI 2.122.0.');
  if (operation === 'start') {
    const existing = containers();
    safeBindings(existing);
    if (!existing.some(item => item.State.Running)) await freePort(54322);
    const inspected = run('docker', ['network', 'inspect', network], true);
    if (inspected.status !== 0) run('docker', ['network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network]);
    const [net] = JSON.parse(run('docker', ['network', 'inspect', network]).stdout);
    if (net.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') throw new Error('Existing local network does not enforce loopback publishing.');
    console.info('Starting only esty-admin-local PostgreSQL; CLI may download its pinned Docker image. No application migrations run.');
    run(cli, ['start', '--workdir', app, '--network-id', network, '--exclude', excluded]);
  } else if (operation === 'stop') {
    run(cli, ['stop', '--workdir', app, '--project-id', project]);
    console.info('Stopped only esty-admin-local; data volumes retained.');
  }
  const items = containers();
  safeBindings(items);
  console.info(JSON.stringify({ project, services: items.map(item => ({ name: item.Name.slice(1), image: item.Config.Image, state: item.State.Status, health: item.State.Health?.Status ?? null, ports: item.NetworkSettings.Ports })), studio: 'disabled', application_migrations: 'explicit operator only' }));
  if (operation !== 'stop' && !items.some(item => item.State.Running && item.State.Health?.Status === 'healthy')) throw new Error('Local database is not healthy; start the isolated stack before API checks.');
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? 'Local PostgreSQL port 54322 is occupied; preserve its owner and resolve the collision.' : error.message);
  process.exitCode = 1;
} finally { rmSync(home, { recursive: true, force: true }); }
