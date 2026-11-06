import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SessionConfig } from "./config.ts";
import { SessionFailure, unavailable } from "./errors.ts";

export interface AuthContext { generation: string; csrf: string }
export interface AuthSession { accessToken: string; refreshToken: string; expiresAt: number; generation: string }
type Payloads = { context: AuthContext; session: AuthSession };
type Purpose = keyof Payloads;
const randomValue = () => randomBytes(32).toString("base64url");
const noncePattern = /^[A-Za-z0-9_-]{43}$/;

export function newContext(): AuthContext {
  return { generation: randomValue(), csrf: randomValue() };
}

function binding(config: SessionConfig, purpose: Purpose): Buffer {
  return Buffer.from(JSON.stringify([1, purpose, config.origin, config.names[purpose]]));
}

function validPayload(purpose: Purpose, value: Record<string, unknown>): boolean {
  if (value.v !== 1 || value.purpose !== purpose || typeof value.generation !== "string" || !noncePattern.test(value.generation)) return false;
  if (purpose === "context") return Object.keys(value).length === 4 && typeof value.csrf === "string" && noncePattern.test(value.csrf);
  return Object.keys(value).length === 6 && typeof value.accessToken === "string" && /^[\x21-\x7e]+$/.test(value.accessToken)
    && typeof value.refreshToken === "string" && /^[\x21-\x7e]+$/.test(value.refreshToken)
    && typeof value.expiresAt === "number" && Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0;
}

export function sealCookie<P extends Purpose>(config: SessionConfig, purpose: P, payload: Payloads[P]): string {
  const value: Record<string, unknown> = { ...payload, v: 1, purpose };
  if (!validPayload(purpose, value)) return unavailable();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.cookieKey, iv);
  cipher.setAAD(binding(config, purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const encoded = `v1.${Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64url")}`;
  if (Buffer.byteLength(encoded) >= 3500) return unavailable();
  return encoded;
}

export function openCookie<P extends Purpose>(config: SessionConfig, purpose: P, encoded: string | undefined): Payloads[P] | null {
  if (!encoded || encoded.length >= 3500 || !/^v1\.[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const bytes = Buffer.from(encoded.slice(3), "base64url");
    if (bytes.length < 29 || bytes.toString("base64url") !== encoded.slice(3)) return null;
    const decipher = createDecipheriv("aes-256-gcm", config.cookieKey, bytes.subarray(0, 12));
    decipher.setAAD(binding(config, purpose));
    decipher.setAuthTag(bytes.subarray(-16));
    const plain = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]);
    const value: unknown = JSON.parse(plain.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value) || !validPayload(purpose, value as Record<string, unknown>)) return null;
    const payload = { ...value } as Record<string, unknown>;
    delete payload.v;
    delete payload.purpose;
    return payload as unknown as Payloads[P];
  } catch { return null; }
}

export function readAuthCookies(config: SessionConfig, header: string | null): { context: AuthContext | null; session: AuthSession | null } {
  const values = new Map<string, string>();
  const names = Object.values(config.names);
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!names.includes(name)) continue;
    if (values.has(name)) throw new SessionFailure(400, "invalid_request");
    values.set(name, part.slice(index + 1).trim());
  }
  const context = openCookie(config, "context", values.get(config.names.context));
  const candidate = openCookie(config, "session", values.get(config.names.session));
  return { context, session: context && candidate?.generation === context.generation ? candidate : null };
}

export function cookieHeader(config: SessionConfig, name: keyof SessionConfig["names"], value: string | null): string {
  return `${config.names[name]}=${value ?? ""}; Path=/; HttpOnly; SameSite=Lax${config.secure ? "; Secure" : ""}${value === null ? "; Max-Age=0" : ""}`;
}
