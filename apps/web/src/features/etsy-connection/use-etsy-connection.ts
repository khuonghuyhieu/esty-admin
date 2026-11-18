"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SessionFailure } from "../app-session/errors";
import { etsyErrorMessage, requestEtsy } from "./client";
import type { CreatedInvitation, EtsyOperations, InvitationPage, Observation, Shop } from "./model";

export function useEtsyConnection(generation: string) {
  const [saved, setSaved] = useState<InvitationPage | null>(null);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [intendedShop, setIntendedShop] = useState<Shop | null>(null);
  const [receipt, setReceipt] = useState<CreatedInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [denied, setDenied] = useState(false);
  const [message, setMessage] = useState("");
  const lifecycle = useRef<AbortController | null>(null);
  const work = useRef(false);

  const failure = useCallback((error: unknown) => {
    if (lifecycle.current?.signal.aborted) return;
    setMessage(etsyErrorMessage(error));
    if (error instanceof SessionFailure && ["unauthenticated", "forbidden", "session_changed", "csrf_denied"].includes(error.code)) {
      setDenied(true); setSaved(null); setObservation(null); setIntendedShop(null); setReceipt(null);
      lifecycle.current?.abort();
    }
  }, []);

  const refreshSaved = useCallback((signal: AbortSignal): Promise<boolean> => Promise.all([
    requestEtsy("status", undefined, generation, signal), requestEtsy("history", {}, generation, signal),
  ]).then(([connection, history]) => {
      signal.throwIfAborted();
      if (connection.revision !== history.connection.revision || connection.connectionId !== history.connection.connectionId) throw new SessionFailure(409, "connection_changed");
      setSaved(history); setNeedsCheck(false);
      setObservation(previous => previous && previous.connectionId === history.connection.connectionId && previous.revision === history.connection.revision && history.connection.state === "active" && previous.observedAt === history.connection.observedAt ? previous : null);
      setIntendedShop(previous => previous?.shopId === (history.connection.shopId ?? history.items[0]?.shopId) ? previous : null);
      return true;
    }).catch(error => {
      if (!signal.aborted) { setSaved(null); setNeedsCheck(true); failure(error); }
      return false;
    }).finally(() => { if (!signal.aborted) setLoading(false); }), [generation, failure]);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    void refreshSaved(controller.signal);
    return () => controller.abort();
  }, [refreshSaved]);

  async function checkSaved() {
    const signal = lifecycle.current?.signal;
    if (!signal || signal.aborted || work.current) return;
    work.current = true;
    setLoading(true);
    setReceipt(null);
    try { if (await refreshSaved(signal)) setMessage("Saved status checked. No Etsy request or token refresh was made."); }
    finally { work.current = false; }
  }

  async function moreHistory() {
    const signal = lifecycle.current?.signal;
    if (!saved?.nextCursor || !signal || signal.aborted || work.current || loading) return;
    work.current = true; setLoading(true);
    try {
      const page = await requestEtsy("history", { cursor: saved.nextCursor }, generation, signal);
      signal.throwIfAborted();
      if (page.connection.revision !== saved.connection.revision || page.connection.connectionId !== saved.connection.connectionId) throw new SessionFailure(409, "connection_changed");
      setSaved({ ...page, items: [...saved.items, ...page.items.filter(item => !saved.items.some(existing => existing.id === item.id))] });
    } catch (error) { if (!signal.aborted) { setNeedsCheck(true); failure(error); } }
    finally { work.current = false; if (!signal.aborted) setLoading(false); }
  }

  async function lookup(shopName: string, offset: number, signal: AbortSignal) {
    const current = lifecycle.current;
    if (!current || current.signal.aborted || denied) throw new SessionFailure(403, "forbidden");
    try { return await requestEtsy("lookup", { shopName, offset }, generation, AbortSignal.any([signal, current.signal])); }
    catch (error) { if (!signal.aborted && !current.signal.aborted) failure(error); throw error; }
  }

  async function mutate<K extends "create" | "cancel" | "disconnect" | "sync">(operation: K, extra: { shop?: Shop; invitationId?: string } = {}): Promise<EtsyOperations[K]["output"] | null> {
    const signal = lifecycle.current?.signal;
    if (!saved || !signal || signal.aborted || work.current || loading || needsCheck || denied) return null;
    work.current = true; setBusy(true); setReceipt(null); setMessage("");
    if (operation !== "sync") setObservation(null);
    // One explicit intent owns one revision and one key. Neither is regenerated or resubmitted after failure.
    const mutation = { expectedRevision: saved.connection.revision, idempotencyKey: crypto.randomUUID() };
    const input = operation === "create" ? { ...mutation, expectedShopId: extra.shop!.shopId }
      : operation === "cancel" ? { ...mutation, invitationId: extra.invitationId! }
      : operation === "sync" ? { expectedRevision: mutation.expectedRevision } : mutation;
    let result: EtsyOperations[K]["output"];
    try {
      result = await requestEtsy(operation, input as EtsyOperations[K]["input"], generation, signal);
      signal.throwIfAborted();
      if (operation === "create") { setReceipt(result as CreatedInvitation); setIntendedShop(extra.shop!); }
      if (operation === "sync") setObservation(result as Observation);
    } catch (error) {
      if (!signal.aborted) { setNeedsCheck(true); failure(error); }
      work.current = false; if (!signal.aborted) setBusy(false);
      return null;
    }
    setLoading(true);
    const refreshed = await refreshSaved(signal);
    if (!signal.aborted) {
      setMessage(refreshed ? operation === "create" ? "Invitation created. No email was sent. Consent is still required."
        : operation === "cancel" ? "Invitation cancelled. The intended shop binding remains."
        : operation === "disconnect" ? "Disconnected locally. Revocation on Etsy is not confirmed."
        : "Authenticated shop information observed after your explicit request."
        : "The action completed, but saved status could not be read. Check saved status before another action.");
      setBusy(false);
    }
    work.current = false;
    return signal.aborted ? null : result;
  }

  return { saved, observation, intendedShop, receipt, loading, busy, needsCheck, denied, message,
    checkSaved, moreHistory, lookup, mutate, dismissReceipt: () => setReceipt(null) };
}
