import type { Metadata } from "next";
import { SettingsScreen } from "@/features/workspace-foundation/settings-screen";
import { guardApplication } from "@/features/app-session/server";
import { ProtectedRoute } from "@/features/app-session/protected-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Settings preview" },
  description: "Sample Account and Workspace settings. Local changes are not saved.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const initial = await guardApplication("/settings");
  return <ProtectedRoute admission={initial}>{initial.phase === "ready" ? <SettingsScreen /> : null}</ProtectedRoute>;
}
