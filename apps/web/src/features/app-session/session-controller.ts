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
  revalidating?: boolean;
}
export interface InitialSession { restore: boolean }
export interface RouteAdmission {
  path: ReturnPath;
  generation: string | null;
  restore: boolean;
  phase: "ready" | "forbidden" | "unavailable";
}
interface Context { generation: string; csrf: string }
interface DisplayBinding { epoch: number; generation: string; userId: string; workspaceId: string }
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
  private routeWork: { path: ReturnPath; generation: string | null; epoch: number; routeEpoch: number; promise: Promise<boolean> } | null = null;
  private readWork: { epoch: number; generation: string | null; promise: Promise<boolean> } | null = null;
  private binding: DisplayBinding | null = null;
  private suspendedBinding: DisplayBinding | null = null;
  private verifiedAt: number | null = null;

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
    this.routeWork = null;
    this.readWork = null;
    this.binding = null;
    this.suspendedBinding = null;
    this.verifiedAt = null;
    this.view = { phase: "checking", me: null, generation: null, error: null };
    this.lifecycle?.abort();
    this.lifecycle = null;
    this.channel?.close();
    this.channel = null;
  }

  private show(phase: SessionPhase, error: SessionErrorCode | null = null, me: AppMe | null = null, generation: string | null = null, providerOutcome?: "confirmed" | "unknown", routePath?: ReturnPath): void {
    if (phase !== "ready") {
      this.binding = null;
      this.verifiedAt = null;
      this.suspendedBinding = null;
    }
    this.view = { phase, error, me, generation, ...(providerOutcome ? { providerOutcome } : {}), ...(routePath ? { routePath } : {}) };
    this.notify(this.view);
  }

  private showVerified(me: AppMe, context: Context, routePath?: ReturnPath): void {
    this.binding = { epoch: this.epoch, generation: context.generation, userId: me.profile.userId, workspaceId: me.workspace.id };
    this.verifiedAt = performance.now();
    this.suspendedBinding = null;
    this.show("ready", null, me, context.generation, undefined, routePath);
  }

  private freshDisplay(): boolean {
    const age = this.verifiedAt === null ? -1 : performance.now() - this.verifiedAt;
    return !this.requiresExplicitCheck && this.view.phase === "ready" && age >= 0 && age < 60000
      && this.binding?.epoch === this.epoch && this.binding.generation === this.view.generation
      && this.binding.userId === this.view.me?.profile.userId && this.binding.workspaceId === this.view.me?.workspace.id;
  }

  suspend(): void {
    const binding = this.binding ?? this.suspendedBinding;
    this.invalidate();
    this.suspendedBinding = binding;
  }

  resume(): Promise<boolean> {
    if (this.requiresExplicitCheck) return Promise.resolve(false);
    if (this.readWork?.epoch === this.epoch) return this.readWork.promise;
    if (this.freshDisplay()) return Promise.resolve(true);
    if (this.view.phase !== "ready" && !this.suspendedBinding) return Promise.resolve(false);
    return this.revalidate();
  }

  invalidate(phase: "checking" | "changed" = "checking"): void {
    if (this.requiresExplicitCheck && phase === "checking") return;
    this.epoch++;
    this.routeEpoch++;
    this.routeWork = null;
    this.readWork = null;
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
    return this.prepareAdmission({ path, generation: this.view.generation, restore: true, phase: "ready" });
  }

  private prepareAdmission(admission: RouteAdmission): Promise<boolean> {
    this.beginRoute();
    const epoch = this.epoch;
    const routeEpoch = this.routeEpoch;
    const validation = admission.phase === "ready" && !this.readWork && this.freshDisplay()
      ? Promise.resolve(true) : this.revalidate(admission.restore, false, admission);
    const promise = validation.then(accepted => {
      if (!accepted || epoch !== this.epoch || routeEpoch !== this.routeEpoch
        || this.view.phase !== "ready" || this.view.generation !== admission.generation) return false;
      this.show("ready", null, this.view.me, this.view.generation, undefined, admission.path);
      return true;
    });
    this.routeWork = { path: admission.path, generation: admission.generation, epoch, routeEpoch, promise };
    return promise;
  }

  concealDeniedRoute(admission: RouteAdmission): void {
    if (admission.phase === "ready" || this.view.phase !== "ready"
      || admission.generation !== this.view.generation || this.requiresExplicitCheck) return;
    // A current denial is already authoritative; context verification must not prolong private chrome.
    this.epoch++;
    this.routeEpoch++;
    this.routeWork = null;
    this.readWork = null;
    this.show(admission.phase, admission.phase === "forbidden" ? "forbidden" : "upstream_unavailable");
  }

  async admitRoute(admission: RouteAdmission): Promise<boolean> {
    if (this.requiresExplicitCheck || ["signed-out", "signout-unconfirmed", "unsupported", "changed"].includes(this.view.phase)) return false;
    if (this.view.generation && admission.generation !== this.view.generation) {
      this.requiresExplicitCheck = true;
      this.invalidate("changed");
      return false;
    }
    this.concealDeniedRoute(admission);
    const prepared = this.routeWork;
    if (admission.phase === "ready" && prepared?.path === admission.path
      && prepared.generation === admission.generation && prepared.epoch === this.epoch && prepared.routeEpoch === this.routeEpoch) {
      this.routeWork = null;
      const accepted = await prepared.promise;
      return accepted && prepared.epoch === this.epoch && prepared.routeEpoch === this.routeEpoch
        && this.view.phase === "ready" && this.view.generation === admission.generation;
    }
    return this.prepareAdmission(admission);
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
      if (isAppError(value, response.status)) throw new SessionFailure(response.status, value.code, value.requestId, value.retryAfterSeconds);
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

  private async locked(action: (signal: AbortSignal, epoch: number) => Promise<void>, current = () => true, deadline?: AbortSignal): Promise<void> {
    const lifecycle = this.lifecycle;
    const epoch = this.epoch;
    if (!lifecycle) { this.show("unsupported"); return; }
    const signal = deadline ? AbortSignal.any([lifecycle.signal, deadline]) : lifecycle.signal;
    try {
      await navigator.locks.request(lockName, { mode: "exclusive", signal }, async () => {
        if (epoch !== this.epoch || lifecycle.signal.aborted || !current()) return;
        signal.throwIfAborted();
        await action(signal, epoch);
        signal.throwIfAborted();
      });
    } catch (error) {
      if (epoch !== this.epoch || lifecycle.signal.aborted || !current()) return;
      const failure = error instanceof SessionFailure ? error : new SessionFailure(503, "upstream_unavailable");
      if (failure.status === 401) { this.restorable = false; this.show("signed-out", failure.code); }
      else if (failure.status === 403 && failure.code === "forbidden") { this.restorable = true; this.show("forbidden", failure.code); }
      else this.show("unavailable", failure.code);
    }
  }

  revalidate(allowRefresh = this.restorable, explicit = false, admission?: RouteAdmission): Promise<boolean> {
    if (this.requiresExplicitCheck && !explicit) return Promise.resolve(false);
    if (this.requiresExplicitCheck) {
      this.requiresExplicitCheck = false;
      this.invalidate();
    }
    const binding = this.binding ?? this.suspendedBinding;
    const generation = admission?.generation ?? binding?.generation ?? null;
    const existing = this.readWork;
    if (existing?.epoch === this.epoch) {
      if (generation === null || existing.generation === generation) return existing.promise;
      this.requiresExplicitCheck = true;
      this.invalidate("changed");
      return Promise.resolve(false);
    }
    const authEpoch = this.epoch;
    const displayedPath = this.view.routePath;
    if (this.view.phase === "ready") {
      this.view = { ...this.view, revalidating: true };
      this.notify(this.view);
    } else if (!admission || admission.phase === "ready") this.show("checking");
    const current = () => authEpoch === this.epoch && this.readWork?.promise === promise;
    const promise: Promise<boolean> = this.locked(async (signal, epoch) => {
      const contextRead = this.context(signal);
      // A known failure conceals immediately, even while the other read is held.
      const meRead = !admission || admission.phase === "ready"
        ? this.request("/api/app/me", signal).then(
          value => ({ value, error: null }),
          (error: unknown) => {
            if (current() && !signal.aborted) {
              const failure = error instanceof SessionFailure ? error : new SessionFailure(503, "upstream_unavailable");
              this.show(failure.status === 401 ? "checking" : failure.status === 403 && failure.code === "forbidden" ? "forbidden" : "unavailable", failure.code);
            }
            return { value: null, error };
          },
        )
        : Promise.resolve({ value: null, error: null });
      const [context, result] = await Promise.all([contextRead, meRead]);
      if (!current()) return;
      if (generation !== null && generation !== context.generation) {
        this.requiresExplicitCheck = true;
        this.invalidate("changed");
        return;
      }
      if (admission?.phase === "forbidden") throw new SessionFailure(403, "forbidden");
      if (admission?.phase === "unavailable") throw new SessionFailure(503, "upstream_unavailable");
      let me: unknown;
      try {
        if (result.error) throw result.error;
        me = result.value;
      } catch (error) {
        if (!(error instanceof SessionFailure) || error.status !== 401 || !allowRefresh || !current()) throw error;
        this.show("checking");
        const refreshContext = await this.context(signal);
        if (!current() || signal.aborted) return;
        if (refreshContext.generation !== context.generation) {
          this.requiresExplicitCheck = true;
          this.invalidate("changed");
          return;
        }
        try {
          const refreshed = await this.request("/api/auth/refresh", signal, refreshContext);
          me = refreshed && typeof refreshed === "object" && "me" in refreshed ? refreshed.me : null;
        } catch (failure) {
          if (!(failure instanceof SessionFailure) || failure.status !== 401) throw failure;
          if (!current() || signal.aborted) return;
          const contextNow = await this.context(signal);
          if (!current() || signal.aborted) return;
          if (contextNow.generation !== context.generation) {
            this.requiresExplicitCheck = true;
            this.invalidate("changed");
            return;
          }
          // Failed refresh stays cookieless; only this locked, still-current transition may reset.
          await this.request("/api/auth/begin", signal, contextNow);
          if (!current() || signal.aborted) return;
          this.changed();
          throw failure;
        }
      }
      if (!current() || epoch !== this.epoch) return;
      if (!isAppMe(me)) throw new SessionFailure(503, "upstream_unavailable");
      if (binding && (binding.userId !== me.profile.userId || binding.workspaceId !== me.workspace.id)) {
        this.requiresExplicitCheck = true;
        this.invalidate("changed");
        return;
      }
      this.restorable = true;
      this.showVerified(me, context, displayedPath);
    }, current, AbortSignal.timeout(9000)).then(() => authEpoch === this.epoch && this.view.phase === "ready").finally(() => {
      if (this.readWork?.promise === promise) this.readWork = null;
    });
    this.readWork = { epoch: authEpoch, generation, promise };
    return promise;
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
      const context = await this.context(signal);
      if (epoch !== this.epoch || signal.aborted) return;
      if (context.generation !== begun.generation) {
        this.requiresExplicitCheck = true;
        this.invalidate("changed");
        return;
      }
      try {
        const value = await this.request("/api/auth/login", signal, context, { email, password, returnTo });
        if (epoch !== this.epoch) return;
        if (!value || typeof value !== "object" || !("me" in value) || !isAppMe(value.me)) throw new SessionFailure(503, "upstream_unavailable");
        this.restorable = true;
        this.showVerified(value.me, context);
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
