import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { canonical, sha256 } from '../scripts/artifact.js';
import { heldAppPolicy, heldBindingVariable, heldPinPath, heldProbeSources } from '../scripts/activation-held-contract.mjs';
import type { HeldAppTarget, HeldProbeIo } from '../scripts/activation-held-proof.js';
import { receiptZip } from './artifact-fixture.js';
import { heldCorrection, validateHeldCorrectionCapability, heldCorrectionCapability } from '../scripts/activation-held-correction-contract.mjs';
import { correctionReceiptSuffixes, heldCorrectionEvidencePath, readActivationJournal, readHeldCorrectionOriginal,
  validateActivationPacket } from '../scripts/activation-journal.js';
import { bridgeRecovery } from '../scripts/activation-candidate-recovery.js';
import { retainedUnknown } from '../scripts/activation-schema-diagnostic.js';
import type { HeldCorrectionContext } from '../scripts/activation-held-correction.js';
import type { VerifiedArtifact } from '../scripts/artifact.js';

// Public synthetic GitHub responses; no token, account access or candidate HTTP.
export function heldProofFixture(target: HeldAppTarget = { ...heldAppPolicy, candidate: 'dpl_SyntheticHeldApp',
  origin: 'https://synthetic-held-app.vercel.app', configDigest: sha256('app'), createClaimDigest: sha256('claim'),
  createAckDigest: sha256('ack'), heldReceiptDigest: sha256('pending') }, sourceBytes?: Record<string, Buffer>) {
  const workflowRun = '123', revision = 'b'.repeat(40), artifactId = 456;
  const binding = { ...target, workflowRevision: revision }, variablePath = `/environments/be-production/variables/${heldBindingVariable}`;
  const runPath = `/actions/runs/${workflowRun}`, artifactPath = `${runPath}/artifacts?per_page=100`;
  const values: Record<string, any> = {
    [variablePath]: { name: heldBindingVariable, value: JSON.stringify(binding) },
    '/commits/main': { sha: revision },
    [runPath]: { id: Number(workflowRun), run_attempt: 1, status: 'completed', conclusion: 'success', event: 'workflow_dispatch',
      head_branch: 'main', head_sha: revision, path: '.github/workflows/be-candidate-probe.yml',
      repository: { full_name: 'khuonghuyhieu/esty-admin' }, head_repository: { full_name: 'khuonghuyhieu/esty-admin' } },
  };
  const setSource = (path: string, bytes: Buffer) => {
    values[`/contents/${path}?ref=${revision}`] = { type: 'file', path, encoding: 'base64', size: bytes.length,
      content: bytes.toString('base64'), sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
  };
  const sourceDigests = Object.fromEntries(heldProbeSources.map(path => {
    const bytes = sourceBytes?.[path] ?? Buffer.from(`synthetic reviewed source: ${path}\n`);
    setSource(path, bytes); return [path, sha256(bytes)];
  }));
  setSource(heldPinPath, Buffer.from(JSON.stringify({ version: 1, enabled: true, target }) + '\n'));
  const receipt = { version: 1, kind: 'held-app-live', bindingDigest: sha256(canonical(binding)),
    workflowRevision: revision, workflowRun, status: 200, configDigestMatch: true, bodyStatus: 'ok' };
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

// Historical hashes and inode-bound origin stay real/read-only. Only new public output paths
// are redirected to owned files; production guards and fixed lineage pins are not substituted.
export function heldReceiptOverlay(t: Pick<TestContext, 'mock' | 'after'>, directory: string, runId: string) {
  const native = { open: fs.openSync, read: fs.readFileSync, stat: fs.lstatSync, exists: fs.existsSync,
    list: fs.readdirSync, write: fs.writeFileSync, remove: fs.rmSync, realpath: fs.realpathSync };
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'esty-held-receipt-overlay-'));
  const parent = dirname(directory), events = join(directory, 'activation', runId), mapped = new Map<string, string>();
  const failedProbe = join(dirname(dirname(parent)), 'd1-held-probe-2a08578/probe-safe-result.json');
  const allowed = new Set(['attest-started', 'attest-result', 'pending', 'import-started', 'current-proof', 'import-result']
    .map(suffix => join(parent, `${runId}.held-app-${suffix}.json`)));
  allowed.add(join(events, '022.json'));
  for (const suffix of correctionReceiptSuffixes) allowed.add(join(parent, `${runId}.${heldCorrection.selector}-${suffix}.json`));
  const target = (path: fs.PathLike | number) => typeof path === 'string' ? mapped.get(path) ?? path : path;
  let sequence = 0;
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); native.remove(root, { recursive: true, force: true }); });
  t.mock.method(fs, 'openSync', (path: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
    const writing = typeof flags === 'number'
      ? !!(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC))
      : /[wa+]/.test(flags);
    if (typeof path === 'string' && path.startsWith(`${parent}/`) && writing) {
      assert.ok(allowed.has(path), `Forbidden original write: ${path}`);
      if (!mapped.has(path)) {
        assert.equal(native.exists(path), false, 'Never shadow a real output or consumed claim.');
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
    return Reflect.apply(native.realpath, fs, [path, options]);
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
    return [...new Set([...names, ...added])].sort();
  });
  syncBuiltinESMExports();
  return {
    root,
    output: (path: string) => mapped.get(path),
    override(path: string, bytes: string | Buffer) {
      assert.ok(path.startsWith(`${parent}/`) || path === failedProbe);
      const owned = mapped.get(path) ?? join(root, `${sequence++}.json`);
      native.write(owned, bytes, { mode: 0o600 }); mapped.set(path, owned);
    },
  };
}

