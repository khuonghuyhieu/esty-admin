import type { NextConfig } from "next";
import { readSiteConfig } from "./src/lib/site-config";

// Validate before compilation as well as rendering. Production builds may be drafts.
readSiteConfig();

const config: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/privacy.html", destination: "/privacy", permanent: true }];
  },
};
export default config;
