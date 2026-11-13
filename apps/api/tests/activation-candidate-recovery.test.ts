import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { canonical, inventory, sha256 } from '../scripts/artifact.js';
import { attestBridgeRecovery, bridgeRecovery as target, bridgePreHttpContinuation, continueBridgeRecovery,
  bridgePackagedPreHttpContinuation, bridgeExternalStartupProof, inspectBridgeRecoveryOriginal, promoteBridgeRecovery } from '../scripts/activation-candidate-recovery.js';
import type { RecoveryContext, RecoveryIo } from '../scripts/activation-candidate-recovery.js';
import { recoveryIo, recoveryToolInventory } from '../scripts/activation-recovery-io.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { recoveryGithubRead } from '../scripts/activation-input-transfer.js';

// These integration cases consume the retained public f162 artifact and the already-downloaded
// sanitized receipt/archive evidence. They never retrieve provider data or prepared phase inputs.
const captured = process.env.BRIDGE_RECOVERY_TEST_EVIDENCE;
const bundle = process.env.MANUAL_ACTIVATION_TEST_BUNDLE;
const options = { skip: !captured || !bundle };
const promotionOptions = { skip: options.skip || !process.env.RECOVERY_TEST_PRIOR_STARTUP
  || !process.env.RECOVERY_TEST_PACKAGING_MANIFEST || !process.env.RECOVERY_TEST_EXTERNAL_PROOF };
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function json(path: string): unknown { return JSON.parse(readFileSync(path, 'utf8')); }
function fixture(t: TestContext) {
  assert.ok(captured && bundle);
  const root = mkdtempSync(join(tmpdir(), 'esty-exact-recovery-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(captured, 'receipt-copy/be-receipts'), join(root, 'original'), { recursive: true });
  const context: RecoveryContext = { original: join(root, 'original'), artifact: join(bundle, 'artifact'), directory: join(root, 'recovery'),
    controlDigest: sha256('synthetic-control'), guard: { digest: sha256('synthetic-executable'), verify() { return {}; } } };
  const candidate = json(join(captured, 'candidate-metadata.json')), observed = json(join(captured, 'provider-observations.json'));
  assert.ok(object(candidate) && object(observed));
  const values: Record<string, unknown> = {
    '/commits/main': { sha: target.workflowRevision, commit: { tree: { sha: target.workflowTree } } },
    [`/actions/runs/${target.workflowRun}`]: { id: Number(target.workflowRun), run_attempt: 1, status: 'completed', conclusion: 'failure',
      head_sha: target.workflowRevision, head_branch: 'main', event: 'workflow_dispatch', repository: { full_name: 'khuonghuyhieu/esty-admin' } },
    [`/deployments/${target.journal}`]: { id: target.journal, environment: 'be-production', task: 'deploy:esty-be-ci', payload: {
      run: target.workflowRun, activationRun: target.activationRun, activationPacket: target.packetDigest,
      artifact: target.artifactDigest, project: target.project, sourceDigest: target.sourceDigest } },
    [`/deployments/${target.journal}/statuses?per_page=100`]: [{ state: 'in_progress', description: `ack:${target.candidate}`,
      log_url: `https://github.com/khuonghuyhieu/esty-admin/actions/runs/${target.workflowRun}` }],
    [`/v13/deployments/${target.candidate}`]: candidate.metadata,
    [`/v9/projects/${target.project}/domains/api.lovora.us`]: observed.domain,
    [`/v4/aliases/api.lovora.us?projectId=${target.project}`]: observed.alias,
    [`/v6/deployments/${target.candidate}/files`]: observed.fileEnvelope,
    [`/v8/deployments/${target.candidate}/files/${target.partitionUid}`]: { data: readFileSync(join(captured, 'candidate-source.tgz.part1')).toString('base64') },
  };
  const calls = { bearer: 0, startup: 0, promote: 0, disposed: 0, remote: 0 };
  async function read(path: string) { calls.remote++; assert.ok(Object.hasOwn(values, path), `Unexpected recovery read: ${path}`); return structuredClone(values[path]); }
  const io: RecoveryIo = { github: read, vercel: read, async promote() {
    calls.promote++;
    values[`/v4/aliases/api.lovora.us?projectId=${target.project}`] = { alias: 'api.lovora.us', projectId: target.project, deploymentId: target.candidate };
    return { code: 0, aborted: false };
  } };
  const bearer = () => { calls.bearer++; return { value: 'a'.repeat(64), dispose() { calls.disposed++; this.value = ''; } }; };
  const transport: typeof fetch = async (url, init) => {
    calls.startup++; assert.equal(String(url), `${target.origin}/health/live`);
    assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit');
    return Response.json({ status: 'ok' }, { headers: { 'x-activation-config-digest': target.configDigest } });
  };
  return { context, values, io, calls, bearer, transport };
}

test('exact candidate recovery appends new evidence while preserving historical UNKNOWN and forbidding replay', options, async t => {
  const f = fixture(t), before = canonical(inventory(f.context.original));
  inspectBridgeRecoveryOriginal(f.context);
  assert.deepEqual(await attestBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport), { stage: 'complete', category: 'passed' });
  await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
  await assert.rejects(attestBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport));
  await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
  assert.deepEqual({ bearer: f.calls.bearer, startup: f.calls.startup, promote: f.calls.promote, disposed: f.calls.disposed },
    { bearer: 1, startup: 1, promote: 0, disposed: 1 });
  assert.equal(canonical(inventory(f.context.original)), before);
});

