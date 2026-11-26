import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { parseEtsyConfig } from '../src/config/config.js';
import { EtsyCredentials, EtsyFailure } from '../src/etsy/credentials.js';
import { etsyId, EtsyProvider } from '../src/etsy/provider.js';
import { etsyFixture, strictDatabaseFixture } from './etsy-fixture.js';
import { EtsyService } from '../src/etsy/service.js';
import { AppDatabase } from '../src/app-foundation/adapters/postgres.js';
import { AppError } from '../src/app-foundation/application/errors.js';
import { callbackInput } from '../src/etsy/ingress.js';
import { EtsyOwnerClient, loadEtsyOwnerApproval, ownerSettings } from '../scripts/etsy-owner.js';
import type { EtsyOwnerSettings } from '../scripts/etsy-owner.js';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from './helpers.js';
import { parseConfig } from '../src/config/config.js';
import { etsyReleasePhases, runEtsyReleasePhase, continuationCandidate, heldContinuationPhases, validateEtsyContinuationApproval } from '../scripts/etsy-release.js';
import type { EtsyReleasePacket, EtsyReleaseOperations, EtsyReleasePhase } from '../scripts/etsy-release.js';
import { manifestDigest, migrationStatus, migrationsDirectory, runMigrations } from '../scripts/migrations.js';
import { expectedMigrations, migrationManifest } from '../src/generated/migrations.js';
import { assembleArtifact, canonical, sha256 } from '../scripts/artifact.js';
import { activationRuntimeKeys, runtimeConfigDigest } from '../src/config/activation-config.js';
import { artifactFixture, routineProviderFixture, strictReleaseFixture, replacementContinuationFixture } from './artifact-fixture.js';
import { readEvidence, writeReleaseEvidence } from '../scripts/release-journal.js';
import childProcess from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { tlsPostgres } from './tls.js';
import { authenticateRoutineDelivery, runRoutinePhase, validateReleaseResult } from '../scripts/ci-delivery.js';
import type { ReleaseResult } from '../scripts/ci-delivery.js';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };
import { Client } from 'pg';
import fs from 'node:fs';
import type { MigrationReport } from '../scripts/migrations.js';
import { checkHostedHttp } from '../scripts/hosted-acceptance.js';

test('foundation-enabled held phase rehearsal preserves strict pending HTTP through real suffix SQL and same-ID acceptance',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  for (const scenario of ['exact', 'unsafe-readiness', 'failed-sql']) await t.test(scenario, async t => {
    let app: Awaited<ReturnType<typeof createApplication>> | undefined;
    let cleanupRole: (() => Promise<void>) | undefined;
    // Close runtime connections and revoke this owned role before the fixture
    // hook drops its database. A role collision is never adopted.
    t.after(async () => { await app?.close(); await cleanupRole?.(); });
    const fixture = await strictDatabaseFixture(t);
    const root = await realpath(await mkdtemp(join(tmpdir(), 'esty-health-phase-'))), beforeDirectory = join(root, 'before');
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(beforeDirectory);
    for (const entry of migrationManifest.slice(0, 3)) await cp(join(migrationsDirectory, `${entry.name}.mjs`), join(beforeDirectory, `${entry.name}.mjs`));
    const initial = await runMigrations(fixture.database, { directory: beforeDirectory });
    assert.equal(initial.result, 'success');
    assert.deepEqual(initial.after, expectedMigrations.slice(0, 3));
    const runtimePassword = randomBytes(24).toString('hex');
    await fixture.client.query(`CREATE ROLE app_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    cleanupRole = async () => { await fixture.client.query('DROP OWNED BY app_runtime; DROP ROLE app_runtime'); };
    await fixture.client.query(`GRANT CONNECT ON DATABASE "${fixture.name}" TO app_runtime;
      GRANT USAGE ON SCHEMA public TO app_runtime;
      GRANT SELECT ON public.foundation_migrations TO app_runtime`);
    const f = replacementContinuationFixture(Date.now()), candidate = continuationCandidate(f.approval);
    const candidateOrigin = `https://${candidate.toLowerCase()}.invalid`;
    const values = {
      DATABASE_URL: `postgresql://app_runtime:${runtimePassword}@127.0.0.1:${fixture.owned.port}/${scenario === 'unsafe-readiness' ? `missing_${fixture.name}` : fixture.name}`,
      APP_SCHEMA_MODE: 'strict', APP_FOUNDATION_ENABLED: 'true', APP_WORKSPACE_ID: randomUUID(),
      APP_AUTH_URL: `http://127.0.0.1:${fixture.owned.port}`, APP_AUTH_API_KEY: 'synthetic-public-key',
      PREVIEW_ACCESS_KEY: 'c'.repeat(64), BROWSER_ORIGIN: f.packet.browserOrigin,
    };
    const digest = runtimeConfigDigest(values);
    app = await createApplication(parseConfig({ ...values, APP_ACTIVATION_CONFIG_DIGEST: digest }));
    await app.listen(0, '127.0.0.1');
    const local = await app.getUrl(), requests: string[] = [];
    const http = async (raw: string, init: RequestInit = {}) => {
      const target = new URL(raw);
      assert.ok([candidateOrigin, 'https://api.lovora.us'].includes(target.origin));
      requests.push(target.origin + target.pathname);
      // Only the synthetic provider/domain mapping is replaced. Nest, bearer,
      // CORS, config attestation, pg readiness and migration SQL are real.
      const response = await fetch(local + target.pathname, { ...init, signal: AbortSignal.timeout(4500) });
      const authorized = init.method !== 'OPTIONS' && ['/health/live', '/health/ready'].includes(target.pathname)
        && new Headers(init.headers).get('authorization') === `Bearer ${values.PREVIEW_ACCESS_KEY}`;
      assert.equal(response.headers.get('x-activation-config-digest'), authorized ? digest : null);
      if (response.status === 503) assert.equal(response.headers.get('cache-control'), 'private, no-store');
      return response;
    };
    const pending = await http(candidateOrigin + '/health/ready', { headers: { Authorization: `Bearer ${values.PREVIEW_ACCESS_KEY}` } });
    assert.equal(pending.status, 503);
    assert.deepEqual(await pending.json(), { status: 'degraded',
      reason: scenario === 'unsafe-readiness' ? 'database_unavailable' : 'migrations_pending' });
    writeReleaseEvidence(join(root, 'claim.json'), { kind: 'synthetic-serialized-claim', request: sha256(canonical(f.request)) });
    const continuation = { approval: f.approval, origin: f.origin, stoppedReceipt: f.stoppedZip,
      claimDigest: readEvidence(join(root, 'claim.json')).identity.sha256 };
    let alias = f.packet.predecessor.id, sql = 0, promotions = 0, remote = continuation.claimDigest;
    const operations: Omit<EtsyReleaseOperations, 'create'> = {
      verify() { validateEtsyContinuationApproval(f.approval, f.digest); },
      async currentMain() { return { revision: f.approval.operator.revision, tree: f.approval.operator.tree }; },
      async history() { return (await migrationStatus(fixture.database)).applied; },
      async predecessor(afterSql) {
        assert.equal(alias, f.packet.predecessor.id);
        assert.deepEqual((await migrationStatus(fixture.database)).applied, expectedMigrations.slice(0, afterSql ? 4 : 3));
      },
      async candidate(id, pending, final) {
        assert.equal(id, candidate);
        if (final) assert.equal(alias, id);
        await checkHostedHttp(final ? 'https://api.lovora.us' : candidateOrigin,
          f.packet.browserOrigin, values.PREVIEW_ACCESS_KEY, http, pending ? 'migrations_pending' : 'current');
      },
      async migrate() {
        sql++;
        const query = Client.prototype.query;
        const fault = scenario === 'failed-sql' ? t.mock.method(Client.prototype, 'query', function(this: Client, ...args: any[]) {
          const text = typeof args[0] === 'string' ? args[0] : args[0]?.text;
          return Reflect.apply(query, this, text?.includes('CREATE TABLE app_private.etsy_connections') ? ['SELECT 1 / 0'] : args);
        }) : undefined;
        try {
          return await runMigrations(fixture.database, { sourceRevision: f.packet.revision, target: f.packet.target,
            expectedBefore: expectedMigrations.slice(0, 3) });
        } finally { fault?.mock.restore(); }
      },
      async promote(id) { assert.equal(id, candidate); promotions++; alias = id; return { code: 0, aborted: false, stdout: '' }; },
      async alias(id) { assert.equal(alias, id); },
    };
    const durability = {
      directory: root,
      async intent(_phase: EtsyReleasePhase, intent: { previous: string | null }) { assert.equal(intent.previous, remote); },
      async acknowledged() { assert.fail('The held rehearsal must not CREATE'); },
      async confirmed(phase: EtsyReleasePhase, receipt: unknown) {
        const entry = readEvidence(join(root, f.approval.runId, `${phase}.receipt.json`));
        assert.deepEqual(entry.value, receipt); remote = entry.identity.sha256;
      },
    };
    const journey = async () => {
      for (const phase of heldContinuationPhases) await runEtsyReleasePhase({
        packet: f.packet, packetDigest: f.digest, phase, operations, durability, continuation, signal: AbortSignal.timeout(30000) });
    };
    if (scenario === 'exact') {
      await journey();
      assert.equal(sql, 1); assert.equal(promotions, 1); assert.equal(alias, candidate);
      assert.ok(requests.includes('https://api.lovora.us/health/ready'));
      const receipt = readEvidence(join(root, f.approval.runId, 'final-domain-ack.receipt.json')).value as { deploymentId: string };
      assert.equal(receipt.deploymentId, candidate);
    } else {
      await assert.rejects(journey());
      assert.equal(sql, scenario === 'failed-sql' ? 1 : 0);
      assert.equal(promotions, 0); assert.equal(alias, f.packet.predecessor.id);
      assert.equal(fs.existsSync(join(root, f.approval.runId, 'promote-only.intent.json')), false);
      const stop = readEvidence(join(root, f.approval.runId, 'STOP.json')).value as { phase: string };
      assert.equal(stop.phase, scenario === 'unsafe-readiness' ? 'pre-sql-check' : 'sql-apply');
    }
    if (sql) {
      const report = readEvidence(join(root, f.approval.runId, 'migration-report.json')).value as MigrationReport;
      assert.equal(report.database_outcome, scenario === 'exact' ? 'committed' : 'rolled_back');
      assert.deepEqual(report.attempted, [{ ...migrationManifest[3]!, outcome: scenario === 'exact' ? 'applied_committed' : 'rolled_back' }]);
    }
    assert.deepEqual((await migrationStatus(fixture.database)).applied, expectedMigrations.slice(0, scenario === 'exact' ? 4 : 3));
    assert.equal((await fixture.client.query("SELECT to_regclass('app_private.etsy_connections') IS NOT NULL AS present")).rows[0].present, scenario === 'exact');
    t.diagnostic(JSON.stringify({ scenario, foundation: true, realSql: sql, syntheticPromotions: promotions,
      realProviderCalls: 0, create: 0, migrations: scenario === 'exact' ? 4 : 3, finalDomain: scenario === 'exact' }));
  });
});

