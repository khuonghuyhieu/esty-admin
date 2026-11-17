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
  routePending?: boolean;
  routePath?: ReturnPath;
}
export interface InitialSession { restore: boolean }
export interface RouteAdmission {
  path: ReturnPath;
  generation: string | null;
  restore: boolean;
  phase: "ready" | "forbidden" | "unavailable";
}
interface Context { generation: string; csrf: string }
const boundaryCodes: readonly SessionErrorCode[] = ["csrf_denied", "session_changed", "upstream_unavailable", "invalid_credentials", "rate_limited"];
const lockName = "lovora-app-session";
const nonce = /^[A-Za-z0-9_-]{43}$/;

export class SessionController {
  private epoch = 0;
  private routeEpoch = 0;
  private view: SessionView = { phase: "checking", me: null, generation: null, error: null };
  private lifecycle: AbortController | null = null;
  private channel: BroadcastChannel | null = null;
  private restorable: boolean;
  private requiresExplicitCheck = false;
  private notify: (view: SessionView) => void;
  private routeWork: { path: ReturnPath; generation: string; epoch: number; routeEpoch: number; promise: Promise<boolean> } | null = null;

  constructor(initial: InitialSession, notify: (view: SessionView) => void) {
    this.restorable = initial.restore;
    this.notify = notify;
  }

  start(validate = true): void {
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
    if (validate) void this.revalidate(this.restorable);
  }

  stop(): void {
    this.epoch++;
    this.lifecycle?.abort();
    this.lifecycle = null;
    this.channel?.close();
    this.channel = null;
  }

  private show(phase: SessionPhase, error: SessionErrorCode | null = null, me: AppMe | null = null, generation: string | null = null, providerOutcome?: "confirmed" | "unknown", routePath?: ReturnPath): void {
    this.view = { phase, error, me, generation, ...(providerOutcome ? { providerOutcome } : {}), ...(routePath ? { routePath } : {}) };
    this.notify(this.view);
  }

  invalidate(phase: "checking" | "changed" = "checking"): void {
    if (this.requiresExplicitCheck && phase === "checking") return;
    this.epoch++;
    this.show(phase);
  }

  beginRoute(): void {
    this.routeEpoch++;
    this.view = { ...this.view, routePending: true };
    this.notify(this.view);
  }

  prepareRoute(path: ReturnPath): Promise<boolean> {
    if (this.requiresExplicitCheck || this.view.phase !== "ready" || !this.view.generation) return Promise.resolve(false);
    const existing = this.routeWork;
    if (existing && existing.path === path && existing.generation === this.view.generation
      && existing.epoch === this.epoch && existing.routeEpoch === this.routeEpoch && this.view.routePending) return existing.promise;
    const generation = this.view.generation;
    const promise = this.revalidate(true, false, { path, generation, restore: true, phase: "ready" });
    this.routeWork = { path, generation, epoch: this.epoch, routeEpoch: this.routeEpoch, promise };
    return promise;
  }

  concealDeniedRoute(admission: RouteAdmission): void {
    if (admission.phase === "ready" || this.view.phase !== "ready"
      || admission.generation !== this.view.generation || this.requiresExplicitCheck) return;
    // A current denial is already authoritative; context verification must not prolong private chrome.
    this.routeEpoch += 1;
    this.show(admission.phase, admission.phase === "forbidden" ? "forbidden" : "upstream_unavailable");
  }

