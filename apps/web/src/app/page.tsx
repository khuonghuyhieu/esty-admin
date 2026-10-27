import type { Metadata } from "next";
import { Landing } from "@/features/landing/landing";
import { readSiteConfig } from "@/lib/site-config";
import { PublicShell } from "@/components/site/public-shell";

const site = readSiteConfig();
export const metadata: Metadata = {
  title: { absolute: `Internal own-shop workflow | ${site.appName}` },
  alternates: site.canonicalOrigin ? { canonical: site.canonicalOrigin } : undefined,
};
export default function HomePage() { return <PublicShell><Landing /></PublicShell>; }
