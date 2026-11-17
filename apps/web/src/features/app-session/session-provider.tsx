"use client";

import { createContext, startTransition, useCallback, useContext, useEffectEvent, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SessionController, type InitialSession, type RouteAdmission, type SessionView } from "./session-controller";
import type { ReturnPath } from "./config";
import { subscribeHistoryNavigation } from "./history-navigation";
import styles from "../workspace-foundation/workspace-foundation.module.css";

type RoutePreparation = { path: ReturnPath; result: Promise<boolean> };
interface SessionActions {
  view: SessionView;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  revalidate: () => Promise<void>;
  navigate: (path: ReturnPath) => void;
  navigationPending: boolean;
  navigationId: number;
  routePreparation: RoutePreparation | null;
  concealDeniedRoute: (admission: RouteAdmission) => void;
  admitRoute: (admission: RouteAdmission) => Promise<boolean>;
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
  const pathname = usePathname();
  const destination = mode === "protected" ? (pathname === "/settings" || pathname === "/settings/team" ? pathname : "/application") : returnTo;
  const [view, setView] = useState<SessionView>(checking);
  const controller = useRef<SessionController | null>(null);
  const [navigationPending, startNavigation] = useTransition();
  const [navigationId, setNavigationId] = useState(0);
  const [routePreparation, setRoutePreparation] = useState<RoutePreparation | null>(null);
  const privateContent = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (privateContent.current) privateContent.current.hidden = view.phase !== "ready";
  }, [view]);
  const currentPath = useRef(pathname);
  useLayoutEffect(() => { currentPath.current = pathname; }, [pathname]);
  const restore = initial.restore;
  const onView = useEffectEvent((next: SessionView) => {
    // Conceal synchronously before page freezing or a concurrent React commit.
    if (privateContent.current && next.phase !== "ready") privateContent.current.hidden = true;
    // Reveal identity and body together; an imperative unhide exposes pre-commit geometry.
    if (next.phase === "ready" && next.routePath) startTransition(() => setView(next));
    else setView(next);
    if (mode === "login" && next.phase === "ready") { router.replace(destination); router.refresh(); }
    if (mode === "protected" && next.phase === "signed-out" && next.error) {
      router.replace(`/login?returnTo=${encodeURIComponent(destination)}`);
    }
  });

  useLayoutEffect(() => {
    const current = new SessionController({ restore }, next => onView(next));
    controller.current = current;
    const visibility = () => {
      if (document.visibilityState === "visible") void current.resume();
    };
    const hide = () => current.suspend();
    const show = (event: PageTransitionEvent) => { if (event.persisted) void current.resume(); };
    const history = () => {
      // Join Next's restoration transition before it renders a cached destination.
      const path = window.location.pathname;
      if (currentPath.current === path) return;
      currentPath.current = path;
      if (mode === "protected" && (path === "/application" || path === "/settings" || path === "/settings/team")) {
        setNavigationId(id => id + 1);
        const admission = current.prepareRoute(path);
        setRoutePreparation({ path, result: admission });
        startNavigation(async () => { await admission; });
      } else if (mode === "protected") current.beginRoute();
      else void current.resume();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    const unsubscribeHistory = subscribeHistoryNavigation(history);
    current.start(mode === "login");
    return () => {
      current.stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      unsubscribeHistory();
      if (controller.current === current) controller.current = null;
    };
  }, [mode, restore, router, startNavigation]);

  const unavailable = useCallback(() => setView({ ...checking, phase: "unsupported" }), []);
  const signIn = useCallback(async (email: string, password: string) => {
    if (controller.current) await controller.current.signIn(email, password, destination);
    else unavailable();
  }, [destination, unavailable]);
  const signOut = useCallback(async () => {
    if (controller.current) await controller.current.signOut();
    else unavailable();
  }, [unavailable]);
  const revalidate = useCallback(async () => {
    if (controller.current) {
      const admitted = await controller.current.revalidate(undefined, true);
      if (admitted && mode === "protected") router.refresh();
    } else unavailable();
  }, [mode, router, unavailable]);
  const navigate = useCallback((path: ReturnPath) => {
    const current = controller.current;
    if (!current) return;
    setNavigationId(id => id + 1);
    const admission = current.prepareRoute(path);
    setRoutePreparation({ path, result: admission });
    startNavigation(async () => {
      router.push(path);
      await admission;
    });
  }, [router]);
  const concealDeniedRoute = useCallback((admission: RouteAdmission) => controller.current?.concealDeniedRoute(admission), []);
  const admitRoute = useCallback(async (admission: RouteAdmission) => controller.current?.admitRoute(admission) ?? false, []);
  const actions: SessionActions = { view, signIn, signOut, revalidate, navigate, navigationPending, navigationId, routePreparation, concealDeniedRoute, admitRoute };
  return <SessionContext value={actions}>
    {mode === "login" ? children : <>
      <div ref={privateContent} hidden={view.phase !== "ready"}>{children}</div>
      {view.phase !== "ready" && <SessionGate returnTo={destination} />}
    </>}
  </SessionContext>;
}
