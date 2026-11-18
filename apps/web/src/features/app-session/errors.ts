import type { components } from "../../lib/api/generated.ts";

export type SessionErrorCode = components["schemas"]["AppError"]["code"]
  | "csrf_denied" | "session_changed" | "upstream_unavailable" | "invalid_credentials" | "rate_limited";

export class SessionFailure extends Error {
  readonly status: number;
  readonly code: SessionErrorCode;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  constructor(status: number, code: SessionErrorCode, requestId?: string, retryAfterSeconds?: number) {
    super(code);
    this.name = "SessionFailure";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function unavailable(): never {
  throw new SessionFailure(503, "upstream_unavailable");
}
