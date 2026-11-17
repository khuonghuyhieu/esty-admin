import type { ReactNode } from "react";
import { SessionProvider } from "@/features/app-session/session-provider";
import { ApplicationShell } from "@/features/application-preview/application-shell";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  // Every page supplies its own current server admission; this persistent layout is not authority.
  return <SessionProvider initial={{ restore: true }}><ApplicationShell>{children}</ApplicationShell></SessionProvider>;
}
