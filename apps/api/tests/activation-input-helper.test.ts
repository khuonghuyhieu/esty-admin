import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, realpathSync, rmSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync, symlinkSync, unlinkSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { rootCertificates } from 'node:tls';
import { assembleArtifact, canonical, sha256, artifactTarget } from '../scripts/artifact.js';
import { bindPreparedPacket, composePhaseInputs, diagnosePreparedRole, discardPreparedInputs, inputFailureMessage, inputPhases, isolatedInputWorker, validateHandoffPlan, validateInputRequest, validatePreparedPhase } from '../scripts/activation-input-helper.js';
import { prepareCaSuccessor, preparedBootstrapEnvironment, preparedBridgeBearer, preparedRecoveryPhase, snapshotCaSuccessor } from '../scripts/activation-input-helper.js';
import type { HandoffPlan, InputRequest, InputPhase } from '../scripts/activation-input-helper.js';
import { readHiddenPassword } from '../scripts/hidden-input.mjs';
import { readPrivate, writePrivate } from '../scripts/private-files.mjs';
import { bootstrapInputs, decodePhaseInput } from '../scripts/activation-inputs.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { activationSchema } from '../src/config/schema-transition.js';
import { guardedOwnerCommand } from '../scripts/activation-input-launcher.mjs';
import { artifactFixture } from './artifact-fixture.js';
import { inspectPreparedTransfer, transferFailureMessage, inspectCaReplacement, replaceCaSecrets,
  inspectFailedPreflight, recordFailedPreflight, commitFailedPreflightDisposition } from '../scripts/activation-input-transfer.js';
import { retainedActivation } from '../scripts/activation-retained.mjs';
import { Client } from 'pg';
import type { TestContext } from 'node:test';

const helper = fileURLToPath(new URL('../scripts/activation-input-helper.js', import.meta.url));
const token = 'synthetic-config-token-not-to-disclose';
const variables = { 'bridge-config': 'ACTIVATION_BRIDGE_INPUTS', roles: 'ACTIVATION_ROLE_INPUTS', migration: 'ACTIVATION_MIGRATION_INPUTS',
  bootstrap: 'ACTIVATION_BOOTSTRAP_INPUTS', 'app-config': 'ACTIVATION_APP_INPUTS' } as const;
