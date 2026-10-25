import type { Metadata } from "next";
import { Landing } from "@/features/landing/landing";
import { readSiteConfig } from "@/lib/site-config";

const site = readSiteConfig();
export const metadata: Metadata = {
  title: { absolute: `Planned order workflow | ${site.appName}` },
  alternates: site.canonicalOrigin ? { canonical: site.canonicalOrigin } : undefined,
};
export default function HomePage() { return <Landing />; }