test('L3 owned emitted strict journey changes only fourth migration and the same held deployment', {
  skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 60000,
}, async t => {
  for (const fault of ['exact', 'report-failure', 'lost-commit']) await t.test(fault, async scenario => {
  const db = await strictDatabaseFixture(scenario);
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'esty-l3-journey-')));
  scenario.after(() => rm(scratch, { recursive: true, force: true }));
  const before = join(scratch, 'before'); await mkdir(before);
  for (const row of migrationManifest.slice(0, 3)) await cp(join(migrationsDirectory, `${row.name}.mjs`), join(before, `${row.name}.mjs`));
  assert.equal((await runMigrations(db.database, { directory: before })).database_outcome, 'committed');
  await scenario.test('authenticated strict controller and isolated SQL workers', async child => {
    const peer = await tlsPostgres(child, approvedTarget.SUPABASE_SESSION_HOST, undefined, true);
    const target = Object.fromEntries(Object.entries(approvedTarget).filter(([key]) => key.startsWith('SUPABASE_')));
    const logicalUrl = `postgresql://${approvedTarget.SUPABASE_DATABASE_USER}:${db.owned.password}@${approvedTarget.SUPABASE_SESSION_HOST}:5432/postgres`;
    const runtime: Record<string, string> = { ...Object.fromEntries(activationRuntimeKeys.map(key => [key, ''])), ...target,
      API_RUNTIME: 'vercel', VERCEL: '1', APP_SCHEMA_MODE: 'strict', APP_FOUNDATION_ENABLED: 'false', ETSY_ENABLED: 'false',
      DATABASE_URL: logicalUrl, DATABASE_CA_PEM: peer.ca, BROWSER_ORIGIN: 'https://app.lovora.us', PREVIEW_ACCESS_KEY: 'c'.repeat(64) };
    runtime.APP_ACTIVATION_CONFIG_DIGEST = runtimeConfigDigest(runtime);
    const oldRuntime: Record<string, string> = { ...runtime, ETSY_CLIENT_ID: 'independent-old-config' };
    oldRuntime.APP_ACTIVATION_CONFIG_DIGEST = runtimeConfigDigest(oldRuntime);
    const current = parseConfig(runtime), old = parseConfig(oldRuntime);
    assert.equal(current.appFoundation, undefined);
    const transport = { ...db.database, port: peer.port, ssl: current.database.ssl };
    const previousApp = await createApplication({ ...old, database: transport }, migrationManifest.slice(0, 3).map(row => row.name));
    const heldApp = await createApplication({ ...current, database: transport }, migrationManifest.map(row => row.name));
    child.after(async () => { await heldApp.close(); await previousApp.close(); });
    await previousApp.listen(0, '127.0.0.1'); await heldApp.listen(0, '127.0.0.1');
    const origins = [await previousApp.getUrl(), await heldApp.getUrl()];
    const forbidden = new Set([54322, 55432, 55433, 55440, 55441, 55442, 55443, 55444, 55532,
      55540, 55541, 55542, 55543, 55544, 55644, db.owned.port]);
    const ports = [peer.port, ...origins.map(origin => Number(new URL(origin).port))];
    assert.equal(new Set(ports).size, 3); for (const port of ports) assert.equal(forbidden.has(port), false);
    console.info(JSON.stringify({ event: 'l3_owned_resources', container: db.owned.id, owner: db.owned.name,
      postgres: db.owned.port, tls: peer.port, applications: ports.slice(1) }));
    const values = { ...target, MIGRATION_TARGET: 'supabase', MIGRATION_CONFIRM_PROJECT_REF: approvedTarget.SUPABASE_PROJECT_REF,
      MIGRATION_DATABASE_URL: logicalUrl, DATABASE_CA_PEM: peer.ca };
    const f = await strictReleaseFixture(runtimeConfigDigest(runtime), sha256(canonical(values)),
      `supabase:${approvedTarget.SUPABASE_PROJECT_REF}`, runtimeConfigDigest(oldRuntime));
    child.after(f.dispose);
    const authenticated = await authenticateRoutineDelivery({ bundle: f.bundle, transfer: f.transfer, env: f.env, read: f.read });
    assert.equal(authenticated.artifact.digest, f.artifact.digest);
    assert.deepEqual(authenticated.request, f.request);
    const nativeFetch = globalThis.fetch, nativeSpawn = childProcess.spawn.bind(childProcess);
    const responses: Array<{ predecessor: boolean; path: string; status: number; digest: string | null }> = [];
    const h = routineProviderFixture(f.artifact, '', undefined, { packet: f.packet, async http(url, init, predecessor) {
      const path = new URL(url).pathname;
      const response = await nativeFetch(origins[predecessor ? 0 : 1] + path, init);
      responses.push({ predecessor, path, status: response.status, digest: response.headers.get('x-activation-config-digest') });
      return response;
    } });
    child.mock.method(globalThis, 'fetch', h.transport);
    child.mock.method(childProcess, 'spawn', (binary: string, args: readonly string[]) => {
      assert.equal(binary, process.execPath); assert.equal(args[0], f.cli);
      const processStub = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
      queueMicrotask(async () => {
        try {
          const result = args[1] === 'deploy' ? await h.cli.create() : await h.cli.promote(args[2]!);
          processStub.stdout.end(result.stdout); processStub.stderr.end(); processStub.emit('close', result.code);
        } catch { processStub.emit('error', new Error('Synthetic provider CLI refused')); }
      });
      return processStub as unknown as ChildProcess;
    });
    syncBuiltinESMExports(); child.after(() => { child.mock.restoreAll(); syncBuiltinESMExports(); });
    const reports = join(scratch, 'reports'), script = join(scratch, 'sql-worker.mjs');
    await writeFile(script, `
      import assert from 'node:assert/strict'; import fs from 'node:fs'; import net from 'node:net';
      import {mock} from 'node:test';
      import {createRequire,syncBuiltinESMExports} from 'node:module';
      const input=JSON.parse(process.env.L3_WORKER_INPUT); delete process.env.L3_WORKER_INPUT;
      assert.equal(Object.keys(process.env).some(key=>/GITHUB_TOKEN|VERCEL_TOKEN|APP_AUTH_|APP_OPERATOR_|APP_ROLES_/.test(key)),false);
      const owned=JSON.parse(fs.readFileSync(input.marker,'utf8'));assert.equal(owned.id,input.owner);
      const config=await import(${JSON.stringify(new URL('../src/config/config.js', import.meta.url).href)});
      mock.module(${JSON.stringify(new URL('../src/config/config.js', import.meta.url).href)},{exports:{...config,
        parseMigrationConfig(env){const parsed=config.parseMigrationConfig(env);assert.equal(parsed.ssl.rejectUnauthorized,true);
          return {...parsed,host:'127.0.0.1',port:input.port,user:'postgres',password:owned.password,database:input.database};}}});
      const connect=net.Socket.prototype.connect;
      net.Socket.prototype.connect=function(...args){const value=typeof args[0]==='object'?args[0]:{port:args[0],host:args[1]};
        if(!value||value.host!=='127.0.0.1'||Number(value.port)!==input.port)throw Error('Unleased socket');
        return connect.apply(this,args);};
      if(input.fault==='report-failure'&&input.env.BE_ROUTINE_ACTION==='migrate'){
        const open=fs.openSync;fs.openSync=(path,...args)=>{
          if(String(path).includes('/migration-reports/'))throw Object.assign(Error('Synthetic EIO'),{code:'EIO'});
          return open(path,...args);};syncBuiltinESMExports();
      }
      if(input.fault==='lost-commit'&&input.env.BE_ROUTINE_ACTION==='migrate'){
        const {Client}=createRequire(${JSON.stringify(new URL('../../package.json', import.meta.url).href)})('pg');
        let applying=false;const query=Client.prototype.query;Client.prototype.query=async function(...args){
          const result=await query.apply(this,args),text=typeof args[0]==='string'?args[0]:args[0].text;
          if(text.includes('CREATE TABLE app_private.etsy_connections'))applying=true;
          if(applying&&text.trim().replace(/;$/,'').toUpperCase()==='COMMIT')throw Error('Synthetic lost COMMIT ACK');
          return result;};
      }
      globalThis.fetch=()=>{throw Error('SQL worker has no provider transport');};
      const {verifyArtifact}=await import(${JSON.stringify(new URL('../scripts/artifact.js', import.meta.url).href)});
      const {runRoutinePhase}=await import(${JSON.stringify(new URL('../scripts/ci-delivery.js', import.meta.url).href)});
      try{await runRoutinePhase({...input,artifact:verifyArtifact(input.artifactRoot,input.request.artifactDigest),signal:AbortSignal.timeout(15000)});}
      catch{process.exitCode=1;}
    `, { mode: 0o600 });
    const providerEnv = { GITHUB_TOKEN: h.credentials.github, VERCEL_TOKEN: h.credentials.vercel,
      BE_PREVIEW_ACCESS_KEY: h.credentials.bearer, VERCEL_AUTOMATION_BYPASS_SECRET: h.credentials.bypass };
    let stopped: ReleaseResult | undefined, accepted: ReleaseResult | undefined;
    for (const action of ['authorize', 'history', 'held', 'migrate', 'deliver']) {
      if (action === 'history' || action === 'migrate') {
        const input = { artifactRoot: f.artifact.root, request: f.request, cli: f.cli, reports, fault,
          env: { ...f.env, BE_ROUTINE_ACTION: action, BE_MIGRATION_INPUTS: JSON.stringify(values) },
          marker: join(process.env.ETSY_TEST_FIXTURE_DIRECTORY!, 'fixture.json'), owner: db.owned.id, port: peer.port, database: db.name };
        const worker = nativeSpawn(process.execPath, ['--experimental-test-module-mocks', script], {
          env: { PATH: '/usr/bin:/bin', HOME: scratch, L3_WORKER_INPUT: JSON.stringify(input) },
          stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
        let output = ''; worker.stdout.on('data', chunk => { output += String(chunk); }); worker.stderr.on('data', chunk => { output += String(chunk); });
        const [code] = await once(worker, 'close');
        assert.equal(output.includes(db.owned.password), false, 'Worker output must not contain fixture credentials');
        if (fault !== 'exact' && action === 'migrate') {
          assert.equal(code, 1, output);
          const results = output.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
            .filter(row => typeof row.status === 'string');
          assert.equal(results.length, 1);
          stopped = validateReleaseResult(results[0]); break;
        }
        assert.equal(code, 0, output);
      } else accepted = await runRoutinePhase({ artifact: authenticated.artifact, request: authenticated.request, cli: f.cli, reports,
        env: { ...f.env, ...providerEnv, BE_ROUTINE_ACTION: action }, signal: AbortSignal.timeout(15000) });
    }
    if (stopped) {
      assert.equal(stopped.status, 'unknown', JSON.stringify(stopped)); assert.equal(stopped.deploymentId, 'dpl_candidate');
      assert.equal(stopped.effects.create, 'ACKed'); assert.equal(stopped.effects.promotion, 'not-started');
      assert.equal(stopped.effects.migration, fault === 'report-failure' ? 'ACKed' : 'unknown');
      assert.equal(stopped.migration?.database_outcome, fault === 'report-failure' ? 'committed' : 'unknown');
      assert.equal(stopped.migration?.reporting, fault === 'report-failure' ? 'failed' : 'written');
      assert.deepEqual(stopped.migration?.before, migrationManifest.slice(0, 3).map(row => row.name));
      assert.deepEqual(stopped.migration?.after, fault === 'report-failure' ? migrationManifest.map(row => row.name) : null);
      assert.deepEqual((await migrationStatus(db.database)).applied, migrationManifest.map(row => row.name));
      const events = [...h.events];
      await assert.rejects(runRoutinePhase({ artifact: authenticated.artifact, request: authenticated.request, cli: f.cli, reports,
        env: { ...f.env, ...providerEnv, BE_ROUTINE_ACTION: 'deliver' }, signal: AbortSignal.timeout(15000) }));
      assert.deepEqual(h.events, events); assert.deepEqual(h.counts(), { creates: 1, promotions: 0 });
      return;
    }
    assert.equal(accepted?.status, 'accepted');
    assert.equal(accepted.deploymentId, 'dpl_candidate'); assert.equal(accepted.migration?.database_outcome, 'committed');
    assert.deepEqual(h.counts(), { creates: 1, promotions: 1 });
    const report = readEvidence(join(reports, 'strict', f.packet.runId, 'migration-report.json')).value as {
      database_outcome: string; reporting: string; before: string[]; after: string[]; attempted: Array<{ name: string; outcome: string }> };
    assert.equal(report.database_outcome, 'committed'); assert.equal(report.reporting, 'written');
    assert.deepEqual(report.before, migrationManifest.slice(0, 3).map(row => row.name));
    assert.deepEqual(report.after, migrationManifest.map(row => row.name));
    assert.deepEqual(report.attempted.map(row => [row.name, row.outcome]), [[migrationManifest[3]!.name, 'applied_committed']]);
    const history = await migrationStatus(db.database); assert.deepEqual(history.applied, report.after);
    assert.equal((await db.client.query("SELECT to_regclass('auth.sessions') AS sessions")).rows[0].sessions, null);
    for (const [predecessor, status, digest] of [[true, 200, oldRuntime.APP_ACTIVATION_CONFIG_DIGEST],
      [true, 503, oldRuntime.APP_ACTIVATION_CONFIG_DIGEST], [false, 503, runtime.APP_ACTIVATION_CONFIG_DIGEST],
      [false, 200, runtime.APP_ACTIVATION_CONFIG_DIGEST]] as const) {
      assert.ok(responses.some(row => row.predecessor === predecessor && row.path === '/health/ready'
        && row.status === status && row.digest === digest));
    }
    assert.equal(h.statuses[0]!.state, 'success');
    assert.equal(JSON.stringify(responses).includes(db.owned.password), false);
  });
  });
});

