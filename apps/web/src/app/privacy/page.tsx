import type { Metadata } from "next";
import { Privacy } from "@/features/privacy/privacy";
import { readSiteConfig } from "@/lib/site-config";

const site = readSiteConfig();
export const metadata: Metadata = {
  title: "Privacy overview",
  description: "Privacy for the informational website and planned internal own-shop workspace: current-site handling, future Etsy shop data, and operator/contact status.",
  alternates: site.canonicalOrigin ? { canonical: `${site.canonicalOrigin}/privacy` } : undefined,
};
export default function PrivacyPage() { return <Privacy site={site} />; }
