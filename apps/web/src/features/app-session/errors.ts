import type { components } from "../../lib/api/generated.ts";

export type SessionErrorCode = components["schemas"]["AppError"]["code"]
  | "csrf_denied" | "session_changed" | "upstream_unavailable" | "invalid_credentials" | "rate_limited";

export class SessionFailure extends Error {
  readonly status: number;
  readonly code: SessionErrorCode;
  readonly requestId?: string;
  constructor(status: number, code: SessionErrorCode, requestId?: string) {
    super(code);
    this.name = "SessionFailure";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function unavailable(): never {
  throw new SessionFailure(503, "upstream_unavailable");
}
