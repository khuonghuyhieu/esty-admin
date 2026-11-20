import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import type { TestContext } from 'node:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { assertSourceApproval } from '../scripts/release-core.js';
import { parseDeployConfig, vercelDeployment } from '../scripts/vercel-deploy.js';
import { artifactFixture, fileTree, routineIngressFixture, routineRuntime, strictReleaseFixture } from './artifact-fixture.js';
import { artifactTarget, canonical, sha256 } from '../scripts/artifact.js';
import type { VerifiedArtifact } from '../scripts/artifact.js';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReleaseJournal, describeRetainedRun, readReleaseJournal, writeReleaseEvidence } from '../scripts/release-journal.js';
import type { ReleaseBinding, SupersessionApproval } from '../scripts/release-journal.js';
import { bounded } from '../scripts/bounded.js';
import { etsyReleasePhases, etsyProviderOperations, runEtsyReleasePhase, validateEtsyReleasePacket } from '../scripts/etsy-release.js';
import type { EtsyReleaseOperations, EtsyReleasePacket, EtsyReleasePhase } from '../scripts/etsy-release.js';
import { activationRuntimeKeys, runtimeConfigDigest } from '../src/config/activation-config.js';
import { currentAppMetadata } from '../scripts/activation-configuration.js';
import { manifestDigest } from '../scripts/migrations.js';
import type { MigrationReport } from '../scripts/migrations.js';
import { migrationManifest } from '../src/generated/migrations.js';
import { readEvidence } from '../scripts/release-journal.js';
import { ReleaseOutcome, approvedRoutineRequest, validateReleaseResult } from '../scripts/ci-delivery.js';
import { rootCertificates } from 'node:tls';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };

