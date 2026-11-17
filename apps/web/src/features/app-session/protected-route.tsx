"use client";

import { use, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAppSession } from "./session-provider";
import type { RouteAdmission } from "./session-controller";

export function ProtectedRoute({ admission, children }: { admission: RouteAdmission; children: ReactNode }) {
  const pathname = usePathname();
  const { view, navigationPending, routePreparation, concealDeniedRoute, admitRoute } = useAppSession();
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
  // Cached history has no RSC wait: suspend its destination on the current intent.
  // Known server denial must still commit its concealment effect without waiting.
  if (admission.phase === "ready" && view.phase === "ready" && view.routePending
    && routePreparation?.path === admission.path) use(routePreparation.result);
  const ready = (checked === admission || view.routePath === admission.path) && pathname === admission.path && admission.phase === "ready"
    && view.phase === "ready" && (!view.routePending || navigationPending) && view.generation === admission.generation;
  return ready ? children : <div aria-busy="true" style={{ minHeight: "60vh" }} />;
}
