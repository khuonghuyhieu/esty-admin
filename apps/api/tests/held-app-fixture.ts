import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { canonical, sha256 } from '../scripts/artifact.js';
import { heldAppPolicy, heldBindingVariable, heldPinPath, heldProbeSources, heldD2Sources, heldD2 } from '../scripts/activation-held-contract.mjs';
import type { HeldAppTarget, HeldProbeIo } from '../scripts/activation-held-proof.js';
import { receiptZip } from './artifact-fixture.js';
import { heldCorrection, validateHeldCorrectionCapability, heldCorrectionCapability } from '../scripts/activation-held-correction-contract.mjs';
import { correctionReceiptSuffixes, heldCorrectionEvidencePath, readActivationJournal, readHeldCorrectionOriginal,
  validateActivationPacket, heldPostRepair, validateHeldDeploymentCapability } from '../scripts/activation-journal.js';
import { bridgeRecovery } from '../scripts/activation-candidate-recovery.js';
import { retainedUnknown } from '../scripts/activation-schema-diagnostic.js';
import type { HeldCorrectionContext } from '../scripts/activation-held-correction.js';
import type { VerifiedArtifact } from '../scripts/artifact.js';
import { heldDatabaseRepair, validateHeldDatabaseRepairCapability, verifyHeldDatabaseRepairBasis } from '../scripts/activation-held-database-repair.js';
import { heldRetainedCandidate } from '../scripts/activation-held-proof.js';
import type { HeldDatabaseRepairContext } from '../scripts/activation-held-database-repair.js';
import historicalProvenance from './fixtures/historical-release-provenance.json' with { type: 'json' };
import { historicalReleaseEvidence } from '../scripts/historical-release-evidence.js';
import { retainedActivation, retainedHistoricalArchive } from '../scripts/activation-retained.mjs';

// Public synthetic GitHub responses; no token, account access or candidate HTTP.
export function heldProofFixture(target: HeldAppTarget = { ...heldAppPolicy, candidate: 'dpl_SyntheticHeldApp',
  origin: 'https://synthetic-held-app.vercel.app', configDigest: sha256('app'), createClaimDigest: sha256('claim'),
  createAckDigest: sha256('ack'), heldReceiptDigest: sha256('pending') }, sourceBytes?: Record<string, Buffer>, acceptanceGate?: object,
  revision = 'b'.repeat(40), workflowRun = '123') {
  const artifactId = 456;
  const binding = { ...target, workflowRevision: revision }, variablePath = `/environments/be-production/variables/${heldBindingVariable}`;
  const runPath = `/actions/runs/${workflowRun}`, artifactPath = `${runPath}/artifacts?per_page=100`;
  const values: Record<string, any> = {
    [variablePath]: { name: heldBindingVariable, value: JSON.stringify(binding) },
    '/commits/main': { sha: revision },
    [runPath]: { id: Number(workflowRun), run_attempt: 1, status: 'completed', conclusion: 'success', event: 'workflow_dispatch',
      head_branch: 'main', head_sha: revision, path: '.github/workflows/be-candidate-probe.yml',
      repository: { full_name: 'khuonghuyhieu/esty-admin' }, head_repository: { full_name: 'khuonghuyhieu/esty-admin' } },
  };
  const setSource = (path: string, bytes: Buffer, sourceRevision = revision) => {
    values[`/contents/${path}?ref=${sourceRevision}`] = { type: 'file', path, encoding: 'base64', size: bytes.length,
      content: bytes.toString('base64'), sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
  };
  const sourceDigests = Object.fromEntries((acceptanceGate ? heldD2Sources : heldProbeSources).map(path => {
    const bytes = sourceBytes?.[path] ?? Buffer.from(`synthetic reviewed source: ${path}\n`);
    setSource(path, bytes); return [path, sha256(bytes)];
  }));
  setSource(heldPinPath, Buffer.from(JSON.stringify({ version: 1, enabled: true, target }) + '\n'));
  const receipt = { version: 1, kind: 'held-app-live', bindingDigest: sha256(canonical(binding)),
    workflowRevision: revision, workflowRun, status: 200, configDigestMatch: true, bodyStatus: 'ok' };
  if (acceptanceGate) {
    const gate = acceptanceGate as { stage: string };
    values[`/environments/be-production/variables/${heldD2.gateVariable}`] =
      { name: heldD2.gateVariable, value: JSON.stringify(gate) };
    Object.assign(receipt, { kind: 'held-app-acceptance', stage: gate.stage,
      gateDigest: sha256(canonical(gate)), acceptance: 'passed' });
  }
  let archive: Buffer;
  const setReceipt = (value: unknown, extra: Array<[string, Buffer]> = []) => {
    archive = receiptZip([['held-app-probe.json', Buffer.from(JSON.stringify(value) + '\n')], ...extra]);
    values[artifactPath] = { total_count: 1, artifacts: [{ id: artifactId, name: `held-app-probe-${workflowRun}-1`, expired: false,
      size_in_bytes: archive.length, digest: `sha256:${sha256(archive)}`, workflow_run: { id: Number(workflowRun), head_sha: revision } }] };
  };
  setReceipt(receipt);
  const reads: string[] = [], downloads: number[] = [];
  const io: HeldProbeIo = {
    async read(path) { reads.push(path); assert.ok(Object.hasOwn(values, path), `Unexpected read-only path ${path}`); return structuredClone(values[path]); },
    async download(id) { downloads.push(id); assert.equal(id, artifactId); return Buffer.from(archive); },
  };
  return { target, binding, workflowRun, revision, artifactId, values, variablePath, runPath, artifactPath, sourceDigests,
    receipt, reads, downloads, io, setSource, setReceipt };
}

export function heldRetainedProofFixture(target: HeldAppTarget, gate: { controllerRevision: string; stage: string },
  publication: { revision: string; tree: string }, workflowRun: string = heldRetainedCandidate.workflowRun) {
  const proofSource = historicalProvenance.retainedProof;
  assert.deepEqual({ revision: proofSource.revision, tree: proofSource.tree }, heldRetainedCandidate.proofPublication);
  assert.deepEqual(proofSource.files.map(file => file.path).sort(), [...heldD2Sources].sort());
  const sources = Object.fromEntries(proofSource.files.map(file => {
    const bytes = Buffer.from(file.content, 'utf8');
    assert.equal(bytes.length, file.size); assert.equal(sha256(bytes), file.sha256);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), file.blob);
    return [file.path, bytes];
  }));
  const f = heldProofFixture(target, sources, gate, gate.controllerRevision, workflowRun);
  f.values['/commits/main'] = { sha: publication.revision, commit: { tree: { sha: publication.tree } } };
  for (const path of [...heldD2Sources, heldPinPath]) {
    const old = f.values[`/contents/${path}?ref=${gate.controllerRevision}`];
    f.setSource(path, Buffer.from(old.content, 'base64'), publication.revision);
  }
  return { ...f, sources, context: { binding: heldRetainedCandidate, controllerPublication: publication } };
}

