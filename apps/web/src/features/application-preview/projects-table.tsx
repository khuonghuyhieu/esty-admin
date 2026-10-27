"use client";

import { useState } from "react";
import { projects, numberFormat } from "./fixtures";
import type { Sort, SortKey, StatusFilter } from "./model";
import { initialTableState, selectProjects, toggleSort } from "./table-state";
import { Icon } from "./icon";
import { RowMenu } from "./row-menu";
import styles from "./application-preview.module.css";

const filters: readonly { value: StatusFilter; label: string }[] = [
  { value: "All", label: "All" }, { value: "Active", label: "Active" }, { value: "Review", label: "In review" }, { value: "Archived", label: "Archived" },
];
const statusClasses = { Active: styles.activeStatus, Review: styles.reviewStatus, Archived: styles.archivedStatus };
const projectColors = { cycle: styles.blue, board: styles.peach, spark: styles.purple, search: styles.teal, phone: styles.blue };

export function ProjectsTable({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const [status, setStatus] = useState<StatusFilter>(initialTableState.status);
  const [sort, setSort] = useState<Sort>(initialTableState.sort);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const visible = selectProjects(projects, { query, status, sort });
  const changed = query !== "" || status !== "All" || sort !== null;

  function reset() {
    onQueryChange(initialTableState.query);
    setStatus(initialTableState.status);
    setSort(initialTableState.sort);
    setOpenRow(null);
  }
  function sortBy(key: SortKey) {
    setSort((previous) => toggleSort(previous, key));
    setOpenRow(null);
  }

  return <section className={`${styles.panel} ${styles.tablePanel}`} aria-labelledby="projects-title">
    <div className={styles.tableHeading}><h2 id="projects-title">Whiteboard projects</h2><div className={styles.controls}>
      <button className={styles.control} disabled aria-describedby="table-unavailable"><Icon name="list" size={16} />List view</button>
      <button className={styles.control} disabled aria-describedby="table-unavailable"><Icon name="export" size={18} />Export</button>
    </div></div>
    <div className={styles.toolbar}>
      <label className={styles.search}><Icon name="search" size={16} /><span className={styles.srOnly}>Search projects, owners</span><input type="search" name="project-search" autoComplete="off" placeholder="Search projects, owners…" value={query} onChange={(event) => { onQueryChange(event.target.value); setOpenRow(null); }} /></label>
      <button className={styles.control} disabled aria-describedby="table-unavailable"><Icon name="filter" size={16} />Filters</button>
      <button className={styles.control} disabled aria-label="Table settings" aria-describedby="table-unavailable"><Icon name="settings" size={18} /></button>
      <button className={`${styles.control} ${styles.primary}`} disabled aria-describedby="table-unavailable"><Icon name="plus" size={16} />New board</button>
    </div>
    <p className={styles.unavailable} id="table-unavailable">Preview only: board, view, export and print actions are unavailable. Search, status and sorting work with sample data.</p>
    <fieldset className={styles.filters}><legend>Show only:</legend>{filters.map((filter) => <label key={filter.value}><input type="radio" name="project-status" value={filter.value} checked={status === filter.value} onChange={() => { setStatus(filter.value); setOpenRow(null); }} />{filter.label}</label>)}{changed ? <button className={styles.reset} onClick={reset}>Reset table</button> : null}</fieldset>
    <div className={styles.tableScroll} role="region" aria-label="Whiteboard projects table, scroll for all columns" tabIndex={0}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Sample whiteboard projects</caption>
        <thead><tr>
          <th scope="col">Project</th><th scope="col">Owner</th><th scope="col">Collaborators</th>
          <th scope="col" className={styles.numeric} aria-sort={sort?.key === "strokes" ? sort.direction : undefined}><button onClick={() => sortBy("strokes")}>Strokes{sort?.key === "strokes" ? <span aria-hidden="true">{sort.direction === "ascending" ? "↑" : "↓"}</span> : <Icon name="sort" size={14} />}</button></th>
          <th scope="col" aria-sort={sort?.key === "updatedAt" ? sort.direction : undefined}><button onClick={() => sortBy("updatedAt")}>Updated{sort?.key === "updatedAt" ? <span aria-hidden="true">{sort.direction === "ascending" ? "↑" : "↓"}</span> : <Icon name="sort" size={14} />}</button></th>
          <th scope="col">Status</th><th scope="col"><span className={styles.srOnly}>Actions</span></th>
        </tr></thead>
        <tbody>{visible.rows.map((row) => <tr key={row.id}>
          <th scope="row"><span className={styles.projectName}><span className={projectColors[row.icon]}><Icon name={row.icon} /></span><span>{row.title}</span></span></th>
          <td>{row.owner}</td><td>{row.collaborators}</td><td className={styles.numeric}>{numberFormat.format(row.strokes)}</td><td>{row.updatedLabel}</td>
          <td><span className={`${styles.status} ${statusClasses[row.status]}`}>{row.status}</span></td>
          <td><RowMenu title={row.title} open={openRow === row.id} onOpenChange={(open) => setOpenRow(open ? row.id : null)} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    {visible.count === 0 ? <div className={styles.empty}><p>No projects match your search and status.</p><button className={styles.reset} onClick={reset}>Clear search and filters</button></div> : null}
    <footer className={styles.tableFooter}>
      <div className={styles.totals} role="status" aria-live="polite" aria-atomic="true"><span>Projects in view<strong>{visible.count}</strong></span><span>Strokes in view<strong>{numberFormat.format(visible.strokes)}</strong></span></div>
      <div className={styles.controls}><button className={styles.footerAction} disabled aria-describedby="table-unavailable">Print</button><button className={styles.footerAction} disabled aria-describedby="table-unavailable">Duplicate</button><button className={`${styles.control} ${styles.primary}`} disabled aria-describedby="table-unavailable">Export CSV</button></div>
    </footer>
  </section>;
}
