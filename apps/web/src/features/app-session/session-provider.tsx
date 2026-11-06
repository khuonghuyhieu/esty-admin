"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SessionController, type InitialSession, type SessionView } from "./session-controller";
import type { ReturnPath } from "./config";
import styles from "../workspace-foundation/workspace-foundation.module.css";

interface SessionActions {
  view: SessionView;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  revalidate: () => Promise<void>;
}
const SessionContext = createContext<SessionActions | null>(null);
const checking: SessionView = { phase: "checking", me: null, generation: null, error: null };

export function useAppSession(): SessionActions {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Application session provider is required");
  return session;
}

export function SessionMessage() {
  const { view } = useAppSession();
  let message = "";
  if (view.phase === "checking") message = "Checking your session…";
  else if (view.phase === "unsupported") message = "This browser cannot safely manage sessions. Use a current browser with Web Locks and BroadcastChannel enabled.";
  else if (view.phase === "forbidden") message = "Access is unavailable for this workspace. You can sign out or use a different account.";
  else if (view.phase === "changed") message = "Your session changed in another tab. Check your session to continue.";
  else if (view.phase === "signout-unconfirmed") message = "Sign-out was not confirmed. Private content is hidden. Try signing out again.";
  else if (view.error === "invalid_credentials") message = "Email or password is incorrect.";
  else if (view.error === "rate_limited") message = "Too many attempts. Wait before trying again.";
  else if (view.error === "invalid_request") message = "Browser session data is invalid. Clear this site's cookies and sign in again.";
  else if (view.error === "csrf_denied" || view.error === "session_changed") message = "Session verification failed. Reload this page before trying again.";
  else if (view.phase === "unavailable") message = "The session service is temporarily unavailable. Your access has not been confirmed. Try again.";
  else if (view.providerOutcome === "confirmed") message = "Signed out. This session was revoked.";
  else if (view.providerOutcome === "unknown") message = "Signed out on this browser. Provider revocation could not be confirmed.";
  if (!message) return null;
  return <p role={view.error || view.phase === "signout-unconfirmed" ? "alert" : "status"} className={styles.sessionMessage}>{message}</p>;
}

function SessionGate({ returnTo }: { returnTo: ReturnPath }) {
  const { view, revalidate, signOut } = useAppSession();
  return <main id="main-content" tabIndex={-1} className={styles.login}>
    <section className={styles.loginCard} aria-labelledby="session-heading">
      <h1 id="session-heading">{view.phase === "signed-out" ? "Signed out" : "Your session"}</h1>
      <SessionMessage />
      <div className={styles.sessionActions}>
        {["changed", "unavailable"].includes(view.phase) && view.error !== "invalid_request" && <button type="button" onClick={() => void revalidate()}>Check session</button>}
        {["forbidden", "signout-unconfirmed", "unavailable"].includes(view.phase) && <button type="button" onClick={() => void signOut()}>Sign out</button>}
        {view.phase !== "checking" && <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} prefetch={false}>Go to sign in</Link>}
      </div>
    </section>
  </main>;
}

export function SessionProvider({ children, initial, mode = "protected", returnTo = "/application" }: { children: ReactNode; initial: InitialSession; mode?: "protected" | "login"; returnTo?: ReturnPath }) {
  const router = useRouter();
  const [view, setView] = useState<SessionView>(checking);
  const controller = useRef<SessionController | null>(null);
  const privateContent = useRef<HTMLDivElement>(null);
  const restore = initial.restore;

  useEffect(() => {
    const current = new SessionController({ restore }, next => {
      // Synchronous concealment also covers page freezing before React commits.
      if (privateContent.current) privateContent.current.hidden = next.phase !== "ready";
      setView(next);
      if (mode === "login" && next.phase === "ready") { router.replace(returnTo); router.refresh(); }
    });
    controller.current = current;
    const visibility = () => {
      if (document.visibilityState === "hidden") current.invalidate();
      else void current.revalidate();
    };
    const hide = () => current.invalidate();
    const show = (event: PageTransitionEvent) => { if (event.persisted) void current.revalidate(); };
    const history = () => { current.invalidate(); void current.revalidate(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    window.addEventListener("popstate", history);
    current.start();
    return () => {
      current.stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("popstate", history);
      if (controller.current === current) controller.current = null;
    };
  }, [mode, restore, returnTo, router]);

  const unavailable = () => setView({ ...checking, phase: "unsupported" });
  const actions: SessionActions = {
    view,
    signIn: async (email, password) => { if (controller.current) await controller.current.signIn(email, password, returnTo); else unavailable(); },
    signOut: async () => { if (controller.current) await controller.current.signOut(); else unavailable(); },
    revalidate: async () => { if (controller.current) await controller.current.revalidate(undefined, true); else unavailable(); },
  };
  return <SessionContext value={actions}>
    {mode === "login" ? children : <>
      <div ref={privateContent} hidden={view.phase !== "ready"}>{view.phase === "ready" ? children : null}</div>
      {view.phase !== "ready" && <SessionGate returnTo={returnTo} />}
    </>}
  </SessionContext>;
}
