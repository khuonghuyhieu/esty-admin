import type { Metadata } from "next";
import { ApplicationPreview } from "@/features/application-preview/application-preview";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Project dashboard preview" },
  description: "UI preview with synthetic sample data. Local table interactions only; changes are not saved and integrations are not active.",
  robots: { index: false, follow: false },
};

export default function ApplicationPage() {
  return <ApplicationPreview />;
}
