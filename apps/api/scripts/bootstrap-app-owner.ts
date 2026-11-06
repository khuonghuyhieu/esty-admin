import { Client, Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { parseAppOperatorConfig } from '../src/config/config.js';
import { AppDatabase } from '../src/app-foundation/adapters/postgres.js';
import { AuthAdmin } from '../src/app-foundation/adapters/auth-admin.js';
import { AppService, bootstrapIdentity, bootstrapAuditMatches } from '../src/app-foundation/application/service.js';
import { AppError } from '../src/app-foundation/application/errors.js';

export async function runAppOperator(action: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (!['bootstrap', 'reconcile-invitation'].includes(action)) throw new AppError('invalid_request');
  const config = parseAppOperatorConfig(env);
  if (action === 'reconcile-invitation' && env.APP_OPERATOR_CONFIRM_PROVIDER_EVIDENCE !== config.approvalId) {
    throw new AppError('forbidden');
  }
  const pool = new Pool({ ...config.database, max: 1, min: 0, idleTimeoutMillis: 1000 });
  pool.on('error', () => {});
  const database = new AppDatabase(pool, 'app_operator');
  const service = new AppService(config.appFoundation, database, new AuthAdmin(config.appFoundation, config.key));
  const signal = AbortSignal.timeout(8000);
  try {
    if (action === 'bootstrap') {
      await service.bootstrap({ userId: env.APP_OPERATOR_USER_ID ?? '', profileName: env.APP_OPERATOR_PROFILE_NAME ?? '',
        workspaceName: env.APP_OPERATOR_WORKSPACE_NAME ?? '', approvalId: config.approvalId }, signal);
    } else {
      const outcome = env.APP_OPERATOR_DELIVERY_OUTCOME;
      if (outcome !== 'confirmed' && outcome !== 'failed') throw new AppError('invalid_request');
      await service.reconcileInvitation({ userId: env.APP_OPERATOR_USER_ID ?? '', invitationId: env.APP_OPERATOR_INVITATION_ID ?? '',
        outcome, approvalId: config.approvalId }, signal);
    }
  } finally { database.onModuleDestroy(); await pool.end(); }
}

export async function inspectAppBootstrap(env: NodeJS.ProcessEnv): Promise<'absent' | 'committed' | 'conflict'> {
  const config = parseAppOperatorConfig(env);
  const expected = bootstrapIdentity(config.appFoundation.workspaceId, {
    userId: env.APP_OPERATOR_USER_ID ?? '', profileName: env.APP_OPERATOR_PROFILE_NAME ?? '',
    workspaceName: env.APP_OPERATOR_WORKSPACE_NAME ?? '', approvalId: config.approvalId,
  });
  const client = new Client(config.database), signal = AbortSignal.timeout(8000);
  client.on('error', () => {});
  const abort = () => { void client.end().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await client.connect(); signal.throwIfAborted();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const workspace = await client.query('SELECT id,bootstrap_request_id,bootstrap_fingerprint FROM app_private.workspaces LIMIT 2');
    const member = await client.query(`SELECT m.role_code,m.status FROM app_private.memberships m
      JOIN app_private.profiles p ON p.user_id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2`,
    [expected.workspaceId, expected.userId]);
    const audit = await client.query('SELECT * FROM app_private.audit_events WHERE workspace_id=$1 AND action=$2 LIMIT 2',
      [expected.workspaceId, 'workspace.bootstrap']);
    const profile = await client.query('SELECT 1 FROM app_private.profiles WHERE user_id=$1', [expected.userId]);
    let result: 'absent' | 'committed' | 'conflict' = 'conflict';
    if (!workspace.rowCount && !member.rowCount && !audit.rowCount && !profile.rowCount) result = 'absent';
    else if (workspace.rowCount === 1 && workspace.rows[0]?.id === expected.workspaceId
      && workspace.rows[0].bootstrap_request_id === expected.approvalId && workspace.rows[0].bootstrap_fingerprint === expected.fingerprint
      && member.rowCount === 1 && member.rows[0]?.role_code === 'owner' && member.rows[0]?.status === 'active'
      && audit.rowCount === 1 && bootstrapAuditMatches(audit.rows[0], expected)) result = 'committed';
    await client.query('COMMIT'); signal.throwIfAborted();
    return result;
  } catch { throw new AppError('dependency_unavailable'); }
  finally { signal.removeEventListener('abort', abort); await client.end().catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // Explicit process inputs only: never read local .env, converted owner files,
    // CLI auth stores or a private configuration discovery path.
    const action = process.argv[2] ?? '';
    if (action === 'inspect-bootstrap') {
      const outcome = await inspectAppBootstrap(process.env);
      console.info(JSON.stringify({ status: 'complete', action, outcome }));
    } else {
      await runAppOperator(action, process.env);
      console.info(JSON.stringify({ status: 'complete', action }));
    }
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', code: error instanceof AppError ? error.code : 'operator_failed' }));
    process.exitCode = 1;
  }
}
