import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { bridgeBearer, candidateProbe as pin, probeCandidate, requestCandidate,
  validateProbeContext } from '../scripts/activation-candidate-probe.mjs';

// Public, already-approved packet only; no protected configuration fixture is retained.
const packet = {
  appConfigDigest: '249e18e93eb01e5fa1f66117c82a8cca2e0777938655308cc43af437095e7892',
  artifactDigest: pin.artifactDigest,
  bootstrapBindingDigest: 'be0b95e01e8902c1851ebe5394a2155a1148f72baabec3bb600952d689c1ebbe',
  bootstrapInputDigest: '011ea8f75b3920e5782cc6050172e4d27cf07934956460429914e849ecca6dc1',
  bridgeConfigDigest: pin.configDigest,
  contractDigest: '41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad',
  feConfigDigest: 'f6c2b809a7196260d9921cc37594ea83a512251b3e43d705b1c5aabb53c0c432',
  feRevision: '776cb034f035ce94388f83be8bc52b199ce7fd34',
  feSourceDigest: 'f392a9e7a66140a8f07456c27be09b3a3490908d244aa352d963968207b1e43d',
  migrationInputDigest: '33389f19c86fbbfa78862e2b119fa7661e9ab84fe1b823cd1423bea31d466882',
  migrations: [
    { name: '1792972800000-foundation', sha256: 'c3374f370c42d8543bde5771d4cddd91990e643e8969fcaf4bf1c5ffe3e4e851' },
    { name: '1792972800001-app-foundation', sha256: '4416736cb809720359dd0d650a3d530e6c3836be683f7c1700a8da8138df9608' },
    { name: '1792972800002-app-session-check', sha256: '49316100a5c98a852ef28ccb99d6e2a4306da9d5baf9631d4643a26d9d1c82f2' },
  ],
  oldDigest: '243818c0ebe11bc6ea8b12b3224810c88e888b18ec30dd5bfe58394f1f209496',
  predecessorId: 'dpl_E7FELzuA6Ymt9mW8B3NE7mA4oQH3', projectId: pin.project,
  retentionApprovalDigest: '0a824429245a37d213feaed753a3e688ae68c5aa75c004431dedfe2707d8e144',
  revision: pin.revision,
  roleInputDigest: '4bb31db5c343805b15a25138e47eeb478f83ba4ad7b8c48044f05fb7f9634a45',
  runId: pin.activationRun, scopeId: pin.scope, sourceDigest: pin.sourceDigest,
  sourceReviewDigest: 'ff158f540028d3e9b2a99356674fdb3bc256f881fc46496dd68a7417d073ce4e',
  target: 'supabase:eotmpaliqcxxcotrcols',
  targetDigest: '149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3',
  testReceiptDigest: 'b704fba82d1076a4523f8df75376f0654ef7b013d8663b6f6208e1ff9971300d',
  tree: pin.tree, version: 1,
};
const bearer = 'a'.repeat(64), bypass = 'synthetic-bypass-never-print', canary = 'PRIVATE_RESPONSE_ERROR_CANARY';
const bridge = { API_RUNTIME: 'vercel', APP_SCHEMA_MODE: 'activation-bridge', APP_FOUNDATION_ENABLED: 'false',
  BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: bearer };
const syntheticDigest = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(bridge).sort()))).digest('hex');
function context() {
  const revision = 'b'.repeat(40);
  return { env: {
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: pin.repository, GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '123',
    GITHUB_WORKFLOW_REF: `${pin.repository}/${pin.workflow}@refs/heads/main`,
    BE_PROBE_ENVIRONMENT: 'be-production', BE_PROBE_WORKFLOW_SHA: revision,
    GITHUB_SHA: revision, GITHUB_WORKFLOW_SHA: revision,
    BE_ACTIVATION_PACKET_JSON: JSON.stringify(packet), BE_ACTIVATION_PACKET_SHA256: pin.packetDigest,
    BE_ACTIVATION_BRIDGE_INPUTS: JSON.stringify(bridge), VERCEL_AUTOMATION_BYPASS_SECRET: bypass,
  }, event: { repository: { full_name: pin.repository }, inputs: { approved_revision: revision } } };
}
function response(body = JSON.stringify({ status: 'ok' }), options = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json',
    'x-activation-config-digest': pin.configDigest }, ...options });
}
function redacted(result) {
  const text = JSON.stringify(result);
  for (const value of [bearer, bypass, canary]) assert.equal(text.includes(value), false);
  assert.deepEqual(Object.keys(result).sort(), ['bodyStatus', 'configDigestMatch', 'identity', 'status']);
}

test('approved public packet binds repository, main, workflow revision, source and artifact', () => {
  const { env, event } = context();
  assert.deepEqual(validateProbeContext(env, event), { workflowRevision: env.GITHUB_SHA, workflowRun: '123' });
});

