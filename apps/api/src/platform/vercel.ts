import { attachDatabasePool } from '@vercel/functions';
import type { Pool } from 'pg';
import type { ApiConfig } from '../config/config.js';

export function attachPlatformLifecycle(runtime: ApiConfig['runtime'], pool: Pool): void {
  if (runtime === 'vercel') attachDatabasePool(pool);
}