test('L4 emitted routine result preserves effects and safe terminal output', { timeout: 90000 }, async t => {
  const f = await routineIngressFixture(runtimeConfigDigest(routineRuntime)); t.after(f.dispose);
  const request = await approvedRoutineRequest(f.artifact, f.selection, f.approval, f.context, undefined);
  const requestPath = join(f.root, 'approved-request.json'), cli = join(f.root, 'tools/vercel/dist/vc.js');
  await writeFile(requestPath, JSON.stringify(request), { mode: 0o600 });
  fs.mkdirSync(join(f.root, 'tools/vercel/dist'), { recursive: true });
  await writeFile(join(f.root, 'tools/vercel/package.json'), '{"version":"65.4.0"}');
  const script = join(f.root, 'current-only.mjs');
  await writeFile(script, `
    import assert from 'node:assert/strict';
    import {mock} from 'node:test';
    import fs from 'node:fs';
    import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    import {EventEmitter} from 'node:events';
    import {PassThrough} from 'node:stream';
    import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram';
    import {verifyArtifact} from ${JSON.stringify(new URL('../scripts/artifact.js', import.meta.url).href)};
    import {routineProviderFixture} from ${JSON.stringify(new URL('./artifact-fixture.js', import.meta.url).href)};
    const request=JSON.parse(fs.readFileSync(${JSON.stringify(requestPath)},'utf8'));
    const artifact=verifyArtifact(${JSON.stringify(f.artifact.root)},request.artifactDigest);
    const fault=process.argv[2], reports=process.argv[3], resultPath=process.argv[4];
    const h=routineProviderFixture(artifact,fault==='candidate-finalization'?'candidate-wrong':fault);
    const abort=new AbortController();
    const originalOpen=fs.openSync;
    fs.openSync=(path,...args)=>{
      if((fault==='ack-persist'&&String(path).endsWith('/002.json'))
        ||(fault==='diagnostic-persist'&&String(path).endsWith('/release-outcome-0001.json'))
        ||(fault==='candidate-finalization'&&String(path).endsWith('/003.json')))throw Error('synthetic-secret-canary');
      return originalOpen(path,...args);
    };
    let runnerCalls=0,historyCalls=0,networkAttempts=0;
    const deny=()=>{networkAttempts++;throw new Error('No real network or sockets allowed');};
    net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;tls.connect=deny;dgram.createSocket=deny;
    const migrations=await import(${JSON.stringify(new URL('../scripts/migrations.js', import.meta.url).href)});
    mock.module(${JSON.stringify(new URL('../scripts/migrations.js', import.meta.url).href)}, {exports:{...migrations,
      runMigrations:async()=>{runnerCalls++;return {result:'success',database_outcome:'not_started',reporting:'written'};},
      migrationStatus:async()=>{historyCalls++;throw new Error('Current-only has no SQL authority');}}});
    globalThis.fetch=async(url,init)=>{
      const result=await h.transport(url,init);
      if(fault==='reserve-unknown'&&init?.method==='POST'&&String(url).endsWith('/deployments'))
        throw Error('synthetic-secret-canary');
      if(fault==='ack-remote'&&String(url).endsWith('/statuses')&&JSON.parse(init.body).description==='ack:dpl_candidate')
        throw Error('synthetic-secret-canary');
      if(String(url).includes('/v13/deployments/dpl_candidate')){
        if(fault==='malformed')return new Response('synthetic-secret-canary');
        if(fault==='oversized')return new Response('x'.repeat(9*1024*1024));
        if(fault==='timeout'){abort.abort(new DOMException('synthetic-secret-canary','TimeoutError'));throw abort.signal.reason;}
      }
      return result;
    };
    childProcess.spawn=(binary,args)=>{
      assert.equal(binary,process.execPath);assert.equal(args[0],${JSON.stringify(cli)});
      if(fault==='spawn-failure')throw Error('synthetic-secret-canary');
      const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
      queueMicrotask(async()=>{try{
        let result;
        if(args[1]==='deploy'){
          for(const flag of ['--prebuilt','--archive=tgz','--prod','--skip-domain'])assert.ok(args.includes(flag));
          assert.equal(args[args.indexOf('--regions')+1],'icn1');
          result=await h.cli.create();
        }else{assert.equal(args[1],'promote');result=await h.cli.promote(args[2]);}
        child.stdout.end(result.stdout);child.stderr.end();
        if(fault==='cancel-create'&&args[1]==='deploy')abort.abort();
        child.emit('close',result.code);
      }catch{child.emit('error',new Error('Synthetic CLI refused'));}});
      return child;
    };
    syncBuiltinESMExports();
    const {runRoutinePhase}=await import(${JSON.stringify(new URL('../scripts/ci-delivery.js', import.meta.url).href)});
    const env={BE_DELIVERY_MODE:'current-schema-only',BE_ROUTINE_ACTION:'deliver',
      GITHUB_TOKEN:h.credentials.github,VERCEL_TOKEN:h.credentials.vercel,BE_PREVIEW_ACCESS_KEY:h.credentials.bearer,
      VERCEL_AUTOMATION_BYPASS_SECRET:h.credentials.bypass,GITHUB_OUTPUT:resultPath+'.outputs',
      GITHUB_STEP_SUMMARY:fault==='summary-failure'?reports:resultPath+'.summary'};
    if(fault==='sql-authority')env.BE_MIGRATION_INPUTS='synthetic-sql-secret-canary';
    if(fault==='migration-action')env.BE_ROUTINE_ACTION='migrate';
    let accepted=false,error='';
    try{await runRoutinePhase({artifact,request,env,cli:${JSON.stringify(cli)},reports,signal:abort.signal});accepted=true;}
    catch(cause){error=cause.message;}
    const reportedExitCode=process.exitCode??0;process.exitCode=0;
    const receipts=fs.existsSync(reports)?fs.readdirSync(reports).sort().map(name=>JSON.parse(fs.readFileSync(reports+'/'+name,'utf8'))):[];
    fs.writeFileSync(resultPath,JSON.stringify({accepted,error,runnerCalls,historyCalls,networkAttempts,counts:h.counts(),events:h.events,
      reservation:h.reservation(),receipts,reportedExitCode}),{mode:0o600});
  `);
  for (const [index, fault] of ['', 'candidate-missing', 'final-wrong', 'sql-authority', 'migration-action',
    'create-known-nonzero', 'create-unknown', 'promote-unknown', 'ack-persist', 'ack-remote', 'malformed', 'oversized',
    'cancel-create', 'timeout', 'candidate-finalization', 'summary-failure', 'reserve-unknown', 'spawn-failure',
    'diagnostic-persist'].entries()) await t.test(fault || 'accepted', () => {
    const resultPath = join(f.root, `result-${index}.json`);
    const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', script, fault, join(f.root, `reports-${index}`), resultPath], {
      env: { PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf('/'))}:/usr/bin:/bin`, HOME: f.root },
      encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    assert.equal(result.accepted, fault === '', result.error);
    assert.deepEqual([result.runnerCalls, result.historyCalls, result.networkAttempts], [0, 0, 0], 'No-op apply is still a forbidden runner invocation');
    assert.deepEqual(result.counts, { creates: ['sql-authority', 'migration-action', 'reserve-unknown', 'spawn-failure'].includes(fault) ? 0 : 1,
      promotions: ['', 'final-wrong', 'promote-unknown', 'summary-failure'].includes(fault) ? 1 : 0 });
    assert.equal(result.receipts.some((row: Record<string, unknown>) => row.phase === 'accepted'), ['', 'summary-failure'].includes(fault));
    const terminal = child.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
      .filter(row => row.version === 1 && typeof row.status === 'string');
    assert.equal(terminal.length, 1, 'Every terminal executable phase emits exactly one bounded release result');
    const outcome = validateReleaseResult(terminal[0]);
    assert.equal(outcome.status === 'accepted', fault === '');
    assert.equal(outcome.effects.create, ['sql-authority', 'migration-action', 'reserve-unknown'].includes(fault) ? 'not-started'
      : ['create-unknown', 'spawn-failure'].includes(fault) ? 'unknown' : 'ACKed');
    assert.equal(outcome.effects.migration, 'not-started');
    assert.equal(outcome.effects.promotion, ['', 'final-wrong', 'summary-failure'].includes(fault) ? 'ACKed'
      : fault === 'promote-unknown' ? 'unknown' : 'not-started');
    if (outcome.effects.create === 'ACKed') assert.equal(outcome.deploymentId, 'dpl_candidate');
    else assert.notEqual(outcome.nextAction, 'inspect-known-deployment');
    if (['ack-persist', 'ack-remote', 'candidate-finalization', 'summary-failure', 'reserve-unknown', 'diagnostic-persist'].includes(fault)) {
      assert.equal(outcome.status, 'unknown'); assert.equal(terminal[0].evidence, 'unconfirmed');
    }
    if (fault === 'candidate-finalization') {
      assert.equal(outcome.stage, 'candidate'); assert.equal(outcome.category, 'configuration-mismatch');
    }
    if (['malformed', 'oversized'].includes(fault)) assert.equal(outcome.category, 'validation');
    if (fault === 'timeout') assert.equal(outcome.category, 'timeout');
    const output = fs.readFileSync(resultPath + '.outputs', 'utf8');
    assert.equal(output.trim().split('\n').filter(line => line.startsWith('accepted=')).at(-1), `accepted=${!fault}`);
    assert.equal(result.reportedExitCode, fault === 'summary-failure' ? 1 : 0);
    if (fault !== 'summary-failure') {
      const summary = fs.readFileSync(resultPath + '.summary', 'utf8');
      assert.ok(summary.includes(`stage=${outcome.stage}`) && summary.includes(`create=${outcome.effects.create}`)
        && summary.includes(`next=${outcome.nextAction}`));
      assert.doesNotMatch(summary, /synthetic-secret-canary|synthetic-github-token|synthetic-vercel-token/);
    }
    if (['create-known-nonzero', 'ack-persist', 'promote-unknown', 'candidate-finalization', 'timeout'].includes(fault)) {
      const path = resultPath + '.restart';
      const restarted = spawnSync(process.execPath, ['--experimental-test-module-mocks', script, '', join(f.root, `reports-${index}`), path], {
        env: { PATH: '/usr/bin:/bin', HOME: f.root }, encoding: 'utf8', timeout: 30000 });
      assert.equal(restarted.status, 0, restarted.stderr);
      const observed = JSON.parse(fs.readFileSync(path, 'utf8'));
      assert.deepEqual(observed.counts, { creates: 0, promotions: 0 });
      assert.deepEqual([observed.runnerCalls, observed.historyCalls, observed.networkAttempts], [0, 0, 0]);
      const retained = validateReleaseResult(JSON.parse(restarted.stdout.trim()));
      assert.deepEqual(retained.effects, outcome.effects); assert.equal(retained.deploymentId, outcome.deploymentId);
      assert.equal(retained.stage, outcome.stage); assert.equal(retained.category, outcome.category);
    }
    assert.doesNotMatch(JSON.stringify(result) + child.stdout + child.stderr, /synthetic-sql-secret-canary|synthetic-secret-canary|synthetic-github-token|synthetic-vercel-token/);
  });
});

test('L3 emitted strict controller fences failed phases and lost remote evidence across runner directories', { timeout: 120000 }, async t => {
  const values = { ...Object.fromEntries(Object.entries(approvedTarget).filter(([key]) => key.startsWith('SUPABASE_'))),
    MIGRATION_TARGET: 'supabase', MIGRATION_CONFIRM_PROJECT_REF: approvedTarget.SUPABASE_PROJECT_REF,
    MIGRATION_DATABASE_URL: `postgresql://${approvedTarget.SUPABASE_DATABASE_USER}:synthetic-migration-canary@${approvedTarget.SUPABASE_SESSION_HOST}:5432/postgres`,
    DATABASE_CA_PEM: rootCertificates[0]! };
  const f = await strictReleaseFixture(undefined, sha256(canonical(values)), `supabase:${approvedTarget.SUPABASE_PROJECT_REF}`);
  t.after(f.dispose);
  const inputPath = join(f.root, 'strict-input.json'), script = join(f.root, 'strict-controller.mjs');
  await writeFile(inputPath, JSON.stringify({ request: f.request, env: f.env, packet: f.packet, values }), { mode: 0o600 });
  await writeFile(script, `
    import assert from 'node:assert/strict'; import {mock} from 'node:test'; import fs from 'node:fs';
    import childProcess from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
    import {EventEmitter} from 'node:events'; import {PassThrough} from 'node:stream';
    import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram'; import {randomUUID} from 'node:crypto';
    import {verifyArtifact} from ${JSON.stringify(new URL('../scripts/artifact.js', import.meta.url).href)};
    import {routineProviderFixture} from ${JSON.stringify(new URL('./artifact-fixture.js', import.meta.url).href)};
    const input=JSON.parse(fs.readFileSync(${JSON.stringify(inputPath)},'utf8')), original=structuredClone(input.request);
    const artifact=verifyArtifact(${JSON.stringify(f.artifact.root)},input.request.artifactDigest);
    const fault=process.argv[2],reports=process.argv[3],resultPath=process.argv[4],restart=process.argv[5]==='restart';
    const h=routineProviderFixture(artifact,fault,undefined,{packet:input.packet});
    let runnerCalls=0,historyCalls=0,networkAttempts=0, action='';
    const deny=()=>{networkAttempts++;throw Error('Unexpected real network');};
    net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;tls.connect=deny;dgram.createSocket=deny;
    const migrations=await import(${JSON.stringify(new URL('../scripts/migrations.js', import.meta.url).href)});
    const target=input.request.schema.target,previous=input.request.schema.before;
    let names=previous.map(row=>row.name);
    mock.module(${JSON.stringify(new URL('../scripts/migrations.js', import.meta.url).href)},{exports:{...migrations,
      migrationStatus:async()=>{historyCalls++;return {initialized:true,ordered:true,unexpected:[],
        applied:[...names],pending:target.slice(names.length).map(row=>row.name)};},
      runMigrations:async(_database,options)=>{
        runnerCalls++;assert.deepEqual(options.expectedBefore,previous.map(row=>row.name));
        const before=[...names],unknown=fault==='sql-unknown',rolledBack=fault==='sql-rollback';
        if(!rolledBack){names=target.map(row=>row.name);h.committed();}
        return {run_id:randomUUID(),source_revision:input.packet.revision,target:input.packet.target,
          manifest_digest:input.packet.targetDigest,started_at:new Date().toISOString(),ended_at:new Date().toISOString(),
          duration_ms:1,result:unknown||rolledBack?'failed':'success',stage:unknown?'commit':'verification',failed_version:null,
          database_outcome:unknown?'unknown':rolledBack?'rolled_back':'committed',before,after:unknown?null:[...names],
          attempted:[{...target[3],outcome:unknown?'unknown':rolledBack?'rolled_back':'applied_committed'}],reporting:'not_requested'};
      }}});
    if(fault==='report-failure'){const open=fs.openSync;fs.openSync=(path,...args)=>{
      if(String(path).includes('/migration-reports/'))throw Object.assign(Error('Synthetic EIO'),{code:'EIO'});
      return open(path,...args);
    };}
    globalThis.fetch=h.transport;
    childProcess.spawn=(binary,args)=>{
      assert.equal(binary,process.execPath);assert.equal(args[0],${JSON.stringify(f.cli)});
      const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
      queueMicrotask(async()=>{try{
        let result;
        if(args[1]==='deploy'){
          for(const flag of ['--prebuilt','--archive=tgz','--prod','--skip-domain'])assert.ok(args.includes(flag));
          assert.equal(args[args.indexOf('--regions')+1],'icn1');
          assert.ok(args.includes('etsySetupPacket='+input.env.BE_MIGRATION_PACKET_SHA256));
          result=await h.cli.create();
        }else{assert.equal(args[1],'promote');result=await h.cli.promote(args[2]);}
        child.stdout.end(result.stdout);child.stderr.end();child.emit('close',result.code);
      }catch{child.emit('error',Error('Synthetic CLI refused'));}});
      return child;
    };
    syncBuiltinESMExports();
    const {runRoutinePhase}=await import(${JSON.stringify(new URL('../scripts/ci-delivery.js', import.meta.url).href)});
    const providerEnv={GITHUB_TOKEN:h.credentials.github,VERCEL_TOKEN:h.credentials.vercel,BE_PREVIEW_ACCESS_KEY:h.credentials.bearer,
      VERCEL_AUTOMATION_BYPASS_SECRET:h.credentials.bypass};
    const call=(current,where=reports,request=input.request)=>{
      const sql=current==='history'||current==='migrate';
      const env={...input.env,BE_ROUTINE_ACTION:current,...(sql?{BE_MIGRATION_INPUTS:JSON.stringify(input.values)}:providerEnv)};
      if(fault==='sql-cross-authority'&&sql)env.GITHUB_TOKEN=h.credentials.github;
      if(fault==='sql-auth-authority'&&sql)env.APP_AUTH_ADMIN_KEY='synthetic-auth-canary';
      if(fault==='sql-role-authority'&&sql)env.APP_ROLES_PASSWORD='synthetic-role-canary';
      return runRoutinePhase({artifact,request,env,cli:${JSON.stringify(f.cli)},reports:where,signal:AbortSignal.timeout(15000)});
    };
    let accepted=false,error='';
    try{
      for(action of restart?['deliver']:['authorize','history','held','migrate','deliver']){
        if(action==='migrate'&&fault==='request-drift')input.request.operatorDigest='0'.repeat(64);
        if(action==='migrate'&&fault==='stale-pre-sql'){
          const path=reports+'/strict/'+input.packet.runId+'/pre-sql-check.receipt.json';
          const receipt=JSON.parse(fs.readFileSync(path,'utf8'));receipt.completed-=60001;fs.writeFileSync(path,JSON.stringify(receipt));
        }
        await call(action);
        if(action==='migrate'&&fault==='changed-report'){
          const path=reports+'/strict/'+input.packet.runId+'/migration-report.json';
          const report=JSON.parse(fs.readFileSync(path,'utf8'));report.run_id=randomUUID();fs.writeFileSync(path,JSON.stringify(report));
        }
      }
      accepted=true;
    }catch(cause){error=cause.message;}
    const effects=h.counts(),statuses=structuredClone(h.statuses);
    if(!restart){
      await assert.rejects(call('authorize',reports+'-replacement',original));
      assert.deepEqual(h.counts(),effects);assert.deepEqual(h.statuses,statuses);
      const reconcileEnv={...input.env,...providerEnv,BE_ROUTINE_ACTION:'reconcile',BE_ROUTINE_JOURNAL:'44'};
      await runRoutinePhase({artifact,request:original,env:reconcileEnv,cli:${JSON.stringify(f.cli)},
        reports:reports+'-inspection',signal:AbortSignal.timeout(15000)});
      assert.deepEqual(h.counts(),effects);assert.deepEqual(h.statuses,statuses);
    }
    const runRoot=reports+'/strict/'+input.packet.runId;
    const read=name=>fs.existsSync(runRoot+'/'+name)?JSON.parse(fs.readFileSync(runRoot+'/'+name,'utf8')):null;
    fs.writeFileSync(resultPath,JSON.stringify({accepted,error,action,runnerCalls,historyCalls,networkAttempts,effects,statuses,
      ack:read('create-ack.json'),report:read('migration-report.json'),events:h.events}),{mode:0o600});
  `, { mode: 0o600 });
  const scenarios: Array<[string, number, number, number]> = [
    ['', 1, 1, 1], ['unexpected-503', 1, 0, 0], ['unexpected-ready', 1, 0, 0], ['candidate-wrong', 1, 0, 0],
    ['remote-intent', 0, 0, 0], ['remote-create-ack', 1, 0, 0], ['remote-sql-intent', 1, 0, 0],
    ['create-unknown', 1, 0, 0], ['create-known-nonzero', 1, 0, 0], ['sql-cross-authority', 0, 0, 0],
    ['sql-auth-authority', 0, 0, 0], ['sql-role-authority', 0, 0, 0],
    ['request-drift', 1, 0, 0], ['stale-pre-sql', 1, 0, 0], ['sql-rollback', 1, 1, 0], ['sql-unknown', 1, 1, 0],
    ['report-failure', 1, 1, 0], ['changed-report', 1, 1, 0], ['remote-sql-receipt', 1, 1, 0],
    ['promote-unknown', 1, 1, 1], ['remote-promote-ack', 1, 1, 1], ['remote-final-ack', 1, 1, 1], ['final-wrong', 1, 1, 1],
  ];
  for (const [index, [fault, creates, migrations, promotions]] of scenarios.entries()) await t.test(fault || 'exact same-ID strict cutover', () => {
    const resultPath = join(f.root, `strict-result-${index}.json`);
    const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', script, fault, join(f.root, `strict-reports-${index}`), resultPath], {
      env: { PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf('/'))}:/usr/bin:/bin`, HOME: f.root }, encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    assert.equal(result.accepted, fault === '', result.error);
    assert.deepEqual(result.effects, { creates, promotions }); assert.equal(result.runnerCalls, migrations); assert.equal(result.networkAttempts, 0);
    assert.equal(result.ack?.deploymentId ?? null, creates && fault !== 'create-unknown' ? 'dpl_candidate' : null);
    if (migrations) assert.equal(result.report.database_outcome, fault === 'sql-unknown' ? 'unknown' : fault === 'sql-rollback' ? 'rolled_back' : 'committed');
    assert.equal(result.statuses[0].state === 'success', fault === '');
    const terminals = child.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
      .filter(row => row.version === 1 && typeof row.status === 'string');
    assert.ok(terminals.length >= 2, 'Original attempt and refused replacement each expose their own bounded result');
    const terminal = validateReleaseResult(terminals[0]);
    assert.equal(terminal.status === 'accepted', fault === '');
    if (creates && fault !== 'create-unknown') assert.equal(terminal.deploymentId, 'dpl_candidate');
    if (migrations) {
      assert.equal(terminal.effects.migration, fault === 'sql-unknown' ? 'unknown' : 'ACKed');
      assert.equal(terminal.migration?.database_outcome, result.report.database_outcome);
      if (!['sql-unknown', 'sql-rollback'].includes(fault)) {
        assert.deepEqual(terminal.migration?.after, f.request.schema.target.map(row => row.name));
      }
    }
    if (fault === 'remote-create-ack') assert.equal(terminal.effects.create, 'ACKed');
    if (fault === 'report-failure') {
      assert.equal(terminal.status, 'unknown'); assert.equal(terminal.migration?.reporting, 'failed');
    }
    if (fault === 'promote-unknown') assert.equal(terminal.effects.promotion, 'unknown');
    if (['remote-create-ack', 'report-failure', 'remote-sql-receipt', 'sql-unknown', 'promote-unknown'].includes(fault)) {
      for (const corrupt of fault === 'remote-sql-receipt' ? [false, true] : [false]) {
        let reports = join(f.root, `strict-reports-${index}`);
        if (corrupt) {
          const copy = reports + '-corrupt'; fs.cpSync(reports, copy, { recursive: true }); reports = copy;
          const last = fs.readdirSync(reports).filter(name => name.startsWith('release-outcome-')).sort().at(-1)!;
          fs.writeFileSync(join(reports, last), '{invalid');
        }
        const restartedPath = resultPath + (corrupt ? '.corrupt' : '.restart');
        const restarted = spawnSync(process.execPath, ['--experimental-test-module-mocks', script, '', reports, restartedPath, 'restart'], {
          env: { PATH: '/usr/bin:/bin', HOME: f.root }, encoding: 'utf8', timeout: 30000 });
        assert.equal(restarted.status, 0, restarted.stderr);
        const observed = JSON.parse(fs.readFileSync(restartedPath, 'utf8'));
        assert.deepEqual(observed.effects, { creates: 0, promotions: 0 });
        assert.deepEqual([observed.runnerCalls, observed.historyCalls, observed.networkAttempts], [0, 0, 0]);
        const lines = restarted.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
        assert.equal(lines.length, 1);
        const retained = validateReleaseResult(lines[0]);
        assert.equal(retained.deploymentId, terminal.deploymentId);
        assert.deepEqual(retained.effects, terminal.effects);
        assert.deepEqual(retained.migration, terminal.migration);
        if (!corrupt) { assert.equal(retained.stage, terminal.stage); assert.equal(retained.category, terminal.category); }
        else { assert.equal(retained.status, 'unknown'); assert.equal(lines[0].evidence, 'unconfirmed'); }
        assert.doesNotMatch(restarted.stdout + restarted.stderr, /synthetic-migration-canary|synthetic-github-token|synthetic-vercel-token/);
      }
    }
    assert.doesNotMatch(JSON.stringify(result) + child.stdout + child.stderr,
      /synthetic-migration-canary|synthetic-secret-canary|synthetic-github-token|synthetic-vercel-token|synthetic-auth-canary|synthetic-role-canary/);
  });
});

function outcomeFixture(migrate = false) {
  const previous = migrationManifest.slice(0, 3), target = migrate ? migrationManifest : previous;
  const request = { version: 1, mode: migrate ? 'etsy-strict-cutover' : 'current-schema-only',
    repository: 'khuonghuyhieu/esty-admin', target: 'supabase:abcdefghijklmnopqrst',
    controller: { revision: 'a'.repeat(40), tree: 'b'.repeat(40), run: '901' },
    producer: { revision: 'c'.repeat(40), tree: 'd'.repeat(40), run: '900' }, artifactId: '902',
    artifactDigest: 'e'.repeat(64), sourceDigest: '0'.repeat(64), archiveDigest: 'f'.repeat(64), operatorDigest: '1'.repeat(64), configDigest: '2'.repeat(64),
    schema: { beforeDigest: manifestDigest(previous), targetDigest: manifestDigest(target), before: previous, target }, migration: migrate ? {
      packetDigest: '3'.repeat(64), predecessor: { id: 'dpl_previous', revision: '4'.repeat(40),
        artifactDigest: '5'.repeat(64), configDigest: '6'.repeat(64) }, recoveryApproval: '7'.repeat(64),
      compatibilityApproval: null, maintenanceApproval: '8'.repeat(64),
    } : null };
  const state = new ReleaseOutcome(request, { version: 1, requestDigest: sha256(canonical(request)) });
  const report: MigrationReport = { run_id: '00000000-0000-4000-8000-000000000001',
    source_revision: request.producer.revision, target: 'supabase:abcdefghijklmnopqrst', manifest_digest: manifestDigest(target),
    started_at: '2026-11-20T00:00:00.000Z', ended_at: '2026-11-20T00:00:01.000Z', duration_ms: 1000,
    result: 'success', stage: 'verification', failed_version: null, database_outcome: 'committed',
    before: previous.map(item => item.name), after: target.map(item => item.name),
    attempted: target.slice(previous.length).map(item => ({ ...item, outcome: 'applied_committed' })), reporting: 'written' };
  return { state, report };
}

test('L0 lost CREATE or promotion ACK remains unknown, not a retry permission', () => {
  const { state } = outcomeFixture();
  const refused = state.finish({ stage: 'configuration', category: 'missing-prerequisite',
    nextAction: 'inspect-prerequisite', receiptDigest: null });
  assert.equal(refused.status, 'refused');
  assert.deepEqual(refused.effects, { create: 'not-started', migration: 'not-started', promotion: 'not-started' });
  state.submitted('create');
  let result = state.finish({ stage: 'create', category: 'timeout', nextAction: 'inspect-retained-evidence', receiptDigest: null });
  assert.equal(result.status, 'unknown'); assert.equal(result.effects.create, 'unknown'); assert.equal(result.deploymentId, null);
  assert.throws(() => state.submitted('create'), /Release contract/);
  state.acknowledgeCreate('dpl_known');
  // A nonzero CLI with a valid ID acknowledges creation, not acceptance or rollback.
  result = state.finish({ stage: 'create', category: 'transport', nextAction: 'inspect-known-deployment', receiptDigest: null });
  assert.equal(result.status, 'failed'); assert.equal(result.effects.create, 'ACKed'); assert.equal(result.deploymentId, 'dpl_known');
  state.submitted('promotion');
  result = state.finish({ stage: 'promote', category: 'timeout', nextAction: 'reconcile-promotion', receiptDigest: null });
  assert.equal(result.status, 'unknown'); assert.equal(result.effects.promotion, 'unknown'); assert.equal(result.deploymentId, 'dpl_known');
  assert.throws(() => state.submitted('promotion'), /Release contract/);
  assert.deepEqual(validateReleaseResult(JSON.parse(JSON.stringify(result))), result);
});

test('L0 committed SQL and known ID survive later provider and evidence failures', () => {
  const { state, report } = outcomeFixture(true);
  state.submitted('create'); state.acknowledgeCreate('dpl_held');
  state.submitted('migration'); state.acknowledgeMigration(report);
  report.after = []; // A caller cannot rewrite retained confirmed history.
  for (const [stage, category] of [['candidate', 'validation'], ['receipt', 'evidence-persistence']] as const) {
    const result = state.finish({ stage, category, nextAction: 'inspect-known-deployment', receiptDigest: null });
    assert.equal(result.status, stage === 'receipt' ? 'unknown' : 'failed'); assert.equal(result.deploymentId, 'dpl_held');
    assert.equal(result.effects.migration, 'ACKed'); assert.equal(result.migration?.database_outcome, 'committed');
    assert.deepEqual(result.migration?.after, migrationManifest.map(item => item.name));
    assert.deepEqual(result.migration?.attempted, migrationManifest.slice(3).map(item => ({ ...item, outcome: 'applied_committed' })));
    assert.equal(result.effects.promotion, 'not-started');
  }
});

test('L0 SQL submitted without confirmation fences promotion and preserves unknown outcome', () => {
  const { state, report } = outcomeFixture(true);
  state.submitted('create'); state.acknowledgeCreate('dpl_held'); state.submitted('migration');
  let result = state.finish({ stage: 'sql', category: 'outcome-unknown', nextAction: 'reconcile-migration', receiptDigest: null });
  assert.equal(result.status, 'unknown'); assert.equal(result.effects.migration, 'unknown'); assert.equal(result.migration, null);
  assert.throws(() => state.submitted('promotion'), /Release contract/);
  state.acknowledgeMigration({ ...report, result: 'failed', database_outcome: 'unknown', after: null,
    attempted: report.attempted.map(item => ({ ...item, outcome: 'unknown' })) });
  result = state.finish({ stage: 'sql', category: 'outcome-unknown', nextAction: 'reconcile-migration', receiptDigest: null });
  assert.equal(result.effects.migration, 'unknown'); assert.equal(result.migration?.database_outcome, 'unknown');
  assert.throws(() => state.submitted('promotion'), /Release contract/);
});

test('L0 confirmed rollback is acknowledged without claiming commit or permitting promotion', () => {
  const { state, report } = outcomeFixture(true);
  state.submitted('create'); state.acknowledgeCreate('dpl_held'); state.submitted('migration');
  state.acknowledgeMigration({ ...report, result: 'failed', database_outcome: 'rolled_back', after: report.before,
    attempted: report.attempted.map(item => ({ ...item, outcome: 'rolled_back' })) });
  const result = state.finish({ stage: 'sql', category: 'validation', nextAction: 'inspect-retained-evidence', receiptDigest: null });
  assert.equal(result.status, 'failed'); assert.equal(result.effects.migration, 'ACKed');
  assert.equal(result.migration?.database_outcome, 'rolled_back');
  assert.throws(() => state.submitted('promotion'), /Release contract/);
});

test('L0 report identity and secret canaries cannot cross the result boundary', () => {
  const { state, report } = outcomeFixture(true);
  state.submitted('create'); state.acknowledgeCreate('dpl_held'); state.submitted('migration');
  for (const patch of [{ source_revision: '0'.repeat(40) }, { manifest_digest: '0'.repeat(64) },
    { target: 'supabase:tsrqponmlkjihgfedcba' }, { after: ['postgres://user:synthetic-secret-canary@private.invalid/db'] },
    { attempted: [{ ...report.attempted[0]!, name: 'synthetic-secret-canary' }] }]) {
    assert.throws(() => state.acknowledgeMigration({ ...report, ...patch }), error => {
      assert.ok(error instanceof Error); assert.doesNotMatch(error.message, /synthetic-secret-canary|private\.invalid/); return true;
    });
  }
  state.acknowledgeMigration({ ...report, result: 'failed', reporting: 'failed' });
  const result = state.finish({ stage: 'receipt', category: 'evidence-persistence', nextAction: 'inspect-retained-evidence', receiptDigest: null });
  assert.equal(result.migration?.database_outcome, 'committed');
  assert.equal(result.effects.migration, 'ACKed');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-canary|postgres:|private\.invalid/);
  for (const patch of [{ status: 'refused' }, { effects: { ...result.effects, migration: 'not-started' } },
    { migration: { ...result.migration, database_outcome: 'rolled_back' } }]) {
    assert.throws(() => validateReleaseResult({ ...result, ...patch }), /Release contract/);
  }
});

test('L0 a failed migration report preserves confirmed commit but cannot authorize promotion', () => {
  const { state, report } = outcomeFixture(true);
  state.submitted('create'); state.acknowledgeCreate('dpl_held'); state.submitted('migration');
  state.acknowledgeMigration({ ...report, result: 'failed' });
  const result = state.finish({ stage: 'sql', category: 'validation', nextAction: 'inspect-retained-evidence', receiptDigest: null });
  assert.equal(result.status, 'failed'); assert.equal(result.migration?.database_outcome, 'committed');
  assert.equal(result.migration?.result, 'failed'); assert.equal(result.effects.migration, 'ACKed');
  assert.throws(() => state.submitted('promotion'), /Release contract/);
});

test('L0 strict cutover acceptance retains committed versions and same-ID final proof', () => {
  const { state, report } = outcomeFixture(true);
  state.submitted('create'); state.acknowledgeCreate('dpl_held'); state.submitted('migration');
  state.acknowledgeMigration(report); state.submitted('promotion'); state.acknowledgePromotion();
  const result = state.finish({ stage: 'receipt', category: null, nextAction: 'run-acceptance', receiptDigest: '9'.repeat(64),
    proof: { deploymentId: 'dpl_held', artifactDigest: state.request.artifactDigest, configDigest: state.request.configDigest,
      schemaDigest: manifestDigest(state.request.schema.target), domain: 'api.lovora.us', checks: 'passed' } });
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.effects, { create: 'ACKed', migration: 'ACKed', promotion: 'ACKed' });
  assert.deepEqual(result.migration?.after, migrationManifest.map(item => item.name));
  assert.throws(() => state.submitted('migration'), /Release contract/);
  assert.throws(() => state.submitted('create'), /Release contract/);
  assert.throws(() => state.submitted('promotion'), /Release contract/);
});
// Protocol-only cases isolate storage; durability is exercised with real journals below.
const checkpoints = { beforeCreate() {}, acknowledged(_id: string) {} };
let artifact: VerifiedArtifact;
let dispose: () => Promise<void>;
before(async () => { const fixture = await artifactFixture(); artifact = fixture.artifact; dispose = fixture.dispose; });
after(async () => { await dispose?.(); });

const revision = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const deploy = parseDeployConfig({ VERCEL_TOKEN: 'synthetic-provider-token', VERCEL_PROJECT_ID: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls',
  VERCEL_SCOPE: 'khuonghuyhieu0705s-projects', VERCEL_TEAM_ID: artifactTarget.owner, REPOSITORY: 'https://github.com/synthetic/repository',
  DEPLOYMENT_TARGET: 'production', PREVIEW_ACCESS_KEY: 'c'.repeat(64), API_ORIGIN: 'https://api.lovora.us', BROWSER_ORIGIN: 'https://app.lovora.us' });
const project = { id: deploy.VERCEL_PROJECT_ID, name: 'esty-admin-api', accountId: deploy.VERCEL_TEAM_ID,
  rootDirectory: 'apps/api', framework: 'nestjs', nodeVersion: '24.x', buildCommand: null, installCommand: null, outputDirectory: null,
  link: { type: 'github', org: 'synthetic', repo: 'repository', repoId: 123, productionBranch: 'main', deployHooks: [] } };
const deployment = { id: 'dpl_synthetic', projectId: deploy.VERCEL_PROJECT_ID, ownerId: deploy.VERCEL_TEAM_ID, target: 'production', readyState: 'READY' };
const domain = { name: 'api.lovora.us', projectId: deploy.VERCEL_PROJECT_ID, verified: true };
const alias = { alias: 'api.lovora.us', projectId: deploy.VERCEL_PROJECT_ID, deploymentId: deployment.id, deployment: { id: deployment.id } };
function synthetic(options: { project?: unknown; domain?: unknown; deployment?: unknown; alias?: (count: number) => unknown; smoke?: () => Response; postStatus?: number; createId?: string; files?: unknown; onUpload?: () => Promise<void>; onRequest?: (url: URL, init?: RequestInit) => void; artifact?: VerifiedArtifact } = {}) {
  let bindings = 0, requests = 0;
  const selected = options.artifact ?? artifact;
  let uploads = 0, creates = 0;
  const received = new Map<string, Uint8Array>();
  const transport: typeof fetch = async (input, init) => {
    requests++;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(init?.redirect, 'error');
    options.onRequest?.(url, init);
    if (url.origin === 'https://api.vercel.com') {
      assert.equal(headers.get('authorization'), `Bearer ${deploy.VERCEL_TOKEN}`);
      assert.equal(url.searchParams.get('teamId'), deploy.VERCEL_TEAM_ID);
      assert.equal(url.searchParams.get('slug'), deploy.VERCEL_SCOPE);
      if (url.pathname === `/v9/projects/${deploy.VERCEL_PROJECT_ID}`) return Response.json(options.project ?? project);
      if (url.pathname.endsWith('/domains/api.lovora.us')) return Response.json(options.domain ?? domain);
      if (url.pathname === '/v2/files') {
        uploads++;
        assert.equal(init?.method, 'POST'); assert.equal(headers.get('content-type'), 'application/octet-stream');
        assert.ok(init?.body instanceof Uint8Array);
        const bytes = init.body;
        const digest = createHash('sha1').update(bytes).digest('hex');
        assert.equal(headers.get('x-now-digest'), digest);
        assert.equal(Number(headers.get('x-now-size')), bytes.byteLength);
        assert.equal(Number(headers.get('content-length')), bytes.byteLength);
        received.set(digest, bytes);
        await options.onUpload?.();
        return new Response(null, { status: 200 });
      }
      if (url.pathname === `/v6/deployments/${deployment.id}/files`) return Response.json(options.files ?? fileTree(selected));
      if (url.pathname === '/v13/deployments' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        creates++;
        assert.equal(url.searchParams.get('prebuilt'), '1'); assert.equal(body.gitSource, undefined);
        assert.deepEqual(body.files, selected.manifest.files.filter(file => file.path.startsWith('.vercel/output/')).map(file => ({ file: file.path, sha: file.sha1, size: file.size, mode: 0o100000 | file.mode })));
        for (const file of body.files) assert.equal(received.get(file.sha)?.byteLength, file.size);
        assert.equal(body.project, deploy.VERCEL_PROJECT_ID); assert.equal(body.target, 'production');
        return Response.json({ id: options.createId ?? deployment.id, meta: { githubCommitSha: revision } }, { status: options.postStatus ?? 200 });
      }
      if (url.pathname === `/v13/deployments/${deployment.id}`) {
        return Response.json(options.deployment ?? deployment);
      }
      if (url.pathname === '/v4/aliases/api.lovora.us') { bindings++; return Response.json(options.alias?.(bindings) ?? alias); }
      throw new Error('Unexpected synthetic provider route; no network fallback.');
    }
    assert.equal(url.origin, deploy.API_ORIGIN);
    assert.notEqual(headers.get('authorization'), `Bearer ${deploy.VERCEL_TOKEN}`);
    if (options.smoke) return options.smoke();
    if (init?.method === 'OPTIONS') return headers.get('origin') === deploy.BROWSER_ORIGIN
      ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': deploy.BROWSER_ORIGIN } }) : Response.json({ status: 'unauthorized' }, { status: 401 });
    if (headers.get('authorization') !== `Bearer ${deploy.PREVIEW_ACCESS_KEY}`) return Response.json({ status: 'unauthorized' }, { status: 401 });
    if (url.pathname === '/health/live') return Response.json({ status: 'ok' });
    if (url.pathname === '/health/ready') return Response.json({ status: 'ready', database: 'up', migrations: 'current' });
    if (url.pathname === '/__release_unknown_route') return new Response(null, { status: 404 });
    throw new Error('Unexpected synthetic application route; no network fallback.');
  };
  return { adapter: vercelDeployment(deploy, selected, transport), bindings: () => bindings, requests: () => requests, uploads: () => uploads, creates: () => creates };
}
const signal = () => AbortSignal.timeout(5000);
test('source approval rejects dirty, mismatched revision and changed manifest', () => {
  for (const actual of [{ revision, dirty: true, digest }, { revision: 'c'.repeat(40), dirty: false, digest }, { revision, dirty: false, digest: 'd'.repeat(64) }]) {
    assert.throws(() => assertSourceApproval(actual, revision, digest), /exact clean/);
  }
  assertSourceApproval({ revision, dirty: false, digest }, revision, digest);
});
test('deploy context rejects retired, mixed, wrong project, implicit target and unsafe origins', () => {
  for (const changes of [{ RENDER_API_KEY: 'synthetic' }, { DATABASE_URL: 'synthetic' }, { MIGRATION_DATABASE_URL: 'synthetic' },
    { API_ORIGIN: 'http://api.lovora.us' }, { API_ORIGIN: 'https://other.example' }, { VERCEL_PROJECT_ID: 'prj_other' },
    { VERCEL_SCOPE: 'other' }, { VERCEL_TEAM_ID: '../other' }, { DEPLOYMENT_TARGET: undefined }, { DEPLOYMENT_TARGET: 'preview' },
    { REPOSITORY: deploy.REPOSITORY + '.git' }, { PREVIEW_ACCESS_KEY: 'wrong' }]) assert.throws(() => parseDeployConfig({ ...deploy, ...changes }));
});
test('project and verified domain mismatches block deployment', async () => {
  for (const changes of [{ id: 'prj_other' }, { accountId: 'team_other' }, { rootDirectory: 'apps/web' }, { framework: 'nextjs' },
    { nodeVersion: '22.x' }, { commandForIgnoringBuildStep: 'exit 0' }, { link: { ...project.link, productionBranch: 'other' } },
    { buildCommand: 'unapproved-build' }, { installCommand: 'unapproved-install' }, { outputDirectory: 'other' },
    { link: { ...project.link, deployHooks: [{}] } }, { link: { ...project.link, repoId: undefined } }]) {
    const { adapter } = synthetic({ project: { ...project, ...changes } });
    await assert.rejects(adapter.preflight(signal())); await assert.rejects(adapter.trigger(revision, signal(), checkpoints));
  }
  for (const changes of [{ verified: false }, { projectId: 'prj_other' }, { redirect: 'https://other.example' }, { gitBranch: 'other' }]) {
    await assert.rejects(synthetic({ domain: { ...domain, ...changes } }).adapter.preflight(signal()));
  }
});
test('provider identity must match the created prebuilt invocation, not source metadata', async () => {
  for (const changes of [{ gitSource: { sha: revision } }, { id: 'dpl_other' }, { projectId: 'prj_other' },
    { ownerId: 'team_other' }, { target: 'preview' }, { readyState: 'UNKNOWN' }]) {
    const { adapter } = synthetic({ deployment: { ...deployment, ...changes } });
    await adapter.preflight(signal()); await assert.rejects(adapter.trigger(revision, signal(), checkpoints));
  }
  for (const postStatus of [202, 302, 500]) {
    const { adapter } = synthetic({ postStatus }); await adapter.preflight(signal()); await assert.rejects(adapter.trigger(revision, signal(), checkpoints));
  }
});

test('deployment diagnostics classify transport failures without retaining upstream data', async t => {
  for (const [name, code, expected] of [
    ['dns', 'ENOTFOUND', 'dns'], ['tcp', 'ECONNRESET', 'tcp'], ['tls', 'ERR_TLS_CERT_ALTNAME_INVALID', 'tls'],
    ['timeout', 'UND_ERR_HEADERS_TIMEOUT', 'timeout'], ['unknown', 'synthetic-private-code', 'unclassified'],
  ]) await t.test(name!, async () => {
    const upstream = new TypeError('synthetic-private-message', { cause: Object.assign(new Error('synthetic-private-cause'), { code }) });
    const current = synthetic({ onRequest() { throw upstream; } });
    const active = signal();
    await assert.rejects(current.adapter.preflight(active));
    const diagnostics = current.adapter.diagnostics(upstream, active);
    assert.deepEqual(diagnostics, { operation: 'preflight', request_state: 'in_flight', category: expected, http_status: null, deploy_id: null });
    assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic-private|https:|ENOTFOUND|ECONNRESET/);
  });
});
test('deployment diagnostics distinguish upload and uncertain create from acknowledged inspection and attestation', async t => {
  for (const [operation, path, acknowledged] of [
    ['upload', '/v2/files', false], ['create', '/v13/deployments', false],
    ['inspect', `/v13/deployments/${deployment.id}`, true], ['attest', `/v6/deployments/${deployment.id}/files`, true],
  ] as const) await t.test(operation, async () => {
    const upstream = new TypeError('synthetic-private-message', { cause: { code: 'ECONNRESET' } });
    const current = synthetic({ onRequest(url) { if (url.pathname === path) throw upstream; } });
    const active = signal();
    await current.adapter.preflight(active);
    await assert.rejects(current.adapter.trigger(revision, active, checkpoints));
    assert.deepEqual(current.adapter.diagnostics(upstream, active), {
      operation, request_state: 'in_flight', category: 'tcp', http_status: null, deploy_id: acknowledged ? deployment.id : null,
    });
    assert.equal(current.creates(), acknowledged ? 1 : 0);
  });
});
test('HTTP rejection is recorded without turning a create response into acknowledgement', async () => {
  const current = synthetic({ postStatus: 429 }), active = signal();
  await current.adapter.preflight(active);
  await assert.rejects(current.adapter.trigger(revision, active, checkpoints));
  assert.deepEqual(current.adapter.diagnostics(undefined, active), {
    operation: 'create', request_state: 'response_received', category: 'http', http_status: 429, deploy_id: null,
  });
  assert.equal(current.creates(), 1);
});
test('active cancellation classification survives the outer bounded race', async t => {
  for (const [category, reason] of [['aborted', new Error('synthetic-private-reason')], ['timeout', new DOMException('synthetic-private-reason', 'TimeoutError')]] as const) {
    await t.test(category, async () => {
      const controller = new AbortController();
      const current = synthetic({ onUpload: () => {
        queueMicrotask(() => controller.abort(reason));
        return new Promise<void>(() => {});
      } });
      await current.adapter.preflight(signal());
      let failure: unknown;
      await assert.rejects(bounded(current.adapter.trigger(revision, controller.signal, checkpoints), controller.signal), error => { failure = error; return true; });
      assert.deepEqual(current.adapter.diagnostics(failure, controller.signal), {
        operation: 'upload', request_state: 'in_flight', category, http_status: null, deploy_id: null,
      });
      assert.equal(current.creates(), 0);
    });
  }
});
test('unsafe or oversized create identifiers never enter diagnostic reports', async () => {
  for (const createId of ['https://synthetic-private.example/token', 'dpl_' + 'a'.repeat(125)]) {
    const current = synthetic({ createId }), active = signal();
    await current.adapter.preflight(active);
    await assert.rejects(current.adapter.trigger(revision, active, checkpoints));
    const diagnostics = current.adapter.diagnostics(undefined, active);
    assert.equal(diagnostics.operation, 'create'); assert.equal(diagnostics.request_state, 'response_received');
    assert.equal(diagnostics.deploy_id, null);
    assert.ok(!JSON.stringify(diagnostics).includes(createId));
  }
});
test('normalized pending and terminal provider states are never READY success', async () => {
  for (const [readyState, expected] of [['QUEUED', 'queued'], ['INITIALIZING', 'building'], ['BUILDING', 'building'], ['ERROR', 'failed'], ['BLOCKED', 'failed'], ['CANCELED', 'canceled']] as const) {
    const { adapter } = synthetic({ deployment: { ...deployment, readyState } });
    await adapter.preflight(signal()); const state = await adapter.trigger(revision, signal(), checkpoints);
    assert.equal(state.status, expected); await assert.rejects(adapter.smoke(state, signal()));
  }
});
test('same-deployment domain binding and safe HTTP must both hold before and after smoke', async () => {
  const valid = synthetic(); await valid.adapter.preflight(signal());
  const state = await valid.adapter.trigger(revision, signal(), checkpoints);
  await valid.adapter.smoke(state, signal()); assert.equal(valid.bindings(), 2);
  for (const changes of [{ deploymentId: 'dpl_old' }, { projectId: 'prj_other' }, { deployment: { id: 'dpl_old' } },
    { deletedAt: 1 }, { redirect: 'https://other.example' }, { microfrontends: {} }]) {
    const current = synthetic({ alias: () => ({ ...alias, ...changes }) });
    await current.adapter.preflight(signal()); const currentState = await current.adapter.trigger(revision, signal(), checkpoints);
    await assert.rejects(current.adapter.smoke(currentState, signal()));
  }
  const changed = synthetic({ alias: count => count === 1 ? alias : { ...alias, deploymentId: 'dpl_old' } });
  await changed.adapter.preflight(signal()); const changedState = await changed.adapter.trigger(revision, signal(), checkpoints);
  await assert.rejects(changed.adapter.smoke(changedState, signal())); assert.equal(changed.bindings(), 2);
  for (const smoke of [() => new Response('<html>Loading</html>'), () => Response.json({ status: 'ready' }), () => new Response(null, { status: 302 })]) {
    const current = synthetic({ smoke }); await current.adapter.preflight(signal()); const currentState = await current.adapter.trigger(revision, signal(), checkpoints);
    await assert.rejects(current.adapter.smoke(currentState, signal()));
  }
});
test('missing or altered provider file attestation cannot become ready', async () => {
  for (const files of [[], [{ name: '.vercel', type: 'directory', children: [] }], [{ name: '../secret', type: 'file' }]]) {
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
  }
});
test('canonical decimal provider modes attest the complete approved artifact', async () => {
  const current = synthetic({ files: fileTree(artifact, true) });
  await current.adapter.preflight(signal());
  const state = await current.adapter.trigger(revision, signal(), checkpoints);
  assert.equal(state.status, 'ready');
  assert.equal(state.artifactDigest, artifact.digest);
  await current.adapter.smoke(state, signal());
  assert.equal(current.bindings(), 2);
});
test('provider mode normalization rejects coercion, overflow and changed full POSIX values', async t => {
  const expected = 0o100000 | artifact.manifest.files.find(file => file.path.startsWith('.vercel/output/'))!.mode;
  const rejected: [string, unknown][] = [
    ['missing', undefined], ['null', null], ['boolean', true], ['array', [expected]], ['object', { value: expected }],
    ['empty', ''], ['whitespace', ` ${expected}`], ['trailing whitespace', `${expected}\n`],
    ['leading zero', `0${expected}`], ['positive sign', `+${expected}`], ['negative', -expected],
    ['decimal fraction', `${expected}.0`], ['numeric fraction', expected + 0.5], ['exponent', `${expected}e0`],
    ['hexadecimal', `0x${expected.toString(16)}`], ['octal prefix', `0o${expected.toString(8)}`],
    ['octal digits', expected.toString(8)], ['suffix', `${expected}x`], ['oversized string', '9'.repeat(100)],
    ['mode range overflow', 65536], ['bitwise wrap', expected + 2 ** 32], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['permissions only', expected & 0o777], ['special bit', expected | 0o4000],
    ['different permissions', expected ^ 0o100], ['wrong file type', 0o120000 | (expected & 0o777)],
    ['wrong decimal mode', String(expected ^ 0o100)],
  ];
  for (const [name, mode] of rejected) await t.test(name, async () => {
    const files = fileTree(artifact, true);
    const leaves = (entries: any[]): any[] => entries.flatMap(entry => entry.type === 'directory' ? leaves(entry.children) : [entry]);
    leaves(files)[0].mode = mode;
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
    assert.equal(current.bindings(), 0);
  });
});
test('decimal modes do not excuse changed file identity, root or duplicate evidence', async t => {
  for (const name of ['uid', 'type', 'root', 'path', 'duplicate', 'missing', 'extra']) await t.test(name, async () => {
    const files = fileTree(artifact, true), directory = files[0].children[0].children[0];
    const file = directory.children.find((entry: any) => entry.type === 'file');
    if (name === 'uid') file.uid = '0'.repeat(40);
    if (name === 'type') file.type = 'symlink';
    if (name === 'root') files[0].name = 'rebased';
    if (name === 'path') file.name = '../' + file.name;
    if (name === 'duplicate') directory.children.push({ ...file });
    if (name === 'missing') directory.children.splice(directory.children.indexOf(file), 1);
    if (name === 'extra') directory.children.push({ ...file, name: 'unapproved.json' });
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
    assert.equal(current.bindings(), 0);
  });
});
test('provider envelope requires exact source namespace and single generated output', async t => {
  for (const name of ['bare tree', 'missing source', 'duplicate source', 'extra namespace', 'wrong source type',
    'wrong directory mode', 'missing output', 'extra function', 'wrong function name', 'wrong output type',
    'wrong output mode', 'nested output', 'rebased source contents']) await t.test(name, async () => {
    let files: any[] = fileTree(artifact);
    const source = files[0], output = files[1], runtime = output.children[0];
    if (name === 'bare tree') files = source.children;
    if (name === 'missing source') files = [output];
    if (name === 'duplicate source') files = [source, source];
    if (name === 'extra namespace') files.push({ name: 'other', type: 'directory', mode: 0o40555, children: [] });
    if (name === 'wrong source type') source.type = 'file';
    if (name === 'wrong directory mode') source.mode = 0o40755;
    if (name === 'missing output') output.children = [];
    if (name === 'extra function') output.children.push({ ...runtime, name: 'unapproved' });
    if (name === 'wrong function name') runtime.name = 'other';
    if (name === 'wrong output type') runtime.type = 'file';
    if (name === 'wrong output mode') runtime.mode = 0o100666;
    if (name === 'nested output') runtime.children = [{ name: 'unapproved', type: 'file' }];
    if (name === 'rebased source contents') source.children = source.children[0].children;
    const current = synthetic({ files }); await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
    assert.equal(current.bindings(), 0);
  });
});
test('mutation during upload and cancellation never create a deployment or retry', async t => {
  for (const mode of ['mutate', 'cancel']) await t.test(mode, async t => {
    const fixture = await artifactFixture(); t.after(fixture.dispose);
    const controller = new AbortController();
    const current = synthetic({ artifact: fixture.artifact, onUpload: async () => {
      if (mode === 'cancel') { controller.abort(); return; }
      const path = join(fixture.artifact.root, '.vercel/output/functions/index.func/apps/api/src/main.js');
      await chmod(path, 0o600); await writeFile(path, 'tampered');
    } });
    await current.adapter.preflight(signal());
    await assert.rejects(current.adapter.trigger(revision, controller.signal, checkpoints));
    assert.equal(current.creates(), 0);
    if (mode === 'cancel') assert.equal(current.uploads(), 1);
  });
});

function journalFixture(t: TestContext) {
  const directory = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'esty-journal-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previousId = randomUUID(), previousRevision = 'd'.repeat(40);
  writeReleaseEvidence(join(directory, 'operator.lock'), { run_id: previousId, revision: previousRevision });
  writeReleaseEvidence(join(directory, `${previousId}.json`), {
    run_id: previousId, revision: previousRevision, artifact_digest: 'e'.repeat(64), manifest_digest: artifact.manifest.migrationDigest,
    target: 'local', result: 'failed', stage: 'deploy', deployment: 'unknown', deploy_id: null, lock_retained: true, reporting: 'written',
    migration: { result: 'success', database_outcome: 'committed', manifest_digest: artifact.manifest.migrationDigest, source_revision: previousRevision },
  });
  const binding: ReleaseBinding = { run_id: randomUUID(), revision, artifact_digest: artifact.digest,
    manifest_digest: artifact.manifest.migrationDigest, target: 'local', schema_mode: 'current-schema-only' };
  const previous = describeRetainedRun(directory, previousId);
  const approval: SupersessionApproval = { version: 1, decision: 'accept-late-create-alias-risk-and-unresolved-https', previous, next: binding };
  const original = { lock: fs.readFileSync(join(directory, 'operator.lock')), report: fs.readFileSync(join(directory, `${previousId}.json`)) };
  const unchanged = () => {
    assert.deepEqual(describeRetainedRun(directory, previousId), previous);
    assert.deepEqual(fs.readFileSync(join(directory, 'operator.lock')), original.lock);
    assert.deepEqual(fs.readFileSync(join(directory, `${previousId}.json`)), original.report);
  };
  return { directory, binding, approval, unchanged, run: join(directory, 'runs', binding.run_id) };
}
function observeFsync(t: TestContext, visit: (path: string, sync: () => void) => void) {
  const opened = new Map<number, string>();
  const open = fs.openSync, close = fs.closeSync, sync = fs.fsyncSync;
  t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => { const fd = open(...args); opened.set(fd, String(args[0])); return fd; });
  t.mock.method(fs, 'closeSync', (fd: number) => { opened.delete(fd); return close(fd); });
  t.mock.method(fs, 'fsyncSync', (fd: number) => visit(opened.get(fd) ?? '', () => sync(fd)));
}

test('supersession durably claims one successor while preserving the unknown predecessor inode and bytes', t => {
  const fixture = journalFixture(t);
  const journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, fixture.approval));
  const other = { ...fixture.binding, run_id: randomUUID() };
  assert.throws(() => createReleaseJournal(fixture.directory, other, { ...fixture.approval, next: other }));
  journal.beforeCreate();
  assert.throws(() => journal.beforeCreate());
  journal.acknowledge(deployment.id);
  assert.throws(() => journal.acknowledge('dpl_other'));
  assert.equal(journal.finish({ result: 'failed', stage: 'deploy', deployment: 'unknown', deploy_id: deployment.id, retain_lock: true }), true);
  const state = readReleaseJournal(fixture.directory, fixture.binding);
  assert.equal(state.deploy_id, deployment.id);
  assert.equal(state.create_intent, true);
  assert.equal(state.outcome?.retain_lock, true);
  fixture.unchanged();
});

test('supersession refuses stale approval, wrong binding, changed original report and substituted historical lock', async t => {
  for (const mode of ['decision', 'manifest', 'artifact', 'revision', 'run', 'report-hash', 'inode', 'old-known-id', 'old-terminal', 'old-lock-replaced']) {
    await t.test(mode, t => {
      const fixture = journalFixture(t), approval = structuredClone(fixture.approval);
      if (mode === 'decision') (approval as any).decision = 'not-accepted';
      if (mode === 'manifest') approval.next.manifest_digest = '0'.repeat(64);
      if (mode === 'artifact') approval.next.artifact_digest = '0'.repeat(64);
      if (mode === 'revision') approval.next.revision = '0'.repeat(40);
      if (mode === 'run') approval.next.run_id = randomUUID();
      if (mode === 'report-hash') approval.previous.report_sha256 = '0'.repeat(64);
      if (mode === 'inode') approval.previous.lock.ino = '0';
      if (mode.startsWith('old-') && mode !== 'old-lock-replaced') {
        const path = join(fixture.directory, `${approval.previous.run_id}.json`);
        const report = JSON.parse(fs.readFileSync(path, 'utf8'));
        if (mode === 'old-known-id') report.deploy_id = deployment.id;
        else report.deployment = 'ready';
        fs.writeFileSync(path, JSON.stringify(report));
      }
      if (mode === 'old-lock-replaced') {
        const path = join(fixture.directory, 'operator.lock'), bytes = fs.readFileSync(path);
        fs.renameSync(path, join(fixture.directory, 'original-lock-preserved'));
        fs.writeFileSync(path, bytes, { mode: 0o600 });
      }
      assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, approval));
      assert.equal(fs.existsSync(join(fixture.run, 'create-intent.json')), false);
    });
  }
});

test('read-only journal validation rejects altered records, receipts and replacement locks', async t => {
  for (const mode of ['intent.json', 'locked.json', 'create-intent.json', 'acknowledged.json', 'receipt', 'child-lock', 'extra', 'permissions', 'symlink', 'wrong-artifact']) {
    await t.test(mode, t => {
      const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
      journal.beforeCreate(); journal.acknowledge(deployment.id);
      if (mode === 'extra') fs.writeFileSync(join(fixture.run, 'unapproved.json'), '{}', { mode: 0o600 });
      else if (mode === 'permissions') fs.chmodSync(join(fixture.run, 'acknowledged.json'), 0o644);
      else if (mode === 'symlink') {
        const path = join(fixture.run, 'acknowledged.json');
        fs.renameSync(path, join(fixture.directory, 'original-ack'));
        fs.symlinkSync(join(fixture.directory, 'original-ack'), path);
      } else if (mode === 'child-lock') {
        const path = join(fixture.run, 'operator.lock'), bytes = fs.readFileSync(path);
        fs.renameSync(path, join(fixture.directory, 'original-child-lock'));
        fs.writeFileSync(path, bytes, { mode: 0o600 });
      } else if (mode !== 'wrong-artifact') {
        const path = mode === 'receipt' ? join(fixture.directory, 'supersessions', `${fixture.approval.previous.run_id}.json`) : join(fixture.run, mode);
        const value = JSON.parse(fs.readFileSync(path, 'utf8'));
        value.binding.artifact_digest = 'f'.repeat(64);
        fs.writeFileSync(path, JSON.stringify(value));
      }
      const binding = mode === 'wrong-artifact' ? { ...fixture.binding, artifact_digest: 'f'.repeat(64) } : fixture.binding;
      assert.throws(() => readReleaseJournal(fixture.directory, binding));
      assert.throws(() => journal.beforeCreate());
      fixture.unchanged();
    });
  }
});

test('failed file or directory fsync leaves blocking evidence and never permits a create retry', async t => {
  for (const phase of ['intent', 'lock', 'locked', 'receipt', 'receipt-directory', 'create', 'ack']) {
    await t.test(phase, t => {
      const fixture = journalFixture(t);
      const suffix = { intent: '/intent.json', lock: '/operator.lock', locked: '/locked.json',
        receipt: `/supersessions/${fixture.approval.previous.run_id}.json`, 'receipt-directory': '/supersessions',
        create: '/create-intent.json', ack: '/acknowledged.json' }[phase]!;
      let failed = false;
      observeFsync(t, (path, sync) => {
        if (path.endsWith(suffix) && (phase !== 'receipt-directory' || fs.existsSync(join(path, `${fixture.approval.previous.run_id}.json`)))) {
          failed = true; throw Object.assign(new Error('Synthetic storage failure'), { code: 'EIO' });
        }
        sync();
      });
      assert.throws(() => {
        const journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
        journal.beforeCreate(); journal.acknowledge(deployment.id);
      });
      assert.equal(failed, true);
      t.mock.restoreAll();
      assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, fixture.approval));
      fixture.unchanged();
    });
  }
});

test('adapter waits for durable acknowledgement before inspect and refuses a second trigger', async t => {
  const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  let inspected = 0;
  let release!: () => void, entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const current = synthetic({ onRequest(url, init) {
    if (url.pathname === '/v13/deployments' && init?.method === 'POST') {
      assert.equal(readReleaseJournal(fixture.directory, fixture.binding).create_intent, true);
    }
    if (url.pathname === `/v13/deployments/${deployment.id}`) {
      inspected++;
      assert.equal(readReleaseJournal(fixture.directory, fixture.binding).deploy_id, deployment.id);
    }
  } });
  await current.adapter.preflight(signal());
  const pending = current.adapter.trigger(revision, signal(), {
    beforeCreate: () => journal.beforeCreate(),
    async acknowledged(id) { entered(); await blocked; journal.acknowledge(id); },
  });
  await waiting;
  assert.equal(current.creates(), 1); assert.equal(inspected, 0);
  assert.equal(readReleaseJournal(fixture.directory, fixture.binding).deploy_id, null);
  release(); await pending;
  assert.equal(inspected, 1);
  await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
  assert.equal(current.creates(), 1);
  fixture.unchanged();
});

test('acknowledgement fsync failure blocks inspection but retains the acknowledged identity and lock', async t => {
  const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  let inspected = 0;
  const current = synthetic({ onRequest(url) { if (url.pathname === `/v13/deployments/${deployment.id}`) inspected++; } });
  await current.adapter.preflight(signal());
  observeFsync(t, (path, sync) => { if (path.endsWith('/acknowledged.json')) throw new Error('Synthetic fsync failure'); sync(); });
  await assert.rejects(current.adapter.trigger(revision, signal(), { beforeCreate: () => journal.beforeCreate(), acknowledged: id => journal.acknowledge(id) }));
  assert.equal(current.creates(), 1); assert.equal(inspected, 0);
  assert.equal(current.adapter.diagnostics(undefined, signal()).deploy_id, deployment.id);
  assert.equal(fs.existsSync(join(fixture.run, 'operator.lock')), true);
  t.mock.restoreAll();
  await assert.rejects(current.adapter.trigger(revision, signal(), checkpoints));
  assert.equal(current.creates(), 1);
  fixture.unchanged();
});

test('cancellation after a valid create response still records the ID before refusing inspection', async t => {
  const fixture = journalFixture(t), journal = createReleaseJournal(fixture.directory, fixture.binding, fixture.approval);
  const controller = new AbortController();
  let inspected = 0;
  const current = synthetic({ onRequest(url, init) {
    if (url.pathname === '/v13/deployments' && init?.method === 'POST') controller.abort();
    if (url.pathname === `/v13/deployments/${deployment.id}`) inspected++;
  } });
  await current.adapter.preflight(signal());
  await assert.rejects(current.adapter.trigger(revision, controller.signal, {
    beforeCreate: () => journal.beforeCreate(), acknowledged: id => journal.acknowledge(id),
  }));
  assert.equal(current.creates(), 1); assert.equal(inspected, 0);
  assert.equal(readReleaseJournal(fixture.directory, fixture.binding).deploy_id, deployment.id);
  fixture.unchanged();
});

test('process loss at receipt lock create and acknowledgement boundaries never reopens create', async t => {
  for (const phase of ['intent', 'lock', 'locked', 'receipt-partial', 'receipt', 'create', 'remote-accepted', 'ack-partial', 'ack']) {
    await t.test(phase, t => {
      const fixture = journalFixture(t);
      const source = `
import fs from 'node:fs';
import {createReleaseJournal, writeReleaseEvidence} from ${JSON.stringify(new URL('../scripts/release-journal.js', import.meta.url).href)};
const directory=${JSON.stringify(fixture.directory)}, binding=${JSON.stringify(fixture.binding)}, approval=${JSON.stringify(fixture.approval)}, phase=${JSON.stringify(phase)};
const opened=new Map(), open=fs.openSync, close=fs.closeSync, sync=fs.fsyncSync, write=fs.writeFileSync;
fs.openSync=(path,flags,mode)=>{const fd=open(path,flags,mode);opened.set(fd,String(path));return fd;};
fs.closeSync=fd=>{opened.delete(fd);return close(fd);};
const suffix={intent:'/intent.json',lock:'/operator.lock',locked:'/locked.json',receipt:'/supersessions/'+approval.previous.run_id+'.json',create:'/create-intent.json',ack:'/acknowledged.json'}[phase];
fs.fsyncSync=fd=>{sync(fd);if(suffix && opened.get(fd)?.endsWith(suffix)) process.exit(73);};
fs.writeFileSync=(fd,value,...args)=>{
  const path=opened.get(fd)??'';
  if((phase==='receipt-partial'&&path.endsWith('/supersessions/'+approval.previous.run_id+'.json'))||(phase==='ack-partial'&&path.endsWith('/acknowledged.json'))){write(fd,'{');process.exit(73);}
  return write(fd,value,...args);
};
const journal=createReleaseJournal(directory,binding,approval);
journal.beforeCreate();
writeReleaseEvidence(directory+'/remote-create.json',{count:1});
if(phase==='remote-accepted')process.exit(73);
journal.acknowledge('dpl_synthetic');
process.exit(74);
`;
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8', timeout: 10000,
        env: { PATH: process.env.PATH, HOME: fixture.directory } });
      assert.equal(child.status, 73, child.stderr);
      assert.throws(() => createReleaseJournal(fixture.directory, fixture.binding, fixture.approval));
      if (['receipt', 'create', 'remote-accepted', 'ack'].includes(phase)) {
        const state = readReleaseJournal(fixture.directory, fixture.binding);
        assert.equal(state.create_intent, phase !== 'receipt');
        assert.equal(state.deploy_id, phase === 'ack' ? deployment.id : null);
      } else assert.throws(() => readReleaseJournal(fixture.directory, fixture.binding));
      const accepted = ['remote-accepted', 'ack-partial', 'ack'].includes(phase);
      assert.equal(fs.existsSync(join(fixture.directory, 'remote-create.json')), accepted);
      if (accepted) assert.equal(JSON.parse(fs.readFileSync(join(fixture.directory, 'remote-create.json'), 'utf8')).count, 1);
      fixture.unchanged();
    });
  }
});

function etsyPacket(root: string): EtsyReleasePacket {
  return { version: 1, runId: randomUUID(), ledgerRoot: root, revision: 'a'.repeat(40), tree: 'b'.repeat(40),
    sourceDigest: 'c'.repeat(64), artifactDigest: 'd'.repeat(64), runtimeDigest: 'e'.repeat(64), configBundleDigest: 'f'.repeat(64),
    migrationInputDigest: '1'.repeat(64), previousDigest: manifestDigest(migrationManifest.slice(0, 3)), targetDigest: manifestDigest(migrationManifest),
    target: 'local', driverDigest: '2'.repeat(64), nodeDigest: '3'.repeat(64), cliDigest: '4'.repeat(64), cliOwnFilesDigest: '5'.repeat(64),
    browserOrigin: 'https://app.lovora.us', runtimeKeys: [...activationRuntimeKeys, 'APP_ACTIVATION_CONFIG_DIGEST'].sort(), metadataDigest: '6'.repeat(64),
    predecessor: { id: 'dpl_old', revision: '7'.repeat(40), tree: '8'.repeat(40), sourceDigest: '9'.repeat(64), artifactDigest: 'a'.repeat(64), configDigest: 'b'.repeat(64) },
    window: { start: Date.now() - 1000, end: Date.now() + 600000 },
    grants: { exclusiveOwnerLease: 'synthetic-exclusive-lease', automatedDelivery: 'disabled', maintenance: 'approved-readiness-interruption',
      recovery: 'approved-roll-forward-only', phases: [...etsyReleasePhases] } };
}
function etsyReleaseFixture(t: TestContext) {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'esty-setup-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packet = etsyPacket(root), packetDigest = sha256(canonical(packet)), calls: string[] = [];
  let names = migrationManifest.slice(0, 3).map(entry => entry.name), alias = packet.predecessor.id;
  const operations: EtsyReleaseOperations = {
    verify() {},
    async currentMain() { calls.push('main'); return { revision: packet.revision, tree: packet.tree }; },
    async history() { return [...names]; },
    async predecessor(pending) {
      calls.push(`old:${pending}`);
      assert.equal(alias, packet.predecessor.id);
      assert.equal(names.length, pending ? 4 : 3);
    },
    async create() {
      assert.ok(fs.existsSync(join(root, packet.runId, 'held-create.intent.json')));
      calls.push('CREATE'); return { code: 0, aborted: false, stdout: '{"deployment":{"id":"dpl_new"}}' };
    },
    async candidate(id, pending, final) {
      assert.equal(id, 'dpl_new'); assert.equal(names.length, pending ? 3 : 4);
      const ack = readEvidence(join(root, packet.runId, 'create-ack.json')).value;
      assert.deepEqual(ack, { packetDigest, deploymentId: id });
      calls.push(`candidate:${pending}:${final}`);
    },
    async migrate() {
      calls.push('SQL');
      const before = [...names]; names = migrationManifest.map(entry => entry.name);
      return { run_id: randomUUID(), source_revision: packet.revision, target: packet.target, manifest_digest: packet.targetDigest,
        started_at: new Date().toISOString(), ended_at: new Date().toISOString(), duration_ms: 1, result: 'success', stage: 'verification',
        failed_version: null, database_outcome: 'committed', before, after: [...names],
        attempted: [{ ...migrationManifest[3]!, outcome: 'applied_committed' }], reporting: 'not_requested' };
    },
    async promote(id) { assert.equal(id, 'dpl_new'); calls.push('PROMOTE'); alias = id; return { code: 0, aborted: false, stdout: '' }; },
    async alias(id) { assert.equal(id, alias); calls.push(`alias:${id}`); },
  };
  const run = (phase: EtsyReleasePhase, controllerSignal = signal()) => runEtsyReleasePhase({ packet, packetDigest, phase, operations, signal: controllerSignal });
  return { root, packet, packetDigest, calls, operations, run };
}
test('L3 strict phases stop before follow-on effects when durable intent ACK or receipt is unknown', async t => {
  for (const fault of ['intent', 'create-ack', 'receipt', 'sql-intent', 'sql-receipt', 'cancel']) await t.test(fault, async t => {
    const f = etsyReleaseFixture(t), controller = new AbortController();
    const events: string[] = [];
    const durability = {
      directory: f.root,
      async intent(phase: EtsyReleasePhase) {
        events.push(`intent:${phase}`);
        if ((fault === 'intent' && phase === 'held-create') || (fault === 'sql-intent' && phase === 'sql-apply')) throw new Error('Synthetic remote ACK unavailable.');
        if (fault === 'cancel' && phase === 'held-create') controller.abort();
      },
      async acknowledged(id: string) {
        assert.equal(id, 'dpl_new');
        assert.deepEqual(readEvidence(join(f.root, f.packet.runId, 'create-ack.json')).value,
          { packetDigest: f.packetDigest, deploymentId: id });
        events.push('ack');
        if (fault === 'create-ack') throw new Error('Synthetic CREATE ACK persistence unavailable.');
      },
      async confirmed(phase: EtsyReleasePhase) {
        events.push(`receipt:${phase}`);
        assert.equal((readEvidence(join(f.root, f.packet.runId, `${phase}.receipt.json`)).value as Record<string, unknown>).phase, phase);
        if ((fault === 'receipt' && phase === 'held-create') || (fault === 'sql-receipt' && phase === 'sql-apply')) {
          throw new Error('Synthetic receipt ACK unavailable.');
        }
      },
    };
    const run = (phase: EtsyReleasePhase) => Reflect.apply(runEtsyReleasePhase, undefined, [{
      packet: f.packet, packetDigest: f.packetDigest, phase, operations: f.operations, signal: controller.signal, durability,
    }]) as Promise<void>;
    await run('history');
    const stopPhase = fault.startsWith('sql-') ? 'sql-apply' : 'held-create';
    if (stopPhase === 'sql-apply') { await run('held-create'); await run('pre-sql-check'); }
    await assert.rejects(run(stopPhase));
    assert.equal(f.calls.filter(call => call === 'CREATE').length, ['intent', 'cancel'].includes(fault) ? 0 : 1);
    assert.equal(f.calls.filter(call => call === 'SQL').length, fault === 'sql-receipt' ? 1 : 0);
    assert.equal(f.calls.includes('PROMOTE'), false);
    assert.equal(events.includes('intent:history'), true);
    await assert.rejects(run(stopPhase));
    assert.equal(f.calls.filter(call => call === 'CREATE').length, ['intent', 'cancel'].includes(fault) ? 0 : 1);
    assert.equal(f.calls.filter(call => call === 'SQL').length, fault === 'sql-receipt' ? 1 : 0);
  });
});

test('Etsy setup release persists same-ID one-create ordered phase receipts through final ACK', async t => {
  const fixture = etsyReleaseFixture(t);
  for (const phase of etsyReleasePhases) await fixture.run(phase);
  assert.deepEqual(fixture.calls.filter(call => ['CREATE', 'SQL', 'PROMOTE'].includes(call)), ['CREATE', 'SQL', 'PROMOTE']);
  assert.ok(fixture.calls.includes('old:true'));
  assert.ok(fixture.calls.includes('candidate:true:false'));
  assert.ok(fixture.calls.includes('candidate:false:true'));
  const final = readEvidence(join(fixture.root, fixture.packet.runId, 'final-domain-ack.receipt.json')).value;
  assert.ok(final && typeof final === 'object' && 'deploymentId' in final && final.deploymentId === 'dpl_new');
  assert.equal(fs.existsSync(join(fixture.root, 'active.lock')), false);
  assert.ok(fs.existsSync(join(fixture.root, 'operator.lock')));
});
test('Etsy setup release refuses stale packets grants history configuration and phase evidence before later mutation', async t => {
  for (const fault of ['main', 'tree', 'unknown-history', 'extra-migration', 'missing-receipt', 'missing-intent', 'missing-ack',
    'changed-main-before-sql', 'changed-report', 'alias-drift', 'candidate-failure', 'expired-window', 'missing-grant', 'changed-packet', 'sql-unknown', 'promote-unknown', 'missing-final-ack']) {
    await t.test(fault, async t => {
      const f = etsyReleaseFixture(t);
      if (fault === 'expired-window' || fault === 'missing-grant' || fault === 'changed-packet') {
        const value = structuredClone(f.packet);
        if (fault === 'expired-window') value.window.end = Date.now() - 1;
        if (fault === 'missing-grant') value.grants.phases = [];
        if (fault === 'changed-packet') value.runtimeDigest = '0'.repeat(64);
        assert.throws(() => validateEtsyReleasePacket(value, fault === 'changed-packet' ? f.packetDigest : sha256(canonical(value))));
        assert.equal(f.calls.length, 0); return;
      }
      if (fault === 'main' || fault === 'tree') {
        f.operations.currentMain = async () => ({ revision: fault === 'main' ? '0'.repeat(40) : f.packet.revision,
          tree: fault === 'tree' ? '0'.repeat(40) : f.packet.tree });
        await assert.rejects(f.run('history')); assert.equal(f.calls.includes('CREATE'), false); return;
      }
      if (fault === 'unknown-history') {
        f.operations.history = async () => ['unknown'];
        await assert.rejects(f.run('history')); assert.equal(f.calls.includes('CREATE'), false); return;
      }
      await f.run('history'); await f.run('held-create');
      const runRoot = join(f.root, f.packet.runId);
      if (fault === 'missing-receipt' || fault === 'missing-intent' || fault === 'missing-ack') {
        fs.unlinkSync(join(runRoot, fault === 'missing-receipt' ? 'held-create.receipt.json'
          : fault === 'missing-intent' ? 'held-create.intent.json' : 'create-ack.json'));
      }
      if (fault === 'alias-drift') f.operations.alias = async () => { throw new Error('synthetic drift'); };
      if (fault === 'candidate-failure') f.operations.candidate = async () => { throw new Error('synthetic configuration/health refusal'); };
      if (['missing-receipt', 'missing-intent', 'missing-ack', 'alias-drift', 'candidate-failure'].includes(fault)) {
        await assert.rejects(f.run('pre-sql-check')); assert.equal(f.calls.includes('SQL'), false);
      } else {
        await f.run('pre-sql-check');
        const migrate = f.operations.migrate;
        if (fault === 'extra-migration') f.operations.history = async () => [...migrationManifest.map(entry => entry.name), 'extra'];
        if (fault === 'sql-unknown') f.operations.migrate = async () => { await migrate(); throw new Error('lost SQL acknowledgement'); };
        if (fault === 'changed-main-before-sql') f.operations.currentMain = async () => ({ revision: '0'.repeat(40), tree: f.packet.tree });
        if (['extra-migration', 'sql-unknown', 'changed-main-before-sql'].includes(fault)) {
          await assert.rejects(f.run('sql-apply')); assert.equal(f.calls.includes('PROMOTE'), false);
        } else {
          await f.run('sql-apply');
          if (fault === 'changed-report') {
            const reportPath = join(runRoot, 'migration-report.json');
            const report = readEvidence(reportPath).value as MigrationReport;
            fs.writeFileSync(reportPath, JSON.stringify({ ...report, run_id: randomUUID() }));
            await assert.rejects(f.run('post-sql-check')); assert.equal(f.calls.includes('PROMOTE'), false);
          } else {
            await f.run('post-sql-check');
            if (fault === 'promote-unknown') {
              f.operations.promote = async () => { f.calls.push('PROMOTE'); return { code: 1, aborted: true, stdout: '' }; };
              await assert.rejects(f.run('promote-only'));
              await assert.rejects(f.run('promote-only'));
              assert.equal(f.calls.filter(call => call === 'PROMOTE').length, 1);
            } else {
              await f.run('promote-only');
              assert.equal(fs.existsSync(join(runRoot, 'final-domain-ack.receipt.json')), false);
              f.operations.candidate = async () => { throw new Error('final acceptance unavailable'); };
              await assert.rejects(f.run('final-domain-ack'));
              assert.equal(fs.existsSync(join(runRoot, 'final-domain-ack.receipt.json')), false);
            }
          }
        }
      }
      assert.ok(fs.existsSync(join(f.root, 'active.lock')));
      await assert.rejects(f.run('held-create'));
      assert.equal(f.calls.filter(call => call === 'CREATE').length, 1);
    });
  }
});
test('Etsy setup release concurrent and aborted CREATE retain acknowledged ID before any follow-up', async t => {
  for (const fault of ['concurrent', 'aborted-id', 'missing-id']) await t.test(fault, async t => {
    const f = etsyReleaseFixture(t); await f.run('history');
    const arrived = Promise.withResolvers<void>(), continueCreate = Promise.withResolvers<void>();
    const controller = new AbortController();
    f.operations.create = async () => {
      f.calls.push('CREATE'); arrived.resolve(); await continueCreate.promise;
      return { code: fault === 'concurrent' ? 0 : 1, aborted: fault !== 'concurrent',
        stdout: fault === 'missing-id' ? '{}' : '{"deployment":{"id":"dpl_new"}}' };
    };
    const pending = f.run('held-create', controller.signal);
    await arrived.promise;
    if (fault === 'concurrent') await assert.rejects(f.run('held-create'));
    else controller.abort();
    continueCreate.resolve();
    if (fault === 'concurrent') await pending; else await assert.rejects(pending);
    const path = join(f.root, f.packet.runId, 'create-ack.json');
    assert.equal(fs.existsSync(path), fault !== 'missing-id');
    if (fault !== 'missing-id') assert.deepEqual(readEvidence(path).value, { packetDigest: f.packetDigest, deploymentId: 'dpl_new' });
    assert.equal(f.calls.filter(call => call === 'CREATE').length, 1);
    assert.equal(f.calls.some(call => call.startsWith('candidate:')), false);
  });
});
test('Etsy setup release new processes cannot repeat CREATE or promote with consumed intent', async t => {
  for (const phase of ['held-create', 'promote-only'] as const) await t.test(phase, async t => {
    const f = etsyReleaseFixture(t);
    for (const next of etsyReleasePhases) { await f.run(next); if (next === phase) break; }
    const program = `import {runEtsyReleasePhase} from ${JSON.stringify(new URL('../scripts/etsy-release.js', import.meta.url).href)};
const unexpected=async()=>{console.log('MUTATION_CALLED');throw Error()};
try{await runEtsyReleasePhase({packet:${JSON.stringify(f.packet)},packetDigest:${JSON.stringify(f.packetDigest)},phase:${JSON.stringify(phase)},
signal:AbortSignal.timeout(3000),operations:{verify(){},currentMain:unexpected,history:unexpected,predecessor:unexpected,create:unexpected,candidate:unexpected,migrate:unexpected,promote:unexpected,alias:unexpected}});process.exitCode=2}catch{process.exitCode=1}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], { env: {}, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /MUTATION_CALLED| at /);
  });
});
test('Etsy setup provider checks exact pending503 reason config archive and alias rather than accepting arbitrary unready', async t => {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'esty-setup-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packet = etsyPacket(root);
  packet.revision = artifact.manifest.source.revision; packet.tree = artifact.manifest.source.tree;
  packet.sourceDigest = artifact.manifest.source.digest; packet.artifactDigest = artifact.digest;
  const archivePath = join(root, 'project.tgz');
  execFileSync('/usr/bin/tar', ['--format=ustar', '-czf', archivePath, '-C', artifact.root, '.vercel/output'],
    { env: { PATH: '/usr/bin:/bin', COPYFILE_DISABLE: '1' }, timeout: 10000 });
  const archive = fs.readFileSync(archivePath), uid = createHash('sha1').update(archive).digest('hex');
  const envs = packet.runtimeKeys.map(key => ({ id: `env_${key}`, key, type: 'sensitive', target: ['production'] }));
  packet.metadataDigest = currentAppMetadata({ envs }, Object.fromEntries(packet.runtimeKeys.map(key => [key, '']))).metadataDigest;
  const packetDigest = sha256(canonical(packet));
  let fault = '', sqlDone = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers);
    if (url.origin === 'https://api.github.com') return Response.json({ sha: packet.predecessor.revision, commit: { tree: { sha: packet.predecessor.tree } } });
    if (url.origin === 'https://api.vercel.com') {
      if (url.pathname.endsWith('/domains/api.lovora.us')) return Response.json(domain);
      if (url.pathname === '/v4/aliases/api.lovora.us') return Response.json({ ...alias, deploymentId: fault === 'alias' ? 'dpl_other' : 'dpl_old', deployment: { id: fault === 'alias' ? 'dpl_other' : 'dpl_old' } });
      if (url.pathname === `/v9/projects/${artifactTarget.project}`) return Response.json({ ...project, link: { ...project.link, org: 'khuonghuyhieu', repo: 'esty-admin' } });
      if (url.pathname.includes('/env')) return Response.json({ envs: fault === 'metadata' ? envs.slice(1) : envs });
      if (url.pathname === '/v13/deployments/dpl_old') return Response.json({ ...deployment, id: 'dpl_old', regions: ['icn1'],
        meta: { sourceCommit: packet.predecessor.revision, artifactSha256: packet.predecessor.artifactDigest, sourceDigest: packet.predecessor.sourceDigest } });
      if (url.pathname === '/v13/deployments/dpl_new') return Response.json({ ...deployment, id: 'dpl_new', regions: ['icn1'], url: 'synthetic.vercel.app',
        meta: { sourceCommit: packet.revision, artifactSha256: packet.artifactDigest, sourceDigest: packet.sourceDigest,
          etsySetupRun: packet.runId, etsySetupPacket: packetDigest, etsyRuntimeDigest: packet.runtimeDigest } });
      if (url.pathname === '/v6/deployments/dpl_new/files') return Response.json([
        { name: 'src', type: 'directory', mode: 0o40555, children: [{ name: 'project.tgz', type: 'file', uid }] },
        { name: 'out', type: 'directory', mode: 0o40555, children: [{ name: 'index', type: 'lambda', mode: 0o140666 }] },
      ]);
      if (url.pathname.startsWith('/v8/')) return Response.json({ data: (fault === 'archive' ? Buffer.from('changed') : archive).toString('base64') });
      throw new Error('Unapproved synthetic provider route');
    }
    assert.ok(['https://synthetic.vercel.app', 'https://api.lovora.us'].includes(url.origin));
    const old = url.origin === 'https://api.lovora.us', digest = old ? packet.predecessor.configDigest : packet.runtimeDigest;
    if (init?.method === 'OPTIONS') return headers.get('origin') === packet.browserOrigin
      ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': packet.browserOrigin } }) : new Response(null, { status: 401 });
    if (headers.get('authorization') !== `Bearer ${'c'.repeat(64)}`) return Response.json({ status: 'unauthorized' }, { status: 401 });
    if (url.pathname === '/__release_unknown_route') return new Response(null, { status: 404 });
    const responseHeaders = { 'x-activation-config-digest': fault === 'config' ? '0'.repeat(64) : digest };
    if (url.pathname === '/health/live') return Response.json({ status: 'ok' }, { headers: responseHeaders });
    const pending = old ? sqlDone : !sqlDone;
    return pending && fault !== 'unexpected-ready'
      ? Response.json({ status: 'degraded', reason: fault === 'reason' ? 'database_timeout' : 'migrations_pending' }, { status: 503, headers: responseHeaders })
      : Response.json({ status: 'ready', database: 'up', migrations: 'current' }, { headers: responseHeaders });
  };
  const operations = etsyProviderOperations(packet, packetDigest, artifact,
    { token: 'synthetic-provider-token', bearer: 'c'.repeat(64), predecessorBearer: 'c'.repeat(64), bypass: 'synthetic-bypass-key' }, signal(), transport);
  await operations.predecessor(false); await operations.candidate('dpl_new', true, false);
  for (fault of ['unexpected-ready', 'reason', 'config', 'archive']) await assert.rejects(operations.candidate('dpl_new', true, false), Error, fault);
  for (fault of ['alias', 'metadata']) await assert.rejects(operations.predecessor(false), Error, fault);
  fault = ''; sqlDone = true;
  await operations.predecessor(true); await operations.candidate('dpl_new', false, false);
});

