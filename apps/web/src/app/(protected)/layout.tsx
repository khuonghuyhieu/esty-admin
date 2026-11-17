import type { ReactNode } from "react";
import { SessionProvider } from "@/features/app-session/session-provider";
import { ApplicationShell } from "@/features/application-preview/application-shell";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  // Pages validate envelopes for sample-only payloads; current client admission gates display.
  return <SessionProvider initial={{ restore: true }}><ApplicationShell>{children}</ApplicationShell></SessionProvider>;
}
