"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ProfileMenu } from "../workspace-foundation/profile-menu";
import { useAppSession } from "../app-session/session-provider";
import { Icon } from "./icon";
import { ProjectsTable } from "./projects-table";
import styles from "./application-preview.module.css";

type Section = "dashboard" | "team" | "settings";

function Sidebar({ section, onNavigate }: { section: Section; onNavigate?: () => void }) {
  return <>
    <a className={styles.brand} href="#main-content" onClick={onNavigate}><span className={styles.brandMark}><Icon name="pen" /></span>SketchPad</a>
    <nav className={styles.navigation} aria-label="Application">
      <Link className={section === "dashboard" ? styles.selected : undefined} href={section === "dashboard" ? "#main-content" : "/application"} prefetch={false} aria-current={section === "dashboard" ? "page" : undefined} onClick={onNavigate}><Icon name="dashboard" />Dashboard</Link>
      <Link className={section === "team" ? styles.selected : undefined} href="/settings/team" prefetch={false} aria-current={section === "team" ? "page" : undefined} onClick={onNavigate}><Icon name="team" />Team <span className={styles.badge}>3</span></Link>
      <Link className={section === "settings" ? styles.selected : undefined} href="/settings" prefetch={false} aria-current={section === "settings" ? "page" : undefined} onClick={onNavigate}><Icon name="settings" />Settings</Link>
    </nav>
  </>;
}

export function ApplicationShell({ children, section = "dashboard" }: { children: ReactNode; section?: Section }) {
  const { view } = useAppSession();
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

  if (!view.me) return null;

  return <div className={styles.preview}>
    <aside className={styles.sidebar}><Sidebar section={section} /></aside>
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
      <Sidebar section={section} onNavigate={() => drawer.current?.close()} />
    </dialog>
    <main id="main-content" tabIndex={-1} className={styles.main}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <button ref={trigger} className={styles.drawerTrigger} aria-label="Open sidebar" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => { drawer.current?.showModal(); setDrawerOpen(true); }}><Icon name="menu" /></button>
          <h1>{section === "dashboard" ? "Project dashboard" : section === "team" ? "Team" : "Settings"}</h1>
        </div>
        <div className={styles.headerControls}>
          <button className={styles.workspace} type="button" onClick={event => event.preventDefault()}><Icon name="pen" size={16} /><span>{view.me.workspace.displayName}</span><Icon name="chevron" size={14} /></button>
          {section === "dashboard" && <label className={styles.search}><Icon name="search" size={16} /><span className={styles.srOnly}>Search boards</span><input type="search" name="board-search" autoComplete="off" placeholder="Search boards…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
          <button className={styles.notifications} type="button" onClick={event => event.preventDefault()} aria-label="Notifications (3 unread)"><Icon name="bell" size={18} /><span>3</span></button>
          <ProfileMenu />
        </div>
      </header>
      <p className={styles.sampleNotice}>{section === "dashboard" ? "Sample project content; boards and activity are not connected." : section === "team" ? "Sample team content — not the live workspace member list." : "Sample settings — changes are not saved."}</p>
      {children}
      {section === "dashboard" && <ProjectsTable query={query} onQueryChange={setQuery} />}
    </main>
  </div>;
}
