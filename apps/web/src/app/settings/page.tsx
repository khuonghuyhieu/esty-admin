import type { Metadata } from "next";
import { SettingsScreen } from "@/features/workspace-foundation/settings-screen";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Settings preview" },
  description: "Sample Account and Workspace settings. Local changes are not saved.",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
