import Link from "next/link";

function ReviewIcon({ kind }: { kind: "details" | "prepare" | "team" }) {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {kind === "details" ? <><path d="m7 3 14 1 1 21-16-1Z" /><path d="m10 10 2 2 5-5M10 17h8M10 21h5" /></> : kind === "prepare" ? <><path d="m3 9 11-6 11 6-1 14-10 3-11-5Z" /><path d="m3 9 11 5 11-5M14 14v12M8 6l11 6v6" /></> : <><circle cx="10" cy="8" r="4" /><path d="M2 24v-4a8 8 0 0 1 16 0v4M20 4a4 4 0 0 1 0 8M22 16a6 6 0 0 1 4 6v2" /></>}
    </svg>
  );
}

export function Landing() {
  return (
    <>
      <section className="dotted" aria-labelledby="home-title">
        <div className="hero wrap">
          <div className="hero-copy">
            <p className="status">In development · Integrations not active</p>
            <h1 id="home-title">A little order.<br />Before fulfillment.</h1>
            <p className="lead">A planned internal workspace for our team’s own Etsy shop. Review order details and prepare fulfillment information, with a human check before handoff.</p>
            <div className="actions">
              <a className="button" href="#workflow">Explore the workflow</a>
              <Link className="button secondary" href="/privacy">Privacy overview</Link>
            </div>
            <p className="small">An overview of the idea, not a connected shop or live service.</p>
          </div>
          <aside className="work-sheet" aria-labelledby="sheet-title">
            <p className="sheet-caption">Conceptual preparation sketch</p>
            <h2 id="sheet-title">The details come first</h2>
            <ul className="review-notes">
              <li><ReviewIcon kind="details" />Product &amp; variation</li>
              <li><ReviewIcon kind="details" />Artwork information</li>
              <li><ReviewIcon kind="prepare" />Shipping details</li>
              <li><ReviewIcon kind="team" />Team review</li>
            </ul>
            <p className="sheet-bottom">Review → Prepare → Check<br />A workflow concept, not live order data.</p>
          </aside>
        </div>
      </section>

      <section className="section alternate" aria-labelledby="features-title">
        <div className="wrap">
          <div className="section-heading">
            <h2 id="features-title">Room for the details that matter</h2>
            <p className="lead">Planned tools for our internal team, from the first order review to a carefully prepared handoff.</p>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-icon"><ReviewIcon kind="details" /></span>
              <h3>Check order details</h3>
              <p>The planned workspace would bring products, variations, artwork and shipping information into the same review.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon"><ReviewIcon kind="prepare" /></span>
              <h3>Organize preparation</h3>
              <p>Prepare fulfillment information for the proposed BurgerPrints pilot. Supplier output and submission are not available yet.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon"><ReviewIcon kind="team" /></span>
              <h3>Keep review human</h3>
              <p>Give the team a clear point to check the details before handoff. No automatic processing is running on this website.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section dotted" id="workflow" aria-labelledby="workflow-title">
        <div className="wrap">
          <div className="section-heading">
            <h2 id="workflow-title">The planned path</h2>
            <p className="lead">Three steps to prepare, not a promise of live fulfillment.</p>
          </div>
          <ol className="workflow-steps">
            <li><span className="step-number" aria-hidden="true">1</span><h3>Review the details</h3><p>Our team would review orders from our own Etsy shop, checking the product, variation, artwork and delivery information.</p></li>
            <li><span className="step-number" aria-hidden="true">2</span><h3>Prepare the information</h3><p>Organize the information needed for fulfillment. BurgerPrints is the only supplier in the proposed pilot.</p></li>
            <li><span className="step-number" aria-hidden="true">3</span><h3>Check before handoff</h3><p>The team would check the prepared details before any supplier handoff. Supplier submission needs separate implementation and verification.</p></li>
          </ol>
          <p className="workflow-note">Etsy API access, shop authorization and supplier integration are not active. These planned steps are not actions you can perform here.</p>
        </div>
      </section>

      <section className="section alternate" id="scope" aria-labelledby="scope-title">
        <div className="scope wrap">
          <h2 id="scope-title">Our own shop.<br />One focused pilot.</h2>
          <div><p>This application is intended for the owner’s internal team and own Etsy shop. It is not offered to external sellers.</p><p>Today, you can read this overview and the privacy page. There is no sign-in, shop connection, order import or supplier submission on this website.</p><Link className="text-link" href="/privacy#contact">Check operator &amp; contact status</Link></div>
        </div>
      </section>

      <section className="section closing dotted" aria-labelledby="closing-title">
        <div className="wrap">
          <h2 id="closing-title">A clear idea. An honest starting point.</h2>
          <p className="lead">Read how the current website works and what must be clarified before planned shop-data handling begins.</p>
          <div className="actions"><Link className="button" href="/privacy">Read the privacy overview</Link><a className="button secondary" href="#scope">Review the project scope</a></div>
        </div>
      </section>
    </>
  );
}
