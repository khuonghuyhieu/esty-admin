import type { Metadata } from "next";
import { Privacy } from "@/features/privacy/privacy";
import { readSiteConfig } from "@/lib/site-config";

const site = readSiteConfig();
export const metadata: Metadata = {
  title: "Privacy overview",
  description: "What this informational website does, what it does not collect, and how planned shop-data handling differs from the current site.",
  alternates: site.canonicalOrigin ? { canonical: `${site.canonicalOrigin}/privacy` } : undefined,
};
export default function PrivacyPage() { return <Privacy site={site} />; }
