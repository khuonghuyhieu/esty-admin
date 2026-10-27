"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "./icon";
import styles from "./application-preview.module.css";

const actions = [
  { label: "Share board", icon: "share" },
  { label: "Edit project", icon: "pen" },
  { label: "Archive project", icon: "archive" },
  { label: "Delete project", icon: "trash" },
] as const;

export function RowMenu({ title, open, onOpenChange }: { title: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialItem = useRef(0);

  useEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const element = menu.current;
    const anchor = trigger.current;
    const bounds = anchor.getBoundingClientRect();
    const menuBounds = element.getBoundingClientRect();
    const left = Math.max(12, Math.min(bounds.right - menuBounds.width, window.innerWidth - menuBounds.width - 12));
    const top = bounds.bottom + menuBounds.height + 12 <= window.innerHeight
      ? bounds.bottom + 8
      : Math.max(12, bounds.top - menuBounds.height - 8);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.querySelectorAll<HTMLButtonElement>("[role=menuitem]")[initialItem.current]?.focus({ preventScroll: true });
    const dismissOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !element.contains(event.target) && !anchor.contains(event.target)) {
        onOpenChange(false);
        anchor.focus({ preventScroll: true });
      }
    };
    const dismissOnMove = (event: Event) => {
      if (event.target instanceof Node && element.contains(event.target)) return;
      if (event.type === "scroll") {
        const current = anchor.getBoundingClientRect();
        if (current.top === bounds.top && current.left === bounds.left) return;
      }
      onOpenChange(false);
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
  }, [open, onOpenChange]);

  return <>
    <button ref={trigger} className={styles.rowTrigger} aria-label={`Actions for ${title}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { initialItem.current = 0; onOpenChange(!open); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); initialItem.current = event.key === "ArrowUp" ? actions.length - 1 : 0; onOpenChange(true); }
    }}><Icon name="more" size={16} /></button>
    {open ? <div id={id} ref={menu} className={styles.rowMenu} role="menu" aria-label={`Actions for ${title}`} aria-describedby={`${id}-hint`} onKeyDown={(event) => {
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      } else if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        onOpenChange(false);
        trigger.current?.focus({ preventScroll: true });
      } else if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
        const next = items.find((item) => item.textContent?.toLowerCase().startsWith(event.key.toLowerCase()));
        next?.focus();
      }
    }}>
      {actions.map((action) => <button key={action.label} type="button" role="menuitem" tabIndex={-1} aria-disabled="true" onClick={(event) => event.preventDefault()}><Icon name={action.icon} size={16} />{action.label}</button>)}
      <p id={`${id}-hint`}>Actions are unavailable in this UI preview. No changes are saved.</p>
    </div> : null}
  </>;
}
