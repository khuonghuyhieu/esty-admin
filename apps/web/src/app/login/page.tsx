import type { Metadata } from "next";
import { LoginScreen } from "@/features/workspace-foundation/login-screen";
import { hasRestorableSession } from "@/features/app-session/server";
import { safeReturnPath } from "@/features/app-session/config";
import { SessionProvider } from "@/features/app-session/session-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Sign in" },
  description: "Sign in to your workspace.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const returnTo = safeReturnPath((await searchParams).returnTo);
  const restore = await hasRestorableSession();
  return <SessionProvider mode="login" initial={{ restore }} returnTo={returnTo}><LoginScreen /></SessionProvider>;
}
