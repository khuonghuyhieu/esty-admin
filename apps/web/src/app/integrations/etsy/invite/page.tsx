import type { Metadata } from "next";
import { EtsyRecipientScreen } from "@/features/etsy-connection/recipient-screen";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: { absolute: "Lovora — Etsy shop invitation" },
  description: "Review a private Etsy shop connection invitation before granting consent.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function EtsyInvitationPage() {
  return <EtsyRecipientScreen />;
}