const config = parseEtsyConfig({ ETSY_ENABLED: 'true', APP_FOUNDATION_ENABLED: 'true', ETSY_CLIENT_ID: 'synthetic_app',
  ETSY_SHARED_SECRET: randomBytes(24).toString('hex'), ETSY_CALLBACK_URL: 'https://api.lovora.us/integrations/etsy/callback',
  ETSY_RETURN_ORIGIN: 'https://website.example', ETSY_INVITATION_ORIGIN: 'https://invite.example',
  ETSY_INVITATION_TTL_SECONDS: '600', ETSY_RETENTION_SECONDS: '900', ETSY_TOKEN_ACTIVE_KEY_ID: 'test',
  ETSY_TOKEN_KEYRING: JSON.stringify({ test: randomBytes(32).toString('base64url') }) })!;
const signal = (): AbortSignal => AbortSignal.timeout(8000);
const tokenResponse = { access_token: '9223372036854775807.synthetic', refresh_token: 'synthetic-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'shops_r' };

test('callback envelope requires the exact decoded Etsy issuer and rejects ambiguous or secret-reflecting inputs', () => {
  const stateValue = 'a'.repeat(43), issuer = 'https%3A%2F%2Fopenapi.etsy.com';
  for (const iss of ['https://openapi.etsy.com', issuer]) {
    assert.deepEqual(callbackInput(`state=${stateValue}&code=code&iss=${iss}`), { state: stateValue, code: 'code' });
    assert.deepEqual(callbackInput(`state=${stateValue}&error=access_denied&iss=${iss}&error_description=private-synthetic&error_uri=https%3A%2F%2Fevil.example`),
      { state: stateValue, code: null });
    assert.deepEqual(callbackInput(`state=${stateValue}&error=access_denied&iss=${iss}`), { state: stateValue, code: null });
  }
  for (const outcome of ['code=code', 'error=access_denied']) {
    for (const suffix of ['', '&iss=', '&iss=https://api.etsy.com', '&iss=https://openapi.etsy.com/',
      '&iss=https://OPENAPI.etsy.com', '&iss=https://openapi.etsy.com:443', '&iss=http://openapi.etsy.com',
      '&iss=https://openapi.etsy.com.evil.example', '&iss=https://openapi.etsy.com%00',
      `&iss=${issuer}&iss=${issuer}`, `&iss=${issuer}&%69ss=${issuer}`, `&iss=${issuer}&unknown=x`]) {
      assert.throws(() => callbackInput(`state=${stateValue}&${outcome}${suffix}`), { code: 'invalid_request' });
    }
  }
  for (const value of ['', `state=${stateValue}`, `state=${stateValue}&code=`, `state=${stateValue}&code=code&error=denied`,
    `state=${stateValue}&state=${stateValue}&code=code`, `state=${stateValue}&code=code&workspace=x`,
    `state=${stateValue}&code=has+space`, `state=${stateValue}&code=%ZZ`, `state=${stateValue}&error=${'x'.repeat(4096)}`,
    `state=${'a'.repeat(42)}&code=code`, `state=${stateValue}&error=`, `state=${stateValue}&error=x&error=x`]) {
    assert.throws(() => callbackInput(`${value}&iss=${issuer}`), { code: 'invalid_request' });
  }
});

test('credential envelopes reject tampering, row/purpose substitution and missing keys', () => {
  const cipher = new EtsyCredentials(config);
  const envelope = cipher.seal('private-token', 'workspace/connection/1/credential');
  assert.equal(cipher.open(envelope, 'workspace/connection/1/credential'), 'private-token');
  assert.throws(() => cipher.open(envelope, 'workspace/connection/2/credential'), EtsyFailure);
  assert.throws(() => cipher.open(envelope, 'workspace/connection/1/verifier'), EtsyFailure);
  for (const changed of [{ ...envelope, keyId: 'missing' }, { ...envelope, tag: randomBytes(16).toString('base64url') },
    { ...envelope, nonce: randomBytes(12).toString('base64url') }, { ...envelope, ciphertext: '' }]) {
    assert.throws(() => cipher.open(changed, 'workspace/connection/1/credential'), EtsyFailure);
  }
});

test('selected protocol sends exact form/header boundaries and preserves full int64 identity', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const provider = new EtsyProvider(config, async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith('/oauth/token')) return Response.json(tokenResponse);
    if (url.endsWith('/users/me')) return new Response('{"user_id":9223372036854775807,"shop_id":9007199254740993}');
    return new Response('{"shop_id":9007199254740993,"user_id":9223372036854775807,"shop_name":"Synthetic Shop","currency_code":"USD","private_field":"discard"}');
  });
  const auth = provider.authorization();
  const url = new URL(auth.url);
  assert.equal(url.origin, 'https://www.etsy.com');
  assert.equal(url.searchParams.get('scope'), 'shops_r');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.has('code_verifier'), false);
  const tokens = await provider.exchange('synthetic-code', auth.verifier, signal());
  const data = await provider.metadata(tokens, '9007199254740993', null, signal());
  assert.deepEqual(data, { etsyUserId: '9223372036854775807', shopId: '9007199254740993', shopName: 'Synthetic Shop', currencyCode: 'USD' });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[0]!.init.body as string)), {
    grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: config.callbackUrl,
    code: 'synthetic-code', code_verifier: auth.verifier,
  });
  for (const request of requests) {
    assert.equal(new URL(request.url).origin, 'https://api.etsy.com');
    assert.equal(new URL(request.url).search, '');
    assert.equal(request.init.redirect, 'error');
    assert.equal(new Headers(request.init.headers).get('x-api-key'), `${config.clientId}:${config.sharedSecret}`);
  }
  assert.equal(new Headers(requests[1]!.init.headers).get('authorization'), `Bearer ${tokens.accessToken}`);
  await provider.refresh(tokens.refreshToken, signal());
  assert.equal(new URLSearchParams(requests[3]!.init.body as string).get('grant_type'), 'refresh_token');
});

test('malformed tokens, identities, scopes and oversized responses cannot authorize a connection', async () => {
  for (const response of [{ ...tokenResponse, scope: undefined }, { ...tokenResponse, scope: 'shops_r email_r' },
    { ...tokenResponse, refresh_token: '' }, { ...tokenResponse, token_type: 'bearer' }, { ...tokenResponse, expires_in: 3601 }]) {
    const provider = new EtsyProvider(config, async () => Response.json(response));
    await assert.rejects(provider.exchange('code', 'a'.repeat(43), signal()), EtsyFailure);
  }
  for (const id of [0, -1, 9007199254740992, '01', '9223372036854775808', '1e3']) assert.throws(() => etsyId(id));
  const oversized = new EtsyProvider(config, async () => new Response('x'.repeat(65537)));
  await assert.rejects(oversized.exchange('code', 'a'.repeat(43), signal()), { code: 'upstream_unavailable' });
  const wrong = new EtsyProvider(config, async () => Response.json({ user_id: 2, shop_id: 1 }));
  await assert.rejects(wrong.metadata({ accessToken: '2.token', refreshToken: 'refresh', tokenType: 'Bearer', scope: 'shops_r', expiresAt: Date.now() + 60000 }, '3', null, signal()), { code: 'reconnect_required' });
});

