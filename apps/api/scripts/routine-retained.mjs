import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync,
  mkdirSync, writeFileSync, chmodSync, appendFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { canonical, githubReader } from './activation-retained.mjs';

const repository = 'khuonghuyhieu/esty-admin', workflow = '.github/workflows/be-delivery.yml';
const hex = /^[a-f0-9]{64}$/, revision = /^[a-f0-9]{40}$/, id = /^[1-9][0-9]{0,15}$/;
const modes = ['current-schema-only', 'versioned-migration', 'etsy-strict-cutover'];
const maximumArchive = 64 * 1024 * 1024, maximumExpanded = 250 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
function refuse() { throw new Error('Routine retained release refused; inspect approved identities and retained evidence.'); }
function object(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (expected && canonical(Object.keys(value).sort()) !== canonical([...expected].sort()))) refuse();
  return value;
}
function exactId(actual, expected) { return Number.isSafeInteger(actual) && actual > 0 && String(actual) === expected; }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) refuse();
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) refuse();
  return result;
}
function plainFile(path, maximum) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid() || (before.mode & 0o022)
      || before.size <= 0 || before.size > maximum) refuse();
    const bytes = readFileSync(fd), after = fstatSync(fd), named = lstatSync(path);
    if (bytes.length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs || named.isSymbolicLink() || named.ino !== after.ino || named.dev !== after.dev) refuse();
    return bytes;
  } finally { closeSync(fd); }
}
function root(path) {
  const absolute = resolve(path), info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(absolute) !== absolute || info.uid !== process.getuid() || (info.mode & 0o022)) refuse();
  return absolute;
}
function contextShape(value) {
  const context = object(value, ['version', 'controller', 'producerRun', 'artifactId', 'mode', 'approvalDigest', 'configDigest', 'schemaDigest', 'target', 'packetDigest']);
  const controller = object(context.controller, ['revision', 'run']);
  if (context.version !== 1 || !revision.test(controller.revision ?? '') || !id.test(controller.run ?? '')
    || !id.test(context.producerRun ?? '') || !id.test(context.artifactId ?? '') || context.producerRun === controller.run
    || !modes.includes(context.mode) || ![context.approvalDigest, context.configDigest, context.schemaDigest].every(value => typeof value === 'string' && hex.test(value))
    || typeof context.target !== 'string' || !/^supabase:[a-z]{20}$/.test(context.target)
    || (context.mode === 'current-schema-only' ? context.packetDigest !== null : !hex.test(context.packetDigest ?? ''))) refuse();
  return context;
}
export function routineContext(env, event) {
  const inputs = object(object(event).inputs);
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1'
    || env.GITHUB_WORKFLOW_REF !== `${repository}/${workflow}@refs/heads/main`
    || env.BE_DELIVERY_ENABLED !== 'true' || env.BE_DELIVERY_ENVIRONMENT !== 'be-production'
    || env.BE_RELEASE_CONTROLLER_SHA !== env.GITHUB_SHA || env.BE_DELIVERY_MODE !== inputs.mode
    || (inputs.activation_artifact_id !== undefined && inputs.activation_artifact_id !== '')) refuse();
  return contextShape({ version: 1, controller: { revision: env.GITHUB_SHA, run: env.GITHUB_RUN_ID },
    producerRun: inputs.release_run_id, artifactId: inputs.release_artifact_id, mode: inputs.mode,
    approvalDigest: env.BE_RELEASE_APPROVAL_SHA256, configDigest: env.BE_DELIVERY_CONFIG_SHA256,
    schemaDigest: env.BE_DELIVERY_SCHEMA_SHA256, target: env.BE_RELEASE_TARGET,
    packetDigest: inputs.mode === 'current-schema-only' ? null : env.BE_MIGRATION_PACKET_SHA256 });
}
export function loadRoutineContext(env) {
  return routineContext(env, JSON.parse(plainFile(env.GITHUB_EVENT_PATH, 1024 * 1024).toString('utf8')));
}
function runIdentity(value, run, sha, consumer) {
  const data = object(value);
  if (!exactId(data.id, run) || data.run_attempt !== 1 || data.head_sha !== sha || data.head_branch !== 'main'
    || ![workflow, `${workflow}@main`, `${workflow}@refs/heads/main`].includes(data.path)
    || object(data.repository).full_name !== repository || object(data.head_repository).full_name !== repository
    || !Number.isSafeInteger(data.repository.id) || data.repository.id <= 0 || data.head_repository.id !== data.repository.id
    || (consumer ? data.event !== 'workflow_dispatch' || data.status !== 'in_progress' || data.conclusion !== null
      : !['push', 'workflow_dispatch'].includes(data.event) || data.status !== 'completed' || data.conclusion !== 'success')) refuse();
  return data;
}
export async function selectRoutine(context, read, now = Date.now()) {
  contextShape(context);
  const main = object(await read('/commits/main'));
  if (main.sha !== context.controller.revision || !revision.test(object(object(main.commit).tree).sha ?? '')) refuse();
  const tree = main.commit.tree.sha;
  runIdentity(await read(`/actions/runs/${context.controller.run}`), context.controller.run, context.controller.revision, true);
  const producer = runIdentity(await read(`/actions/runs/${context.producerRun}`), context.producerRun, context.controller.revision, false);
  const jobs = object(await read(`/actions/runs/${context.producerRun}/jobs?filter=all&per_page=100`));
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.jobs.length > 100) refuse();
  const checks = jobs.jobs.filter(job => job.name === 'BE required checks');
  if (checks.length !== 1 || checks[0].status !== 'completed' || checks[0].conclusion !== 'success'
    || !Number.isSafeInteger(checks[0].id) || checks[0].id <= 0 || !exactId(checks[0].run_id, context.producerRun)
    || checks[0].run_attempt !== 1 || checks[0].head_sha !== context.controller.revision) refuse();
  const artifact = object(await read(`/actions/artifacts/${context.artifactId}`)), artifactRun = object(artifact.workflow_run);
  if (!exactId(artifact.id, context.artifactId) || artifact.name !== `be-tested-${context.producerRun}-1` || artifact.expired !== false
    || typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)
    || !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0 || artifact.size_in_bytes > maximumArchive
    || timestamp(artifact.expires_at) <= now || timestamp(artifact.created_at) > now
    || timestamp(artifact.created_at) < timestamp(checks[0].started_at) || timestamp(artifact.created_at) > timestamp(checks[0].completed_at)
    || !exactId(artifactRun.id, context.producerRun) || artifactRun.head_sha !== context.controller.revision || artifactRun.head_branch !== 'main'
    || artifactRun.repository_id !== producer.repository.id || artifactRun.head_repository_id !== producer.head_repository.id) refuse();
  return validateRoutineSelection({ version: 1, context, controllerTree: tree,
    producer: { revision: producer.head_sha, tree, run: context.producerRun }, checksJobId: String(checks[0].id),
    artifact: { id: context.artifactId, zipDigest: artifact.digest.slice(7), expiresAt: artifact.expires_at }, selectedAt: new Date(now).toISOString() }, context, now);
}
export function validateRoutineSelection(value, context, now = Date.now()) {
  contextShape(context);
  const selection = object(value, ['version', 'context', 'controllerTree', 'producer', 'checksJobId', 'artifact', 'selectedAt']);
  object(selection.producer, ['revision', 'tree', 'run']); object(selection.artifact, ['id', 'zipDigest', 'expiresAt']);
  if (selection.version !== 1 || canonical(selection.context) !== canonical(context) || !revision.test(selection.controllerTree ?? '')
    || selection.producer.revision !== context.controller.revision || selection.producer.tree !== selection.controllerTree
    || selection.producer.run !== context.producerRun || !id.test(selection.checksJobId ?? '') || selection.artifact.id !== context.artifactId
    || !hex.test(selection.artifact.zipDigest ?? '') || !Number.isFinite(now) || timestamp(selection.selectedAt) > now
    || timestamp(selection.artifact.expiresAt) <= now || timestamp(selection.artifact.expiresAt) <= timestamp(selection.selectedAt)) refuse();
  return JSON.parse(canonical(selection));
}
export async function confirmRoutineSelection(selection, context, read) {
  validateRoutineSelection(selection, context);
  const fresh = await selectRoutine(context, read);
  if (canonical({ ...fresh, selectedAt: selection.selectedAt }) !== canonical(selection)) refuse();
}
export function readRoutineSelection(directory, digest, context) {
  directory = root(directory);
  const bytes = plainFile(join(directory, 'selection.json'), 65536);
  if (!hex.test(digest ?? '') || hash(bytes) !== digest) refuse();
  const selection = JSON.parse(bytes.toString('utf8'));
  if (canonical(selection) + '\n' !== bytes.toString('utf8')) refuse();
  return validateRoutineSelection(selection, context);
}
export function readRoutineRequest(directory, digest) {
  const bytes = plainFile(join(root(directory), 'request.json'), 65536);
  if (!hex.test(digest ?? '') || hash(bytes) !== digest) refuse();
  const request = JSON.parse(bytes.toString('utf8'));
  if (canonical(request) + '\n' !== bytes.toString('utf8')) refuse();
  return request;
}
export function routineApproval(value, digest, selection) {
  const approval = object(value, ['version', 'mode', 'producer', 'artifactDigest', 'sourceDigest', 'archiveDigest', 'operatorDigest', 'schemaDigest']);
  if (!hex.test(digest ?? '') || hash(canonical(approval) + '\n') !== digest || approval.version !== 1 || approval.mode !== 'release'
    || canonical(approval.producer) !== canonical(selection.producer)
    || ![approval.artifactDigest, approval.sourceDigest, approval.archiveDigest, approval.operatorDigest, approval.schemaDigest]
      .every(value => typeof value === 'string' && hex.test(value)) || approval.schemaDigest !== selection.context.schemaDigest) refuse();
  return JSON.parse(canonical(approval));
}
export function verifyRoutineTransfer(directory, selection, context, requireRequest = false) {
  validateRoutineSelection(selection, context); directory = root(directory);
  const expected = ['be-release-approval.json', 'be-release.tar.gz', 'selection.json', ...(requireRequest ? ['request.json'] : [])].sort();
  if (canonical(readdirSync(directory).sort()) !== canonical(expected)) refuse();
  const bytes = plainFile(join(directory, 'be-release-approval.json'), 65536);
  if (hash(bytes) !== context.approvalDigest) refuse();
  const approval = routineApproval(JSON.parse(bytes.toString('utf8')), context.approvalDigest, selection);
  if (canonical(approval) + '\n' !== bytes.toString('utf8')) refuse();
  const archive = plainFile(join(directory, 'be-release.tar.gz'), maximumArchive);
  if (hash(archive) !== approval.archiveDigest) refuse();
  return { approval, archive };
}
// The published checkout uses Node24's native TS stripping for this builtin-only verifier.
// A sealed operator uses its compiled sibling. Never import verifier code from an unverified archive.
async function artifactModule() {
  return import(new URL(basename(dirname(dirname(fileURLToPath(import.meta.url)))) === 'build' ? './artifact.js' : './artifact.ts', import.meta.url).href);
}
export async function extractRoutineBundle(compressed, digest, destination) {
  if (!Buffer.isBuffer(compressed) || compressed.length > maximumArchive || !hex.test(digest ?? '') || hash(compressed) !== digest) refuse();
  const { safePath } = await artifactModule(), bytes = gunzipSync(compressed, { maxOutputLength: maximumExpanded });
  const text = buffer => { const end = buffer.indexOf(0), value = buffer.subarray(0, end < 0 ? buffer.length : end).toString('utf8'); if (value.includes('\ufffd')) refuse(); return value; };
  const octal = buffer => { const value = text(buffer).trim(); if (!/^[0-7]+$/.test(value)) refuse(); const n = Number.parseInt(value, 8); if (!Number.isSafeInteger(n)) refuse(); return n; };
  const entries = [], seen = new Set(); let offset = 0, attributes, terminated = false;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512); offset += 512;
    if (header.every(byte => byte === 0)) { if (attributes || bytes.length - offset < 512 || !bytes.subarray(offset).every(byte => byte === 0)) refuse(); terminated = true; break; }
    let checksum = 0; for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== octal(header.subarray(148, 156))) refuse();
    const type = header[156], size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
    if (size > 32 * 1024 * 1024 || offset + size > bytes.length || mode > 0o777 || (mode & 0o022)) refuse();
    const content = bytes.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512;
    if (offset > bytes.length) refuse();
    if (type === 120) {
      if (attributes || size > 16384) refuse(); attributes = {}; let cursor = 0;
      while (cursor < content.length) {
        const space = content.indexOf(32, cursor), length = content.subarray(cursor, space).toString();
        if (space < 0 || !/^[1-9][0-9]{0,5}$/.test(length)) refuse();
        const end = cursor + Number(length), entry = content.subarray(space + 1, end - 1).toString('utf8'), separator = entry.indexOf('=');
        if (end > content.length || end <= space + 2 || content[end - 1] !== 10 || separator < 1 || entry.includes('\ufffd')) refuse();
        const key = entry.slice(0, separator);
        // Timestamp/owner metadata is recognized but never applied; paths and sizes are checked below.
        if (!['path', 'size', 'mtime', 'atime', 'ctime', 'LIBARCHIVE.creationtime', 'uid', 'gid', 'uname', 'gname'].includes(key)
          || Object.hasOwn(attributes, key)) refuse();
        attributes[key] = entry.slice(separator + 1); cursor = end;
      }
      continue;
    }
    if (![0, 48, 53].includes(type)) refuse();
    let path = attributes?.path ?? [text(header.subarray(345, 500)), text(header.subarray(0, 100))].filter(Boolean).join('/');
    if (attributes?.size !== undefined && attributes.size !== String(size)) refuse(); attributes = undefined;
    if (type === 53 && path.endsWith('/')) path = path.slice(0, -1);
    safePath(path);
    if (!['artifact', 'runner', 'receipt.json'].includes(path.split('/')[0]) || seen.has(path.toLowerCase()) || seen.size >= 30000
      || (type === 53 && size) || (path === 'receipt.json' && type === 53)
      || (['artifact', 'runner'].includes(path) && type !== 53)) refuse();
    seen.add(path.toLowerCase()); entries.push({ path, mode, directory: type === 53, content });
  }
  if (!terminated || !entries.some(entry => entry.path === 'receipt.json')) refuse();
  const directories = new Set(entries.filter(entry => entry.directory).map(entry => entry.path));
  if (!directories.has('artifact') || !directories.has('runner')) refuse();
  for (const entry of entries) { let parent = dirname(entry.path); while (parent !== '.') { if (!directories.has(parent)) refuse(); parent = dirname(parent); } }
  // Parse the whole archive before the first filesystem effect; create only a new private root.
  destination = resolve(destination); root(dirname(destination)); mkdirSync(destination, { mode: 0o700 });
  for (const entry of entries.filter(entry => entry.directory).sort((a, b) => a.path.length - b.path.length)) mkdirSync(join(destination, entry.path), { mode: 0o700 });
  for (const entry of entries.filter(entry => !entry.directory)) writeFileSync(join(destination, entry.path), entry.content, { flag: 'wx', mode: entry.mode });
  for (const entry of entries.filter(entry => entry.directory).sort((a, b) => b.path.length - a.path.length)) chmodSync(join(destination, entry.path), entry.mode);
  return destination;
}
export async function verifyRoutineBundle(bundleRoot, approval, selection, context, controllerRoot) {
  validateRoutineSelection(selection, context); routineApproval(approval, context.approvalDigest, selection);
  bundleRoot = root(bundleRoot);
  if (canonical(readdirSync(bundleRoot).sort()) !== canonical(['artifact', 'receipt.json', 'runner'])) refuse();
  const tools = await artifactModule();
  const artifact = tools.verifyArtifact(join(bundleRoot, 'artifact'), approval.artifactDigest, { revision: selection.producer.revision,
    repository: `https://github.com/${repository}`, migrationDigest: context.schemaDigest, release: true });
  if (artifact.manifest.source.tree !== selection.producer.tree || artifact.manifest.source.digest !== approval.sourceDigest) refuse();
  if (controllerRoot !== undefined) tools.assertSourceFiles(root(controllerRoot), artifact.manifest.source);
  const operator = { files: artifact.manifest.files.filter(file => file.path.startsWith('operator/')).map(file => ({ ...file, path: file.path.slice(9) })),
    directories: artifact.manifest.directories.filter(entry => entry.path.startsWith('operator/')).map(entry => ({ ...entry, path: entry.path.slice(9) })) };
  if (hash(canonical(operator)) !== approval.operatorDigest || canonical(tools.inventory(root(join(bundleRoot, 'runner')))) !== canonical(operator)) refuse();
  const receipt = JSON.parse(plainFile(join(bundleRoot, 'receipt.json'), 4 * 1024 * 1024).toString('utf8'));
  object(receipt, ['version', 'revision', 'tree', 'artifact', 'source', 'nativeHttpDatabase', 'functional', 'mode', 'node', 'runner']);
  if (receipt.version !== 1 || receipt.revision !== selection.producer.revision || receipt.tree !== selection.producer.tree
    || receipt.artifact !== approval.artifactDigest || receipt.source !== approval.sourceDigest || receipt.nativeHttpDatabase !== 'passed'
    || receipt.functional !== 'passed' || receipt.mode !== 'release' || receipt.node !== '24.22.1' || canonical(receipt.runner) !== canonical(operator)) refuse();
  return artifact;
}
export function routineFailureResult(stage = 'request', category = 'invalid-input') {
  if (!['request', 'artifact', 'receipt'].includes(stage)
    || !['invalid-input', 'unauthorized-context', 'missing-prerequisite', 'identity-mismatch', 'transport', 'timeout',
      'validation', 'evidence-persistence'].includes(category)) throw new Error('Invalid diagnostic boundary.');
  return { version: 1, request: null, status: category === 'evidence-persistence' ? 'unknown' : 'refused', stage, category,
    nextAction: category === 'evidence-persistence' ? 'inspect-retained-evidence'
      : stage === 'artifact' ? 'select-approved-artifact' : 'inspect-prerequisite',
    effects: { create: 'not-started', migration: 'not-started', promotion: 'not-started' },
    deploymentId: null, migration: null, receiptDigest: null, proof: null,
    evidence: category === 'evidence-persistence' ? 'unconfirmed' : 'confirmed' };
}
// Callers supply a validated L0 result or the fixed no-request refusal above.
export function emitRoutineResult(value, env = process.env) {
  let result = value;
  try {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT,
      `accepted=${result.status === 'accepted'}\nrelease_status=${result.status}\nrelease_stage=${result.stage}\n`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,
      `BE release: ${result.status}; stage=${result.stage}; category=${result.category ?? 'none'}; `
      + `create=${result.effects.create}; migration=${result.effects.migration}; promotion=${result.effects.promotion}; `
      + `deployment=${result.deploymentId ?? 'unknown'}; evidence=${result.evidence}; `
      + `receipt=${result.receiptDigest ?? 'unavailable'}; next=${result.nextAction}.\n`);
  } catch {
    result = { ...result, status: 'unknown', evidence: 'unconfirmed', proof: null,
      category: result.category ?? 'evidence-persistence', nextAction: 'inspect-retained-evidence' };
    try {
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `accepted=false\nrelease_status=unknown\nrelease_stage=${result.stage}\n`);
    } catch { /* The step fails even when its output channel is unavailable. */ }
    process.exitCode = 1;
  }
  console.info(JSON.stringify(result));
  return result;
}
let entryStage = 'request', entryCategory = 'unauthorized-context';
async function main(args, env) {
  const [action, transfer, bundle, controller] = args, context = loadRoutineContext(env);
  entryStage = 'artifact'; entryCategory = 'identity-mismatch';
  if (action === 'select' && args.length === 2) {
    const selection = await selectRoutine(context, githubReader(env.GITHUB_TOKEN, AbortSignal.timeout(120000)));
    mkdirSync(transfer, { mode: 0o700 }); root(transfer);
    const bytes = canonical(selection) + '\n'; writeFileSync(join(transfer, 'selection.json'), bytes, { flag: 'wx', mode: 0o600 });
    if (!env.GITHUB_OUTPUT) refuse();
    appendFileSync(env.GITHUB_OUTPUT, `artifact_id=${context.artifactId}\nrun_id=${context.producerRun}\nselection_sha=${hash(bytes)}\n`);
  } else if (['consume', 'consume-relay'].includes(action) && args.length === 4) {
    const selection = readRoutineSelection(transfer, env.BE_RELEASE_SELECTION_SHA256, context);
    const { approval, archive } = verifyRoutineTransfer(transfer, selection, context, action === 'consume-relay');
    await extractRoutineBundle(archive, approval.archiveDigest, bundle);
    const artifact = await verifyRoutineBundle(bundle, approval, selection, context, controller);
    // Import only after the independently approved archive, full inventory and controller source matched.
    const { approvedRoutineRequest, validateReleaseRequest } = await import(pathToFileURL(join(bundle, 'runner/apps/api/build/scripts/ci-delivery.js')).href);
    if (context.packetDigest !== null && (typeof env.BE_MIGRATION_PACKET_JSON !== 'string' || Buffer.byteLength(env.BE_MIGRATION_PACKET_JSON) > 65536)) refuse();
    const request = await approvedRoutineRequest(artifact, selection, approval, context,
      context.packetDigest === null ? undefined : JSON.parse(env.BE_MIGRATION_PACKET_JSON));
    const bytes = canonical(request) + '\n';
    if (action === 'consume-relay') {
      validateReleaseRequest(readRoutineRequest(transfer, env.BE_RELEASE_REQUEST_SHA256), { version: 1, requestDigest: hash(canonical(request)) });
    } else {
      writeFileSync(join(transfer, 'request.json'), bytes, { flag: 'wx', mode: 0o600 });
      if (!env.GITHUB_OUTPUT) refuse();
      appendFileSync(env.GITHUB_OUTPUT, `request_sha=${hash(bytes)}\n`);
    }
  } else refuse();
  console.info(JSON.stringify({ version: 1, event: 'phase-confirmed', phase: 'retained-selection', releaseAccepted: false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2), process.env); }
  catch { emitRoutineResult(routineFailureResult(entryStage, entryCategory)); process.exitCode = 1; }
}
