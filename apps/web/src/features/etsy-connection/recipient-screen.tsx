"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RecipientSecret } from "./recipient-secret";
import styles from "./etsy-connection.module.css";

export function EtsyRecipientScreen() {
  const [invitation] = useState(() => new RecipientSecret());
  const phase = useSyncExternalStore(invitation.subscribe, invitation.snapshot, invitation.serverSnapshot);
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = () => pending.current?.abort();
    window.addEventListener("pagehide", abort);
    return () => { abort(); window.removeEventListener("pagehide", abort); };
  }, []);

  async function start() {
    if (!confirmed || pending.current || phase !== "ready") return;
    const secret = invitation.claim();
    if (!secret) return;
    const controller = new AbortController();
    pending.current = controller;
    setWorking(true);
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]);
      const response = await fetch("/api/integrations/etsy/invite/start", {
        method: "POST", credentials: "omit", cache: "no-store", redirect: "error", signal,
        headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ secret }),
      });
      const value: unknown = await response.json();
      signal.throwIfAborted();
      if (response.status !== 200 || !value || typeof value !== "object" || Object.keys(value).length !== 1 || !("consentUrl" in value) || typeof value.consentUrl !== "string" || value.consentUrl.length > 4096) throw new Error("Invitation unavailable");
      const url = new URL(value.consentUrl);
      // The BFF binds the full consent contract to server-only configuration before returning this URL.
      if (!value.consentUrl.startsWith("https://www.etsy.com/oauth/connect?") || url.href !== value.consentUrl || url.origin !== "https://www.etsy.com" || url.pathname !== "/oauth/connect" || url.hash || url.username || url.password) throw new Error("Invitation unavailable");
      window.location.assign(url.href);
    } catch {
      if (!controller.signal.aborted) {
        setWorking(false);
        setMessage("This request could not be completed. It has not been retried. Ask the workspace Owner to check the invitation before sharing a new link.");
      }
    }
  }

  return <main id="main-content" className={`${styles.screen} ${styles.recipient}`}>
    <section className={styles.card} aria-labelledby="etsy-recipient-title">
      <h1 id="etsy-recipient-title">Connect your Etsy shop</h1>
      <p>Review access on Etsy only if you operate the intended shop and trust the person who shared this private invitation.</p>
      {working ? <p role="status">Preparing Etsy’s consent page… No request will retry automatically.</p> : phase === "checking" ? <p role="status">Checking this invitation link…</p> : phase === "ready" ? <form onSubmit={event => { event.preventDefault(); void start(); }}>
        <p>Lovora will request permission to read shop information. Opening this page does not connect a shop. You do not need to sign in to Lovora.</p>
        <label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I operate this shop and want to review its access request on Etsy.</label>
        <div className={styles.actions}><button type="submit" className={styles.primary} disabled={!confirmed}>Continue to Etsy</button></div>
      </form> : <p role="alert">{message || "This invitation is unavailable on this page. Ask the workspace Owner for a current private link. No connection has been established by opening this page."}</p>}
      {phase !== "checking" && <p className={styles.help}>The link was removed from the address bar. It is not saved in browser storage. Never share Etsy passwords or authorization codes in chat.</p>}
    </section>
  </main>;
}