test('rate limits and body cancellation are bounded and never retried', async () => {
  for (const [header, expected] of [['9999999999', 86400], ['bad', 60], ['2', 2]] as const) {
    let calls = 0;
    const provider = new EtsyProvider(config, async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': header } }); });
    await assert.rejects(provider.exchange('code', 'a'.repeat(43), signal()), { code: 'upstream_rate_limited', retryAfterSeconds: expected });
    assert.equal(calls, 1);
  }
  let cancelled = false;
  const reading = Promise.withResolvers<void>();
  const provider = new EtsyProvider(config, async () => new Response(new ReadableStream({
    pull() { reading.resolve(); }, cancel() { cancelled = true; },
  })));
  const controller = new AbortController();
  const pending = provider.exchange('code', 'a'.repeat(43), controller.signal);
  await reading.promise;
  controller.abort();
  await assert.rejects(pending, { code: 'upstream_unavailable' });
  assert.equal(cancelled, true);
});

test('owned PostgreSQL and actual Nest HTTP enforce Etsy invitation, callback and lifecycle boundaries',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  const fixture = await etsyFixture(t, config);
  const { api, admin, state, calls } = fixture;
  const service = fixture.app.get(EtsyService);
  const db = fixture.app.get(AppDatabase);
  const originalTransaction = db.transaction.bind(db);
  let loseAck: ((sql: string) => boolean) | undefined;
  db.transaction = async (signalValue, work) => {
    let matched = false;
    const result = await originalTransaction(signalValue, async client => {
      const originalQuery = client.query.bind(client);
      client.query = new Proxy(client.query, {
        apply(target, _receiver, args: unknown[]) {
          if (typeof args[0] === 'string' && loseAck?.(args[0])) matched = true;
          return Reflect.apply(target, client, args);
        },
      });
      try { return await work(client); } finally { client.query = originalQuery; }
    });
    if (matched) { loseAck = undefined; throw new AppError('dependency_unavailable'); }
    return result;
  };
  async function current() {
    const result = await api('');
    assert.equal(result.status, 200);
    return result.body;
  }
  async function invite() {
    const status = await current();
    const result = await api('/invitations', 'owner', { expectedShopId: '8', expectedRevision: status.revision, idempotencyKey: randomUUID() });
    assert.equal(result.status, 200);
    assert.ok(typeof result.body.shareUrl === 'string');
    return { ...result.body, secret: new URL(result.body.shareUrl).hash.slice(1) };
  }
  async function start() {
    const offer = await invite();
    const response = await fixture.start(offer.secret);
    assert.equal(response.status, 303);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const authorization = new URL(response.headers.get('location')!);
    assert.equal(authorization.origin, 'https://www.etsy.com');
    return { ...offer, oauthState: authorization.searchParams.get('state')! };
  }
  async function connect() {
    const offer = await start();
    const response = await fixture.callback(offer.oauthState);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://website.example/');
    assert.equal((await current()).state, 'active');
    return offer;
  }
  async function disconnect() {
    const status = await current();
    assert.equal((await api('/disconnect', 'owner', { expectedRevision: status.revision, idempotencyKey: randomUUID() })).status, 200);
  }

  await t.test('Owner/Member/foreign scope, exact ingress and preview safety', async () => {
    for (const authorization of [undefined, `Bearer ${'0'.repeat(64)}`,
      [`Bearer ${fixture.technical}`, `Bearer ${fixture.technical}`]]) {
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(fixture.origin + '/integrations/etsy/invite/start', {
          method: 'POST', timeout: 2500, headers: { Host: 'api.lovora.us', Origin: config.invitationOrigin,
            'Content-Type': 'application/json', 'Content-Length': '8192',
            ...(authorization ? { Authorization: authorization } : {}) },
        }, response => {
          response.resume();
          response.once('end', () => { request.destroy(); resolve(response.statusCode!); });
        });
        request.once('timeout', () => request.destroy(new Error('Bearer refusal waited for the withheld body.')));
        request.once('error', reject);
        request.flushHeaders(); // Deliberately never send the declared body.
      });
      assert.equal(status, 401, 'Missing, wrong or duplicate bearer must reject before body consumption.');
    }
    assert.equal((await api('', 'member')).status, 403);
    assert.equal((await api('', 'foreign')).status, 403);
    assert.equal((await api('/invitations', 'member', { expectedShopId: '8', expectedRevision: 0, idempotencyKey: randomUUID() })).status, 403);
    for (const path of ['/integrations/etsy/invite', '/integrations/etsy/callback/', '/integrations/etsy/Callback?state=x',
      '/integrations/etsy/%63allback?state=x', '/integrations/etsy/invite/start/']) {
      const response = await fetch(fixture.origin + path, { headers: { Host: 'api.lovora.us' }, redirect: 'manual' });
      assert.equal(response.status, 401, path);
    }
    for (const method of ['HEAD', 'POST']) {
      assert.equal((await fetch(fixture.origin + '/integrations/etsy/callback?state=x', { method, headers: { Host: 'api.lovora.us' } })).status, 401);
    }
    const offer = await invite();
    const badOrigin = await fetch(fixture.origin + '/integrations/etsy/invite/start', { method: 'POST', headers: {
      Host: 'api.lovora.us', Authorization: `Bearer ${fixture.technical}`,
      Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: offer.secret }) });
    assert.equal(badOrigin.status, 400);
    assert.equal((await badOrigin.text()).includes(offer.secret), false);
    for (const body of ['[]', '{"secret":1}', JSON.stringify({ secret: offer.secret, extra: true }), '{',
      JSON.stringify({ secret: 'invalid' })]) {
      const response = await fetch(fixture.origin + '/integrations/etsy/invite/start', {
        method: 'POST', headers: { Host: 'api.lovora.us', Authorization: `Bearer ${fixture.technical}`,
          Origin: config.invitationOrigin, 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, 400);
      assert.equal(await response.text(), 'Connection request unavailable.');
    }
    for (const host of ['invite.example', 'wrong.example']) {
      const response = await fetch(fixture.origin + '/integrations/etsy/invite/start', {
        method: 'POST', headers: { Host: host, 'X-Forwarded-Host': 'api.lovora.us',
          Authorization: `Bearer ${fixture.technical}`, Origin: config.invitationOrigin,
          'Content-Type': 'application/json' }, body: JSON.stringify({ secret: offer.secret }) });
      assert.equal(response.status, 404, 'Forwarded Host must not authorize a start on the wrong actual Host.');
    }
    const emptyCallback = await fetch(fixture.origin + '/integrations/etsy/callback', { headers: { Host: 'api.lovora.us' } });
    assert.equal(emptyCallback.status, 400);
    const oversized = await fixture.start('x'.repeat(9000));
    assert.equal(oversized.status, 400);
    assert.equal((await api('/invitations?limit=101')).status, 400);
    assert.equal((await api(`/invitations?cursor=${randomUUID()}`)).status, 400);
    assert.equal(JSON.stringify((await api('/invitations')).body).includes(offer.secret), false);
    assert.equal((await admin.query("SELECT count(*)::integer AS count FROM app_private.etsy_authorization_attempts")).rows[0].count, 0);
    const starts = await Promise.all([fixture.start(offer.secret), fixture.start(offer.secret)]);
    assert.deepEqual(starts.map(response => response.status).sort(), [303, 400]);
    const consent = new URL(starts.find(response => response.status === 303)!.headers.get('location')!);
    const oauthState = consent.searchParams.get('state')!;
    const before = state.tokenCalls;
    for (const outcome of ['code=private-synthetic-code', 'error=access_denied']) {
      for (const suffix of ['', '&iss=', '&iss=https://wrong.example', '&iss=https://openapi.etsy.com&iss=https://openapi.etsy.com',
        '&iss=https://openapi.etsy.com&unknown=x', '&iss=https://openapi.etsy.com&' + (outcome.startsWith('code=') ? 'error=denied' : 'code=code')]) {
        const refused = await fetch(`${fixture.origin}/integrations/etsy/callback?state=${oauthState}&${outcome}${suffix}`,
          { headers: { Host: 'api.lovora.us' }, redirect: 'manual' });
        assert.equal(refused.status, 400);
        assert.equal(refused.headers.get('location'), null);
        assert.match(refused.headers.get('cache-control') ?? '', /no-store/);
        assert.doesNotMatch(await refused.text(), new RegExp(`${oauthState}|private-synthetic-code|wrong\\.example`));
        assert.equal(state.tokenCalls, before);
      }
    }
    const duplicate = await fetch(`${fixture.origin}/integrations/etsy/callback?state=${oauthState}&state=${oauthState}&code=code&iss=https://openapi.etsy.com`,
      { headers: { Host: 'api.lovora.us' } });
    assert.equal(duplicate.status, 400);
    assert.equal(state.tokenCalls, before);
    assert.equal((await admin.query("SELECT count(*)::integer AS count FROM app_private.etsy_authorization_attempts WHERE state='pending'")).rows[0].count, 1);
    state.handler = (request, _response, body) => {
      if (request.url === '/v3/public/oauth/token') {
        assert.equal(body.get('grant_type'), 'authorization_code');
        assert.equal(body.get('redirect_uri'), config.callbackUrl);
        assert.equal(createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url'), consent.searchParams.get('code_challenge'));
      }
      return false;
    };
    const callbacks = await Promise.all([fixture.callback(oauthState), fixture.callback(oauthState)]);
    assert.deepEqual(callbacks.map(response => response.status).sort(), [303, 400]);
    assert.equal(state.tokenCalls - before, 1);
    state.handler = undefined;
    const count = calls.length;
    assert.equal((await current()).state, 'active');
    assert.equal((await api('/invitations')).status, 200);
    assert.equal(calls.length, count, 'Check status/list make zero provider requests');
    assert.equal((await api('?expectedRevision=1')).status, 400);
    const synced = await api('/read', 'owner', { expectedRevision: (await current()).revision });
    assert.equal(synced.status, 200);
    assert.deepEqual(Object.keys(synced.body).sort(), ['connectionId', 'currencyCode', 'etsyUserId', 'observedAt', 'revision', 'shopId', 'shopName']);
    assert.equal(synced.body.etsyUserId, '7');
    assert.equal(synced.body.shopId, '8');
    const ciphertext = await admin.query('SELECT envelope::text FROM app_private.etsy_credentials');
    assert.doesNotMatch(JSON.stringify(ciphertext.rows), /7\.synthetic|synthetic-refresh/);
  });

  await t.test('idempotent creation acknowledgement loss never reprints a link', async () => {
    await disconnect();
    const revision = (await current()).revision, idempotencyKey = randomUUID();
    loseAck = sql => sql.includes('INSERT INTO app_private.etsy_operation_receipts');
    const input = { expectedShopId: '8', expectedRevision: revision, idempotencyKey };
    const result = await api('/invitations', 'owner', input);
    assert.equal(result.status, 200);
    assert.equal(result.body.shareUrl, undefined);
    const replay = await api('/invitations', 'owner', input);
    assert.deepEqual(replay.body, result.body);
    assert.equal((await api(`/invitations/${result.body.invitationId}/cancel`, 'owner', {
      expectedRevision: result.body.revision, idempotencyKey: randomUUID() })).status, 200);
  });

  await t.test('candidate and activation lost acknowledgements reconcile exact receipts without exchanging twice', async () => {
    for (const match of ["SET state='verification_pending',candidate_version", "SET state='completed'"]) {
      const offer = await start(), before = state.tokenCalls;
      loseAck = sql => sql.includes(match);
      assert.equal((await fixture.callback(offer.oauthState)).status, 303);
      assert.equal((await current()).state, 'active');
      assert.equal(state.tokenCalls - before, 1);
      await disconnect();
    }
  });

  await t.test('metadata failure retains candidate for explicit verification without code replay', async () => {
    const offer = await start(), before = state.tokenCalls;
    state.handler = (request, response) => {
      if (request.url?.endsWith('/users/me')) { response.statusCode = 503; response.end('{}'); return true; }
      return false;
    };
    assert.equal((await fixture.callback(offer.oauthState)).status, 303);
    assert.equal((await current()).state, 'verification_pending');
    state.handler = undefined;
    const result = await api('/read', 'owner', { expectedRevision: (await current()).revision });
    assert.equal(result.status, 200);
    assert.equal((await current()).state, 'active');
    assert.equal(state.tokenCalls - before, 1);
  });

  await t.test('durable competing refresh and lost commit acknowledgement submit once and replace both tokens', async () => {
    await admin.query("UPDATE app_private.etsy_credentials SET expires_at=clock_timestamp()-interval '1 second'");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    state.handler = async (_request, response, body) => {
      if (body.get('grant_type') !== 'refresh_token') return false;
      entered.resolve(); await release.promise;
      response.end(JSON.stringify({ access_token: '7.rotated', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'shops_r' }));
      return true;
    };
    const revision = (await current()).revision, before = state.refreshCalls;
    loseAck = sql => sql.includes("SET state='committed',result_version");
    const first = api('/read', 'owner', { expectedRevision: revision });
    await Promise.race([entered.promise, first.then(() => { throw new Error('Refresh ended before provider submission.'); })]);
    const second = await api('/read', 'owner', { expectedRevision: revision }, fixture.secondOrigin);
    assert.equal(second.status, 409);
    release.resolve();
    assert.equal((await first).status, 200);
    assert.equal(state.refreshCalls - before, 1);
    assert.equal((await admin.query("SELECT count(*)::integer AS count FROM app_private.etsy_credentials WHERE state='active'")).rows[0].count, 1);
    state.handler = undefined;
  });

  await t.test('disconnect fences in-flight reads and removes every usable secret', async () => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    state.handler = async request => {
      if (request.url?.endsWith('/users/me')) { entered.resolve(); await release.promise; }
      return false;
    };
    const pending = api('/read', 'owner', { expectedRevision: (await current()).revision });
    await Promise.race([entered.promise, pending.then(() => { throw new Error('Read ended before provider observation.'); })]);
    await disconnect();
    release.resolve();
    assert.equal((await pending).status, 409);
    assert.equal((await current()).state, 'disconnected');
    assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_credentials')).rows[0].count, 0);
    state.handler = undefined;
  });

  await t.test('same-shop reconnect, creator demotion and wrong identity cannot silently relink', async () => {
    assert.equal((await api('/invitations', 'owner', { expectedShopId: '9', expectedRevision: (await current()).revision, idempotencyKey: randomUUID() })).status, 409);
    const offer = await start();
    // A second synthetic Owner permits demoting the creator without violating005's last-owner invariant.
    await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.member]);
    await admin.query("UPDATE app_private.memberships SET role_code='member',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
    const before = state.tokenCalls;
    assert.equal((await fixture.callback(offer.oauthState)).status, 400);
    assert.equal(state.tokenCalls, before);
    await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
    await disconnect();
    const wrong = await start();
    state.handler = (request, response) => {
      if (request.url?.endsWith('/users/me')) { response.end('{"user_id":9,"shop_id":8}'); return true; }
      return false;
    };
    assert.equal((await fixture.callback(wrong.oauthState)).status, 303);
    assert.equal((await current()).state, 'reconnect_required');
    state.handler = undefined;
  });

  await t.test('unknown refresh cannot replay after deadline; cooldown is durable and local status stays passive', async () => {
    await connect();
    await admin.query("UPDATE app_private.etsy_credentials SET expires_at=clock_timestamp()-interval '1 second'");
    state.handler = (_request, response, body) => {
      if (body.get('grant_type') === 'refresh_token') { response.statusCode = 429; response.setHeader('Retry-After', '3'); response.end('{}'); return true; }
      return false;
    };
    const before = state.refreshCalls;
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 429);
    assert.equal((await current()).state, 'refresh_unknown');
    await admin.query("UPDATE app_private.etsy_refresh_attempts SET deadline=clock_timestamp()-interval '1 second'");
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 429);
    assert.equal(state.refreshCalls - before, 1);
    assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_cooldowns WHERE retry_not_before>clock_timestamp()')).rows[0].count, 1);
    state.handler = undefined;
    await admin.query("UPDATE app_private.etsy_cooldowns SET retry_not_before=clock_timestamp()-interval '1 second'");
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 409);
  });

  await t.test('denial, expiry, cancellation, scope denial and credential corruption never activate', async () => {
    const denied = await start();
    const before = state.tokenCalls;
    const denialUrl = `${fixture.origin}/integrations/etsy/callback?${new URLSearchParams({
      state: denied.oauthState, error: 'access_denied', iss: 'https://openapi.etsy.com',
      error_description: 'private-synthetic', error_uri: 'https://wrong.example/private-synthetic',
    })}`;
    const response = await fetch(denialUrl, { headers: { Host: 'api.lovora.us' }, redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://website.example/');
    assert.equal((await current()).state, 'reconnect_required');
    const denial = await admin.query(`SELECT a.state AS attempt,i.state AS invitation FROM app_private.etsy_authorization_attempts a
      JOIN app_private.etsy_connection_invitations i ON i.id=a.invitation_id WHERE a.state_hash=$1`,
    [createHash('sha256').update(denied.oauthState).digest('hex')]);
    assert.deepEqual(denial.rows, [{ attempt: 'denied', invitation: 'declined' }]);
    assert.equal((await fetch(denialUrl, { headers: { Host: 'api.lovora.us' }, redirect: 'manual' })).status, 400);
    assert.equal(state.tokenCalls, before);
    const expired = await start();
    await admin.query("UPDATE app_private.etsy_authorization_attempts SET created_at=created_at-interval '301 seconds',expires_at=expires_at-interval '301 seconds' WHERE state='pending'");
    assert.equal((await fixture.callback(expired.oauthState)).status, 400);
    assert.equal(state.tokenCalls, before);
    await disconnect();
    const cancelled = await start();
    await disconnect();
    assert.equal((await fixture.callback(cancelled.oauthState)).status, 400);
    assert.equal(state.tokenCalls, before);
    const missing = await start();
    state.handler = (request, response) => {
      if (request.url?.endsWith('/oauth/token')) { response.end('{"access_token":"7.synthetic","refresh_token":"synthetic-refresh","token_type":"Bearer","expires_in":3600}'); return true; }
      return false;
    };
    assert.equal((await fixture.callback(missing.oauthState)).status, 303);
    assert.notEqual((await current()).state, 'active');
    state.handler = undefined;
    await connect();
    await admin.query("UPDATE app_private.etsy_credentials SET envelope=jsonb_set(envelope,'{tag}','\"tampered\"')");
    assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 503);
    await disconnect();
  });

  await t.test('independent Nest workers serialize competing creates and fence a callback during exchange', async () => {
    const revision = (await current()).revision;
    const results = await Promise.all([api('/invitations', 'owner', { expectedShopId: '8', expectedRevision: revision, idempotencyKey: randomUUID() }),
      api('/invitations', 'owner', { expectedShopId: '8', expectedRevision: revision, idempotencyKey: randomUUID() }, fixture.secondOrigin)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    await disconnect();
    const offer = await start(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    state.handler = async request => {
      if (request.url?.endsWith('/oauth/token')) { entered.resolve(); await release.promise; }
      return false;
    };
    const callback = fixture.callback(offer.oauthState), before = state.tokenCalls;
    await Promise.race([entered.promise, callback.then(() => { throw new Error('Callback ended before exchange.'); })]);
    await disconnect();
    release.resolve();
    assert.equal((await callback).status, 400);
    assert.equal(state.tokenCalls - before, 1);
    assert.equal((await current()).state, 'disconnected');
    assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_credentials')).rows[0].count, 0);
    state.handler = undefined;
  });

  await t.test('refresh deadline and lost provider response never allow token resubmission', async () => {
    for (const fault of ['deadline', 'lost_response']) {
      await connect();
      await admin.query("UPDATE app_private.etsy_credentials SET expires_at=clock_timestamp()-interval '1 second'");
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      state.handler = async (_request, response, body) => {
        if (body.get('grant_type') !== 'refresh_token') return false;
        entered.resolve(); await release.promise;
        if (fault === 'lost_response') { response.destroy(); return true; }
        return false;
      };
      const before = state.refreshCalls;
      const pending = api('/read', 'owner', { expectedRevision: (await current()).revision });
      await Promise.race([entered.promise, pending.then(() => { throw new Error('Refresh ended before fault boundary.'); })]);
      if (fault === 'deadline') {
        await admin.query("UPDATE app_private.etsy_refresh_attempts SET deadline=clock_timestamp()-interval '1 second' WHERE state='submitted'");
        const beforeStatus = calls.length;
        const local = await current();
        assert.equal(local.state, 'refresh_unknown');
        assert.equal(local.attemptPhase, 'refresh_unknown');
        assert.equal(calls.length, beforeStatus);
        assert.equal((await admin.query('SELECT state FROM app_private.etsy_connections')).rows[0].state, 'active',
          'Check status classifies saved deadline without reconciliation writes');
      }
      release.resolve();
      assert.notEqual((await pending).status, 200);
      assert.equal((await current()).state, 'refresh_unknown');
      assert.equal((await api('/read', 'owner', { expectedRevision: (await current()).revision })).status, 409);
      assert.equal(state.refreshCalls - before, 1);
      state.handler = undefined;
      await disconnect();
    }
  });

  await t.test('invitation expiry and creator authority loss during exchange fence late tokens', async () => {
    for (const fault of ['expiry', 'demotion']) {
      const offer = await start(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      state.handler = async request => {
        if (request.url?.endsWith('/oauth/token')) { entered.resolve(); await release.promise; }
        return false;
      };
      const pending = fixture.callback(offer.oauthState);
      await Promise.race([entered.promise, pending.then(() => { throw new Error('Callback ended before fault boundary.'); })]);
      if (fault === 'expiry') await admin.query("UPDATE app_private.etsy_connection_invitations SET created_at=created_at-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE state='in_progress'");
      else await admin.query("UPDATE app_private.memberships SET role_code='member',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
      release.resolve();
      assert.equal((await pending).status, 400);
      if (fault === 'demotion') await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
      assert.notEqual((await current()).state, 'active');
      assert.equal((await admin.query('SELECT count(*)::integer AS count FROM app_private.etsy_credentials')).rows[0].count, 0);
      state.handler = undefined;
      await disconnect();
    }
  });

  await t.test('real TLS token timeout and real SQL lock failure stay bounded without provider replay', async () => {
    const offer = await start(), before = state.tokenCalls;
    state.handler = request => Boolean(request.url?.endsWith('/oauth/token'));
    // Exercise the actual transport's3s timer and socket cancellation, not a guessed sleep.
    const began = performance.now();
    assert.equal((await fixture.callback(offer.oauthState)).status, 303);
    assert.ok(performance.now() - began < 7000);
    assert.equal((await current()).state, 'refresh_unknown');
    assert.equal(state.tokenCalls - before, 1);
    state.handler = undefined;
    await disconnect();
    await admin.query('BEGIN; LOCK TABLE app_private.workspaces IN ACCESS EXCLUSIVE MODE');
    try {
      const callsBefore = calls.length, started = performance.now();
      const unavailable = await api('');
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.body.code, 'dependency_unavailable');
      assert.ok(performance.now() - started < 4000);
      assert.equal(calls.length, callsBefore);
    } finally { await admin.query('ROLLBACK'); }
  });


  await t.test('runtime direct managed data access and foreign-workspace service admission are denied', async () => {
    const foreignService = new EtsyService(randomUUID(), config, db, new EtsyProvider(config));
    await assert.rejects(foreignService.status(fixture.identity, signal()), { code: 'forbidden' });
    await assert.rejects(db.transaction(signal(), client => client.query('SELECT * FROM auth.sessions')), { code: 'dependency_unavailable' });
    assert.equal((await admin.query("SELECT has_table_privilege('public','app_private.etsy_credentials','SELECT') AS permitted")).rows[0].permitted, false);
    const audit = await admin.query("SELECT action,outcome FROM app_private.audit_events WHERE action LIKE 'etsy.%'");
    assert.ok(audit.rows.some(row => row.action === 'etsy.disconnect'));
    assert.doesNotMatch(JSON.stringify(audit.rows), /synthetic-refresh|7\.synthetic|code_verifier|shareUrl/);
  });
});

test('prune authority fails closed for operator and runtime despite known Owner identity',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 30000 }, async t => {
  const fixture = await etsyFixture(t, config);
  const { admin, api, workspace, owner, member, foreign } = fixture;
  const status = await api('');
  assert.equal(status.status, 200);
  const offer = await api('/invitations', 'owner', {
    expectedShopId: '8', expectedRevision: status.body.revision, idempotencyKey: randomUUID(),
  });
  assert.equal(offer.status, 200);
  await admin.query(`UPDATE app_private.etsy_connection_invitations SET state='cancelled',token_hash=NULL,
    created_at=created_at-interval '2 days',expires_at=expires_at-interval '2 days' WHERE id=$1`, [offer.body.invitationId]);
  assert.equal((await admin.query(`SELECT EXISTS(SELECT 1 FROM app_private.etsy_connection_invitations
    WHERE id=$1 AND state='cancelled' AND expires_at<clock_timestamp()-interval '900 seconds') AS eligible`,
  [offer.body.invitationId])).rows[0].eligible, true);
  const tables = ['etsy_connections', 'etsy_connection_invitations', 'etsy_authorization_attempts',
    'etsy_credentials', 'etsy_operation_receipts', 'etsy_refresh_attempts', 'audit_events'];
  const before: unknown[][] = [];
  for (const table of tables) {
    before.push((await admin.query(
      `SELECT to_jsonb(row_value) AS value FROM app_private.${table} row_value ORDER BY to_jsonb(row_value)::text`)).rows);
  }
  for (const role of ['public', 'app_runtime', 'app_operator']) {
    assert.equal((await admin.query(
      "SELECT has_function_privilege($1,'app_private.prune_etsy(uuid,uuid,uuid,integer,integer)','EXECUTE') AS permitted",
      [role])).rows[0].permitted, false, role);
  }
  const receipt = randomUUID();
  const attempts: Array<[string, string | null, string, number | null, number | null]> = [
    [workspace, owner, receipt, 900, 2],
    [workspace, owner, receipt, 900, 2], // Reusing a receipt cannot confer authority.
    [workspace, member, randomUUID(), 300, 1],
    [workspace, foreign, randomUUID(), 2592000, 100],
    [randomUUID(), owner, randomUUID(), 900, 2],
    [workspace, owner, randomUUID(), 0, 101],
    [workspace, null, randomUUID(), null, null],
  ];
  for (const role of ['app_operator', 'app_runtime']) {
    await admin.query(`SET ROLE ${role}`);
    try {
      for (const args of attempts) {
        await assert.rejects(admin.query('SELECT app_private.prune_etsy($1,$2,$3,$4,$5)', args), { code: '42501' });
      }
    } finally { await admin.query('RESET ROLE'); }
  }
  for (const [index, table] of tables.entries()) {
    const after = await admin.query(
      `SELECT to_jsonb(row_value) AS value FROM app_private.${table} row_value ORDER BY to_jsonb(row_value)::text`);
    assert.deepEqual(after.rows, before[index], table);
  }
  assert.equal((await admin.query("SELECT EXISTS(SELECT 1 FROM app_private.audit_events WHERE action='etsy.prune') AS spoofed")).rows[0].spoofed, false);
  assert.equal(fixture.calls.length, 0);
});

async function ownerApprovalFixture(t: TestContext, settings: EtsyOwnerSettings) {
  // Independently pinned synthetic approval, never a native/published artifact.
  const base = await artifactFixture(); t.after(base.dispose);
  const files = base.artifact.manifest.source.files.filter(file => !file.path.startsWith('apps/api/migrations/'));
  for (const entry of migrationManifest) {
    const path = `apps/api/migrations/${entry.name}.mjs`;
    const bytes = await readFile(new URL(`../../migrations/${entry.name}.mjs`, import.meta.url));
    await writeFile(join(base.operator, path), bytes);
    files.push({ path, size: bytes.length, mode: 0o644, sha256: sha256(bytes), sha1: createHash('sha1').update(bytes).digest('hex') });
  }
  const artifact = await assembleArtifact({ raw: base.raw, operator: base.operator, destination: join(base.root, 'owner-artifact'),
    config: base.config, source: { ...base.artifact.manifest.source, repository: 'https://github.com/khuonghuyhieu/esty-admin',
      files, digest: sha256(canonical(files)) }, migrations: [...migrationManifest], build: base.artifact.manifest.build });
  const packet: EtsyReleasePacket = { version: 1, runId: randomUUID(), ledgerRoot: base.root,
    revision: artifact.manifest.source.revision, tree: artifact.manifest.source.tree, sourceDigest: artifact.manifest.source.digest,
    artifactDigest: artifact.digest, runtimeDigest: 'e'.repeat(64), configBundleDigest: 'f'.repeat(64),
    migrationInputDigest: '1'.repeat(64), previousDigest: manifestDigest(migrationManifest.slice(0, 3)), targetDigest: manifestDigest(migrationManifest),
    target: 'supabase:abcdefghijklmnopqrst', driverDigest: '2'.repeat(64), nodeDigest: '3'.repeat(64), cliDigest: '4'.repeat(64), cliOwnFilesDigest: '5'.repeat(64),
    browserOrigin: 'https://app.lovora.us', runtimeKeys: [...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].sort(), metadataDigest: '6'.repeat(64),
    predecessor: { id: 'dpl_old', revision: '7'.repeat(40), tree: '8'.repeat(40), sourceDigest: '9'.repeat(64), artifactDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64) },
    window: { start: Date.now() - 1000, end: Date.now() + 600000 },
    grants: { exclusiveOwnerLease: 'synthetic-owner-only', automatedDelivery: 'disabled', maintenance: 'approved-readiness-interruption',
      recovery: 'approved-roll-forward-only', phases: [...etsyReleasePhases] } };
  const binding = { version: 1, packet, packetDigest: sha256(canonical(packet)), authUrl: settings.authUrl,
    authApiKeySha256: sha256(settings.authApiKey) };
  const path = join(base.root, 'owner-binding.json'); writeReleaseEvidence(path, binding);
  const digest = readEvidence(path).identity.sha256;
  return { artifact, path, digest, binding, approval: loadEtsyOwnerApproval(path, digest, artifact.root) };
}

test('Etsy setup Owner approval rejects credential redirection and stale provenance before password submission', async t => {
  const settings = { authUrl: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1', authApiKey: 'sb_publishable_fixture',
    technicalKey: 'a'.repeat(64), invitationOrigin: config.invitationOrigin, clientId: config.clientId };
  const fixture = await ownerApprovalFixture(t, settings);
  let transports = 0, passwordReads = 0;
  const transport: typeof fetch = async () => { transports++; throw new Error('password must never reach transport'); };
  const credentials = { get password() { passwordReads++; return 'owner-password-canary'; } };
  for (const malicious of [
    { ...settings, authUrl: 'https://zyxwvutsrqponmlkjihgf.supabase.co/auth/v1', authApiKey: 'sb_publishable_attacker' },
    { ...settings, authApiKey: 'sb_publishable_wrong_same_project' },
  ]) {
    assert.throws(() => ownerSettings(malicious, fixture.approval), { outcome: 'refused' });
    await assert.rejects(async () => {
      const client = new EtsyOwnerClient(malicious, fixture.approval, transport);
      await client.login('owner@example.invalid', credentials.password);
    }, error => {
      assert.ok(error instanceof Error && 'outcome' in error);
      assert.equal(error.outcome, 'refused');
      assert.doesNotMatch(error.message, /owner-password-canary|supabase\.co|sb_publishable_/);
      return true;
    });
  }
  assert.throws(() => new EtsyOwnerClient(settings, { approved: true }, transport), { outcome: 'refused' });
  assert.equal(passwordReads, 0); assert.equal(transports, 0);

  const original = await readFile(fixture.path);
  for (const change of [
    { revision: '0'.repeat(40) }, { tree: '0'.repeat(40) }, { sourceDigest: '0'.repeat(64) },
    { artifactDigest: '0'.repeat(64) }, { runtimeDigest: '0'.repeat(64) }, { configBundleDigest: '0'.repeat(64) },
  ]) {
    const packet = { ...fixture.binding.packet, ...change };
    await writeFile(fixture.path, JSON.stringify({ ...fixture.binding, packet, packetDigest: sha256(canonical(packet)) }));
    assert.throws(() => loadEtsyOwnerApproval(fixture.path, fixture.digest, fixture.artifact.root), { outcome: 'refused' });
    assert.throws(() => new EtsyOwnerClient(settings, fixture.approval, transport), { outcome: 'refused' });
  }
  for (const value of [
    { ...fixture.binding, unexpected: true },
    { ...fixture.binding, authUrl: 'https://zyxwvutsrqponmlkjihgf.supabase.co/auth/v1' },
    ...[
      { revision: '0'.repeat(40) }, { tree: '0'.repeat(40) }, { sourceDigest: '0'.repeat(64) }, { artifactDigest: '0'.repeat(64) },
      { window: { start: Date.now() - 2000, end: Date.now() - 1000 } },
    ].map(change => { const packet = { ...fixture.binding.packet, ...change }; return { ...fixture.binding, packet, packetDigest: sha256(canonical(packet)) }; }),
  ]) {
    await writeFile(fixture.path, JSON.stringify(value));
    // Even an independently pinned receipt must satisfy schema/expiry/artifact provenance.
    assert.throws(() => loadEtsyOwnerApproval(fixture.path, readEvidence(fixture.path).identity.sha256, fixture.artifact.root), { outcome: 'refused' });
  }
  await writeFile(fixture.path, original);
  const client = new EtsyOwnerClient(settings, fixture.approval, transport);
  t.mock.method(Date, 'now', () => fixture.binding.packet.window.end + 1);
  await assert.rejects(client.login('owner@example.invalid', 'owner-password-canary'), { outcome: 'refused' });
  assert.equal(passwordReads, 0); assert.equal(transports, 0);
});

test('Etsy setup Owner client completes explicit authenticated HTTP lifecycle and refuses stale authority',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  const nativeFetch = globalThis.fetch;
  const fixture = await etsyFixture(t, config);
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'esty-owner-client-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let signins = 0, logouts = 0;
  const peer = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      if (request.method === 'POST' && request.url === '/auth/v1/token?grant_type=password') {
        signins++;
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { email: string; password: string };
        assert.equal(request.headers.apikey, 'sb_publishable_fixture');
        if (body.password !== 'synthetic-password' || !['owner@example.invalid', 'member@example.invalid', 'foreign@example.invalid'].includes(body.email)) {
          response.writeHead(400, { 'Content-Type': 'application/json' }); response.end('{"error":"invalid_grant"}'); return;
        }
        const actor = body.email.split('@')[0] as 'owner' | 'member' | 'foreign';
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ access_token: fixture.tokens[actor], refresh_token: 'discarded-synthetic-refresh', token_type: 'bearer' }));
      } else if (request.method === 'POST' && request.url === '/auth/v1/logout?scope=local') {
        assert.equal(request.headers.authorization, `Bearer ${fixture.tokens.owner}`);
        logouts++; await fixture.admin.query('DELETE FROM auth.sessions WHERE id=$1', [fixture.sessions.owner]);
        response.writeHead(204); response.end();
      } else { response.writeHead(404); response.end(); }
    })().catch(() => response.destroy());
  });
  peer.listen(0, '127.0.0.1'); await once(peer, 'listening');
  t.after(async () => { const closed = once(peer, 'close'); peer.close(); peer.closeAllConnections(); await closed; });
  const address = peer.address(); assert.ok(address && typeof address !== 'string');
  const settings = { authUrl: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1', authApiKey: 'sb_publishable_fixture',
    technicalKey: fixture.technical, invitationOrigin: config.invitationOrigin, clientId: config.clientId };
  const { approval } = await ownerApprovalFixture(t, settings);
  let lostWrite = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.redirect, 'manual');
    if (url.origin === 'https://abcdefghijklmnopqrst.supabase.co') {
      return nativeFetch(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, init);
    }
    assert.equal(url.origin, 'https://api.lovora.us');
    if (url.pathname === '/integrations/etsy/invite/start') {
      assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), {
        authorization: `Bearer ${fixture.technical}`, 'content-type': 'application/json', origin: config.invitationOrigin });
      const body: unknown = JSON.parse(String(init?.body));
      assert.ok(body && typeof body === 'object' && 'secret' in body && typeof body.secret === 'string');
      return fixture.start(body.secret);
    }
    const response = await fetch(fixture.origin + url.pathname + url.search, init);
    if (lostWrite && init?.method === 'POST') { lostWrite = false; await response.body?.cancel(); throw new Error('synthetic lost acknowledgement'); }
    return response;
  };
  for (const actor of ['member', 'foreign']) {
    const denied = new EtsyOwnerClient(settings, approval, transport);
    await assert.rejects(denied.login(`${actor}@example.invalid`, 'synthetic-password'));
    await assert.rejects(denied.status());
  }
  const client = new EtsyOwnerClient(settings, approval, transport);
  await client.login('owner@example.invalid', 'synthetic-password');
  const count = fixture.calls.length;
  const initial = await client.status();
  await client.list(10);
  assert.equal(fixture.calls.length, count);
  const sharePath = join(directory, 'share.json');
  const receipt = await client.create({ expectedShopId: '8', expectedRevision: Number(initial.revision), idempotencyKey: randomUUID() }, sharePath, 'connect');
  assert.equal('shareUrl' in receipt, false);
  const share = JSON.parse(await readFile(sharePath, 'utf8')) as { shareUrl: string };
  const consentPath = join(directory, 'consent.json');
  await client.start(share.shareUrl, consentPath);
  const savedConsent: unknown = JSON.parse(await readFile(consentPath, 'utf8'));
  assert.ok(savedConsent && typeof savedConsent === 'object' && 'consentUrl' in savedConsent && typeof savedConsent.consentUrl === 'string');
  const consent = new URL(savedConsent.consentUrl);
  assert.equal((await fixture.callback(consent.searchParams.get('state')!)).status, 303);
  const connected = await client.status(); assert.equal(connected.state, 'active');
  const data = await client.read(Number(connected.revision));
  assert.equal(data.shopId, '8'); assert.equal(data.etsyUserId, '7');
  assert.equal(data.shopName, 'Synthetic Shop'); assert.equal(data.currencyCode, 'USD');
  const reconnect = await client.create({ expectedShopId: '8', expectedRevision: Number((await client.status()).revision),
    idempotencyKey: randomUUID() }, join(directory, 'reconnect.json'), 'reconnect');
  assert.equal((await fixture.admin.query('SELECT count(*)::integer AS n FROM app_private.etsy_credentials')).rows[0].n, 0);
  await client.cancel(String(reconnect.invitationId), { expectedRevision: Number(reconnect.revision), idempotencyKey: randomUUID() });
  await client.disconnect({ expectedRevision: Number((await client.status()).revision), idempotencyKey: randomUUID() });
  assert.equal((await client.status()).state, 'disconnected');
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='owner' WHERE user_id=$1", [fixture.member]);
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='member' WHERE user_id=$1", [fixture.owner]);
  await assert.rejects(client.status());
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='owner' WHERE user_id=$1", [fixture.owner]);
  await fixture.admin.query("UPDATE app_private.memberships SET role_code='member' WHERE user_id=$1", [fixture.member]);
  const lost = new EtsyOwnerClient(settings, approval, transport); await lost.login('owner@example.invalid', 'synthetic-password');
  lostWrite = true;
  await assert.rejects(lost.create({ expectedShopId: '8', expectedRevision: Number((await lost.status()).revision), idempotencyKey: randomUUID() },
    join(directory, 'lost.json'), 'reconnect'), { outcome: 'unknown' });
  const before = fixture.calls.length;
  await assert.rejects(lost.status()); assert.equal(fixture.calls.length, before);
  assert.equal(await client.logout(), 'confirmed'); assert.equal(logouts, 1);
  const revoked = new EtsyOwnerClient(settings, approval, transport);
  await assert.rejects(revoked.login('owner@example.invalid', 'synthetic-password'));
  await assert.rejects(revoked.status());
  assert.equal(signins, 5);
});

