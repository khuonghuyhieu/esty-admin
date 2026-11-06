import { isAppError, isAppMe, type AppMe } from "./model.ts";
import { SessionFailure, type SessionErrorCode } from "./errors.ts";
import type { ReturnPath } from "./config.ts";

export type SessionPhase = "checking" | "ready" | "signed-out" | "forbidden" | "unavailable" | "unsupported" | "changed" | "signout-unconfirmed";
export interface SessionView {
  phase: SessionPhase;
  me: AppMe | null;
  generation: string | null;
  error: SessionErrorCode | null;
  providerOutcome?: "confirmed" | "unknown";
}
export interface InitialSession { restore: boolean }
interface Context { generation: string; csrf: string }
const boundaryCodes: readonly SessionErrorCode[] = ["csrf_denied", "session_changed", "upstream_unavailable", "invalid_credentials", "rate_limited"];
const lockName = "lovora-app-session";
const nonce = /^[A-Za-z0-9_-]{43}$/;

export class SessionController {
  private epoch = 0;
  private lifecycle: AbortController | null = null;
  private channel: BroadcastChannel | null = null;
  private restorable: boolean;
  private requiresExplicitCheck = false;
  private notify: (view: SessionView) => void;

  constructor(initial: InitialSession, notify: (view: SessionView) => void) {
    this.restorable = initial.restore;
    this.notify = notify;
  }

  start(): void {
    if (!window.isSecureContext || !navigator.locks || typeof BroadcastChannel === "undefined") {
      this.show("unsupported");
      return;
    }
    this.lifecycle = new AbortController();
    this.channel = new BroadcastChannel(lockName);
    this.channel.onmessage = event => {
      const message = event.data;
      if (!message || typeof message !== "object" || !["invalidate", "changed"].includes(message.type)
        || Object.keys(message).some(key => !["type", "generation"].includes(key))
        || (message.generation !== undefined && !nonce.test(message.generation))) return;
      // Invalidation is not an admission acknowledgement; an older completion must not undo logout intent.
      this.requiresExplicitCheck = true;
      this.invalidate("changed");
    };
    void this.revalidate(this.restorable);
  }

  stop(): void {
    this.epoch++;
    this.lifecycle?.abort();
    this.lifecycle = null;
    this.channel?.close();
    this.channel = null;
  }

  private show(phase: SessionPhase, error: SessionErrorCode | null = null, me: AppMe | null = null, generation: string | null = null, providerOutcome?: "confirmed" | "unknown"): void {
    this.notify({ phase, error, me, generation, ...(providerOutcome ? { providerOutcome } : {}) });
  }

  invalidate(phase: "checking" | "changed" = "checking"): void {
    if (this.requiresExplicitCheck && phase === "checking") return;
    this.epoch++;
    this.show(phase);
  }

  private changed(generation?: string): void {
    this.channel?.postMessage({ type: "changed", ...(generation ? { generation } : {}) });
  }

