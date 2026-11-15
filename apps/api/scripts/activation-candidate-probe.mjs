import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import heldSourcePin from '../config/held-app-probe-binding.json' with { type: 'json' };
import { heldAppPolicy, heldBindingVariable, heldHash, validateHeldBinding } from './activation-held-contract.mjs';

export const candidateProbe = Object.freeze({
  repository: 'khuonghuyhieu/esty-admin', workflow: '.github/workflows/be-candidate-probe.yml',
  candidate: 'dpl_525LvEPCBud7nyAeFTcRx8iipTrk',
  origin: 'https://esty-admin-aohiduygu-khuonghuyhieu0705s-projects.vercel.app', path: '/health/live',
  revision: 'f162c8db8ec149724c0a25537a4a0674bd012035', tree: '181b2c014f9373e4d6cdf055cba01eac11ed5a5e',
  sourceDigest: '73e8f1f5cb7683da2f337b6f3092d6cdcd6dd42ea15a224ce35aa3ea0b77c3e8',
  artifactDigest: '82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2',
  packetDigest: '5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690',
  configDigest: '6dae627e7a7c1fb1f67afb5f78f0177ba1af937c19a03c41562366ab4becd7fe',
  activationRun: 'dcbc0b5f-1707-485d-adb5-02b45037319a',
  project: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls', scope: 'team_k2Hk4wx5XAb9Mgc6lP5AjVhf',
});
const pin = candidateProbe, maximumInput = 65536, maximumBody = 4096;
const bridgeKeys = ['API_RUNTIME', 'DATABASE_URL', 'BROWSER_ORIGIN', 'PREVIEW_ACCESS_KEY', 'APP_SCHEMA_MODE',
  'APP_FOUNDATION_ENABLED', 'SUPABASE_PROJECT_REF', 'SUPABASE_SESSION_HOST', 'SUPABASE_DATABASE_NAME',
  'SUPABASE_DATABASE_USER', 'DATABASE_CA_PEM'];