function fixture(t: { after(fn: () => void): void }, boundPublic = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'esty-input-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request: InputRequest = { version: 1, runId: randomUUID(), workspaceId: randomUUID(), profileName: 'Hieu', workspaceName: 'Lovora',
    retentionPolicyId: 'manual-retention-v1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), sourceDigest: sha256('source'),
    artifactDigest: sha256('artifact'), projectId: artifactTarget.project, scopeId: artifactTarget.owner,
    target: 'supabase:eotmpaliqcxxcotrcols', buildRun: '123', retentionApprovalDigest: sha256('retention') };
  const metadata = { SUPABASE_PROJECT_REF: 'eotmpaliqcxxcotrcols', SUPABASE_SESSION_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com',
    SUPABASE_DATABASE_NAME: 'postgres', SUPABASE_DATABASE_USER: 'postgres.eotmpaliqcxxcotrcols' };
  const url = (role: string) => `postgresql://${role}.eotmpaliqcxxcotrcols:synthetic-${role}-credential@${metadata.SUPABASE_SESSION_HOST}:5432/postgres`;
  const bridge = { ...metadata, API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
    DATABASE_URL: url('postgres'), BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: 'a'.repeat(64) };
  const app = { ...bridge, APP_SCHEMA_MODE: 'strict', APP_FOUNDATION_ENABLED: 'true', SUPABASE_DATABASE_USER: 'app_runtime.eotmpaliqcxxcotrcols',
    DATABASE_URL: url('app_runtime'), APP_WORKSPACE_ID: request.workspaceId, APP_EMAIL_ENABLED: 'false',
    APP_AUTH_URL: 'https://eotmpaliqcxxcotrcols.supabase.co/auth/v1', APP_AUTH_API_KEY: 'sb_publishable_synthetic-only', APP_RETENTION_POLICY_ID: request.retentionPolicyId };
  const migration = { ...metadata, MIGRATION_TARGET: 'supabase', MIGRATION_CONFIRM_PROJECT_REF: metadata.SUPABASE_PROJECT_REF,
    MIGRATION_DATABASE_URL: url('postgres'), DATABASE_URL: url('app_runtime') };
  const roles = { ...migration, APP_ROLES_APPROVAL_ID: request.runId, APP_ROLES_CONFIRM_TARGET: request.target,
    APP_ROLES_RUNTIME_DATABASE_URL: url('app_runtime'), APP_ROLES_OPERATOR_DATABASE_URL: url('app_operator') };
  const bootstrap = { ...metadata, SUPABASE_DATABASE_USER: 'app_operator.eotmpaliqcxxcotrcols',
    APP_WORKSPACE_ID: request.workspaceId, APP_EMAIL_ENABLED: 'false', APP_AUTH_URL: app.APP_AUTH_URL, APP_AUTH_API_KEY: app.APP_AUTH_API_KEY,
    APP_RETENTION_POLICY_ID: request.retentionPolicyId, BROWSER_ORIGIN: bridge.BROWSER_ORIGIN, APP_OPERATOR_TARGET: 'supabase',
    APP_OPERATOR_DATABASE_URL: url('app_operator'), APP_OPERATOR_AUTH_KEY: 'synthetic-auth-admin-not-to-disclose',
    APP_OPERATOR_CONFIRM_WORKSPACE: request.workspaceId, APP_OPERATOR_APPROVAL_ID: request.runId, APP_OPERATOR_USER_ID: randomUUID(),
    APP_OPERATOR_PROFILE_NAME: request.profileName, APP_OPERATOR_WORKSPACE_NAME: request.workspaceName,
    APP_OPERATOR_CONFIRM_PROJECT_REF: metadata.SUPABASE_PROJECT_REF };
  const inputs = { 'bridge-config': bridge, roles, migration, bootstrap, 'app-config': app };
  const fields: Record<string, string> = { APP_OPERATOR_USER_ID: bootstrap.APP_OPERATOR_USER_ID, APP_AUTH_API_KEY: app.APP_AUTH_API_KEY,
    VERCEL_CONFIGURATION_TOKEN: token, MIGRATION_DATABASE_PASSWORD: 'synthetic-postgres-credential',
    APP_RUNTIME_DATABASE_PASSWORD: 'synthetic-app_runtime-credential', APP_OPERATOR_DATABASE_PASSWORD: 'synthetic-app_operator-credential',
    PREVIEW_ACCESS_KEY: bridge.PREVIEW_ACCESS_KEY, APP_OPERATOR_AUTH_KEY: bootstrap.APP_OPERATOR_AUTH_KEY };
  if (boundPublic) {
    request.publicInputs = { APP_OPERATOR_USER_ID: fields.APP_OPERATOR_USER_ID!, APP_AUTH_API_KEY: fields.APP_AUTH_API_KEY! };
    delete fields.APP_OPERATOR_USER_ID; delete fields.APP_AUTH_API_KEY;
  }
  const digest = sha256(canonical(request)), path = join(root, 'input-request.json');
  writePrivate(path, request);
  return { root, request, digest, path, inputs, fields };
}
function phaseEnv(phase: InputPhase, value: unknown) {
  return { [variables[phase]]: JSON.stringify(value), ...(['bridge-config', 'app-config'].includes(phase) ? { VERCEL_CONFIGURATION_TOKEN: token } : {}) };
}
test('approved request refuses changed run, project, artifact, target and malformed fields before collection', t => {
  const f = fixture(t);
  for (const change of [{ runId: randomUUID() }, { artifactDigest: sha256('other') }, { projectId: 'other' }, { target: 'local' },
    { workspaceId: randomUUID() }, { extra: true }, { buildRun: 123 }]) {
    assert.throws(() => validateInputRequest({ ...f.request, ...change }, f.digest));
  }
  for (const change of [{ projectId: 'other' }, { target: 'local' }, { buildRun: 123 }, { runId: 'unknown' }]) {
    const value = { ...f.request, ...change };
    assert.throws(() => validateInputRequest(value, sha256(canonical(value))));
  }
  const result = spawnSync(process.execPath, [helper, 'prepare', f.path, sha256('wrong')], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /\(hidden;|MISSING_NONSECRET_FIELDS/);
});
test('all five phase schemas preserve identity and reject cross-phase credentials and unbounded input', t => {
  const f = fixture(t);
  for (const phase of inputPhases) {
    const env = phaseEnv(phase, f.inputs[phase]);
    assert.equal(validatePreparedPhase(f.request, phase, env).digest, sha256(canonical(f.inputs[phase])));
    assert.throws(() => validatePreparedPhase(f.request, phase, { ...env, GITHUB_TOKEN: 'synthetic-provider-token' }));
    assert.throws(() => validatePreparedPhase(f.request, phase, phaseEnv(phase, { ...f.inputs[phase], UNKNOWN: 'secret' })));
    assert.throws(() => validatePreparedPhase(f.request, phase, phaseEnv(phase, { ...f.inputs[phase], DATABASE_CA_PEM: 'x'.repeat(16385) })));
    assert.throws(() => validatePreparedPhase(f.request, phase, { ...env, [variables[phase]]: '{"private":"\u0000"}' }));
  }
  for (const phase of ['app-config', 'bootstrap'] as const) {
    assert.throws(() => validatePreparedPhase(f.request, phase, phaseEnv(phase, { ...f.inputs[phase], APP_WORKSPACE_ID: randomUUID() })));
    assert.throws(() => validatePreparedPhase(f.request, phase, phaseEnv(phase, { ...f.inputs[phase], APP_RETENTION_POLICY_ID: 'other-policy' })));
  }
  const raw = JSON.stringify(f.inputs['bridge-config']), exact = ' '.repeat(65536 - Buffer.byteLength(raw)) + raw;
  assert.equal(validatePreparedPhase(f.request, 'bridge-config', { ACTIVATION_BRIDGE_INPUTS: exact, VERCEL_CONFIGURATION_TOKEN: token }).digest,
    sha256(canonical(f.inputs['bridge-config'])));
  assert.throws(() => validatePreparedPhase(f.request, 'bridge-config', { ACTIVATION_BRIDGE_INPUTS: ' ' + exact, VERCEL_CONFIGURATION_TOKEN: token }));
  assert.throws(() => validatePreparedPhase(f.request, 'unknown' as InputPhase, {}));
});
test('composition derives all five role-specific maps and escapes passwords without changing their values', t => {
  const f = fixture(t), result = composePhaseInputs(f.request, f.fields);
  for (const phase of inputPhases) {
    assert.deepEqual(result.environments[phase], { ...phaseEnv(phase, f.inputs[phase]), [variables[phase]]: canonical(f.inputs[phase]) });
    assert.equal(result.phases[phase].digest, sha256(canonical(f.inputs[phase])));
  }
  const password = "é@:/?#% +' Unicode";
  const changed = composePhaseInputs(f.request, { ...f.fields, APP_RUNTIME_DATABASE_PASSWORD: password });
  const app = JSON.parse(changed.environments['app-config'].ACTIVATION_APP_INPUTS!);
  const roles = JSON.parse(changed.environments.roles.ACTIVATION_ROLE_INPUTS!);
  const migration = JSON.parse(changed.environments.migration.ACTIVATION_MIGRATION_INPUTS!);
  assert.equal(decodeURIComponent(new URL(app.DATABASE_URL).password), password);
  assert.equal(app.DATABASE_URL, roles.APP_ROLES_RUNTIME_DATABASE_URL);
  assert.equal(app.DATABASE_URL, migration.DATABASE_URL);
  assert.equal(app.SUPABASE_DATABASE_USER, 'app_runtime.eotmpaliqcxxcotrcols');
  assert.notEqual(app.DATABASE_URL, roles.MIGRATION_DATABASE_URL);
  assert.notEqual(app.DATABASE_URL, roles.APP_ROLES_OPERATOR_DATABASE_URL);
});
test('Auth identity composition preserves UUID versions and case accepted by the existing bootstrap validator', t => {
  const f = fixture(t), userId = '12345678-1234-7234-8234-123456789ABC';
  const unbound = composePhaseInputs(f.request, { ...f.fields, APP_OPERATOR_USER_ID: userId });
  assert.equal(JSON.parse(unbound.environments.bootstrap.ACTIVATION_BOOTSTRAP_INPUTS!).APP_OPERATOR_USER_ID, userId);
  const request = { ...f.request, publicInputs: { APP_OPERATOR_USER_ID: userId } };
  validateInputRequest(request, sha256(canonical(request)));
  const fields = { ...f.fields }; delete fields.APP_OPERATOR_USER_ID;
  const bound = composePhaseInputs(request, fields);
  assert.equal(bound.phases.bootstrap.binding, unbound.phases.bootstrap.binding);
});
test('composition refuses every absent or empty required field, extra fields and credential boundary violations', t => {
  const f = fixture(t);
  for (const field of Object.keys(f.fields)) {
    const missing = { ...f.fields }; delete missing[field];
    assert.throws(() => composePhaseInputs(f.request, missing));
    assert.throws(() => composePhaseInputs(f.request, { ...f.fields, [field]: '' }));
  }
  const changes: Record<string, string>[] = [{ VERCEL_TOKEN: token }, { APP_OPERATOR_USER_ID: 'not-a-uuid' },
    { APP_RUNTIME_DATABASE_PASSWORD: f.fields.MIGRATION_DATABASE_PASSWORD! },
    { APP_OPERATOR_DATABASE_PASSWORD: f.fields.APP_RUNTIME_DATABASE_PASSWORD! },
    { APP_AUTH_API_KEY: 'sb_secret_not-a-runtime-key' }, { PREVIEW_ACCESS_KEY: 'short' },
    { APP_OPERATOR_AUTH_KEY: 'bad\ncredential' }, { MIGRATION_DATABASE_PASSWORD: 'x'.repeat(16385) }];
  for (const change of changes) {
    assert.throws(() => composePhaseInputs(f.request, { ...f.fields, ...change }));
  }
});
test('bound public metadata is reused, cannot be overridden and preserves the optional trusted CA in every phase', t => {
  const f = fixture(t, true), ca = rootCertificates[0]!;
  f.request.publicInputs!.DATABASE_CA_PEM = ca;
  validateInputRequest(f.request, sha256(canonical(f.request)));
  const result = composePhaseInputs(f.request, f.fields);
  for (const phase of inputPhases) {
    const input = JSON.parse(result.environments[phase][variables[phase]]!);
    assert.equal(input.DATABASE_CA_PEM, ca);
    delete input.DATABASE_CA_PEM;
    assert.throws(() => validatePreparedPhase(f.request, phase, phaseEnv(phase, input)));
  }
  assert.throws(() => composePhaseInputs(f.request, { ...f.fields, APP_OPERATOR_USER_ID: randomUUID() }));
  for (const field of ['APP_OPERATOR_USER_ID', 'APP_AUTH_API_KEY']) {
    const input = { ...f.inputs.bootstrap, DATABASE_CA_PEM: ca, [field]: field === 'APP_OPERATOR_USER_ID' ? randomUUID() : 'sb_publishable_other' };
    assert.throws(() => validatePreparedPhase(f.request, 'bootstrap', phaseEnv('bootstrap', input)));
  }
  for (const publicInputs of [{ PREVIEW_ACCESS_KEY: 'a'.repeat(64) }, { APP_OPERATOR_USER_ID: '' }, { APP_OPERATOR_USER_ID: 'other' }]) {
    const request = { ...f.request, publicInputs };
    assert.throws(() => validateInputRequest(request, sha256(canonical(request))));
  }
});
test('non-TTY and unknown-phase shortcuts refuse without output or secret disclosure', t => {
  const f = fixture(t);
  for (const args of [['prepare', f.path, f.digest], ['prepare', f.path, f.digest, token], ['validate-worker', f.path, f.digest, 'unknown']]) {
    const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', input: token, env: { PATH: process.env.PATH } });
    assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, new RegExp(token));
  }
  assert.deepEqual(readdirSync(f.root), ['input-request.json']);
});
test('hidden input enforces UTF8 bytes, rejects malformed UTF8, restores mode and cancels without echo', async () => {
  for (const [bytes, maximum, accepts] of [[Buffer.from('éé\r'), 4, true], [Buffer.from('ééé\r'), 4, false],
    [Buffer.from([0xc3, 0x28, 13]), 20, false], [Buffer.from('private\x03'), 20, false]] as const) {
    const input = new PassThrough() as PassThrough & { isTTY: boolean; isRaw: boolean; setRawMode(value: boolean): void };
    input.isTTY = true; input.isRaw = false; input.setRawMode = value => { input.isRaw = value; };
    let output = '';
    const pending = readHiddenPassword(input as unknown as typeof process.stdin, { isTTY: true, write(value: string) { output += value; } } as typeof process.stdout,
      'HIDDEN: ', { maxBytes: maximum, maxCharacters: 65536 });
    input.write(bytes);
    if (accepts) assert.equal(await pending, 'éé'); else await assert.rejects(pending);
    assert.equal(input.isRaw, false); assert.equal(input.listenerCount('data'), 0);
    assert.equal(output, 'HIDDEN: \n'); input.destroy();
  }
});
test('worker stderr/stdout are suppressed and unrelated parent credentials are not inherited', async t => {
  const f = fixture(t), worker = join(f.root, 'synthetic-worker.mjs');
  writeFileSync(worker, "if(process.env.UNRELATED_SECRET) process.exit(41); console.log(process.env.ACTIVATION_ROLE_INPUTS); console.error('synthetic-child-error');");
  const previous = process.env.UNRELATED_SECRET;
  process.env.UNRELATED_SECRET = 'synthetic-parent-secret';
  try { await isolatedInputWorker(worker, [], { ACTIVATION_ROLE_INPUTS: 'synthetic-isolated-secret' }, AbortSignal.timeout(5000)); }
  finally { if (previous === undefined) delete process.env.UNRELATED_SECRET; else process.env.UNRELATED_SECRET = previous; }
});
const ptyDriver = String.raw`import os,pty,subprocess,termios,select,time,sys,json
payload=json.load(sys.stdin)
m,s=pty.openpty(); before=termios.tcgetattr(s)
env={'PATH':os.environ['PATH'],'HOME':payload['root'],'TMPDIR':payload['temporary'],'UNRELATED_SECRET':'synthetic-parent-secret'}
command=['/bin/sh','-c',payload['guardedCommand']] if payload.get('guardedCommand') else [sys.argv[1],sys.argv[2],'prepare',payload['path'],payload['digest']]
p=subprocess.Popen(command,stdin=s,stdout=s,stderr=s,env=env)
output=b''; deadline=time.monotonic()+45
try:
 for prompt,value in payload['answers']:
  marker=prompt.encode()
  while marker not in output:
   assert time.monotonic()<deadline and p.poll() is None,'prompt missing'
   if select.select([m],[],[],0.1)[0]: output+=os.read(m,4096)
  if payload.get('cleanupFault') and prompt.startswith('APP_OPERATOR_AUTH_KEY'):
   names=os.listdir(payload['temporary']); assert len(names)==1 and names[0].startswith('esty-activation-inputs-')
   with open(os.path.join(payload['temporary'],names[0],'unrelated'),'x') as stream: stream.write('owned-test-only')
  os.write(m,value.encode()+b'\r' if value!='CANCEL' else b'\x03')
 while p.poll() is None:
  assert time.monotonic()<deadline,'process timeout'
  if select.select([m],[],[],0.1)[0]: output+=os.read(m,4096)
 while select.select([m],[],[],0.1)[0]: output+=os.read(m,4096)
 assert termios.tcgetattr(s)==before,'TTY not restored'
 print(json.dumps({'exit':p.returncode,'output':output.decode(),'restored':True}))
finally:
 if p.poll() is None: p.kill(); p.wait()
 os.close(m); os.close(s)
`;
test('actual PTY auto-composition isolates phase files with missing or bound public metadata and supports guarded discard', t => {
  for (const boundPublic of [false, true]) {
  const f = fixture(t, boundPublic), temporary = join(f.root, 'temporary'); mkdirSync(temporary, { mode: 0o700 });
  const answers = Object.entries(f.fields).map(([field, value]) => [`${field} (hidden;`, value]);
  const p = spawnSync('python3', ['-c', ptyDriver, process.execPath, helper], { encoding: 'utf8', timeout: 60000,
    input: JSON.stringify({ ...f, temporary, answers }) });
  assert.equal(p.status, 0, p.stderr);
  const actual = JSON.parse(p.stdout); assert.equal(actual.exit, 0, actual.output); assert.equal(actual.restored, true);
  assert.doesNotMatch(actual.output, /synthetic-|postgresql:|sb_publishable_|UNRELATED_SECRET/);
  assert.doesNotMatch(actual.output, /JSON \(hidden/);
  for (const field of Object.keys(f.fields)) assert.equal(actual.output.split(`${field} (hidden;`).length - 1, 1);
  if (boundPublic) assert.doesNotMatch(actual.output, /MISSING_NONSECRET_FIELDS|APP_OPERATOR_USER_ID \(hidden;|APP_AUTH_API_KEY \(hidden;/);
  else assert.match(actual.output, /MISSING_NONSECRET_FIELDS: APP_OPERATOR_USER_ID, APP_AUTH_API_KEY/);
  const directory = actual.output.match(/INPUTS_PREPARED ([^\r\n]+)/)?.[1]; assert.ok(directory);
  assert.equal(lstatSync(directory).mode & 0o777, 0o700);
  for (const phase of inputPhases) {
    const path = join(directory, `${phase}.json`), env = readPrivate(path, 262144);
    assert.equal(lstatSync(path).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(env).sort(), Object.keys(phaseEnv(phase, f.inputs[phase])).sort());
    assert.deepEqual(JSON.parse(env[variables[phase]]), f.inputs[phase]);
    if (phase === 'bridge-config' || phase === 'app-config') assert.equal(env.VERCEL_CONFIGURATION_TOKEN, token);
  }
  assert.doesNotMatch(readFileSync(join(directory, 'receipt.json'), 'utf8'), /synthetic-|postgresql:|sb_publishable_/);
  writeFileSync(join(directory, 'unrelated'), 'preserve');
  assert.throws(() => discardPreparedInputs(directory, f.digest));
  assert.equal(readFileSync(join(directory, 'unrelated'), 'utf8'), 'preserve'); unlinkSync(join(directory, 'unrelated'));
  symlinkSync(f.path, join(directory, 'unrelated'));
  assert.throws(() => discardPreparedInputs(directory, f.digest)); unlinkSync(join(directory, 'unrelated'));
  assert.throws(() => discardPreparedInputs(directory, sha256('wrong')));
  const discard = spawnSync(process.execPath, [helper, 'discard', directory, f.digest], { encoding: 'utf8' });
  assert.equal(discard.status, 0, discard.stderr); assert.deepEqual(readdirSync(temporary), []);
  assert.deepEqual(readPrivate(f.path), f.request);
  }
});
test('actual PTY failures identify invalid configuration after the final field without leaking inputs or masking cleanup refusal', t => {
  for (const scenario of ['bearer', 'shared-password', 'token', 'cleanup']) {
    const f = fixture(t), temporary = join(f.root, 'temporary'); mkdirSync(temporary, { mode: 0o700 });
    if (scenario === 'shared-password') f.fields.APP_RUNTIME_DATABASE_PASSWORD = f.fields.MIGRATION_DATABASE_PASSWORD!;
    else if (scenario === 'token') f.fields.VERCEL_CONFIGURATION_TOKEN = 'short-token';
    else f.fields.PREVIEW_ACCESS_KEY = 'synthetic-invalid-bearer';
    const answers = Object.entries(f.fields).map(([field, value]) => [`${field} (hidden;`, value]);
    const p = spawnSync('python3', ['-c', ptyDriver, process.execPath, helper], { encoding: 'utf8', timeout: 60000,
      input: JSON.stringify({ ...f, temporary, answers, cleanupFault: scenario === 'cleanup' }) });
    assert.equal(p.status, 0, p.stderr);
    const actual = JSON.parse(p.stdout);
    assert.equal(actual.exit, 1); assert.equal(actual.restored, true);
    for (const [field, value] of Object.entries(f.fields)) {
      assert.ok(actual.output.includes(`${field} (hidden;`));
      assert.ok(!actual.output.includes(value));
    }
    const phase = scenario === 'shared-password' ? 'roles' : 'bridge-config';
    const field = scenario === 'shared-password' ? 'APP_ROLES_CREDENTIALS'
      : scenario === 'token' ? 'VERCEL_CONFIGURATION_TOKEN' : 'PREVIEW_ACCESS_KEY';
    const reason = scenario === 'token' ? 'input_refused' : 'configuration_invalid';
    assert.ok(actual.output.includes(`INPUT_HELPER_REFUSED: stage=validation phase=${phase} field=${field} reason=${reason} cleanup=${scenario === 'cleanup' ? 'refused' : 'complete'}`));
    assert.doesNotMatch(actual.output, /HELPER_EXECUTABLE_REFUSED|INPUTS_PREPARED|postgresql:|Error:|\n\s+at /);
    assert.ok(!actual.output.includes(temporary));
    const names = readdirSync(temporary);
    if (scenario === 'cleanup') {
      assert.equal(names.length, 1);
      const retained = join(temporary, names[0]!);
      assert.deepEqual(readdirSync(retained).sort(), ['input-request.json', 'unrelated']);
      assert.equal(readFileSync(join(retained, 'unrelated'), 'utf8'), 'owned-test-only');
    } else assert.deepEqual(names, []);
  }
});
test('unknown errors and failed worker output cannot inject values or raw errors into diagnostics', t => {
  const canary = 'synthetic-secret-canary';
  for (const error of [new Error(canary), { name: 'InputFailure', details: { stage: canary, field: canary } }, canary]) {
    assert.equal(inputFailureMessage(error),
      'INPUT_HELPER_REFUSED: stage=operation phase=none field=NONE reason=operation_refused cleanup=not_needed; no private value is disclosed.');
  }
  const f = fixture(t), worker = join(f.root, 'failed-worker.mjs');
  writeFileSync(worker, `console.log(${JSON.stringify(canary)});console.error(${JSON.stringify(canary)});process.exit(9);`);
  const script = `import {isolatedInputWorker,inputFailureMessage} from ${JSON.stringify(pathToFileURL(helper).href)};
    try {await isolatedInputWorker(${JSON.stringify(worker)},[],{},AbortSignal.timeout(5000));}
    catch(error){console.error(inputFailureMessage(error));process.exitCode=1;}`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: f.root, TMPDIR: f.root } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /INPUT_HELPER_REFUSED: stage=child_worker phase=none field=NONE reason=worker_refused/);
  assert.ok(!(result.stdout + result.stderr).includes(canary));
  assert.ok(!(result.stdout + result.stderr).includes(worker));
});
test('actual PTY cancellation after collecting credentials removes partial secrets and restores terminal', t => {
  const f = fixture(t), temporary = join(f.root, 'temporary'); mkdirSync(temporary, { mode: 0o700 });
  const answers = [...Object.entries(f.fields).slice(0, 4).map(([field, value]) => [`${field} (hidden;`, value]),
    ['APP_RUNTIME_DATABASE_PASSWORD (hidden;', 'CANCEL']];
  const p = spawnSync('python3', ['-c', ptyDriver, process.execPath, helper], { encoding: 'utf8', timeout: 60000,
    input: JSON.stringify({ ...f, temporary, answers }) });
  assert.equal(p.status, 0, p.stderr);
  const actual = JSON.parse(p.stdout); assert.equal(actual.exit, 1); assert.equal(actual.restored, true);
  assert.doesNotMatch(actual.output, /synthetic-|postgresql:|sb_publishable_/);
  assert.deepEqual(readdirSync(temporary), []);
});
test('missing nonsecret input refuses before secret prompts and leaves no prepared output', t => {
  for (const field of ['APP_OPERATOR_USER_ID', 'APP_AUTH_API_KEY']) {
    const f = fixture(t), temporary = join(f.root, 'temporary'); mkdirSync(temporary, { mode: 0o700 });
    const answers = field === 'APP_OPERATOR_USER_ID' ? [[`${field} (hidden;`, '']]
      : [['APP_OPERATOR_USER_ID (hidden;', f.fields.APP_OPERATOR_USER_ID], [`${field} (hidden;`, '']];
    const p = spawnSync('python3', ['-c', ptyDriver, process.execPath, helper], { encoding: 'utf8', timeout: 60000,
      input: JSON.stringify({ ...f, temporary, answers }) });
    assert.equal(p.status, 0, p.stderr);
    const actual = JSON.parse(p.stdout);
    assert.equal(actual.exit, 1); assert.equal(actual.restored, true);
    assert.doesNotMatch(actual.output, /VERCEL_CONFIGURATION_TOKEN \(hidden;|synthetic-|INPUTS_PREPARED/);
    assert.deepEqual(readdirSync(temporary), []);
  }
});
test('encoded handoff containers retain bounded private reads without widening original-file defaults', t => {
  const f = fixture(t), path = join(f.root, 'encoded.json');
  const envelope = { ACTIVATION_ROLE_INPUTS: JSON.stringify({ synthetic: '"'.repeat(32760) }) };
  writePrivate(path, envelope);
  assert.throws(() => readPrivate(path));
  assert.deepEqual(readPrivate(path, 262144), envelope);
  for (const maximum of [0, -1, Infinity, 262145]) assert.throws(() => readPrivate(path, maximum));
  writeFileSync(path, JSON.stringify({ synthetic: 'x'.repeat(262144) }));
  assert.throws(() => readPrivate(path, 262144));
});
function packetFor(request: InputRequest, proofs?: Record<InputPhase, { digest: string; binding?: string }>) {
  const digest = (phase: InputPhase) => proofs?.[phase].digest ?? sha256(phase);
  return { version: 1, runId: request.runId, revision: request.revision, tree: request.tree,
    projectId: request.projectId, scopeId: request.scopeId, sourceDigest: request.sourceDigest, artifactDigest: request.artifactDigest,
    contractDigest: '41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad',
    oldDigest: activationSchema.oldDigest, targetDigest: activationSchema.targetDigest, target: request.target,
    predecessorId: 'dpl_previous', bridgeConfigDigest: digest('bridge-config'), appConfigDigest: digest('app-config'),
    roleInputDigest: digest('roles'), migrationInputDigest: digest('migration'), bootstrapInputDigest: digest('bootstrap'),
    bootstrapBindingDigest: proofs?.bootstrap.binding ?? sha256('binding'), sourceReviewDigest: sha256('review'), testReceiptDigest: sha256('tests'),
    retentionApprovalDigest: request.retentionApprovalDigest, feRevision: 'f'.repeat(40), feSourceDigest: sha256('fe'),
    feConfigDigest: sha256('fe-config'), migrations: migrationManifest };
}
test('a separately valid packet cannot redirect prepared inputs to another run, source, artifact or target', t => {
  const { request } = fixture(t), packet = packetFor(request);
  assert.equal(bindPreparedPacket(request, packet, sha256(canonical(packet))).runId, request.runId);
  for (const change of [{ runId: randomUUID() }, { revision: 'c'.repeat(40) }, { tree: 'd'.repeat(40) },
    { artifactDigest: sha256('other') }, { sourceDigest: sha256('other') }, { target: 'local' },
    { retentionApprovalDigest: sha256('other') }, { projectId: 'unknown' }, { scopeId: 'unknown' }]) {
    const changed = { ...packet, ...change };
    assert.throws(() => bindPreparedPacket(request, changed, sha256(canonical(changed))));
  }
});

test('handoff plans reject unapproved phases, actions, noncanonical paths and packet relocation', () => {
  const paths = { inputs: '/esty-activation-inputs-synthetic', packet: '/reports/packet-input.json',
    reports: '/reports', artifact: '/artifact', cli: '/tools/vc.js' };
  const plan: HandoffPlan = { version: 1, executableDigest: sha256('executable'), requestDigest: sha256('request'),
    packetDigest: sha256('packet'), phase: 'bridge-config', action: 'run', source: paths, destination: paths };
  for (const change of [{ phase: 'provider' }, { action: 'preflight' }, { action: 'discard' },
    { destination: { ...paths, inputs: '/esty-activation-inputs-synthetic/../other' } },
    { destination: { ...paths, packet: '/other/packet-input.json' } },
    { destination: { ...paths, cli: '/tools/link/../vc.js' } }, { extra: true }]) {
    const changed = { ...plan, ...change };
    assert.throws(() => validateHandoffPlan(changed, sha256(canonical(changed))));
  }
  assert.throws(() => validateHandoffPlan(plan, sha256('unapproved plan')));
});

test('actual guarded Darwin-to-Linux synthetic handoff and tamper refusals', {
  skip: !process.env.ACTIVATION_HANDOFF_LINUX_TEST_CONFIG, timeout: 240000,
}, async t => {
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
  const config = readPrivate(process.env.ACTIVATION_HANDOFF_LINUX_TEST_CONFIG!);
  const image = 'docker.io/library/node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea';
  assert.equal(config.image, image);
  assert.equal(config.linuxNodeHash, 'e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb');
  const f = fixture(t), base = await artifactFixture();
  t.after(() => base.dispose());
  const files = base.artifact.manifest.source.files.filter(file => !file.path.startsWith('apps/api/migrations/'));
  for (const entry of migrationManifest) {
    const bytes = readFileSync(new URL(`../../migrations/${entry.name}.mjs`, import.meta.url));
    writeFileSync(join(base.operator, `apps/api/migrations/${entry.name}.mjs`), bytes);
    files.push({ path: `apps/api/migrations/${entry.name}.mjs`, mode: 0o644, size: bytes.length,
      sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
  }
  writeFileSync(join(base.operator, 'apps/api/build/scripts/activation.js'), 'throw new Error("SYNTHETIC_WORKER_MUST_NOT_EXECUTE");');
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'handoff'),
    config: base.config, migrations: [...migrationManifest], build: base.artifact.manifest.build,
    source: { ...base.artifact.manifest.source, repository: 'https://github.com/khuonghuyhieu/esty-admin',
      files, digest: sha256(canonical(files)) } });
  Object.assign(f.request, { artifactDigest: artifact.digest, sourceDigest: artifact.manifest.source.digest });
  const requestDigest = sha256(canonical(f.request));
  unlinkSync(f.path); writePrivate(f.path, f.request);
  const runtimeHash = sha256(readFileSync(process.execPath)), launcherHash = sha256(readFileSync(join(config.helperRoot, 'launch.mjs')));
  const hostCommand = (args: string[]) => guardedOwnerCommand(process.execPath, join(config.helperRoot, 'launch.mjs'),
    runtimeHash, launcherHash, config.manifestPath, config.manifestDigest, args);
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const guardedPrepare = `/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' /bin/sh -c ${quote(hostCommand(['prepare', f.path, requestDigest]))}`;
  const temporary = join(f.root, 'temporary'); mkdirSync(temporary, { mode: 0o700 });
  const preparation = spawnSync('python3', ['-c', ptyDriver, process.execPath, helper], { encoding: 'utf8', timeout: 60000,
    input: JSON.stringify({ root: f.root, temporary, guardedCommand: guardedPrepare,
      answers: Object.entries(f.fields).map(([field, value]) => [`${field} (hidden;`, value]) }) });
  assert.equal(preparation.status, 0, preparation.stderr);
  const prepared = JSON.parse(preparation.stdout); assert.equal(prepared.exit, 0, prepared.output);
  const inputs: string = prepared.output.match(/INPUTS_PREPARED ([^\r\n]+)/)?.[1]; assert.ok(inputs);
  t.after(() => discardPreparedInputs(inputs, requestDigest));
  const allOutput = [prepared.output];
  const receipt = readPrivate(join(inputs, 'receipt.json')), packet = packetFor(f.request, receipt.phases);
  const reports = join(f.root, 'reports'), tools = join(f.root, 'tools');
  mkdirSync(reports, { mode: 0o700 }); mkdirSync(tools, { mode: 0o700 });
  const packetPath = join(reports, 'packet-input.json'), cli = join(tools, 'vc.js');
  writePrivate(packetPath, packet); writeFileSync(cli, 'throw new Error("SYNTHETIC_CLI_MUST_NOT_EXECUTE");', { mode: 0o600 });
  const docker = ['/usr/local/bin/docker', '--config', config.dockerConfig, '--host', config.dockerHost];
  const cleanEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: config.dockerConfig };
  const pendingContainers = new Set<string>();
  t.after(() => { for (const name of pendingContainers) spawnSync(docker[0]!, [...docker.slice(1), 'rm', '--force', name], { env: cleanEnv, stdio: 'ignore', timeout: 15000 }); });
  const runLinux = (control: string, bindingDigest: string, manifestPath = config.manifestPath,
    manifestDigest = config.manifestDigest, inputMount = '/esty-activation-inputs-synthetic') => {
    const name = `esty-handoff-${randomUUID()}`;
    const command = guardedOwnerCommand('/usr/local/bin/node', '/helper/launch.mjs', config.linuxNodeHash,
      launcherHash, '/executable.json', manifestDigest, ['check-handoff', '/control/handoff-binding.json', bindingDigest]);
    pendingContainers.add(name);
    const mounts = [[config.helperRoot, '/helper'], [manifestPath, '/executable.json'], [inputs, inputMount],
      [artifact.root, '/artifact'], [reports, '/reports'], [tools, '/tools'], [control, '/control']];
    const result = spawnSync(docker[0]!, [...docker.slice(1), 'run', '--rm', '--pull', 'never', '--platform', 'linux/amd64',
      '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--pids-limit', '64', '--memory', '512m', '--cpus', '1', '--user', `${process.getuid!()}:${process.getgid!()}`,
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777',
      ...mounts.flatMap(([source, target]) => ['--mount', `type=bind,src=${source},dst=${target},readonly`]),
      image, '/bin/sh', '-c', command], { env: cleanEnv, encoding: 'utf8', timeout: 45000 });
    if (!result.error) pendingContainers.delete(name);
    allOutput.push(result.stdout ?? '', result.stderr ?? '');
    return result;
  };
  const controls = new Map<InputPhase, { path: string; digest: string }>();
  for (const phase of inputPhases) {
    const control = join(f.root, phase); mkdirSync(control, { mode: 0o700 });
    const plan: HandoffPlan = { version: 1, executableDigest: config.manifestDigest, requestDigest,
      packetDigest: sha256(canonical(packet)), phase, action: 'run',
      source: { inputs, packet: packetPath, artifact: artifact.root, reports, cli },
      destination: { inputs: '/esty-activation-inputs-synthetic', packet: '/reports/packet-input.json',
        artifact: '/artifact', reports: '/reports', cli: '/tools/vc.js' } };
    const planPath = join(control, 'handoff-plan.json'), bindingPath = join(control, 'handoff-binding.json');
    writePrivate(planPath, plan);
    const bound = spawnSync('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network*)', '/bin/sh', '-c',
      hostCommand(['bind-handoff', planPath, sha256(canonical(plan)), bindingPath])], { env: {}, encoding: 'utf8', timeout: 30000 });
    allOutput.push(bound.stdout, bound.stderr);
    assert.equal(bound.status, 0, bound.stderr);
    const digest = bound.stdout.match(/HANDOFF_BOUND ([a-f0-9]{64})/)?.[1]; assert.ok(digest);
    controls.set(phase, { path: control, digest });
    const result = runLinux(control, digest);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`HANDOFF_VALIDATED phase=${phase} action=run`));
  }
  const control = controls.get('bridge-config')!;
  const refused = (result: ReturnType<typeof runLinux>) => {
    assert.equal(result.status, 1, result.stderr); assert.doesNotMatch(result.stdout, /HANDOFF_VALIDATED/);
  };
  const phasePath = join(inputs, 'bridge-config.json'), phaseBytes = readFileSync(phasePath);
  const changedInput = JSON.parse(phaseBytes.toString()); changedInput.VERCEL_CONFIGURATION_TOKEN = 'synthetic-different-valid-configuration-token';
  try { writeFileSync(phasePath, JSON.stringify(changedInput)); refused(runLinux(control.path, control.digest)); }
  finally { writeFileSync(phasePath, phaseBytes); }
  const artifactPath = join(artifact.root, 'operator/apps/api/build/scripts/migrate.js'), artifactBytes = readFileSync(artifactPath);
  try { chmodSync(artifactPath, 0o644); writeFileSync(artifactPath, 'export const changed=true;'); refused(runLinux(control.path, control.digest)); }
  finally { writeFileSync(artifactPath, artifactBytes); chmodSync(artifactPath, 0o444); }
  const alteredManifest = JSON.parse(readFileSync(config.manifestPath, 'utf8'));
  alteredManifest.runtimes.find((runtime: { platform: string }) => runtime.platform === 'linux').sha256 = sha256('wrong Linux runtime');
  const wrongManifest = join(f.root, 'wrong-executable.json'), manifestBytes = JSON.stringify(alteredManifest);
  writeFileSync(wrongManifest, manifestBytes, { mode: 0o600 });
  refused(runLinux(control.path, control.digest, wrongManifest, sha256(manifestBytes)));
  refused(runLinux(control.path, control.digest, undefined, undefined, '/esty-activation-inputs-wrong'));
  const bindingPath = join(control.path, 'handoff-binding.json'), bindingBytes = readFileSync(bindingPath);
  try {
    const changed = JSON.parse(bindingBytes.toString()); changed.plan.phase = 'bootstrap';
    writeFileSync(bindingPath, JSON.stringify(changed)); refused(runLinux(control.path, control.digest));
  } finally { writeFileSync(bindingPath, bindingBytes); }
  try { chmodSync(phasePath, 0o644); refused(runLinux(control.path, control.digest)); }
  finally { chmodSync(phasePath, 0o600); }
  try { unlinkSync(phasePath); symlinkSync(f.path, phasePath); refused(runLinux(control.path, control.digest)); }
  finally { unlinkSync(phasePath); writeFileSync(phasePath, phaseBytes, { mode: 0o600 }); }
  const combined = allOutput.join('\n') + readFileSync(bindingPath, 'utf8');
  for (const value of Object.values(f.fields)) assert.ok(!combined.includes(value), 'A synthetic input value escaped the protected boundary');
  assert.doesNotMatch(combined, /SYNTHETIC_WORKER_MUST_NOT_EXECUTE|SYNTHETIC_CLI_MUST_NOT_EXECUTE/);
  t.diagnostic('Real Darwin guarded prepare/binding -> Linux guarded check-only consumption: five phases accepted; changed token bytes/artifact/runtime/path/phase/mode/symlink refused; no input value output or production worker execution.');
});

