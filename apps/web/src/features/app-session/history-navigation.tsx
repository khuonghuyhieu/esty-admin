"use client";

import { useLayoutEffect } from "react";

let activeHandler: (() => void) | null = null;

export function subscribeHistoryNavigation(handler: () => void): () => void {
  activeHandler = handler;
  return () => { if (activeHandler === handler) activeHandler = null; };
}

export function HistoryNavigationEvents() {
  useLayoutEffect(() => {
    // Window-target listeners run in registration order, even with capture=true.
    // Root layout mounting precedes Next's passive history-listener effect.
    const dispatch = () => activeHandler?.();
    window.addEventListener("popstate", dispatch);
    return () => window.removeEventListener("popstate", dispatch);
  }, []);
  return null;
}
