import type { Project, Sort, SortKey, TableState } from "./model.ts";

export const initialTableState: TableState = { query: "", status: "All", sort: null };

export function toggleSort(previous: Sort, key: SortKey): Sort {
  return { key, direction: previous?.key === key && previous.direction === "ascending" ? "descending" : "ascending" };
}

export function selectProjects(projects: readonly Project[], state: TableState) {
  const query = state.query.trim().toLowerCase();
  const rows = projects.filter((project) =>
    (state.status === "All" || project.status === state.status) &&
    (project.title.toLowerCase().includes(query) || project.owner.toLowerCase().includes(query)),
  );
  if (state.sort) {
    const { key, direction } = state.sort;
    rows.sort((first, second) => {
      const difference = first[key] - second[key];
      if (difference !== 0) return direction === "ascending" ? difference : -difference;
      return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
    });
  }
  return { rows, count: rows.length, strokes: rows.reduce((total, project) => total + project.strokes, 0) };
}
