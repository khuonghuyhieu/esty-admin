import { SessionFailure } from "../app-session/errors.ts";
import { isAppError } from "../app-session/model.ts";
import { isEtsyOutput, isLookup, isUuid, type EtsyOperation, type EtsyOperations } from "./model.ts";

const root = "/api/app/integrations/etsy";
const nonce = /^[A-Za-z0-9_-]{43}$/;

async function json(path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { ...init, signal, credentials: "same-origin", cache: "no-store", redirect: "error" });
  const value: unknown = await response.json();
  signal.throwIfAborted();
  if (!response.ok) {
    if (isAppError(value, response.status)) throw new SessionFailure(response.status, value.code, value.requestId, value.retryAfterSeconds);
    if (value && typeof value === "object" && Object.keys(value).length === 2 && "requestId" in value && isUuid(value.requestId) && "code" in value
      && ((value.code === "csrf_denied" && response.status === 403) || (value.code === "session_changed" && response.status === 409))) throw new SessionFailure(response.status, value.code, value.requestId);
    throw new SessionFailure(503, "upstream_unavailable");
  }
  if (response.status !== 200) throw new SessionFailure(503, "upstream_unavailable");
  return value;
}

export async function requestEtsy<K extends EtsyOperation>(operation: K, input: EtsyOperations[K]["input"], generation: string, signal: AbortSignal): Promise<EtsyOperations[K]["output"]> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(9000)]);
  const read = operation === "status" || operation === "history" || operation === "lookup";
  let path = root, body: Record<string, unknown> | undefined;
  if (operation === "history") {
    const cursor = (input as EtsyOperations["history"]["input"]).cursor;
    path += `/invitations?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  } else if (operation === "lookup") {
    const lookup = input as EtsyOperations["lookup"]["input"];
    path += `/shops/lookup?${new URLSearchParams({ shopName: lookup.shopName, offset: String(lookup.offset) })}`;
  } else if (operation === "create") { path += "/invitations"; body = input as EtsyOperations["create"]["input"]; }
  else if (operation === "cancel") {
    const { invitationId, ...mutation } = input as EtsyOperations["cancel"]["input"];
    if (!isUuid(invitationId)) throw new SessionFailure(400, "invalid_request");
    path += `/invitations/${invitationId}/cancel`; body = mutation;
  } else if (operation === "disconnect" || operation === "sync") { path += operation === "disconnect" ? "/disconnect" : "/read"; body = input as EtsyOperations["disconnect" | "sync"]["input"]; }
  try {
    const perform = async () => {
      bounded.throwIfAborted();
      let context: { generation: string; csrf: string } | undefined;
      if (!read) {
        const value = await json("/api/auth/context", { method: "GET", headers: { accept: "application/json" } }, bounded);
        if (!value || typeof value !== "object" || Object.keys(value).length !== 2 || !("generation" in value) || !("csrf" in value)
          || typeof value.generation !== "string" || !nonce.test(value.generation) || typeof value.csrf !== "string" || !nonce.test(value.csrf)) throw new SessionFailure(503, "upstream_unavailable");
        if (value.generation !== generation) throw new SessionFailure(409, "session_changed");
        context = { generation: value.generation, csrf: value.csrf };
      }
      const result = await json(path, {
        method: read ? "GET" : "POST", headers: { accept: "application/json", ...(context ? { "content-type": "application/json", "x-csrf-token": context.csrf } : { "x-session-generation": generation }) },
        ...(context ? { body: JSON.stringify({ ...body, generation: context.generation }) } : {}),
      }, bounded);
      if (!isEtsyOutput(operation, result, window.location.origin)) throw new SessionFailure(503, "upstream_unavailable");
      if (operation === "lookup") {
        const query = input as EtsyOperations["lookup"]["input"];
        if (!isLookup(result) || result.query !== query.shopName || result.page.offset !== query.offset) throw new SessionFailure(503, "upstream_unavailable");
      }
      return result as EtsyOperations[K]["output"];
    };
    if (read) return await perform();
    if (!navigator.locks) throw new SessionFailure(503, "upstream_unavailable");
    return await navigator.locks.request("lovora-app-session", { mode: "exclusive", signal: bounded }, perform);
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof SessionFailure) throw error;
    throw new SessionFailure(503, "upstream_unavailable");
  }
}

export function etsyErrorMessage(error: unknown): string {
  if (!(error instanceof SessionFailure)) return "The request could not be confirmed. Check saved status before taking another action.";
  if (error.code === "upstream_rate_limited") return `Etsy is rate limiting requests. Wait ${error.retryAfterSeconds ?? 60} seconds before trying again. Nothing will retry automatically.`;
  if (["unauthenticated", "forbidden", "session_changed", "csrf_denied"].includes(error.code)) return "Current access could not be confirmed. Etsy details are hidden. Check your session before continuing.";
  if (["revision_conflict", "connection_changed", "connection_busy", "invitation_conflict"].includes(error.code)) return "The connection changed or another action is in progress. Check saved status; no action was retried.";
  if (error.code === "reconnect_required") return "New consent is required for the same shop. Check saved status before creating an invitation.";
  if (error.code === "outcome_unknown") return "The outcome is unknown. Do not repeat the action or assume shop access. Check saved status first.";
  if (error.code === "invalid_request") return "The request was not accepted. Check the shop and saved status before trying again.";
  return "The request could not be confirmed. Check saved status before taking another action. Nothing was retried automatically.";
}
