import type { operations } from "./generated.ts";

export type Liveness = operations["getLiveness"]["responses"][200]["content"]["application/json"];
export type Readiness = operations["getReadiness"]["responses"][200]["content"]["application/json"];
export type Degraded = operations["getReadiness"]["responses"][503]["content"]["application/json"];
type Failure = { kind: "failure"; reason: "network" | "timeout" | "cancelled" | "invalid_response" | "http" };
export type LiveResult = { kind: "success"; data: Liveness } | Failure;
export type ReadyResult = { kind: "success"; data: Readiness } | { kind: "degraded"; data: Degraded } | Failure;
export type ConnectivityResult = { state: "ready" | "degraded" | "unreachable"; live: LiveResult; ready: ReadyResult };

async function readBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.headers.get("content-type")?.match(/^application\/json(?:;|$)/i) || !response.body) {
    throw new Error("invalid_response");
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) throw new Error("invalid_response");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

async function request(origin: string, endpoint: "live", signal: AbortSignal, fetcher: typeof fetch): Promise<LiveResult>;
async function request(origin: string, endpoint: "ready", signal: AbortSignal, fetcher: typeof fetch): Promise<ReadyResult>;
async function request(origin: string, endpoint: "live" | "ready", signal: AbortSignal, fetcher: typeof fetch): Promise<LiveResult | ReadyResult> {
  let received = false;
  try {
    signal.throwIfAborted();
    const response = await fetcher(`${origin}/health/${endpoint}`, {
      method: "GET", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }, signal,
    });
    received = true;
    signal.throwIfAborted();
    if (response.status !== 200 && !(endpoint === "ready" && response.status === 503)) {
      await response.body?.cancel();
      return { kind: "failure", reason: "http" };
    }
    const data = await readBody(response, signal);
    if (endpoint === "live" && response.status === 200 && exactObject(data, ["status"]) && data.status === "ok") {
      return { kind: "success", data: { status: data.status } satisfies Liveness };
    }
    if (endpoint === "ready" && response.status === 200 && exactObject(data, ["status", "database", "migrations"])
      && data.status === "ready" && data.database === "up" && data.migrations === "current") {
      return { kind: "success", data: { status: data.status, database: data.database, migrations: data.migrations } satisfies Readiness };
    }
    if (endpoint === "ready" && response.status === 503 && exactObject(data, ["status", "reason"])
      && data.status === "degraded" && (data.reason === "database_unavailable" || data.reason === "database_timeout" || data.reason === "migrations_pending")) {
      return { kind: "degraded", data: { status: data.status, reason: data.reason } satisfies Degraded };
    }
    return { kind: "failure", reason: "invalid_response" };
  } catch {
    return { kind: "failure", reason: signal.aborted ? (signal.reason === "timeout" ? "timeout" : "cancelled") : (received ? "invalid_response" : "network") };
  }
}

export async function checkConnectivity(origin: string, parentSignal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ConnectivityResult> {
  const controller = new AbortController();
  const cancel = () => controller.abort("cancelled");
  parentSignal.addEventListener("abort", cancel, { once: true });
  if (parentSignal.aborted) cancel();
  const timeout = setTimeout(() => controller.abort("timeout"), 5000);
  try {
    const [live, ready] = await Promise.all([
      request(origin, "live", controller.signal, fetcher),
      request(origin, "ready", controller.signal, fetcher),
    ]);
    return { state: live.kind !== "success" || ready.kind === "failure" ? "unreachable" : ready.kind === "degraded" ? "degraded" : "ready", live, ready };
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", cancel);
  }
}