const transferDestinations = ['BE_ACTIVATION_BRIDGE_INPUTS', 'BE_ACTIVATION_ROLE_INPUTS', 'BE_ACTIVATION_MIGRATION_INPUTS',
  'BE_ACTIVATION_BOOTSTRAP_INPUTS', 'BE_ACTIVATION_APP_INPUTS', 'VERCEL_CONFIGURATION_TOKEN'] as const;
const transferPoison = 'SYNTHETIC_GH_OUTPUT_MUST_NOT_ESCAPE';
const transferProfileCanary = 'synthetic-approved-profile-credential-not-to-disclose';
type FakeGhScenario = {
  initialNames?: string[]; collisionAtList?: number; collisionName?: string; failDestination?: string;
  hangDestination?: string; malformedList?: boolean; tamperAcknowledgementAtList?: number;
};
type FakeGhCall = {
  args: string[]; env: Record<string, string>; cwd: string; ordinaryState: string;
  directories: Array<{ path: string; mode: number; uid: number }>;
};
type FakeGhState = {
  names: string[]; lists: number; calls: FakeGhCall[];
  reports?: string; failDestination?: string;
  sets: Array<{ destination: string; stdin: string; attempt: unknown; started: unknown; acknowledgedBeforeSet: boolean }>;
};
interface TransferFixture {
  root: string; request: InputRequest; digest: string; path: string; fields: Record<string, string>;
  inputs: string; reports: string; profile: string; profileFile: string; approvedHome: string; homeCanary: string; ambientHome: string;
  composition: { environments: Record<InputPhase, Record<string, string>>; phases: Record<InputPhase, { digest: string; binding?: string }> };
  receipt: { version: number; requestDigest: string; phases: Record<InputPhase, { digest: string; binding?: string }> };
  gh: string; ghDigest: string; guard: { digest: string; verify(): unknown }; statePath: string; runner: string; planPath: string;
}
const fakeGhDriver = String.raw`
import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync, watch } from 'node:fs';
import { join } from 'node:path';
const state = JSON.parse(readFileSync(config.state, 'utf8')), args = process.argv.slice(2);
const suffix = ['--env', 'be-production', '--repo', 'khuonghuyhieu/esty-admin'];
const isList = JSON.stringify(args) === JSON.stringify(['secret', 'list', ...suffix, '--json', 'name']);
const isSet = config.destinations.includes(args[2]) && JSON.stringify(args) === JSON.stringify(['secret', 'set', args[2], ...suffix]);
// Model supported XDG state precedence without reading or writing authentication files.
const stateHome = process.env.XDG_STATE_HOME || join(process.env.HOME, '.local', 'state');
const ordinaryState = join(stateHome, 'gh', 'device-id');
mkdirSync(join(stateHome, 'gh'), { recursive: true, mode: 0o700 });
writeFileSync(ordinaryState, 'synthetic-noncredential-device-id', { mode: 0o600 });
const directories = [...new Set([process.cwd(), process.env.TMPDIR, stateHome])].map(path => {
  const info = lstatSync(path);
  return { path, mode: info.mode & 0o777, uid: info.uid };
});
state.calls.push({ args, env: { ...process.env }, cwd: process.cwd(), ordinaryState, directories });
const save = () => writeFileSync(config.state, JSON.stringify(state), { mode: 0o600 });
// Model HOME-dependent native authentication without reading any credential store.
if (process.env.HOME !== config.approvedHome || process.env.GH_CONFIG_DIR !== config.profile) {
  save(); process.stderr.write('HTTP401 Requires authentication'); process.exit(1);
}
if (!isList && !isSet) {
  save(); process.stderr.write(config.poison); process.exit(42);
}
if (isList) {
  state.lists++;
  if (state.lists === config.collisionAtList) state.names.push(config.collisionName);
  if (state.lists === config.tamperAcknowledgementAtList) {
    const path = join(config.reports, 'transfer-' + config.destinations[0] + '.ack.json');
    const acknowledgement = JSON.parse(readFileSync(path, 'utf8'));
    acknowledgement.binding.requestDigest = '0'.repeat(64);
    writeFileSync(path, JSON.stringify(acknowledgement));
  }
  save();
  process.stdout.write(config.malformedList ? JSON.stringify([{ name: 'UNRELATED_SYNTHETIC_SECRET', value: config.poison }])
    : JSON.stringify(state.names.map(name => ({ name }))));
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const destination = args[2];
  const reports = state.reports || config.reports;
  const attempt = JSON.parse(readFileSync(join(reports, 'transfer-attempt.json'), 'utf8'));
  const started = JSON.parse(readFileSync(join(reports, 'transfer-' + destination + '.started.json'), 'utf8'));
  state.sets.push({ destination, stdin: Buffer.concat(chunks).toString('base64'), attempt, started,
    acknowledgedBeforeSet: existsSync(join(reports, 'transfer-' + destination + '.ack.json')) });
  if (!state.names.includes(destination)) state.names.push(destination); save();
  process.stdout.write(config.poison); process.stderr.write(config.poison);
  if (destination === (state.failDestination || config.failDestination)) process.exitCode = 23;
  if (destination === config.hangDestination) {
    writeFileSync(config.state + '.cancel-ready', '', { mode: 0o600, flag: 'wx' });
    watch(config.state, () => {});
  }
}
`;
const transferRunner = String.raw`
import { readFileSync, watch } from 'node:fs';
import { dirname, basename } from 'node:path';
import assert from 'node:assert/strict';
const settings = JSON.parse(readFileSync(process.argv[2], 'utf8'));
Object.assign(process.env, settings.ambient);
const abort = new AbortController();
// Cancellation follows the fake's durable write event, not a guessed sleep.
const cancellation = settings.cancelDestination ? watch(dirname(settings.state), (_, filename) => {
  if (filename === basename(settings.state) + '.cancel-ready') abort.abort();
}) : undefined;
try {
  const value = await transferPreparedSecrets(settings.planPath, settings.planDigest,
    { digest: settings.guardDigest, verify() { return settings.trustedManifest; } }, AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]));
  console.log(JSON.stringify({ status: 'complete', value }));
} catch (error) {
  console.log(JSON.stringify({ status: 'refused', message: transferFailureMessage(error) }));
  process.exitCode = 1;
} finally {
  cancellation?.close();
  for (const [key, value] of Object.entries(settings.ambient)) assert.equal(process.env[key], value);
}
`;
function transferFixture(t: { after(fn: () => void): void }, scenario: FakeGhScenario = {}): TransferFixture {
  const f = fixture(t);
  Object.assign(f.request, { revision: retainedActivation.revision, tree: retainedActivation.tree,
    sourceDigest: retainedActivation.sourceDigest, artifactDigest: retainedActivation.artifactDigest,
    projectId: retainedActivation.project, scopeId: retainedActivation.scope, target: retainedActivation.target,
    buildRun: retainedActivation.runId });
  const composition = composePhaseInputs(f.request, f.fields), digest = sha256(canonical(f.request));
  const inputs = join(f.root, 'esty-activation-inputs-transfer'), reports = join(f.root, 'reports');
  const profile = join(f.root, 'approved-profile'), approvedHome = join(f.root, 'approved-home'), ambientHome = join(f.root, 'ambient-home');
  for (const path of [inputs, reports, profile, approvedHome, ambientHome]) mkdirSync(path, { mode: 0o700 });
  const homeCanary = join(approvedHome, 'preserve-home');
  writeFileSync(homeCanary, 'synthetic-home-canary', { mode: 0o600, flag: 'wx' });
  const path = join(inputs, 'input-request.json'), receipt = { version: 1, requestDigest: digest, phases: composition.phases };
  unlinkSync(f.path); writePrivate(path, f.request); writePrivate(join(inputs, 'receipt.json'), receipt);
  // Whitespace belongs to the approved raw JSON payload and must not be normalized in transit.
  composition.environments.roles.ACTIVATION_ROLE_INPUTS = ` \n${composition.environments.roles.ACTIVATION_ROLE_INPUTS}\n `;
  for (const phase of inputPhases) writePrivate(join(inputs, `${phase}.json`), composition.environments[phase]);
  const profileFile = join(profile, 'hosts.yml');
  writeFileSync(profileFile, transferProfileCanary, { mode: 0o600, flag: 'wx' });
  const statePath = join(f.root, 'fake-gh-state.json'), driver = join(f.root, 'fake-gh.mjs'), gh = join(f.root, 'gh');
  writePrivate(statePath, { names: scenario.initialNames ?? [], lists: 0, calls: [], sets: [] });
  const poison = `${transferPoison} ${token} ${f.fields.APP_OPERATOR_AUTH_KEY} ${f.fields.MIGRATION_DATABASE_PASSWORD}`;
  writeFileSync(driver, `const config = ${JSON.stringify({ ...scenario, state: statePath, reports, destinations: transferDestinations, poison, approvedHome, profile })};\n${fakeGhDriver}`,
    { mode: 0o600, flag: 'wx' });
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(gh, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(driver)} "$@"\n`, { mode: 0o700, flag: 'wx' });
  const runner = join(f.root, 'transfer-runner.mjs');
  writeFileSync(runner, `import { transferPreparedSecrets, transferFailureMessage } from ${JSON.stringify(new URL('../scripts/activation-input-transfer.js', import.meta.url).href)};\n${transferRunner}`,
    { mode: 0o600, flag: 'wx' });
  const ghDigest = sha256(readFileSync(gh)), transferGh = Object.freeze({ path: gh, sha256: ghDigest, home: approvedHome, configDirectory: profile });
  const guard = { digest: sha256('synthetic-transfer-executable'), verify() { return { transferGh }; } };
  return { ...f, path, digest, inputs, reports, profile, profileFile, approvedHome, homeCanary, ambientHome, composition, receipt, gh,
    ghDigest, guard, statePath, runner, planPath: join(reports, 'transfer-plan.json') };
}
function inspectTransfer(f: TransferFixture) {
  return inspectPreparedTransfer(f.inputs, f.digest, f.gh, f.ghDigest, f.profile, f.reports, f.guard) as {
    planDigest: string; requestDigest: string; receiptDigest: string; phases: Record<InputPhase, { digest: string; binding?: string }>;
  };
}
function fakeGhState(f: TransferFixture): FakeGhState { return readPrivate(f.statePath); }
function transferReportBytes(f: TransferFixture) {
  return Object.fromEntries(readdirSync(f.reports).sort().map(name => [name, readFileSync(join(f.reports, name))]));
}
function assertTransferPrivate(f: TransferFixture, output: string) {
  for (const value of [...Object.values(f.fields), transferPoison, transferProfileCanary]) {
    assert.ok(!output.includes(value), 'A synthetic credential or untrusted child output escaped the transfer boundary');
  }
}
function runTransfer(f: TransferFixture, planDigest: string, options: { planPath?: string; guardDigest?: string; cancelDestination?: string } = {}) {
  const settings = join(f.root, `execute-${randomUUID()}.json`);
  const ambient = { HOME: f.ambientHome, TMPDIR: f.ambientHome, GH_CONFIG_DIR: join(f.ambientHome, 'wrong-profile'),
    XDG_STATE_HOME: join(f.ambientHome, 'unapproved-state'),
    GH_TOKEN: 'synthetic-ambient-gh-token', GITHUB_TOKEN: 'synthetic-ambient-github-token',
    GH_ENTERPRISE_TOKEN: 'synthetic-ambient-enterprise-token', GITHUB_ENTERPRISE_TOKEN: 'synthetic-ambient-enterprise-github-token',
    VERCEL_TOKEN: 'synthetic-ambient-provider-token', SUPABASE_ACCESS_TOKEN: 'synthetic-ambient-supabase-token',
    VERCEL_CONFIGURATION_TOKEN: token, ACTIVATION_ROLE_INPUTS: f.composition.environments.roles.ACTIVATION_ROLE_INPUTS,
    NODE_OPTIONS: '--import=data:text/javascript,throw%20new%20Error(%22SYNTHETIC_NODE_OPTIONS_MUST_NOT_RUN%22)',
    NODE_DEBUG: 'child_process', GH_DEBUG: 'api', GH_HOST: 'synthetic-attacker.invalid',
    HTTP_PROXY: 'http://synthetic-proxy.invalid', HTTPS_PROXY: 'http://synthetic-proxy.invalid',
    ALL_PROXY: 'http://synthetic-proxy.invalid', SSLKEYLOGFILE: join(f.root, 'must-not-create-tls-log') };
  writePrivate(settings, { planPath: options.planPath ?? f.planPath, planDigest, guardDigest: options.guardDigest ?? f.guard.digest,
    cancelDestination: options.cancelDestination, state: f.statePath, ambient, trustedManifest: f.guard.verify() });
  const result = spawnSync(process.execPath, [f.runner, settings], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    env: { PATH: '/usr/bin:/bin', HOME: f.ambientHome, TMPDIR: f.ambientHome, NO_COLOR: '1' } });
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  assertTransferPrivate(f, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  const outcome = JSON.parse(result.stdout) as { status: 'complete' | 'refused'; value?: unknown; message?: string };
  assert.equal(result.status, outcome.status === 'complete' ? 0 : 1);
  return { ...outcome, output: result.stdout + result.stderr };
}
function assertNoGh(f: TransferFixture) {
  assert.deepEqual(fakeGhState(f).calls, []);
  assert.deepEqual(fakeGhState(f).sets, []);
  assert.equal(existsSync(join(f.reports, 'transfer-attempt.json')), false);
}

test('protected transfer sends six exact stdin payloads through an isolated profile and binds every acknowledgement', t => {
  const f = transferFixture(t, { initialNames: ['UNRELATED_SYNTHETIC_SECRET'] });
  const originals = Object.fromEntries([...readdirSync(f.inputs).map(name => join(f.inputs, name)), f.profileFile, f.homeCanary]
    .map(path => [path, readFileSync(path)]));
  const inspected = inspectTransfer(f), plan = readPrivate(f.planPath);
  assert.equal(inspected.planDigest, sha256(canonical(plan)));
  assert.equal(inspected.requestDigest, f.digest);
  assert.equal(inspected.receiptDigest, sha256(canonical(f.receipt)));
  assert.deepEqual(inspected.phases, f.composition.phases);
  assert.deepEqual(plan.destinations, transferDestinations);
  assert.equal(plan.repository, retainedActivation.repository); assert.equal(plan.environment, 'be-production');
  assert.deepEqual(plan.gh, { path: f.gh, sha256: f.ghDigest, configDirectory: f.profile });
  assert.equal(plan.inputs, f.inputs); assert.equal(plan.reports, f.reports);
  const binding = { planDigest: inspected.planDigest, requestDigest: f.digest, receiptDigest: inspected.receiptDigest,
    inventoryDigest: plan.inventoryDigest, executableDigest: f.guard.digest };
  const result = runTransfer(f, inspected.planDigest);
  assert.equal(result.status, 'complete', result.message);
  const state = fakeGhState(f);
  assert.deepEqual(state.sets.map(entry => entry.destination), transferDestinations);
  const payloads = [...inputPhases.map(phase => Buffer.from(f.composition.environments[phase][variables[phase]]!)), Buffer.from(token)];
  assert.deepEqual(state.sets.map(entry => Buffer.from(entry.stdin, 'base64')), payloads);
  const suffix = ['--env', 'be-production', '--repo', retainedActivation.repository];
  assert.deepEqual(state.calls.map(call => call.args),
    transferDestinations.flatMap(destination => [['secret', 'list', ...suffix, '--json', 'name'], ['secret', 'set', destination, ...suffix]]));
  const denied = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'VERCEL_TOKEN', 'SUPABASE_ACCESS_TOKEN',
    'VERCEL_CONFIGURATION_TOKEN', 'ACTIVATION_ROLE_INPUTS', 'NODE_OPTIONS', 'NODE_DEBUG', 'GH_DEBUG',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'SSLKEYLOGFILE'];
  for (const call of state.calls) {
    assertTransferPrivate(f, JSON.stringify({ args: call.args, env: call.env }));
    assert.equal(call.env.GH_CONFIG_DIR, f.profile);
    assert.equal(call.env.HOME, f.approvedHome);
    assert.equal(call.cwd, call.env.TMPDIR);
    assert.equal(call.env.XDG_STATE_HOME, join(call.cwd, 'state'));
    assert.equal(call.ordinaryState, join(call.cwd, 'state', 'gh', 'device-id'));
    assert.equal(existsSync(call.ordinaryState), false, 'Ordinary gh state survived scratch cleanup');
    assert.equal(call.env.PATH, '/usr/bin:/bin'); assert.equal(call.env.GH_HOST, 'github.com');
    assert.equal(call.env.GH_PROMPT_DISABLED, '1'); assert.equal(call.env.NO_COLOR, '1');
    for (const name of denied) assert.equal(call.env[name], undefined, `${name} reached fake gh`);
    for (const directory of call.directories) {
      assert.equal(directory.mode, 0o700); assert.equal(directory.uid, process.getuid!());
      assert.notEqual(directory.path, f.ambientHome);
      for (const protectedPath of [f.inputs, f.profile, f.approvedHome, f.reports]) {
        assert.notEqual(directory.path, protectedPath); assert.ok(!directory.path.startsWith(`${protectedPath}/`));
      }
      assert.equal(existsSync(directory.path), false, 'An isolated subprocess directory survived completion');
    }
  }
  const attempt = { version: 1, kind: 'attempt', repository: retainedActivation.repository,
    environment: 'be-production', binding, destinations: [...transferDestinations] };
  assert.deepEqual(readPrivate(join(f.reports, 'transfer-attempt.json')), attempt);
  const acknowledgements = transferDestinations.map((destination, index) => {
    const started = { version: 1, kind: 'started', binding, destination, state: 'unknown' };
    const acknowledged = { version: 1, kind: 'acknowledged', binding, destination, startedDigest: sha256(canonical(started)) };
    assert.deepEqual(state.sets[index]!.attempt, attempt);
    assert.deepEqual(state.sets[index]!.started, started);
    assert.equal(state.sets[index]!.acknowledgedBeforeSet, false);
    assert.deepEqual(readPrivate(join(f.reports, `transfer-${destination}.started.json`)), started);
    assert.deepEqual(readPrivate(join(f.reports, `transfer-${destination}.ack.json`)), acknowledged);
    return { destination, acknowledgementDigest: sha256(canonical(acknowledged)) };
  });
  const complete = { version: 1, kind: 'complete', repository: retainedActivation.repository,
    environment: 'be-production', binding, acknowledgements };
  assert.deepEqual(result.value, complete);
  assert.deepEqual(readPrivate(join(f.reports, 'transfer-complete.json')), complete);
  const reports = transferReportBytes(f);
  assert.deepEqual(Object.keys(reports).sort(), ['transfer-plan.json', 'transfer-attempt.json', 'transfer-complete.json',
    ...transferDestinations.flatMap(name => [`transfer-${name}.started.json`, `transfer-${name}.ack.json`])].sort());
  for (const [name, bytes] of Object.entries(reports)) {
    assert.equal(lstatSync(join(f.reports, name)).mode & 0o777, 0o600);
    assertTransferPrivate(f, bytes.toString('utf8'));
  }
  assertTransferPrivate(f, JSON.stringify(inspected) + result.output);
  for (const [path, bytes] of Object.entries(originals)) assert.deepEqual(readFileSync(path), bytes);
  assert.deepEqual(readdirSync(f.profile), ['hosts.yml']);
  assert.deepEqual(readdirSync(f.approvedHome), ['preserve-home']);
  assert.equal(existsSync(join(f.ambientHome, 'unapproved-state')), false);
  assert.equal(existsSync(join(f.root, 'must-not-create-tls-log')), false);
  const replay = runTransfer(f, inspected.planDigest);
  assert.equal(replay.status, 'refused'); assert.match(replay.message!, /reason=attempt_exists/);
  assert.deepEqual(fakeGhState(f), state); assert.deepEqual(transferReportBytes(f), reports);
});

test('protected transfer refuses self-consistent unapproved executables before prepared input access or gh execution', t => {
  for (const scenario of ['different-path', 'same-path-new-bytes', 'missing-anchor']) {
    const f = transferFixture(t); inspectTransfer(f);
    const marker = join(f.root, 'malicious-executable-ran');
    const malicious = scenario === 'same-path-new-bytes' ? f.gh : join(f.root, 'unapproved-gh');
    writeFileSync(malicious, `#!/bin/sh\nprintf captured > '${marker}'\n`, { mode: 0o700 });
    const maliciousDigest = sha256(readFileSync(malicious));
    if (scenario === 'missing-anchor') f.guard = { digest: f.guard.digest, verify() { return {}; } };
    const plan = readPrivate(f.planPath);
    plan.gh.path = malicious; plan.gh.sha256 = maliciousDigest;
    writeFileSync(f.planPath, JSON.stringify(plan));
    // Invalid prepared bytes distinguish trust refusal from any attempted payload validation.
    writeFileSync(f.path, '{invalid prepared request');
    const reason = scenario === 'missing-anchor' ? 'guard_mismatch' : 'executable_mismatch';
    assert.throws(() => inspectPreparedTransfer(f.inputs, f.digest, malicious, maliciousDigest, f.profile, f.reports, f.guard),
      error => transferFailureMessage(error).includes(`reason=${reason}`));
    const result = runTransfer(f, sha256(canonical(plan)));
    assert.equal(result.status, 'refused'); assert.ok(result.message!.includes(`reason=${reason}`));
    assert.equal(existsSync(marker), false); assertNoGh(f);
  }
});

