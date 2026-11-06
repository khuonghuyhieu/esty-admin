import type { NextConfig } from "next";
import { resolve } from "node:path";
import { readSiteConfig } from "./src/lib/site-config";
import { assertSessionOutputTree, verifySessionProject } from "./scripts/app-session-isolation.mjs";
import { productionIdentity } from "./scripts/fe-delivery.mjs";

// Validate before compilation as well as rendering. Production builds may be drafts.
readSiteConfig();
const identity = productionIdentity(process.env);

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    if (!identity) return [];
    return ["/", "/privacy", "/login"].map(source => ({
      source,
      headers: [
        { key: "x-lovora-revision", value: identity.revision },
        { key: "x-lovora-deployment", value: identity.deploymentId },
      ],
    }));
  },
  async redirects() {
    return [{ source: "/privacy.html", destination: "/privacy", permanent: true }];
  },
};
export default async function nextConfig(): Promise<NextConfig> {
  const isolated = process.env.APP_SESSION_E2E;
  if (isolated !== undefined && isolated !== "0" && isolated !== "1") throw new Error("Invalid session E2E mode");
  if (isolated === "1") {
    const manifest = await verifySessionProject(process.cwd(), process.env.APP_SESSION_E2E_RUN_ID ?? "");
    await assertSessionOutputTree(process.cwd());
    const dependencyRoot = resolve(manifest.sourceRoot, "../..");
    return { ...config, turbopack: { root: dependencyRoot }, outputFileTracingRoot: dependencyRoot };
  }
  return config;
}
