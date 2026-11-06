import { timingSafeEqual } from "node:crypto";
import type { SessionConfig } from "./config.ts";
import type { AuthContext } from "./cookies.ts";
import { SessionFailure } from "./errors.ts";

export function requireSameOrigin(request: Request, config: SessionConfig): void {
  // Next normalizes loopback Request.url to localhost; authorize the exact actual Host instead.
  if (request.headers.get("host") !== new URL(config.origin).host
    || request.headers.get("sec-fetch-site") !== "same-origin") throw new SessionFailure(403, "csrf_denied");
}

export function requireCsrf(request: Request, config: SessionConfig, context: AuthContext | null): asserts context is AuthContext {
  requireSameOrigin(request, config);
  const token = request.headers.get("x-csrf-token");
  if (request.headers.get("origin") !== config.origin || !context || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)
    || !timingSafeEqual(Buffer.from(token), Buffer.from(context.csrf))) throw new SessionFailure(403, "csrf_denied");
}

export function requireGeneration(context: AuthContext, value: unknown): void {
  if (typeof value !== "string" || value !== context.generation) throw new SessionFailure(409, "session_changed");
}
