"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { checkConnectivity, type ConnectivityResult, type Degraded, type LiveResult, type ReadyResult } from "@/lib/api/health-client";
import styles from "./connectivity.module.css";

type View = { state: "idle" | "checking" } | (ConnectivityResult & { checkedAt: string });
const reasons: Record<Degraded["reason"], string> = {
  database_unavailable: "The API could not reach its database. Check the local API database configuration, then retry.",
  database_timeout: "The database check exceeded the API deadline. Check the local database, then retry.",
  migrations_pending: "The database migration history is not current. Review local migration status before retrying.",
};
const failures = {
  network: "No usable response. Check that the local API is running and allows this browser origin.",
  timeout: "No complete response within five seconds. Check the local API, then retry.",
  cancelled: "This check was cancelled. Retry for a fresh result.",
  invalid_response: "The API response did not match the health contract. Check the local API version, then retry.",
  http: "The API returned an unexpected HTTP status. Check the local API configuration, then retry.",
};

function indicator(result: LiveResult | ReadyResult | undefined, checking: boolean): string {
  if (!result) return checking ? "Checking" : "Not checked";
  if (result.kind === "failure") return "Unconfirmed";
  if (result.kind === "degraded") return "Degraded";
  return result.data.status === "ok" ? "Running" : "Ready · migrations current";
}

export function ConnectivityScreen({ apiOrigin }: { apiOrigin: string }) {
  const [view, setView] = useState<View>({ state: "idle" });
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  async function check() {
    if (active.current) return;
    const attempt = new AbortController();
    active.current = attempt;
    setView({ state: "checking" });
    try {
      const result = await checkConnectivity(apiOrigin, attempt.signal);
      if (active.current !== attempt || attempt.signal.aborted) return;
      setView({ ...result, checkedAt: new Date().toISOString() });
    } finally {
      if (active.current === attempt) active.current = null;
    }
  }

  const checking = view.state === "checking";
  const result = "checkedAt" in view ? view : undefined;
  const summary = {
    idle: "Not checked", checking: "Checking local connection…", ready: "Connection ready",
    degraded: "Database readiness degraded", unreachable: "Connection unconfirmed",
  }[view.state];

  return (
    <div className={styles.screen}>
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <nav aria-label="Local preview"><Link href="/application">Application preview</Link><Link href="/">Public home</Link></nav>
        <header className={styles.header}>
          <p className={styles.scope}>Local development only</p>
          <h1>Local connectivity</h1>
          <p>Check the API process and database separately. Nothing runs until you ask, and results describe only this local environment.</p>
        </header>
        <section className={styles.panel} aria-labelledby="connection-status">
          <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
            <h2 id="connection-status">{summary}</h2>
            <p>{view.state === "idle" ? "Start a check to request fresh liveness and readiness results." : checking ? "Previous results are cleared while both checks run." : view.state === "ready" ? "The API is running and its database migration history is current." : "Use the separate results below to identify the affected layer."}</p>
          </div>
          <div className={styles.indicators}>
            <section aria-labelledby="liveness-title">
              <h3 id="liveness-title">API process</h3>
              <p className={styles.result}>{indicator(result?.live, checking)}</p>
              <p>Liveness · GET /health/live</p>
              {result?.live.kind === "failure" ? <p className={styles.error}>{failures[result.live.reason]}</p> : null}
            </section>
            <section aria-labelledby="readiness-title">
              <h3 id="readiness-title">Database readiness</h3>
              <p className={styles.result}>{indicator(result?.ready, checking)}</p>
              <p>Readiness · GET /health/ready</p>
              {result?.ready.kind === "degraded" ? <p className={styles.error}>{reasons[result.ready.data.reason]}</p> : result?.ready.kind === "failure" ? <p className={styles.error}>{failures[result.ready.reason]}</p> : null}
            </section>
          </div>
          <div className={styles.actions}>
            <button type="button" aria-disabled={checking} onClick={() => { void check(); }}>{checking ? "Checking…" : view.state === "idle" ? "Check connection" : "Retry check"}</button>
            <p>{result ? <>Last checked: <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleTimeString()}</time></> : "No completed check in this view."}</p>
          </div>
        </section>
        <p className={styles.footnote}>Checks stop after five seconds or when you leave. No automatic retries, hosted access keys or business data. Local success does not establish hosted UI → API → DB connectivity.</p>
      </main>
    </div>
  );
}
