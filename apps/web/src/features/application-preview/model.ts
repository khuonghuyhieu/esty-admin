export type ProjectStatus = "Active" | "Review" | "Archived";
export type StatusFilter = "All" | ProjectStatus;
export type SortKey = "strokes" | "updatedAt";
export type Sort = { key: SortKey; direction: "ascending" | "descending" } | null;

export interface Project {
  readonly id: string;
  readonly icon: "cycle" | "board" | "spark" | "search" | "phone";
  readonly title: string;
  readonly owner: string;
  readonly collaborators: number;
  readonly strokes: number;
  readonly updatedLabel: string;
  readonly updatedAt: number;
  readonly status: ProjectStatus;
}

export interface TableState {
  readonly query: string;
  readonly status: StatusFilter;
  readonly sort: Sort;
}

export interface ChartPoint {
  readonly label: string;
  readonly strokes: number;
  readonly sessions: number;
}

export interface ActivityEvent {
  readonly id: string;
  readonly category: "Drawings" | "Shares" | "Comments" | "Invites";
  readonly title: string;
  readonly description: string;
  readonly time: string;
}