test('Etsy setup exact three-to-four migration switches actual old and target strict HTTP readiness',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  const nativeFetch = globalThis.fetch;
  const fixture = await etsyFixture(t, config);
  await t.test('owned strict history cutover', async t => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'esty-setup-sql-'));
  const databaseName = `setup_${randomBytes(12).toString('hex')}`;
  await fixture.admin.query(`CREATE DATABASE "${databaseName}"`);
  const database = { ...fixture.database, database: databaseName }, beforeDirectory = join(directory, 'before');
  await mkdir(beforeDirectory);
  for (const entry of migrationManifest.slice(0, 3)) await cp(join(migrationsDirectory, `${entry.name}.mjs`), join(beforeDirectory, `${entry.name}.mjs`));
  const initial = await runMigrations(database, { directory: beforeDirectory });
  assert.equal(initial.result, 'success');
  assert.deepEqual(initial.after, migrationManifest.slice(0, 3).map(entry => entry.name));
  const baseConfig = parseConfig({ DATABASE_URL: `postgresql://postgres:${database.password}@127.0.0.1:${database.port}/${databaseName}` });
  const old = await createApplication(baseConfig, migrationManifest.slice(0, 3).map(entry => entry.name));
  const target = await createApplication(baseConfig, migrationManifest.map(entry => entry.name));
  await old.listen(0, '127.0.0.1'); await target.listen(0, '127.0.0.1');
  const oldOrigin = await old.getUrl(), targetOrigin = await target.getUrl();
  t.after(async () => { await old.close(); await target.close(); await fixture.admin.query(`DROP DATABASE "${databaseName}"`); await rm(directory, { recursive: true, force: true }); });
  const packet: EtsyReleasePacket = { version: 1, runId: randomUUID(), ledgerRoot: directory,
    revision: 'a'.repeat(40), tree: 'b'.repeat(40), sourceDigest: 'c'.repeat(64), artifactDigest: 'd'.repeat(64),
    runtimeDigest: 'e'.repeat(64), configBundleDigest: 'f'.repeat(64), migrationInputDigest: '1'.repeat(64),
    previousDigest: manifestDigest(migrationManifest.slice(0, 3)), targetDigest: manifestDigest(migrationManifest),
    target: 'local', driverDigest: '2'.repeat(64), nodeDigest: '3'.repeat(64), cliDigest: '4'.repeat(64), cliOwnFilesDigest: '5'.repeat(64),
    metadataDigest: '6'.repeat(64), browserOrigin: 'https://app.lovora.us', runtimeKeys: [...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].sort(),
    predecessor: { id: 'dpl_old', revision: '7'.repeat(40), tree: '8'.repeat(40), sourceDigest: '9'.repeat(64), artifactDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64) },
    window: { start: Date.now() - 1000, end: Date.now() + 600000 },
    grants: { exclusiveOwnerLease: 'owned-local-fixture', automatedDelivery: 'disabled', maintenance: 'approved-readiness-interruption',
      recovery: 'approved-roll-forward-only', phases: [...etsyReleasePhases] } };
  const observed: Array<{ origin: string; status: number; body: unknown }> = [];
  async function readiness(origin: string, pending: boolean) {
    const response = await nativeFetch(origin + '/health/ready', { signal: AbortSignal.timeout(5000) });
    const body: unknown = await response.json(); observed.push({ origin, status: response.status, body });
    assert.equal(response.status, pending ? 503 : 200);
    assert.deepEqual(body, pending ? { status: 'degraded', reason: 'migrations_pending' } : { status: 'ready', database: 'up', migrations: 'current' });
  }
  let creates = 0, promotes = 0, alias = 'dpl_old';
  const operations: EtsyReleaseOperations = {
    verify() { assert.equal(manifestDigest(migrationManifest), packet.targetDigest); },
    async currentMain() { return { revision: packet.revision, tree: packet.tree }; },
    async history() { const status = await migrationStatus(database); assert.equal(status.ordered, true); assert.deepEqual(status.unexpected, []); return status.applied; },
    async predecessor(pending) { assert.equal(alias, 'dpl_old'); await readiness(oldOrigin, pending); },
    async create() { creates++; return { code: 0, aborted: false, stdout: '{"deployment":{"id":"dpl_target"}}' }; },
    async candidate(id, pending) { assert.equal(id, 'dpl_target'); await readiness(targetOrigin, pending); },
    migrate: () => runMigrations(database, { sourceRevision: packet.revision, target: 'local', expectedBefore: migrationManifest.slice(0, 3).map(entry => entry.name) }),
    async promote(id) { assert.equal(id, 'dpl_target'); promotes++; alias = id; return { code: 0, aborted: false, stdout: '' }; },
    async alias(id) { assert.equal(alias, id); },
  };
  const packetDigest = sha256(canonical(packet));
  for (const phase of etsyReleasePhases) await runEtsyReleasePhase({ packet, packetDigest, phase, operations, signal: AbortSignal.timeout(30000) });
  assert.equal(creates, 1); assert.equal(promotes, 1);
  assert.ok(observed.some(row => row.origin === oldOrigin && row.status === 200));
  assert.ok(observed.some(row => row.origin === oldOrigin && row.status === 503));
  assert.ok(observed.some(row => row.origin === targetOrigin && row.status === 503));
  assert.ok(observed.some(row => row.origin === targetOrigin && row.status === 200));
  const after = await migrationStatus(database);
  assert.deepEqual(after.applied, migrationManifest.map(entry => entry.name)); assert.deepEqual(after.pending, []);
  });
});

