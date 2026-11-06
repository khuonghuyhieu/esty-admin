import { createSecretKey, type KeyObject } from "node:crypto";
import { validateLoopbackOrigin } from "../connectivity/config.ts";
import { unavailable } from "./errors.ts";

export interface SessionConfig {
  origin: string;
  apiOrigin: string;
  authUrl: string;
  technicalKey: string;
  authApiKey: string;
  cookieKey: KeyObject;
  secure: boolean;
  names: { session: string; context: string; restricted: string; challenge: string };
}

function origin(value: string | undefined, local: boolean): string {
  if (!value) return unavailable();
  if (local) {
    try { return validateLoopbackOrigin(value); } catch { return unavailable(); }
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/" || value !== url.origin) return unavailable();
    return url.origin;
  } catch { return unavailable(); }
}

function headerSecret(value: string | undefined, limit = 4096): string {
  if (!value || value.length > limit || !/^[\x21-\x7e]+$/.test(value)) return unavailable();
  return value;
}

function publicAuthKey(value: string, project: string | undefined): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part)
    || Buffer.from(part, "base64url").toString("base64url") !== part)) return false;
  try {
    const header: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!header || typeof header !== "object" || Array.isArray(header)
      || !payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const h = header as Record<string, unknown>, p = payload as Record<string, unknown>;
    // Key classification only; Auth and Nest still authenticate and admit every session.
    return h.alg === "HS256" && h.typ === "JWT" && p.role === "anon"
      && p.iss === "supabase" && typeof project === "string" && p.ref === project;
  } catch { return false; }
}

export function readSessionConfig(env: Readonly<Record<string, string | undefined>> = process.env): SessionConfig {
  const mode = env.APP_SESSION_MODE ?? "hosted";
  if (mode !== "hosted" && mode !== "local") return unavailable();
  const local = mode === "local";
  if (local && (["VERCEL", "VERCEL_ENV", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY", "RENDER"].some(key => env[key] !== undefined)
    || env.SITE_MODE === "release" || env.SITE_MODE === "preview")) return unavailable();
  const appOrigin = origin(env.APP_ORIGIN, local);
  const apiOrigin = origin(env.APP_API_ORIGIN, local);
  let authUrl: URL;
  try { authUrl = new URL(env.APP_AUTH_URL ?? ""); } catch { return unavailable(); }
  origin(authUrl.origin, local);
  if (authUrl.username || authUrl.password || authUrl.search || authUrl.hash
    || !["/", "/auth/v1", "/auth/v1/"].includes(authUrl.pathname)) return unavailable();
  const authApiKey = headerSecret(env.APP_AUTH_API_KEY, 8192);
  const project = /^([a-z0-9]{20})\.supabase\.co$/.exec(authUrl.hostname)?.[1];
  if (!local && !publicAuthKey(authApiKey, project)) return unavailable();
  const encodedKey = env.APP_SESSION_COOKIE_KEY ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(encodedKey)) return unavailable();
  const key = Buffer.from(encodedKey, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encodedKey) return unavailable();
  const prefix = local ? "lovora-local-" : "__Host-lovora-";
  return {
    origin: appOrigin, apiOrigin, authUrl: authUrl.href.replace(/\/$/, ""),
    technicalKey: headerSecret(env.APP_API_TECHNICAL_KEY), authApiKey,
    cookieKey: createSecretKey(key), secure: !local,
    names: { session: `${prefix}session`, context: `${prefix}auth-context`, restricted: `${prefix}auth-restricted`, challenge: `${prefix}auth-challenge` },
  };
}

export const returnPaths = ["/application", "/settings", "/settings/team"] as const;
export type ReturnPath = typeof returnPaths[number];
export function safeReturnPath(value: unknown): ReturnPath {
  return returnPaths.includes(value as ReturnPath) ? value as ReturnPath : "/application";
}
