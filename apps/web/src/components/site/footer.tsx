import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer wrap">
      <div><p>An application in development. Not a live fulfillment service.</p>
        <p className="small">Etsy is a trademark of Etsy, Inc. This project is not endorsed or certified by Etsy, Inc.</p></div>
      <Link href="/privacy">Privacy &amp; contact status</Link>
    </footer>
  );
}
