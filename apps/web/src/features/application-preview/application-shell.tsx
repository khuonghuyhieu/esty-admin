"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";
import { numberFormat, workspace } from "./fixtures";
import { ProjectsTable } from "./projects-table";
import styles from "./application-preview.module.css";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const storageId = useId();
  const unavailableId = useId();
  return <>
    <a className={styles.brand} href="#main-content" onClick={onNavigate}><span className={styles.brandMark}><Icon name="pen" /></span>SketchPad</a>
    <nav className={styles.navigation} aria-label="Application">
      <a className={styles.selected} href="#main-content" aria-current="page" onClick={onNavigate}><Icon name="dashboard" />Dashboard</a>
      {([{ label: "Boards", icon: "layers", badge: 8 }, { label: "Templates", icon: "board" }, { label: "Team", icon: "team", badge: 3 }, { label: "Settings", icon: "settings" }] as const).map((entry) => <button key={entry.label} disabled aria-describedby={unavailableId}><Icon name={entry.icon} />{entry.label}{"badge" in entry ? <span className={styles.badge}>{entry.badge}</span> : null}</button>)}
    </nav>
    <p id={unavailableId} className={styles.sidebarHint}>Other sections are unavailable in this UI preview.</p>
    <section className={styles.storage} aria-labelledby={storageId}>
      <h2 id={storageId}><Icon name="pen" />Canvas storage</h2>
      <p><strong>{workspace.storageUsed} GB</strong> / {workspace.storageTotal} GB</p>
      <p>{workspace.boards} boards · {numberFormat.format(workspace.strokes)} strokes saved</p>
      <progress value={workspace.storagePercent} max={100} aria-label="Sample canvas storage used">{workspace.storagePercent}%</progress>
      <p className={styles.storageUsed}>{workspace.storagePercent}% used</p>
    </section>
  </>;
}

export function ApplicationShell({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [drawerOpen]);

  return <div className={styles.preview}>
    <aside className={styles.sidebar}><Sidebar /></aside>
    <dialog ref={drawer} className={styles.drawer} aria-label="Application navigation" onClose={() => { setDrawerOpen(false); trigger.current?.focus(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
    }} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <button className={styles.drawerClose} aria-label="Close sidebar" onClick={() => drawer.current?.close()}><Icon name="close" /></button>
      <Sidebar onNavigate={() => drawer.current?.close()} />
    </dialog>
    <main id="main-content" tabIndex={-1} className={styles.main}>
      <div className={styles.previewNotice}>UI preview — sample data. Changes are not saved.</div>
      <header className={styles.header}>
        <div className={styles.heading}>
          <button ref={trigger} className={styles.drawerTrigger} aria-label="Open sidebar" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => { drawer.current?.showModal(); setDrawerOpen(true); }}><Icon name="menu" /></button>
          <div><h1>Project dashboard</h1><p>Northwind Studio · Northwind Studio</p></div>
        </div>
        <div className={styles.headerControls}>
          <button className={styles.workspace} disabled aria-describedby="header-unavailable"><Icon name="pen" size={16} /><span>{workspace.name}</span><span className={styles.pill}>{workspace.plan}</span><Icon name="chevron" size={14} /></button>
          <label className={styles.search}><Icon name="search" size={16} /><span className={styles.srOnly}>Search boards</span><input type="search" name="board-search" autoComplete="off" placeholder="Search boards…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className={styles.notifications} disabled aria-label="Notifications (3 unread)" aria-describedby="header-unavailable"><Icon name="bell" size={18} /><span>3</span></button>
          <button className={styles.profile} disabled aria-describedby="header-unavailable"><span>{workspace.initials}</span>{workspace.profile}</button>
        </div>
        <p id="header-unavailable" className={styles.headerHint}>Workspace, notifications and profile actions are unavailable in this preview.</p>
      </header>
      {children}
      <ProjectsTable query={query} onQueryChange={setQuery} />
    </main>
  </div>;
}
