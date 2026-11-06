import type { components } from "../../lib/api/generated.ts";

export type AppMe = components["schemas"]["AppMe"];
export type AppError = components["schemas"]["AppError"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const capabilities: readonly AppMe["capabilities"][number][] = ["profile.read.self", "profile.update.self", "team.read", "team.invite", "team.invite.manage", "team.role.assign", "team.membership.manage", "workspace.read", "workspace.update", "audit.read"];
const errorCodes: readonly AppError["code"][] = ["invalid_request", "unauthenticated", "forbidden", "not_found", "revision_conflict", "last_owner", "invitation_conflict", "delivery_unavailable", "dependency_unavailable", "bootstrap_conflict"];

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

export function isAppError(value: unknown): value is AppError {
  return record(value, ["code", "requestId"]) && id(value.requestId) && errorCodes.includes(value.code as AppError["code"]);
}
