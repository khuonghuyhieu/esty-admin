import { Pool } from 'pg';
import type { ClientConfig, PoolClient } from 'pg';
import type { OnModuleDestroy } from '@nestjs/common';
import type { DatabaseProbe, DatabaseState } from '../application/readiness.js';
import { expectedMigrations } from '../../generated/migrations.js';

export class PostgresProbe implements DatabaseProbe, OnModuleDestroy {
  readonly pool: Pool;
  private readonly active = new Set<AbortController>();
  private closing = false;

  constructor(config: ClientConfig, private readonly requiredMigrations = expectedMigrations,
    private readonly maxConnections: 2 | 4 = 4) {
    this.pool = new Pool({ ...config, max: maxConnections, min: 0, idleTimeoutMillis: 1000 });
    // pg removes failed idle clients. Never emit driver errors containing secrets.
    this.pool.on('error', () => {});
  }

  check(signal?: AbortSignal): Promise<DatabaseState> {
    if (this.closing || signal?.aborted) return Promise.resolve('database_unavailable');
    // Do not enqueue probes behind a saturated dependency. pg's pending queue can
    // start replacement connections while expired waiters are being removed.
    if (this.active.size >= this.maxConnections
      || this.pool.totalCount - this.pool.idleCount >= this.maxConnections) {
      return Promise.resolve('database_unavailable');
    }
    const operation = new AbortController();
    this.active.add(operation);
    const { promise, resolve } = Promise.withResolvers<DatabaseState>();
    let client: PoolClient | undefined;
    let finished = false;
    const finish = (state: DatabaseState, destroy = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      operation.signal.removeEventListener('abort', abort);
      this.active.delete(operation);
      client?.release(destroy);
      client = undefined;
      resolve(state);
    };
    const abort = () => finish('database_unavailable', true);
    const deadline = setTimeout(() => finish('database_timeout', true), 3000);
    signal?.addEventListener('abort', abort, { once: true });
    operation.signal.addEventListener('abort', abort, { once: true });
    void (async () => {
      try {
        const acquired = await this.pool.connect();
        // Acquisition may complete after HTTP cancellation; never leak the late client.
        if (finished) { acquired.release(true); return; }
        client = acquired;
        const schema = await client.query<{ schema: string | null; history: string | null }>(
          "SELECT to_regnamespace('foundation')::text AS schema, to_regclass('public.foundation_migrations')::text AS history",
        );
        if (finished) return;
        if (!schema.rows[0]?.schema || !schema.rows[0].history) {
          finish('migrations_pending');
          return;
        }
        const history = await client.query<{ name: string }>(
          'SELECT name FROM public.foundation_migrations ORDER BY id',
        );
        const current = history.rows.length === this.requiredMigrations.length
          && history.rows.every((row, index) => row.name === this.requiredMigrations[index]);
        if (!finished) finish(current ? 'current' : 'migrations_pending');
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        const message = error instanceof Error ? error.message : '';
        const timedOut = code === '57014' || /timeout|timed out/i.test(message);
        finish(timedOut ? 'database_timeout' : 'database_unavailable', true);
      }
    })();
    return promise;
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    for (const operation of this.active) operation.abort();
    await this.pool.end();
  }
}