test('context and packet mismatches prevent every request', async t => {
  for (const field of ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_RUN_ATTEMPT',
    'GITHUB_WORKFLOW_REF', 'GITHUB_WORKFLOW_SHA', 'GITHUB_SHA', 'BE_PROBE_WORKFLOW_SHA',
    'BE_PROBE_ENVIRONMENT', 'BE_ACTIVATION_PACKET_SHA256', 'revision', 'tree', 'sourceDigest',
    'artifactDigest', 'bridgeConfigDigest', 'event-revision', 'NODE_EXTRA_CA_CERTS']) await t.test(field, async () => {
    const { env, event } = context();
    if (Object.hasOwn(packet, field)) env.BE_ACTIVATION_PACKET_JSON = JSON.stringify({ ...packet, [field]: 'changed' });
    else if (field === 'event-revision') event.inputs.approved_revision = 'c'.repeat(40);
    else env[field] = 'changed';
    let calls = 0;
    const result = await probeCandidate(env, event, async () => { calls++; throw new Error(canary); });
    assert.equal(calls, 0); assert.equal(result.status, 0); assert.equal(result.bodyStatus, 'not_requested');
    assert.equal(env.BE_ACTIVATION_BRIDGE_INPUTS, undefined); assert.equal(env.VERCEL_AUTOMATION_BYPASS_SECRET, undefined);
    redacted(result);
  });
});

test('configuration digest mismatch refuses before the fixed request', async () => {
  const { env, event } = context(); let calls = 0;
  // Context is valid, but these synthetic inputs cannot match the approved protected configuration.
  assert.doesNotThrow(() => validateProbeContext(env, event));
  const result = await probeCandidate(env, event, async () => { calls++; return response(); });
  assert.equal(calls, 0); assert.equal(result.bodyStatus, 'not_requested'); redacted(result);
  assert.equal(bridgeBearer(JSON.stringify(bridge), syntheticDigest), bearer);
  assert.throws(() => bridgeBearer(JSON.stringify({ ...bridge, PREVIEW_ACCESS_KEY: 'c'.repeat(64) }), syntheticDigest));
});

test('one GET uses only the fixed host/path and distinct in-process authentication headers', async () => {
  let calls = 0;
  const result = await requestCandidate(bridgeBearer(JSON.stringify(bridge), syntheticDigest), bypass, async (url, options) => {
    calls++; assert.equal(url, `${pin.origin}/health/live`); assert.equal(new URL(url).search, '');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit');
    assert.deepEqual(options.headers, { Authorization: `Bearer ${bearer}`, 'x-vercel-protection-bypass': bypass });
    return response();
  });
  assert.equal(calls, 1); assert.equal(result.status, 200); assert.equal(result.configDigestMatch, true);
  assert.equal(result.bodyStatus, 'ok'); redacted(result);
});

test('redirects and authentication failures retain numeric status without follow or retry', async t => {
  for (const status of [301, 302, 307, 308, 401, 403]) await t.test(String(status), async () => {
    let calls = 0;
    const result = await requestCandidate(bearer, bypass, async (_, options) => {
      calls++; assert.equal(options.redirect, 'manual');
      return new Response(canary, { status, headers: { location: 'https://unapproved.invalid/private' } });
    });
    assert.equal(calls, 1); assert.equal(result.status, status); assert.equal(result.bodyStatus, 'unavailable'); redacted(result);
  });
});

test('wrong response digest and unsafe bodies never become acceptance or disclosed output', async t => {
  for (const kind of ['config', 'content-type', 'malformed', 'not-ok', 'oversize', 'boundary']) await t.test(kind, async () => {
    const body = JSON.stringify({ status: 'ok' });
    const result = await requestCandidate(bearer, bypass, async () => {
      if (kind === 'config') return response(canary, { headers: { 'x-activation-config-digest': canary } });
      if (kind === 'content-type') return response(canary, { headers: { 'content-type': 'text/plain', 'x-activation-config-digest': pin.configDigest } });
      if (kind === 'malformed') return response(canary);
      if (kind === 'not-ok') return response(JSON.stringify({ status: canary }));
      return response(body.padEnd(kind === 'boundary' ? 4096 : 4097, ' '));
    });
    assert.equal(result.status, 200);
    assert.equal(result.configDigestMatch, kind !== 'config');
    assert.equal(result.bodyStatus, kind === 'boundary' ? 'ok' : kind === 'config' ? 'unavailable' : 'invalid');
    redacted(result);
  });
});

test('the ten-second deadline bounds a stalled transport without retry or error disclosure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let calls = 0, signal;
  const pending = requestCandidate(bearer, bypass, async (_, options) => {
    calls++; signal = options.signal; return new Promise(() => {});
  });
  t.mock.timers.tick(9999); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); const result = await pending;
  assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(result.status, 0);
  assert.equal(result.bodyStatus, 'unavailable'); redacted(result);
});

test('the same deadline includes body consumption and cancels the pending reader', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let cancelled = false, startBody;
  const reading = new Promise(resolve => { startBody = resolve; });
  const body = new ReadableStream({ pull() { startBody(); }, cancel() { cancelled = true; } });
  const pending = requestCandidate(bearer, bypass, async () => response(body));
  await reading; await Promise.resolve(); t.mock.timers.tick(10000);
  const result = await pending;
  assert.equal(result.status, 200); assert.equal(result.configDigestMatch, true);
  assert.equal(result.bodyStatus, 'unavailable'); assert.equal(cancelled, true); redacted(result);
});

test('transport errors and invalid credential headers are redacted without retries', async () => {
  let calls = 0;
  const transport = async () => { calls++; throw new Error(`${canary} ${bearer} ${bypass}`); };
  const result = await requestCandidate(bearer, bypass, transport);
  assert.equal(calls, 1); assert.equal(result.status, 0); redacted(result);
  for (const [technical, automation] of [[bearer, `${bypass}\nInjected: value`], ['invalid', bypass]]) {
    const refused = await requestCandidate(technical, automation, transport);
    assert.equal(calls, 1); assert.equal(refused.bodyStatus, 'not_requested'); redacted(refused);
  }
});
