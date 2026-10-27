import type { ReactNode } from "react";
import { Header } from "./header";
import { Footer } from "./footer";
import { readSiteConfig } from "@/lib/site-config";

export function PublicShell({ children }: { children: ReactNode }) {
  const site = readSiteConfig();
  return <>
    <Header appName={site.appName} />
    {site.mode !== "release" ? <div className="draft-banner"><div className="wrap">{site.mode === "preview" ? "Preview" : "Draft"} website. Working title; publication details are not yet confirmed.</div></div> : null}
    <main id="main-content" tabIndex={-1}>{children}</main>
    <Footer />
  </>;
}
