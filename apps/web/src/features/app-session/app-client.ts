import { isAppError, isAppMe, type AppMe } from "./model.ts";
import type { SessionConfig } from "./config.ts";
import { SessionFailure } from "./errors.ts";
import { upstreamJson, type Fetcher } from "./transport.ts";

export async function currentAppMe(config: SessionConfig, accessToken: string, signal: AbortSignal, transport: Fetcher = fetch): Promise<AppMe> {
  const result = await upstreamJson(`${config.apiOrigin}/v1/app/me`, {
    method: "GET", headers: { accept: "application/json", authorization: `Bearer ${config.technicalKey}`, "x-app-access-token": accessToken },
  }, signal, 6500, transport);
  if (result.status === 200 && isAppMe(result.body)) return result.body;
  if ([400, 401, 403, 404, 409, 503].includes(result.status) && isAppError(result.body)) {
    throw new SessionFailure(result.status, result.body.code, result.body.requestId);
  }
  throw new SessionFailure(503, "upstream_unavailable");
}
