"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAppSession } from "../app-session/session-provider";
import styles from "../application-preview/application-preview.module.css";

export function ProfileMenu() {
  const { view, signOut } = useAppSession();
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const element = menu.current;
    const anchor = trigger.current;
    const bounds = anchor.getBoundingClientRect();
    const menuBounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(12, Math.min(bounds.right - menuBounds.width, innerWidth - menuBounds.width - 12))}px`;
    element.style.top = `${bounds.bottom + menuBounds.height + 12 <= innerHeight ? bounds.bottom + 8 : Math.max(12, bounds.top - menuBounds.height - 8)}px`;
    element.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const dismissOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !element.contains(event.target) && !anchor.contains(event.target)) {
        setOpen(false);
        anchor.focus({ preventScroll: true });
      }
    };
    const dismissOnMove = (event: Event) => {
      if (event.target instanceof Node && element.contains(event.target)) return;
      if (event.type === "scroll") {
        const current = anchor.getBoundingClientRect();
        if (current.top === bounds.top && current.left === bounds.left) return;
      }
      setOpen(false);
      anchor.focus({ preventScroll: true });
    };
    document.addEventListener("click", dismissOutside);
    window.addEventListener("resize", dismissOnMove);
    document.addEventListener("scroll", dismissOnMove, true);
    return () => {
      document.removeEventListener("click", dismissOutside);
      window.removeEventListener("resize", dismissOnMove);
      document.removeEventListener("scroll", dismissOnMove, true);
    };
  }, [open]);

  if (!view.me) return null;
  const displayName = view.me.profile.displayName;
  const initials = displayName.split(/\s+/u).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase();

  return <>
    <button ref={trigger} type="button" className={styles.profile} aria-label={`${initials} ${displayName}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
    }}><span>{initials}</span>{displayName}</button>
    {open && <div id={id} ref={menu} className={styles.rowMenu} role="menu" aria-label="Profile" onKeyDown={event => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        event.currentTarget.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
      } else if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    }}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { setOpen(false); void signOut(); }}>Sign out</button>
    </div>}
  </>;
}
