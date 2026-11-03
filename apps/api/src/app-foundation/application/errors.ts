export type AppErrorCode = 'invalid_request' | 'unauthenticated' | 'forbidden' | 'not_found'
  | 'revision_conflict' | 'last_owner' | 'invitation_conflict' | 'delivery_unavailable'
  | 'dependency_unavailable' | 'bootstrap_conflict';

const statuses: Record<AppErrorCode, number> = {
  invalid_request: 400, unauthenticated: 401, forbidden: 403, not_found: 404,
  revision_conflict: 409, last_owner: 409, invitation_conflict: 409,
  delivery_unavailable: 503, dependency_unavailable: 503, bootstrap_conflict: 409,
};

export class AppError extends Error {
  readonly status: number;
  constructor(readonly code: AppErrorCode) {
    super(code);
    this.name = 'AppError';
    this.status = statuses[code];
  }
}
