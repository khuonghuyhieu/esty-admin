import type { Metadata } from "next";
import { ApplicationPreview } from "@/features/application-preview/application-preview";
import { guardApplication } from "@/features/app-session/server";
import { SessionProvider } from "@/features/app-session/session-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Project dashboard" },
  description: "Protected workspace with current session identity and clearly labeled sample project content.",
  robots: { index: false, follow: false },
};

export default async function ApplicationPage() {
  const initial = await guardApplication("/application");
  return <SessionProvider initial={initial}><ApplicationPreview /></SessionProvider>;
}
