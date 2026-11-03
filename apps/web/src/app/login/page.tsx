import type { Metadata } from "next";
import { LoginScreen } from "@/features/workspace-foundation/login-screen";

export const metadata: Metadata = {
  title: { absolute: "SketchPad — Sign-in preview" },
  description: "A sample sign-in form for visual review. Authentication is not connected.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginScreen />;
}
