import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer"><div className="footer-inner wrap">
      <div><p>An internal own-shop application in development. Not a live fulfillment service.</p>
        <p className="small">Etsy is a trademark of Etsy, Inc. This project is not endorsed or certified by Etsy, Inc.</p></div>
      <nav aria-label="Footer navigation"><Link href="/">Home</Link><Link href="/#scope">Scope</Link><Link href="/privacy">Privacy &amp; contact status</Link></nav>
    </div></footer>
  );
}
