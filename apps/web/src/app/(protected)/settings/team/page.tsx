import type { Metadata } from "next";
import { TeamScreen } from "@/features/workspace-foundation/team-screen";
import { guardApplication } from "@/features/app-session/server";
import { ProtectedRoute } from "@/features/app-session/protected-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Team preview" },
  description: "Protected workspace with clearly labeled sample users and illustrative roles, not live team administration.",
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const initial = await guardApplication("/settings/team");
  return <ProtectedRoute admission={initial}>{initial.phase === "ready" ? <TeamScreen /> : null}</ProtectedRoute>;
}
