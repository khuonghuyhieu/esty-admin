import Link from "next/link";
import { PublicShell } from "@/components/site/public-shell";

export default function NotFound() {
  return <PublicShell><div className="document wrap"><p className="status">404 · Page not found</p><h1>This page is not here.</h1><p>The address may be incorrect. Return to the internal own-shop project overview or read the privacy information.</p><div className="recovery-links"><Link className="button" href="/">Return to home</Link><Link className="text-link" href="/privacy">Privacy overview</Link></div></div></PublicShell>;
}
