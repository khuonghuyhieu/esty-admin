import { readSiteConfig } from "../src/lib/site-config.ts";

readSiteConfig({ ...process.env, SITE_MODE: "release" });
console.log("Release configuration is valid. This does not verify ownership, publication, HTTPS availability or Etsy approval.");