test('protected transfer refuses missing or unapproved HOME/profile context before prepared input access', t => {
  for (const scenario of ['missing-home', 'missing-profile', 'relative-home', 'root-home', 'noncanonical-profile', 'caller-profile']) {
    const f = transferFixture(t); inspectTransfer(f);
    const manifest = f.guard.verify() as { transferGh: Record<string, unknown> };
    const transferGh = { ...manifest.transferGh };
    let profile = f.profile;
    if (scenario === 'missing-home') delete transferGh.home;
    if (scenario === 'missing-profile') delete transferGh.configDirectory;
    if (scenario === 'relative-home') transferGh.home = 'unapproved-relative-home';
    if (scenario === 'root-home') transferGh.home = '/';
    if (scenario === 'noncanonical-profile') transferGh.configDirectory = `${f.profile}/../approved-profile`;
    if (scenario === 'caller-profile') profile = f.ambientHome;
    f.guard = { digest: f.guard.digest, verify() { return { transferGh }; } };
    const plan = readPrivate(f.planPath); plan.gh.configDirectory = profile;
    writeFileSync(f.planPath, JSON.stringify(plan));
    writeFileSync(f.path, '{invalid prepared request');
    assert.throws(() => inspectPreparedTransfer(f.inputs, f.digest, f.gh, f.ghDigest, profile, f.reports, f.guard),
      error => transferFailureMessage(error).includes('reason=guard_mismatch'));
    const result = runTransfer(f, sha256(canonical(plan)));
    assert.equal(result.status, 'refused'); assert.match(result.message!, /reason=guard_mismatch/);
    assertNoGh(f);
    assert.equal(readFileSync(f.homeCanary, 'utf8'), 'synthetic-home-canary');
    assert.equal(readFileSync(f.profileFile, 'utf8'), transferProfileCanary);
  }
});

