import Link from "next/link";
import type { readSiteConfig } from "@/lib/site-config";

export function Privacy({ site }: { site: ReturnType<typeof readSiteConfig> }) {
  return (
    <article className="document wrap">
      <Link className="text-link" href="/">Back to home</Link>
      <h1>Privacy overview</h1>
      <p className="lead">This website explains an application in development. It is not a connected shop or fulfillment service.</p>
      {site.mode !== "release" ? <aside className="notice" aria-label="Publication status"><strong>Draft for review</strong><p>The application name, operator identity, support contact and final privacy wording still need owner confirmation. This website is not submission-ready.</p></aside> : null}
      <section aria-labelledby="current-site"><h2 id="current-site">What this website does</h2><p>You can read the application overview and this privacy page without an account. The website has no login, forms, analytics or advertising trackers. It does not request Etsy credentials, connect shops, accept orders or receive artwork uploads.</p><p>The website does not set application cookies or store visitor information in browser storage. The hosting provider may process technical request information, such as IP addresses, requested URLs and browser details, to deliver and secure the site. Host logging settings and retention must be verified for the actual deployment; this page does not promise a specific retention period.</p></section>
      <section aria-labelledby="future-data"><h2 id="future-data">Planned application data</h2><p>A future application is intended to use seller-authorized order and transaction details to support order review and BurgerPrints fulfillment preparation. Etsy authorization, order import, shop-data separation and supplier submission are not implemented on this site.</p><p>Before those capabilities are introduced, the privacy information must describe the actual data collected, permissions, recipients, safeguards, retention and deletion process. No API scopes, retention schedule or automated deletion service are claimed here.</p></section>
      <section aria-labelledby="contact"><h2 id="contact">Operator &amp; contact</h2>
        {site.operatorName && site.supportEmail ? <><p>Website operator: {site.operatorName}.</p><p>For privacy questions, email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. This opens your email application; it is not an on-site support or deletion service.</p></> : <><p>The operator’s public identity and support email have not been confirmed. There is no contact form or active support link on this draft.</p><p>A confirmed contact and owner-approved privacy wording are required before submission-ready publication.</p></>}
      </section>
      <Link className="button" href="/">Return to home</Link>
    </article>
  );
}
