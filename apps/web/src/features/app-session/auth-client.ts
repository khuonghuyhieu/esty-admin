import type { SessionConfig } from "./config.ts";
import type { AuthSession } from "./cookies.ts";
import { SessionFailure } from "./errors.ts";
import { upstreamJson, type Fetcher } from "./transport.ts";

type Tokens = Omit<AuthSession, "generation">;

function tokens(value: unknown): Tokens {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SessionFailure(503, "upstream_unavailable");
  const body = value as Record<string, unknown>;
  if (typeof body.access_token !== "string" || !/^[\x21-\x7e]+$/.test(body.access_token)
    || typeof body.refresh_token !== "string" || !/^[\x21-\x7e]+$/.test(body.refresh_token)
    || typeof body.expires_in !== "number" || !Number.isSafeInteger(body.expires_in) || body.expires_in <= 0
    || body.expires_in > 365 * 24 * 3600 || String(body.token_type).toLowerCase() !== "bearer") {
    throw new SessionFailure(503, "upstream_unavailable");
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + body.expires_in * 1000 };
}

async function grant(config: SessionConfig, kind: "password" | "refresh_token", body: Record<string, string>, signal: AbortSignal, transport: Fetcher): Promise<Tokens> {
  const result = await upstreamJson(`${config.authUrl}/token?grant_type=${kind}`, {
    method: "POST", headers: { "content-type": "application/json", apikey: config.authApiKey }, body: JSON.stringify(body),
  }, signal, 1500, transport);
  if (result.status === 429) throw new SessionFailure(429, "rate_limited");
  if (result.status === 400 || result.status === 401 || result.status === 422) {
    const errorCode = result.body && typeof result.body === "object" ? (result.body as Record<string, unknown>).error_code : undefined;
    if (kind === "password" && ["invalid_credentials", "email_not_confirmed", "user_banned"].includes(String(errorCode))) throw new SessionFailure(401, "invalid_credentials");
    if (kind === "refresh_token" && ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "user_not_found", "session_expired"].includes(String(errorCode))) throw new SessionFailure(401, "unauthenticated");
  }
  if (result.status !== 200) throw new SessionFailure(503, "upstream_unavailable");
  return tokens(result.body);
}

export function passwordGrant(config: SessionConfig, email: string, password: string, signal: AbortSignal, transport: Fetcher = fetch): Promise<Tokens> {
  return grant(config, "password", { email, password }, signal, transport);
}

export function refreshGrant(config: SessionConfig, refreshToken: string, signal: AbortSignal, transport: Fetcher = fetch): Promise<Tokens> {
  return grant(config, "refresh_token", { refresh_token: refreshToken }, signal, transport);
}

export async function revokeLocal(config: SessionConfig, accessToken: string, signal: AbortSignal, transport: Fetcher = fetch): Promise<"confirmed" | "unknown"> {
  try {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(1500)]);
    bounded.throwIfAborted();
    const response = await transport(`${config.authUrl}/logout?scope=local`, {
      method: "POST", headers: { apikey: config.authApiKey, authorization: `Bearer ${accessToken}` },
      signal: bounded, cache: "no-store", credentials: "omit", redirect: "manual",
    });
    void response.body?.cancel().catch(() => {});
    return response.status === 204 || response.status === 200 ? "confirmed" : "unknown";
  } catch { return "unknown"; }
}
