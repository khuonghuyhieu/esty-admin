import type { components } from "../../lib/api/generated.ts";

export type AppMe = components["schemas"]["AppMe"];
export type AppError = components["schemas"]["AppError"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const capabilities: readonly AppMe["capabilities"][number][] = ["profile.read.self", "profile.update.self", "team.read", "team.invite", "team.invite.manage", "team.role.assign", "team.membership.manage", "workspace.read", "workspace.update", "audit.read", "etsy.connection.read", "etsy.connection.manage"];
const errorStatuses: Record<AppError["code"], number> = {
  invalid_request: 400, unauthenticated: 401, forbidden: 403, not_found: 404,
  revision_conflict: 409, last_owner: 409, invitation_conflict: 409, delivery_unavailable: 503,
  dependency_unavailable: 503, bootstrap_conflict: 409, configuration_unavailable: 503,
  upstream_unavailable: 503, upstream_rate_limited: 429, reconnect_required: 409,
  outcome_unknown: 503, connection_changed: 409, connection_busy: 409,
};

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function id(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
function name(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    && value.isWellFormed() && !/[\x00-\x1f\x7f]/.test(value);
}
function revision(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }

export function isAppMe(value: unknown): value is AppMe {
  if (!record(value, ["profile", "email", "workspace", "membership", "capabilities"])) return false;
  const { profile, workspace, membership } = value;
  return record(profile, ["userId", "displayName", "revision"]) && id(profile.userId) && name(profile.displayName) && revision(profile.revision)
    && typeof value.email === "string" && /^[^\s@]+@[^\s@]+$/.test(value.email)
    && record(workspace, ["id", "displayName", "revision"]) && id(workspace.id) && name(workspace.displayName) && revision(workspace.revision)
    && record(membership, ["userId", "displayName", "role", "status", "revision"])
    && membership.userId === profile.userId && name(membership.displayName) && revision(membership.revision)
    && (membership.role === "owner" || membership.role === "member") && membership.status === "active"
    && Array.isArray(value.capabilities) && value.capabilities.every(capability => capabilities.includes(capability))
    && value.capabilities.every((capability, index, all) => all.indexOf(capability) === index);
}

export function isAppError(value: unknown, status?: number): value is AppError {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const retry = Object.hasOwn(value, "retryAfterSeconds");
  return record(value, retry ? ["code", "requestId", "retryAfterSeconds"] : ["code", "requestId"])
    && id(value.requestId) && typeof value.code === "string" && Object.hasOwn(errorStatuses, value.code)
    && (status === undefined || errorStatuses[value.code as AppError["code"]] === status)
    && (!retry || (typeof value.retryAfterSeconds === "number" && Number.isInteger(value.retryAfterSeconds)
      && value.retryAfterSeconds >= 1 && value.retryAfterSeconds <= 86400));
}
