"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppSession } from "../app-session/session-provider";
import type { Connection, CreatedInvitation, Invitation } from "./model";
import { useEtsyConnection } from "./use-etsy-connection";
import { CreateInvitationForm } from "./create-invitation-form";
import styles from "./etsy-connection.module.css";

const labels: Record<Connection["state"], string> = { unconnected: "Not connected", verification_pending: "Pending consent", active: "Connected", reconnect_required: "Reconnect required", refresh_unknown: "Outcome unknown", disconnected: "Disconnected locally" };
const notes: Record<Connection["state"], string> = {
  unconnected: "Find a public shop, then create an invitation. Only explicit recipient consent can establish a connection.",
  verification_pending: "Waiting for consent. Creating or copying an invitation does not connect a shop.",
  active: "Saved authenticated status only. This does not prove current shop access. Sync shop info is a separate explicit request.",
  reconnect_required: "New consent is required for the same shop. The intended binding survives cancellation; access is not automatically restored.",
  refresh_unknown: "The outcome is unknown. Do not assume access is active or retry a token exchange. New consent is a separate action.",
  disconnected: "Disconnected locally. The intended shop binding remains. This does not confirm revocation on Etsy.",
};
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
type DialogState = { kind: "create" | "details" | "result" | "disconnect" } | { kind: "inspect" | "cancel"; invitation: Invitation };
const titles: Record<DialogState["kind"], string> = { create: "Create invitation", details: "Connection details", result: "Invitation created", inspect: "Invitation details", cancel: "Cancel invitation?", disconnect: "Disconnect shop?" };
function SavedTime({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{dateFormat.format(new Date(value))} UTC</time> : <>No observation yet</>;
}

function ConnectionDialog({ title, busy, children, onClose }: { title: string; busy: boolean; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected && !previous.matches(":disabled")) previous.focus();
      else document.querySelector<HTMLElement>("[data-etsy-focus-fallback]")?.focus();
    };
  }, []);
  useEffect(() => { dialog.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }, [title]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="etsy-dialog-title" aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className={styles.dialogHeading}><h2 id="etsy-dialog-title">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close dialog">×</button></div>
    {children}
  </dialog>;
}

function CreationResult({ receipt, onClose }: { receipt: CreatedInvitation; onClose: () => void }) {
  const [copyMessage, setCopyMessage] = useState("");
  const shareUrl = receipt.shareUrl;
  return <>
    <p>No invitation was sent. {shareUrl ? "This link is available only in this creation result. Closing it removes the copy affordance; history cannot recover it. Share it privately with the shop operator." : "The server returned an existing creation receipt without its one-time link. History cannot recover that link. Check saved status before taking another action."}</p>
    <p>Expires: <SavedTime value={receipt.expiresAt} /></p>
    {shareUrl && <label className={styles.field}>Private invitation link<input readOnly autoComplete="off" value={shareUrl} onFocus={event => event.target.select()} /></label>}
    <div className={styles.actions}>{shareUrl && <button type="button" className={styles.primary} onClick={async () => {
      try { await navigator.clipboard.writeText(shareUrl); setCopyMessage("Invitation link copied. Share it privately; copying does not grant access."); }
      catch { setCopyMessage("Copy unavailable. Select the link above and copy it manually."); }
    }}>Copy invitation link</button>}<button type="button" onClick={onClose}>Done</button></div><p role="status" className={styles.help}>{copyMessage}</p>
  </>;
}

export function EtsyConnectionScreen() {
  const { view, revalidate } = useAppSession();
  const me = view.me;
  const canManage = view.phase === "ready" && view.generation && me?.membership.role === "owner" && me.membership.status === "active"
    && me.capabilities.includes("etsy.connection.read") && me.capabilities.includes("etsy.connection.manage");
  if (!canManage || !me || !view.generation) return <section className={styles.card}><h2>Owner access required</h2><p>Your current workspace access does not include Etsy connection details or invitations. Every operation is checked by the server.</p></section>;
  return <AuthorizedConnection key={`${view.generation}:${me.profile.userId}:${me.workspace.id}:${me.membership.revision}`} generation={view.generation} checkSession={revalidate} />;
}

