import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, readFileSync, writeFileSync, rmSync, statSync, existsSync, symlinkSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostedConfiguration } from '../scripts/hosted-config.mjs';
import { vercelConfiguration } from '../scripts/vercel-config.mjs';
import { convertPrivatePair, prepareVercel } from '../scripts/prepare-vercel-config.mjs';
import { readHiddenPassword } from '../scripts/hidden-input.mjs';
import { writePrivate, readPrivate } from '../scripts/private-files.mjs';
import { PassThrough } from 'node:stream';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'esty-offline-config-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, '.gitignore'), '.openai/\n');
  return root;
}
function inputs(root, password = 'synthetic only') {
  const pair = hostedConfiguration(password);
  Object.assign(pair.runtime, { API_RUNTIME: 'render', RENDER: 'true', PORT: '10000', PREVIEW_ACCESS_KEY: 'a'.repeat(64) });
  Object.assign(pair.operator, { MIGRATION_TARGET: 'supabase', MIGRATION_CONFIRM_PROJECT_REF: pair.operator.SUPABASE_PROJECT_REF });
  if (root) {
    writePrivate(join(root, '.openai/private/backend/runtime.json'), pair.runtime);
    writePrivate(join(root, '.openai/private/backend/operator.json'), pair.operator);
  }
  return pair;
}
test('conversion preserves decoded reserved/Unicode passwords and strips platform/execution fields', () => {
  for (const password of [' spaces ', 'a:@/%?#=+!\\\"\'b', 'mật-khẩu-🔐', '%40already-encoded']) {
    const source = inputs(undefined, password);
    const before = structuredClone(source);
    const result = vercelConfiguration(source.runtime, source.operator);
    assert.equal(decodeURIComponent(new URL(result.runtime.DATABASE_URL).password), password);
    assert.equal(decodeURIComponent(new URL(result.operator.MIGRATION_DATABASE_URL).password), password);
    assert.equal(result.runtime.API_RUNTIME, 'vercel');
    assert.equal(result.runtime.PREVIEW_ACCESS_KEY, source.runtime.PREVIEW_ACCESS_KEY);
    for (const key of ['RENDER', 'VERCEL', 'PORT', 'MIGRATION_TARGET', 'MIGRATION_CONFIRM_PROJECT_REF']) {
      assert.equal(key in result.runtime, false); assert.equal(key in result.operator, false);
    }
    assert.equal('PREVIEW_ACCESS_KEY' in result.operator, false);
    assert.deepEqual(source, before);
  }
});
test('conversion refuses wrong targets, unknown fields and conflicting credential contexts', () => {
  const pair = inputs();
  for (const changes of [{ API_RUNTIME: 'local' }, { VERCEL: '1' }, { RENDER: 'false' }, { PORT: '0' },
    { PREVIEW_ACCESS_KEY: undefined }, { VERCEL_TOKEN: 'synthetic-secret' }, { MIGRATION_DATABASE_URL: 'synthetic-secret' },
    { SUPABASE_PROJECT_REF: 'a'.repeat(20) }, { DATABASE_URL: pair.runtime.DATABASE_URL.replace(':5432', ':6543') },
    { DATABASE_URL: pair.runtime.DATABASE_URL + '?sslmode=disable' }, { DATABASE_URL: pair.runtime.DATABASE_URL + '#fragment' },
    { DATABASE_URL: pair.runtime.DATABASE_URL.replace('synthetic%20only', '%00') }, { DATABASE_CA_PEM: 'invalid' },
    { DATABASE_URL: pair.runtime.DATABASE_URL.replace('synthetic%20only', '%C2%85') },
    { BROWSER_ORIGIN: 'https://other.example' }]) {
    assert.throws(() => vercelConfiguration({ ...pair.runtime, ...changes }, pair.operator), error => {
      assert.doesNotMatch(error.message, /synthetic-secret|postgresql/); return true;
    });
  }
  for (const changes of [{ DATABASE_URL: pair.runtime.DATABASE_URL }, { PREVIEW_ACCESS_KEY: 'a'.repeat(64) },
    { MIGRATION_TARGET: 'local' }, { MIGRATION_CONFIRM_PROJECT_REF: 'other' }, { RENDER_API_KEY: 'synthetic-secret' }]) {
    assert.throws(() => vercelConfiguration(pair.runtime, { ...pair.operator, ...changes }));
  }
});
test('private outputs enforce permissions, separation, no overwrite and no symlink traversal', t => {
  const root = fixture(t);
  inputs(root);
  const original = readFileSync(join(root, '.openai/private/backend/runtime.json'));
  convertPrivatePair(root);
  const directory = join(root, '.openai/private/backend');
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  const path = join(directory, 'runtime.vercel.json');
  const bytes = readFileSync(path);
  const runtime = JSON.parse(bytes);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.match(runtime.PREVIEW_ACCESS_KEY, /^[a-f0-9]{64}$/);
  assert.equal('PREVIEW_ACCESS_KEY' in JSON.parse(readFileSync(join(directory, 'operator.vercel.json'))), false);
  assert.deepEqual(readFileSync(join(directory, 'runtime.json')), original);
  assert.throws(() => convertPrivatePair(root, writePrivate, () => { throw new Error('Input must not be read'); }), /already exists/);
  assert.deepEqual(readFileSync(path), bytes);
  const linked = fixture(t);
  symlinkSync(root, join(linked, '.openai'));
  assert.throws(() => convertPrivatePair(linked), /symlink/);
  const linkedFile = fixture(t);
  mkdirSync(join(linkedFile, '.openai/private/backend'), { recursive: true, mode: 0o700 });
  symlinkSync(path, join(linkedFile, '.openai/private/backend/runtime.vercel.json'));
  assert.throws(() => convertPrivatePair(linkedFile), /already exists/);
});
test('failed second write cleans only its new partial pair; ignore coverage is required', t => {
  const root = fixture(t);
  inputs(root);
  const original = readFileSync(join(root, '.openai/private/backend/operator.json'));
  let writes = 0;
  assert.throws(() => convertPrivatePair(root, (path, value) => {
    if (++writes === 2) throw new Error('synthetic write failure');
    writePrivate(path, value);
  }), /partial/);
  assert.equal(existsSync(join(root, '.openai/private/backend/runtime.vercel.json')), false);
  assert.equal(existsSync(join(root, '.openai/private/backend/operator.vercel.json')), false);
  assert.deepEqual(readFileSync(join(root, '.openai/private/backend/operator.json')), original);
  writeFileSync(join(root, '.gitignore'), '');
  assert.throws(() => convertPrivatePair(root), /ignore/);
});
test('default is secret-free pending; non-TTY and secret-argument shortcuts fail without disclosure', async t => {
  const root = fixture(t);
  await prepareVercel([], join(root, 'absent'), undefined, { write() {} });
  assert.equal(existsSync(join(root, 'absent')), false);
  const script = fileURLToPath(new URL('../scripts/prepare-vercel-config.mjs', import.meta.url));
  for (const args of [[], ['--convert-to-vercel'], ['--password', 'synthetic-not-to-log']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
    assert.equal(result.status, args.length ? 1 : 0);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-not-to-log|postgresql:\/\//);
    if (!args.length) assert.match(result.stdout, /OWNER_INPUT_PENDING/);
  }
});
test('actual owner conversion PTY confirms or cancels without echo and restores terminal flags', t => {
  const root = fixture(t);
  inputs(root);
  const module = new URL('../scripts/prepare-vercel-config.mjs', import.meta.url).href;
  const code = `import {prepareVercel} from ${JSON.stringify(module)}; try {await prepareVercel(['--convert-to-vercel'], ${JSON.stringify(root)}); console.log('ACCEPTED');} catch {console.log('CANCELLED');}`;
  const python = `import os,pty,subprocess,termios,select,time,sys,json
for cancel in (True,False):
 m,s=pty.openpty(); before=termios.tcgetattr(s)
 p=subprocess.Popen([sys.argv[1],'--input-type=module','-e',sys.argv[2]],stdin=s,stdout=s,stderr=s)
 output=b''; deadline=time.monotonic()+5
 try:
  while b'hidden;' not in output:
   assert time.monotonic()<deadline
   if select.select([m],[],[],0.1)[0]: output+=os.read(m,4096)
  secret=b'CONVERT'
  os.write(m,secret+(b'\\x03' if cancel else b'\\r'))
  p.wait(timeout=5)
  while select.select([m],[],[],0.1)[0]: output+=os.read(m,4096)
  assert secret not in output.split(b'cancels): ',1)[1]
  assert (b'CANCELLED' if cancel else b'ACCEPTED') in output
  after=termios.tcgetattr(s)
  assert after==before, 'TTY flags not restored'
 finally:
  if p.poll() is None: p.kill(); p.wait()
  os.close(m); os.close(s)
print('PTY hidden entry/cancel restored')`;
  const result = spawnSync('python3', ['-c', python, process.execPath, code], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /restored/);
  assert.equal(readPrivate(join(root, '.openai/private/backend/runtime.vercel.json')).API_RUNTIME, 'vercel');
});

test('private reads reject unsafe files without creating absent paths', t => {
  const root = fixture(t);
  const missing = join(root, 'absent', 'owner.json');
  assert.throws(() => readPrivate(missing));
  assert.equal(existsSync(join(root, 'absent')), false);
  const path = join(root, 'private', 'owner.json');
  writePrivate(path, { synthetic: true });
  assert.deepEqual(readPrivate(path), { synthetic: true });
  chmodSync(path, 0o644);
  assert.throws(() => readPrivate(path), /owner-only/);
  chmodSync(path, 0o600);
  const link = join(root, 'private', 'link.json');
  symlinkSync(path, link);
  assert.throws(() => readPrivate(link));
});

test('terminal output failure still restores hidden-input mode and releases listeners', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  const output = { isTTY: true, write() { throw new Error('synthetic terminal failure'); } };
  await assert.rejects(readHiddenPassword(input, output), /restored/);
  assert.equal(input.isRaw, false);
  assert.equal(input.listenerCount('data'), 0);
  input.destroy();
});
