import type { Metadata } from "next";
import { TeamScreen } from "@/features/workspace-foundation/team-screen";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Team preview" },
  description: "Synthetic users and illustrative roles. No real accounts or permission enforcement.",
  robots: { index: false, follow: false },
};

export default function TeamPage() {
  return <TeamScreen />;
}
