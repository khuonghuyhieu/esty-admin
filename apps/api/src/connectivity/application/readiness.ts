export type DatabaseState = 'current' | 'migrations_pending' | 'database_unavailable' | 'database_timeout';

export interface DatabaseProbe {
  check(signal?: AbortSignal): Promise<DatabaseState>;
}

export class ReadinessService {
  constructor(private readonly database: DatabaseProbe) {}

  check(signal?: AbortSignal): Promise<DatabaseState> {
    return this.database.check(signal);
  }
}
