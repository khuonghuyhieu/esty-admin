import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { localConnectivityOrigin } from "@/features/connectivity/config";
import { ConnectivityScreen } from "@/features/connectivity/connectivity-screen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Local connectivity" },
  description: "Explicit local API process and database readiness checks. No hosted integration or business data.",
  robots: { index: false, follow: false },
};

export default async function ConnectivityPage() {
  const origin = localConnectivityOrigin(process.env);
  if (!origin) notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::[1-9]\d{0,4})?$/.test(host)) notFound();
  return <ConnectivityScreen apiOrigin={origin} />;
}
