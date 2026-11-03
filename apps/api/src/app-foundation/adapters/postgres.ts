import type { Pool, PoolClient } from 'pg';
import type { OnModuleDestroy } from '@nestjs/common';
import { AppError } from '../application/errors.js';

export class AppDatabase implements OnModuleDestroy {
  private readonly active = new Set<AbortController>();
  private closing = false;

  constructor(private readonly pool: Pool, private readonly role: 'app_runtime' | 'app_operator' = 'app_runtime') {}

  transaction<T>(signal: AbortSignal, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const maximum = this.pool.options.max ?? 2;
    if (this.closing || signal.aborted || this.active.size >= maximum
      || this.pool.totalCount - this.pool.idleCount >= maximum) {
      return Promise.reject(new AppError('dependency_unavailable'));
    }
    const operation = new AbortController();
    this.active.add(operation);
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    let client: PoolClient | undefined;
    let finished = false;
    const finish = (result: { value: T } | { error: AppError }) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      signal.removeEventListener('abort', abort);
      operation.signal.removeEventListener('abort', abort);
      this.active.delete(operation);
      // Destroy on failure: the server rolls back an open transaction, including
      // when cancellation interrupts SQL/COMMIT. Never return a dirty client.
      client?.release('error' in result);
      client = undefined;
      if ('error' in result) reject(result.error); else resolve(result.value);
    };
    const abort = () => finish({ error: new AppError('dependency_unavailable') });
    const deadline = setTimeout(abort, 2500);
    signal.addEventListener('abort', abort, { once: true });
    operation.signal.addEventListener('abort', abort, { once: true });
    void (async () => {
      try {
        const acquired = await this.pool.connect();
        if (finished) { acquired.release(true); return; }
        client = acquired;
        await acquired.query("BEGIN; SET LOCAL lock_timeout = '500ms'; SET LOCAL statement_timeout = '1000ms'");
        if (finished) return;
        const identity = await acquired.query<{ permitted: boolean }>(
          'SELECT current_user = $1 AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AS permitted FROM pg_roles WHERE rolname = current_user',
          [this.role],
        );
        if (finished) return;
        if (identity.rows[0]?.permitted !== true) throw new AppError('dependency_unavailable');
        const result = await work(acquired);
        if (finished) return;
        await acquired.query('COMMIT');
        finish({ value: result });
      } catch (error) {
        if (error instanceof AppError) { finish({ error }); return; }
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        const ownerViolation = code === '23514' && error instanceof Error && error.message === 'last_owner';
        finish({ error: new AppError(ownerViolation ? 'last_owner' : 'dependency_unavailable') });
      }
    })();
    return promise;
  }

  onModuleDestroy(): void {
    this.closing = true;
    for (const operation of this.active) operation.abort();
    // The existing PostgresProbe alone owns pool shutdown/platform attachment.
  }
}
