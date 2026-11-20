import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function run() {
if (process.versions.node.split('.')[0] !== '24') throw new Error('Use the approved Node24 runtime.');
const endpoint = process.env.DOCKER_HOST ?? execFileSync('docker', ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'], { encoding: 'utf8' }).trim();
if (!endpoint.startsWith('unix://') || (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))) {
  throw new Error('Only a local Unix-socket Docker daemon is permitted.');
}
const name = `esty-etsy-${randomBytes(8).toString('hex')}`;
const directory = await realpath(await mkdtemp(join(tmpdir(), 'esty-etsy-local-')));
const dockerConfig = await realpath(await mkdtemp(join(tmpdir(), 'esty-etsy-docker-')));
const environment = { ...process.env, DOCKER_HOST: endpoint, DOCKER_CONFIG: dockerConfig };
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', env: environment, ...options });
let id;
try {
  const existing = docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.ID}}']).trim();
  if (existing) throw new Error('Owned fixture name collision; no adoption or eviction.');
  const password = randomBytes(24).toString('hex');
  id = docker(['run', '--detach', '--pull=never', '--name', name, '--label', `esty.etsy.owner=${name}`,
    '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=256m',
    '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB=etsy_fixture', 'postgres:17-alpine'],
    { env: { ...environment, POSTGRES_PASSWORD: password }, timeout: 30000 }).trim();
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Fixture identity was not returned.');
  const mapping = docker(['port', id, '5432/tcp']).trim();
  if (!/^127\.0\.0\.1:\d+$/.test(mapping)) throw new Error('Fixture is not bound exclusively to IPv4 loopback.');
  const port = Number(mapping.split(':')[1]);
  if ([54322, 55432, 55433, 55440, 55441, 55442, 55443, 55444, 55532, 55540, 55541, 55542, 55543, 55544, 55644].includes(port)) throw new Error('Allocated port overlaps a protected fixture range.');
  await writeFile(join(directory, 'fixture.json'), JSON.stringify({ name, id, port, password }), { mode: 0o600, flag: 'wx' });
  const ready = spawnSync('docker', ['exec', id, 'sh', '-c', 'for i in 1 2 3 4 5; do pg_isready -U postgres -d etsy_fixture >/dev/null && exit 0; sleep 1; done; exit 1'], { env: environment, timeout: 10000, stdio: 'ignore' });
  if (ready.status !== 0) throw new Error('Owned PostgreSQL did not become ready.');
  console.log(`Owned Etsy fixture: ${name}, loopback:${port}, tmpfs only.`);
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const result = spawnSync(process.execPath, ['--test', 'apps/api/build/tests/etsy.test.js'], {
    cwd: root, env: { ...environment, ETSY_TEST_FIXTURE_DIRECTORY: directory }, stdio: 'inherit', timeout: 180000,
  });
  process.exitCode = result.status ?? 1;
} finally {
  if (id && /^[a-f0-9]{64}$/.test(id)) {
    const label = docker(['inspect', '--format', '{{index .Config.Labels "esty.etsy.owner"}}', id]).trim();
    if (label !== name) throw new Error('Fixture ownership mismatch: refusing cleanup.');
    docker(['rm', '--force', id], { stdio: 'ignore', timeout: 15000 });
  }
  await rm(directory, { recursive: true });
  await rm(dockerConfig, { recursive: true });
  console.log('Owned Etsy fixture and synthetic credential scratch removed; no shared volumes used.');
}
}

await run().catch(() => {
  console.error('Owned Etsy local check failed; no credential values are printed. Inspect the recorded safe phase/resource receipt.');
  process.exitCode = 1;
});