function AuthorizedConnection({ generation, checkSession }: { generation: string; checkSession: () => Promise<void> }) {
  const state = useEtsyConnection(generation);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const connection = state.saved?.connection;
  const invitations = state.saved?.items ?? [];
  const intendedShopId = connection?.shopId ?? invitations[0]?.shopId ?? null;
  const busy = state.busy || state.loading;
  const actionable = !!connection && !busy && !state.needsCheck;
  const canCreate = actionable && connection.state !== "active" && !invitations.some(item => ["pending", "in_progress"].includes(item.state))
    && !(connection.state === "verification_pending" && state.saved?.nextCursor) && (!connection.connectionId || !!intendedShopId);
  const canDisconnect = actionable && !["unconnected", "disconnected"].includes(connection.state);
  const canSync = actionable && ((connection.state === "active" && connection.attemptPhase !== "refresh_submitted")
    || (connection.state === "verification_pending" && connection.attemptPhase === "verification_pending"));
  function closeDialog() { if (!state.busy) { setDialog(null); state.dismissReceipt(); } }
  if (state.denied) return <section className={styles.card}><h2>Current access unavailable</h2><p role="alert">{state.message}</p><button type="button" onClick={() => void checkSession()}>Check session</button></section>;

  return <div className={styles.screen}>
    <section className={styles.card} aria-labelledby="etsy-connection-title">
      <div className={styles.heading}><div><h2 id="etsy-connection-title">Shop connection</h2><p>One workspace, one connection. Public lookup is not ownership verification.</p></div><div className={styles.actions}><button type="button" disabled={busy} onClick={() => void state.checkSaved()}>Check saved status</button><button type="button" className={styles.primary} data-etsy-focus-fallback aria-label="Create invitation" disabled={!canCreate} onClick={() => setDialog({ kind: "create" })}>Create</button></div></div>
      <div className={styles.tableRegion} role="region" aria-label="Shop connection" tabIndex={0}><table>
        <caption className={styles.srOnly}>Shop connection</caption>
        <thead><tr><th scope="col">Shop</th><th scope="col">Shop ID</th><th scope="col">Connection status</th><th scope="col">Last observation</th><th scope="col">Actions</th></tr></thead>
        <tbody>{!connection ? <tr><td colSpan={5}><div className={styles.emptyRow} role={state.loading ? "status" : "alert"}><strong>{state.loading ? "Loading saved connection…" : "Saved connection unavailable"}</strong><p>{state.loading ? "Reading workspace status and invitation history. No Etsy request is made." : "Check saved status to try another read. No action is retried automatically."}</p></div></td></tr> : !connection.connectionId ? <tr><td colSpan={5}><div className={styles.emptyRow}><strong>No shop connection yet</strong><p>Start with Create. Find and confirm a public shop, then prepare an invitation for the shop operator.</p></div></td></tr> : <tr>
          <th scope="row">{state.observation?.shopName ?? state.intendedShop?.shopName ?? "Not observed"}<span className={styles.cellNote}>{state.observation ? "Authenticated observation" : "Intended public shop · no current observation"}</span></th>
          <td translate="no">{intendedShopId ?? "Unavailable"}<span className={styles.cellNote}>{connection.shopId ? "Verified ID · saved" : "Intended ID · unverified"}</span></td>
          <td><span className={styles.badge} data-state={connection.state}>{labels[connection.state]}</span><span className={styles.cellNote}>Saved status</span></td>
          <td><SavedTime value={connection.observedAt} /></td>
          <td><button type="button" disabled={state.busy} onClick={() => setDialog({ kind: "details" })}>Details</button></td>
        </tr>}</tbody>
      </table></div>
      <p className={styles.help}>Create is unavailable while an invitation is pending or the connection is active. Details holds saved-status, explicit sync and disconnect actions.</p>
    </section>
    <p className={styles.feedback} role="status">{state.message}</p>
    <section className={styles.card} aria-labelledby="etsy-history-title">
      <div className={styles.heading}><div><h2 id="etsy-history-title">Invitation history</h2><p>Link secrets never belong in this table.</p></div></div>
      <div className={styles.tableRegion} role="region" aria-label="Invitation history" tabIndex={0}><table>
        <caption className={styles.srOnly}>Invitations</caption>
        <thead><tr><th scope="col">Expected shop ID</th><th scope="col">Status</th><th scope="col">Created (UTC)</th><th scope="col">Expires (UTC)</th><th scope="col">Actions</th></tr></thead>
        <tbody>{!state.saved ? <tr><td colSpan={5}><div className={styles.emptyRow}>{state.loading ? "Loading invitation history…" : "History unavailable. No empty history is assumed."}</div></td></tr> : invitations.length === 0 ? <tr><td colSpan={5}><div className={styles.emptyRow}><strong>No invitations yet</strong><p>Created and expiry times will appear here. No link can be recovered from history.</p></div></td></tr> : invitations.map(invitation => <tr key={invitation.id}>
          <th scope="row" translate="no">{invitation.shopId}</th><td>{invitation.state.replaceAll("_", " ")}</td>
          <td><SavedTime value={invitation.createdAt} /></td><td><SavedTime value={invitation.expiresAt} /></td>
          <td><div className={styles.actions}><button type="button" disabled={state.busy} onClick={() => setDialog({ kind: "inspect", invitation })}>Inspect</button>{["pending", "in_progress"].includes(invitation.state) && <button type="button" disabled={!actionable} onClick={() => setDialog({ kind: "cancel", invitation })}>Cancel invitation</button>}</div></td>
        </tr>)}</tbody>
      </table></div>
      {state.saved?.nextCursor && <button type="button" disabled={busy} onClick={() => void state.moreHistory()}>More invitations</button>}
      <p className={styles.help}>No email is sent. The recipient must explicitly confirm and grant consent on Etsy. Saved history cannot reveal or reconstruct a link.</p>
    </section>
    {dialog && <ConnectionDialog title={titles[dialog.kind]} busy={state.busy} onClose={closeDialog}>
      {dialog.kind === "create" ? <CreateInvitationForm intendedShopId={intendedShopId} busy={state.busy} message={state.message} lookup={state.lookup} onClose={closeDialog} onCreate={async shop => {
        const result = await state.mutate("create", { shop });
        setDialog(result ? { kind: "result" } : null);
      }} /> : dialog.kind === "result" ? state.receipt && <CreationResult receipt={state.receipt} onClose={closeDialog} /> : dialog.kind === "details" && connection ? <>
        <span className={styles.badge} data-state={connection.state}>{labels[connection.state]}</span>
        <dl className={styles.details}>
          <div><dt>Intended public shop</dt><dd>{state.intendedShop?.shopName ?? "Not observed"}</dd></div><div><dt>Intended shop ID</dt><dd translate="no">{intendedShopId ?? "Unavailable"}</dd></div>
          <div><dt>Verified shop ID (saved)</dt><dd translate="no">{connection.shopId ?? "Not verified"}</dd></div><div><dt>Authenticated shop observation</dt><dd>{state.observation ? `${state.observation.shopName} · ${state.observation.currencyCode}` : "Use explicit sync to read current shop information"}</dd></div>
          <div><dt>Last observation (saved)</dt><dd><SavedTime value={connection.observedAt} /></dd></div><div><dt>Connection revision</dt><dd>{connection.revision}</dd></div>
        </dl>
        <p className={styles.stateNote}>{connection.attemptPhase === "verification_pending" ? "Consent was exchanged, but authenticated shop verification is pending. Explicit sync can check the saved candidate without repeating the consent exchange." : notes[connection.state]}</p>
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void state.checkSaved()}>Check saved status</button><button type="button" disabled={!canSync} aria-describedby="etsy-sync-note" onClick={() => void state.mutate("sync")}>Sync shop info</button>{canDisconnect && <button type="button" onClick={() => setDialog({ kind: "disconnect" })}>Disconnect</button>}</div>
        <p role="status" className={styles.feedback}>{state.message}</p>
        <p id="etsy-sync-note" className={styles.help}>Sync is an explicit authenticated Etsy shop-info request. Checking saved status never refreshes tokens or reads Etsy. Nothing polls automatically.</p>
      </> : dialog.kind === "inspect" ? <>
        <dl className={styles.inspection}><dt>Expected shop ID</dt><dd translate="no">{dialog.invitation.shopId}</dd><dt>Status</dt><dd>{dialog.invitation.state.replaceAll("_", " ")}</dd><dt>Created (UTC)</dt><dd><SavedTime value={dialog.invitation.createdAt} /></dd><dt>Expires (UTC)</dt><dd><SavedTime value={dialog.invitation.expiresAt} /></dd></dl>
        <p>The one-time creation result is no longer available. History never reveals or reconstructs an invitation link.</p>
        <div className={styles.actions}><button type="button" onClick={closeDialog}>Done</button></div>
      </> : dialog.kind === "cancel" || dialog.kind === "disconnect" ? <>
        <p>{dialog.kind === "cancel" ? "Cancel this invitation? It will remain in history as cancelled, and this workspace keeps its intended shop binding. In-progress consent is fenced; existing access is not restored." : "End the connection locally and cancel pending invitations? This does not confirm revocation on Etsy or remove the intended shop binding."}</p>
        <p role="status">{state.busy ? "Applying your explicit action…" : state.message}</p>
        <div className={styles.actions}><button type="button" disabled={state.busy} onClick={closeDialog}>Keep connection</button><button type="button" disabled={!actionable} className={styles.primary} onClick={async () => { await (dialog.kind === "cancel" ? state.mutate("cancel", { invitationId: dialog.invitation.id }) : state.mutate("disconnect")); setDialog(null); }}>{dialog.kind === "cancel" ? "Confirm cancellation" : "Confirm disconnect"}</button></div>
      </> : <><p role="alert">Saved details are unavailable. Close this dialog and check saved status.</p><button type="button" onClick={closeDialog}>Done</button></>}
    </ConnectionDialog>}
  </div>;
}
