import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { parseAppOperatorConfig } from '../src/config/config.js';
import { AppDatabase } from '../src/app-foundation/adapters/postgres.js';
import { AuthAdmin } from '../src/app-foundation/adapters/auth-admin.js';
import { AppService } from '../src/app-foundation/application/service.js';
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // Explicit process inputs only: never read local .env, converted owner files,
    // CLI auth stores or a private configuration discovery path.
    await runAppOperator(process.argv[2] ?? '', process.env);
    console.info(JSON.stringify({ status: 'complete', action: process.argv[2] }));
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', code: error instanceof AppError ? error.code : 'operator_failed' }));
    process.exitCode = 1;
  }
}