export function historicalProofFixture(current: { revision: string; tree: string }) {
  const selected = historicalReleaseEvidence.finalAccepted, proof = selected.proof;
  const values: Record<string, unknown> = structuredClone(historicalProvenance.historicalHandoff.metadata);
  const variablePath = `/environments/be-production/variables/${heldBindingVariable}`;
  const gatePath = `/environments/be-production/variables/${heldD2.gateVariable}`;
  values[variablePath] = { name: heldBindingVariable, value: JSON.stringify(proof.binding) };
  values[gatePath] = { name: heldD2.gateVariable, value: JSON.stringify(proof.gate) };
  values[`/commits/${proof.binding.workflowRevision}`] = { sha: proof.binding.workflowRevision,
    commit: { tree: { sha: selected.binding.capability.controllerPublication.tree } } };
  const main = { sha: current.revision, commit: { tree: { sha: current.tree } } };
  values['/commits/main'] = main;
  const evidence = historicalReleaseEvidence, retention = retainedHistoricalArchive;
  const records = [evidence.accepted, evidence.failed].map(item => {
    const accepted = item.id === evidence.accepted.id;
    const entry = { id: item.id, sha: heldAppPolicy.revision, task: 'deploy:esty-be-ci', environment: 'be-production',
      production_environment: true, payload: { version: 1, revision: heldAppPolicy.revision, tree: heldAppPolicy.tree,
        run: accepted ? evidence.accepted.run : evidence.failed.proof.workflowRun,
        artifact: heldAppPolicy.artifactDigest, sourceDigest: heldAppPolicy.sourceDigest,
        migrationDigest: '149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3', project: heldAppPolicy.project,
        activationPacket: accepted ? heldAppPolicy.packetDigest : evidence.failed.proof.packetDigest,
        activationRun: accepted ? evidence.accepted.activationRun : evidence.failed.proof.activationRun } };
    values[`/deployments/${item.id}`] = entry;
    values[`/deployments/${item.id}/statuses?per_page=100`] = [item.status];
    return { entry, status: structuredClone(item.status) };
  });
  const entryPath = `/deployments/${evidence.accepted.id}`, statusPath = `${entryPath}/statuses?per_page=100`;
  const api = `https://api.github.com/repos/${retention.repository}`, releasePath = `/releases/tags/${retention.tag}`;
  const published = new Date(Date.now() - 60000).toISOString();
  const release = { id: 9000, url: `${api}/releases/9000`, assets_url: `${api}/releases/9000/assets`,
    html_url: `https://github.com/${retention.repository}/releases/tag/${retention.tag}`,
    tag_name: retention.tag, target_commitish: retention.publicationTarget, draft: false, prerelease: false,
    published_at: published, created_at: published, updated_at: published,
    assets: [{ id: 9001, url: `${api}/releases/assets/9001`,
      browser_download_url: `https://github.com/${retention.repository}/releases/download/${retention.tag}/${retention.asset}`,
      name: retention.asset, state: 'uploaded', content_type: 'application/zip', size: retention.size,
      digest: `sha256:${retention.zipDigest}`, created_at: published, updated_at: published, download_count: 0 }] };
  const tagPath = `/git/ref/tags/${retention.tag}`;
  const tag = { ref: `refs/tags/${retention.tag}`, url: `${api}/git/refs/tags/${retention.tag}`,
    object: { type: 'commit', sha: retention.revision, url: `${api}/git/commits/${retention.revision}` } };
  values[releasePath] = release; values[tagPath] = tag;
  values[`/commits/${retention.revision}`] = { sha: retention.revision, commit: { tree: { sha: heldAppPolicy.tree } } };
  const producer = { id: Number(retainedActivation.runId), run_attempt: 1, status: 'completed', conclusion: 'success',
    head_sha: retention.revision, head_branch: 'main', event: 'push', path: retainedActivation.workflowPath,
    repository: { full_name: retention.repository }, head_repository: { full_name: retention.repository } };
  const jobs = { total_count: 1, jobs: [{ id: Number(retainedActivation.checksJobId), name: 'BE required checks',
    run_id: producer.id, run_attempt: 1, head_sha: retention.revision, status: 'completed', conclusion: 'success' }] };
  values[`/actions/runs/${retainedActivation.runId}`] = producer;
  values[`/actions/runs/${retainedActivation.runId}/jobs?filter=all&per_page=100`] = jobs;
  const setSource = (path: string, bytes: Buffer) => {
    values[`/contents/${path}?ref=${proof.binding.workflowRevision}`] = { type: 'file', path, encoding: 'base64', size: bytes.length,
      content: bytes.toString('base64'), sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
  };
  for (const file of historicalProvenance.retainedProof.files) setSource(file.path, Buffer.from(file.content));
  setSource(heldPinPath, Buffer.from(historicalProvenance.historicalHandoff.bindingSource));
  const finalRun = structuredClone(historicalProvenance.historicalHandoff.metadata['/actions/runs/43847640596']);
  const listing = structuredClone(historicalProvenance.historicalHandoff.metadata['/actions/runs/43847640596/artifacts?per_page=100']);
  values[`/actions/runs/${proof.workflowRun}`] = finalRun;
  values[`/actions/runs/${proof.workflowRun}/artifacts?per_page=100`] = listing;
  const archives = new Map(Object.entries(historicalProvenance.historicalHandoff.archives).map(([id, bytes]) => [Number(id), Buffer.from(bytes, 'base64')]));
  const reads: string[] = [], downloads: number[] = [];
  const io: HeldProbeIo = {
    async read(path) {
      reads.push(path); assert.ok(Object.hasOwn(values, path), `Unexpected synthetic historical path ${path}`);
      return structuredClone(values[path]);
    },
    async download(id) {
      downloads.push(id); const bytes = archives.get(id);
      assert.ok(bytes, 'The selected historical archive must exist'); return bytes;
    },
  };
  const { workflowRevision: _revision, ...target } = proof.binding;
  return { io, values, archives, reads, downloads, main, finalRun, listing, variablePath, gatePath, proof, target, setSource,
    records, entryPath, statusPath, releasePath, release, tagPath, tag, producer, jobs };
}

// Historical hashes and inode-bound origin stay real/read-only. Only new public output paths
// are redirected to owned files; production guards and fixed lineage pins are not substituted.
export function heldReceiptOverlay(t: Pick<TestContext, 'mock' | 'after'>, directory: string, runId: string, freshD2 = false) {
  const native = { open: fs.openSync, read: fs.readFileSync, stat: fs.lstatSync, exists: fs.existsSync,
    list: fs.readdirSync, write: fs.writeFileSync, remove: fs.rmSync, realpath: fs.realpathSync };
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'esty-held-receipt-overlay-'));
  const parent = dirname(directory), events = join(directory, 'activation', runId), mapped = new Map<string, string>();
  const failedProbe = join(dirname(dirname(parent)), 'd1-held-probe-2a08578/probe-safe-result.json');
  const failedCorrection = join(dirname(dirname(parent)), 'd1-held-correction-f5d330c/corrected-probe-safe-result.json');
  const logDirectory = join(dirname(dirname(dirname(dirname(dirname(parent))))),
    'esty-admin-worktrees/task-d1-strict-api-config/.openai/task-d1/held-config-correction01/log-retrieval01');
  const repairPublicFiles = new Set([failedCorrection, join(logDirectory, 'safe-result.json'),
    join(dirname(dirname(logDirectory)), 'held-db-config-repair01/log-handoff.json')]);
  const allowed = new Set(['attest-started', 'attest-result', 'pending', 'import-started', 'current-proof', 'import-result']
    .map(suffix => join(parent, `${runId}.held-app-${suffix}.json`)));
  allowed.add(join(events, '022.json'));
  for (const selector of [heldCorrection.selector, heldPostRepair.selector])
    for (const suffix of correctionReceiptSuffixes) allowed.add(join(parent, `${runId}.${selector}-${suffix}.json`));
  for (const suffix of ['started', 'ack', 'verified', 'result'])
    allowed.add(join(parent, `${runId}.${heldDatabaseRepair.selector}-${suffix}.json`));
  for (let index = 23; index <= 34; index++) allowed.add(join(events, `${String(index).padStart(3, '0')}.json`));
  for (const suffix of ['prepare-candidate-started', 'candidate-gate', 'accept-candidate-started', 'candidate-accepted',
    'adoption', 'promote-started', 'promotion-ack', 'final-gate', 'accept-final-started', 'final-accepted',
    'accept-candidate-continuation-started'])
    allowed.add(join(parent, `${runId}.task-d2-${suffix}.json`));
  // Only ordinary-mode synthetic fixtures hide existing D2 receipts; retained tests consume their real immutable bytes.
  const hidden = new Set(freshD2 ? [...allowed].filter(path => path.includes('.task-d2-')) : []);
  const target = (path: fs.PathLike | number) => typeof path === 'string'
    ? mapped.get(path) ?? (hidden.has(path) ? join(root, `unwritten-${basename(path)}`) : path) : path;
  let sequence = 0;
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); native.remove(root, { recursive: true, force: true }); });
  t.mock.method(fs, 'openSync', (path: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
    const writing = typeof flags === 'number'
      ? !!(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC))
      : /[wa+]/.test(flags);
    if (typeof path === 'string' && path.startsWith(`${parent}/`) && writing) {
      assert.ok(allowed.has(path), `Forbidden original write: ${path}`);
      if (!mapped.has(path)) {
        assert.ok(hidden.has(path) || !native.exists(path), 'Never shadow a real output or consumed claim outside the explicit fresh fixture.');
        const owned = join(root, `${sequence++}.json`), fd = native.open(owned, flags, mode);
        mapped.set(path, owned); return fd;
      }
    }
    // Directory fsync belongs to the owned output, never the original evidence directory.
    if (!writing && (path === parent || path === events)) return native.open(root, flags, mode);
    return native.open(target(path) as fs.PathLike, flags, mode);
  });
  t.mock.method(fs, 'realpathSync', (path: fs.PathLike, options?: unknown) => {
    if (typeof path === 'string' && mapped.has(path)) {
      assert.equal(native.realpath(mapped.get(path)!), mapped.get(path)); return path;
    }
    return Reflect.apply(native.realpath, fs, [target(path), options]);
  });
  t.mock.method(fs, 'lstatSync', (path: fs.PathLike, options?: unknown) =>
    Reflect.apply(native.stat, fs, [target(path), options]));
  t.mock.method(fs, 'existsSync', (path: fs.PathLike) => native.exists(target(path) as fs.PathLike));
  t.mock.method(fs, 'readFileSync', (path: fs.PathOrFileDescriptor, options?: unknown) =>
    Reflect.apply(native.read, fs, [target(path), options]));
  t.mock.method(fs, 'readdirSync', (path: fs.PathLike, options?: unknown) => {
    const names = Reflect.apply(native.list, fs, [path, options]);
    if (path !== parent && path !== events) return names;
    assert.ok(names.every((name: unknown) => typeof name === 'string'));
    const added = [...mapped.keys()].filter(file => dirname(file) === path).map(file => file.slice(String(path).length + 1));
    return [...new Set([...names.filter((name: string) => !hidden.has(join(String(path), name))), ...added])].sort();
  });
  syncBuiltinESMExports();
  return {
    root,
    output: (path: string) => mapped.get(path),
    override(path: string, bytes: string | Buffer) {
      assert.ok(path.startsWith(`${parent}/`) || path === failedProbe || repairPublicFiles.has(path));
      const owned = mapped.get(path) ?? join(root, `${sequence++}.json`);
      native.write(owned, bytes, { mode: 0o600 }); mapped.set(path, owned);
    },
  };
}

