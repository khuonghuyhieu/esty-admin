"use client";

import { useEffect, useReducer, useRef } from "react";
import { discoveryReducer, initialDiscovery, normalizeShopInput } from "./shop-discovery";
import { etsyErrorMessage } from "./client";
import type { Lookup, Shop } from "./model";
import styles from "./etsy-connection.module.css";

export function CreateInvitationForm({ intendedShopId, busy, message, lookup, onCreate, onClose }: {
  intendedShopId: string | null; busy: boolean; message: string;
  lookup: (name: string, offset: number, signal: AbortSignal) => Promise<Lookup>;
  onCreate: (shop: Shop) => Promise<void>; onClose: () => void;
}) {
  const [state, dispatch] = useReducer(discoveryReducer, initialDiscovery);
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  const response = state.response;
  const differentShop = !!state.selected && !!intendedShopId && state.selected.shopId !== intendedShopId;
  const canCreate = !busy && state.phase === "ready" && state.confirmed && !!state.selected && !differentShop;

  function reset(value: string) {
    request.current?.abort();
    dispatch({ type: "edit", input: value });
  }
  async function find(offset = 0) {
    const query = normalizeShopInput(state.input);
    if (!query) {
      dispatch({ type: "fail", generation: state.generation, message: "Enter 1–64 letters or digits, or an HTTPS etsy.com/shop/name link without credentials or a port." });
      input.current?.focus();
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const generation = state.generation + 1;
    dispatch({ type: "start", query });
    try {
      const result = await lookup(query, offset, controller.signal);
      if (!controller.signal.aborted) dispatch({ type: "resolve", generation, response: result });
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ type: "fail", generation, message: etsyErrorMessage(error) });
    }
  }

  return <form noValidate onSubmit={async event => {
    event.preventDefault();
    if (!canCreate || !state.selected || submitting.current) return;
    submitting.current = true;
    try { await onCreate(state.selected); } finally { submitting.current = false; }
  }}>
    <p>Find a public shop, confirm its identity, then create an invitation. Public details do not verify ownership or connect a shop.</p>
    {intendedShopId && <p className={styles.help}>This workspace remains bound to shop ID <strong translate="no">{intendedShopId}</strong>, including after cancellation. Select the same shop to reconnect.</p>}
    <label className={styles.field} htmlFor="etsy-shop-query">Shop name or Etsy link<input ref={input} id="etsy-shop-query" type="text" autoComplete="off" spellCheck={false} disabled={busy} value={state.input} placeholder="Shop name or https://www.etsy.com/shop/…" onChange={event => reset(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy && state.phase !== "loading") void find(); } }} aria-invalid={state.phase === "error"} aria-describedby="etsy-lookup-help etsy-lookup-error" /></label>
    <p id="etsy-lookup-help" className={styles.help}>Typing sends nothing. Find looks up the shop name through Lovora; it never fetches a pasted URL.</p>
    <div className={styles.actions}><button type="button" onClick={() => void find()} disabled={busy || state.phase === "loading"}>Find shop</button></div>
    <p id="etsy-lookup-error" className={styles.error} role="alert">{state.error}</p>
    <p className={styles.help} role="status">{state.phase === "loading" ? "Finding public shop…" : response ? response.outcome === "not_found" ? "No shop found in the complete result. Refine the name and try again." : response.outcome === "incomplete" ? "Incomplete results. This does not mean the shop is absent. Refine the name or start Find again." : `${response.items.length} public ${response.items.length === 1 ? "result" : "results"}. Ownership unverified.` : ""}</p>
    {response && ["exact", "choose"].includes(response.outcome) && <section className={styles.lookupResults} aria-label="Public shop results">
      {!response.page.complete && <p className={styles.help}>Partial results · page {response.page.offset / 20 + 1}. Choose deliberately or refine your search. {response.page.truncated && "The 100-result window has ended; refine the name."}</p>}
      {response.outcome === "choose" && <p className={styles.help}>No result is selected automatically. Choose by shop name and ID, then confirm.</p>}
      <fieldset className={styles.candidates} disabled={busy}><legend className={styles.srOnly}>Choose a public shop</legend>{response.items.map(shop => <label key={shop.shopId} className={styles.candidate}>
        <input type="radio" name="public-shop" checked={state.selected?.shopId === shop.shopId} onChange={() => dispatch({ type: "select", shopId: shop.shopId })} />
        <span><strong>{shop.shopName}</strong><span translate="no">Shop ID: {shop.shopId}</span><span>{shop.shopUrl}</span><span>Public identity only · ownership unverified</span></span>
      </label>)}</fieldset>
      {response.page.nextOffset !== null && <button type="button" disabled={busy} onClick={() => void find(response.page.nextOffset!)}>Next page</button>}
    </section>}
    <label className={styles.field}>Expected shop ID<input name="expectedShopId" type="text" readOnly value={state.selected?.shopId ?? ""} placeholder="Find and choose a shop first" aria-describedby="etsy-shop-id-help" /></label>
    <p id="etsy-shop-id-help" className={styles.help}>Read-only, exact decimal ID. Confirmation selects an intended shop; it is not consent or authenticated shop verification.</p>
    {differentShop && <p className={styles.error} role="alert">The selected shop differs from this workspace’s saved intended shop. It cannot replace the binding.</p>}
    {state.selected && !differentShop && <div className={styles.actions}><button type="button" disabled={busy || state.confirmed} onClick={() => dispatch({ type: "confirm" })}>{state.confirmed ? "Shop confirmed for this invitation" : "Confirm this shop"}</button></div>}
    <p role="status" className={styles.feedback}>{busy ? "Creating invitation… Keep this result open to copy its one-time link." : message}</p>
    <div className={styles.actions}><button type="button" disabled={busy} onClick={onClose}>Back</button><button type="submit" className={styles.primary} disabled={!canCreate}>Create invitation</button></div>
  </form>;
}
