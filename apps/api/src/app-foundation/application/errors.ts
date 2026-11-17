export type AppErrorCode = 'invalid_request' | 'unauthenticated' | 'forbidden' | 'not_found'
  | 'revision_conflict' | 'last_owner' | 'invitation_conflict' | 'delivery_unavailable'
  | 'dependency_unavailable' | 'bootstrap_conflict' | 'configuration_unavailable'
  | 'upstream_unavailable' | 'upstream_rate_limited' | 'reconnect_required'
  | 'outcome_unknown' | 'connection_changed' | 'connection_busy';

const statuses: Record<AppErrorCode, number> = {
  invalid_request: 400, unauthenticated: 401, forbidden: 403, not_found: 404,
  revision_conflict: 409, last_owner: 409, invitation_conflict: 409,
  delivery_unavailable: 503, dependency_unavailable: 503, bootstrap_conflict: 409,
  configuration_unavailable: 503, upstream_unavailable: 503, upstream_rate_limited: 429,
  reconnect_required: 409, outcome_unknown: 503, connection_changed: 409, connection_busy: 409,
};

export class AppError extends Error {
  readonly status: number;
  constructor(readonly code: AppErrorCode) {
    super(code);
    this.name = 'AppError';
    this.status = statuses[code];
  }
}
