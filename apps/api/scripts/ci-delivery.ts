import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { closeSync, fsyncSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { artifactTarget, canonical, inventory, removeArtifactTree, snapshotArtifact, verifyArtifact } from './artifact.js';
import type { ArtifactSnapshot, VerifiedArtifact } from './artifact.js';
import { createProvider, deploymentId, repository } from './ci-provider.js';
import type { ActivationDeliveryContext, ActivationProvider, Candidate, DeliveryProvider, RunIdentity } from './ci-provider.js';
import { command, isolatedEnvironment } from './ci-tools.js';
import type { CommandResult } from './ci-tools.js';
import { validateActivationPacket, verifyActivationArtifact } from './activation-journal.js';
import { approvedSchema, authorizeRoutineMigration, continueRoutineMigration, executeRoutineMigration,
  routinePacket, verifyRoutineArtifact } from './ci-migrations.js';
import type { RoutineSchema } from './ci-migrations.js';
import { decodePhaseInput } from './activation-inputs.js';

export function deliveryContext(env: NodeJS.ProcessEnv, tree: string): RunIdentity {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main'
    || !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '') || env.GITHUB_RUN_ATTEMPT !== '1'
    || env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/be-delivery.yml@refs/heads/main`
    || env.BE_DELIVERY_ENABLED !== 'true' || env.BE_DELIVERY_ENVIRONMENT !== 'be-production'
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || !/^[a-f0-9]{40}$/.test(tree)
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')) throw new Error('Production workflow context is not authorized.');
  return { revision: env.GITHUB_SHA!, tree, run: env.GITHUB_RUN_ID! };
}
export interface DeliveryCli { create(): Promise<CommandResult>; promote(id: string): Promise<CommandResult> }
export interface OfficialCli extends DeliveryCli { dispose(): Promise<void> }
export function acknowledgedId(stdout: string): string | undefined {
  try {
    const id: unknown = JSON.parse(stdout).deployment?.id;
    return typeof id === 'string' && deploymentId.test(id) ? id : undefined;
  } catch { return undefined; }
}
export async function deliver(input: { artifact: VerifiedArtifact; run: RunIdentity; schema: RoutineSchema;
  provider: DeliveryProvider; cli: DeliveryCli; reservation?: { journal: number; predecessor: string };
  signal: AbortSignal; receipt(event: Record<string, unknown>): void; pause?: () => Promise<void> }): Promise<string> {
  const { artifact, run, provider, cli, signal, receipt } = input;
  if (Boolean(input.schema.migration) !== Boolean(input.reservation)) throw new Error('Migration continuation is required.');
  const verify = () => {
    signal.throwIfAborted();
    verifyRoutineArtifact(artifact, run, input.schema);
  };
  verify();
  await provider.currentMain();
  const predecessor = await provider.preflight();
  if (input.reservation && predecessor !== input.reservation.predecessor) throw new Error('Migrated predecessor binding changed.');
  let journal: number | undefined = input.reservation?.journal, id: string | undefined;
  try {
    journal ??= await provider.reserve();
    receipt({ phase: 'reserved', journal, run, artifact: artifact.digest, predecessor });
    await provider.record(journal, 'in_progress', 'create_intent_unknown_until_acknowledged');
    await provider.currentMain(); await provider.binding(predecessor); verify();
    receipt({ phase: 'create_intent', journal });
    const created = await cli.create();
    id = acknowledgedId(created.stdout);
    if (id) {
      // Persist even a nonzero/aborted CLI's valid ID, before inspect or any other provider operation.
      receipt({ phase: 'acknowledged', journal, id });
      await provider.record(journal, 'in_progress', `ack:${id}`);
    }
    if (!id || created.code !== 0 || created.aborted) throw new Error('Create outcome requires reconciliation.');
    let candidate: Candidate;
    for (;;) {
      signal.throwIfAborted(); candidate = await provider.inspect(id);
      if (candidate.ready) break;
      await (input.pause?.() ?? delay(4000, undefined, { signal }));
    }
    await provider.attest(id); await provider.binding(predecessor);
    await provider.http(candidate.origin, true);
    await provider.currentMain(); await provider.binding(predecessor); verify();
    if (!(await provider.inspect(id)).ready) throw new Error('Candidate readiness changed.');
    await provider.attest(id);
    receipt({ phase: 'promotion_intent', journal, id });
    await provider.record(journal, 'in_progress', `promoting:${id}`);
    signal.throwIfAborted();
    const promoted = await cli.promote(id);
    if (promoted.code !== 0 || promoted.aborted) throw new Error('Promotion outcome requires reconciliation.');
    await provider.binding(id);
    if (!(await provider.inspect(id)).ready) throw new Error('Promoted candidate is not ready.');
    await provider.attest(id); await provider.http('https://api.lovora.us', false); await provider.binding(id);
    verify(); receipt({ phase: 'accepted', journal, id, artifact: artifact.digest, region: 'icn1', cases: 8 });
    await provider.record(journal, 'success', `accepted:${id}`);
    return id;
  } catch {
    receipt({ phase: 'unresolved', journal: journal ?? null, id: id ?? null });
    if (journal !== undefined) await provider.record(journal, 'error', id ? `unresolved:${id}` : 'unresolved_create_identity').catch(() => {});
    throw new Error('Delivery not accepted; retained intent blocks automatic retry.');
  }
}
export async function deliverActivationCandidate(input: {
  artifact: VerifiedArtifact; activation: ActivationDeliveryContext; provider: ActivationProvider; cli: DeliveryCli;
  predecessor: string; journal: number; signal: AbortSignal; pause?: () => Promise<void>;
  persist(kind: 'acknowledged' | 'candidate-attested' | 'promotion-intent', value: Record<string, string>): void;
}): Promise<string> {
  const { artifact, activation, provider, cli, predecessor, journal, signal, persist } = input;
  validateActivationPacket(activation.packet, activation.packetDigest);
  const verify = () => { signal.throwIfAborted(); verifyActivationArtifact(artifact, activation.packet); };
  verify(); await provider.currentMain(); await provider.binding(predecessor);
  const created = await cli.create(), id = acknowledgedId(created.stdout);
  if (id) {
    persist('acknowledged', { deploymentId: id });
    await provider.record(journal, 'in_progress', `ack:${id}`);
    await provider.confirmJournal(journal, 'in_progress', `ack:${id}`);
  }
  if (!id || created.code !== 0 || created.aborted) throw new Error('Activation create outcome requires read-only reconciliation.');
  let candidate: Candidate;
  for (;;) {
    signal.throwIfAborted(); candidate = await provider.inspect(id);
    if (candidate.ready) break;
    await (input.pause?.() ?? delay(4000, undefined, { signal }));
  }
  await provider.attest(id); await provider.binding(predecessor); await provider.http(candidate.origin, true);
  persist('candidate-attested', { deploymentId: id,
    configDigest: activation.phase === 'bridge' ? activation.packet.bridgeConfigDigest : activation.packet.appConfigDigest });
  await provider.currentMain(); await provider.binding(predecessor); verify();
  if (!(await provider.inspect(id)).ready) throw new Error('Activation candidate readiness changed.');
  await provider.attest(id);
  persist('promotion-intent', { deploymentId: id });
  await provider.record(journal, 'in_progress', `promoting:${id}`);
  await provider.confirmJournal(journal, 'in_progress', `promoting:${id}`);
  signal.throwIfAborted();
  const promoted = await cli.promote(id);
  if (promoted.code !== 0 || promoted.aborted) throw new Error('Activation promotion outcome is unknown.');
  await provider.binding(id);
  if (!(await provider.inspect(id)).ready) throw new Error('Activation final candidate is not ready.');
  await provider.attest(id); await provider.http('https://api.lovora.us', false); await provider.binding(id);
  verify();
  return id;
}
export async function officialCli(artifact: VerifiedArtifact, cli: string, token: string, signal: AbortSignal,
  activation?: ActivationDeliveryContext): Promise<OfficialCli> {
  if (!/^[\x21-\x7e]{16,512}$/.test(token) || !cli.endsWith('/vercel/dist/vc.js')) throw new Error('Invalid isolated CLI input.');
  if (activation) {
    validateActivationPacket(activation.packet, activation.packetDigest);
    if (!['bridge', 'app'].includes(activation.phase)) throw new Error('Invalid activation phase.');
    verifyActivationArtifact(artifact, activation.packet);
  }
  const metadata = activation ? ['--meta', `activationRun=${activation.packet.runId}`, '--meta', `activationPhase=${activation.phase}`,
    '--meta', `activationPacket=${activation.packetDigest}`, '--meta',
    `activationConfigDigest=${activation.phase === 'bridge' ? activation.packet.bridgeConfigDigest : activation.packet.appConfigDigest}`] : [];
  const root = await mkdtemp(join(realpathSync(tmpdir()), 'esty-ci-delivery-'));
  try {
    const env = await isolatedEnvironment(join(root, 'environment'));
    const auth = join(root, 'auth'), stage = join(root, 'stage'); await mkdir(auth, { mode: 0o700 }); await mkdir(stage);
    await writeFile(join(auth, 'auth.json'), JSON.stringify({ token }), { flag: 'wx', mode: 0o600 });
    await mkdir(join(stage, '.vercel'));
    await mkdir(join(stage, 'apps/api'), { recursive: true });
    await cp(join(artifact.root, '.vercel/output'), join(stage, '.vercel/output'), { recursive: true, preserveTimestamps: true, errorOnExist: true });
    await writeFile(join(stage, '.vercel/project.json'), JSON.stringify({ projectId: artifactTarget.project, orgId: artifactTarget.owner }));
    const common = ['--non-interactive', '--cwd', stage, '--global-config', auth, '--scope', artifactTarget.scope];
    let created = false, promoted = false;
    return {
      async create() {
        if (created) throw new Error('CLI create is one-shot.'); created = true;
        const uploaded = inventory(join(stage, '.vercel/output')).files.map(file => ({ ...file, path: `.vercel/output/${file.path}` }));
        if (canonical(uploaded) !== canonical(artifact.manifest.files.filter(file => file.path.startsWith('.vercel/output/')))) {
          throw new Error('CLI staging bytes differ from the tested artifact.');
        }
        return command(process.execPath, [cli, 'deploy', '--prebuilt', '--archive=tgz', '--prod', '--regions', 'icn1',
          '--skip-domain', '--no-wait', '--json', '--no-guidance', ...common, '--meta', `sourceCommit=${artifact.manifest.source.revision}`,
          '--meta', `artifactSha256=${artifact.digest}`, '--meta', `sourceDigest=${artifact.manifest.source.digest}`, ...metadata], stage, env, signal);
      },
      async promote(id) {
        if (!created || promoted || !deploymentId.test(id)) throw new Error('CLI promotion is one-shot.'); promoted = true;
        return command(process.execPath, [cli, 'promote', id, '--timeout', '5m', ...common], stage, env, signal);
      },
      async dispose() { await removeArtifactTree(root); },
    };
  } catch { await removeArtifactTree(root); throw new Error('Isolated CLI preparation failed.'); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, digest, tree, cli, reports] = process.argv.slice(2);
  let isolated: ArtifactSnapshot | undefined, official: OfficialCli | undefined;
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    if (!root || !digest || !tree || !cli || !reports || process.argv.length !== 7 || process.versions.node !== artifactTarget.node
      || process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Exact delivery arguments/platform required.');
    const run = deliveryContext(process.env, tree), signal = AbortSignal.any([abort.signal, AbortSignal.timeout(900000)]);
    const mode = process.env.BE_DELIVERY_MODE, action = process.env.BE_ROUTINE_ACTION;
    if (!['current-schema-only', 'versioned-migration'].includes(mode ?? '')
      || !['authorize', 'migrate', 'deliver'].includes(action ?? '')
      || (mode === 'current-schema-only' && action !== 'deliver')) throw new Error('Explicit routine delivery mode/action required.');
    const schema: RoutineSchema = { digest: approvedSchema(process.env.BE_DELIVERY_SCHEMA_SHA256) };
    isolated = await snapshotArtifact(verifyArtifact(root, digest, { revision: run.revision, migrationDigest: schema.digest,
      repository: `https://github.com/${repository}`, release: true }));
    const executing = inventory(fileURLToPath(new URL('../../../../', import.meta.url)));
    const expectedFiles = isolated.manifest.files.filter(file => file.path.startsWith('operator/'))
      .map(file => ({ ...file, path: file.path.slice(9) }));
    const expectedDirectories = isolated.manifest.directories.filter(entry => entry.path.startsWith('operator/'))
      .map(entry => ({ ...entry, path: entry.path.slice(9) }));
    if (canonical(executing.files) !== canonical(expectedFiles) || canonical(executing.directories) !== canonical(expectedDirectories)) {
      throw new Error('Executing operator differs from the tested artifact.');
    }
    if (mode === 'versioned-migration') {
      const packetDigest = approvedSchema(process.env.BE_MIGRATION_PACKET_SHA256);
      const packet = routinePacket(decodePhaseInput(process.env.BE_MIGRATION_PACKET_JSON), packetDigest, isolated, run);
      if (packet.target === 'local') throw new Error('Actions migration must use the approved cloud target.');
      schema.migration = { packet, digest: packetDigest };
    }
    const providerSecrets = ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'BE_PREVIEW_ACCESS_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET'];
    const forbidden = ['VERCEL_CONFIGURATION_TOKEN', 'ACTIVATION_ROLE_INPUTS', 'ACTIVATION_BOOTSTRAP_INPUTS',
      'ACTIVATION_MIGRATION_INPUTS', 'ACTIVATION_BRIDGE_INPUTS', 'ACTIVATION_APP_INPUTS'];
    if (forbidden.some(key => process.env[key] !== undefined)
      || (action === 'migrate' ? providerSecrets.some(key => process.env[key] !== undefined)
        : process.env.BE_MIGRATION_INPUTS !== undefined)) throw new Error('Routine phase credential boundary differs.');
    await mkdir(reports, { mode: 0o700, recursive: true });
    if (action === 'migrate') {
      await executeRoutineMigration({ artifact: isolated, run, schema, directory: reports,
        values: decodePhaseInput(process.env.BE_MIGRATION_INPUTS), signal });
      console.info('BE_MIGRATION_CONFIRMED');
    } else {
      // Public tooling was bootstrapped in an earlier secret-free step, never installed with this environment.
      if (JSON.parse(readFileSync(resolve(cli, '../../package.json'), 'utf8')).version !== '65.4.0') throw new Error('CLI pin differs.');
      const provider = createProvider(isolated, run, schema, { github: process.env.GITHUB_TOKEN ?? '', vercel: process.env.VERCEL_TOKEN ?? '',
        bearer: process.env.BE_PREVIEW_ACCESS_KEY ?? '', bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '' }, signal);
      if (action === 'authorize') {
        await authorizeRoutineMigration({ artifact: isolated, run, schema, provider, directory: reports });
        console.info('BE_MIGRATION_AUTHORIZED');
      } else {
        const reservation = schema.migration
          ? await continueRoutineMigration({ artifact: isolated, run, schema, provider, directory: reports }) : undefined;
        official = await officialCli(isolated, resolve(cli), process.env.VERCEL_TOKEN ?? '', signal);
        let index = 0;
        const receipt = (event: Record<string, unknown>) => {
          const fd = openSync(join(reports, `${String(index++).padStart(3, '0')}.json`), 'wx', 0o600);
          try { writeFileSync(fd, JSON.stringify(event) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
          const directory = openSync(reports, 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
        };
        const id = await deliver({ artifact: isolated, run, schema, provider, cli: official, signal, receipt, reservation });
        console.info(JSON.stringify({ status: 'accepted', id, artifact: digest, region: 'icn1' }));
      }
    }
  } catch { console.error('BE_DELIVERY_NOT_ACCEPTED: inspect the durable intent; do not rerun blindly.'); process.exitCode = 1; }
  finally { await official?.dispose(); await isolated?.dispose(); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