test('Etsy lookup projects lossless candidates and never infers absence or exactness from a partial window', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let payload = '{"count":2,"results":[{"shop_id":9007199254740993,"shop_name":"MyShop","url":"https://evil.invalid","private":"discard"},{"shop_id":9223372036854775807,"shop_name":"OtherShop"}]}';
  const provider = new EtsyProvider(config, async (url, init) => { requests.push({ url, init }); return new Response(payload); });
  const { observedAt, ...first } = await provider.lookup('myshop', 0, signal());
  assert.equal(new Date(observedAt).toISOString(), observedAt);
  assert.deepEqual(first, { query: 'myshop', outcome: 'exact', ownershipVerified: false,
    items: [{ shopId: '9007199254740993', shopName: 'MyShop', shopUrl: 'https://www.etsy.com/shop/MyShop', match: 'exact' },
      { shopId: '9223372036854775807', shopName: 'OtherShop', shopUrl: 'https://www.etsy.com/shop/OtherShop', match: 'candidate' }],
    page: { offset: 0, limit: 20, providerCount: '2', complete: true, hasMore: false, nextOffset: null, truncated: false } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, 'https://api.etsy.com/v3/application/shops?shop_name=myshop&limit=20&offset=0');
  assert.equal(requests[0]!.init.method, 'GET');
  assert.equal(requests[0]!.init.redirect, 'error');
  assert.equal(new Headers(requests[0]!.init.headers).get('authorization'), null);
  assert.equal(new Headers(requests[0]!.init.headers).get('x-api-key'), `${config.clientId}:${config.sharedSecret}`);
  const row = { shop_id: 8, shop_name: 'MyShop' };
  for (const sample of [
    { count: 0, results: [], offset: 0, outcome: 'not_found', complete: true, more: false, next: null, truncated: false },
    { count: 0, results: [], offset: 20, outcome: 'incomplete', complete: false, more: false, next: null, truncated: false },
    { count: 40, results: [], offset: 20, outcome: 'incomplete', complete: false, more: true, next: 40, truncated: false },
    { count: 2, results: [row], offset: 0, outcome: 'choose', complete: false, more: true, next: 20, truncated: false },
    { count: 1, results: [{ ...row, shop_name: 'Other' }], offset: 0, outcome: 'choose', complete: true, more: false, next: null, truncated: false },
    { count: 2, results: [row, { ...row, shop_id: 9, shop_name: 'myshop' }], offset: 0, outcome: 'choose', complete: true, more: false, next: null, truncated: false },
    { count: 22, results: [row, row], offset: 20, outcome: 'choose', complete: false, more: false, next: null, truncated: false },
    { count: '9223372036854775807', results: [row], offset: 80, outcome: 'choose', complete: false, more: true, next: null, truncated: true },
  ]) {
    payload = JSON.stringify({ count: sample.count, results: sample.results });
    const result = await provider.lookup('myshop', sample.offset, signal());
    assert.equal(result.outcome, sample.outcome);
    assert.deepEqual(result.page, { offset: sample.offset, limit: 20, providerCount: String(sample.count), complete: sample.complete,
      hasMore: sample.more, nextOffset: sample.next, truncated: sample.truncated });
    assert.equal(result.ownershipVerified, false);
  }
  payload = '{"count":9007199254740993,"results":[]}';
  assert.equal((await provider.lookup('myshop', 0, signal())).page.providerCount, '9007199254740993');
  payload = JSON.stringify({ count: 2, results: [row, row] });
  const deduplicated = await provider.lookup('myshop', 0, signal());
  assert.equal(deduplicated.outcome, 'exact');
  assert.deepEqual(deduplicated.items, [{ shopId: '8', shopName: 'MyShop', shopUrl: 'https://www.etsy.com/shop/MyShop', match: 'exact' }]);
});