test('protected transfer inspection refuses retained source substitutions and request schema changes', t => {
  for (const change of [{ revision: 'c'.repeat(40) }, { tree: 'd'.repeat(40) }, { sourceDigest: sha256('different-source') },
    { artifactDigest: sha256('different-artifact') }, { buildRun: '123' }, { projectId: 'other-project' },
    { scopeId: 'other-scope' }, { target: 'supabase:other-project' }, { extra: token }]) {
    const f = transferFixture(t), request = { ...f.request, ...change }, digest = sha256(canonical(request));
    writeFileSync(f.path, JSON.stringify(request));
    writeFileSync(join(f.inputs, 'receipt.json'), JSON.stringify({ ...f.receipt, requestDigest: digest }));
    assert.throws(() => inspectPreparedTransfer(f.inputs, digest, f.gh, f.ghDigest, f.profile, f.reports, f.guard));
    assertNoGh(f); assert.deepEqual(readdirSync(f.reports), []);
  }
});

test('protected transfer rejects target, destination, plan schema, digest and executable-binding tampering before gh', t => {
  for (const change of [{ repository: 'synthetic/other-repository' }, { environment: 'staging' },
    { destinations: [...transferDestinations.slice(0, -1), 'VERCEL_TOKEN'] },
    { destinations: [...transferDestinations].reverse() }, { destinations: [...transferDestinations.slice(0, -1)] },
    { extra: token }, { version: 2 }, { requestDigest: sha256('different-request') }, { receiptDigest: sha256('different-receipt') },
    { inventoryDigest: sha256('different-inventory') }, { executableDigest: sha256('different-executable') }]) {
    const f = transferFixture(t); inspectTransfer(f);
    const plan = { ...readPrivate(f.planPath), ...change };
    writeFileSync(f.planPath, JSON.stringify(plan));
    assert.equal(runTransfer(f, sha256(canonical(plan))).status, 'refused', Object.keys(change).join(','));
    assertNoGh(f);
  }
  for (const scenario of ['unapproved-digest', 'wrong-guard', 'relocated-plan', 'changed-gh-hash']) {
    const f = transferFixture(t), inspected = inspectTransfer(f);
    let digest = inspected.planDigest, planPath = f.planPath, guardDigest = f.guard.digest;
    if (scenario === 'unapproved-digest') digest = sha256('not-approved');
    if (scenario === 'wrong-guard') guardDigest = sha256('not-this-guard');
    if (scenario === 'relocated-plan') {
      const other = join(f.root, 'other-reports'); mkdirSync(other, { mode: 0o700 });
      planPath = join(other, 'transfer-plan.json'); writePrivate(planPath, readPrivate(f.planPath));
    }
    if (scenario === 'changed-gh-hash') {
      const plan = readPrivate(f.planPath); plan.gh.sha256 = sha256('not-this-gh');
      writeFileSync(f.planPath, JSON.stringify(plan)); digest = sha256(canonical(plan));
    }
    assert.equal(runTransfer(f, digest, { planPath, guardDigest }).status, 'refused', scenario);
    assertNoGh(f);
  }
});

test('protected transfer validates every phase, exact inventory, receipt binding and shared token before any write', t => {
  const corruptions: Record<string, (f: TransferFixture) => void> = {
    'receipt-request': f => writeFileSync(join(f.inputs, 'receipt.json'), JSON.stringify({ ...f.receipt, requestDigest: sha256('wrong-request') })),
    'receipt-schema': f => writeFileSync(join(f.inputs, 'receipt.json'), JSON.stringify({ ...f.receipt, extra: token })),
    'receipt-phase-digest': f => {
      f.receipt.phases.roles.digest = sha256('wrong-phase');
      writeFileSync(join(f.inputs, 'receipt.json'), JSON.stringify(f.receipt));
    },
    'receipt-bootstrap-binding': f => {
      f.receipt.phases.bootstrap.binding = sha256('wrong-bootstrap-binding');
      writeFileSync(join(f.inputs, 'receipt.json'), JSON.stringify(f.receipt));
    },
    'extra-inventory-file': f => writePrivate(join(f.inputs, 'unapproved.json'), { synthetic: true }),
    'missing-phase': f => unlinkSync(join(f.inputs, 'migration.json')),
    'environment-schema': f => {
      const path = join(f.inputs, 'roles.json');
      writeFileSync(path, JSON.stringify({ ...readPrivate(path), GH_TOKEN: token }));
    },
    'changed-phase-value': f => {
      const path = join(f.inputs, 'bootstrap.json'), environment = readPrivate(path);
      const input = JSON.parse(environment.ACTIVATION_BOOTSTRAP_INPUTS);
      input.APP_OPERATOR_AUTH_KEY = 'synthetic-changed-auth-admin';
      environment.ACTIVATION_BOOTSTRAP_INPUTS = canonical(input);
      writeFileSync(path, JSON.stringify(environment));
    },
    'configuration-token-disagreement': f => {
      const path = join(f.inputs, 'app-config.json');
      writeFileSync(path, JSON.stringify({ ...readPrivate(path), VERCEL_CONFIGURATION_TOKEN: 'synthetic-different-config-token' }));
    },
  };
  for (const [name, corrupt] of Object.entries(corruptions)) {
    for (const stage of ['inspect', 'transfer']) {
      const f = transferFixture(t), inspected = stage === 'transfer' ? inspectTransfer(f) : undefined;
      corrupt(f);
      if (inspected) assert.equal(runTransfer(f, inspected.planDigest).status, 'refused', name);
      else { assert.throws(() => inspectTransfer(f), name); assert.deepEqual(readdirSync(f.reports), []); }
      assertNoGh(f);
    }
  }
});

test('protected transfer rejects post-inspection request, valid receipt and raw inventory drift', t => {
  for (const scenario of ['request', 'valid-receipt', 'raw-inventory']) {
    const f = transferFixture(t), inspected = inspectTransfer(f);
    if (scenario === 'request') {
      writeFileSync(f.path, JSON.stringify({ ...f.request, retentionApprovalDigest: sha256('other-approved-retention') }));
    } else if (scenario === 'valid-receipt') {
      const path = join(f.inputs, 'bootstrap.json'), environment = readPrivate(path);
      const input = JSON.parse(environment.ACTIVATION_BOOTSTRAP_INPUTS);
      input.APP_OPERATOR_AUTH_KEY = 'synthetic-replaced-auth-admin';
      environment.ACTIVATION_BOOTSTRAP_INPUTS = canonical(input);
      f.receipt.phases.bootstrap = validatePreparedPhase(f.request, 'bootstrap', environment);
      writeFileSync(path, JSON.stringify(environment));
      writeFileSync(join(f.inputs, 'receipt.json'), JSON.stringify(f.receipt));
    } else {
      const path = join(f.inputs, 'roles.json');
      writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
    }
    assert.equal(runTransfer(f, inspected.planDigest).status, 'refused', scenario);
    assertNoGh(f);
  }
});

test('protected transfer refuses unsafe modes, symlinks, path overlaps and replacement of an approved executable', t => {
  const unsafe: Record<string, (f: TransferFixture) => void> = {
    'input-directory-mode': f => chmodSync(f.inputs, 0o750),
    'report-directory-mode': f => chmodSync(f.reports, 0o755),
    'phase-mode': f => chmodSync(join(f.inputs, 'roles.json'), 0o644),
    'gh-writable': f => chmodSync(f.gh, 0o722),
    'gh-not-executable': f => chmodSync(f.gh, 0o600),
    'gh-bytes': f => writeFileSync(f.gh, `${readFileSync(f.gh, 'utf8')}\n`),
    'phase-symlink': f => {
      const path = join(f.inputs, 'roles.json'), target = join(f.root, 'role-copy.json');
      writePrivate(target, readPrivate(path)); unlinkSync(path); symlinkSync(target, path);
    },
    'gh-symlink': f => {
      const target = join(f.root, 'gh-copy');
      writeFileSync(target, readFileSync(f.gh), { mode: 0o700 }); unlinkSync(f.gh); symlinkSync(target, f.gh);
    },
    'input-directory-symlink': f => {
      const target = join(f.root, 'input-copy'); renameSync(f.inputs, target); symlinkSync(target, f.inputs);
    },
    'report-directory-symlink': f => {
      const target = join(f.root, 'reports-copy'); renameSync(f.reports, target); symlinkSync(target, f.reports);
    },
  };
  for (const [name, change] of Object.entries(unsafe)) {
    for (const stage of ['inspect', 'transfer']) {
      const f = transferFixture(t), inspected = stage === 'transfer' ? inspectTransfer(f) : undefined;
      change(f);
      if (inspected) assert.equal(runTransfer(f, inspected.planDigest).status, 'refused', name);
      else assert.throws(() => inspectTransfer(f), name);
      assertNoGh(f);
    }
  }
  for (const scenario of ['profile-overlap', 'input-overlap', 'relative-profile', 'noncanonical-profile', 'plan-mode', 'plan-symlink']) {
    const f = transferFixture(t);
    if (scenario.startsWith('plan-')) {
      const inspected = inspectTransfer(f);
      if (scenario === 'plan-mode') chmodSync(f.planPath, 0o644);
      else {
        const target = join(f.root, 'plan-copy.json'); writePrivate(target, readPrivate(f.planPath));
        unlinkSync(f.planPath); symlinkSync(target, f.planPath);
      }
      assert.equal(runTransfer(f, inspected.planDigest).status, 'refused', scenario);
    } else {
      const reports = scenario === 'profile-overlap' ? f.profile : scenario === 'input-overlap' ? f.inputs : f.reports;
      const profile = scenario === 'relative-profile' ? 'approved-profile'
        : scenario === 'noncanonical-profile' ? `${f.profile}/../approved-profile` : f.profile;
      assert.throws(() => inspectPreparedTransfer(f.inputs, f.digest, f.gh, f.ghDigest, profile, reports, f.guard), scenario);
    }
    assertNoGh(f);
  }
});

test('protected transfer inspection preserves an existing plan and never discovers an owner profile', t => {
  const f = transferFixture(t);
  f.profile = join(f.root, 'profile-that-does-not-exist');
  f.approvedHome = join(f.root, 'home-that-does-not-exist');
  const transferGh = { path: f.gh, sha256: f.ghDigest, home: f.approvedHome, configDirectory: f.profile };
  f.guard = { digest: f.guard.digest, verify() { return { transferGh }; } };
  const inspected = inspectTransfer(f), reports = transferReportBytes(f);
  assert.equal(readPrivate(f.planPath).gh.configDirectory, f.profile);
  assert.equal(existsSync(f.profile), false);
  assert.equal(existsSync(f.approvedHome), false);
  assert.throws(() => inspectTransfer(f));
  assert.deepEqual(transferReportBytes(f), reports);
  assert.equal(readPrivate(f.planPath).requestDigest, inspected.requestDigest);
  assertNoGh(f);
});

test('protected transfer initial collisions identify each exact destination without writing any secret', t => {
  for (const destination of transferDestinations) {
    const f = transferFixture(t, { initialNames: [destination] }), inspected = inspectTransfer(f);
    const result = runTransfer(f, inspected.planDigest), state = fakeGhState(f);
    assert.equal(result.status, 'refused');
    assert.match(result.message!, /reason=collision/); assert.ok(result.message!.includes(`destination=${destination}`));
    assert.deepEqual(state.sets, []); assert.equal(state.lists, 1);
    assert.deepEqual(state.names, [destination]);
    for (const name of transferDestinations) {
      assert.equal(existsSync(join(f.reports, `transfer-${name}.started.json`)), false);
      assert.equal(existsSync(join(f.reports, `transfer-${name}.ack.json`)), false);
    }
    assert.equal(existsSync(join(f.reports, 'transfer-complete.json')), false);
  }
});

