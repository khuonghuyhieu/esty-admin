import { randomUUID } from "node:crypto";
import { readSessionConfig, safeReturnPath, type SessionConfig } from "./config.ts";
import { cookieHeader, newContext, readAuthCookies, sealCookie, type AuthContext, type AuthSession } from "./cookies.ts";
import { requireCsrf, requireGeneration, requireSameOrigin } from "./csrf.ts";
import { SessionFailure } from "./errors.ts";
import { boundedJson, objectBody, type Fetcher } from "./transport.ts";
import { currentAppMe } from "./app-client.ts";
import { passwordGrant, refreshGrant, revokeLocal } from "./auth-client.ts";

export type SessionOperation = "context" | "begin" | "login" | "refresh" | "logout" | "me";

function clearSession(headers: Headers, config: SessionConfig): void {
  for (const name of ["session", "restricted", "challenge"] as const) headers.append("set-cookie", cookieHeader(config, name, null));
}
function rotateContext(headers: Headers, config: SessionConfig): AuthContext {
  const context = newContext();
  headers.append("set-cookie", cookieHeader(config, "context", sealCookie(config, "context", context)));
  clearSession(headers, config);
  return context;
}
function json(body: unknown, headers: Headers, status = 200): Response { return Response.json(body, { status, headers }); }

export async function handleSessionRequest(operation: SessionOperation, request: Request, environment: Readonly<Record<string, string | undefined>> = process.env, transport: Fetcher = fetch): Promise<Response> {
  const requestId = randomUUID();
  const headers = new Headers({ "cache-control": "private, no-store", pragma: "no-cache", vary: "Cookie", "x-request-id": requestId });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
  try {
    const expectedMethod = operation === "context" || operation === "me" ? "GET" : "POST";
    if (request.method !== expectedMethod) {
      headers.set("allow", expectedMethod);
      throw new SessionFailure(405, "invalid_request");
    }
    const config = readSessionConfig(environment);
    const { context, session } = readAuthCookies(config, request.headers.get("cookie"));
    if (operation === "context") {
      requireSameOrigin(request, config);
      return json(context ?? rotateContext(headers, config), headers);
    }
    if (operation === "me") {
      requireSameOrigin(request, config);
      if (!session) throw new SessionFailure(401, "unauthenticated");
      return json(await currentAppMe(config, session.accessToken, signal, transport), headers);
    }
    requireCsrf(request, config, context);
    const input = await boundedJson(request, 16 * 1024, signal, true);
    const body = operation === "login"
      ? objectBody(input, ["email", "password", "generation", "returnTo"], ["email", "password", "generation"])
      : objectBody(input, ["generation"], ["generation"]);
    requireGeneration(context, body.generation);
    if (operation === "begin") return json(rotateContext(headers, config), headers);
    if (operation === "logout") {
      rotateContext(headers, config);
      const providerOutcome = session ? await revokeLocal(config, session.accessToken, signal, transport) : "unknown";
      return json({ localCleared: true, providerOutcome }, headers);
    }
    let nextSession: AuthSession;
    if (operation === "login") {
      if (typeof body.email !== "string" || body.email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(body.email)
        || typeof body.password !== "string" || body.password.length === 0 || body.password.length > 4096
        || (body.returnTo !== undefined && typeof body.returnTo !== "string")) throw new SessionFailure(400, "invalid_request");
      nextSession = { ...await passwordGrant(config, body.email, body.password, signal, transport), generation: context.generation };
    } else {
      if (!session) throw new SessionFailure(401, "unauthenticated");
      nextSession = { ...await refreshGrant(config, session.refreshToken, signal, transport), generation: context.generation };
    }
    // Validate cookie capacity before admission; retain only a canonical403 session for explicit logout.
    const sealed = sealCookie(config, "session", nextSession);
    try {
      const me = await currentAppMe(config, nextSession.accessToken, signal, transport);
      headers.append("set-cookie", cookieHeader(config, "session", sealed));
      return json(operation === "login" ? { me, returnTo: safeReturnPath(body.returnTo) } : { me }, headers);
    } catch (error) {
      if (error instanceof SessionFailure && error.status === 403 && error.code === "forbidden") headers.append("set-cookie", cookieHeader(config, "session", sealed));
      throw error;
    }
  } catch (error) {
    const failure = error instanceof SessionFailure ? error : new SessionFailure(503, "upstream_unavailable");
    const safeId = failure.requestId ?? requestId;
    headers.set("x-request-id", safeId);
    return json({ code: failure.code, requestId: safeId }, headers, failure.status);
  }
}
