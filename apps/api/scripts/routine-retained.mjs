import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync,
  mkdirSync, writeFileSync, chmodSync, appendFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { canonical, githubReader } from './activation-retained.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { tmpdir, userInfo } from 'node:os';
import { stoppedEtsyContinuation as stopped, stoppedReadinessContinuation as readinessStopped,
  committedEtsyContinuation as committed, failedReplacementDispatch as failedReplacement,
  validateFailedReplacementReceiptArchive, isFailedReplacementReservation, manualGithubIo,
  validateAuthorizationProducerArchive } from './activation-preflight-disposition.mjs';

const diagnosticContext = new AsyncLocalStorage();
export function withRoutineDiagnostics(diagnostics, body) { return diagnosticContext.run(diagnostics, body); }
export async function createRoutineDiagnostics(directory, runId) {
  const compiled = basename(dirname(dirname(fileURLToPath(import.meta.url)))) === 'build';
  const { ChecksDiagnostics } = await import(new URL(compiled ? './checks-diagnostics.js' : './checks-diagnostics.ts', import.meta.url).href);
  return new ChecksDiagnostics(directory, { scope: 'release', runId });
}
function check(name, condition, values = {}) {
  diagnosticContext.getStore()?.check(name, Boolean(condition), `${name}-mismatch`, values);
  if (!condition) throw new Error(`Routine retained release refused: ${name}.`);
}
function observed(name, body) {
  const diagnostics = diagnosticContext.getStore();
  return diagnostics ? diagnostics.sync(name, body) : body();
}