test('Etsy lookup rejects malformed upstream windows, conflicting identities and precision loss', async () => {
  const row = { shop_id: 8, shop_name: 'MyShop' };
  const malformed: unknown[] = [null, [], {}, { count: 0, results: {} }, { count: 0, results: [row] },
    { count: 21, results: Array.from({ length: 21 }, (_, i) => ({ ...row, shop_id: i + 1 })) },
    { count: 2, results: [row, { ...row, shop_name: 'Different' }] }];
  for (const count of [-1, 1.5, '01', '1e3', '9223372036854775808', null, true]) malformed.push({ count, results: [] });
  for (const shop_id of [0, -1, 1.5, '01', '9223372036854775808', null]) malformed.push({ count: 1, results: [{ ...row, shop_id }] });
  for (const shop_name of ['', 'Has Space', 'https://etsy.com/shop/MyShop', 'é', 'a'.repeat(65), null]) malformed.push({ count: 1, results: [{ ...row, shop_name }] });
  for (const raw of [...malformed.map(value => JSON.stringify(value)),
    '{"count":9007199254740993.0,"results":[]}',
    '{"count":1,"results":[{"shop_id":9007199254740993.0,"shop_name":"MyShop"}]}', '{"count":']) {
    let calls = 0;
    const provider = new EtsyProvider(config, async () => { calls++; return new Response(raw); });
    await assert.rejects(provider.lookup('myshop', 0, signal()), { code: 'upstream_unavailable' });
    assert.equal(calls, 1);
  }
});