test('recovery rejects source, config, region, alias, journal and archive mismatch before bearer access', options, async t => {
  for (const kind of ['main', 'config', 'region', 'alias', 'journal', 'archive'] as const) await t.test(kind, async sub => {
    const f = fixture(sub);
    if (kind === 'main') f.values['/commits/main'] = { sha: 'changed' };
    if (kind === 'config' || kind === 'region') {
      const candidate = f.values[`/v13/deployments/${target.candidate}`]; assert.ok(object(candidate));
      if (kind === 'region') candidate.regions = ['iad1'];
      else { assert.ok(object(candidate.meta)); candidate.meta.activationConfigDigest = '0'.repeat(64); }
    }
    if (kind === 'alias') f.values[`/v4/aliases/api.lovora.us?projectId=${target.project}`] = { alias: 'api.lovora.us', projectId: target.project, deploymentId: 'dpl_other' };
    if (kind === 'journal') f.values[`/deployments/${target.journal}/statuses?per_page=100`] = [{ state: 'success' }];
    if (kind === 'archive') f.values[`/v8/deployments/${target.candidate}/files/${target.partitionUid}`] = { data: 'YWJj' };
    assert.deepEqual(await attestBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport), { stage: 'metadata', category: 'refused' });
    await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
    assert.equal(f.calls.bearer + f.calls.startup + f.calls.promote, 0);
  });
});

test('one startup request failure remains fenced without promotion or retry', options, async t => {
  for (const kind of ['401', '403', 'redirect', 'config', 'body', 'oversize', 'abort'] as const) await t.test(kind, async sub => {
    const f = fixture(sub), signal = new AbortController();
    const transport: typeof fetch = async () => {
      f.calls.startup++;
      if (kind === 'abort') { signal.abort(); throw new Error('Synthetic transport abort'); }
      if (kind === '401' || kind === '403') return new Response('', { status: Number(kind) });
      if (kind === 'redirect') return Response.redirect('https://example.invalid', 302);
      if (kind === 'config') return Response.json({ status: 'ok' }, { headers: { 'x-activation-config-digest': '0'.repeat(64) } });
      return Response.json({ status: kind === 'body' ? 'not_ready' : 'x'.repeat(8192) }, { headers: { 'x-activation-config-digest': target.configDigest } });
    };
    const result = await attestBridgeRecovery(f.context, f.io, f.bearer, signal.signal, transport);
    assert.notEqual(result.category, 'passed');
    await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
    await assert.rejects(attestBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport));
    assert.deepEqual([f.calls.bearer, f.calls.startup, f.calls.disposed, f.calls.promote], [1, 1, 1, 0]);
  });
});

test('concurrent startup has one owner but cannot substitute for accepted external promotion proof', options, async t => {
  const f = fixture(t);
  const startup = await Promise.allSettled([0, 1].map(() => attestBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport)));
  assert.equal(startup.filter(result => result.status === 'fulfilled').length, 1);
  const promotion = await Promise.allSettled([0, 1].map(() => promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000))));
  assert.equal(promotion.filter(result => result.status === 'fulfilled').length, 0);
  assert.deepEqual([f.calls.bearer, f.calls.startup, f.calls.promote], [1, 1, 0]);
});

