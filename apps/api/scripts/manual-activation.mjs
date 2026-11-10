import { spawn } from 'node:child_process';
import { constants, closeSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, githubReader, loadManualContext, readSelection, retainedActivation,
  validateSelection, verifySelectedBundle, verifyWorkflowHead } from './activation-retained.mjs';

const privatePhases = new Set(['bridge-config', 'roles', 'migration', 'bootstrap', 'app-config']);
const phases = new Set([...privatePhases, 'bridge', 'app']);
const maximumDuration = 900000;
function refuse() { throw new Error('Manual activation remains fenced; preserve retained evidence without replaying effects.'); }
function runtime() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.versions.node !== '24.22.1') refuse();
}
function phaseInputs(action, phase) {
  if (action === 'prepare' || action === 'reserve') {
    if (phase !== '-') refuse();
    return 'provider';
  }
  if (action === 'preflight' || action === 'postflight') {
    if (phase !== (action === 'preflight' ? '-' : 'migration')) refuse();
    return 'roles';
  }
  if (!phases.has(phase)) refuse();
  if (action === 'authorize' || action === 'confirm') return 'provider';
  if (action === 'run') return phase;
  // FE acceptance, finish and all reconciliation remain separately authorized paths.
  refuse();
}
function pathArgument(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) refuse();
  return resolve(value);
}
function contains(parent, child) { return parent === child || child.startsWith(parent + sep); }
function preparedPacket(bundle, directory) {
  const { journal, releaseJournal } = bundle.modules;
  const packet = journal.validateActivationPacket(releaseJournal.readEvidence(join(directory, 'packet-input.json')).value,
    bundle.context.packetDigest);
  if (canonical(packet) !== canonical(bundle.packet)) refuse();
  return packet;
}
function activationProvider(bundle, phase, inputs, signal, transport) {
  const activation = { packet: bundle.packet, packetDigest: bundle.context.packetDigest, phase: phase === 'app' ? 'app' : 'bridge' };
  // Release metadata stays f162; durable delivery/status links identify this actual manual workflow run.
  const release = { revision: retainedActivation.revision, tree: retainedActivation.tree, run: bundle.context.workflow.run };
  const provider = bundle.modules.provider.createActivationProvider(bundle.artifact, release,
    { github: inputs.GITHUB_TOKEN ?? '', vercel: inputs.VERCEL_TOKEN ?? '', bearer: inputs.BE_PREVIEW_ACCESS_KEY ?? '' },
    signal, activation, transport);
  const read = githubReader(inputs.GITHUB_TOKEN ?? '', signal, transport);
  return { ...provider, currentMain: async () => {
    signal.throwIfAborted();
    await verifyWorkflowHead(bundle.selection, read);
  } };
}
function candidatePredecessor(bundle, current, phase) {
  if (phase === 'bridge') return current.packet.predecessorId;
  const id = current.events.find(event => event.phase === 'bridge' && event.kind === 'acknowledged')?.value?.deploymentId;
  if (typeof id !== 'string' || !bundle.modules.provider.deploymentId.test(id)) refuse();
  return id;
}
function verifyCli(path) {
  if (!path.endsWith('/vercel/dist/vc.js') || realpathSync(path) !== path) refuse();
  const fd = openSync(resolve(path, '../../package.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > 65536) refuse();
    const bytes = readFileSync(fd), after = fstatSync(fd);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs || JSON.parse(bytes.toString('utf8')).version !== '65.4.0') refuse();
  } finally { closeSync(fd); }
}
async function candidate(bundle, run, phase, inputs, cliPath, signal, transport) {
  const { journal, delivery, artifact } = bundle.modules;
  signal.throwIfAborted(); journal.verifyActivationArtifact(bundle.artifact, run.packet);
  const activation = { packet: run.packet, packetDigest: run.digest, phase };
  const provider = activationProvider(bundle, phase, inputs, signal, transport);
  const current = journal.readActivationJournal(run.directory, run.packet, run.digest);
  verifyCli(cliPath);
  const cli = await delivery.officialCli(bundle.artifact, cliPath, inputs.VERCEL_TOKEN ?? '', signal, activation);
  try {
    const id = await delivery.deliverActivationCandidate({ artifact: bundle.artifact, activation, provider, cli,
      predecessor: candidatePredecessor(bundle, current, phase), journal: current.journal, signal,
      persist: (kind, value) => { journal.appendActivationEvent(run.directory, run.packet, run.digest, phase, kind, value); } });
    return { result: 'confirmed', databaseOutcome: 'not_started', count: 1, deploymentId: id,
      reportDigest: artifact.sha256(canonical({ phase, deploymentId: id,
        config: phase === 'bridge' ? run.packet.bridgeConfigDigest : run.packet.appConfigDigest })) };
  } finally { await cli.dispose(); }
}
async function privateCommand(bundle, action, phase, directory, cliPath, inputs, signal, beforeSpawn) {
  runtime(); signal.throwIfAborted();
  const temporaryRoot = realpathSync(tmpdir()), bundleRoot = dirname(bundle.artifact.root);
  if (contains(bundleRoot, temporaryRoot)) refuse();
  const work = await mkdtemp(join(temporaryRoot, 'esty-manual-activation-'));
  const childEnv = {
    PATH: '/usr/bin:/bin', HOME: work, TMPDIR: work, XDG_CONFIG_HOME: work, XDG_DATA_HOME: work, NO_COLOR: '1',
    ...inputs,
    // These are fresh sealed-operator process markers, not repository broad-gate variables.
    BE_ACTIVATION_CONTEXT: 'operator', BE_ACTIVATION_ENABLED: 'true', BE_DELIVERY_ENABLED: 'true',
    BE_DELIVERY_ENVIRONMENT: 'be-production', BE_ACTIVATION_OPERATOR_APPROVAL: bundle.packet.runId,
    // The retained build and the executing workflow are different identities; no GITHUB_* context is inherited.
    BE_ACTIVATION_BUILD_RUN: retainedActivation.runId, BE_ACTIVATION_PACKET_SHA256: bundle.context.packetDigest,
    ...(action === 'prepare' ? { BE_ACTIVATION_PACKET_JSON: canonical(bundle.packet) } : {}),
  };
  try {
    // Recheck in this mutation invocation, after preparation and immediately before child creation.
    // The provider credential belongs to this parent callback, never to childEnv.
    await beforeSpawn?.();
    signal.throwIfAborted();
    await new Promise((complete, reject) => {
      const child = spawn(process.execPath, [join(bundle.artifact.root, 'operator/apps/api/build/scripts/activation.js'),
        action, phase, join(directory, 'packet-input.json'), bundle.context.packetDigest, bundle.artifact.root, directory, cliPath],
      { cwd: work, env: childEnv, detached: true, stdio: 'ignore' });
      let failed = false, stopped = false, timer;
      const kill = name => { if (child.pid) { try { process.kill(-child.pid, name); } catch {} } };
      const stop = () => {
        stopped = true; kill('SIGTERM');
        timer ??= setTimeout(() => kill('SIGKILL'), 2000);
      };
      child.once('error', () => { failed = true; });
      child.once('close', code => {
        clearTimeout(timer); signal.removeEventListener('abort', stop);
        if (failed || stopped || signal.aborted || code !== 0) reject(new Error('Sealed activation subprocess remains fenced.'));
        else complete();
      });
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
    });
  } finally {
    for (const key of Object.keys(childEnv)) delete childEnv[key];
    // Never clean the artifact, packet, journal, receipts or unresolved intent.
    await rm(work, { recursive: true, force: true });
  }
}