function refuse() { throw new Error('Candidate probe refused.'); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(); return value; }
// Identical sorted-key string-map encoding to activation-inputs/runtimeConfigDigest.
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const hash = value => createHash('sha256').update(value).digest('hex');
function json(raw) {
  if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw) > maximumInput) refuse();
  return object(JSON.parse(raw));
}
export function validateProbeContext(env, event) {
  const revision = env.BE_PROBE_WORKFLOW_SHA;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== pin.repository || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1'
    || env.GITHUB_WORKFLOW_REF !== `${pin.repository}/${pin.workflow}@refs/heads/main`
    || env.BE_PROBE_ENVIRONMENT !== 'be-production' || !/^[a-f0-9]{40}$/.test(revision ?? '')
    || env.GITHUB_SHA !== revision || env.GITHUB_WORKFLOW_SHA !== revision
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || object(object(event).repository).full_name !== pin.repository
    || ![canonical({ approved_revision: revision }), canonical({ approved_revision: revision, mode: 'bridge' })]
      .includes(canonical(object(event.inputs)))) refuse();
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS',
    'NODE_USE_ENV_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    if (env[key] !== undefined) refuse();
  }
  const packet = json(env.BE_ACTIVATION_PACKET_JSON);
  if (env.BE_ACTIVATION_PACKET_SHA256 !== pin.packetDigest || hash(canonical(packet)) !== pin.packetDigest
    || packet.version !== 1 || packet.revision !== pin.revision || packet.tree !== pin.tree
    || packet.sourceDigest !== pin.sourceDigest || packet.artifactDigest !== pin.artifactDigest
    || packet.bridgeConfigDigest !== pin.configDigest || packet.runId !== pin.activationRun
    || packet.projectId !== pin.project || packet.scopeId !== pin.scope || packet.target !== 'supabase:eotmpaliqcxxcotrcols') refuse();
  return { workflowRevision: revision, workflowRun: env.GITHUB_RUN_ID };
}
export function bridgeBearer(raw, expectedDigest) {
  const values = json(raw);
  for (const [key, value] of Object.entries(values)) {
    if (!bridgeKeys.includes(key) || typeof value !== 'string' || value.length > 16384 || value.includes('\0')) refuse();
  }
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '') || hash(canonical(values)) !== expectedDigest
    || values.API_RUNTIME !== 'vercel' || values.APP_SCHEMA_MODE !== 'activation-bridge'
    || values.APP_FOUNDATION_ENABLED !== 'false' || values.BROWSER_ORIGIN !== 'https://app.lovora.us'
    || !/^[a-f0-9]{64}$/.test(values.PREVIEW_ACCESS_KEY ?? '')) refuse();
  return values.PREVIEW_ACCESS_KEY;
}
function emptyResult() {
  return { status: 0, configDigestMatch: false, bodyStatus: 'not_requested', identity: { ...pin } };
}
async function requestTarget(target, bearer, bypass, transport, signal) {
  const result = { status: 0, configDigestMatch: false, bodyStatus: 'not_requested', identity: { ...target } };
  if (!/^[a-f0-9]{64}$/.test(bearer ?? '') || !/^[\x21-\x7e]{16,512}$/.test(bypass ?? '')) return result;
  const deadline = new AbortController(), timeout = setTimeout(() => deadline.abort(), 10000);
  const cancellation = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let reader, response;
  let rejectAbort;
  const stopped = new Promise((_, reject) => { rejectAbort = () => reject(new Error('Candidate probe stopped.')); });
  cancellation.addEventListener('abort', rejectAbort, { once: true });
  try {
    cancellation.throwIfAborted();
    result.bodyStatus = 'unavailable';
    await Promise.race([stopped, (async () => {
      // One fixed GET. Neither credential enters argv, a URL, a child process or output.
      response = await transport(`${target.origin}/health/live`, { method: 'GET', redirect: 'manual', credentials: 'omit',
        cache: 'no-store', signal: cancellation,
        headers: { Authorization: `Bearer ${bearer}`, 'x-vercel-protection-bypass': bypass } });
      cancellation.throwIfAborted();
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) refuse();
      result.status = response.status;
      result.configDigestMatch = response.headers.get('x-activation-config-digest') === target.configDigest;
      if (response.status !== 200 || response.redirected || !result.configDigestMatch) return;
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
        result.bodyStatus = 'invalid'; return;
      }
      reader = response.body.getReader();
      const chunks = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); cancellation.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > maximumBody) { result.bodyStatus = 'invalid'; return; }
        chunks.push(value);
      }
      result.bodyStatus = 'invalid';
      const body = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
      if (object(body).status === 'ok') result.bodyStatus = 'ok';
    })()]);
  } catch { /* Only the fixed safe result survives transport, parsing or cancellation failures. */ }
  finally {
    clearTimeout(timeout); cancellation.removeEventListener('abort', rejectAbort); deadline.abort();
    if (reader) void reader.cancel().catch(() => {});
    else if (response?.body) void response.body.cancel().catch(() => {});
    bearer = ''; bypass = '';
  }
  return { ...result };
}
export function requestCandidate(bearer, bypass, transport = fetch, signal) {
  return requestTarget(pin, bearer, bypass, transport, signal);
}

