import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server.js";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(32).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "connect-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  headers.delete("content-security-policy-report-only");
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  return response;
}

export const config = {
  // Static 404 documents under these prefixes cannot carry a request nonce.
  matcher: ["/login", "/application", "/settings", "/settings/team"],
};
