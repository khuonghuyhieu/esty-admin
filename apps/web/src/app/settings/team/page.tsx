import type { Metadata } from "next";
import { TeamScreen } from "@/features/workspace-foundation/team-screen";
import { guardApplication } from "@/features/app-session/server";
import { SessionProvider } from "@/features/app-session/session-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Team preview" },
  description: "Protected workspace with clearly labeled sample users and illustrative roles, not live team administration.",
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const initial = await guardApplication("/settings/team");
  return <SessionProvider initial={initial} returnTo="/settings/team"><TeamScreen /></SessionProvider>;
}