export async function probeHeldAppCandidate(env, event, transport = fetch, signal, sourcePin = heldSourcePin, policy = heldAppPolicy) {
  const result = { version: 1, kind: 'held-app-live', bindingDigest: null, workflowRevision: null, workflowRun: null,
    status: 0, configDigestMatch: false, bodyStatus: 'not_requested' };
  let raw = '', bearer = '', bypass = '';
  try {
    // Source-reviewed target equality precedes credential derivation. vars alone cannot prove environment provenance.
    const binding = validateHeldBinding(json(env[heldBindingVariable]), sourcePin, policy);
    const revision = binding.workflowRevision;
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== pin.repository || env.GITHUB_REF !== 'refs/heads/main'
      || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1'
      || env.GITHUB_WORKFLOW_REF !== `${pin.repository}/${pin.workflow}@refs/heads/main`
      || env.BE_PROBE_ENVIRONMENT !== 'be-production' || env.BE_PROBE_WORKFLOW_SHA !== revision
      || env.GITHUB_SHA !== revision || env.GITHUB_WORKFLOW_SHA !== revision || env.BE_PROBE_CURRENT_MAIN !== revision
      || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || object(object(event).repository).full_name !== pin.repository
      || canonical(object(event.inputs)) !== canonical({ approved_revision: revision, mode: 'held-app' })) refuse();
    for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS',
      'NODE_USE_ENV_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
      if (env[key] !== undefined) refuse();
    }
    const packet = json(env.BE_ACTIVATION_PACKET_JSON);
    if (env.BE_ACTIVATION_PACKET_SHA256 !== policy.packetDigest || hash(canonical(packet)) !== policy.packetDigest
      || packet.appConfigDigest !== binding.configDigest || packet.projectId !== binding.project || packet.scopeId !== binding.scope
      || packet.artifactDigest !== binding.artifactDigest || packet.sourceDigest !== binding.sourceDigest
      || packet.revision !== binding.revision || packet.tree !== binding.tree) refuse();
    raw = env.BE_ACTIVATION_APP_INPUTS; bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const values = json(raw), keys = [...bridgeKeys, 'APP_WORKSPACE_ID', 'APP_AUTH_URL', 'APP_AUTH_API_KEY',
      'APP_EMAIL_ENABLED', 'APP_RETENTION_POLICY_ID'];
    if (Object.entries(values).some(([key, value]) => !keys.includes(key) || typeof value !== 'string'
      || value.length > 16384 || value.includes('\0')) || hash(canonical(values)) !== binding.configDigest
      || values.API_RUNTIME !== 'vercel' || values.APP_SCHEMA_MODE !== 'strict' || values.APP_FOUNDATION_ENABLED !== 'true'
      || values.APP_EMAIL_ENABLED !== 'false' || values.BROWSER_ORIGIN !== 'https://app.lovora.us'
      || !/^[a-f0-9]{64}$/.test(values.PREVIEW_ACCESS_KEY ?? '')) refuse();
    bearer = values.PREVIEW_ACCESS_KEY; raw = '';
    result.bindingDigest = heldHash(binding); result.workflowRevision = revision; result.workflowRun = env.GITHUB_RUN_ID;
    const response = await requestTarget(binding, bearer, bypass, transport, signal);
    result.status = response.status; result.configDigestMatch = response.configDigestMatch; result.bodyStatus = response.bodyStatus;
  } catch { /* No caller payload, response, key or exception is evidence. */ }
  finally {
    delete env.BE_ACTIVATION_APP_INPUTS; delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
    raw = ''; bearer = ''; bypass = '';
  }
  return result;
}
export async function probeCandidate(env, event, transport = fetch, signal) {
  let raw = env.BE_ACTIVATION_BRIDGE_INPUTS, bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET, bearer;
  delete env.BE_ACTIVATION_BRIDGE_INPUTS; delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const result = emptyResult();
  try {
    const identity = validateProbeContext(env, event);
    result.identity = { ...pin, ...identity };
    bearer = bridgeBearer(raw, pin.configDigest); raw = '';
    return { ...await requestCandidate(bearer, bypass, transport, signal), identity: result.identity };
  } catch { return result; }
  finally { raw = ''; bypass = ''; bearer = ''; }
}
function eventFile(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maximumInput || stat.size === 0) refuse();
    return json(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result = emptyResult();
  try {
    if (process.argv.length !== 2 || process.execArgv.length || process.versions.node !== '24.22.1') refuse();
    const event = eventFile(process.env.GITHUB_EVENT_PATH);
    if (event.inputs?.mode === 'held-app') {
      result = await probeHeldAppCandidate(process.env, event);
      if (!process.env.RUNNER_TEMP) refuse();
      writeFileSync(join(process.env.RUNNER_TEMP, 'held-app-probe.json'), JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 });
    } else {
      if (event.inputs?.mode !== undefined && event.inputs.mode !== 'bridge') refuse();
      result = await probeCandidate(process.env, event);
    }
  } catch { result = emptyResult(); /* Never print values, response bodies, headers, error messages or stacks. */ }
  finally {
    delete process.env.BE_ACTIVATION_BRIDGE_INPUTS; delete process.env.BE_ACTIVATION_APP_INPUTS;
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 200 && result.configDigestMatch && result.bodyStatus === 'ok' ? 0 : 1;
}