test('Etsy lookup classifies app-only failures and cancels bounded bodies without retries', async () => {
  for (const status of [400, 401, 403, 302, 500]) {
    let calls = 0;
    const provider = new EtsyProvider(config, async () => { calls++; return new Response('secret-provider-error', { status, headers: { Location: 'https://evil.invalid' } }); });
    await assert.rejects(provider.lookup('myshop', 0, signal()), { code: status === 401 || status === 403 ? 'configuration_unavailable' : 'upstream_unavailable' });
    assert.equal(calls, 1);
  }
  for (const [raw, retryAfterSeconds] of [['0', 1], ['9999999999', 86400], ['bad', 60], ['2', 2]] as const) {
    let calls = 0;
    const provider = new EtsyProvider(config, async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': raw } }); });
    await assert.rejects(provider.lookup('myshop', 0, signal()), { code: 'upstream_rate_limited', retryAfterSeconds });
    assert.equal(calls, 1);
  }
  let calls = 0;
  for (const invalid of [{ ...config, clientId: '' }, { ...config, sharedSecret: 'bad:secret' }]) {
    const provider = new EtsyProvider(invalid, async () => { calls++; throw new Error('must not request'); });
    await assert.rejects(provider.lookup('myshop', 0, signal()), { code: 'configuration_unavailable' });
  }
  assert.equal(calls, 0);
  for (const kind of ['oversize', 'parent', 'deadline']) {
    let cancelled = false;
    const entered = Promise.withResolvers<void>(), controller = new AbortController();
    const provider = new EtsyProvider(config, async () => new Response(new ReadableStream<Uint8Array>({
      start(stream) { if (kind === 'oversize') stream.enqueue(new Uint8Array(65537)); entered.resolve(); },
      cancel() { cancelled = true; },
    })));
    const started = Date.now(), pending = provider.lookup('myshop', 0, controller.signal);
    const rejected = assert.rejects(pending, { code: 'upstream_unavailable' });
    await entered.promise;
    if (kind === 'parent') controller.abort();
    // Keep the loop alive while the production AbortSignal deadline (unref'ed) expires.
    const keepAlive = setTimeout(() => {}, 4000);
    try { await rejected; } finally { clearTimeout(keepAlive); }
    assert.equal(cancelled, true);
    if (kind === 'deadline') assert.ok(Date.now() - started >= 1200 && Date.now() - started < 3500);
  }
});

test('Etsy lookup owned HTTP journey enforces current Owner, strict input, cooldown and unchanged selected-ID consent',
  { skip: !process.env.ETSY_TEST_FIXTURE_DIRECTORY, timeout: 120000 }, async t => {
  const fixture = await etsyFixture(t, config), { api, admin, state, calls } = fixture;
  const path = '/shops/lookup?shopName=MyShop', shopId = '9007199254740993';
  const lookupBody = `{"count":1,"results":[{"shop_id":${shopId},"shop_name":"MyShop","url":"https://evil.invalid","email":"private@example.invalid"}]}`;
  const lookupHandler = state.handler = (request, response) => {
    if (!request.url?.startsWith('/v3/application/shops?')) return false;
    assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, undefined);
    response.end(lookupBody); return true;
  };
  const lifecycleTables = ['etsy_connections', 'etsy_connection_invitations', 'etsy_authorization_attempts', 'etsy_credentials',
    'etsy_refresh_attempts', 'etsy_operation_receipts', 'audit_events'];
  async function snapshot() {
    const rows = [];
    for (const table of lifecycleTables) rows.push((await admin.query(`SELECT to_jsonb(t) AS row FROM app_private.${table} t ORDER BY to_jsonb(t)::text`)).rows);
    return rows;
  }
  const before = await snapshot();
  let selectedId: unknown;
  await t.test('one app-key page, normalized input and a safe unverified projection', async () => {
    const result = await api('/shops/lookup?shopName=%09+MyShop%0D%0A');
    assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(result.body.items, [{ shopId, shopName: 'MyShop', shopUrl: 'https://www.etsy.com/shop/MyShop', match: 'exact' }]);
    assert.equal(result.body.outcome, 'exact'); assert.equal(result.body.query, 'myshop'); assert.equal(result.body.ownershipVerified, false);
    assert.deepEqual(calls, ['/v3/application/shops?shop_name=myshop&limit=20&offset=0']);
    const items = result.body.items;
    assert.ok(Array.isArray(items));
    const item: unknown = items[0];
    assert.ok(item && typeof item === 'object' && 'shopId' in item);
    selectedId = item.shopId;
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('invalid query, URL, duplicate, array, offset and path aliases never reach Etsy', async () => {
    const count = calls.length;
    for (const query of ['', 'shopName=', 'shopName=MyShop&shopName=Other', 'shopName=MyShop&%73hopName=Other',
      'shopName[]=MyShop', 'shopName=MyShop&extra=x', 'shopId=8', 'shopName=https%3A%2F%2Fwww.etsy.com%2Fshop%2FMyShop',
      'shopName=My%2520Shop', 'shopName=%ZZ', 'shopName=%C2%A0MyShop', `shopName=${'a'.repeat(65)}`,
      `shopName=${'%20'.repeat(340)}MyShop`, ...['00', '-1', '1', '100', '20.0', '020', '20&offset=20'].map(offset => `shopName=MyShop&offset=${offset}`)]) {
      const result = await api('/shops/lookup?' + query);
      assert.equal(result.status, 400, query); assert.equal(result.body.code, 'invalid_request');
    }
    for (const route of ['/shops/lookup/?shopName=MyShop', '/shops/LOOKUP?shopName=MyShop']) assert.equal((await api(route)).status, 400);
    const bodyResult = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = httpRequest(fixture.origin + '/v1/app/integrations/etsy' + path, { method: 'GET',
        headers: { Authorization: `Bearer ${fixture.technical}`, 'X-App-Access-Token': fixture.tokens.owner,
          'Content-Type': 'application/json', 'Content-Length': '2' } }, response => {
        let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode!, body }));
      });
      request.on('error', reject); request.end('{}');
    });
    assert.equal(bodyResult.status, 400); assert.equal(JSON.parse(bodyResult.body).code, 'invalid_request');
    assert.equal(calls.length, count);
  });
  await t.test('technical/user authentication and current capability deny before provider work', async () => {
    const count = calls.length;
    for (const actor of ['member', 'foreign'] as const) {
      const result = await api(path, actor); assert.equal(result.status, 403); assert.equal(result.body.code, 'forbidden');
    }
    for (const headers of [{}, { Authorization: `Bearer ${fixture.technical}` }]) {
      const response = await fetch(fixture.origin + '/v1/app/integrations/etsy' + path, { headers });
      assert.equal(response.status, 401); await response.arrayBuffer();
    }
    await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.member]);
    await admin.query("UPDATE app_private.memberships SET status='disabled',disabled_at=clock_timestamp(),revision=revision+1 WHERE user_id=$1", [fixture.owner]);
    try { assert.equal((await api(path)).status, 403); }
    finally { await admin.query("UPDATE app_private.memberships SET status='active',disabled_at=NULL,revision=revision+1 WHERE user_id=$1", [fixture.owner]); }
    assert.equal(calls.length, count);
  });
  await t.test('database admission failure is internal503 without a provider request', async () => {
    const count = calls.length;
    await admin.query('BEGIN');
    await admin.query('SELECT id FROM app_private.workspaces WHERE id=$1 FOR UPDATE', [fixture.workspace]);
    try {
      const result = await api(path); assert.equal(result.status, 503); assert.equal(result.body.code, 'dependency_unavailable');
    } finally { await admin.query('ROLLBACK'); }
    assert.equal(calls.length, count);
  });
  await t.test('demotion and session revocation during provider I/O discard data without holding DB locks', async () => {
    for (const change of ['demotion', 'session']) {
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      state.handler = async (_request, response) => { entered.resolve(); await release.promise; response.end(lookupBody); return true; };
      const pending = api(path);
      await entered.promise;
      try {
        await admin.query("SET lock_timeout='300ms'");
        if (change === 'demotion') await admin.query("UPDATE app_private.memberships SET role_code='member',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
        else await admin.query('DELETE FROM auth.sessions WHERE id=$1', [fixture.sessions.owner]);
        release.resolve();
        const result = await pending;
        assert.equal(result.status, change === 'demotion' ? 403 : 401);
        assert.equal(result.body.code, change === 'demotion' ? 'forbidden' : 'unauthenticated');
        assert.equal('items' in result.body, false);
      } finally {
        release.resolve(); await pending;
        if (change === 'demotion') await admin.query("UPDATE app_private.memberships SET role_code='owner',revision=revision+1 WHERE user_id=$1", [fixture.owner]);
        else await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [fixture.sessions.owner, fixture.owner]);
        await admin.query("SET lock_timeout='0'");
        state.handler = lookupHandler;
      }
    }
  });
  await t.test('HTTP app-key failure is sanitized and429 persists only the existing shared cooldown', async () => {
    for (const status of [401, 429]) {
      const count = calls.length;
      state.handler = (_request, response) => { response.statusCode = status; response.setHeader('Retry-After', 'bad'); response.end('private-provider-error'); return true; };
      const result = await api(path);
      assert.equal(result.status, status === 401 ? 503 : 429);
      assert.equal(result.body.code, status === 401 ? 'configuration_unavailable' : 'upstream_rate_limited');
      assert.equal(JSON.stringify(result.body).includes('private-provider-error'), false);
      assert.equal(calls.length, count + 1);
      if (status === 429) {
        assert.equal(result.headers.get('retry-after'), '60'); assert.equal(result.body.retryAfterSeconds, 60);
        const held = await api(path, 'owner', undefined, fixture.secondOrigin);
        assert.equal(held.status, 429); assert.equal(held.body.code, 'upstream_rate_limited');
        assert.ok(Number(held.headers.get('retry-after')) >= 1 && Number(held.headers.get('retry-after')) <= 60);
        assert.equal(calls.length, count + 1);
        await admin.query('DELETE FROM app_private.etsy_cooldowns WHERE app_ref=$1', [config.clientId]);
      }
    }
    state.handler = lookupHandler;
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('actual TLS stalled bodies and client cancellation close provider work', async () => {
    for (const mode of ['deadline', 'client']) {
      const entered = Promise.withResolvers<void>(), closed = Promise.withResolvers<void>();
      state.handler = (_request, response) => {
        response.once('close', () => closed.resolve()); response.write('{"count":1,"results":['); entered.resolve(); return true;
      };
      const controller = new AbortController(), started = Date.now();
      const pending = fetch(fixture.origin + '/v1/app/integrations/etsy' + path, {
        headers: { Authorization: `Bearer ${fixture.technical}`, 'X-App-Access-Token': fixture.tokens.owner }, signal: controller.signal });
      await entered.promise;
      if (mode === 'client') { controller.abort(); await assert.rejects(pending, { name: 'AbortError' }); }
      else {
        const response = await pending; assert.equal(response.status, 503);
        const failure: unknown = await response.json();
        assert.ok(failure && typeof failure === 'object' && 'code' in failure);
        assert.equal(failure.code, 'upstream_unavailable');
        assert.ok(Date.now() - started >= 1200 && Date.now() - started < 3500);
      }
      await closed.promise;
    }
    state.handler = lookupHandler;
    assert.equal((await api(path)).status, 200);
  });
  await t.test('selected lossless ID retains revision/idempotency and callback ownership enforcement', async () => {
    assert.equal(selectedId, shopId);
    assert.equal(state.tokenCalls, 0); assert.equal(state.refreshCalls, 0);
    assert.deepEqual(await snapshot(), before);
    const intent = { expectedShopId: selectedId, expectedRevision: 0, idempotencyKey: randomUUID() };
    const created = await api('/invitations', 'owner', intent);
    assert.equal(created.status, 200);
    const replay = await api('/invitations', 'owner', intent);
    assert.equal(replay.status, 200); assert.equal(replay.body.invitationId, created.body.invitationId); assert.equal('shareUrl' in replay.body, false);
    assert.equal((await api('/invitations', 'owner', { ...intent, expectedShopId: '8' })).status, 409);
    assert.equal((await api('/invitations', 'owner', { ...intent, idempotencyKey: randomUUID() })).status, 409);
    assert.ok(typeof created.body.shareUrl === 'string');
    const started = await fixture.start(new URL(created.body.shareUrl).hash.slice(1));
    assert.equal(started.status, 303);
    const consent = new URL(started.headers.get('location')!);
    await started.arrayBuffer();
    state.handler = (request, response) => {
      if (request.url === '/v3/application/users/me') { response.end(`{"user_id":7,"shop_id":${shopId}}`); return true; }
      if (request.url === `/v3/application/shops/${shopId}`) { response.end(`{"user_id":7,"shop_id":${shopId},"shop_name":"MyShop","currency_code":"USD"}`); return true; }
      return lookupHandler(request, response);
    };
    const callback = await fixture.callback(consent.searchParams.get('state')!);
    assert.equal(callback.status, 303); await callback.arrayBuffer();
    const connection = await api('');
    assert.equal(connection.body.state, 'active'); assert.equal(connection.body.shopId, shopId);
    const connected = await snapshot();
    const observed = await api(path);
    assert.equal(observed.status, 200); assert.equal(observed.body.ownershipVerified, false);
    assert.deepEqual(await snapshot(), connected);
    assert.equal(state.tokenCalls, 1); assert.equal(state.refreshCalls, 0);
  });
});

test('Etsy lookup canonical int64 string bounds reject overflow without numeric coercion', async () => {
  interface LookupContract {
    components: { schemas: Record<string, { properties: Record<string, { type: string; pattern: string }> }> };
  }
  const contract: LookupContract = JSON.parse(await readFile(new URL('../../../../specs/001-connectivity-foundation/contracts/openapi.json', import.meta.url), 'utf8'));
  const maximum = 9223372036854775807n;
  const decimals = new Set(['0', '1', '9007199254740993', '8999999999999999999', '9223372036854775806',
    '9223372036854775807', '9223372036854775808', '9999999999999999999', '10000000000000000000']);
  // Exercise each decimal-prefix boundary independently of the schema's regexp.
  for (let place = 1n; place <= 10n ** 19n; place *= 10n) {
    const floor = maximum / place * place;
    for (const boundary of [place, floor, floor + place]) {
      for (const delta of [-1n, 0n, 1n]) decimals.add(String(boundary + delta));
    }
  }
  for (const [component, property, minimum] of [
    ['EtsyShopLookupItem', 'shopId', 1n], ['EtsyShopLookupPage', 'providerCount', 0n],
  ] as const) {
    const schema = contract.components.schemas[component]!.properties[property]!;
    const pattern = new RegExp(schema.pattern);
    const accepts = (value: unknown) => schema.type === 'string' && typeof value === 'string' && pattern.test(value);
    for (const value of decimals) {
      const integer = BigInt(value);
      assert.equal(accepts(value), integer >= minimum && integer <= maximum, `${property}: ${value}`);
    }
    for (const value of ['', '00', '01', '09223372036854775807', '-1', '-0', '+1', '1.0', '1e3',
      '9.223372036854776e18', ' 1', '1 ', '1\n', '9223372036854775807\n', '1\r\n', '1\u2028', '١',
      0, 1, Number.MAX_SAFE_INTEGER + 1, null, false, {}, []]) {
      assert.equal(accepts(value), false, `${property}: ${JSON.stringify(value)}`);
    }
  }
});