  private async request(path: string, signal: AbortSignal, context?: Context, body?: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(path, {
      method: context ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
      headers: context ? { "content-type": "application/json", "x-csrf-token": context.csrf } : { accept: "application/json" },
      ...(context ? { body: JSON.stringify({ ...body, generation: context.generation }) } : {}),
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      if (isAppError(value)) throw new SessionFailure(response.status, value.code, value.requestId);
      if (value && typeof value === "object" && "code" in value && boundaryCodes.includes(value.code as SessionErrorCode)) throw new SessionFailure(response.status, value.code as SessionErrorCode);
      throw new SessionFailure(503, "upstream_unavailable");
    }
    return value;
  }

  private async context(signal: AbortSignal): Promise<Context> {
    const value = await this.request("/api/auth/context", signal);
    if (!value || typeof value !== "object" || Object.keys(value).length !== 2
      || !("generation" in value) || typeof value.generation !== "string" || !nonce.test(value.generation)
      || !("csrf" in value) || typeof value.csrf !== "string" || !nonce.test(value.csrf)) throw new SessionFailure(503, "upstream_unavailable");
    return value as Context;
  }

  private async locked(action: (signal: AbortSignal, epoch: number) => Promise<void>): Promise<void> {
    const lifecycle = this.lifecycle;
    const epoch = this.epoch;
    if (!lifecycle) { this.show("unsupported"); return; }
    try {
      await navigator.locks.request(lockName, { mode: "exclusive", signal: lifecycle.signal }, async () => {
        if (epoch !== this.epoch || lifecycle.signal.aborted) return;
        await action(lifecycle.signal, epoch);
      });
    } catch (error) {
      if (epoch !== this.epoch || lifecycle.signal.aborted) return;
      const failure = error instanceof SessionFailure ? error : new SessionFailure(503, "upstream_unavailable");
      if (failure.status === 401) { this.restorable = false; this.show("signed-out", failure.code); }
      else if (failure.status === 403 && failure.code === "forbidden") { this.restorable = true; this.show("forbidden", failure.code); }
      else this.show("unavailable", failure.code);
    }
  }

  async revalidate(allowRefresh = this.restorable, explicit = false): Promise<void> {
    if (this.requiresExplicitCheck && !explicit) return;
    this.requiresExplicitCheck = false;
    this.invalidate();
    await this.locked(async (signal, epoch) => {
      const context = await this.context(signal);
      let me: unknown;
      // Cached RSC/history payloads never substitute for a current admission check.
      try { me = await this.request("/api/app/me", signal); }
      catch (error) {
        if (!(error instanceof SessionFailure) || error.status !== 401 || !allowRefresh || epoch !== this.epoch) throw error;
        try {
          const refreshed = await this.request("/api/auth/refresh", signal, context);
          me = refreshed && typeof refreshed === "object" && "me" in refreshed ? refreshed.me : null;
        } catch (failure) {
          if (!(failure instanceof SessionFailure) || failure.status !== 401) throw failure;
          if (epoch !== this.epoch || signal.aborted) return;
          const current = await this.context(signal);
          if (epoch !== this.epoch || signal.aborted) return;
          if (current.generation !== context.generation) {
            this.requiresExplicitCheck = true;
            this.invalidate("changed");
            return;
          }
          // Failed refresh stays cookieless; only this locked, still-current transition may reset.
          await this.request("/api/auth/begin", signal, current);
          if (epoch !== this.epoch || signal.aborted) return;
          this.changed();
          throw failure;
        }
      }
      if (epoch !== this.epoch) return;
      if (!isAppMe(me)) throw new SessionFailure(503, "upstream_unavailable");
      this.restorable = true;
      this.show("ready", null, me, context.generation);
    });
  }

  async signIn(email: string, password: string, returnTo: ReturnPath): Promise<void> {
    this.requiresExplicitCheck = false;
    this.invalidate();
    this.restorable = false;
    this.channel?.postMessage({ type: "invalidate" });
    await this.locked(async (signal, epoch) => {
      const current = await this.context(signal);
      const begun = await this.request("/api/auth/begin", signal, current);
      if (!begun || typeof begun !== "object" || !("generation" in begun) || !("csrf" in begun)
        || typeof begun.generation !== "string" || !nonce.test(begun.generation) || typeof begun.csrf !== "string" || !nonce.test(begun.csrf)) throw new SessionFailure(503, "upstream_unavailable");
      if (epoch !== this.epoch) return;
      const context = begun as Context;
      try {
        const value = await this.request("/api/auth/login", signal, context, { email, password, returnTo });
        if (epoch !== this.epoch) return;
        if (!value || typeof value !== "object" || !("me" in value) || !isAppMe(value.me)) throw new SessionFailure(503, "upstream_unavailable");
        this.restorable = true;
        this.show("ready", null, value.me, context.generation);
      } finally {
        if (epoch === this.epoch) this.changed(context.generation);
      }
    });
  }

  async signOut(): Promise<void> {
    this.requiresExplicitCheck = false;
    this.invalidate();
    this.requiresExplicitCheck = true;
    this.restorable = false;
    this.channel?.postMessage({ type: "invalidate" });
    await this.locked(async (signal, epoch) => {
      try {
        const context = await this.context(signal);
        const result = await this.request("/api/auth/logout", signal, context);
        if (epoch !== this.epoch) return;
        if (!result || typeof result !== "object" || !("localCleared" in result) || result.localCleared !== true
          || !("providerOutcome" in result) || !["confirmed", "unknown"].includes(String(result.providerOutcome))) throw new SessionFailure(503, "upstream_unavailable");
        this.requiresExplicitCheck = false;
        this.show("signed-out", null, null, null, result.providerOutcome as "confirmed" | "unknown");
        this.changed();
      } catch {
        if (epoch === this.epoch && !signal.aborted) this.show("signout-unconfirmed");
      }
    });
  }
}
