import type { components, operations } from "../../lib/api/generated.ts";

type Schemas = components["schemas"];
export type Connection = Schemas["EtsyConnection"];
export type Invitation = Schemas["EtsyInvitation"];
export type InvitationPage = Schemas["EtsyInvitationPage"];
export type CreatedInvitation = Schemas["EtsyCreatedInvitation"];
export type Observation = Schemas["EtsyShopObservation"];
export type Disposition = Schemas["EtsyDisposition"];
export type Shop = Schemas["EtsyShopLookupItem"];
export type Lookup = Schemas["EtsyShopLookupResponse"];
export interface EtsyOperations {
  status: { input: undefined; output: Connection };
  history: { input: { cursor?: string }; output: InvitationPage };
  lookup: { input: { shopName: string; offset: number }; output: Lookup };
  create: { input: Schemas["EtsyCreateInvitation"]; output: CreatedInvitation };
  cancel: { input: Schemas["EtsyMutation"] & { invitationId: string }; output: Disposition };
  disconnect: { input: Schemas["EtsyMutation"]; output: Disposition };
  sync: { input: operations["syncEtsyShop"]["requestBody"]["content"]["application/json"]; output: Observation };
}
export type EtsyOperation = keyof EtsyOperations;
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const isRevision = (value: unknown, minimum = 0): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
export function isShopId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && (value.length < 19 || value <= "9223372036854775807");
}
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
const textOrNull = (value: unknown) => value === null || typeof value === "string";
export function isConnection(value: unknown): value is Connection {
  return record(value, ["connectionId", "state", "revision", "shopId", "etsyUserId", "verifiedAt", "observedAt", "outcome", "attemptPhase"])
    && (value.connectionId === null || isUuid(value.connectionId)) && isRevision(value.revision)
    && typeof value.state === "string" && ["unconnected", "verification_pending", "active", "reconnect_required", "refresh_unknown", "disconnected"].includes(value.state)
    && (value.shopId === null || isShopId(value.shopId)) && (value.etsyUserId === null || isShopId(value.etsyUserId))
    && (value.verifiedAt === null || date(value.verifiedAt)) && (value.observedAt === null || date(value.observedAt))
    && textOrNull(value.outcome) && textOrNull(value.attemptPhase);
}
export function isInvitation(value: unknown): value is Invitation {
  return record(value, ["id", "shopId", "state", "createdAt", "expiresAt"]) && isUuid(value.id) && isShopId(value.shopId)
    && typeof value.state === "string" && ["pending", "in_progress", "connected", "declined", "expired", "cancelled", "failed", "outcome_unknown"].includes(value.state)
    && date(value.createdAt) && date(value.expiresAt);
}
export function isInvitationPage(value: unknown): value is InvitationPage {
  return record(value, ["items", "nextCursor", "connection"]) && Array.isArray(value.items) && value.items.length <= 100
    && value.items.every(isInvitation) && new Set(value.items.map(item => item.id)).size === value.items.length
    && (value.nextCursor === null || isUuid(value.nextCursor)) && isConnection(value.connection);
}
export function isCreatedInvitation(value: unknown, origin: string): value is CreatedInvitation {
  return record(value, ["invitationId", "revision", "expiresAt"], ["shareUrl"]) && isUuid(value.invitationId)
    && isRevision(value.revision, 1) && date(value.expiresAt)
    && (!Object.hasOwn(value, "shareUrl") || (typeof value.shareUrl === "string"
      && value.shareUrl.startsWith(`${origin}/integrations/etsy/invite#`) && /^[A-Za-z0-9_-]{43}$/.test(value.shareUrl.slice(`${origin}/integrations/etsy/invite#`.length))));
}
export function isDisposition(value: unknown): value is Disposition {
  return record(value, ["revision", "localDisconnected", "providerRevocation"]) && isRevision(value.revision, 1)
    && typeof value.localDisconnected === "boolean" && value.providerRevocation === "not_confirmed";
}
export function isObservation(value: unknown): value is Observation {
  return record(value, ["etsyUserId", "shopId", "shopName", "currencyCode", "connectionId", "revision", "observedAt"])
    && isShopId(value.etsyUserId) && isShopId(value.shopId) && typeof value.shopName === "string" && value.shopName.length >= 1 && value.shopName.length <= 256
    && typeof value.currencyCode === "string" && /^[A-Z]{3}$/.test(value.currencyCode) && isUuid(value.connectionId) && isRevision(value.revision, 1) && date(value.observedAt);
}
export function isLookup(value: unknown): value is Lookup {
  if (!record(value, ["query", "outcome", "items", "page", "ownershipVerified", "observedAt"])
    || typeof value.query !== "string" || !/^[a-z0-9]{1,64}$/.test(value.query) || value.ownershipVerified !== false || !date(value.observedAt)
    || !Array.isArray(value.items) || value.items.length > 20
    || !record(value.page, ["offset", "limit", "providerCount", "complete", "hasMore", "nextOffset", "truncated"])) return false;
  const page = value.page;
  if (typeof page.offset !== "number" || ![0, 20, 40, 60, 80].includes(page.offset) || page.limit !== 20
    || !(page.providerCount === "0" || isShopId(page.providerCount)) || typeof page.complete !== "boolean" || typeof page.hasMore !== "boolean"
    || page.nextOffset !== (page.hasMore && page.offset < 80 ? page.offset + 20 : null)
    || page.truncated !== (page.hasMore && page.offset === 80) || (page.complete && (page.offset !== 0 || page.hasMore))) return false;
  const ids = new Set<string>();
  let exact = 0;
  for (const item of value.items) {
    if (!record(item, ["shopId", "shopName", "shopUrl", "match"]) || !isShopId(item.shopId) || ids.has(item.shopId)
      || typeof item.shopName !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(item.shopName)
      || item.shopUrl !== `https://www.etsy.com/shop/${item.shopName}`
      || item.match !== (item.shopName.toLowerCase() === value.query ? "exact" : "candidate")) return false;
    ids.add(item.shopId);
    if (item.match === "exact") exact++;
  }
  if (BigInt(page.providerCount as string) < BigInt(value.items.length)) return false;
  if (value.outcome === "exact") return page.complete && exact === 1;
  if (value.outcome === "choose") return value.items.length > 0 && !(page.complete && exact === 1);
  if (value.outcome === "not_found") return page.complete && page.providerCount === "0" && value.items.length === 0;
  return value.outcome === "incomplete" && !page.complete && value.items.length === 0;
}
export function isEtsyOutput(operation: EtsyOperation, value: unknown, origin: string): boolean {
  switch (operation) {
    case "status": return isConnection(value);
    case "history": return isInvitationPage(value);
    case "lookup": return isLookup(value);
    case "create": return isCreatedInvitation(value, origin);
    case "cancel": case "disconnect": return isDisposition(value);
    case "sync": return isObservation(value);
  }
}