export function heldCorrectionFixture(t: Pick<TestContext, 'mock' | 'after'>, directory: string, artifact: VerifiedArtifact) {
  const packet = validateActivationPacket(JSON.parse(fs.readFileSync(
    join(directory, 'activation', bridgeRecovery.activationRun, 'packet.json'), 'utf8')), bridgeRecovery.packetDigest);
  const run = { directory, packet, digest: bridgeRecovery.packetDigest };
  const originalEvents = readActivationJournal(directory, packet, run.digest).events.map(event => event.sha256);
  const overlay = heldReceiptOverlay(t, directory, packet.runId);
  const original = readHeldCorrectionOriginal(directory, packet, run.digest, retainedUnknown.head);
  // These are explicitly synthetic publication identities, never a claim about published main.
  const capability = validateHeldCorrectionCapability(heldCorrectionCapability({ revision: 'a'.repeat(40), tree: 'c'.repeat(40) }));
  const abort = new AbortController(), counts = { prepare: 0, metadata: 0, create: 0, dispose: 0, preflight: 0, inspect: 0, archive: 0 };
  const candidate = { id: 'dpl_SyntheticCorrection01', origin: 'https://synthetic-correction-01.vercel.app', ready: true };
  const context: HeldCorrectionContext = { run, artifact, capability, executableDigest: sha256('synthetic fixed correction executable'),
    signal: abort.signal, verifyExecutable() {}, provider: {
      async preflight() { counts.preflight++; },
      async inspect(id) { assert.equal(id, candidate.id); counts.inspect++; return candidate; },
      async attest(id) { assert.equal(id, candidate.id); counts.archive++; return sha256('synthetic correction archive'); },
    } };
  const prepare = () => {
    counts.prepare++;
    return { async observe(dispatched: () => void) {
      dispatched(); counts.metadata++; return { metadataDigest: sha256('synthetic current metadata'), keyCount: 37 };
    }, dispose() {} };
  };
  const cli = () => ({ async create(dispatched: () => void) {
    dispatched(); counts.create++; return { code: 0, aborted: false, stdout: JSON.stringify({ deployment: { id: candidate.id } }) };
  }, async dispose() { counts.dispose++; } });
  const path = (suffix: string) => heldCorrectionEvidencePath(directory, packet, suffix);
  return { run, context, capability, original, originalEvents, overlay, abort, counts, candidate, prepare, cli, path };
}
