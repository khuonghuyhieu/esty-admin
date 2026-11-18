import { readSessionConfig } from "../app-session/config.ts";
import { requireSameOrigin } from "../app-session/csrf.ts";
import { SessionFailure } from "../app-session/errors.ts";
import { boundedJson, objectBody, type Fetcher } from "../app-session/transport.ts";
import { invitationSecret, validConsentUrl } from "./recipient-model.ts";

export function readRecipientConfig(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const config = readSessionConfig(environment);
  const clientId = environment.ETSY_CLIENT_ID;
  if (!clientId || !/^[A-Za-z0-9_-]{1,256}$/.test(clientId)) throw new SessionFailure(503, "configuration_unavailable");
  return { ...config, clientId, callbackUrl: `${config.apiOrigin}/integrations/etsy/callback` };
}

export async function handleInvitationStart(request: Request, environment: Readonly<Record<string, string | undefined>> = process.env, transport: Fetcher = fetch): Promise<Response> {
  const headers = new Headers({ "cache-control": "private, no-store", pragma: "no-cache", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
  try {
    if (request.method !== "POST") {
      headers.set("allow", "POST");
      return Response.json({ code: "invalid_request" }, { status: 405, headers });
    }
    const config = readRecipientConfig(environment);
    requireSameOrigin(request, config);
    if (request.headers.get("origin") !== config.origin) throw new SessionFailure(403, "csrf_denied");
    const url = new URL(request.url);
    if (url.pathname !== "/api/integrations/etsy/invite/start" || url.search || url.hash) throw new SessionFailure(400, "invalid_request");
    const input = objectBody(await boundedJson(request, 8192, signal, true), ["secret"], ["secret"]);
    if (typeof input.secret !== "string" || !invitationSecret.test(input.secret)) throw new SessionFailure(400, "invalid_request");
    const upstreamSignal = AbortSignal.any([signal, AbortSignal.timeout(6500)]);
    upstreamSignal.throwIfAborted();
    const response = await transport(`${config.apiOrigin}/integrations/etsy/invite/start`, {
      method: "POST", redirect: "manual", cache: "no-store", credentials: "omit", signal: upstreamSignal,
      headers: { "content-type": "application/json", origin: config.origin, authorization: `Bearer ${config.technicalKey}` },
      body: JSON.stringify({ secret: input.secret }),
    });
    // Neither provider bodies nor cookies belong in this public capability bridge.
    if (response.body) void response.body.cancel().catch(() => {});
    upstreamSignal.throwIfAborted();
    if ([400, 409, 410].includes(response.status)) return Response.json({ code: "invitation_unavailable" }, { status: 400, headers });
    const consentUrl = response.headers.get("location");
    if (response.status !== 303 || !validConsentUrl(consentUrl, config.clientId, config.callbackUrl)) throw new SessionFailure(503, "upstream_unavailable");
    return Response.json({ consentUrl }, { headers });
  } catch (error) {
    const status = error instanceof SessionFailure && [400, 403].includes(error.status) ? error.status : 503;
    return Response.json({ code: status === 503 ? "temporarily_unavailable" : "invitation_unavailable" }, { status, headers });
  }
}