const repository = 'khuonghuyhieu/esty-admin', workflow = '.github/workflows/be-delivery.yml';
const hex = /^[a-f0-9]{64}$/, revision = /^[a-f0-9]{40}$/, id = /^[1-9][0-9]{0,15}$/;
const modes = ['current-schema-only', 'versioned-migration', 'etsy-strict-cutover'];
const maximumArchive = 64 * 1024 * 1024, maximumExpanded = 250 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
function refuse(reason = 'retained-validation') {
  diagnosticContext.getStore()?.event(reason, 'failed', 'condition-mismatch');
  throw new Error(`Routine retained release refused; ${reason}; inspect approved identities and retained evidence.`);
}
function object(value, expected) {
  check('json.object', value && typeof value === 'object' && !Array.isArray(value));
  if (expected) check('json.exact-keys', canonical(Object.keys(value).sort()) === canonical([...expected].sort()),
    { actualCount: Object.keys(value).length, expectedCount: expected.length });
  return value;
}
function exactId(actual, expected) { return Number.isSafeInteger(actual) && actual > 0 && String(actual) === expected; }
function timestamp(value) {
  check('timestamp.syntax', typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value));
  const result = Date.parse(value);
  check('timestamp.canonical', Number.isFinite(result) && new Date(result).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'));
  return result;
}
function plainFile(path, maximum, label = 'retained-file') {
  return observed(label, () => {
    check(`${label}.path`, typeof path === 'string' && path.length > 0);
    if (diagnosticContext.getStore()) {
      const metadata = observed(`${label}.lstat`, () => lstatSync(path));
      diagnosticContext.getStore().event(`${label}.metadata`, 'passed', 'metadata-observed-not-yet-authorized',
        { regular: metadata.isFile(), directory: metadata.isDirectory(), symlink: metadata.isSymbolicLink(),
          mode: metadata.mode, uid: metadata.uid, links: metadata.nlink, size: metadata.size });
    }
    const fd = observed(`${label}.open-no-follow`, () => openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW));
    try {
      const before = fstatSync(fd);
      check(`${label}.regular`, before.isFile(), { regular: before.isFile(), mode: before.mode, uid: before.uid, links: before.nlink, size: before.size });
      check(`${label}.single-link`, before.nlink === 1, { actual: before.nlink, expected: 1 });
      check(`${label}.owner`, before.uid === process.getuid(), { actual: before.uid, expected: process.getuid() });
      check(`${label}.permissions`, !(before.mode & 0o022), { actual: before.mode & 0o777, forbiddenBits: 0o022 });
      check(`${label}.size`, before.size > 0 && before.size <= maximum, { actual: before.size, maximum });
      const bytes = readFileSync(fd), after = fstatSync(fd), named = lstatSync(path);
      check(`${label}.stable-read`, bytes.length === before.size && before.size === after.size
        && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
      { beforeSize: before.size, afterSize: after.size, readBytes: bytes.length });
      check(`${label}.named-identity`, !named.isSymbolicLink() && named.ino === after.ino && named.dev === after.dev);
      return bytes;
    } finally { closeSync(fd); }
  });
}
function root(path) {
  const absolute = resolve(path), info = lstatSync(absolute);
  check('directory.kind', info.isDirectory() && !info.isSymbolicLink(), { directory: info.isDirectory(), symlink: info.isSymbolicLink() });
  check('directory.canonical', realpathSync(absolute) === absolute);
  check('directory.owner', info.uid === process.getuid(), { actual: info.uid, expected: process.getuid() });
  check('directory.permissions', !(info.mode & 0o022), { actual: info.mode & 0o777, forbiddenBits: 0o022 });
  return absolute;
}
function contextShape(value) {
  const continuation = value && Object.hasOwn(value, 'heldIncident');
  const automatic = value?.authority === 'protected-main';
  const context = object(value, ['version', 'controller', 'producerRun', 'artifactId', 'mode', 'approvalDigest', 'configDigest', 'schemaDigest', 'target', 'packetDigest',
    ...(continuation ? ['heldIncident'] : []), ...(automatic ? ['authority'] : [])]);
  check('context.protected-main-mode', !automatic || (context.mode === 'current-schema-only' && !continuation));
  check('context.held-incident', !continuation || (['45106877912', '45539045779', '45578212592', '45646286338'].includes(value.heldIncident) && value.mode === 'etsy-strict-cutover'));
  const controller = object(context.controller, ['revision', 'run']);
  check('context.version', context.version === 1);
  check('context.controller-revision', revision.test(controller.revision ?? ''));
  check('context.controller-run', id.test(controller.run ?? ''));
  const unresolved = automatic && context.producerRun === null && context.artifactId === null && context.approvalDigest === null;
  check('context.producer-run', unresolved || id.test(context.producerRun ?? ''));
  check('context.artifact-id', unresolved || id.test(context.artifactId ?? ''));
  check('context.distinct-producer', context.producerRun !== controller.run);
  check('context.mode', modes.includes(context.mode));
  for (const field of ['approvalDigest', 'configDigest', 'schemaDigest']) {
    check(`context.${field}`, (unresolved && field === 'approvalDigest') || (typeof context[field] === 'string' && hex.test(context[field])));
  }
  check('context.target', typeof context.target === 'string' && /^supabase:[a-z]{20}$/.test(context.target));
  check('context.packet-digest', context.mode === 'current-schema-only' ? context.packetDigest === null : hex.test(context.packetDigest ?? ''));
  return context;
}
/** Resolved identities are accepted only from the independently hashed same-run handoff. */
export function routineContext(env, event, resolved = undefined) {
  const inputs = object(object(event).inputs);
  for (const [key, expected] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_WORKFLOW_REF: `${repository}/${workflow}@refs/heads/main`, BE_DELIVERY_ENABLED: 'true',
    BE_DELIVERY_ENVIRONMENT: 'be-production' })) {
    check(`context.${key}`, env[key] === expected, { present: env[key] !== undefined, actualContext: env[key], expectedContext: expected });
  }
  const automatic = env.BE_ROUTINE_SELECTION === 'dispatch-main';
  if (automatic) {
    check('context.protected-main-enabled', env.BE_ROUTINE_MAIN_ENABLED === 'true' && inputs.mode === 'current-schema-only');
    check('context.no-manual-selectors', [inputs.release_run_id, inputs.release_artifact_id].every(value => (value ?? '') === ''));
  } else {
    check('context.controller-sha-binding', env.BE_RELEASE_CONTROLLER_SHA === env.GITHUB_SHA,
      { actualRevision: env.GITHUB_SHA, expectedRevision: env.BE_RELEASE_CONTROLLER_SHA });
  }
  check('context.mode-binding', env.BE_DELIVERY_MODE === inputs.mode, { actualMode: inputs.mode, expectedMode: env.BE_DELIVERY_MODE });
  const activationInput = inputs.activation_artifact_id;
  const activationKind = activationInput === null ? 'null' : Array.isArray(activationInput) ? 'array' : typeof activationInput;
  check('context.activation-input-absent', (activationInput ?? '') === '',
    { present: activationInput !== undefined, empty: activationInput === '', [`${activationKind}Value`]: true });
  const heldIncident = inputs.held_incident ?? '';
  check('context.held-selector', ['', '45106877912', '45539045779', '45578212592', '45646286338'].includes(heldIncident)
    && heldIncident === (env.BE_HELD_INCIDENT ?? '') && (heldIncident === '' || inputs.mode === 'etsy-strict-cutover'));
  return contextShape({ version: 1, controller: { revision: env.GITHUB_SHA, run: env.GITHUB_RUN_ID },
    producerRun: automatic ? resolved?.producerRun ?? null : inputs.release_run_id,
    artifactId: automatic ? resolved?.artifactId ?? null : inputs.release_artifact_id, mode: inputs.mode,
    approvalDigest: automatic ? resolved?.approvalDigest ?? null : env.BE_RELEASE_APPROVAL_SHA256,
    ...(automatic ? { authority: 'protected-main' } : {}), configDigest: env.BE_DELIVERY_CONFIG_SHA256,
    schemaDigest: env.BE_DELIVERY_SCHEMA_SHA256, target: env.BE_RELEASE_TARGET,
    packetDigest: inputs.mode === 'current-schema-only' ? null : env.BE_MIGRATION_PACKET_SHA256,
    ...(heldIncident ? { heldIncident } : {}) });
}
/** @param {string | undefined} [transfer] */
export function loadRoutineContext(env, transfer = undefined) {
  const bytes = plainFile(env.GITHUB_EVENT_PATH, 1024 * 1024, 'event-file');
  const event = observed('event-json.parse', () => JSON.parse(bytes.toString('utf8')));
  let resolved;
  if (env.BE_ROUTINE_SELECTION === 'dispatch-main' && transfer !== undefined) {
    const selected = plainFile(join(root(transfer), 'selection.json'), 65536, 'selection-file');
    check('selection.file-digest', hex.test(env.BE_RELEASE_SELECTION_SHA256 ?? '') && hash(selected) === env.BE_RELEASE_SELECTION_SHA256);
    const value = JSON.parse(selected.toString('utf8'));
    check('selection.canonical-json', canonical(value) + '\n' === selected.toString('utf8'));
    resolved = value.context;
  }
  return observed('context.validate', () => routineContext(env, event, resolved));
}
function runIdentity(value, run, sha, consumer) {
  const data = object(value);
  const prefix = consumer ? 'consumer' : 'producer';
  check(`${prefix}.run-id`, exactId(data.id, run), { actualId: Number.isSafeInteger(data.id) ? String(data.id) : '', expectedId: run });
  check(`${prefix}.attempt`, data.run_attempt === 1, { actual: data.run_attempt, expected: 1 });
  check(`${prefix}.revision`, data.head_sha === sha, { actualRevision: data.head_sha, expectedRevision: sha });
  check(`${prefix}.branch`, data.head_branch === 'main');
  check(`${prefix}.workflow`, [workflow, `${workflow}@main`, `${workflow}@refs/heads/main`].includes(data.path));
  check(`${prefix}.repository`, object(data.repository).full_name === repository && object(data.head_repository).full_name === repository);
  check(`${prefix}.repository-id`, Number.isSafeInteger(data.repository.id) && data.repository.id > 0 && data.head_repository.id === data.repository.id);
  check(`${prefix}.event`, consumer ? data.event === 'workflow_dispatch' : ['push', 'workflow_dispatch'].includes(data.event));
  check(`${prefix}.status`, data.status === (consumer ? 'in_progress' : 'completed'));
  check(`${prefix}.conclusion`, data.conclusion === (consumer ? null : 'success'));
  return data;
}
export const heldClaimStep = 'Claim held Etsy incident 45106877912 once';
export const replacementClaimStep = 'Claim replacement Etsy candidate after 45539045779 once';
export const readinessClaimStep = 'Claim readiness-fixed Etsy candidate after 45578212592 once';
export const recoveryClaimStep = 'Claim committed Etsy promotion recovery after 45646286338 once';
export function heldRunnerPaths(env) {
  check('held.hosted-runtime', process.platform === 'linux' && process.arch === 'x64'
    && env.GITHUB_ACTIONS === 'true' && env.GITHUB_JOB === 'production' && env.RUNNER_ENVIRONMENT === 'github-hosted');
  const home = root(userInfo().homedir), workspace = join(home, 'work', 'esty-admin', 'esty-admin');
  const temporary = join(home, 'work', '_temp');
  check('held.canonical-workspace', env.GITHUB_WORKSPACE === workspace && root(workspace) === workspace
    && env.RUNNER_TEMP === temporary && root(temporary) === temporary);
  return { workspace, temporary, receipts: join(temporary, 'be-receipts'),
    application: join(temporary, 'be-held-application'), replacement: join(temporary, 'be-replacement-application'),
    workflow: plainFile(join(root(join(workspace, '.github/workflows')), 'be-delivery.yml'), 256 * 1024, 'held-workflow') };
}
/** @param {((id: number, maximum: number) => Promise<Buffer>) | undefined} [download] */
export async function admitHeldProduction(request, env, read, sourceBytes, auditClaims = false, download = undefined) {
  const approval = request.continuation;
  const recovery = approval?.kind === 'promote-etsy-recovery';
  const readiness = approval?.kind === 'readiness-etsy-continuation' || recovery;
  const replacement = approval?.kind === 'replacement-etsy-continuation' || readiness;
  const claimStep = recovery ? recoveryClaimStep : readiness ? readinessClaimStep : replacement ? replacementClaimStep : heldClaimStep;
  check('held.production-context', (replacement || approval?.kind === 'held-etsy-continuation')
    && env.BE_HELD_INCIDENT === (recovery ? committed.run : readiness ? readinessStopped.run : replacement ? '45539045779' : '45106877912')
    && env.GITHUB_JOB === 'production' && env.GITHUB_RUN_ID === request.controller.run && env.GITHUB_RUN_ATTEMPT === '1'
    && env.GITHUB_SHA === request.controller.revision && env.GITHUB_REPOSITORY === repository
    && env.GITHUB_WORKFLOW_REF === `${repository}/${workflow}@refs/heads/main` && env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && env.GITHUB_REF === 'refs/heads/main' && env.RUNNER_ENVIRONMENT === 'github-hosted');
  const run = runIdentity(await read(`/actions/runs/${request.controller.run}`), request.controller.run, request.controller.revision, true);
  check('held.repository-workflow', run.repository.id === 1430691691 && run.workflow_id === 404086547);
  const commit = object(await read('/commits/main'));
  check('held.current-source', commit.sha === request.controller.revision
    && object(object(commit.commit).tree).sha === request.controller.tree);
  const workflowAt = async sha => {
    check('held.workflow-revision', revision.test(sha ?? ''));
    const file = object(await read(`/contents/${workflow}?ref=${sha}`));
    check('held.workflow-encoding', file.type === 'file' && file.path === workflow && file.encoding === 'base64'
      && typeof file.content === 'string' && file.content.length <= 256 * 1024);
    const encoded = file.content.replace(/\n/g, ''), bytes = Buffer.from(encoded, 'base64');
    check('held.workflow-bytes', bytes.toString('base64') === encoded && bytes.length === file.size);
    return bytes;
  };
  const published = await workflowAt(request.controller.revision);
  check('held.approved-workflow', Buffer.isBuffer(sourceBytes) && published.equals(sourceBytes)
    && hash(published) === approval.operator.workflowDigest);
  const text = published.toString('utf8'), production = text.match(/^  production:\n([\s\S]*?)(?=^  [a-zA-Z_][\w-]*:)/m)?.[1];
  check('held.production-policy', typeof production === 'string'
    && production.includes('\n    environment: be-production\n')
    && production.includes('\n    concurrency:\n      group: esty-admin-be-production\n      cancel-in-progress: false\n')
    && production.includes('\n    permissions:\n      contents: read\n      actions: read\n      deployments: write\n')
    && production.includes(`\n      - name: ${claimStep}\n`));
  const jobsFor = async identity => {
    const list = object(await read(`/actions/runs/${identity.id}/jobs?filter=all&per_page=100`));
    check('held.complete-production-jobs', Array.isArray(list.jobs) && list.jobs.length > 0 && list.jobs.length < 100
      && list.total_count === list.jobs.length && new Set(list.jobs.map(job => job.id)).size === list.jobs.length
      && list.jobs.every(job => Number.isSafeInteger(job.id) && job.id > 0 && job.run_id === identity.id
        && job.run_attempt === 1 && job.head_sha === identity.head_sha));
    const found = list.jobs.filter(job => job.name === 'BE production delivery');
    check('held.unique-production-job', found.length === 1);
    return object(found[0]);
  };
  const job = await jobsFor(run);
  check('held.active-production-runner', job.status === 'in_progress' && job.conclusion === null
    && Number.isSafeInteger(job.runner_id) && job.runner_id > 0 && job.runner_name === env.RUNNER_NAME
    && typeof env.RUNNER_NAME === 'string' && env.RUNNER_NAME.length > 0);
  const claim = Array.isArray(job.steps) ? job.steps.filter(step => step.name === claimStep) : [];
  check('held.current-claim-step', claim.length === 1 && (auditClaims
    ? claim[0].status === 'in_progress' && claim[0].conclusion === null
    : claim[0].status === 'completed' && claim[0].conclusion === 'success'));
  if (auditClaims) {
    if (replacement) check('replacement.pinned-prior', canonical(approval.priorContinuation) === canonical(stopped));
    if (readiness) check('readiness.pinned-prior', canonical(approval.priorReplacement) === canonical(readinessStopped));
    if (recovery) check('recovery.pinned-committed', canonical(approval.committedContinuation) === canonical(committed));
    const seen = new Set();
    let total;
    for (let page = 1; ; page++) {
      check('held.run-audit-bound', page <= 20);
      const listing = object(await read(`/actions/workflows/${run.workflow_id}/runs?event=workflow_dispatch&branch=main&per_page=100&page=${page}`));
      check('held.run-audit-completeness', Array.isArray(listing.workflow_runs) && listing.workflow_runs.length <= 100
        && Number.isSafeInteger(listing.total_count) && listing.total_count >= 1 && listing.total_count < 1000
        && (total === undefined || listing.total_count === total));
      total = listing.total_count;
      for (const prior of listing.workflow_runs) {
        check('held.run-audit-identity', Number.isSafeInteger(prior.id) && prior.id > 0 && !seen.has(prior.id)
          && prior.workflow_id === run.workflow_id && prior.event === 'workflow_dispatch' && prior.head_branch === 'main'
          && prior.repository?.id === 1430691691 && prior.head_repository?.id === 1430691691);
        seen.add(prior.id);
        if (prior.id === run.id) continue;
        const pin = String(prior.id) === stopped.run ? stopped
          : recovery && String(prior.id) === committed.run ? committed
            : readiness && String(prior.id) === readinessStopped.run ? readinessStopped : undefined;
        if (replacement && pin) {
          const stoppedRun = await read(`/actions/runs/${pin.run}`);
          const stoppedJobs = await read(`/actions/runs/${pin.run}/jobs?filter=all&per_page=100`);
          check('replacement.stopped-run-proof', hash(canonical(stoppedRun)) === pin.runDigest
            && hash(canonical(stoppedJobs)) === pin.jobsDigest
            && ['id', 'run_attempt', 'head_sha', 'status', 'conclusion', 'workflow_id', 'path', 'event', 'head_branch']
              .every(key => prior[key] === stoppedRun[key]));
          continue;
        }
        if (replacement && String(prior.id) === failedReplacement.run) {
          const failedRun = object(await read(`/actions/runs/${failedReplacement.run}`));
          const failedJobs = object(await read(`/actions/runs/${failedReplacement.run}/jobs?filter=all&per_page=100`));
          check('replacement.failed-dispatch-snapshots', hash(canonical(failedRun)) === failedReplacement.runDigest
            && hash(canonical(failedJobs)) === failedReplacement.jobsDigest
            && ['id', 'run_attempt', 'head_sha', 'status', 'conclusion', 'workflow_id', 'path', 'event', 'head_branch']
              .every(key => prior[key] === failedRun[key]));
          check('replacement.failed-dispatch-workflow', hash(await workflowAt(failedReplacement.revision)) === failedReplacement.workflowDigest);
          const failedJob = failedJobs.jobs.find(value => value.id === failedReplacement.job);
          // The pinned all-jobs snapshot binds every step, including both ingress
          // paths and skipped history, reattestation, migration and promotion.
          check('replacement.failed-dispatch-claim', failedRun.run_attempt === failedReplacement.attempt
            && failedRun.head_sha === failedReplacement.revision && failedRun.status === 'completed' && failedRun.conclusion === 'failure'
            && failedJob?.status === 'completed' && failedJob.conclusion === 'failure'
            && failedJob.steps.some(step => step.name === replacementClaimStep && step.status === 'completed' && step.conclusion === 'failure'));
          const artifacts = object(await read(`/actions/runs/${failedReplacement.run}/artifacts?per_page=100`));
          check('replacement.failed-dispatch-artifacts', Array.isArray(artifacts.artifacts) && artifacts.artifacts.length < 100
            && artifacts.total_count === artifacts.artifacts.length
            && new Set(artifacts.artifacts.map(item => item.id)).size === artifacts.artifacts.length);
          const found = artifacts.artifacts.filter(item => item.name === `be-delivery-receipts-${failedReplacement.run}-1`);
          check('replacement.failed-dispatch-receipt', found.length === 1);
          const artifact = found[0], binding = object(artifact.workflow_run);
          check('replacement.failed-dispatch-provenance', artifact.id === failedReplacement.artifact && artifact.expired === false
            && artifact.size_in_bytes === failedReplacement.size && artifact.digest === `sha256:${failedReplacement.zipDigest}`
            && String(binding.id) === failedReplacement.run && binding.head_sha === failedReplacement.revision
            && binding.head_branch === 'main' && binding.repository_id === 1430691691 && binding.head_repository_id === 1430691691
            && timestamp(artifact.created_at) >= timestamp(failedJob.started_at)
            && timestamp(artifact.created_at) <= timestamp(failedJob.completed_at) && typeof download === 'function');
          const zip = await download(failedReplacement.artifact, failedReplacement.size);
          check('replacement.failed-dispatch-receipt-size', zip.length === failedReplacement.size);
          validateFailedReplacementReceiptArchive(zip, diagnosticContext.getStore());
          // Absence is established from a complete fresh scan, not an empty
          // archive. The reservation path repeats this conflict fence before POST.
          const journals = new Set();
          for (let journalPage = 1; ; journalPage++) {
            check('replacement.failed-dispatch-journal-bound', journalPage <= 20);
            const entries = await read(`/deployments?task=deploy%3Aesty-be-ci&environment=be-production&per_page=100&page=${journalPage}`);
            check('replacement.failed-dispatch-journal-page', Array.isArray(entries) && entries.length <= 100);
            for (const entry of entries) {
              check('replacement.failed-dispatch-journal-identity', Number.isSafeInteger(entry.id) && entry.id > 0 && !journals.has(entry.id)
                && entry.task === 'deploy:esty-be-ci' && entry.environment === 'be-production'
                && entry.payload?.project === 'prj_uITHKLUGGE98VxrEcs5FoktBbcls' && id.test(entry.payload?.run ?? ''));
              journals.add(entry.id);
              check('replacement.failed-dispatch-unreserved', !isFailedReplacementReservation(entry));
            }
            if (entries.length < 100) break;
          }
          continue;
        }
        // A completed run cannot have continued an ACK that did not exist yet.
        if (prior.status === 'completed' && timestamp(prior.updated_at) < 1795405274350) continue;
        const priorSource = await workflowAt(prior.head_sha);
        const priorText = priorSource.toString('utf8');
        const claimNames = [heldClaimStep, replacementClaimStep, readinessClaimStep, recoveryClaimStep].filter(name => priorText.includes(`\n      - name: ${name}\n`));
        if (claimNames.length === 0) {
          check('held.reviewed-no-continuation-workflow', hash(priorSource) === 'c9cd73e744ff32998b9874d0782480bc2c2eff1c92d1ec00f1be5d189ef89a53');
          continue;
        }
        check('held.prior-attempt', prior.run_attempt === 1);
        const priorJob = await jobsFor(prior);
        if (priorJob.status === 'completed' && priorJob.conclusion === 'skipped') continue;
        // A missing archive/marker never launders a started or unknown attempt,
        // including either ingress on a source that supports both.
        for (const name of claimNames) {
          const steps = Array.isArray(priorJob.steps) ? priorJob.steps.filter(step => step.name === name) : [];
          check('held.no-prior-claim-attempt', steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === 'skipped');
        }
      }
      if (listing.workflow_runs.length < 100) {
        check('held.run-audit-complete', seen.size === total && seen.has(run.id));
        if (replacement) check('replacement.failed-dispatch-present', seen.has(Number(failedReplacement.run)));
        if (readiness) check('readiness.stopped-dispatches-present', seen.has(Number(stopped.run)) && seen.has(Number(readinessStopped.run)));
        if (recovery) check('recovery.committed-dispatch-present', seen.has(Number(committed.run)));
        break;
      }
    }
  }
  return { version: 1, run: request.controller.run, job: job.id, runner: job.runner_name, runnerId: job.runner_id,
    revision: request.controller.revision, tree: request.controller.tree, workflowDigest: hash(published),
    environment: 'be-production', concurrency: 'esty-admin-be-production', cancelInProgress: false };
}

