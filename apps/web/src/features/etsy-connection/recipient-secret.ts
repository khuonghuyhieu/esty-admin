import { invitationSecret } from "./recipient-model.ts";

type Phase = "checking" | "ready" | "unavailable";

// Per-mounted-page capability, never storage, component props, or a module singleton.
export class RecipientSecret {
  #secret: string | null = null;
  #phase: Phase = "checking";
  #listeners = new Set<() => void>();
  snapshot = (): Phase => this.#phase;
  serverSnapshot = (): Phase => "checking";
  #notify() { for (const listener of this.#listeners) listener(); }
  #scrub = () => {
    if (window.location.pathname === "/integrations/etsy/invite") window.history.replaceState(window.history.state, "", window.location.pathname);
  };
  #discard = () => {
    this.#secret = null; this.#phase = "unavailable"; this.#notify();
  };
  #urlChanged = () => { this.#discard(); this.#scrub(); };
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    if (this.#phase === "checking") {
      const fragment = window.location.hash.slice(1);
      const valid = window.location.pathname === "/integrations/etsy/invite" && !window.location.search && invitationSecret.test(fragment);
      this.#scrub();
      this.#secret = valid ? fragment : null;
      this.#phase = valid ? "ready" : "unavailable";
      this.#notify();
    }
    window.addEventListener("pagehide", this.#discard);
    window.addEventListener("hashchange", this.#urlChanged);
    window.addEventListener("popstate", this.#urlChanged);
    return () => {
      this.#listeners.delete(listener);
      window.removeEventListener("pagehide", this.#discard);
      window.removeEventListener("hashchange", this.#urlChanged);
      window.removeEventListener("popstate", this.#urlChanged);
      // Preserve same-turn Strict Mode resubscription, not a cached route's unmounted capability.
      queueMicrotask(() => { if (this.#listeners.size === 0) this.#discard(); });
    };
  };
  claim(): string | null {
    const value = this.#secret;
    this.#secret = null; this.#phase = "unavailable"; this.#notify();
    return value;
  }
}
