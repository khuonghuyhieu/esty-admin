const paths = {
  dashboard: "M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z",
  layers: "m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5",
  board: "M3 4h18v16H3z M3 9h18 M9 9v11",
  team: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M16 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  settings: "M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  pen: "m15 3 5 5 M3 21l5-1 13-13a3.5 3.5 0 0 0-5-5L3 15z M12 21h9",
  storage: "m3 9 4-5h10l4 5v11H3z M3 9h18 M8 13h8",
  search: "m16 16 5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  chevron: "m6 9 6 6 6-6",
  menu: "M3 5h18 M3 12h18 M3 19h18",
  close: "m5 5 14 14 M5 19 19 5",
  list: "M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01",
  export: "M12 2v13 m-5-5 5 5 5-5 M3 15v6h18v-6",
  filter: "M3 4h18l-7 8v7l-4 2v-9z",
  plus: "M12 4v16 M4 12h16",
  more: "M12 4h.01 M12 12h.01 M12 20h.01",
  sort: "m4 8 4-4 4 4 M8 4v16 m4-4 4 4 4-4 M16 20V4",
  cycle: "M3 10a9 9 0 0 1 16-5l2 2 M21 2v5h-5 M21 14A9 9 0 0 1 5 19l-2-2 M3 22v-5h5",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  phone: "M6 2h12v20H6z M9 5h6 M10 19h4",
  share: "m8 12 8-6 M8 12l8 6 M7 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  archive: "M3 3h18v5H3z M5 8v13h14V8 M10 12h4",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
} as const;

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
