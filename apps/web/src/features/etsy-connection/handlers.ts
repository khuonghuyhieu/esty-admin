import { randomUUID } from "node:crypto";
import { readSessionConfig } from "../app-session/config.ts";
import { readAuthCookies } from "../app-session/cookies.ts";
import { requireCsrf, requireGeneration, requireSameOrigin } from "../app-session/csrf.ts";
import { SessionFailure } from "../app-session/errors.ts";
import { isAppError } from "../app-session/model.ts";
import { boundedJson, objectBody, upstreamJson, type Fetcher } from "../app-session/transport.ts";
import { isEtsyOutput, isLookup, isRevision, isShopId, isUuid, type EtsyOperation } from "./model.ts";

const suffixes: Record<EtsyOperation, string> = { status: "", history: "/invitations", lookup: "/shops/lookup", create: "/invitations", cancel: "/invitations", disconnect: "/disconnect", sync: "/read" };
const readOperations: Partial<Record<EtsyOperation, true>> = { status: true, history: true, lookup: true };
const invalid = (): never => { throw new SessionFailure(400, "invalid_request"); };

function queryFor(operation: EtsyOperation, url: URL): string {
  if (url.search.length > 1024 || /%(?![a-f0-9]{2})/i.test(url.search)) return invalid();
  const params = url.searchParams;
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return invalid();
  const result = new URLSearchParams();
  if (operation === "history") {
    if (keys.some(key => key !== "limit" && key !== "cursor")) return invalid();
    const limit = params.get("limit"), cursor = params.get("cursor");
    if (limit !== null && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(limit)) return invalid();
    if (cursor !== null && !isUuid(cursor)) return invalid();
    result.set("limit", limit ?? "20");
    if (cursor !== null) result.set("cursor", cursor);
  } else if (operation === "lookup") {
    if (keys.some(key => key !== "shopName" && key !== "offset")) return invalid();
    const input = params.get("shopName"), offset = params.get("offset") ?? "0";
    if (input === null || !/^[\t\n\v\f\r ]*[A-Za-z0-9]{1,64}[\t\n\v\f\r ]*$/.test(input) || !["0", "20", "40", "60", "80"].includes(offset)) return invalid();
    result.set("shopName", input.trim().toLowerCase()); result.set("offset", offset);
  } else if (keys.length || url.search) return invalid();
  const encoded = result.toString();
  return encoded ? `?${encoded}` : "";
}

export async function handleEtsyRequest(operation: EtsyOperation, request: Request, invitationId?: string,
  environment: Readonly<Record<string, string | undefined>> = process.env, transport: Fetcher = fetch): Promise<Response> {
  const requestId = randomUUID();
  const headers = new Headers({ "cache-control": "private, no-store", pragma: "no-cache", vary: "Cookie", "x-request-id": requestId, "referrer-policy": "no-referrer" });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
  try {
    const read = readOperations[operation] === true;
    const method = read ? "GET" : "POST";
    if (request.method !== method) { headers.set("allow", method); throw new SessionFailure(405, "invalid_request"); }
    const config = readSessionConfig(environment);
    requireSameOrigin(request, config);
    const { context, session } = readAuthCookies(config, request.headers.get("cookie"));
    if (!context || !session) throw new SessionFailure(401, "unauthenticated");
    let suffix = suffixes[operation];
    if (operation === "cancel") {
      if (!isUuid(invitationId)) return invalid();
      suffix += `/${invitationId}/cancel`;
    } else if (invitationId !== undefined) return invalid();
    const url = new URL(request.url);
    if (url.pathname !== `/api/app/integrations/etsy${suffix}` || url.hash) return invalid();
    const query = queryFor(operation, url);
    let body: Record<string, unknown> | undefined;
    if (read) {
      requireGeneration(context, request.headers.get("x-session-generation"));
      if (request.body !== null || request.headers.has("transfer-encoding") || ![null, "0"].includes(request.headers.get("content-length"))) return invalid();
    } else {
      requireCsrf(request, config, context);
      const fields = operation === "create" ? ["expectedShopId", "expectedRevision", "idempotencyKey"] : operation === "sync" ? ["expectedRevision"] : ["expectedRevision", "idempotencyKey"];
      const input = objectBody(await boundedJson(request, 16 * 1024, signal, true), [...fields, "generation"], [...fields, "generation"]);
      requireGeneration(context, input.generation);
      if (!isRevision(input.expectedRevision) || (operation !== "sync" && !isUuid(input.idempotencyKey))
        || (operation === "create" && !isShopId(input.expectedShopId))) return invalid();
      body = Object.fromEntries(fields.map(key => [key, input[key]]));
    }
    const result = await upstreamJson(`${config.apiOrigin}/v1/app/integrations/etsy${suffix}${query}`, {
      method, headers: { accept: "application/json", authorization: `Bearer ${config.technicalKey}`, "x-app-access-token": session.accessToken, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, signal, 6500, transport);
    if (result.status === 200 && isEtsyOutput(operation, result.body, config.origin)) {
      const params = new URLSearchParams(query);
      if (operation === "lookup" && (!isLookup(result.body) || result.body.query !== params.get("shopName") || result.body.page.offset !== Number(params.get("offset")))) throw new SessionFailure(503, "upstream_unavailable");
      return Response.json(result.body, { headers });
    }
    if (isAppError(result.body, result.status)) throw new SessionFailure(result.status, result.body.code, result.body.requestId, result.body.retryAfterSeconds);
    throw new SessionFailure(503, "upstream_unavailable");
  } catch (error) {
    const failure = error instanceof SessionFailure ? error : new SessionFailure(503, "upstream_unavailable");
    headers.set("x-request-id", failure.requestId ?? requestId);
    if (failure.retryAfterSeconds !== undefined) headers.set("retry-after", String(failure.retryAfterSeconds));
    return Response.json({ code: failure.code, requestId: failure.requestId ?? requestId,
      ...(failure.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: failure.retryAfterSeconds }) }, { status: failure.status, headers });
  }
}