test('lost promotion ACK cannot be replayed or rewrite original history', promotionOptions, async t => {
  const f = externalPromotionFixture(t), before = canonical(inventory(f.context.original));
  f.io.promote = async () => { f.calls.promote++; throw new Error('Synthetic lost ACK'); };
  const outcome = await promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000));
  assert.equal(outcome.outcome, 'unknown');
  await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
  assert.equal(f.calls.promote, 1); assert.equal(canonical(inventory(f.context.original)), before);
});

test('original receipt or startup-proof tampering blocks promotion', promotionOptions, async t => {
  for (const kind of ['original', 'proof'] as const) await t.test(kind, async sub => {
    const f = externalPromotionFixture(sub);
    const file = kind === 'original' ? join(f.context.original, 'activation', target.activationRun, '010.json') : join(f.context.directory, 'startup-result.json');
    writeFileSync(file, '{"changed":true}');
    await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
    assert.equal(f.calls.promote, 0);
  });
});

test('recovery CLI rejects changed public tool bytes and forbids unapproved endpoints before execution', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'esty-recovery-tool-test-'))), tools = join(root, 'tools');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(tools, 'vercel/dist'), { recursive: true });
  writeFileSync(join(tools, 'vercel/package.json'), '{"version":"65.4.0","type":"module"}');
  writeFileSync(join(tools, 'vercel/dist/vc.js'), "throw new Error('This child must not run');");
  const recoveryVercel = { root: tools, inventoryDigest: recoveryToolInventory(tools), home: root, configDirectory: join(root, 'unread-profile') };
  const io = recoveryIo({ digest: sha256('synthetic'), verify() { return { recoveryVercel }; } }, AbortSignal.timeout(10000));
  await assert.rejects(io.vercel('/v6/deployments?projectId=other'), /transport identity/);
  writeFileSync(join(tools, 'vercel/dist/vc.js'), 'process.exit(0);');
  await assert.rejects(io.vercel(`/v13/deployments/${target.candidate}`), /transport identity/);
  await assert.rejects(io.promote(), /transport identity/);
});

test('isolated recovery CLI blocks parent module escape and suppresses untrusted child failure output', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'esty-recovery-tool-escape-'))), tools = join(root, 'tools');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(tools, 'vercel/dist'), { recursive: true });
  writeFileSync(join(tools, 'vercel/package.json'), '{"version":"65.4.0","type":"module"}');
  const marker = join(root, 'escaped');
  writeFileSync(join(root, 'outside.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'escaped');`);
  const entry = join(tools, 'vercel/dist/vc.js');
  writeFileSync(entry, `await import(${JSON.stringify(join(root, 'outside.mjs'))});`);
  const guard = { digest: sha256('synthetic'), verify() { return { recoveryVercel: { root: tools,
    inventoryDigest: recoveryToolInventory(tools), home: root, configDirectory: join(root, 'unread-profile') } }; } };
  const io = recoveryIo(guard, AbortSignal.timeout(10000));
  await assert.rejects(io.vercel(`/v13/deployments/${target.candidate}`), /transport identity/);
  assert.equal(existsSync(marker), false);
  writeFileSync(entry, "process.stderr.write('SYNTHETIC_PRIVATE_FAILURE'); process.exit(23);");
  await assert.rejects(io.promote(), error => error instanceof Error
    && error.message === 'Recovery transport identity or acknowledgement differs.');
});