export function heldCorrectionFixture(t: Pick<TestContext, 'mock' | 'after'>, directory: string, artifact: VerifiedArtifact, postRepair = false) {
  const packet = validateActivationPacket(JSON.parse(fs.readFileSync(
    join(directory, 'activation', bridgeRecovery.activationRun, 'packet.json'), 'utf8')), bridgeRecovery.packetDigest);
  const run = { directory, packet, digest: bridgeRecovery.packetDigest };
  const originalEvents = readActivationJournal(directory, packet, run.digest).events.map(event => event.sha256);
  const overlay = heldReceiptOverlay(t, directory, packet.runId);
  const original = readHeldCorrectionOriginal(directory, packet, run.digest, retainedUnknown.head);
  // These are explicitly synthetic publication identities, never a claim about published main.
  const capability = validateHeldDeploymentCapability({ ...heldCorrectionCapability({ revision: 'a'.repeat(40), tree: 'c'.repeat(40) }),
    selector: postRepair ? heldPostRepair.selector : heldCorrection.selector });
  const abort = new AbortController(), counts = { prepare: 0, metadata: 0, create: 0, dispose: 0, preflight: 0, inspect: 0, archive: 0 };
  const candidate = { id: 'dpl_SyntheticCorrection01', origin: 'https://synthetic-correction-01.vercel.app', ready: true };
  const context: HeldCorrectionContext = { run, artifact, capability, executableDigest: sha256('synthetic fixed correction executable'),
    signal: abort.signal, verifyExecutable: () => postRepair ? { heldPostRepairCapability: capability } : undefined, provider: {
      async preflight() { counts.preflight++; },
      async inspect(id) { assert.equal(id, candidate.id); counts.inspect++; return candidate; },
      async attest(id) { assert.equal(id, candidate.id); counts.archive++; return sha256('synthetic correction archive'); },
    } };
  const prepare = () => {
    counts.prepare++;
    return { async observe(dispatched: () => void) {
      dispatched(); counts.metadata++; return { metadataDigest: sha256('synthetic current metadata'), keyCount: postRepair ? 17 : 37 };
    }, dispose() {} };
  };
  const cli = () => ({ async create(dispatched: () => void) {
    dispatched(); counts.create++; return { code: 0, aborted: false, stdout: JSON.stringify({ deployment: { id: candidate.id } }) };
  }, async dispose() { counts.dispose++; } });
  const path = (suffix: string) => heldCorrectionEvidencePath(directory, packet, suffix, capability.selector);
  return { run, context, capability, original, originalEvents, overlay, abort, counts, candidate, prepare, cli, path };
}

