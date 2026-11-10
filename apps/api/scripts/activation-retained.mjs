import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const retainedActivation = Object.freeze({
  repository: 'khuonghuyhieu/esty-admin', workflowPath: '.github/workflows/be-delivery.yml',
  runId: '42404748672', artifactId: '13587251015', checksJobId: '128499919011',
  revision: 'f162c8db8ec149724c0a25537a4a0674bd012035', tree: '181b2c014f9373e4d6cdf055cba01eac11ed5a5e',
  sourceDigest: '73e8f1f5cb7683da2f337b6f3092d6cdcd6dd42ea15a224ce35aa3ea0b77c3e8',
  artifactDigest: '82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2',
  archiveDigest: 'adb37e90248665a095ff9a6c8686fa550e17d6306949ad0366cda58a216bf757',
  zipDigest: 'adf6b726971c34a2086a0d915f09ae91c595fdf6b1e92f95b5c5a939f99f67d2',
  project: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls', scope: 'team_k2Hk4wx5XAb9Mgc6lP5AjVhf', target: 'supabase:eotmpaliqcxxcotrcols',
});
const pin = retainedActivation, hex = /^[a-f0-9]{64}$/, commit = /^[a-f0-9]{40}$/;
const maximumArchive = 64 * 1024 * 1024;
function refuse() { throw new Error('Retained activation identity or prerequisite differs.'); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(); return value; }
function keys(value, expected) { return Object.keys(object(value)).sort().join(',') === [...expected].sort().join(','); }
function exactId(value, expected) { return Number.isSafeInteger(value) && value > 0 && String(value) === expected; }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) refuse();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) refuse();
  return time;
}
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
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
function packetIdentity(raw, digest) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536 || !hex.test(digest ?? '')) refuse();
  const packet = object(JSON.parse(raw));
  if (canonical(packet) !== raw || hash(raw) !== digest || packet.version !== 1 || packet.revision !== pin.revision
    || packet.tree !== pin.tree || packet.sourceDigest !== pin.sourceDigest || packet.artifactDigest !== pin.artifactDigest
    || packet.projectId !== pin.project || packet.scopeId !== pin.scope || packet.target !== pin.target) refuse();
  return packet;
}
export function manualContext(env, event) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== pin.repository || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1'
    || env.GITHUB_WORKFLOW_REF !== `${pin.repository}/${pin.workflowPath}@refs/heads/main`
    || env.BE_DELIVERY_ENVIRONMENT !== 'be-production' || env.BE_DELIVERY_MODE !== 'activation' || env.BE_ACTIVATION_ENABLED !== 'true'
    || !commit.test(env.GITHUB_SHA ?? '') || env.BE_ACTIVATION_WORKFLOW_SHA !== env.GITHUB_SHA
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || env.GITHUB_RUN_ID === pin.runId
    || object(object(event).inputs).mode !== 'activation' || event.inputs.activation_artifact_id !== pin.artifactId) refuse();
  const packet = packetIdentity(env.BE_ACTIVATION_PACKET_JSON, env.BE_ACTIVATION_PACKET_SHA256);
  return { repository: pin.repository, workflow: { revision: env.GITHUB_SHA, run: env.GITHUB_RUN_ID,
    ref: env.GITHUB_REF, workflowRef: env.GITHUB_WORKFLOW_REF }, packet, packetDigest: env.BE_ACTIVATION_PACKET_SHA256 };
}
function contextIdentity(context) {
  if (!keys(context, ['repository', 'workflow', 'packet', 'packetDigest']) || context.repository !== pin.repository
    || !keys(context.workflow, ['revision', 'run', 'ref', 'workflowRef']) || !commit.test(context.workflow.revision)
    || context.workflow.ref !== 'refs/heads/main' || context.workflow.workflowRef !== `${pin.repository}/${pin.workflowPath}@refs/heads/main`
    || !/^[1-9][0-9]*$/.test(context.workflow.run) || !Number.isSafeInteger(Number(context.workflow.run))
    || context.workflow.run === pin.runId) refuse();
  packetIdentity(canonical(context.packet), context.packetDigest);
}
export function loadManualContext(env = process.env) {
  if (!env.GITHUB_EVENT_PATH) refuse();
  return manualContext(env, JSON.parse(plainFile(env.GITHUB_EVENT_PATH, 1024 * 1024).toString('utf8')));
}
export function githubReader(token, signal, transport = fetch) {
  if (!/^[\x21-\x7e]{16,512}$/.test(token ?? '')) refuse();
  return async path => {
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..') || /[\\\u0000-\u0020#]/.test(path)) refuse();
    const response = await transport(`https://api.github.com/repos/${pin.repository}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (response.status !== 200 || response.redirected || !response.body) { await response.body?.cancel(); refuse(); }
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.length; if (total > 8 * 1024 * 1024) { await reader.cancel(); refuse(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
  };
}
function workflowPath(value) { return [pin.workflowPath, `${pin.workflowPath}@main`, `${pin.workflowPath}@refs/heads/main`].includes(value); }
function commitIdentity(value, revision, tree) {
  if (object(value).sha !== revision || !commit.test(object(object(value.commit).tree).sha)
    || (tree !== undefined && value.commit.tree.sha !== tree)) refuse();
  return value.commit.tree.sha;
}
async function retainedMetadata(workflowRevision, read, now) {
  if (!commit.test(workflowRevision ?? '') || !Number.isFinite(now)) refuse();
  const main = await read('/commits/main'), source = await read(`/commits/${pin.revision}`);
  const workflowTree = commitIdentity(main, workflowRevision); commitIdentity(source, pin.revision, pin.tree);
  const run = object(await read(`/actions/runs/${pin.runId}`));
  if (!exactId(run.id, pin.runId) || run.run_attempt !== 1 || run.status !== 'completed' || run.head_sha !== pin.revision
    || run.head_branch !== 'main' || !['push', 'workflow_dispatch'].includes(run.event) || !workflowPath(run.path)
    || object(run.repository).full_name !== pin.repository || object(run.head_repository).full_name !== pin.repository) refuse();
  const jobs = object(await read(`/actions/runs/${pin.runId}/jobs?filter=all&per_page=100`));
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.jobs.length > 100) refuse();
  const checks = jobs.jobs.filter(job => exactId(job.id, pin.checksJobId));
  if (checks.length !== 1 || checks[0].name !== 'BE required checks' || checks[0].status !== 'completed' || checks[0].conclusion !== 'success'
    || !exactId(checks[0].run_id, pin.runId) || checks[0].run_attempt !== 1 || checks[0].head_sha !== pin.revision) refuse();
  const artifact = object(await read(`/actions/artifacts/${pin.artifactId}`)), artifactRun = object(artifact.workflow_run);
  if (!exactId(artifact.id, pin.artifactId) || artifact.name !== `be-tested-${pin.runId}-1` || artifact.expired !== false
    || artifact.digest !== `sha256:${pin.zipDigest}` || !Number.isSafeInteger(artifact.size_in_bytes)
    || artifact.size_in_bytes <= 0 || artifact.size_in_bytes > maximumArchive || timestamp(artifact.expires_at) <= now
    || timestamp(artifact.created_at) > now || !exactId(artifactRun.id, pin.runId)
    || artifactRun.head_sha !== pin.revision || artifactRun.head_branch !== 'main') refuse();
  return { tree: workflowTree, expiresAt: artifact.expires_at };
}
export async function selectRetained(context, read, now = Date.now()) {
  contextIdentity(context);
  const selected = await retainedMetadata(context.workflow.revision, read, now);
  const active = object(await read(`/actions/runs/${context.workflow.run}`));
  if (!exactId(active.id, context.workflow.run) || active.run_attempt !== 1 || active.event !== 'workflow_dispatch'
    || active.status !== 'in_progress' || active.head_sha !== context.workflow.revision || active.head_branch !== 'main'
    || !workflowPath(active.path) || object(active.repository).full_name !== pin.repository
    || object(active.head_repository).full_name !== pin.repository) refuse();
  const receipt = { version: 1, retained: pin, workflow: { ...context.workflow, tree: selected.tree }, packetDigest: context.packetDigest,
    expiresAt: selected.expiresAt, selectedAt: new Date(now).toISOString(), checks: { id: pin.checksJobId, conclusion: 'success' } };
  return validateSelection(receipt, context, now);
}
export function validateSelection(receipt, context, now = Date.now()) {
  contextIdentity(context);
  if (context.repository !== pin.repository || !keys(receipt, ['version', 'retained', 'workflow', 'packetDigest', 'expiresAt', 'selectedAt', 'checks'])
    || receipt.version !== 1 || canonical(receipt.retained) !== canonical(pin)
    || !keys(receipt.workflow, ['revision', 'run', 'ref', 'workflowRef', 'tree']) || !commit.test(receipt.workflow.tree)
    || receipt.workflow.revision !== context.workflow.revision || receipt.workflow.run !== context.workflow.run
    || receipt.workflow.ref !== context.workflow.ref || receipt.workflow.workflowRef !== context.workflow.workflowRef
    || receipt.packetDigest !== context.packetDigest || !Number.isFinite(now)
    || timestamp(receipt.selectedAt) > now || timestamp(receipt.expiresAt) <= now
    || timestamp(receipt.expiresAt) <= timestamp(receipt.selectedAt)
    || canonical(receipt.checks) !== canonical({ id: pin.checksJobId, conclusion: 'success' })) refuse();
  return receipt;
}
export function readSelection(path, expectedHash, context) {
  if (basename(path) !== 'selection.json' || !hex.test(expectedHash ?? '')) refuse();
  const bytes = plainFile(path, 32768);
  if (hash(bytes) !== expectedHash) refuse();
  const receipt = JSON.parse(bytes.toString('utf8'));
  if (canonical(receipt) + '\n' !== bytes.toString('utf8')) refuse();
  return validateSelection(receipt, context);
}
export function verifyRelay(transferDir, expectedHash, context) {
  transferDir = root(transferDir);
  if (canonical(readdirSync(transferDir).sort()) !== canonical(['be-release.tar.gz', 'selection.json'])) refuse();
  const receipt = readSelection(join(transferDir, 'selection.json'), expectedHash, context);
  if (hash(plainFile(join(transferDir, 'be-release.tar.gz'), maximumArchive)) !== pin.archiveDigest) refuse();
  return receipt;
}
export async function verifySelectedBundle(bundleRoot, selection, context) {
  validateSelection(selection, context);
  return { ...await verifiedPacketBundle(bundleRoot, context.packet, context.packetDigest), context, selection };
}
async function verifiedPacketBundle(bundleRoot, requestedPacket, packetDigest) {
  packetIdentity(canonical(requestedPacket), packetDigest); bundleRoot = root(bundleRoot);
  if (canonical(readdirSync(bundleRoot).sort()) !== canonical(['artifact', 'receipt.json', 'runner'])) refuse();
  const artifactRoot = root(join(bundleRoot, 'artifact')), provenanceBytes = plainFile(join(artifactRoot, 'provenance.json'), 4 * 1024 * 1024);
  if (hash(provenanceBytes) !== pin.artifactDigest) refuse();
  const provenance = JSON.parse(provenanceBytes.toString('utf8'));
  const modulePath = 'operator/apps/api/build/scripts/artifact.js', record = provenance.files.find(file => file.path === modulePath);
  if (!record || hash(plainFile(join(artifactRoot, modulePath), 1024 * 1024)) !== record.sha256) refuse();
  const artifactModule = await import(pathToFileURL(join(artifactRoot, modulePath)).href);
  const artifact = artifactModule.verifyArtifact(artifactRoot, pin.artifactDigest, {
    revision: pin.revision, repository: `https://github.com/${pin.repository}`, migrationDigest: requestedPacket.targetDigest, release: true,
  });
  if (artifact.manifest.source.tree !== pin.tree || artifact.manifest.source.digest !== pin.sourceDigest
    || artifact.manifest.build.node !== '24.22.1' || artifact.manifest.build.platform !== 'linux' || artifact.manifest.build.arch !== 'x64') refuse();
  const transfer = JSON.parse(plainFile(join(bundleRoot, 'receipt.json'), 4 * 1024 * 1024).toString('utf8'));
  if (transfer.version !== 1 || transfer.revision !== pin.revision || transfer.tree !== pin.tree || transfer.artifact !== pin.artifactDigest
    || transfer.source !== pin.sourceDigest || transfer.nativeHttpDatabase !== 'passed' || transfer.functional !== 'passed'
    || transfer.mode !== 'release' || transfer.node !== '24.22.1') refuse();
  const operator = { files: artifact.manifest.files.filter(file => file.path.startsWith('operator/')).map(file => ({ ...file, path: file.path.slice(9) })),
    directories: artifact.manifest.directories.filter(dir => dir.path.startsWith('operator/')).map(dir => ({ ...dir, path: dir.path.slice(9) })) };
  if (canonical(transfer.runner) !== canonical(operator) || canonical(artifactModule.inventory(root(join(bundleRoot, 'runner')))) !== canonical(operator)) refuse();
  const load = name => import(pathToFileURL(join(artifactRoot, `operator/apps/api/build/scripts/${name}`)).href);
  const journal = await load('activation-journal.js');
  const packet = journal.validateActivationPacket(requestedPacket, packetDigest); journal.verifyActivationArtifact(artifact, packet);
  return { artifact, packet, modules: { artifact: artifactModule, journal,
    activation: await load('activation.js'), inputs: await load('activation-inputs.js'), provider: await load('ci-provider.js'),
    delivery: await load('ci-delivery.js'), privateFiles: await load('private-files.mjs'), releaseJournal: await load('release-journal.js') } };
}
export async function verifyWorkflowHead(selection, read) {
  commitIdentity(await read('/commits/main'), selection.workflow.revision, selection.workflow.tree);
  commitIdentity(await read(`/commits/${pin.revision}`), pin.revision, pin.tree);
}
async function main(args, env) {
  const [action, path, extra, digest] = args;
  if (action === 'preflight') {
    if (args.length !== 5 || !commit.test(digest ?? '')) refuse();
    const packet = packetIdentity(plainFile(path, 65536).toString('utf8').trimEnd(), extra);
    const read = async endpoint => JSON.parse(execFileSync('gh', ['api', `repos/${pin.repository}${endpoint}`],
      { encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
    await retainedMetadata(digest, read, Date.now());
    await verifiedPacketBundle(args[4], packet, extra);
    console.info('RETAINED_ACTIVATION_PREFLIGHT_VERIFIED: selection only; no dispatch or activation approval.'); return;
  }
  const context = loadManualContext(env), signal = AbortSignal.timeout(120000);
  if (action === 'select' && args.length === 2) {
    const selection = await selectRetained(context, githubReader(env.GITHUB_TOKEN, signal));
    mkdirSync(path, { mode: 0o700 }); root(path);
    const bytes = canonical(selection) + '\n';
    writeFileSync(join(path, 'selection.json'), bytes, { flag: 'wx', mode: 0o600 });
    if (!env.GITHUB_OUTPUT) refuse();
    appendFileSync(env.GITHUB_OUTPUT, `artifact_id=${pin.artifactId}\nrun_id=${pin.runId}\narchive_sha=${pin.archiveDigest}\nselection_sha=${hash(bytes)}\n`);
  } else if (action === 'verify-relay' && args.length === 3) verifyRelay(path, extra, context);
  else if (action === 'verify-bundle' && args.length === 4) await verifySelectedBundle(path, readSelection(extra, digest, context), context);
  else refuse();
  console.info('RETAINED_ACTIVATION_VERIFIED');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2), process.env); }
  catch { console.error('RETAINED_ACTIVATION_REFUSED: no transfer or phase is approved.'); process.exitCode = 1; }
}
