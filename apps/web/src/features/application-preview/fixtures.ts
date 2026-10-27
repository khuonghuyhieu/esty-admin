import type { ActivityEvent, ChartPoint, Project } from "./model.ts";

export const workspace = {
  name: "Northwind Studio",
  plan: "Team",
  profile: "Jordan Kim",
  initials: "JK",
  storageUsed: 6.8,
  storageTotal: 10,
  storagePercent: 68,
  boards: 142,
  strokes: 28400,
} as const;

export const metrics = [
  { id: "boards", icon: "layers", label: "Boards active", value: "24", note: "+3 this week", tone: "peach", trend: true },
  { id: "strokes", icon: "pen", label: "Strokes today", value: "1,842", note: "+12% vs yesterday", tone: "blue", trend: true },
  { id: "collaborators", icon: "team", label: "Collaborators", value: "18", note: "5 online now", tone: "teal", trend: false },
  { id: "storage", icon: "storage", label: "Storage used", value: "68%", note: "6.8 / 10 GB", tone: "orange", trend: false },
] as const;

// Fixed synthetic timestamps preserve the reference's relative chronology across builds.
export const projects: readonly Project[] = [
  { id: "retro", icon: "cycle", title: "Sprint retro — June", owner: "Jordan Kim", collaborators: 5, strokes: 1240, updatedLabel: "Yesterday", updatedAt: Date.UTC(2026, 5, 21, 12), status: "Archived" },
  { id: "planning", icon: "board", title: "Q2 Product Planning", owner: "Jordan Kim", collaborators: 6, strokes: 4280, updatedLabel: "8 min ago", updatedAt: Date.UTC(2026, 5, 22, 11, 52), status: "Active" },
  { id: "design", icon: "spark", title: "Design System v3", owner: "Sam Okonkwo", collaborators: 8, strokes: 8920, updatedLabel: "3 hr ago", updatedAt: Date.UTC(2026, 5, 22, 9), status: "Active" },
  { id: "research", icon: "search", title: "User research synthesis", owner: "Alex Rivera", collaborators: 3, strokes: 960, updatedLabel: "2 days ago", updatedAt: Date.UTC(2026, 5, 20, 12), status: "Review" },
  { id: "mobile", icon: "phone", title: "Mobile UX — Checkout flow", owner: "Maya Chen", collaborators: 4, strokes: 2140, updatedLabel: "1 hr ago", updatedAt: Date.UTC(2026, 5, 22, 11), status: "Review" },
];

export const chartPoints: readonly ChartPoint[] = [
  { label: "Jun 9", strokes: 1240, sessions: 32 },
  { label: "Jun 10", strokes: 1380, sessions: 38 },
  { label: "Jun 11", strokes: 1120, sessions: 29 },
  { label: "Jun 12", strokes: 1560, sessions: 42 },
  { label: "Jun 13", strokes: 1480, sessions: 40 },
  { label: "Jun 14", strokes: 980, sessions: 24 },
  { label: "Jun 15", strokes: 860, sessions: 21 },
  { label: "Jun 16", strokes: 1620, sessions: 44 },
  { label: "Jun 17", strokes: 1540, sessions: 41 },
  { label: "Jun 18", strokes: 1710, sessions: 46 },
  { label: "Jun 19", strokes: 1842, sessions: 47 },
  { label: "Jun 20", strokes: 1690, sessions: 43 },
  { label: "Jun 21", strokes: 1780, sessions: 45 },
  { label: "Jun 22", strokes: 1842, sessions: 47 },
];

export const activity: readonly ActivityEvent[] = [
  { id: "sketch", category: "Drawings", title: "Wireframe sketch added", description: "Mobile checkout flow — 24 strokes on Checkout UX board", time: "8 min ago" },
  { id: "share", category: "Shares", title: "Board shared with team", description: "Q2 Planning sent to Northwind Studio workspace", time: "22 min ago" },
  { id: "comment", category: "Comments", title: "Comment on user journey", description: "Maya Chen: “Move the CTA above the fold on frame 3”", time: "1 hr ago" },
  { id: "invite", category: "Invites", title: "Collaborator invited", description: "Sam Okonkwo added to Design System board", time: "2 hr ago" },
  { id: "template", category: "Drawings", title: "Template duplicated", description: "Sprint retro template copied to Mobile UX board", time: "Yesterday" },
];

export const numberFormat = new Intl.NumberFormat("en-US");