export function heldDatabaseRepairFixture(t: Pick<TestContext, 'mock' | 'after'>, directory: string, artifact: VerifiedArtifact) {
  const packet = validateActivationPacket(JSON.parse(fs.readFileSync(
    join(directory, 'activation', bridgeRecovery.activationRun, 'packet.json'), 'utf8')), bridgeRecovery.packetDigest);
  const run = { directory, packet, digest: bridgeRecovery.packetDigest };
  const overlay = heldReceiptOverlay(t, directory, packet.runId), basis = verifyHeldDatabaseRepairBasis(run);
  const capability = validateHeldDatabaseRepairCapability({ selector: heldDatabaseRepair.selector,
    contextDigest: heldCorrection.contextDigest, controllerPublication: { revision: 'a'.repeat(40), tree: 'c'.repeat(40) } });
  const abort = new AbortController(), counts = { prepare: 0, preflight: 0, observe: 0, post: 0, verify: 0, dispose: 0 };
  const context: HeldDatabaseRepairContext = { run, artifact, capability, signal: abort.signal,
    executableDigest: sha256('synthetic fixed database repair executable'),
    verifyExecutable: () => ({ heldDatabaseRepairCapability: capability }), provider: {
      async preflight() { counts.preflight++; },
      async inspect() { assert.fail('Database repair cannot inspect a candidate.'); },
      async attest() { assert.fail('Database repair cannot attest an archive.'); },
    } };
  const path = (suffix: string) => join(dirname(directory), `${packet.runId}.${heldDatabaseRepair.selector}-${suffix}.json`);
  return { run, context, overlay, basis, capability, abort, counts, path };
}
