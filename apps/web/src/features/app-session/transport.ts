import { SessionFailure } from "./errors.ts";

export type Fetcher = typeof fetch;

export async function boundedJson(source: Request | Response, limit: number, signal: AbortSignal, input = false): Promise<unknown> {
  const fail = () => {
    if (!source.body?.locked) void source.body?.cancel().catch(() => {});
    return new SessionFailure(input ? 400 : 503, input ? "invalid_request" : "upstream_unavailable");
  };
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(source.headers.get("content-type") ?? "")) throw fail();
  const length = source.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw fail();
  const reader = source.body?.getReader();
  if (!reader) throw fail();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw fail();
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof SessionFailure) throw error;
    throw fail();
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function upstreamJson(url: string, init: RequestInit, signal: AbortSignal, timeout: number, transport: Fetcher = fetch): Promise<{ status: number; body: unknown }> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
  try {
    bounded.throwIfAborted();
    const response = await transport(url, { ...init, redirect: "manual", cache: "no-store", credentials: "omit", signal: bounded });
    const body = await boundedJson(response, 64 * 1024, bounded);
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof SessionFailure) throw error;
    throw new SessionFailure(503, "upstream_unavailable");
  }
}

export function objectBody(value: unknown, allowed: readonly string[], required: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SessionFailure(400, "invalid_request");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(object, key))) throw new SessionFailure(400, "invalid_request");
  return object;
}
