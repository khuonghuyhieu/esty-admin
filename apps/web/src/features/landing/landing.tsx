import Link from "next/link";

export function Landing() {
  return (
    <div className="wrap">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="status"><span aria-hidden="true" />In development · Integrations not active</p>
          <h1 id="home-title">A little order.<br />Before fulfillment.</h1>
          <p className="lead">A planned workspace to review Etsy orders, check the details, and prepare fulfillment data for BurgerPrints.</p>
          <p>Designed for own-shop use and sellers who choose to authorize access. For now, this website explains the idea. It does not connect shops or process orders.</p>
          <a className="button" href="#workflow">Explore the planned workflow</a>
        </div>
        <div className="work-sheet" aria-labelledby="sheet-title">
          <span className="paper-tab" aria-hidden="true" />
          <p className="sheet-caption">From order to prepared handoff</p>
          <h2 id="sheet-title">Check the details.<br />Keep the human in control.</h2>
          <ul className="check-notes">
            <li><span aria-hidden="true">✓</span> Product &amp; variation</li>
            <li><span aria-hidden="true">✓</span> Artwork information</li>
            <li><span aria-hidden="true">✓</span> Shipping details</li>
          </ul>
          <div className="sheet-bottom"><svg aria-hidden="true" width="88" height="76" viewBox="0 0 88 76" fill="none"><path d="m10 25 32-16 35 17-1 35-33 10-32-14Z" fill="var(--accent)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="m10 25 33 16 34-15M43 41v30M28 16l34 17v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="m3 8 8 4M73 8l5-5M81 17l6-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><p>A workflow sketch,<br />not a live order.</p></div>
        </div>
      </section>
      <section className="workflow section" id="workflow" aria-labelledby="workflow-title">
        <div className="section-heading"><h2 id="workflow-title">The planned path</h2><p>Seller permission first. Operator review before any supplier handoff. These steps are not available yet.</p></div>
        <ol className="workflow-steps">
          <li><span className="step-number" aria-hidden="true">1</span><h3>Authorize a shop</h3><p>The intended flow starts with the seller choosing to grant access through Etsy authorization. API access and authorization are still pending.</p></li>
          <li><span className="step-number" aria-hidden="true">2</span><h3>Review the order</h3><p>The planned workspace would help an operator check products, variations, artwork and shipping details before preparing fulfillment data.</p></li>
          <li><span className="step-number" aria-hidden="true">3</span><h3>Prepare the handoff</h3><p>BurgerPrints is the only supplier in the proposed pilot. Supplier output and submission need separate implementation and verification.</p></li>
        </ol>
      </section>
      <section className="scope section" aria-labelledby="scope-title">
        <h2 id="scope-title">A focused pilot.<br />An honest starting point.</h2>
        <div><p>The intended audience is the owner’s shop and consenting sellers, subject to Etsy’s access requirements. Separating each shop’s data is a design requirement, not an implemented capability.</p><p>You can read this overview and the privacy page today. There is no sign-in, shop connection, order import or supplier submission on this website.</p><Link className="text-link" href="/privacy">Read the privacy overview</Link></div>
      </section>
    </div>
  );
}