// Discovery has no production authority. Only the subsequent protected job can
// authorize the frozen handoff; CI's sidecar is build provenance, not permission.
export async function resolveRoutine(context, read, download, now = Date.now()) {
  contextShape(context);
  check('resolve.unselected-main', context.authority === 'protected-main' && context.producerRun === null);
  const consumer = runIdentity(await read(`/actions/runs/${context.controller.run}`),
    context.controller.run, context.controller.revision, true);
  check('resolve.trusted-workflow', consumer.repository.id === 1430691691 && consumer.workflow_id === 404086547);
  const listing = object(await read(`/actions/workflows/${consumer.workflow_id}/runs?event=push&branch=main&head_sha=${context.controller.revision}&status=success&per_page=100`));
  check('resolve.complete-runs', Array.isArray(listing.workflow_runs) && listing.total_count === listing.workflow_runs.length
    && listing.workflow_runs.length < 100 && new Set(listing.workflow_runs.map(run => run.id)).size === listing.workflow_runs.length);
  const eligible = [];
  for (const run of listing.workflow_runs) {
    // Ignore unsuccessful/non-push evidence; never fall back to a different SHA.
    if (run.event !== 'push' || run.status !== 'completed' || run.conclusion !== 'success' || run.run_attempt !== 1) continue;
    check('resolve.run-id', Number.isSafeInteger(run.id) && run.id > 0);
    runIdentity(run, String(run.id), context.controller.revision, false);
    check('resolve.run-workflow', run.workflow_id === consumer.workflow_id && run.repository.id === consumer.repository.id);
    const artifacts = object(await read(`/actions/runs/${run.id}/artifacts?per_page=100`));
    check('resolve.complete-artifacts', Array.isArray(artifacts.artifacts) && artifacts.total_count === artifacts.artifacts.length
      && artifacts.artifacts.length < 100 && new Set(artifacts.artifacts.map(item => item.id)).size === artifacts.artifacts.length);
    for (const artifact of artifacts.artifacts) {
      if (artifact.name !== `be-tested-${run.id}-1` || artifact.expired !== false || timestamp(artifact.expires_at) <= now) continue;
      check('resolve.artifact-id', Number.isSafeInteger(artifact.id) && artifact.id > 0);
      eligible.push({ run: String(run.id), artifact: String(artifact.id) });
    }
  }
  check('resolve.unique-candidate', eligible.length === 1, { actual: eligible.length, expected: 1 });
  const candidate = eligible[0];
  // Metadata authentication precedes any download. The temporary digest is never
  // an approval and cannot leave this function as a handoff.
  const provisional = { ...context, producerRun: candidate.run, artifactId: candidate.artifact, approvalDigest: '0'.repeat(64) };
  const selected = await selectRoutine(provisional, read, now);
  const zip = await download(Number(candidate.artifact), maximumArchive);
  const transfer = validateAuthorizationProducerArchive(zip, selected.artifact.zipDigest, diagnosticContext.getStore());
  const controls = { ...provisional, approvalDigest: transfer.approvalDigest };
  const selection = validateRoutineSelection({ ...selected, context: controls }, controls, now);
  routineApproval(transfer.approval, controls.approvalDigest, selection);
  check('resolve.inner-archive', hash(transfer.archive) === transfer.approval.archiveDigest);
  return { selection, ...transfer };
}

