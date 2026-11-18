import type { Lookup, Shop } from "./model.ts";

export function normalizeShopInput(input: string): string | null {
  const value = input.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, "");
  if (/^[A-Za-z0-9]{1,64}$/.test(value)) return value.toLowerCase();
  // Inspect the raw authority/path before URL normalization can erase ports or dot segments.
  const link = /^https:\/\/(etsy\.com|www\.etsy\.com)(\/shop\/[^?#]*)(?:[?#].*)?$/i.exec(value);
  if (!link || /[\\\s]/.test(value) || /%(?:2f|5c)/i.test(link[2])) return null;
  const path = /^\/shop\/([^/]+)\/?$/.exec(link[2]);
  if (!path) return null;
  try {
    const name = decodeURIComponent(path[1]);
    return /^[A-Za-z0-9]{1,64}$/.test(name) ? name.toLowerCase() : null;
  } catch { return null; }
}

export interface DiscoveryState {
  input: string;
  generation: number;
  query: string | null;
  phase: "idle" | "loading" | "ready" | "error";
  response: Lookup | null;
  selected: Shop | null;
  confirmed: boolean;
  error: string;
}
export const initialDiscovery: DiscoveryState = { input: "", generation: 0, query: null, phase: "idle", response: null, selected: null, confirmed: false, error: "" };
export type DiscoveryAction =
  | { type: "edit"; input: string }
  | { type: "start"; query: string }
  | { type: "resolve"; generation: number; response: Lookup }
  | { type: "fail"; generation: number; message: string }
  | { type: "select"; shopId: string }
  | { type: "confirm" };

export function discoveryReducer(state: DiscoveryState, action: DiscoveryAction): DiscoveryState {
  if (action.type === "edit") return { ...initialDiscovery, input: action.input, generation: state.generation + 1 };
  if (action.type === "start") return { ...initialDiscovery, input: state.input, generation: state.generation + 1, query: action.query, phase: "loading" };
  if (action.type === "resolve") {
    if (state.phase !== "loading" || state.generation !== action.generation || state.query !== action.response.query) return state;
    const response = action.response;
    const exact = response.items.filter(item => item.match === "exact" && item.shopName.toLowerCase() === response.query);
    const ids = new Set(exact.map(item => item.shopId));
    const selected = response.outcome === "exact" && response.page.offset === 0 && response.page.complete && ids.size === 1 ? exact[0] : null;
    return { ...state, phase: "ready", response, selected, confirmed: false };
  }
  if (action.type === "fail") {
    if (state.generation !== action.generation) return state;
    return { ...state, phase: "error", response: null, selected: null, confirmed: false, error: action.message };
  }
  if (state.phase !== "ready" || !state.response || !["exact", "choose"].includes(state.response.outcome)) return state;
  if (action.type === "select") return { ...state, selected: state.response.items.find(item => item.shopId === action.shopId) ?? null, confirmed: false };
  return state.selected ? { ...state, confirmed: true } : state;
}

