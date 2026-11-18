import { isAppError, isAppMe, type AppMe } from "./model.ts";
import type { SessionConfig } from "./config.ts";
import { SessionFailure } from "./errors.ts";
import { upstreamJson, type Fetcher } from "./transport.ts";

export async function currentAppMe(config: SessionConfig, accessToken: string, signal: AbortSignal, transport: Fetcher = fetch): Promise<AppMe> {
  const result = await upstreamJson(`${config.apiOrigin}/v1/app/me`, {
    method: "GET", headers: { accept: "application/json", authorization: `Bearer ${config.technicalKey}`, "x-app-access-token": accessToken },
  }, signal, 6500, transport);
  if (result.status === 200 && isAppMe(result.body)) return result.body;
  if (isAppError(result.body, result.status)) {
    throw new SessionFailure(result.status, result.body.code, result.body.requestId, result.body.retryAfterSeconds);
  }
  throw new SessionFailure(503, "upstream_unavailable");
}