test('Etsy setup release fsync failures retain a terminal lock even when receipt bytes exist', async t => {
  for (const boundary of ['intent', 'ack', 'receipt']) await t.test(boundary, async t => {
    const f = etsyReleaseFixture(t); await f.run('history');
    let failNextSync = false, failed = false;
    const write = fs.writeFileSync, sync = fs.fsyncSync;
    t.mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
      const data = args[1];
      if (typeof data === 'string' && data.startsWith('{')) {
        const value: unknown = JSON.parse(data);
        if (value && typeof value === 'object' && !failed) {
          failNextSync = boundary === 'ack'
            ? 'deploymentId' in value && !('phase' in value)
            : 'phase' in value && value.phase === 'held-create' && 'previous' in value
              && (boundary === 'receipt' ? 'completed' in value : !('completed' in value));
        }
      }
      return write(...args);
    });
    t.mock.method(fs, 'fsyncSync', (fd: number) => {
      if (failNextSync && !failed) { failed = true; failNextSync = false; throw new Error('synthetic fsync failure'); }
      return sync(fd);
    });
    await assert.rejects(f.run('held-create'));
    assert.equal(failed, true);
    assert.equal(f.calls.filter(call => call === 'CREATE').length, boundary === 'intent' ? 0 : 1);
    await assert.rejects(f.run('pre-sql-check'));
    assert.equal(f.calls.includes('SQL'), false);
    assert.equal(f.calls.some(call => call.startsWith('candidate:')), false);
    assert.ok(fs.existsSync(join(f.root, 'active.lock')));
  });
});
