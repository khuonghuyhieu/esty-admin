"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAppSession } from "./session-provider";
import type { RouteAdmission } from "./session-controller";

export function ProtectedRoute({ admission, children }: { admission: RouteAdmission; children: ReactNode }) {
  const pathname = usePathname();
  const { view, concealDeniedRoute, admitRoute } = useAppSession();
  const [checked, setChecked] = useState<RouteAdmission | null>(null);
  useLayoutEffect(() => {
    // On initial mount chrome is already hidden; on navigation conceal a known denial before paint.
    if (pathname === admission.path) concealDeniedRoute(admission);
  }, [admission, pathname, concealDeniedRoute]);
  useEffect(() => {
    if (pathname !== admission.path) return;
    let active = true;
    void admitRoute(admission).then(accepted => {
      if (active && accepted) setChecked(admission);
    });
    return () => { active = false; };
  }, [admission, pathname, admitRoute]);
  const ready = checked === admission && pathname === admission.path && admission.phase === "ready"
    && view.phase === "ready" && !view.routePending && view.generation === admission.generation;
  return ready ? children : <p role="status">Loading page…</p>;
}
