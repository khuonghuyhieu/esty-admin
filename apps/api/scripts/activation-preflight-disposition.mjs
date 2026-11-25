import { createHash } from 'node:crypto';
import { crc32, gunzipSync, inflateRawSync } from 'node:zlib';
import { canonical, githubReader, retainedActivation, retainedHistoricalArchive } from './activation-retained.mjs';

const pin = retainedActivation, task = 'deploy:esty-be-ci', environment = 'be-production';
export const failedPreflightRun = '42847325668';
const oldActivationRun = '36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed';
const oldPacketDigest = '8385563025717633d77f7a2a38e3fc26f5b7e51ab9fb2b81086eee3edde15382';
const sourceBlobs = Object.freeze({
  '.github/workflows/be-delivery.yml': 'ce6c9e94ed4d037200ae4a290891ec4591ea912f',
  'apps/api/scripts/manual-activation.mjs': '40747f1faeaec45023e7b9eaca17e22a2ed91f68',
  'apps/api/scripts/activation-retained.mjs': 'd5aac87fa09c6ac15f176b4c8e8b6d1f99b90c4c',
});
const historicalSteps = [
  'Check out the actual reviewed workflow source without persisted credentials',
  'Set the exact runtime without application installation',
  "Download only this run's verified transport relay without cross-run credentials",
  'Revalidate the selection and original archive before extraction or helper execution',
  'Bootstrap independently verified public CLI before secrets are present',
  'Prepare the explicitly approved public activation packet without credentials',
  'Reserve the shared durable production exclusion',
  'Verify exact OLD history and role prerequisites without writes',
  'Authorize bridge configuration durably', 'Configure only approved bridge Production inputs',
  'Confirm bridge configuration before any create', 'Authorize one immutable bridge candidate',
  'Create attest and promote the bridge without runtime inputs in CREATE', 'Confirm the bridge before SQL mutation',
  'Authorize role provisioning', 'Provision or verify fixed application roles', 'Confirm role outcome',
  'Authorize the ordinary two-file migration batch', 'Execute the ordinary OLD to TARGET migration runner once',
  'Verify TARGET roles effective privileges and definer without writes', 'Confirm migration and postflight before bootstrap',
  'Authorize the existing-identity bootstrap', 'Bootstrap and inspect only the approved existing identity',
  'Confirm bootstrap outcome without blind replay', 'Authorize strict app configuration independently',
  'Configure only approved strict app Production inputs', 'Confirm strict app configuration before its create',
  'Authorize one strict app candidate', 'Consume the same immutable artifact and attest actual strict runtime',
  'Confirm strict BE and retain the external FE acceptance gate',
  'Preserve private receipt modes and record the exact transferable inventory',
  'Retain sanitized receipts without secret-bearing subprocess logs',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/, commit = /^[a-f0-9]{40}$/;
function refuse() { throw new Error('Failed-preflight disposition remains UNKNOWN; preserve all original evidence.'); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(); return value; }
function exact(value, keys) { return Object.keys(object(value)).sort().join(',') === [...keys].sort().join(','); }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function equal(left, right) { return canonical(left) === canonical(right); }

// Bounded, in-memory archive readers: no extraction, executable members, links, traversal or ZIP64.
function zipMembers(bytes, approved, names = ['be-delivery-receipts.tar.gz', 'be-delivery-receipts.inventory-sha256', 'be-delivery-receipts.archive-sha256'], maximum = 65536, diagnostics) {
  const bounded = Buffer.isBuffer(bytes) && bytes.length <= maximum;
  diagnostics?.check('github.archive-size', bounded, 'invalid-or-oversized-archive', { bytes: Buffer.isBuffer(bytes) ? bytes.length : null, maximum });
  if (!bounded) refuse();
  const digestMatches = hash(bytes) === approved;
  diagnostics?.check('github.archive-hash', digestMatches, 'archive-digest-mismatch', { digestMatches });
  if (!digestMatches) refuse();
  const end = bytes.lastIndexOf(Buffer.from('504b0506', 'hex'));
  if (end < 0 || end + 22 > bytes.length || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
    || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== names.length
    || bytes.readUInt16LE(end + 10) !== names.length) refuse();
  let cursor = bytes.readUInt32LE(end + 16);
  if (cursor + bytes.readUInt32LE(end + 12) !== end) refuse();
  const files = new Map();
  for (let index = 0; index < names.length; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) refuse();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42), mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    if (cursor + 46 + length + extra + comment > end || flags & 1 || ![0, 8].includes(method) || size > maximum
      || (mode & 0o170000) && (mode & 0o170000) !== 0o100000 || bytes.readUInt16LE(cursor + 34)) refuse();
    const name = bytes.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
    if (!names.includes(name) || files.has(name) || local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50
      || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) refuse();
    const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    const start = local + 30 + localNameLength + localExtra;
    if (bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name || start + compressed > cursor) refuse();
    const payload = bytes.subarray(start, start + compressed);
    const decoded = method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: maximum });
    if (decoded.length !== size || crc32(decoded) !== checksum) refuse();
    files.set(name, decoded); cursor += 46 + length + extra + comment;
  }
  if (cursor !== end) refuse();
  return files;
}
export function validateHeldProbeArchive(bytes, approved, diagnostics) {
  const members = zipMembers(bytes, approved, ['held-app-probe.json'], 65536, diagnostics);
  return JSON.parse(members.get('held-app-probe.json').toString('utf8'));
}
export function validateRetainedArtifactArchive(bytes, diagnostics) {
  const archive = zipMembers(bytes, pin.zipDigest, ['be-release.tar.gz'], 64 * 1024 * 1024, diagnostics).get('be-release.tar.gz');
  const digestMatches = hash(archive) === pin.archiveDigest;
  diagnostics?.check('github.archive-inner-hash', digestMatches, 'inner-archive-digest-mismatch', { digestMatches });
  if (!digestMatches) refuse();
  return archive;
}
export function validateAuthorizationProducerArchive(bytes, approvedZip, diagnostics) {
  const members = zipMembers(bytes, approvedZip, ['be-release.tar.gz', 'be-release-approval.json'], 64 * 1024 * 1024, diagnostics);
  const approvalBytes = members.get('be-release-approval.json');
  if (approvalBytes.length > 65536) refuse();
  let approval;
  try { approval = JSON.parse(approvalBytes.toString('utf8')); } catch { refuse(); }
  if (canonical(approval) + '\n' !== approvalBytes.toString('utf8')) refuse();
  return { archive: members.get('be-release.tar.gz'), approval, approvalDigest: hash(approvalBytes) };
}
function receiptMembers(zip, approvedZip, expectedDirectories, acceptsFile, diagnostics) {
  const members = zipMembers(zip, approvedZip, undefined, 65536, diagnostics), compressed = members.get('be-delivery-receipts.tar.gz');
  const archiveLine = members.get('be-delivery-receipts.archive-sha256').toString('utf8');
  const inventoryLine = members.get('be-delivery-receipts.inventory-sha256').toString('utf8');
  if (!/^[a-f0-9]{64}  [^\r\n]*\/be-delivery-receipts\.tar\.gz\n$/.test(archiveLine)
    || archiveLine.slice(0, 64) !== hash(compressed) || !/^[a-f0-9]{64}\n$/.test(inventoryLine)) refuse();
  const tar = gunzipSync(compressed, { maxOutputLength: 65536 });
  const files = new Map(), directories = new Map();
  const octal = bytes => { const text = bytes.toString('ascii').replace(/\0.*$/, '').trim(); if (!/^[0-7]+$/.test(text)) refuse(); return Number.parseInt(text, 8); };
  let cursor = 0;
  while (cursor + 512 <= tar.length && tar[cursor] !== 0) {
    const header = tar.subarray(cursor, cursor + 512), size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(header.subarray(148, 156)) || size > 65536 || cursor + 512 + size > tar.length
      || header.subarray(157, 257).some(byte => byte !== 0) || header.subarray(345, 500).some(byte => byte !== 0)) refuse();
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name.startsWith('be-receipts/')) refuse();
    const relative = name.slice('be-receipts/'.length).replace(/\/$/, ''), type = header[156];
    if (type === 53) {
      if (!expectedDirectories.some(expected => typeof expected === 'string' ? expected === relative : expected.test(relative))
        || directories.has(relative) || mode !== 0o700 || size !== 0) refuse();
      directories.set(relative, { path: relative, mode });
    } else {
      if (![0, 48].includes(type) || !acceptsFile(relative) || files.has(relative) || mode !== 0o600) refuse();
      files.set(relative, { bytes: tar.subarray(cursor + 512, cursor + 512 + size), mode });
    }
    cursor += 512 + Math.ceil(size / 512) * 512;
  }
  if (directories.size !== expectedDirectories.length || expectedDirectories.some(expected =>
    typeof expected === 'string' ? !directories.has(expected) : ![...directories.keys()].some(name => expected.test(name)))
    || tar.length - cursor < 1024 || tar.subarray(cursor).some(byte => byte !== 0)) refuse();
  const inventory = { files: [...files].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([path, file]) => ({ path, mode: file.mode, size: file.bytes.length,
    sha256: hash(file.bytes), sha1: createHash('sha1').update(file.bytes).digest('hex') })), directories: [...directories.values()]
    .filter(directory => directory.path !== '').sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  if (hash(canonical(inventory)) !== inventoryLine.trim()) refuse();
  return { files, directories, archiveDigest: hash(compressed), inventoryDigest: inventoryLine.trim() };
}
// This incident has six outcome records and fourteen strict records, including
// both terminal snapshots. Never discard the last snapshot to fit a stated count.
export function validateHeldContinuationReceiptArchive(zip, diagnostics) {
  const runId = '17900717-24bf-4b64-8c1d-8e6a456412d6', base = `strict/${runId}`;
  const outcomes = Array.from({ length: 6 }, (_, index) => `release-outcome-${String(index).padStart(4, '0')}.json`);
  const fixed = ['strict/reserving.json', 'strict/reservation.json', 'strict/history.authorized.json',
    'strict/operator.lock', 'strict/active.lock', 'strict/history.remote.json', 'strict/held-create.remote.json',
    ...['history.intent', 'history.receipt', 'held-create.intent', 'held-create.receipt', 'create-ack',
      'pre-sql-check.intent', 'STOP'].map(name => `${base}/${name}.json`)];
  const expected = new Set([...outcomes, ...fixed]);
  const result = receiptMembers(zip, '47fbb0ecc25d77764f11b187d60f7b954b473e15552660886745bbc6f4c1cf64',
    ['', 'strict', base], name => expected.has(name), diagnostics);
  if (result.files.size !== 20 || [...expected].some(name => !result.files.has(name))) refuse();
  return { ...result, outcomes, runId };
}
export function validateAuthorizationReceiptArchive(zip, approvedZip, diagnostics, readOnlyHistory = false) {
  const historyDirectory = /^strict\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const fixed = ['strict/reserving.json', 'strict/reservation.json',
    ...(readOnlyHistory ? ['strict/history.authorized.json', 'strict/operator.lock', 'strict/active.lock'] : [])];
  const result = receiptMembers(zip, approvedZip, readOnlyHistory ? ['', 'strict', historyDirectory] : ['', 'strict'], name =>
    fixed.includes(name) || /^release-outcome-\d{4}\.json$/.test(name)
    || (readOnlyHistory && /\/(?:history\.intent|STOP)\.json$/.test(name) && historyDirectory.test(name.slice(0, name.lastIndexOf('/')))), diagnostics);
  const outcomes = [...result.files.keys()].filter(name => name.startsWith('release-outcome-')).sort();
  let runId = null;
  if (readOnlyHistory) {
    const intent = [...result.files.keys()].find(name => name.endsWith('/history.intent.json'));
    if (!intent) refuse();
    const base = intent.slice(0, intent.lastIndexOf('/'));
    if (!result.directories.has(base)) refuse();
    runId = base.slice('strict/'.length);
    fixed.push(`${base}/history.intent.json`, `${base}/STOP.json`);
  }
  if (outcomes.length < 1 || outcomes.length > 256 || (readOnlyHistory && outcomes.length !== 3)
    || result.files.size !== outcomes.length + fixed.length
    || outcomes.some((name, index) => name !== `release-outcome-${String(index).padStart(4, '0')}.json`)
    || fixed.some(name => !result.files.has(name))) refuse();
  return { ...result, outcomes, runId };
}
export function validatePreflightReceiptArchive(zip, approvedZip, expected, diagnostics) {
  const { runId, packetDigest } = expected;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId) || !hex.test(packetDigest)) refuse();
  const base = `activation/${runId}`, expectedFiles = [`${base}/lock.json`, `${base}/packet.json`, `${base}/reservation.json`, 'operator.lock', 'packet-input.json'];
  const { files, archiveDigest, inventoryDigest } = receiptMembers(zip, approvedZip, ['', 'activation', base], name => expectedFiles.includes(name), diagnostics);
  if (files.size !== expectedFiles.length) refuse();
  const json = name => JSON.parse(files.get(name).bytes.toString('utf8'));
  const packet = json(`${base}/packet.json`), lock = json('operator.lock'), binding = json(`${base}/lock.json`), reservation = json(`${base}/reservation.json`);
  if (hash(canonical(packet)) !== packetDigest || packet.runId !== runId || !equal(json('packet-input.json'), packet)
    || !equal(lock, { version: 1, kind: 'activation', runId, packetDigest })
    || !exact(binding, ['packetDigest', 'identity']) || binding.packetDigest !== packetDigest
    || !exact(binding.identity, ['dev', 'ino', 'size', 'mtime_ns', 'ctime_ns', 'sha256'])
    || !['dev', 'ino', 'mtime_ns', 'ctime_ns'].every(key => /^\d{1,30}$/.test(binding.identity[key]))
    || binding.identity.sha256 !== hash(files.get('operator.lock').bytes) || binding.identity.size !== files.get('operator.lock').bytes.length
    || !exact(reservation, ['packetDigest', 'journal']) || reservation.packetDigest !== packetDigest || !positive(reservation.journal)) refuse();
  return { packet, journal: reservation.journal, archiveDigest, inventoryDigest };
}
function assertIntent(entry, packet) {
  const payload = object(entry.payload);
  if (!positive(entry.id) || entry.sha !== pin.revision || entry.task !== task || entry.environment !== environment || entry.production_environment !== true
    || !exact(payload, ['version', 'revision', 'tree', 'run', 'artifact', 'sourceDigest', 'migrationDigest', 'project', 'activationPacket', 'activationRun'])
    || payload.version !== 1 || payload.revision !== pin.revision || payload.tree !== pin.tree || payload.run !== failedPreflightRun
    || payload.artifact !== pin.artifactDigest || payload.sourceDigest !== pin.sourceDigest || payload.project !== pin.project
    || payload.activationPacket !== oldPacketDigest || payload.activationRun !== oldActivationRun
    || (packet && payload.migrationDigest !== packet.targetDigest)) refuse();
}
export async function failedPreflightProof(io, intent, verifyArtifact) {
  assertIntent(intent);
  const entry = object(await io.read(`/deployments/${intent.id}`)); assertIntent(entry);
  if (!equal(entry.payload, intent.payload) || entry.id !== intent.id) refuse();
  const run = object(await io.read(`/actions/runs/${failedPreflightRun}`));
  if (String(run.id) !== failedPreflightRun || run.run_attempt !== 1 || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || !commit.test(run.head_sha)
    || run.path !== pin.workflowPath || object(run.repository).full_name !== pin.repository || object(run.head_repository).full_name !== pin.repository) refuse();
  for (const [path, sha] of Object.entries(sourceBlobs)) {
    const file = object(await io.read(`/contents/${path}?ref=${run.head_sha}`));
    if (file.type !== 'file' || file.path !== path || file.sha !== sha) refuse();
  }
  const jobs = object(await io.read(`/actions/runs/${failedPreflightRun}/attempts/1/jobs?per_page=100`));
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.jobs.length > 10
    || jobs.jobs.some(job => String(job.run_id) !== failedPreflightRun || job.run_attempt !== 1 || job.head_sha !== run.head_sha || job.status !== 'completed')) refuse();
  const activation = jobs.jobs.filter(job => job.name === 'Activate the owner-approved retained bundle');
  const retrieval = jobs.jobs.filter(job => job.name === 'Select the owner-approved retained activation bundle');
  if (activation.length !== 1 || activation[0].conclusion !== 'failure' || retrieval.length !== 1 || retrieval[0].conclusion !== 'success'
    || jobs.jobs.some(job => ![activation[0], retrieval[0]].includes(job) && job.name !== 'BE delivery accepted' && job.conclusion !== 'skipped')) refuse();
  const steps = activation[0].steps;
  if (!Array.isArray(steps) || steps.length > 100 || steps.some(step => step.status !== 'completed')
    || !equal(steps.filter(step => historicalSteps.includes(step.name)).map(step => step.name), historicalSteps)
    || !positive(activation[0].id)) refuse();
  const preflight = steps.findIndex(step => step.name === 'Verify exact OLD history and role prerequisites without writes');
  if (preflight < 0 || steps.filter(step => step.conclusion === 'failure').length !== 1 || steps[preflight].conclusion !== 'failure'
    || !steps.slice(0, preflight).some(step => step.name === 'Reserve the shared durable production exclusion' && step.conclusion === 'success')
    || steps.slice(0, preflight).some(step => step.conclusion !== 'success')) refuse();
  const retained = ['Preserve private receipt modes and record the exact transferable inventory', 'Retain sanitized receipts without secret-bearing subprocess logs'];
  if (retained.some(name => steps.filter(step => step.name === name && step.conclusion === 'success').length !== 1)
    || steps.slice(preflight + 1).some(step => !retained.includes(step.name) && !step.name.startsWith('Post ') && step.name !== 'Complete job' && step.conclusion !== 'skipped')) refuse();
  const listing = object(await io.read(`/actions/runs/${failedPreflightRun}/artifacts?per_page=100`));
  if (!Array.isArray(listing.artifacts) || listing.total_count !== listing.artifacts.length || listing.artifacts.length > 100) refuse();
  const found = listing.artifacts.filter(item => item.name === `be-delivery-receipts-${failedPreflightRun}-1`);
  if (found.length !== 1) refuse();
  const artifact = found[0];
  if (!positive(artifact.id) || artifact.expired !== false || !positive(artifact.size_in_bytes) || artifact.size_in_bytes > 65536
    || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest) || String(object(artifact.workflow_run).id) !== failedPreflightRun
    || artifact.workflow_run.head_sha !== run.head_sha) refuse();
  const zip = await io.download(artifact.id), expected = { runId: oldActivationRun, packetDigest: oldPacketDigest };
  const receipt = io.diagnostics
    ? io.diagnostics.sync('github.archive.preflight', () => validatePreflightReceiptArchive(zip, artifact.digest.slice(7), expected, io.diagnostics))
    : validatePreflightReceiptArchive(zip, artifact.digest.slice(7), expected);
  if (zip.length !== artifact.size_in_bytes || receipt.journal !== entry.id) refuse();
  assertIntent(entry, receipt.packet);
  await verifyArtifact(receipt.packet);
  return { version: 1, kind: 'failed-preflight-no-effects', repository: pin.repository, environment, project: pin.project,
    workflowRun: failedPreflightRun, workflowRevision: run.head_sha, activationRun: oldActivationRun, packetDigest: oldPacketDigest,
    journal: entry.id, job: activation[0].id, artifact: pin.artifactDigest, receiptArtifact: artifact.id,
    receiptZipDigest: artifact.digest.slice(7), receiptArchiveDigest: receipt.archiveDigest, receiptInventoryDigest: receipt.inventoryDigest };
}
export function failedPreflightStatus(proof) {
  return { state: 'error', description: `failed_preflight_no_effects:${hash(canonical(proof))}`, auto_inactive: false,
    log_url: `https://github.com/${pin.repository}/actions/runs/${failedPreflightRun}`, environment_url: 'https://api.lovora.us' };
}
export function manualGithubIo(token, signal, transport = fetch, diagnostics) {
  const read = githubReader(token, signal, transport, diagnostics);
  const bounded = async (response, limit, downloadSignal, route = 'artifact-blob') => {
    const trace = downloadSignal ? diagnostics : undefined;
    trace?.check('github.download-status', response.status === 200, 'unexpected-status',
      { route, actual: response.status, expected: 200, redirected: response.redirected, bodyPresent: Boolean(response.body) });
    if (response.status === 200) {
      trace?.check('github.download-no-redirect', !response.redirected, 'unexpected-redirect', { route, redirected: response.redirected });
      if (!response.redirected) trace?.check('github.download-body-present', Boolean(response.body), 'empty-body', { route, bodyPresent: Boolean(response.body) });
    }
    if (response.status !== 200 || response.redirected || !response.body) { await response.body?.cancel(); refuse(); }
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break; total += value.length;
        if (total > limit) {
          trace?.event('github.download-size', 'failed', 'response-exceeds-bound', { route, actual: total, maximum: limit });
          await reader.cancel(); refuse();
        }
        chunks.push(value);
      }
    } catch (cause) {
      trace?.event('github.download-body', 'failed', downloadSignal.aborted ? 'timeout-or-cancel' : 'body-read-failed',
        { route, bytes: total, aborted: downloadSignal.aborted, callerAborted: signal.aborted }, trace.scope === 'release' ? cause : undefined);
      throw cause;
    } finally { reader.releaseLock(); }
    trace?.event('github.download-body', 'passed', 'bounded-body-read-payload-omitted', { route, bytes: total, maximum: limit });
    return Buffer.concat(chunks, total);
  };
  const options = () => ({ redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  const downloadResponse = async (url, init, route, id) => {
    const metadata = diagnostics ? { route, ...(route.startsWith('artifact-') && String(id) === pin.artifactId ? { actualId: pin.artifactId } : {}) } : undefined;
    diagnostics?.event('github.download-request', 'started', 'download-started', metadata);
    try {
      const response = await transport(url, init);
      diagnostics?.event('github.download-request', 'passed', 'response-received', { ...metadata,
        actual: response.status, redirected: response.redirected, bodyPresent: Boolean(response.body) });
      return response;
    } catch (cause) {
      diagnostics?.event('github.download-transport', 'failed', init.signal.aborted ? 'timeout-or-cancel' : 'transport-error',
        { ...metadata, aborted: init.signal.aborted, callerAborted: signal.aborted }, diagnostics?.scope === 'release' ? cause : undefined);
      throw cause;
    }
  };
  return { read, ...(diagnostics ? { diagnostics } : {}),
    async post(path, body) {
      if (!/^\/deployments(?:\/[1-9][0-9]*\/statuses)?$/.test(path)) refuse();
      const response = await transport(`https://api.github.com/repos/${pin.repository}${path}`, { ...options(), method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' }, body: JSON.stringify(body) });
      if (response.status !== 201 || response.redirected) { await response.body?.cancel(); refuse(); }
      const bytes = await bounded(new Response(response.body, { status: 200 }), 65536);
      return JSON.parse(bytes.toString('utf8'));
    },
    async download(id, maximum = 65536) {
      if (!positive(id) || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 64 * 1024 * 1024) refuse();
      const redirect = await downloadResponse(`https://api.github.com/repos/${pin.repository}/actions/artifacts/${id}/zip`, { ...options(), redirect: 'manual',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } }, 'artifact-download', id);
      const location = redirect.headers.get('location');
      diagnostics?.check('github.download-redirect-status', redirect.status === 302, 'unexpected-status',
        { route: 'artifact-download', actual: redirect.status, expected: 302, redirected: redirect.redirected, locationPresent: Boolean(location) });
      if (redirect.status === 302) diagnostics?.check('github.download-location', Boolean(location), 'missing-location',
        { route: 'artifact-download', locationPresent: Boolean(location) });
      await redirect.body?.cancel();
      if (redirect.status !== 302 || !location) refuse();
      let url;
      try { url = new URL(location); }
      catch (cause) {
        diagnostics?.event('github.download-location', 'failed', 'invalid-location', { route: 'artifact-download' },
          diagnostics?.scope === 'release' ? cause : undefined); throw cause;
      }
      const allowedHost = [ '.blob.core.windows.net', '.actions.githubusercontent.com' ].some(suffix => url.hostname.endsWith(suffix));
      const safeLocation = url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && allowedHost;
      diagnostics?.check('github.download-host', safeLocation, 'unapproved-location', { route: 'artifact-download', allowedHost, safeLocation });
      if (!safeLocation) refuse();
      const blobOptions = options();
      return bounded(await downloadResponse(url.href, blobOptions, 'artifact-blob', id), maximum, blobOptions.signal);
    },
    async downloadReleaseAsset(id) {
      if (!positive(id)) refuse();
      const requestOptions = options(), retained = retainedHistoricalArchive;
      let route = 'release-asset';
      let response = await downloadResponse(`https://api.github.com/repos/${pin.repository}/releases/assets/${id}`,
        { ...requestOptions, redirect: 'manual', headers: { Authorization: `Bearer ${token}`,
          Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2026-03-10' } }, route, id);
      const statusAllowed = [200, 302].includes(response.status) && !response.redirected;
      diagnostics?.check('github.release-status', statusAllowed, 'unexpected-status-or-redirect',
        { route, actual: response.status, redirected: response.redirected, bodyPresent: Boolean(response.body) });
      if (!statusAllowed) { await response.body?.cancel(); refuse(); }
      if (response.status === 302) {
        const location = response.headers.get('location');
        diagnostics?.check('github.download-location', Boolean(location), 'missing-location', { route, locationPresent: Boolean(location) });
        await response.body?.cancel();
        if (!location) refuse();
        let url;
        try { url = new URL(location); }
        catch (cause) {
          diagnostics?.event('github.download-location', 'failed', 'invalid-location', { route },
            diagnostics?.scope === 'release' ? cause : undefined); throw cause;
        }
        const allowedHost = url.hostname === 'release-assets.githubusercontent.com';
        const safeLocation = url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && allowedHost;
        diagnostics?.check('github.download-host', safeLocation, 'unapproved-location', { route, allowedHost, safeLocation });
        if (!safeLocation) refuse();
        route = 'release-blob';
        response = await downloadResponse(url.href, requestOptions, route, id);
      }
      const bytes = await bounded(response, retained.size, requestOptions.signal, route);
      const sizeMatches = bytes.length === retained.size;
      diagnostics?.check('github.release-size', sizeMatches, 'archive-size-mismatch', { route, actual: bytes.length, expected: retained.size });
      if (!sizeMatches) refuse();
      const digestMatches = hash(bytes) === retained.zipDigest;
      diagnostics?.check('github.release-hash', digestMatches, 'archive-digest-mismatch', { route, digestMatches });
      if (!digestMatches) refuse();
      return bytes;
    },
  };
}
export async function reserveManualActivation(bundle, inputs, signal, transport, currentMain) {
  const io = manualGithubIo(inputs.GITHUB_TOKEN, signal, transport);
  if (bundle.context.workflow.run === failedPreflightRun || bundle.packet.runId === oldActivationRun || bundle.context.packetDigest === oldPacketDigest) refuse();
  await currentMain();
  for (let page = 1; ; page++) {
    if (page > 20) refuse();
    const entries = await io.read(`/deployments?task=${encodeURIComponent(task)}&environment=${environment}&per_page=100&page=${page}`);
    if (!Array.isArray(entries) || entries.length > 100) refuse();
    for (const entry of entries) {
      if (!positive(entry.id) || entry.task !== task || entry.environment !== environment || object(entry.payload).project !== pin.project
        || entry.payload.run === bundle.context.workflow.run || entry.payload.activationRun === bundle.packet.runId
        || entry.payload.activationPacket === bundle.context.packetDigest) refuse();
      const statuses = await io.read(`/deployments/${entry.id}/statuses?per_page=100`);
      if (!Array.isArray(statuses) || !statuses.length) refuse();
      if (statuses[0].state === 'success') continue;
      if (statuses.length !== 1 || statuses[0].state !== 'error') refuse();
      const proof = await failedPreflightProof(io, entry, packet => bundle.modules.journal.verifyActivationArtifact(bundle.artifact, packet));
      const expected = failedPreflightStatus(proof);
      if (!positive(statuses[0].id) || statuses[0].description !== expected.description || statuses[0].log_url !== expected.log_url) refuse();
    }
    if (entries.length < 100) break;
  }
  await currentMain(); signal.throwIfAborted();
  const packet = bundle.packet;
  const result = object(await io.post('/deployments', { ref: pin.revision, task, environment, auto_merge: false, required_contexts: [], production_environment: true,
    description: 'Exact tested BE artifact delivery intent', payload: { version: 1, revision: pin.revision, tree: pin.tree, run: bundle.context.workflow.run,
      artifact: pin.artifactDigest, sourceDigest: pin.sourceDigest, migrationDigest: packet.targetDigest, project: pin.project,
      activationPacket: bundle.context.packetDigest, activationRun: packet.runId } }));
  if (!positive(result.id) || result.sha !== pin.revision || result.task !== task || result.environment !== environment) refuse();
  return result.id;
}