export async function selectRoutine(context, read, now = Date.now()) {
  contextShape(context);
  const transport = read;
  read = async path => {
    const trace = diagnosticContext.getStore();
    return trace ? trace.boundary('selection.authenticated-read', () => transport(path)) : transport(path);
  };
  const main = object(await read('/commits/main'));
  check('selection.main-revision', main.sha === context.controller.revision);
  check('selection.main-tree', revision.test(object(object(main.commit).tree).sha ?? ''));
  const tree = main.commit.tree.sha;
  const consumer = runIdentity(await read(`/actions/runs/${context.controller.run}`), context.controller.run, context.controller.revision, true);
  const producer = runIdentity(await read(`/actions/runs/${context.producerRun}`), context.producerRun, context.controller.revision, false);
  if (context.authority === 'protected-main') {
    check('selection.push-only', producer.event === 'push' && producer.workflow_id === 404086547 && producer.repository.id === 1430691691
      && consumer.workflow_id === producer.workflow_id && consumer.repository.id === producer.repository.id);
  }
  const jobs = object(await read(`/actions/runs/${context.producerRun}/jobs?filter=all&per_page=100`));
  check('selection.jobs-complete', Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length && jobs.jobs.length <= 100);
  const checks = jobs.jobs.filter(job => job.name === 'BE required checks');
  check('selection.unique-checks-job', checks.length === 1, { actual: checks.length, expected: 1 });
  check('selection.checks-success', checks[0].status === 'completed' && checks[0].conclusion === 'success');
  check('selection.checks-job-id', Number.isSafeInteger(checks[0].id) && checks[0].id > 0);
  check('selection.checks-run', exactId(checks[0].run_id, context.producerRun) && checks[0].run_attempt === 1);
  check('selection.checks-revision', checks[0].head_sha === context.controller.revision);
  const artifact = object(await read(`/actions/artifacts/${context.artifactId}`)), artifactRun = object(artifact.workflow_run);
  check('selection.artifact-id', exactId(artifact.id, context.artifactId));
  check('selection.artifact-name', artifact.name === `be-tested-${context.producerRun}-1`);
  check('selection.artifact-not-expired', artifact.expired === false);
  check('selection.artifact-digest', typeof artifact.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(artifact.digest));
  check('selection.artifact-size', Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= maximumArchive,
    { actual: artifact.size_in_bytes, maximum: maximumArchive });
  check('selection.artifact-time-window', timestamp(artifact.expires_at) > now && timestamp(artifact.created_at) <= now
    && timestamp(artifact.created_at) >= timestamp(checks[0].started_at) && timestamp(artifact.created_at) <= timestamp(checks[0].completed_at));
  check('selection.artifact-producer', exactId(artifactRun.id, context.producerRun) && artifactRun.head_sha === context.controller.revision && artifactRun.head_branch === 'main');
  check('selection.artifact-repository', artifactRun.repository_id === producer.repository.id && artifactRun.head_repository_id === producer.head_repository.id);
  return validateRoutineSelection({ version: 1, context, controllerTree: tree,
    producer: { revision: producer.head_sha, tree, run: context.producerRun }, checksJobId: String(checks[0].id),
    artifact: { id: context.artifactId, zipDigest: artifact.digest.slice(7), expiresAt: artifact.expires_at }, selectedAt: new Date(now).toISOString() }, context, now);
}
export function validateRoutineSelection(value, context, now = Date.now()) {
  contextShape(context);
  const selection = object(value, ['version', 'context', 'controllerTree', 'producer', 'checksJobId', 'artifact', 'selectedAt']);
  object(selection.producer, ['revision', 'tree', 'run']); object(selection.artifact, ['id', 'zipDigest', 'expiresAt']);
  check('selection.version', selection.version === 1);
  check('selection.context-binding', canonical(selection.context) === canonical(context));
  check('selection.controller-tree', revision.test(selection.controllerTree ?? ''));
  check('selection.producer-binding', selection.producer.revision === context.controller.revision
    && selection.producer.tree === selection.controllerTree && selection.producer.run === context.producerRun);
  check('selection.job-id', id.test(selection.checksJobId ?? ''));
  check('selection.selected-artifact', selection.artifact.id === context.artifactId && hex.test(selection.artifact.zipDigest ?? ''));
  check('selection.valid-window', Number.isFinite(now) && timestamp(selection.selectedAt) <= now
    && timestamp(selection.artifact.expiresAt) > now && timestamp(selection.artifact.expiresAt) > timestamp(selection.selectedAt));
  return JSON.parse(canonical(selection));
}
export async function confirmRoutineSelection(selection, context, read) {
  validateRoutineSelection(selection, context);
  const fresh = await selectRoutine(context, read);
  check('selection.fresh-binding', canonical({ ...fresh, selectedAt: selection.selectedAt }) === canonical(selection));
}
export function readRoutineSelection(directory, digest, context) {
  directory = root(directory);
  const bytes = plainFile(join(directory, 'selection.json'), 65536, 'selection-file');
  check('selection.file-digest', hex.test(digest ?? '') && hash(bytes) === digest);
  const selection = observed('selection.json-parse', () => JSON.parse(bytes.toString('utf8')));
  check('selection.canonical-json', canonical(selection) + '\n' === bytes.toString('utf8'));
  return validateRoutineSelection(selection, context);
}
export function readRoutineRequest(directory, digest) {
  const bytes = plainFile(join(root(directory), 'request.json'), 65536, 'request-file');
  check('request.file-digest', hex.test(digest ?? '') && hash(bytes) === digest);
  const request = observed('request.json-parse', () => JSON.parse(bytes.toString('utf8')));
  check('request.canonical-json', canonical(request) + '\n' === bytes.toString('utf8'));
  return request;
}
export function routineApproval(value, digest, selection) {
  const approval = object(value, ['version', 'mode', 'producer', 'artifactDigest', 'sourceDigest', 'archiveDigest', 'operatorDigest', 'schemaDigest']);
  check('approval.digest', hex.test(digest ?? '') && hash(canonical(approval) + '\n') === digest);
  check('approval.release-version', approval.version === 1 && approval.mode === 'release');
  check('approval.producer', canonical(approval.producer) === canonical(selection.producer));
  for (const field of ['artifactDigest', 'sourceDigest', 'archiveDigest', 'operatorDigest', 'schemaDigest']) {
    check(`approval.${field}`, typeof approval[field] === 'string' && hex.test(approval[field]));
  }
  check('approval.schema-binding', approval.schemaDigest === selection.context.schemaDigest);
  return JSON.parse(canonical(approval));
}
export function verifyRoutineTransfer(directory, selection, context, requireRequest = false) {
  validateRoutineSelection(selection, context); directory = root(directory);
  const expected = ['be-release-approval.json', 'be-release.tar.gz', 'selection.json', ...(requireRequest ? ['request.json'] : [])].sort();
  check('transfer.exact-inventory', canonical(readdirSync(directory).sort()) === canonical(expected));
  const bytes = plainFile(join(directory, 'be-release-approval.json'), 65536, 'approval-file');
  check('transfer.approval-digest', hash(bytes) === context.approvalDigest);
  const approval = routineApproval(observed('approval.json-parse', () => JSON.parse(bytes.toString('utf8'))), context.approvalDigest, selection);
  check('transfer.canonical-approval', canonical(approval) + '\n' === bytes.toString('utf8'));
  const archive = plainFile(join(directory, 'be-release.tar.gz'), maximumArchive, 'archive-file');
  check('transfer.archive-digest', hash(archive) === approval.archiveDigest);
  return { approval, archive };
}
// The published checkout uses Node24's native TS stripping for this builtin-only verifier.
// A sealed operator uses its compiled sibling. Never import verifier code from an unverified archive.
async function artifactModule() {
  return import(new URL(basename(dirname(dirname(fileURLToPath(import.meta.url)))) === 'build' ? './artifact.js' : './artifact.ts', import.meta.url).href);
}
export async function extractRoutineBundle(compressed, digest, destination, artifactOnly = false) {
  check('archive.compressed-digest', Buffer.isBuffer(compressed) && compressed.length <= maximumArchive && hex.test(digest ?? '') && hash(compressed) === digest);
  check('archive.extraction-mode', typeof artifactOnly === 'boolean');
  const { safePath } = await artifactModule();
  const bytes = observed('archive.bounded-gunzip', () => gunzipSync(compressed, { maxOutputLength: maximumExpanded }));
  const text = buffer => {
    const end = buffer.indexOf(0), value = buffer.subarray(0, end < 0 ? buffer.length : end).toString('utf8');
    check('archive.valid-utf8', !value.includes('\ufffd')); return value;
  };
  const octal = buffer => {
    const value = text(buffer).trim(); check('archive.octal-syntax', /^[0-7]+$/.test(value));
    const n = Number.parseInt(value, 8); check('archive.octal-range', Number.isSafeInteger(n)); return n;
  };
  const entries = [], seen = new Set(); let offset = 0, attributes, terminated = false;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512); offset += 512;
    if (header.every(byte => byte === 0)) {
      check('archive.terminal-padding', !attributes && bytes.length - offset >= 512 && bytes.subarray(offset).every(byte => byte === 0));
      terminated = true; break;
    }
    let checksum = 0; for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    check('archive.header-checksum', checksum === octal(header.subarray(148, 156)));
    const type = header[156], size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
    check('archive.member-size-mode', size <= 32 * 1024 * 1024 && offset + size <= bytes.length && mode <= 0o777 && !(mode & 0o022),
      { size, mode, maximumSize: 32 * 1024 * 1024 });
    const content = bytes.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512;
    check('archive.padded-member-bound', offset <= bytes.length);
    if (type === 76) {
      check('archive.gnu-longname', !attributes && size > 1 && size <= 1025
        && text(header.subarray(0, 100)) === '././@LongLink' && content.indexOf(0) === size - 1);
      attributes = { path: text(content) };
      continue;
    }
    if (type === 120) {
      check('archive.pax-size', !attributes && size <= 16384); attributes = {}; let cursor = 0;
      while (cursor < content.length) {
        const space = content.indexOf(32, cursor), length = content.subarray(cursor, space).toString();
        check('archive.pax-length', space >= 0 && /^[1-9][0-9]{0,5}$/.test(length));
        const end = cursor + Number(length), entry = content.subarray(space + 1, end - 1).toString('utf8'), separator = entry.indexOf('=');
        check('archive.pax-record', end <= content.length && end > space + 2 && content[end - 1] === 10 && separator >= 1 && !entry.includes('\ufffd'));
        const key = entry.slice(0, separator);
        // Timestamp/owner metadata is recognized but never applied; paths and sizes are checked below.
        check('archive.pax-key', ['path', 'size', 'mtime', 'atime', 'ctime', 'LIBARCHIVE.creationtime', 'uid', 'gid', 'uname', 'gname'].includes(key)
          && !Object.hasOwn(attributes, key));
        attributes[key] = entry.slice(separator + 1); cursor = end;
      }
      continue;
    }
    check('archive.member-type', [0, 48, 53].includes(type), { actual: type });
    let path = attributes?.path ?? [text(header.subarray(345, 500)), text(header.subarray(0, 100))].filter(Boolean).join('/');
    check('archive.pax-size-binding', attributes?.size === undefined || attributes.size === String(size)); attributes = undefined;
    if (type === 53 && path.endsWith('/')) path = path.slice(0, -1);
    observed('archive.safe-path', () => safePath(path));
    check('archive.member-inventory', ['artifact', 'runner', 'receipt.json'].includes(path.split('/')[0]) && !seen.has(path.toLowerCase()) && seen.size < 30000
      && !(type === 53 && size) && !(path === 'receipt.json' && type === 53)
      && !(['artifact', 'runner'].includes(path) && type !== 53), { entries: seen.size });
    seen.add(path.toLowerCase()); entries.push({ path, mode, directory: type === 53, content });
  }
  check('archive.termination-receipt', terminated && entries.some(entry => entry.path === 'receipt.json'));
  const directories = new Set(entries.filter(entry => entry.directory).map(entry => entry.path));
  check('archive.required-roots', directories.has('artifact') && directories.has('runner'));
  for (const entry of entries) {
    let parent = dirname(entry.path);
    while (parent !== '.') { check('archive.parent-inventory', directories.has(parent)); parent = dirname(parent); }
  }
  // Parse the whole archive before the first filesystem effect; create only a new private root.
  const materialized = artifactOnly ? entries.filter(entry => entry.path === 'artifact' || entry.path.startsWith('artifact/')) : entries;
  destination = resolve(destination); root(dirname(destination)); mkdirSync(destination, { mode: 0o700 });
  for (const entry of materialized.filter(entry => entry.directory).sort((a, b) => a.path.length - b.path.length)) mkdirSync(join(destination, entry.path), { mode: 0o700 });
  for (const entry of materialized.filter(entry => !entry.directory)) writeFileSync(join(destination, entry.path), entry.content, { flag: 'wx', mode: entry.mode });
  for (const entry of materialized.filter(entry => entry.directory).sort((a, b) => b.path.length - a.path.length)) chmodSync(join(destination, entry.path), entry.mode);
  return destination;
}
export async function verifyRoutineBundle(bundleRoot, approval, selection, context, controllerRoot) {
  validateRoutineSelection(selection, context); routineApproval(approval, context.approvalDigest, selection);
  bundleRoot = root(bundleRoot);
  check('bundle.exact-inventory', canonical(readdirSync(bundleRoot).sort()) === canonical(['artifact', 'receipt.json', 'runner']));
  const tools = await artifactModule();
  const artifact = observed('bundle.artifact-verification', () => tools.verifyArtifact(join(bundleRoot, 'artifact'), approval.artifactDigest, { revision: selection.producer.revision,
    repository: `https://github.com/${repository}`, migrationDigest: context.schemaDigest, release: true }));
  check('bundle.source-identity', artifact.manifest.source.tree === selection.producer.tree && artifact.manifest.source.digest === approval.sourceDigest);
  if (controllerRoot !== undefined) observed('bundle.controller-source', () => tools.assertSourceFiles(root(controllerRoot), artifact.manifest.source));
  const operator = { files: artifact.manifest.files.filter(file => file.path.startsWith('operator/')).map(file => ({ ...file, path: file.path.slice(9) })),
    directories: artifact.manifest.directories.filter(entry => entry.path.startsWith('operator/')).map(entry => ({ ...entry, path: entry.path.slice(9) })) };
  check('bundle.operator-inventory', hash(canonical(operator)) === approval.operatorDigest && canonical(tools.inventory(root(join(bundleRoot, 'runner')))) === canonical(operator));
  const receipt = observed('bundle.receipt-json', () => JSON.parse(plainFile(join(bundleRoot, 'receipt.json'), 4 * 1024 * 1024, 'receipt-file').toString('utf8')));
  object(receipt, ['version', 'revision', 'tree', 'artifact', 'source', 'nativeHttpDatabase', 'functional', 'mode', 'node', 'runner']);
  check('bundle.receipt-version', receipt.version === 1);
  check('bundle.receipt-source', receipt.revision === selection.producer.revision && receipt.tree === selection.producer.tree
    && receipt.artifact === approval.artifactDigest && receipt.source === approval.sourceDigest);
  check('bundle.receipt-checks', receipt.nativeHttpDatabase === 'passed' && receipt.functional === 'passed');
  check('bundle.receipt-runtime', receipt.mode === 'release' && receipt.node === '24.22.1');
  check('bundle.receipt-operator', canonical(receipt.runner) === canonical(operator));
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
export function emitRoutineResult(value, env = process.env, diagnostics = diagnosticContext.getStore()) {
  let result = value;
  try {
    diagnostics?.event('result.channels', 'started', 'writing-output-and-step-summary');
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT,
      `accepted=${result.status === 'accepted'}\nrelease_status=${result.status}\nrelease_stage=${result.stage}\n`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,
      `BE release: ${result.status}; stage=${result.stage}; category=${result.category ?? 'none'}; `
      + `create=${result.effects.create}; migration=${result.effects.migration}; promotion=${result.effects.promotion}; `
      + `deployment=${result.deploymentId ?? 'unknown'}; evidence=${result.evidence}; `
      + `receipt=${result.receiptDigest ?? 'unavailable'}; next=${result.nextAction}.\n`);
    diagnostics?.event('result.channels', 'passed', 'available-output-channels-written');
  } catch (cause) {
    diagnostics?.event('result.channels', 'failed', 'output-or-summary-write-failed-effect-state-preserved', {}, cause);
    result = { ...result, status: 'unknown', evidence: 'unconfirmed', proof: null,
      category: result.category ?? 'evidence-persistence', nextAction: 'inspect-retained-evidence' };
    try {
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `accepted=false\nrelease_status=unknown\nrelease_stage=${result.stage}\n`);
    } catch (cause) {
      diagnostics?.event('result.fail-closed-output', 'failed', 'accepted-false-output-write-failed-step-still-fails', {}, cause);
    }
    process.exitCode = 1;
  }
  console.info(JSON.stringify(result));
  return result;
}
let entryStage = 'request', entryCategory = 'unauthorized-context';
async function main(args, env) {
  const [action, transfer, bundle, controller] = args;
  const context = loadRoutineContext(env, action === 'resolve' || action === 'select' ? undefined : transfer);
  check('entry.current-schema-route', context.mode !== 'current-schema-only' || context.authority === 'protected-main');
  if (context.authority === 'protected-main' && ['resolve', 'consume'].includes(action)) {
    check('entry.unprivileged-candidate-job', env.GITHUB_JOB === 'routine_candidate');
    check('entry.no-production-credentials', ['VERCEL_TOKEN', 'BE_PREVIEW_ACCESS_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET',
      'BE_MIGRATION_INPUTS', 'VERCEL_CONFIGURATION_TOKEN', 'ACTIVATION_ROLE_INPUTS', 'ACTIVATION_BOOTSTRAP_INPUTS',
      'ACTIVATION_MIGRATION_INPUTS', 'ACTIVATION_BRIDGE_INPUTS', 'ACTIVATION_APP_INPUTS'].every(key => env[key] === undefined));
  }
  entryStage = 'artifact'; entryCategory = 'identity-mismatch';
  if (['select', 'resolve'].includes(action) && args.length === 2) {
    const io = manualGithubIo(env.GITHUB_TOKEN, AbortSignal.timeout(120000), fetch, diagnosticContext.getStore());
    const resolved = action === 'resolve' ? await resolveRoutine(context, io.read, io.download) : undefined;
    check('entry.selection-route', Boolean(resolved) === (context.authority === 'protected-main'));
    const selection = resolved?.selection ?? await selectRoutine(context, io.read);
    mkdirSync(transfer, { mode: 0o700 }); root(transfer);
    if (resolved) {
      writeFileSync(join(transfer, 'be-release.tar.gz'), resolved.archive, { flag: 'wx', mode: 0o600 });
      writeFileSync(join(transfer, 'be-release-approval.json'), canonical(resolved.approval) + '\n', { flag: 'wx', mode: 0o600 });
    }
    const bytes = canonical(selection) + '\n'; writeFileSync(join(transfer, 'selection.json'), bytes, { flag: 'wx', mode: 0o600 });
    check('selection.output-channel', Boolean(env.GITHUB_OUTPUT));
    appendFileSync(env.GITHUB_OUTPUT, `artifact_id=${selection.context.artifactId}\nrun_id=${selection.context.producerRun}\nselection_sha=${hash(bytes)}\n`);
  } else if (['consume', 'consume-relay'].includes(action) && args.length === 4) {
    const selection = readRoutineSelection(transfer, env.BE_RELEASE_SELECTION_SHA256, context);
    if (context.authority === 'protected-main' && action === 'consume-relay') {
      check('entry.protected-job', env.GITHUB_JOB === 'production');
      await confirmRoutineSelection(selection, context, githubReader(env.GITHUB_TOKEN, AbortSignal.timeout(120000), fetch, diagnosticContext.getStore()));
    }
    const { approval, archive } = verifyRoutineTransfer(transfer, selection, context, action === 'consume-relay');
    await extractRoutineBundle(archive, approval.archiveDigest, bundle);
    const artifact = await verifyRoutineBundle(bundle, approval, selection, context, controller);
    // Import only after the trusted archive, full inventory and controller source matched.
    const { approvedRoutineRequest, validateReleaseRequest } = await import(pathToFileURL(join(bundle, 'runner/apps/api/build/scripts/ci-delivery.js')).href);
    check('request.packet-size', context.packetDigest === null
      || (typeof env.BE_MIGRATION_PACKET_JSON === 'string' && Buffer.byteLength(env.BE_MIGRATION_PACKET_JSON) <= 65536));
    const trace = diagnosticContext.getStore();
    const approve = () => approvedRoutineRequest(artifact, selection, approval, context,
      context.packetDigest === null ? undefined : observed('request.packet-json', () => JSON.parse(env.BE_MIGRATION_PACKET_JSON)));
    const request = trace ? await trace.boundary('request.approved-contract', approve) : await approve();
    const bytes = canonical(request) + '\n';
    if (action === 'consume-relay') {
      observed('request.relay-binding', () => validateReleaseRequest(readRoutineRequest(transfer, env.BE_RELEASE_REQUEST_SHA256), { version: 1, requestDigest: hash(canonical(request)) }));
    } else {
      writeFileSync(join(transfer, 'request.json'), bytes, { flag: 'wx', mode: 0o600 });
      check('request.output-channel', Boolean(env.GITHUB_OUTPUT));
      appendFileSync(env.GITHUB_OUTPUT, `request_sha=${hash(bytes)}\n`);
      if (context.authority === 'protected-main') {
        check('candidate.summary-channel', Boolean(env.GITHUB_STEP_SUMMARY));
        appendFileSync(env.GITHUB_STEP_SUMMARY, `## Candidate awaiting independent production approval\n\n`
          + `Commit: [${selection.producer.revision}](https://github.com/${repository}/commit/${selection.producer.revision})\n\n`
          + `CI: [${selection.producer.run}](https://github.com/${repository}/actions/runs/${selection.producer.run}) / checks ${selection.checksJobId}\n\n`
          + `Artifact: [${selection.artifact.id}](https://github.com/${repository}/actions/runs/${selection.producer.run}/artifacts/${selection.artifact.id})\n\n`
          + `ZIP SHA-256: \`${selection.artifact.zipDigest}\`\n\nArchive SHA-256: \`${approval.archiveDigest}\`\n\n`
          + `Target: \`${context.target}\` / https://api.lovora.us\n\n`
          + `Configuration: \`${context.configDigest}\`\n\nSchema: \`${context.schemaDigest}\`\n\n`
          + `Request SHA-256: \`${hash(bytes)}\`\n\nNo production credentials or SQL capability; this summary is not approval.\n`);
      }
    }
  } else refuse('entry.action-arguments');
  console.info(JSON.stringify({ version: 1, event: 'phase-confirmed', phase: 'retained-selection', releaseAccepted: false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const diagnostics = await createRoutineDiagnostics(join(process.env.RUNNER_TEMP ?? tmpdir(), 'be-release-diagnostics'), process.env.GITHUB_RUN_ID);
  try {
    await withRoutineDiagnostics(diagnostics, () => diagnostics.boundary('retained-entry', () => main(process.argv.slice(2), process.env)));
  } catch (error) {
    for (const stage of [...(process.argv[2] === 'select' ? ['download', 'consume'] : []), 'create', 'sql', 'promote', 'domain']) {
      diagnostics.event(stage, 'not-run', 'retained-entry-failed');
    }
    emitRoutineResult(routineFailureResult(entryStage, entryCategory)); process.exitCode = 1;
  }
}