export async function executeManualAction(bundle, action, phase, env, journalDirectory, cliPath, signal, transport = fetch) {
  let inputs, guardToken;
  try {
    const inputPhase = phaseInputs(action, phase);
    const context = loadManualContext(env);
    if (canonical(context) !== canonical(bundle.context) || canonical(bundle.packet) !== canonical(context.packet)) refuse();
    validateSelection(bundle.selection, context);
    const privateMutation = action === 'run' && privatePhases.has(phase);
    if (privateMutation) {
      const { GITHUB_TOKEN, ...phaseEnv } = env;
      guardToken = GITHUB_TOKEN;
      inputs = bundle.modules.inputs.phaseInputEnvironment(phaseEnv, inputPhase);
    } else inputs = bundle.modules.inputs.phaseInputEnvironment(env, inputPhase);
    if (action === 'prepare' && Object.keys(inputs).length) refuse();
    const directory = pathArgument(journalDirectory), cli = pathArgument(cliPath), bundleRoot = dirname(bundle.artifact.root);
    if (contains(bundleRoot, directory) || contains(directory, bundleRoot)) refuse();
    signal = AbortSignal.any([signal, AbortSignal.timeout(maximumDuration)]);
    signal.throwIfAborted();
    bundle.modules.journal.verifyActivationArtifact(bundle.artifact, bundle.packet);
    bundle.modules.privateFiles.privateDirectory(directory, action === 'prepare');
    if (action !== 'prepare') preparedPacket(bundle, directory);
    const run = { directory, packet: bundle.packet, digest: context.packetDigest };
    if (action === 'prepare' || action === 'preflight' || action === 'postflight' || (action === 'run' && privatePhases.has(phase))) {
      await privateCommand(bundle, action, phase, directory, cli, inputs, signal, privateMutation
        ? () => verifyWorkflowHead(bundle.selection, githubReader(guardToken ?? '', signal, transport)) : undefined);
      preparedPacket(bundle, directory);
    } else if (action === 'reserve') {
      const provider = activationProvider(bundle, phase, inputs, signal, transport);
      await provider.currentMain();
      if (await provider.preflight() !== bundle.packet.predecessorId) refuse();
      signal.throwIfAborted();
      bundle.modules.journal.createActivationJournal(directory, bundle.packet, run.digest);
      // Local intent precedes the remote write. An unacknowledged reservation retains its lock forever until explicit reconciliation.
      bundle.modules.journal.reserveActivationJournal(directory, bundle.packet, run.digest, await provider.reserve());
    } else if (action === 'authorize') {
      await bundle.modules.activation.authorizeActivationPhase(run, phase, activationProvider(bundle, phase, inputs, signal, transport));
    } else if (action === 'confirm') {
      await bundle.modules.activation.confirmActivationPhase(run, phase, activationProvider(bundle, phase, inputs, signal, transport));
    } else {
      await bundle.modules.activation.executeActivationPhase(run, phase, () => candidate(bundle, run, phase, inputs, cli, signal, transport));
    }
    signal.throwIfAborted();
  } catch { refuse(); }
  finally { if (inputs) for (const key of Object.keys(inputs)) delete inputs[key]; }
}

async function main(args, env, signal) {
  if (args.length !== 6 || args.some(value => !value)) refuse();
  const [action, phase, bundleRoot, selectionPath, journalDirectory, cliPath] = args;
  phaseInputs(action, phase); runtime();
  const context = loadManualContext(env);
  const selection = readSelection(selectionPath, env.BE_ACTIVATION_SELECTION_SHA256, context);
  const bundle = await verifySelectedBundle(bundleRoot, selection, context);
  await executeManualAction(bundle, action, phase, env, journalDirectory, cliPath, signal);
  console.info(JSON.stringify({ activation: 'step-confirmed', mode: 'retained-manual', action, phase }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try { await main(process.argv.slice(2), process.env, AbortSignal.any([abort.signal, AbortSignal.timeout(maximumDuration)])); }
  catch { console.error('MANUAL_ACTIVATION_FENCED: preserve the journal and inspect without blind replay.'); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
