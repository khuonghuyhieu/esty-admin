import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/site/header";
import { Footer } from "@/components/site/footer";
import { readSiteConfig } from "@/lib/site-config";
import "./globals.css";

const displayFont = localFont({
  src: "./fonts/DeliusSwashCaps-Regular.ttf",
  variable: "--font-display",
  weight: "400",
  display: "swap",
});
const bodyFont = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});

const site = readSiteConfig();
export const metadata: Metadata = {
  title: { default: site.appName, template: `%s | ${site.appName}` },
  description: "A planned internal workspace for our team’s own Etsy shop: order review and BurgerPrints fulfillment preparation. Integrations are not active.",
  robots: { index: site.indexable, follow: site.indexable },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}><body>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header appName={site.appName} />
      {site.mode !== "release" ? <div className="draft-banner"><div className="wrap">{site.mode === "preview" ? "Preview" : "Draft"} website. Working title; publication details are not yet confirmed.</div></div> : null}
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
    </body></html>
  );
}