test('main metadata projection bounds a large commit and refuses malformed identities or unsuccessful CLI before bearer access',
  { skip: !captured || !bundle || !process.env.RECOVERY_TEST_GH }, async t => {
    for (const scenario of ['large', 'missing-sha', 'missing-tree', 'uppercase-sha', 'uppercase-tree', 'short-tree',
      'numeric-sha', 'extra-field', 'truncated-json', 'nonzero', 'api-error', 'network-error', 'stderr-overflow'] as const) {
      await t.test(scenario, async sub => {
        const f = fixture(sub), root = realpathSync(mkdtempSync(join(tmpdir(), 'esty-main-projection-')));
        sub.after(() => rmSync(root, { recursive: true, force: true }));
        const profile = join(root, 'empty-profile'); mkdirSync(profile, { mode: 0o700 });
        let requests = 0;
        const main: { sha?: string | number; commit: { tree?: { sha: string } }; files: { patch: string }[] } = {
          sha: target.workflowRevision, commit: { tree: { sha: target.workflowTree } }, files: [{ patch: 'x'.repeat(256 * 1024) }],
        };
        if (scenario === 'missing-sha') delete main.sha;
        if (scenario === 'missing-tree') delete main.commit.tree;
        if (scenario === 'uppercase-sha') main.sha = target.workflowRevision.toUpperCase();
        if (scenario === 'uppercase-tree') main.commit.tree = { sha: target.workflowTree.toUpperCase() };
        if (scenario === 'short-tree') main.commit.tree = { sha: 'a'.repeat(39) };
        if (scenario === 'numeric-sha') main.sha = 123;
        const server = createServer((request, response) => {
          requests++;
          assert.equal(request.method, 'GET');
          assert.equal(request.url, '/repos/khuonghuyhieu/esty-admin/commits/main');
          if (scenario === 'network-error') { request.socket.destroy(); return; }
          response.writeHead(scenario === 'api-error' ? 403 : 200, { 'content-type': 'application/json' });
          response.end(JSON.stringify(scenario === 'api-error' ? { message: 'Synthetic forbidden' } : main));
        });
        server.listen(0, '127.0.0.1'); await once(server, 'listening');
        sub.after(() => { server.closeAllConnections(); server.close(); });
        const address = server.address(); assert.ok(address && typeof address === 'object');
        const wrapper = join(root, 'pinned-gh.mjs');
        // Exercise the real pinned gh --jq engine against loopback, never an authenticated service.
        writeFileSync(wrapper, `#!${process.execPath}
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
if(args[0]!=='api'||args[1]!=='repos/khuonghuyhieu/esty-admin/commits/main')process.exit(91);
const child=spawnSync(${JSON.stringify(process.env.RECOVERY_TEST_GH)},['api',${JSON.stringify(`http://127.0.0.1:${address.port}/repos/khuonghuyhieu/esty-admin/commits/main`)},...args.slice(2)],
 {env:{PATH:'/usr/bin:/bin',HOME:${JSON.stringify(root)},GH_CONFIG_DIR:${JSON.stringify(profile)},GH_TOKEN:'synthetic-loopback-only',GH_HOST:'github.com',GH_PROMPT_DISABLED:'1',GH_NO_UPDATE_NOTIFIER:'1',GH_NO_EXTENSION_UPDATE_NOTIFIER:'1'},maxBuffer:1048576});
let output=child.stdout??Buffer.alloc(0);
if(${JSON.stringify(scenario)}==='extra-field')output=Buffer.from(JSON.stringify({...JSON.parse(output.toString()),extra:true}));
if(${JSON.stringify(scenario)}==='truncated-json')output=Buffer.from('{"sha":');
process.stdout.write(output);process.stderr.write(child.stderr??Buffer.alloc(0));
if(${JSON.stringify(scenario)}==='stderr-overflow')process.stderr.write('x'.repeat(65537));
process.exitCode=${JSON.stringify(scenario)}==='nonzero'?7:child.status??1;
`);
        chmodSync(wrapper, 0o700);
        const guard = { digest: sha256('synthetic-projected-main'), verify() { return {
          transferGh: { path: wrapper, sha256: sha256(readFileSync(wrapper)), home: root, configDirectory: profile },
        }; } };
        f.context.guard = guard;
        const previous = f.io.github;
        f.io.github = path => path === '/commits/main'
          ? recoveryGithubRead(path, guard, AbortSignal.timeout(15000)) : previous(path);
        const outcome = await attestBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport);
        if (scenario === 'large') {
          assert.deepEqual(outcome, { stage: 'complete', category: 'passed' });
          assert.equal(f.calls.bearer, 1); assert.equal(f.calls.startup, 1);
        } else {
          assert.deepEqual(outcome, { stage: 'metadata', category: 'refused' });
          assert.equal(f.calls.bearer, 0); assert.equal(f.calls.startup, 0);
        }
        assert.equal(requests, 1); assert.equal(f.calls.promote, 0);
      });
    }
  });

const priorStartupFiles = ['startup-attempt.json', 'startup-result.json', 'startup-correction.json', 'startup-correction-result.json'];
function continuationFixture(t: TestContext) {
  const f = fixture(t), previous = process.env.RECOVERY_TEST_PRIOR_STARTUP;
  const packaging = process.env.RECOVERY_TEST_PACKAGING_MANIFEST;
  assert.ok(previous && packaging);
  mkdirSync(f.context.directory, { mode: 0o700 });
  for (const name of priorStartupFiles) cpSync(join(previous, name), join(f.context.directory, name));
  const outcome = json(join(f.context.directory, 'startup-result.json'));
  assert.ok(object(outcome) && object(outcome.anchor) && typeof outcome.anchor.controlDigest === 'string');
  f.context.controlDigest = outcome.anchor.controlDigest;
  const manifest = json(packaging); assert.ok(object(manifest));
  f.context.guard = { digest: sha256('synthetic-packaging-continuation'), verify() {
    return { ...manifest, bridgePreHttpContinuation, bridgePackagedPreHttpContinuation };
  } };
  return f;
}
const continuationOptions = { skip: !captured || !bundle || !process.env.RECOVERY_TEST_PRIOR_STARTUP
  || !process.env.RECOVERY_TEST_PACKAGING_MANIFEST };

test('pre-HTTP continuation preserves captured refusal and fences concurrent/repeated HTTP', continuationOptions, async t => {
  const f = continuationFixture(t), before = canonical(inventory(f.context.original));
  const originals = priorStartupFiles.map(name => readFileSync(join(f.context.directory, name)));
  const results = await Promise.allSettled([0, 1].map(() =>
    continueBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport)));
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  const passed = results.find(value => value.status === 'fulfilled');
  assert.ok(passed?.status === 'fulfilled'); assert.deepEqual(passed.value, { stage: 'complete', category: 'passed' });
  await assert.rejects(continueBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport));
  await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
  const attempt = json(join(f.context.directory, 'startup-packaging-attempt.json'));
  const result = json(join(f.context.directory, 'startup-packaging-result.json'));
  assert.ok(object(attempt) && object(result));
  assert.equal(result.attemptDigest, sha256(canonical(attempt)));
  assert.deepEqual(result.result, { stage: 'complete', category: 'passed' });
  assert.deepEqual([f.calls.bearer, f.calls.startup, f.calls.promote], [1, 1, 0]);
  assert.equal(canonical(inventory(f.context.original)), before);
  for (const [index, name] of priorStartupFiles.entries()) {
    assert.deepEqual(readFileSync(join(f.context.directory, name)), originals[index]);
  }
});

test('pre-HTTP continuation refuses prior HTTP, promotion, unknown effects and unbound authorization before reads', continuationOptions, async t => {
  for (const kind of ['prior-http', 'unknown-http', 'completed-http', 'promotion', 'partial-correction',
    'missing-result', 'result-bytes', 'attempt-bytes', 'old-executable', 'wrong-control', 'no-authorization',
    'tampered-link', 'latest-http', 'latest-unknown', 'unknown-file', 'packaging-link', 'packaging-tool'] as const) await t.test(kind, async sub => {
    const f = continuationFixture(sub), resultPath = join(f.context.directory, 'startup-result.json');
    if (['prior-http', 'unknown-http', 'completed-http'].includes(kind)) {
      const result = json(resultPath); assert.ok(object(result));
      result.result = { stage: kind === 'completed-http' ? 'complete' : 'startup', category: kind === 'prior-http' ? 'http_403' : 'refused' };
      writeFileSync(resultPath, canonical(result));
    }
    if (kind === 'promotion') writeFileSync(join(f.context.directory, 'promotion-intent.json'), '{"state":"unknown"}');
    if (kind === 'partial-correction') writeFileSync(join(f.context.directory, 'startup-correction.json'), '{"state":"unknown"}');
    if (kind === 'missing-result') rmSync(resultPath);
    if (kind === 'result-bytes') writeFileSync(resultPath, readFileSync(resultPath, 'utf8') + '\n');
    if (kind === 'attempt-bytes') {
      const path = join(f.context.directory, 'startup-attempt.json');
      writeFileSync(path, readFileSync(path, 'utf8') + '\n');
    }
    if (kind === 'tampered-link' || kind === 'latest-http' || kind === 'latest-unknown') {
      const path = join(f.context.directory, 'startup-correction-result.json'), result = json(path);
      assert.ok(object(result));
      if (kind === 'tampered-link') result.correctionDigest = sha256('unbound-correction');
      else result.result = { stage: 'startup', category: kind === 'latest-http' ? 'http_403' : 'refused' };
      writeFileSync(path, canonical(result));
    }
    if (kind === 'unknown-file') writeFileSync(join(f.context.directory, 'unrecognized.json'), '{}');
    if (kind === 'packaging-link' || kind === 'packaging-tool') {
      const manifest = f.context.guard.verify(); assert.ok(object(manifest));
      if (kind === 'packaging-link') manifest.bridgePackagedPreHttpContinuation = {
        ...bridgePackagedPreHttpContinuation, acceptedPackagingManifestDigest: sha256('unapproved-packaging'),
      };
      else manifest.recoveryVercel = { root: 'unapproved-tool' };
      f.context.guard = { digest: f.context.guard.digest, verify() { return manifest; } };
    }
    if (kind === 'old-executable') f.context.guard.digest = bridgePreHttpContinuation.acceptedProjectionExecutableDigest;
    if (kind === 'wrong-control') f.context.controlDigest = sha256('unbound-control');
    if (kind === 'no-authorization') f.context.guard = { digest: f.context.guard.digest, verify() { return {}; } };
    await assert.rejects(continueBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), f.transport));
    assert.deepEqual([f.calls.remote, f.calls.bearer, f.calls.startup, f.calls.promote], [0, 0, 0, 0]);
  });
});

test('pre-HTTP continuation failure never permits another continuation', continuationOptions, async t => {
  for (const kind of ['metadata', 'http'] as const) await t.test(kind, async sub => {
    const f = continuationFixture(sub);
    if (kind === 'metadata') f.values['/commits/main'] = { sha: 'changed' };
    const transport: typeof fetch = async () => { f.calls.startup++; return new Response('', { status: 403 }); };
    const outcome = await continueBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), transport);
    assert.deepEqual(outcome, kind === 'metadata' ? { stage: 'metadata', category: 'refused' } : { stage: 'startup', category: 'http_403' });
    await assert.rejects(continueBridgeRecovery(f.context, f.io, f.bearer, AbortSignal.timeout(30000), transport));
    assert.equal(f.calls.startup, kind === 'http' ? 1 : 0); assert.equal(f.calls.promote, 0);
  });
});

function externalPromotionFixture(t: TestContext) {
  const f = continuationFixture(t), previous = process.env.RECOVERY_TEST_PRIOR_STARTUP;
  const source = process.env.RECOVERY_TEST_EXTERNAL_PROOF; assert.ok(previous && source);
  for (const name of ['startup-packaging-attempt.json', 'startup-packaging-result.json']) {
    cpSync(join(previous, name), join(f.context.directory, name));
  }
  const directory = join(f.context.directory, '..', 'external-proof');
  mkdirSync(directory, { mode: 0o700 }); cpSync(source, join(directory, bridgeExternalStartupProof.receiptName));
  const manifest = f.context.guard.verify(); assert.ok(object(manifest));
  f.context.guard = { digest: sha256('synthetic-external-promotion'), verify() {
    return { ...manifest, bridgeExternalStartupProof, externalStartupProofDirectory: directory };
  } };
  f.values['/commits/main'] = { sha: bridgeExternalStartupProof.workflowRevision,
    commit: { tree: { sha: bridgeExternalStartupProof.workflowTree } } };
  return { ...f, proofPath: join(directory, bridgeExternalStartupProof.receiptName) };
}

test('external startup proof imports atomically with one promotion intent and preserves every old record', promotionOptions, async t => {
  const f = externalPromotionFixture(t), before = canonical(inventory(f.context.original));
  const oldFiles = [...priorStartupFiles, 'startup-packaging-attempt.json', 'startup-packaging-result.json'];
  const oldBytes = oldFiles.map(name => readFileSync(join(f.context.directory, name)));
  const promote = f.io.promote;
  f.io.promote = async () => {
    const intent = json(join(f.context.directory, 'promotion-intent.json'));
    assert.ok(object(intent) && object(intent.importedStartupProof));
    assert.equal(intent.importedStartupProof.sourceReceiptDigest, bridgeExternalStartupProof.receiptDigest);
    assert.equal(intent.startupProofDigest, sha256(canonical(intent.importedStartupProof)));
    return promote();
  };
  const results = await Promise.allSettled([0, 1].map(() => promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000))));
  const succeeded = results.filter(result => result.status === 'fulfilled');
  assert.equal(succeeded.length, 1); assert.equal(succeeded[0]?.value.outcome, 'acknowledged');
  await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
  assert.deepEqual([f.calls.bearer, f.calls.startup, f.calls.promote], [0, 0, 1]);
  assert.equal(canonical(inventory(f.context.original)), before);
  for (const [index, name] of oldFiles.entries()) assert.deepEqual(readFileSync(join(f.context.directory, name)), oldBytes[index]);
});

test('external proof, lineage, exclusion and current-main mismatches cannot reach promotion', promotionOptions, async t => {
  for (const kind of ['receipt-bytes', 'http-status', 'config', 'candidate', 'workflow-run', 'old-lineage',
    'extra-file', 'prior-intent', 'authorization', 'main', 'tree', 'original-run', 'exclusion', 'alias', 'region'] as const) {
    await t.test(kind, async sub => {
      const f = externalPromotionFixture(sub);
      if (kind === 'receipt-bytes') writeFileSync(f.proofPath, readFileSync(f.proofPath, 'utf8') + '\n');
      if (['http-status', 'config', 'candidate', 'workflow-run'].includes(kind)) {
        const proof = json(f.proofPath); assert.ok(object(proof) && object(proof.probe) && object(proof.probe.identity));
        if (kind === 'http-status') proof.probe.status = 403;
        if (kind === 'config') proof.probe.configDigestMatch = false;
        if (kind === 'candidate') proof.probe.identity.candidate = 'dpl_other';
        if (kind === 'workflow-run') proof.probe.identity.workflowRun = '1';
        writeFileSync(f.proofPath, canonical(proof));
      }
      if (kind === 'old-lineage') writeFileSync(join(f.context.directory, 'startup-packaging-result.json'), '{}');
      if (kind === 'extra-file' || kind === 'prior-intent') {
        writeFileSync(join(f.context.directory, kind === 'prior-intent' ? 'promotion-intent.json' : 'unknown.json'), '{}');
      }
      if (kind === 'authorization') {
        const manifest = f.context.guard.verify(); assert.ok(object(manifest));
        f.context.guard = { digest: f.context.guard.digest, verify() { return { ...manifest, bridgeExternalStartupProof: {} }; } };
      }
      if (kind === 'main' || kind === 'tree') f.values['/commits/main'] = {
        sha: kind === 'main' ? target.workflowRevision : bridgeExternalStartupProof.workflowRevision,
        commit: { tree: { sha: kind === 'tree' ? target.workflowTree : bridgeExternalStartupProof.workflowTree } },
      };
      if (kind === 'original-run') {
        const run = f.values[`/actions/runs/${target.workflowRun}`]; assert.ok(object(run));
        run.head_sha = bridgeExternalStartupProof.workflowRevision;
      }
      if (kind === 'exclusion') f.values[`/deployments/${target.journal}/statuses?per_page=100`] = [{ state: 'success' }];
      if (kind === 'alias') f.values[`/v4/aliases/api.lovora.us?projectId=${target.project}`] = {
        alias: 'api.lovora.us', projectId: target.project, deploymentId: target.candidate,
      };
      if (kind === 'region') {
        const candidate = f.values[`/v13/deployments/${target.candidate}`]; assert.ok(object(candidate)); candidate.regions = ['iad1'];
      }
      await assert.rejects(promoteBridgeRecovery(f.context, f.io, AbortSignal.timeout(30000)));
      assert.deepEqual([f.calls.bearer, f.calls.startup, f.calls.promote], [0, 0, 0]);
    });
  }
});