test('protected transfer later collisions check every unwritten name and preserve earlier acknowledgements', t => {
  const destination = 'VERCEL_CONFIGURATION_TOKEN';
  const f = transferFixture(t, { collisionAtList: 2, collisionName: destination }), inspected = inspectTransfer(f);
  const result = runTransfer(f, inspected.planDigest), state = fakeGhState(f);
  assert.equal(result.status, 'refused'); assert.match(result.message!, /reason=collision/);
  assert.ok(result.message!.includes(`destination=${destination}`));
  assert.deepEqual(state.sets.map(entry => entry.destination), [transferDestinations[0]]);
  assert.equal(state.lists, 2);
  assert.deepEqual(state.names, [transferDestinations[0], destination]);
  assert.equal(readPrivate(join(f.reports, `transfer-${transferDestinations[0]}.ack.json`)).destination, transferDestinations[0]);
  for (const name of transferDestinations.slice(1)) assert.equal(existsSync(join(f.reports, `transfer-${name}.started.json`)), false);
  assert.equal(existsSync(join(f.reports, 'transfer-complete.json')), false);
  assertTransferPrivate(f, Object.values(transferReportBytes(f)).map(bytes => bytes.toString('utf8')).join(''));
});

test('protected transfer rejects non-names-only inventory output without disclosing poisoned child output', t => {
  const f = transferFixture(t, { malformedList: true }), inspected = inspectTransfer(f);
  const result = runTransfer(f, inspected.planDigest), state = fakeGhState(f);
  assert.equal(result.status, 'refused'); assert.deepEqual(state.sets, []); assert.equal(state.lists, 1);
  assert.equal(existsSync(join(f.reports, 'transfer-complete.json')), false);
  for (const error of [new Error(token), { name: 'TransferFailure', message: token }, token]) {
    assertTransferPrivate(f, transferFailureMessage(error));
  }
});

test('protected transfer lost acknowledgements and cancellation retain UNKNOWN fences and refuse retry despite name presence', t => {
  for (const scenario of ['lost-ack', 'cancel']) {
    const index = scenario === 'lost-ack' ? 2 : 0, destination = transferDestinations[index];
    const f = transferFixture(t, scenario === 'lost-ack' ? { failDestination: destination } : { hangDestination: destination });
    const inspected = inspectTransfer(f), result = runTransfer(f, inspected.planDigest,
      scenario === 'cancel' ? { cancelDestination: destination } : {});
    const state = fakeGhState(f);
    assert.equal(result.status, 'refused'); assert.match(result.message!, /outcome=UNKNOWN/);
    assert.ok(result.message!.includes(`destination=${destination}`));
    assert.deepEqual(state.sets.map(entry => entry.destination), transferDestinations.slice(0, index + 1));
    assert.deepEqual(state.names, transferDestinations.slice(0, index + 1)); assert.equal(state.lists, index + 1);
    const started = readPrivate(join(f.reports, `transfer-${destination}.started.json`));
    assert.equal(started.destination, destination); assert.equal(started.state, 'unknown');
    assert.equal(started.binding.planDigest, inspected.planDigest); assert.equal(started.binding.requestDigest, f.digest);
    assert.equal(started.binding.receiptDigest, inspected.receiptDigest);
    assert.equal(existsSync(join(f.reports, `transfer-${destination}.ack.json`)), false);
    assert.equal(existsSync(join(f.reports, 'transfer-complete.json')), false);
    for (const name of transferDestinations.slice(0, index)) {
      assert.equal(readPrivate(join(f.reports, `transfer-${name}.ack.json`)).destination, name);
    }
    for (const name of transferDestinations.slice(index + 1)) assert.equal(existsSync(join(f.reports, `transfer-${name}.started.json`)), false);
    const reports = transferReportBytes(f), replay = runTransfer(f, inspected.planDigest);
    assert.equal(replay.status, 'refused'); assert.match(replay.message!, /reason=attempt_exists/);
    assert.match(replay.message!, /outcome=UNKNOWN/); assert.ok(replay.message!.includes(`destination=${destination}`));
    assert.deepEqual(fakeGhState(f), state, 'A fenced retry must not query later name presence or run another set');
    assert.deepEqual(transferReportBytes(f), reports);
    assertTransferPrivate(f, Object.values(reports).map(bytes => bytes.toString('utf8')).join(''));
    for (const call of state.calls) for (const directory of call.directories) assert.equal(existsSync(directory.path), false);
    for (const call of state.calls) assert.equal(existsSync(call.ordinaryState), false);
    assert.equal(readFileSync(f.homeCanary, 'utf8'), 'synthetic-home-canary');
    assert.equal(readFileSync(f.profileFile, 'utf8'), transferProfileCanary);
    assert.deepEqual(readdirSync(f.approvedHome), ['preserve-home']);
    assert.deepEqual(readdirSync(f.profile), ['hosts.yml']);
  }
});

test('protected transfer cannot publish completion from an acknowledgement bound to another request', t => {
  const f = transferFixture(t, { tamperAcknowledgementAtList: 6 }), inspected = inspectTransfer(f);
  const result = runTransfer(f, inspected.planDigest), state = fakeGhState(f);
  assert.equal(result.status, 'refused'); assert.equal(state.lists, 6);
  assert.equal(readPrivate(join(f.reports, `transfer-${transferDestinations[0]}.ack.json`)).binding.requestDigest, '0'.repeat(64));
  assert.equal(existsSync(join(f.reports, 'transfer-complete.json')), false);
  const reports = transferReportBytes(f), replay = runTransfer(f, inspected.planDigest);
  assert.equal(replay.status, 'refused'); assert.match(replay.message!, /outcome=UNKNOWN/);
  assert.ok(replay.message!.includes(`destination=${transferDestinations[0]}`));
  assert.deepEqual(fakeGhState(f), state); assert.deepEqual(transferReportBytes(f), reports);
});

test('unguarded transfer CLI actions refuse before opening private request or plan FIFOs', t => {
  const f = transferFixture(t), inspected = inspectTransfer(f);
  const prepared = spawnSync('python3', ['-c', 'import os,sys\nfor path in sys.argv[1:]:\n os.unlink(path)\n os.mkfifo(path,0o600)',
    f.path, f.planPath], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.ambientHome }, timeout: 5000 });
  assert.equal(prepared.status, 0, prepared.stderr);
  for (const args of [
    ['inspect-transfer', f.inputs, f.digest, f.gh, f.ghDigest, f.profile, f.reports],
    ['transfer-secrets', f.planPath, inspected.planDigest],
  ]) {
    const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', timeout: 5000,
      env: { PATH: '/usr/bin:/bin', HOME: f.ambientHome, TMPDIR: f.ambientHome } });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /TRANSFER_PLAN_READY|TRANSFER_COMPLETE/);
    assertTransferPrivate(f, result.stdout + result.stderr);
  }
  assertNoGh(f);
});

