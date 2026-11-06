import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, mkdtemp, mkdir, writeFile, realpath, rm, lstat, symlink, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { saveOwnedFailure } from './app-fixture-diagnostics.mjs';
import { fixtureProfile } from './app-fixture-profile.mjs';

const profile = fixtureProfile();
const project = profile.project;
const compose = fileURLToPath(new URL('../tests/fixtures/auth-compose.yaml', import.meta.url));
const prefix = join(await realpath(tmpdir()), profile.prefix);
const ports = [profile.databasePort, profile.authPort, profile.mailPort, profile.apiPort,
  ...(profile.name === 'activation001' ? [profile.webPort] : [])];

function docker(directory, args, includeStderr = false) {
  const host = process.env.DOCKER_HOST ?? 'unix:///var/run/docker.sock';
  if (!host.startsWith('unix:///') || host.includes('\n')) throw new Error('Only a local Unix Docker socket is allowed.');
  const result = spawnSync('docker', ['--config', join(directory, 'docker'), ...args], {
    env: { PATH: process.env.PATH, HOME: directory, DOCKER_HOST: host },
    encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Object.assign(new Error('Docker command failed'), { status: result.status, stdout: result.stdout, stderr: result.stderr });
  return (result.stdout + (includeStderr ? '\n' + result.stderr : '')).trim();
}
function composeCommand(directory, args) {
  return docker(directory, ['compose', '--env-file', join(directory, 'compose.env'), '-p', project, '-f', compose,
    ...(profile.timebox ? ['-f', join(directory, 'timebox-compose.json')] : []), ...args]);
}
async function ownership(directory) {
  const actual = await realpath(directory);
  const stat = await lstat(directory);
  if (!actual.startsWith(prefix) || actual !== directory || !stat.isDirectory() || stat.isSymbolicLink()
    || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('Not an owned fixture directory.');
  const marker = await open(join(directory, 'state.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
  let state;
  try {
    const info = await marker.stat();
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600 || info.size > 65536) throw new Error('Invalid owned fixture marker permissions.');
    state = JSON.parse(await marker.readFile('utf8'));
  } finally { await marker.close(); }
  if (state.project !== project || (state.profile ?? '006') !== profile.name
    || (state.timebox ?? 'false') !== String(profile.timebox) || !/^[a-f0-9]{32}$/.test(state.nonce)
    || !/^f005_[a-f0-9]{32}$/.test(state.database)
    || (profile.name === 'activation001' && state.nonce !== process.env.F001_RUN_NONCE)) throw new Error('Invalid owned fixture marker.');
  const containers = docker(directory, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).split('\n').filter(Boolean);
  for (const id of containers) {
    if (docker(directory, ['inspect', '--format', '{{index .Config.Labels "esty005.run"}}', id]) !== state.nonce) {
      throw new Error('An unrelated container uses this project; refuse cleanup.');
    }
  }
  const networks = docker(directory, ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`]).split('\n').filter(Boolean);
  for (const id of networks) {
    if (docker(directory, ['network', 'inspect', '--format', '{{index .Labels "esty005.run"}}', id]) !== state.nonce) {
      throw new Error('An unrelated network uses this project; refuse cleanup.');
    }
  }
  return state;
}
async function stop(directory) {
  await ownership(directory);
  if (await lstat(join(directory, 'forwarder.json')).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) {
    throw new Error('Stop the run-bound owned loopback forwarder before fixture cleanup.');
  }
  composeCommand(directory, ['down', '--volumes']);
  await rm(directory, { recursive: true });
}
async function available(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
  });
}
function assertNoProject(directory) {
  if (docker(directory, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`])
    || docker(directory, ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`])) {
    throw new Error('Fixture project already exists; never adopt or stop it.');
  }
}
async function start() {
  if (process.argv[3] !== '--approved-resource-start') throw new Error('A separate resource startup grant is required.');
  for (const port of ports) await available(port);
  let directory;
  if (profile.name === 'activation001') {
    directory = process.env.F001_FIXTURE_DIRECTORY;
    if (typeof directory !== 'string' || basename(directory) !== (profile.timebox ? 'timebox' : 'fixture')
      || !/^[a-f0-9]{32}$/.test(process.env.F001_RUN_NONCE ?? '')) throw new Error('Explicit activation staging and task nonce required.');
    const parent = dirname(directory), stat = await lstat(parent);
    if (!parent.startsWith(prefix) || await realpath(parent) !== parent || !stat.isDirectory()
      || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('Activation staging parent refused.');
    await mkdir(directory, { mode: 0o700 }); // Exclusive lifecycle directory; never adopt another run.
  } else directory = await mkdtemp(prefix);
  await mkdir(join(directory, 'docker'), { mode: 0o700 });
  await writeFile(join(directory, 'docker/config.json'), '{}\n', { mode: 0o600, flag: 'wx' });
  const nonce = profile.name === 'activation001' ? process.env.F001_RUN_NONCE : randomBytes(16).toString('hex');
  const database = `f005_${randomBytes(16).toString('hex')}`;
  const secret = randomBytes(32).toString('hex');
  const pair = await generateKeyPair('ES256', { extractable: true });
  const signing = { ...await exportJWK(pair.privateKey), kid: 'f005-es256', alg: 'ES256', use: 'sig', key_ops: ['sign', 'verify'] };
  const legacy = { kty: 'oct', k: Buffer.from(secret).toString('base64url'), kid: 'f005-legacy', alg: 'HS256', use: 'sig', key_ops: ['verify'] };
  const serviceToken = await new SignJWT({ role: 'service_role' }).setProtectedHeader({ alg: 'HS256', kid: 'f005-legacy' })
    .setIssuer(`http://127.0.0.1:${profile.authPort}`).setAudience('authenticated').setExpirationTime('2h').sign(Buffer.from(secret));
  await writeFile(join(directory, 'state.json'), JSON.stringify({ project, nonce, database,
    profile: profile.name, timebox: String(profile.timebox) }), { mode: 0o600, flag: 'wx' });
  const portsEnv = `F005_PROFILE=${profile.name}\nF005_DB_PORT=${profile.databasePort}\nF005_AUTH_PORT=${profile.authPort}\nF005_MAIL_PORT=${profile.mailPort}\nF005_API_PORT=${profile.apiPort}\n`;
  await writeFile(join(directory, 'compose.env'), `${portsEnv}F005_RUN_NONCE=${nonce}\nF005_DATABASE_NAME=${database}\nF005_JWT_SECRET=${secret}\nF005_JWT_KEYS='${JSON.stringify([signing, legacy])}'\n`, { mode: 0o600, flag: 'wx' });
  if (profile.timebox) await writeFile(join(directory, 'timebox-compose.json'),
    JSON.stringify({ services: { auth: { environment: { GOTRUE_SESSIONS_TIMEBOX: '30s' } } } }), { mode: 0o600, flag: 'wx' });
  await writeFile(join(directory, 'test-env.json'), JSON.stringify({
    F005_FIXTURE_DIRECTORY: directory, F005_RUN_NONCE: nonce,
    F005_DATABASE_URL: `postgresql://f005_fixture_admin:synthetic_f005_admin_only@127.0.0.1:${profile.databasePort}/${database}`,
    APP_SESSION_E2E_PROFILE: profile.name, F001_AUTH_TIMEBOX: String(profile.timebox), F005_AUTH_ADMIN_KEY: serviceToken,
  }), { mode: 0o600, flag: 'wx' });
  let began = false;
  let stage = 'public Compose executable verification';
  try {
    const executable = '/Applications/OrbStack.app/Contents/MacOS/xbin/docker-compose';
    const target = await realpath(executable);
    if (![executable, '/Applications/OrbStack.app/Contents/MacOS/xbin/docker-tools'].includes(target)
      || !(await lstat(target)).isFile()) throw new Error('Compose must resolve to the approved public application binary.');
    await access(target, constants.X_OK);
    const digest = createHash('sha256');
    for await (const bytes of createReadStream(target)) digest.update(bytes);
    await mkdir(join(directory, 'docker/cli-plugins'), { mode: 0o700 });
    await symlink(executable, join(directory, 'docker/cli-plugins/docker-compose'));
    stage = 'offline Compose version preflight';
    const version = docker(directory, ['compose', 'version']);
    stage = 'offline Compose configuration preflight';
    composeCommand(directory, ['config', '--quiet']);
    console.info(JSON.stringify({ stage: 'compose_preflight', executable, target, sha256: digest.digest('hex'), version, configuration: 'valid' }));
    stage = 'project inspection';
    assertNoProject(directory);
    if (profile.name === 'activation001') {
      stage = 'cached immutable image inspection';
      const images = composeCommand(directory, ['config', '--images']).split('\n').filter(Boolean);
      if (images.length !== 3 || images.some(image => !/@sha256:[a-f0-9]{64}$/.test(image))) throw new Error('Pinned fixture images required.');
      for (const image of images) docker(directory, ['image', 'inspect', '--format', '{{.Id}}', image]);
    } else {
      stage = 'public image pull';
      composeCommand(directory, ['pull']);
    }
    stage = 'immediate pre-bind guards';
    for (const port of ports) await available(port);
    assertNoProject(directory);
    stage = 'owned service startup';
    began = true;
    composeCommand(directory, ['up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '60']);
    console.info(JSON.stringify({ status: 'started', directory, runId: nonce, database }));
  } catch (error) {
    if (began) {
      try {
        const report = await saveOwnedFailure({ directory, stage, error, ownership, docker });
        console.info(JSON.stringify({ stage: 'owned_failure_diagnostics', report }));
      } catch {
        console.info(JSON.stringify({ stage: 'owned_failure_diagnostics', result: 'capture_failed_no_raw_output' }));
      }
      await stop(directory);
    } else await rm(directory, { recursive: true });
    const reason = stage === 'offline Compose version preflight' && typeof error?.stderr === 'string'
      ? error.stderr.trim().slice(0, 1000)
      : error instanceof Error && !('stdout' in error) ? error.message : 'Docker command failed';
    throw new Error(`Fixture ${stage} failed: ${reason}. Shared-resource adoption is forbidden.`);
  }
}
try {
  if (process.argv[2] === 'start') await start();
  else if (process.argv[2] === 'stop' && process.argv[3]) { await stop(process.argv[3]); console.info('Owned fixture stopped.'); }
  else throw new Error('Use start --approved-resource-start or stop <owned-directory> after explicit authorization.');
} catch (error) {
  console.error(error instanceof Error && !(error instanceof AggregateError) && !('stdout' in error) ? error.message : 'Fixture command failed safely.');
  process.exitCode = 1;
}
