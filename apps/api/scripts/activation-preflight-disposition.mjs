import { createHash } from 'node:crypto';
import { crc32, gunzipSync, inflateRawSync } from 'node:zlib';
import { canonical, githubReader, retainedActivation } from './activation-retained.mjs';

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
function zipMembers(bytes, approved) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 65536 || hash(bytes) !== approved) refuse();
  const end = bytes.lastIndexOf(Buffer.from('504b0506', 'hex'));
  if (end < 0 || end + 22 > bytes.length || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
    || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== 3
    || bytes.readUInt16LE(end + 10) !== 3) refuse();
  let cursor = bytes.readUInt32LE(end + 16);
  if (cursor + bytes.readUInt32LE(end + 12) !== end) refuse();
  const names = ['be-delivery-receipts.tar.gz', 'be-delivery-receipts.inventory-sha256', 'be-delivery-receipts.archive-sha256'];
  const files = new Map();
  for (let index = 0; index < 3; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) refuse();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42), mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    if (cursor + 46 + length + extra + comment > end || flags & 1 || ![0, 8].includes(method) || size > 65536
      || (mode & 0o170000) && (mode & 0o170000) !== 0o100000 || bytes.readUInt16LE(cursor + 34)) refuse();
    const name = bytes.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
    if (!names.includes(name) || files.has(name) || local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50
      || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) refuse();
    const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    const start = local + 30 + localNameLength + localExtra;
    if (bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name || start + compressed > cursor) refuse();
    const payload = bytes.subarray(start, start + compressed);
    const decoded = method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: 65536 });
    if (decoded.length !== size || crc32(decoded) !== checksum) refuse();
    files.set(name, decoded); cursor += 46 + length + extra + comment;
  }
  if (cursor !== end) refuse();
  return files;
}
export function validatePreflightReceiptArchive(zip, approvedZip, expected) {
  const { runId, packetDigest } = expected;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId) || !hex.test(packetDigest)) refuse();
  const members = zipMembers(zip, approvedZip), compressed = members.get('be-delivery-receipts.tar.gz');
  const archiveLine = members.get('be-delivery-receipts.archive-sha256').toString('utf8');
  const inventoryLine = members.get('be-delivery-receipts.inventory-sha256').toString('utf8');
  if (!/^[a-f0-9]{64}  [^\r\n]*\/be-delivery-receipts\.tar\.gz\n$/.test(archiveLine)
    || archiveLine.slice(0, 64) !== hash(compressed) || !/^[a-f0-9]{64}\n$/.test(inventoryLine)) refuse();
  const tar = gunzipSync(compressed, { maxOutputLength: 65536 });
  const base = `activation/${runId}`, expectedFiles = [`${base}/lock.json`, `${base}/packet.json`, `${base}/reservation.json`, 'operator.lock', 'packet-input.json'];
  const expectedDirectories = ['', 'activation', base], files = new Map(), directories = new Map();
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
      if (!expectedDirectories.includes(relative) || directories.has(relative) || mode !== 0o700 || size !== 0) refuse();
      directories.set(relative, { path: relative, mode });
    } else {
      if (![0, 48].includes(type) || !expectedFiles.includes(relative) || files.has(relative) || mode !== 0o600) refuse();
      files.set(relative, { bytes: tar.subarray(cursor + 512, cursor + 512 + size), mode });
    }
    cursor += 512 + Math.ceil(size / 512) * 512;
  }
  if (files.size !== 5 || directories.size !== 3 || tar.length - cursor < 1024 || tar.subarray(cursor).some(byte => byte !== 0)) refuse();
  const inventory = { files: [...files].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([path, file]) => ({ path, mode: file.mode, size: file.bytes.length,
    sha256: hash(file.bytes), sha1: createHash('sha1').update(file.bytes).digest('hex') })), directories: [...directories.values()]
    .filter(directory => directory.path !== '').sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  if (hash(canonical(inventory)) !== inventoryLine.trim()) refuse();
  const json = name => JSON.parse(files.get(name).bytes.toString('utf8'));
  const packet = json(`${base}/packet.json`), lock = json('operator.lock'), binding = json(`${base}/lock.json`), reservation = json(`${base}/reservation.json`);
  if (hash(canonical(packet)) !== packetDigest || packet.runId !== runId || !equal(json('packet-input.json'), packet)
    || !equal(lock, { version: 1, kind: 'activation', runId, packetDigest })
    || !exact(binding, ['packetDigest', 'identity']) || binding.packetDigest !== packetDigest
    || !exact(binding.identity, ['dev', 'ino', 'size', 'mtime_ns', 'ctime_ns', 'sha256'])
    || !['dev', 'ino', 'mtime_ns', 'ctime_ns'].every(key => /^\d{1,30}$/.test(binding.identity[key]))
    || binding.identity.sha256 !== hash(files.get('operator.lock').bytes) || binding.identity.size !== files.get('operator.lock').bytes.length
    || !exact(reservation, ['packetDigest', 'journal']) || reservation.packetDigest !== packetDigest || !positive(reservation.journal)) refuse();
  return { packet, journal: reservation.journal, archiveDigest: hash(compressed), inventoryDigest: inventoryLine.trim() };
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
  const zip = await io.download(artifact.id), receipt = validatePreflightReceiptArchive(zip, artifact.digest.slice(7),
    { runId: oldActivationRun, packetDigest: oldPacketDigest });
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
export function manualGithubIo(token, signal, transport = fetch) {
  const read = githubReader(token, signal, transport);
  const bounded = async (response, limit) => {
    if (response.status !== 200 || response.redirected || !response.body) { await response.body?.cancel(); refuse(); }
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > limit) { await reader.cancel(); refuse(); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    return Buffer.concat(chunks, total);
  };
  const options = () => ({ redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  return { read,
    async post(path, body) {
      if (!/^\/deployments(?:\/[1-9][0-9]*\/statuses)?$/.test(path)) refuse();
      const response = await transport(`https://api.github.com/repos/${pin.repository}${path}`, { ...options(), method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' }, body: JSON.stringify(body) });
      if (response.status !== 201 || response.redirected) { await response.body?.cancel(); refuse(); }
      const bytes = await bounded(new Response(response.body, { status: 200 }), 65536);
      return JSON.parse(bytes.toString('utf8'));
    },
    async download(id) {
      if (!positive(id)) refuse();
      const redirect = await transport(`https://api.github.com/repos/${pin.repository}/actions/artifacts/${id}/zip`, { ...options(), redirect: 'manual',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } });
      const location = redirect.headers.get('location'); await redirect.body?.cancel();
      if (redirect.status !== 302 || !location) refuse();
      const url = new URL(location);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
        || ![ '.blob.core.windows.net', '.actions.githubusercontent.com' ].some(suffix => url.hostname.endsWith(suffix))) refuse();
      return bounded(await transport(url.href, options()), 65536);
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