  async admitRoute(admission: RouteAdmission): Promise<boolean> {
    if (this.requiresExplicitCheck || ["signed-out", "signout-unconfirmed", "unsupported", "changed"].includes(this.view.phase)) return false;
    this.concealDeniedRoute(admission);
    const prepared = this.routeWork;
    if (admission.phase === "ready" && prepared?.path === admission.path
      && prepared.generation === admission.generation && prepared.epoch === this.epoch && prepared.routeEpoch === this.routeEpoch) {
      this.routeWork = null;
      const accepted = await prepared.promise;
      return accepted && prepared.epoch === this.epoch && prepared.routeEpoch === this.routeEpoch
        && this.view.phase === "ready" && this.view.generation === admission.generation;
    }
    const epoch = this.epoch;
    const routeEpoch = this.routeEpoch + 1;
    await this.revalidate(admission.restore, false, admission);
    return epoch === this.epoch && routeEpoch === this.routeEpoch
      && this.view.phase === "ready" && !this.view.routePending
      && this.view.generation === admission.generation;
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

  private async locked(action: (signal: AbortSignal, epoch: number) => Promise<void>, current = () => true): Promise<void> {
    const lifecycle = this.lifecycle;
    const epoch = this.epoch;
    if (!lifecycle) { this.show("unsupported"); return; }
    try {
      await navigator.locks.request(lockName, { mode: "exclusive", signal: lifecycle.signal }, async () => {
        if (epoch !== this.epoch || lifecycle.signal.aborted || !current()) return;
        await action(lifecycle.signal, epoch);
      });
    } catch (error) {
      if (epoch !== this.epoch || lifecycle.signal.aborted || !current()) return;
      const failure = error instanceof SessionFailure ? error : new SessionFailure(503, "upstream_unavailable");
      if (failure.status === 401) { this.restorable = false; this.show("signed-out", failure.code); }
      else if (failure.status === 403 && failure.code === "forbidden") { this.restorable = true; this.show("forbidden", failure.code); }
      else this.show("unavailable", failure.code);
    }
  }

  async revalidate(allowRefresh = this.restorable, explicit = false, admission?: RouteAdmission): Promise<boolean> {
    if (this.requiresExplicitCheck && !explicit) return false;
    this.requiresExplicitCheck = false;
    if (admission) this.beginRoute();
    else this.invalidate();
    const routeEpoch = this.routeEpoch;
    const authEpoch = this.epoch;
    const routeIsCurrent = () => routeEpoch === this.routeEpoch;
    await this.locked(async (signal, epoch) => {
      const contextRead = this.context(signal);
      // Both reads are inside the same origin-wide lock. A definitive failure
      // conceals immediately, even while context transport is held or unavailable.
      const meRead = !admission || admission.phase === "ready"
        ? this.request("/api/app/me", signal).then(
          value => ({ value, error: null }),
          (error: unknown) => {
            if (epoch === this.epoch && routeIsCurrent() && !signal.aborted) {
              const failure = error instanceof SessionFailure ? error : new SessionFailure(503, "upstream_unavailable");
              this.show(failure.status === 401 ? "checking" : failure.status === 403 && failure.code === "forbidden" ? "forbidden" : "unavailable", failure.code);
            }
            return { value: null, error };
          },
        )
        : Promise.resolve({ value: null, error: null });
      const [context, result] = await Promise.all([contextRead, meRead]);
      if (epoch !== this.epoch || !routeIsCurrent()) return;
      if (admission) {
        if (admission.generation !== context.generation) {
          this.requiresExplicitCheck = true;
          this.invalidate("changed");
          return;
        }
        if (admission.phase === "forbidden") throw new SessionFailure(403, "forbidden");
        if (admission.phase === "unavailable") throw new SessionFailure(503, "upstream_unavailable");
      }
      let me: unknown;
      // Cached RSC/history payloads never substitute for a current admission check.
      try {
        if (result.error) throw result.error;
        me = result.value;
      }
      catch (error) {
        if (!(error instanceof SessionFailure) || error.status !== 401 || !allowRefresh || epoch !== this.epoch || !routeIsCurrent()) throw error;
        // Expiry is an actual loss of admission, not ordinary route loading.
        this.show("checking");
        try {
          const refreshed = await this.request("/api/auth/refresh", signal, context);
          me = refreshed && typeof refreshed === "object" && "me" in refreshed ? refreshed.me : null;
        } catch (failure) {
          if (!(failure instanceof SessionFailure) || failure.status !== 401) throw failure;
          if (epoch !== this.epoch || signal.aborted || !routeIsCurrent()) return;
          const current = await this.context(signal);
          if (epoch !== this.epoch || signal.aborted || !routeIsCurrent()) return;
          if (current.generation !== context.generation) {
            this.requiresExplicitCheck = true;
            this.invalidate("changed");
            return;
          }
          // Failed refresh stays cookieless; only this locked, still-current transition may reset.
          await this.request("/api/auth/begin", signal, current);
          if (epoch !== this.epoch || signal.aborted || !routeIsCurrent()) return;
          this.changed();
          throw failure;
        }
      }
      if (epoch !== this.epoch || !routeIsCurrent()) return;
      if (!isAppMe(me)) throw new SessionFailure(503, "upstream_unavailable");
      this.restorable = true;
      this.show("ready", null, me, context.generation, undefined, admission?.path);
    }, routeIsCurrent);
    return authEpoch === this.epoch && routeIsCurrent() && this.view.phase === "ready";
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