function diagnosticFixture(t: TestContext, ca?: string) {
  const f = fixture(t);
  if (ca !== undefined) {
    f.request.publicInputs = { DATABASE_CA_PEM: ca };
    f.digest = sha256(canonical(f.request));
    writeFileSync(f.path, canonical(f.request));
  }
  const composed = composePhaseInputs(f.request, f.fields);
  const inputs = join(f.root, 'esty-activation-inputs-diagnostic');
  mkdirSync(inputs, { mode: 0o700 });
  writePrivate(join(inputs, 'input-request.json'), f.request);
  writePrivate(join(inputs, 'receipt.json'), { version: 1, requestDigest: f.digest, phases: composed.phases });
  for (const phase of inputPhases) writePrivate(join(inputs, `${phase}.json`),
    phase === 'roles' ? composed.environments.roles : { not_a_phase_payload: 'must-not-be-consumed' });
  const packet = packetFor(f.request, composed.phases), packetPath = join(f.root, 'packet.json');
  writePrivate(packetPath, packet);
  const journal = join(f.root, 'NO_STATUS.journal');
  writePrivate(journal, { unknown: true, reserved: true });
  const symbol = Symbol.for('esty.activation.input.launcher'), previous = Object.getOwnPropertyDescriptor(globalThis, symbol);
  let verifies = 0, connections = 0;
  Object.defineProperty(globalThis, symbol, { configurable: true, value: {
    verify() { verifies++; }, launcher: 'synthetic', manifest: 'synthetic', digest: sha256('synthetic'),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, symbol, previous); else Reflect.deleteProperty(globalThis, symbol); });
  t.mock.method(Client.prototype, 'connect', async () => {
    connections++; throw Object.assign(new Error('synthetic-secret-must-not-escape'), { code: '28P01' });
  });
  t.mock.method(Client.prototype, 'end', async () => {});
  const args = [inputs, f.digest, packetPath, sha256(canonical(packet))];
  const snapshot = () => Object.fromEntries([journal, packetPath, ...readdirSync(inputs).map(name => join(inputs, name))]
    .map(path => [path, { hash: sha256(readFileSync(path)), mode: lstatSync(path).mode, size: lstatSync(path).size }]));
  return { ...f, inputs, packet, packetPath, args, snapshot, composed, connections: () => connections, verifies: () => verifies };
}
test('guarded role diagnostic binds only ROLE input without journal or prepared-input writes', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async t => {
  const f = diagnosticFixture(t), before = f.snapshot();
  assert.deepEqual(await diagnosePreparedRole(f.args, new AbortController().signal),
    { stage: 'connect', category: 'authentication_error', sqlstate: '28P01' });
  assert.equal(f.connections(), 1); assert.equal(f.verifies(), 2);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(readdirSync(f.inputs).sort(), ['input-request.json', 'receipt.json', ...inputPhases.map(phase => `${phase}.json`)].sort());
});
test('guarded role diagnostic refuses request, packet, ROLE, receipt, path and executable drift before connecting', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async t => {
  const scenarios = [
    ['request-digest', 'request', 'request_validation'], ['packet-digest', 'packet', 'packet_binding'],
    ['source-binding', 'packet', 'packet_binding'], ['role-bytes', 'role-input', 'role_schema_or_digest'],
    ['cross-phase', 'role-input', 'role_envelope'], ['receipt', 'receipt', 'receipt_binding'],
    ['permissions', 'role-input', 'role_envelope'], ['symlink', 'role-input', 'role_envelope'],
    ['extra-file', 'request', 'prepared_files'], ['executable', 'guard', 'execution_guard'],
    ['ambient', 'guard', 'execution_guard'], ['target', 'request', 'request_validation'],
  ] as const;
  for (const [scenario, stage, field] of scenarios) await t.test(scenario, async child => {
    const f = diagnosticFixture(child);
    if (scenario === 'request-digest') f.args[1] = sha256('wrong');
    if (scenario === 'packet-digest') f.args[3] = sha256('wrong');
    if (scenario === 'source-binding') {
      const changed = { ...f.packet, revision: 'd'.repeat(40) };
      writeFileSync(f.packetPath, canonical(changed)); f.args[3] = sha256(canonical(changed));
    }
    const rolePath = join(f.inputs, 'roles.json');
    if (scenario === 'role-bytes') writeFileSync(rolePath, canonical(phaseEnv('roles',
      { ...JSON.parse(f.composed.environments.roles.ACTIVATION_ROLE_INPUTS!), APP_ROLES_APPROVAL_ID: randomUUID() })));
    if (scenario === 'cross-phase') writeFileSync(rolePath, canonical({ ...f.composed.environments.roles, GITHUB_TOKEN: 'synthetic-leak' }));
    if (scenario === 'receipt') writeFileSync(join(f.inputs, 'receipt.json'), canonical({ version: 1 }));
    if (scenario === 'permissions') chmodSync(rolePath, 0o644);
    if (scenario === 'symlink') {
      renameSync(rolePath, join(f.root, 'elsewhere.json')); symlinkSync(join(f.root, 'elsewhere.json'), rolePath);
    }
    if (scenario === 'extra-file') writePrivate(join(f.inputs, 'extra.json'), {});
    if (scenario === 'executable') Object.defineProperty(globalThis, Symbol.for('esty.activation.input.launcher'), { configurable: true,
      value: { verify() { throw new Error('synthetic-secret-must-not-escape'); } } });
    if (scenario === 'ambient') {
      const previous = process.env.PGHOST; process.env.PGHOST = 'synthetic-secret-must-not-escape';
      child.after(() => { if (previous === undefined) delete process.env.PGHOST; else process.env.PGHOST = previous; });
    }
    if (scenario === 'target') {
      const changed = { ...f.request, target: 'supabase:abcdefghijklmnopqrst' };
      writeFileSync(join(f.inputs, 'input-request.json'), canonical(changed)); f.args[1] = sha256(canonical(changed));
    }
    assert.deepEqual(await diagnosePreparedRole(f.args, new AbortController().signal), { stage, category: 'refused', sqlstate: null, field });
    assert.equal(await diagnosePreparedRole(f.args, new AbortController().signal, true), null);
    assert.deepEqual(await diagnosePreparedRole([...f.args, join(f.root, 'not-read-public-ca')], new AbortController().signal, 'public-ca-overlay'),
      { stage, category: 'refused', sqlstate: null, field, caOverlay: false, publicCaAnchor: 'supabase-root-2021' });
    assert.equal(f.connections(), 0);
  });
});
test('unguarded role diagnostic and pre-aborted invocation refuse before private input access', async t => {
  const f = fixture(t), path = join(f.root, 'not-created-private-input');
  const result = spawnSync(process.execPath, [helper, 'diagnose-role', path, sha256('request'), path, sha256('packet')],
    { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', HOME: f.root } });
  assert.equal(result.status, 1); assert.equal(result.signal, null);
  assert.deepEqual(JSON.parse(result.stdout.slice('ROLE_DIAGNOSTIC '.length)),
    { stage: 'guard', category: 'refused', sqlstate: null, field: 'execution_guard' });
  assert.equal(result.stderr, '');
  const abort = new AbortController(); abort.abort('synthetic-secret-must-not-escape');
  assert.deepEqual(await diagnosePreparedRole([path, sha256('request'), path, sha256('packet')], abort.signal),
    { stage: 'guard', category: 'aborted', sqlstate: null, field: 'execution_guard' });
  assert.equal(existsSync(path), false);
});

test('guarded role diagnostic exact-schema mismatches identify each real pre-DB boundary without secret output', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async t => {
  const cases = [
    ['request-schema', 'request', 'request_validation'], ['packet-schema', 'packet', 'packet_binding'],
    ['receipt-schema', 'receipt', 'receipt_binding'], ['role-schema', 'role-input', 'role_schema_or_digest'],
    ['migration-schema', 'migration-config', 'migration_configuration'],
    ['migration-url', 'migration-config', 'migration_configuration'],
    ['migration-ca', 'migration-config', 'migration_configuration'],
    ['migration-host', 'migration-config', 'migration_configuration'],
    ['migration-port', 'migration-config', 'migration_configuration'],
  ] as const;
  for (const [scenario, stage, field] of cases) await t.test(scenario, async child => {
    const f = diagnosticFixture(child), sensitive = 'synthetic-pre-db-value-must-not-escape';
    if (scenario === 'request-schema') {
      const changed = { ...f.request, unexpected: sensitive };
      writeFileSync(join(f.inputs, 'input-request.json'), canonical(changed));
      f.args[1] = sha256(canonical(changed));
    } else if (scenario === 'packet-schema') {
      const changed = { ...f.packet, unexpected: sensitive };
      writeFileSync(f.packetPath, canonical(changed)); f.args[3] = sha256(canonical(changed));
    } else if (scenario === 'receipt-schema') {
      const path = join(f.inputs, 'receipt.json');
      writeFileSync(path, canonical({ ...readPrivate(path), unexpected: sensitive }));
    } else {
      const role = JSON.parse(f.composed.environments.roles.ACTIVATION_ROLE_INPUTS!);
      if (scenario === 'role-schema') role.unexpected = sensitive;
      else if (scenario === 'migration-schema') delete role.MIGRATION_DATABASE_URL;
      else if (scenario === 'migration-url') role.MIGRATION_DATABASE_URL += '?sslmode=disable&private=' + sensitive;
      else if (scenario === 'migration-host') role.SUPABASE_SESSION_HOST = 'unapproved.invalid';
      else if (scenario === 'migration-port') role.MIGRATION_DATABASE_URL = role.MIGRATION_DATABASE_URL.replace(':5432/', ':6543/');
      else role.DATABASE_CA_PEM = sensitive;
      // Match all hashes so this exercises the schema/configuration boundary, not an earlier digest mismatch.
      const digest = sha256(canonical(role)), receiptPath = join(f.inputs, 'receipt.json'), receipt = readPrivate(receiptPath);
      f.packet.roleInputDigest = digest; receipt.phases.roles.digest = digest;
      writeFileSync(join(f.inputs, 'roles.json'), canonical(phaseEnv('roles', role)));
      writeFileSync(receiptPath, canonical(receipt));
      writeFileSync(f.packetPath, canonical(f.packet)); f.args[3] = sha256(canonical(f.packet));
    }
    const before = f.snapshot(), result = await diagnosePreparedRole(f.args, new AbortController().signal);
    assert.deepEqual(result, { stage, category: 'refused', sqlstate: null, field });
    assert.equal(await diagnosePreparedRole(f.args, new AbortController().signal, true), null);
    assert.deepEqual(await diagnosePreparedRole([...f.args, join(f.root, 'not-read-public-ca')], new AbortController().signal, 'public-ca-overlay'),
      { stage, category: 'refused', sqlstate: null, field, caOverlay: false, publicCaAnchor: 'supabase-root-2021' });
    assert.doesNotMatch(JSON.stringify(result), /synthetic-pre-db-value|postgresql|sslmode|[a-f0-9]{64}/);
    assert.equal(f.connections(), 0); assert.deepEqual(f.snapshot(), before);
  });
});
test('guarded role diagnostic reports mount basename and final executable recheck without falling through to DB', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async t => {
  await t.test('mount basename', async child => {
    const f = diagnosticFixture(child), wrong = join(f.root, 'inputs');
    renameSync(f.inputs, wrong); f.args[0] = wrong;
    assert.deepEqual(await diagnosePreparedRole(f.args, new AbortController().signal),
      { stage: 'request', category: 'refused', sqlstate: null, field: 'prepared_directory' });
    assert.equal(await diagnosePreparedRole(f.args, new AbortController().signal, true), null);
    assert.equal(f.connections(), 0);
  });
  await t.test('final executable recheck', async child => {
    const f = diagnosticFixture(child); let calls = 0;
    Object.defineProperty(globalThis, Symbol.for('esty.activation.input.launcher'), { configurable: true,
      value: { verify() { if (++calls === 2) throw new Error('synthetic-pre-db-value-must-not-escape'); } } });
    assert.deepEqual(await diagnosePreparedRole(f.args, new AbortController().signal),
      { stage: 'guard', category: 'refused', sqlstate: null, field: 'executable_recheck' });
    assert.equal(calls, 2); assert.equal(f.connections(), 0);
    calls = 0;
    assert.equal(await diagnosePreparedRole(f.args, new AbortController().signal, true), null);
    assert.equal(calls, 2); assert.equal(f.connections(), 0);
  });
});

// Public reference certificate, never read from a prepared input or an owner credential file.
const supabasePublicCa = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;
test('guarded role CA check returns only certificate-identity and presence booleans without connecting or writing', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async t => {
  const cases = [
    ['absent', undefined, { caMatches: false, present: false }],
    ['matching LF', supabasePublicCa, { caMatches: true, present: true }],
    ['matching CRLF', supabasePublicCa.replaceAll('\n', '\r\n'), { caMatches: true, present: true }],
    ['matching trailing whitespace', supabasePublicCa + '\n', { caMatches: true, present: true }],
    ['different valid CA', rootCertificates[0]!, { caMatches: false, present: true }],
  ] as const;
  for (const [name, ca, expected] of cases) await t.test(name, async child => {
    const f = diagnosticFixture(child, ca), before = f.snapshot();
    assert.deepEqual(await diagnosePreparedRole(f.args, new AbortController().signal, true), expected);
    assert.equal(f.connections(), 0); assert.equal(f.verifies(), 2);
    assert.deepEqual(f.snapshot(), before);
  });
});
test('unguarded role CA CLI refuses silently instead of reporting missing CA or disclosing a value', t => {
  const f = fixture(t), path = join(f.root, 'not-created-private-input');
  const result = spawnSync(process.execPath, [helper, 'check-role-ca', path, sha256('request'), path, sha256('packet')],
    { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', HOME: f.root } });
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  assert.equal(existsSync(path), false);
});

test('guarded role CA overlay uses only the pinned public trust root on the fixed read-only authority without writes', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async t => {
  const f = diagnosticFixture(t), publicCa = join(f.root, 'public-ca.crt');
  writeFileSync(publicCa, supabasePublicCa, { mode: 0o444 });
  const before = f.snapshot(); let connections = 0;
  t.mock.method(Client.prototype, 'connect', async function (this: Client) {
    connections++;
    const parameters = (this as Client & { connectionParameters: Record<string, unknown> }).connectionParameters;
    assert.equal(parameters.host, 'aws-0-ap-northeast-2.pooler.supabase.com');
    assert.equal(parameters.port, 5432);
    assert.equal(parameters.user, 'postgres.eotmpaliqcxxcotrcols');
    assert.equal(parameters.database, 'postgres');
    assert.deepEqual(parameters.ssl, { ca: supabasePublicCa, rejectUnauthorized: true, servername: 'aws-0-ap-northeast-2.pooler.supabase.com' });
    assert.equal(parameters.options, '-c search_path=pg_catalog -c default_transaction_read_only=on');
    throw Object.assign(new Error('synthetic-not-to-disclose'), { code: '28P01' });
  });
  assert.deepEqual(await diagnosePreparedRole([...f.args, publicCa], new AbortController().signal, 'public-ca-overlay'),
    { stage: 'connect', category: 'authentication_error', sqlstate: '28P01', caOverlay: true, publicCaAnchor: 'supabase-root-2021' });
  assert.equal(connections, 1); assert.equal(f.verifies(), 2);
  assert.deepEqual(f.snapshot(), before); assert.equal(readFileSync(publicCa, 'utf8'), supabasePublicCa);
});
test('guarded role CA overlay refuses pin drift, unsafe files, any original CA and final executable drift before connecting', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async t => {
  for (const scenario of ['different certificate', 'malformed certificate', 'normalized file bytes', 'symlink', 'group writable',
    'matching original CA', 'conflicting original CA', 'final executable'] as const) await t.test(scenario, async child => {
    const originalCa = scenario === 'matching original CA' ? supabasePublicCa
      : scenario === 'conflicting original CA' ? rootCertificates[0]! : undefined;
    const f = diagnosticFixture(child, originalCa), publicCa = join(f.root, 'public-ca.crt');
    const supplied = scenario === 'different certificate' ? rootCertificates[0]!
      : scenario === 'malformed certificate' ? 'synthetic-invalid-public-certificate'
      : scenario === 'normalized file bytes' ? supabasePublicCa.replaceAll('\n', '\r\n') : supabasePublicCa;
    writeFileSync(publicCa, supplied, { mode: 0o444 });
    if (scenario === 'symlink') { renameSync(publicCa, join(f.root, 'other.crt')); symlinkSync(join(f.root, 'other.crt'), publicCa); }
    if (scenario === 'group writable') chmodSync(publicCa, 0o664);
    if (scenario === 'final executable') {
      let verifies = 0;
      Object.defineProperty(globalThis, Symbol.for('esty.activation.input.launcher'), { configurable: true,
        value: { verify() { if (++verifies === 2) throw new Error('synthetic-not-to-disclose'); } } });
    }
    const before = f.snapshot(), final = scenario === 'final executable';
    assert.deepEqual(await diagnosePreparedRole([...f.args, publicCa], new AbortController().signal, 'public-ca-overlay'),
      { stage: final ? 'guard' : 'public-ca', category: 'refused', sqlstate: null,
        field: final ? 'executable_recheck' : originalCa !== undefined ? 'original_ca_present' : 'public_ca_binding',
        caOverlay: final, publicCaAnchor: 'supabase-root-2021' });
    assert.equal(f.connections(), 0); assert.deepEqual(f.snapshot(), before);
  });
});

async function successorFixture(t: TestContext) {
  const f = transferFixture(t), inspected = inspectTransfer(f);
  assert.equal(runTransfer(f, inspected.planDigest).status, 'complete');
  const packet = packetFor(f.request, f.composition.phases), packetPath = join(f.root, 'old-packet.json');
  const caPath = join(f.root, 'public-ca.crt');
  writePrivate(packetPath, packet); writeFileSync(caPath, supabasePublicCa, { mode: 0o600 });
  const symbol = Symbol.for('esty.activation.input.launcher'), previous = Object.getOwnPropertyDescriptor(globalThis, symbol);
  Object.defineProperty(globalThis, symbol, { configurable: true, value: f.guard });
  t.after(() => { if (previous) Object.defineProperty(globalThis, symbol, previous); else Reflect.deleteProperty(globalThis, symbol); });
  const originals = () => Object.fromEntries([packetPath, ...readdirSync(f.inputs).map(name => join(f.inputs, name)),
    ...readdirSync(f.reports).map(name => join(f.reports, name)), f.profileFile, f.homeCanary].map(path =>
    [path, { bytes: readFileSync(path), mode: lstatSync(path).mode, inode: lstatSync(path).ino }]));
  const args = [f.planPath, inspected.planDigest, packetPath, sha256(canonical(packet)), caPath];
  const prepare = () => prepareCaSuccessor(args, AbortSignal.timeout(10000)) as Promise<{ directory: string; inputs: string; packet: string; runId: string }>;
  return { ...f, inspected, packet, packetPath, caPath, args, originals, prepare };
}
test('CA successor preserves every credential and business identity while exclusively replacing the five existing slots', async t => {
  const f = await successorFixture(t), before = f.originals(), prepared = await f.prepare();
  assert.notEqual(prepared.runId, f.request.runId);
  const controlPath = join(prepared.directory, 'successor.json'), next = await snapshotCaSuccessor(controlPath, f.guard);
  try {
    assert.deepEqual(next.snapshot.request, { ...f.request, runId: prepared.runId,
      publicInputs: { ...f.request.publicInputs, DATABASE_CA_PEM: supabasePublicCa } });
    for (const phase of inputPhases) {
      const oldValues = JSON.parse(f.composition.environments[phase][variables[phase]]!);
      assert.deepEqual(JSON.parse(next.snapshot.payloads[phase].toString()), { ...oldValues, DATABASE_CA_PEM: supabasePublicCa });
    }
    assert.equal(next.snapshot.configurationToken.toString(), token);
    assert.equal(next.snapshot.receipt.phases.bootstrap.binding, f.receipt.phases.bootstrap.binding);
  } finally { next.snapshot.dispose(); }
  assert.deepEqual(f.originals(), before);
  await assert.rejects(f.prepare());
  const plan = await inspectCaReplacement(controlPath, f.guard) as { plan: string; planDigest: string };
  const state = fakeGhState(f); state.reports = join(prepared.directory, 'replacement');
  writeFileSync(f.statePath, JSON.stringify(state));
  await replaceCaSecrets(plan.plan, plan.planDigest, f.guard, AbortSignal.timeout(10000));
  const after = fakeGhState(f), replaced = after.sets.slice(6);
  assert.deepEqual(replaced.map(item => item.destination), transferDestinations.slice(0, 5));
  for (const [index, item] of replaced.entries()) {
    assert.equal(item.acknowledgedBeforeSet, false);
    const phase = inputPhases[index]!;
    assert.deepEqual(JSON.parse(Buffer.from(item.stdin, 'base64').toString()),
      { ...JSON.parse(f.composition.environments[phase][variables[phase]]!), DATABASE_CA_PEM: supabasePublicCa });
    assert.ok(existsSync(join(state.reports!, `transfer-${item.destination}.ack.json`)));
  }
  assert.equal(after.sets.filter(item => item.destination === 'VERCEL_CONFIGURATION_TOKEN').length, 1);
  assert.deepEqual(f.originals(), before);
  const calls = after.calls.length;
  await assert.rejects(replaceCaSecrets(plan.plan, plan.planDigest, f.guard, AbortSignal.timeout(10000)), /ACKNOWLEDGED/);
  assert.equal(fakeGhState(f).calls.length, calls);
});
test('CA successor refuses missing original acknowledgements, changed packet, public CA and executable identity', async t => {
  for (const scenario of ['ack', 'packet', 'ca', 'guard'] as const) await t.test(scenario, async child => {
    const f = await successorFixture(child);
    if (scenario === 'ack') unlinkSync(join(f.reports, `transfer-${transferDestinations[0]}.ack.json`));
    if (scenario === 'packet') writeFileSync(f.packetPath, canonical({ ...f.packet, predecessorId: 'dpl_changed' }));
    if (scenario === 'ca') writeFileSync(f.caPath, rootCertificates[0]!);
    if (scenario === 'guard') child.mock.method(f.guard, 'verify', () => { throw new Error('synthetic guard drift'); });
    const before = f.originals(), calls = fakeGhState(f).calls.length;
    await assert.rejects(f.prepare());
    assert.deepEqual(f.originals(), before);
    assert.equal(fakeGhState(f).calls.length, calls);
    assert.equal(existsSync(join(f.root, `ca-successor-${f.request.runId}`)), false);
  });
});
test('CA replacement rejects coherently rehashed secret substitution against the original lineage', async t => {
  const f = await successorFixture(t), before = f.originals(), prepared = await f.prepare();
  const controlPath = join(prepared.directory, 'successor.json'), control = readPrivate(controlPath);
  const request = readPrivate(join(prepared.inputs, 'input-request.json'));
  const path = join(prepared.inputs, 'app-config.json'), env = readPrivate(path), values = JSON.parse(env.ACTIVATION_APP_INPUTS);
  const url = new URL(values.DATABASE_URL); url.password = 'synthetic-substituted-password'; values.DATABASE_URL = url.href;
  env.ACTIVATION_APP_INPUTS = canonical(values);
  const receipt = readPrivate(join(prepared.inputs, 'receipt.json'));
  receipt.phases['app-config'] = validatePreparedPhase(request, 'app-config', env);
  const packet = readPrivate(prepared.packet); packet.appConfigDigest = receipt.phases['app-config'].digest;
  control.packetDigest = sha256(canonical(packet));
  for (const [name, value] of [[path, env], [join(prepared.inputs, 'receipt.json'), receipt],
    [prepared.packet, packet], [controlPath, control]]) writeFileSync(name, canonical(value));
  await assert.rejects(snapshotCaSuccessor(controlPath, f.guard));
  await assert.rejects(inspectCaReplacement(controlPath, f.guard));
  assert.deepEqual(f.originals(), before);
  assert.equal(fakeGhState(f).sets.length, 6);
});
test('CA replacement keeps partial unknown writes fenced and never retries an unacknowledged slot', async t => {
  const f = await successorFixture(t), before = f.originals(), prepared = await f.prepare();
  const plan = await inspectCaReplacement(join(prepared.directory, 'successor.json'), f.guard) as { plan: string; planDigest: string };
  const state = fakeGhState(f); state.reports = join(prepared.directory, 'replacement'); state.failDestination = transferDestinations[1];
  writeFileSync(f.statePath, JSON.stringify(state));
  await assert.rejects(replaceCaSecrets(plan.plan, plan.planDigest, f.guard, AbortSignal.timeout(10000)), /outcome=UNKNOWN/);
  const after = fakeGhState(f);
  assert.deepEqual(after.sets.slice(6).map(item => item.destination), transferDestinations.slice(0, 2));
  assert.equal(existsSync(join(state.reports!, `transfer-${transferDestinations[0]}.ack.json`)), true);
  assert.equal(existsSync(join(state.reports!, `transfer-${transferDestinations[1]}.ack.json`)), false);
  await assert.rejects(replaceCaSecrets(plan.plan, plan.planDigest, f.guard, AbortSignal.timeout(10000)), /outcome=UNKNOWN/);
  assert.equal(fakeGhState(f).calls.length, after.calls.length);
  assert.deepEqual(f.originals(), before);
});
test('CA replacement requires all five existing slots and an unconsumed execution', async t => {
  for (const scenario of ['missing-slot', 'cancelled', 'concurrent'] as const) await t.test(scenario, async child => {
    const f = await successorFixture(child), prepared = await f.prepare();
    const plan = await inspectCaReplacement(join(prepared.directory, 'successor.json'), f.guard) as { plan: string; planDigest: string };
    const state = fakeGhState(f); state.reports = join(prepared.directory, 'replacement');
    if (scenario === 'missing-slot') state.names = state.names.filter(name => name !== transferDestinations[2]);
    writeFileSync(f.statePath, JSON.stringify(state));
    const abort = new AbortController(); if (scenario === 'cancelled') abort.abort();
    const execute = () => replaceCaSecrets(plan.plan, plan.planDigest, f.guard, abort.signal);
    if (scenario === 'concurrent') {
      const outcomes = await Promise.allSettled([execute(), execute()]);
      assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
      assert.equal(fakeGhState(f).sets.length, 11);
    } else {
      await assert.rejects(execute());
      assert.equal(fakeGhState(f).sets.length, 6);
      assert.equal(existsSync(join(state.reports!, 'transfer-attempt.json')), false);
    }
  });
});
test('terminal proof and status operations refuse unacknowledged lineage and unapproved records before transport', async t => {
  const f = transferFixture(t), inspected = inspectTransfer(f);
  await assert.rejects(inspectFailedPreflight([f.planPath, inspected.planDigest, join(f.root, 'missing-bundle')], f.guard, AbortSignal.timeout(10000)));
  const proofPath = join(f.reports, 'terminal-proof.json');
  writePrivate(proofPath, { version: 1, proof: { journal: 1 } });
  await assert.rejects(recordFailedPreflight(proofPath, sha256(canonical(readPrivate(proofPath))), f.guard, AbortSignal.timeout(10000)));
  assertNoGh(f);
});

test('terminal disposition writes truthful error once, ACKs only an exact response and retains ambiguous attempts', async t => {
  for (const scenario of ['ack', 'lost-ack', 'wrong-state', 'wrong-description', 'wrong-id', 'cancelled', 'wrong-project'] as const) {
    await t.test(scenario, async child => {
      const f = transferFixture(child), reports = join(f.root, 'terminal');
      mkdirSync(reports, { mode: 0o700 });
      const proof = { version: 1, kind: 'failed-preflight-no-effects', repository: retainedActivation.repository,
        environment: 'be-production', project: retainedActivation.project,
        workflowRun: '42847325668', workflowRevision: 'a'.repeat(40), activationRun: '36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed',
        packetDigest: sha256('synthetic packet'), journal: 45, job: 1, artifact: retainedActivation.artifactDigest,
        receiptArtifact: 2, receiptZipDigest: sha256('synthetic zip'), receiptArchiveDigest: sha256('synthetic archive'),
        receiptInventoryDigest: sha256('synthetic inventory') };
      if (scenario === 'wrong-project') Object.assign(proof, { project: 'prj_other' });
      const proofDigest = sha256(canonical(proof)), abort = new AbortController();
      if (scenario === 'cancelled') abort.abort();
      let writes = 0;
      const io = { async post(path: string, value: unknown) {
        writes++;
        assert.equal(path, '/deployments/45/statuses');
        const body = value as { state: string; description: string; log_url: string; auto_inactive: boolean };
        assert.equal(body.state, 'error'); assert.equal(body.auto_inactive, false);
        assert.equal(body.description, `failed_preflight_no_effects:${proofDigest}`);
        const intent = readPrivate(join(reports, 'terminal-attempt.json'));
        assert.equal(intent.outcome, 'UNKNOWN'); assert.equal(intent.journal, 45); assert.equal(intent.proofDigest, proofDigest);
        assert.equal(existsSync(join(reports, 'terminal-ack.json')), false);
        if (scenario === 'lost-ack') throw new Error('Synthetic transport acknowledgement lost.');
        return { id: scenario === 'wrong-id' ? 0 : 46, ...body,
          state: scenario === 'wrong-state' ? 'success' : body.state,
          description: scenario === 'wrong-description' ? 'unrelated error' : body.description };
      } };
      const execute = () => commitFailedPreflightDisposition(io, proof, proofDigest, reports, f.guard, abort.signal);
      if (scenario === 'ack') {
        const result = await execute() as { state: string; statusId: number; outcome: string };
        assert.deepEqual({ state: result.state, statusId: result.statusId, outcome: result.outcome },
          { state: 'error', statusId: 46, outcome: 'ACKNOWLEDGED' });
        assert.deepEqual(readPrivate(join(reports, 'terminal-ack.json')), result);
      } else {
        await assert.rejects(execute());
        assert.equal(existsSync(join(reports, 'terminal-ack.json')), false);
      }
      if (scenario === 'cancelled' || scenario === 'wrong-project') {
        assert.equal(writes, 0); assert.equal(existsSync(join(reports, 'terminal-attempt.json')), false);
      } else {
        const before = readFileSync(join(reports, 'terminal-attempt.json'));
        await assert.rejects(execute(), /outcome=UNKNOWN/);
        assert.equal(writes, 1); assert.deepEqual(readFileSync(join(reports, 'terminal-attempt.json')), before);
      }
    });
  }
});

test('prepared bridge bearer validates its binding without consuming other phase files or connecting to DB', t => {
  const f = diagnosticFixture(t);
  writeFileSync(join(f.inputs, 'bridge-config.json'), canonical(f.composed.environments['bridge-config']));
  for (const phase of inputPhases.filter(phase => phase !== 'bridge-config')) writeFileSync(join(f.inputs, `${phase}.json`), '{not-json');
  const before = f.snapshot(), guard = { verify() {} };
  const bearer = preparedBridgeBearer(f.inputs, f.digest, f.packetPath, sha256(canonical(f.packet)), guard, AbortSignal.timeout(5000));
  assert.equal(bearer.value, f.fields.PREVIEW_ACCESS_KEY);
  assert.equal(f.connections(), 0);
  bearer.dispose(); assert.equal(bearer.value, '');
  assert.deepEqual(f.snapshot(), before);
});

test('prepared bridge bearer refuses request, packet, receipt, envelope, permission and cancellation drift', async t => {
  for (const scenario of ['request', 'packet', 'receipt', 'bearer', 'cross-phase', 'permissions', 'symlink', 'cancelled', 'guard'] as const) {
    await t.test(scenario, sub => {
      const f = diagnosticFixture(sub), bridge = join(f.inputs, 'bridge-config.json'), abort = new AbortController();
      writeFileSync(bridge, canonical(f.composed.environments['bridge-config']));
      const packetDigest = sha256(canonical(f.packet));
      if (scenario === 'request') writeFileSync(join(f.inputs, 'input-request.json'), canonical({ ...f.request, runId: randomUUID() }));
      if (scenario === 'packet') writeFileSync(f.packetPath, canonical({ ...f.packet, bridgeConfigDigest: sha256('wrong') }));
      if (scenario === 'receipt') writeFileSync(join(f.inputs, 'receipt.json'), canonical({ version: 1, requestDigest: f.digest, phases: {} }));
      if (scenario === 'bearer') {
        const changed = composePhaseInputs(f.request, { ...f.fields, PREVIEW_ACCESS_KEY: 'b'.repeat(64) });
        writeFileSync(bridge, canonical(changed.environments['bridge-config']));
      }
      if (scenario === 'cross-phase') writeFileSync(bridge, canonical({ ...f.composed.environments['bridge-config'], GITHUB_TOKEN: 'synthetic-cross-phase' }));
      if (scenario === 'permissions') chmodSync(bridge, 0o644);
      if (scenario === 'symlink') { renameSync(bridge, join(f.root, 'moved.json')); symlinkSync(join(f.root, 'moved.json'), bridge); }
      if (scenario === 'cancelled') abort.abort();
      const guard = { verify() { if (scenario === 'guard') throw new Error('Synthetic executable drift'); } };
      assert.throws(() => preparedBridgeBearer(f.inputs, f.digest, f.packetPath, packetDigest, guard, abort.signal),
        /Activation input preparation or handoff refused/);
      assert.equal(f.connections(), 0);
    });
  }
});

test('recovered phase inputs isolate credentials, dispose values and never consume another phase', async t => {
  for (const phase of ['roles', 'migration', 'bootstrap', 'app-config'] as const) await t.test(phase, sub => {
    const f = diagnosticFixture(sub);
    writeFileSync(join(f.inputs, `${phase}.json`), canonical(f.composed.environments[phase]));
    for (const other of inputPhases.filter(item => item !== phase)) writeFileSync(join(f.inputs, `${other}.json`), '{not-json');
    const before = f.snapshot();
    const prepared = preparedRecoveryPhase(f.inputs, f.digest, f.packetPath, sha256(canonical(f.packet)),
      phase, { verify() {} }, AbortSignal.timeout(5000));
    assert.deepEqual(prepared.values, f.composed.environments[phase]);
    prepared.dispose(); assert.deepEqual(prepared.values, {});
    assert.equal(f.connections(), 0); assert.deepEqual(f.snapshot(), before);
    writeFileSync(join(f.inputs, `${phase}.json`), canonical({ ...f.composed.environments[phase], GITHUB_TOKEN: 'synthetic-cross-phase' }));
    assert.throws(() => preparedRecoveryPhase(f.inputs, f.digest, f.packetPath, sha256(canonical(f.packet)),
      phase, { verify() {} }, AbortSignal.timeout(5000)));
    assert.equal(f.connections(), 0);
  });
});

test('retained bootstrap preparation owns mutable cleanup and preserves primary failure', async t => {
  for (const scenario of ['owned', 'nested-failure', 'frozen-owned', 'preparation-primary'] as const) await t.test(scenario, sub => {
    const f = diagnosticFixture(sub);
    writeFileSync(join(f.inputs, 'bootstrap.json'), canonical(f.composed.environments.bootstrap));
    const before = f.snapshot(), primary = new Error('synthetic primary'), cleanup = new Error('synthetic cleanup');
    const prepared = preparedRecoveryPhase(f.inputs, f.digest, f.packetPath, sha256(canonical(f.packet)),
      'bootstrap', { verify() {} }, AbortSignal.timeout(5000));
    const immutable = bootstrapInputs(decodePhaseInput(prepared.values.ACTIVATION_BOOTSTRAP_INPUTS), f.packet);
    assert.equal(Object.isFrozen(immutable), true);
    assert.throws(() => { delete (immutable as Record<string, string>).APP_OPERATOR_TARGET; }, TypeError);
    let nested = 0;
    const wrapped = { values: prepared.values, dispose() {
      nested++; prepared.dispose(); if (scenario !== 'owned') throw cleanup;
    } };
    if (scenario === 'preparation-primary') {
      Object.defineProperty(wrapped.values, 'ACTIVATION_BOOTSTRAP_INPUTS', { configurable: true, enumerable: true,
        get() { throw primary; } });
      assert.throws(() => preparedBootstrapEnvironment(wrapped, f.packet), error => error === primary);
    } else {
      const owned = preparedBootstrapEnvironment(wrapped, f.packet);
      assert.deepEqual({ ...owned.env }, immutable);
      if (scenario === 'frozen-owned') {
        Object.freeze(owned.env);
        assert.throws(() => owned.dispose(), TypeError);
      } else {
        owned.env.APP_OPERATOR_PROFILE_NAME = 'Owned mutable name';
        assert.notEqual(immutable.APP_OPERATOR_PROFILE_NAME, owned.env.APP_OPERATOR_PROFILE_NAME);
        if (scenario === 'nested-failure') assert.throws(() => owned.dispose(), error => error === cleanup);
        else owned.dispose();
        assert.deepEqual(owned.env, {});
      }
      owned.dispose(); assert.equal(nested, 1);
      assert.equal(Object.isFrozen(immutable), true); assert.notEqual(immutable.APP_OPERATOR_TARGET, undefined);
    }
    assert.equal(nested, 1); assert.deepEqual(prepared.values, {});
    assert.deepEqual(f.snapshot(), before); assert.equal(f.connections(), 0);
  });
});

test('recovered role preparation reports only the failing allowlisted input stage before database access', async t => {
  for (const scenario of ['guard', 'request', 'packet', 'receipt', 'role-input', 'role-validation'] as const) await t.test(scenario, sub => {
    const f = diagnosticFixture(sub), digest = sha256(canonical(f.packet));
    writeFileSync(join(f.inputs, 'roles.json'), canonical(f.composed.environments.roles));
    if (scenario === 'request') writeFileSync(join(f.inputs, 'input-request.json'), '{}');
    if (scenario === 'packet') writeFileSync(f.packetPath, '{}');
    if (scenario === 'receipt') writeFileSync(join(f.inputs, 'receipt.json'), '{}');
    if (scenario === 'role-input') writeFileSync(join(f.inputs, 'roles.json'), '{invalid');
    if (scenario === 'role-validation') writeFileSync(join(f.inputs, 'roles.json'), canonical({ ...f.composed.environments.roles, GITHUB_TOKEN: 'private-sentinel' }));
    let last = '';
    assert.throws(() => preparedRecoveryPhase(f.inputs, f.digest, f.packetPath, digest, 'roles',
      { verify() { if (scenario === 'guard') throw new Error('private-sentinel'); } }, AbortSignal.timeout(5000), stage => { last = stage; }));
    assert.equal(last, scenario); assert.equal(f.connections(), 0);
  });
});

test('fixed pretransaction CLI refuses unguarded private FIFOs and caller-selected overrides', t => {
  const f = fixture(t), fifo = join(f.root, 'must-not-open.fifo');
  assert.equal(spawnSync('/usr/bin/mkfifo', [fifo], { encoding: 'utf8', timeout: 5000 }).status, 0);
  for (const args of [[fifo, sha256('control'), fifo, fifo], [fifo, sha256('control'), fifo, fifo, 'head-override']]) {
    const result = spawnSync(process.execPath, [helper, 'continue-reachability-bootstrap-pretransaction', ...args],
      { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', HOME: f.root } });
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout.slice('BOOTSTRAP_PRETRANSACTION_CONTINUATION '.length)),
      { status: 'STOP', stage: 'guard', category: 'refused' });
  }
});

test('retained bootstrap inspection CLI refuses unguarded FIFOs and caller-selected lineage', t => {
  const f = fixture(t), fifo = join(f.root, 'must-not-open.fifo');
  assert.equal(spawnSync('/usr/bin/mkfifo', [fifo], { encoding: 'utf8', timeout: 5000 }).status, 0);
  for (const suffix of [[], ['head-override']]) {
    const result = spawnSync(process.execPath, [helper, 'inspect-retained-reachability-bootstrap',
      fifo, sha256('control'), fifo, fifo, ...suffix], { encoding: 'utf8', timeout: 5000,
      env: { PATH: '/usr/bin:/bin', HOME: f.root } });
    assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout.slice('BOOTSTRAP_RETAINED_INSPECTION '.length)),
      { status: 'STOP', stage: 'guard', category: 'refused', inspection: null });
  }
});
