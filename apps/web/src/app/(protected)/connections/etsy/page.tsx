import type { Metadata } from "next";
import { EtsyConnectionScreen } from "@/features/etsy-connection/etsy-connection-screen";
import { guardApplication } from "@/features/app-session/server";
import { ProtectedRoute } from "@/features/app-session/protected-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: { absolute: "SketchPad — Etsy connection" },
  description: "Manage workspace Etsy consent invitations and saved connection status.",
  robots: { index: false, follow: false },
};

export default async function EtsyConnectionPage() {
  // Route admission carries no Etsy data or business authority; each BFF operation checks current BE access.
  const admission = await guardApplication("/connections/etsy");
  return <ProtectedRoute admission={admission}>{admission.phase === "ready" ? <EtsyConnectionScreen /> : null}</ProtectedRoute>;
}
