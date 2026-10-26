# Implementation plan: Developer website

Date: 2026-10-25 · Revised: 2026-10-26 · Branch: existing `main` (correction handoff baseline `128cfc8`) · Status: T013–T020 complete, including external review and owner visual acceptance; FE commit/push authorized.

Input: [spec.md](spec.md), [ARCH-001](../architecture.md) and the owner's Next.js/Vercel/GoDaddy decisions. This compact plan keeps technical research and validation here because this feature has no persistent entities or external API contracts. It does not claim a full Spec Kit CLI run.

## Summary

Build one Next.js frontend with a public landing page and privacy page, then deploy it on Vercel to obtain a verified URL for Etsy registration. Backend/database connectivity is a later deliverable. Use the existing three UI skills and static content reference.

Current increment: correct the public UI against the owner's marketing reference and align content with internal team/own-shop use. The owner explicitly authorized T013–T019 implementation after planning, then accepted the local preview/comparisons under T020 and requested FE commit/push. Preserve T001–T008 as historical completion. Application-screen implementation, backend/OAuth and deferred domain setup are outside this FE increment; separately coordinated BE work is excluded from the FE commit. No manual deployment or DNS action is included.

For React/Next.js implementation and review, also read [vercel-react-best-practices](../../.agents/skills/vercel-react-best-practices/SKILL.md) and the relevant rules before changing components, pages/layouts, Server/Client boundaries, hydration or bundle loading. Consult fetching/caching rules only if the feature actually needs those behaviors. Use documentation matching the installed Next.js version for framework APIs; keep the public website scope unchanged.

## Technical context

| Item | Planning decision | Authority |
| --- | --- | --- |
| Framework / hosting | Next.js on Vercel | Owner decision |
| Domain | `lovora.us`, preferred `app.lovora.us`; setup deferred; current host `esty-admin.vercel.app` | Owner statement |
| Routing / language | App Router, TypeScript; mostly server components and static pages | Implementation design |
| Version baseline | Next.js 16.4.3, React/React DOM 19.3.1; Node.js 24.22.1 | Registry versions/peer ranges verified; exact direct pins and root lockfile installed |
| Styling | Plain CSS/CSS Modules with project tokens derived from the supplied rendered references; preserve upstream Doodle files | Owner's concrete reference direction supersedes generic blue/white styling |
| Package layout | npm workspaces; one application `apps/web`; one root lockfile | Existing monorepo boundary adapted to a frontend-only first phase |
| Data / external contracts | No persistence or business API in this feature | Feature scope |
| Checks | ESLint, TypeScript, production build, functional acceptance and Playwright E2E; manual visual/accessibility review | Acceptance implementation and owner-requested feature testing |

Runtime verification uses Node 24.22.1 through `npm exec --yes --package=node@24.22.1 -- …` because the default shell is Node 26.10.0. `.nvmrc` and workspace engines select Node 24. TypeScript 5.9.3 stays within the installed typescript-eslint supported range rather than adopting registry-latest TypeScript 7. ESLint 10.13.0 is the direct supported release; Next's plugin dependency tree still installs deprecated ESLint 9.39.5. Do not force incompatible peer overrides. Playwright is pinned to 1.64.1.

## Constitution check

- Owner stack decisions are explicit and supersede earlier Cloudflare Pages/foundation-first direction.
- One repository and one frontend; no empty API directory, duplicate checkout, database, queue or shared package.
- Constitution v1.2.0 distinguishes website acceptance from deferred connectivity acceptance.
- Specs own requirements; this plan owns implementation design; tasks own technical execution; Notion owns milestone/status tracking.
- Publication is a separate milestone with actual evidence; docs/build output cannot establish an Etsy integration or app approval.

## Planned source structure

Implemented application paths:

```text
package.json                       npm workspace and root commands
package-lock.json                  one dependency lockfile
apps/web/
  package.json                     @esty-admin/web and framework scripts
  next.config.ts                   legacy /privacy.html redirect
  src/app/layout.tsx               document, metadata, shared shell
  src/app/page.tsx                 home route entrypoint
  src/app/privacy/page.tsx         privacy route entrypoint
  src/app/not-found.tsx            way back home
  src/app/globals.css              tokens, base styles, focus/reduced motion
  src/features/landing/            landing composition, copy, workflow visual
  src/features/privacy/            privacy content and layout
  src/components/site/            shared header/footer/navigation
  src/lib/site-config.ts           validated public deployment/contact config
```

Keep route entrypoints thin and compose feature UI. Add a shared component only when reused. Keep `dist/` unchanged as reference until migration is verified; Vercel deploys `apps/web`, not `dist/`.

## UI and content design

### Owner-supplied reference review (2026-10-26)

The owner identified two separate visual references after reviewing the deployed UI:

- Marketing: https://doodle-typeui-9fa2feab.vercel.app/marketing
- Application: https://doodle-typeui-9fa2feab.vercel.app/application

Both pages were opened with Playwright and captured at 1440px and 390px. Their rendered appearance differs from the generic blue/white tokens in the installed Doodle skill and the earlier plan below. For the requested redesign, use these concrete references as the visual direction; do not claim fidelity merely because the skill is loaded. Preserve pinned upstream skill files.

Observed shared treatment: warm paper `#f9f6f0`, alternate surface `#efebe1`, dotted canvas texture, dark sketch outlines (`3px solid #111827` tokens), asymmetric corner radii, offset solid shadows and muted peach accents. Marketing uses Delius Swash Caps for display headings and Geist for main body text. Application uses system sans-serif for its headings, controls and data; it does not use handwriting throughout the dashboard.

The marketing reference supplies public-page composition and styling: horizontal navigation, split hero/product illustration, grouped feature sections and closing CTA/footer. Adapt these to truthful internal-team Etsy content. Its whiteboard product, customer logos, testimonials, metrics and paid plans are sample content, not approved product facts.

The application reference supplies an operational shell: left sidebar, top workspace/search/profile controls, summary cards, chart/activity panels and a searchable/filterable data table with status badges and row actions. The website implementation currently has none of these. This reference does not turn operational application behavior into completed or approved feature 002 tasks; agree the relevant Etsy screens and interactions before generating their implementation tasks. Mock data must remain explicitly identified.

Reference fidelity needs a separate visual comparison alongside functional/E2E acceptance, using the same viewport for reference and implementation. The application reference itself overflows horizontally at 390px (`scrollWidth=845`); adapt navigation and tables for narrow screens rather than reproducing that defect.

For the redesign, require these visual acceptance steps before reporting completion:

1. Capture the relevant reference and implemented page at matching desktop/mobile viewports; retain review screenshots and record any unavailable reference as a limitation.
2. Compare typography, paper/dotted backgrounds, palette, outline/radius/shadow treatment, spacing and section or application-shell hierarchy. Fix material deviations and document intentional differences for Etsy content, accessibility and responsive behavior.
3. Show the owner the implemented preview with the comparison evidence for visual acceptance. Passing functional tests or a code review alone does not establish owner acceptance of the design. Do not promise identical screenshots where content or responsive adaptations differ.

TypeUI capability check (2026-10-26): current [account terms](https://www.typeui.sh/terms) place copying/downloading, MCP access and design-system creation behind Creative, All-access or eligible Lifetime access. The [current package documentation](https://www.typeui.sh/docs/overview/getting-started) describes separate color, typography, layout and component files. The installed GitHub Doodle snapshot contains `SKILL.md`, `DESIGN.md` and its MIT `LICENSE`; it is general guidance rather than that detailed package. This does not prove that a paid package would match these specific previews. The owner authorizes using the two supplied previews as the fallback visual reference; continue with project-authored implementation and explicit visual comparison. No subscription purchase, paid-resource download or TypeUI MCP setup is needed for the chosen workflow.

### Resolved public redesign

Design intent: a paper-and-sketch public website that visibly follows the selected marketing reference while explaining the internal Etsy workspace truthfully.

| Foundation | Implementation direction | Acceptance |
| --- | --- | --- |
| Surfaces | Paper `#f9f6f0`, alternate paper `#efebe1`; subtle dotted texture on marketing sections | Match the reference's warm page/section rhythm; decorative texture must not impair reading |
| Ink / accent | Dark sketch ink `#111827`, peach surface accent starting from observed `#eacdc2`; use darker readable text on accents | Verify text contrast at least 4.5:1 for normal text and 3:1 for large text; controls/focus remain distinguishable |
| Typography | Delius Swash Caps for marketing display headings/brand accents; Geist for body/navigation; system sans fallback | Verify the actual fonts load before visual review; do not silently accept the previous Avenir/system display treatment |
| Fonts / assets | Prefer licensed self-hosted font assets with their notices, loaded using the installed framework's supported local-font mechanism | Verify official asset source/license during implementation; keep marketing free of third-party runtime font requests; record unavailable assets as a limitation |
| Outline / shadow | Approximately 3px dark outlines, asymmetric elliptical corners and solid offset shadows, tuned against the actual reference | Apply consistently to buttons, illustration and feature panels; avoid transforming text or entire dense content areas |
| Spacing / width | Reuse 4/8/12/16/24/32 spacing; desktop max-width about 1248px, 24–32px desktop gutters and 20–24px mobile gutters | Compare section density at 1440px; preserve legible line lengths and no page overflow at 360px/390px |
| Public components | Shared paper navigation/footer, sketch button and panel treatment, text links and status note | Visible hover, active and keyboard focus; semantic links for navigation; no menu/control that has no implemented behavior |

Exact reference treatment is the target; measured accessibility or responsive changes must be documented rather than silently introducing another aesthetic. Retain blue only where an observed illustration/status treatment warrants it, not as the dominant site palette.

Public page composition and content mapping:

1. Header: working app name, `Workflow`, `Scope` and `Privacy` links; links target existing page sections or `/privacy`. Preserve the skip link and truthful draft/preview status.
2. Split hero: handwritten display heading and concise internal-team purpose on the left; a sketch panel depicting order review/preparation on the right. Primary CTA scrolls to `#workflow`; secondary CTA opens privacy. The illustration is explicitly conceptual, with no invented live order totals or status.
3. Feature group: readable sketch panels for checking order details, organizing preparation and keeping team review clear. Describe capabilities as planned. Use this section in place of the reference's customer-logo strip and whiteboard feature copy.
4. Workflow section (`#workflow`): review details → prepare fulfillment information → team checks before handoff. Explain separately that Etsy access and supplier integration are not active; BurgerPrints remains the only proposed pilot, without claiming supplier submission works.
5. Scope section (`#scope`) and closing CTA: internal team/own Etsy shop, current development status and working privacy link. Omit pricing, external seller signup, customer metrics, testimonials and sales/demo actions.
6. Shared footer: real navigation and existing Etsy disclaimer. Keep public identity/contact handling under the existing configuration gate.

Privacy remains a document with a constrained reading column (about 65–75 characters), readable body type and consistent paper/heading/notice styling. Preserve factual current-site handling, hosting-log caveats, unresolved operator/contact status and return navigation. Apply the public shell to not-found recovery without inventing another page layout.

Implemented surfaces: `apps/web/src/app/globals.css`, `layout.tsx`, `page.tsx`, `privacy/page.tsx`, `not-found.tsx`, `src/components/site/header.tsx`, `footer.tsx`, `src/features/landing/landing.tsx` and `src/features/privacy/privacy.tsx`. Licensed font assets and unmodified OFL notices are under `apps/web/src/app/fonts/`. Routes, Server Components and configuration policy remain intact; no new UI kit, dependency or runtime service was needed.

#### Verified font provenance and implementation choices

Assets were downloaded directly on 2026-10-26, without npm changes, from the official [Google Fonts Delius Swash Caps directory](https://github.com/google/fonts/tree/main/ofl/deliusswashcaps) and [Vercel Geist repository](https://github.com/vercel/geist-font/tree/main/fonts/Geist/webfonts). Downloaded bytes matched the API-reported Git blob IDs. Both fonts are distributed under SIL Open Font License 1.1; adjacent `DeliusSwashCaps-OFL.txt` and `Geist-OFL.txt` preserve the complete upstream notices.

| Local asset | Upstream Git blob | SHA-256 |
| --- | --- | --- |
| `DeliusSwashCaps-Regular.ttf` (63,052 bytes) | `1dc6c3a7eba87506b25382877c3811059a12364d` | `04c102448007265b8a0672590900919d35dfd26c624e543c8c3bfbab9535b642` |
| `Geist-Variable.woff2` (69,760 bytes) | `71dab8bedba3bfef5dccd7875ed05cac44c7345d` | `2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1` |

Module-level `next/font/local` declarations follow the installed Next.js 16.4.3 font documentation, using swap/preload and CSS variables. Chromium platform-font inspection confirmed actual Delius Swash Caps and Geist glyph rendering, not just computed fallback names. All observed production font requests were same-origin.

Display-stroke correction: live reference inspection confirms H1, section headings, buttons and brand all compute to weight 600 while rendering the actual `DeliusSwashCaps-Regular` face (declared 400), with font synthesis enabled. The first local pass at weight 400 was visibly too light. Match the observed reference with weight 600 and narrowly scoped `font-synthesis: weight` on display headings/buttons/brand; Geist body type keeps synthesis disabled. This is a measured fidelity correction, not a new font or dependency.

Intentional adaptations: keep body text at 16px and mobile leads at 20px; darken muted text to `#535963`; keep mobile navigation visible and non-sticky for keyboard/reflow; retain the truthful draft banner. The three feature panels replace both sample logos and product features; numbered workflow denotes actual sequence only. Privacy uses a 760px maximum reading column without dotted text background. These differences do not claim pixel identity or owner acceptance.


### Application design boundary — next planning slice

Use the application reference for its sidebar, top bar, compact readable type, summary panels, activity layout and data-table controls. The reference's whiteboard concepts are not our application model. The following is a proposal for later owner confirmation, not an executable implementation scope:

| Candidate screen | Internal Etsy purpose | Decision needed before implementation |
| --- | --- | --- |
| Overview | Team work summary and recent processing activity | Which counts/statuses are meaningful and backed by available data? |
| Orders | Search/filter a list and open an order | Required fields, statuses, filters, sorting and permitted actions |
| Order detail | Review product, variation, artwork and shipping information | Editable fields, validation and whether saving is part of the first slice |
| Connections | View/connect the team's Etsy shop | User access, OAuth/backend ownership and real API readiness |

Do not add sidebar destinations such as billing/team/settings merely because they appear in the reference. Decide whether the first application deliverable is an explicitly labeled UI prototype or a working connected feature before specifying its tasks. App route placement (for example `/app`), authentication, empty/loading/error states and data contract belong to that follow-up decision. Do not build a public mock admin or empty routes during T013–T020. Feature 001 retains connectivity ownership; a future application feature must link to it rather than duplicate its backend scope. No new application spec, tracker or source skeleton is created by this planning increment.

### Verification, comparison and implementation handoff

Extend `apps/web/tests/e2e/website.spec.ts`, retaining the existing production journey and configuration suite. Replace the old exact navy focus-color assertion with meaningful focus visibility/contrast acceptance for the new palette. Replace external-seller wording assertions with internal own-shop wording; update heading/link expectations only when approved copy changes their accessible names. Test each new anchor/CTA destination rather than adding tests that merely mirror CSS properties. Keep redirect/query preservation, real 404, truthful draft metadata, contact handling, keyboard order, 200% text reflow and reduced motion coverage. Do not loosen these checks simply to fit the redesign.

After implementation, use the root commands in README under Node 24.22.1: lint, typecheck, functional tests and production E2E (which already builds production). A separate repeated build is unnecessary unless debugging requires it. Review computed text/focus contrast and screenshot both public pages at 1440×1000, 390×844 and 360×800; the latter complements the two existing E2E widths. At 1440×1000 and 390×844, recapture the marketing reference with loaded fonts and use the same browser, zoom and viewport for the implementation comparison. Do not use full-page pixel equality across different product copy or page lengths as acceptance.

Retain final comparison screenshots under the existing ignored `apps/web/test-results/visual/` after the last E2E run (Playwright may clear test results). Compare the hero, one feature/workflow section, navigation/footer and privacy adaptation. In PROJECT_STATE record a compact matrix for typography, surfaces/texture, palette, outlines/shadows, spacing/hierarchy and responsive behavior: pass, unresolved mismatch or intentional adaptation with reason. Record unavailable references/fonts and never substitute screenshots from an earlier build as final proof. Baseline images from the earlier investigation are session evidence only and must be recaptured for the implementation handoff.

OMP was the sole FE implementation writer. The coordinator completed the separate read-only `gpt-6-luna` review with no actionable findings; T019 evidence is recorded in PROJECT_STATE. The owner accepted the local preview and final comparisons under T020, then explicitly authorized FE commit/push to existing `main`. Publishing to production-linked `main` may trigger the hosting provider's configured automation; no successful deployment is inferred from a Git push. Parallel BE work uses separately leased paths and remains excluded from this FE publication.

Use semantic links/buttons, skip navigation, visible focus, heading order, decorative SVG hiding and reduced motion. Preserve planned-versus-working wording. Fetch the current web-design-guidelines when reviewing the implemented UI.

## Environment and deployment

| Input | Purpose | When required |
| --- | --- | --- |
| `SITE_MODE` | `draft` (default), `preview`, or explicit `release` | Optional locally; independent of `NODE_ENV` |
| `SITE_URL` | Absolute HTTPS origin with a DNS hostname; no credentials, nondefault port, path, query or fragment | Release |
| `APP_NAME` | Owner-confirmed application title | Release |
| `SUPPORT_EMAIL` | Plain validated public email, not a URL or header payload | Release |
| `OPERATOR_NAME` | Owner-confirmed public operator identity | Release |
| `PUBLICATION_CONFIRMED` | Literal `true` after owner confirmation of facts and privacy wording | Release |
| `VERCEL_ENV` | Host-managed preview detection; preview rejects explicit release mode | If hosting supplies it |

Configuration policy: build-time validation runs from `next.config.ts` and page composition. Missing facts are allowed in draft/preview, but supplied malformed facts fail rather than silently changing destination. Missing mode defaults to preview only for `VERCEL_ENV=preview`, otherwise draft, including production builds. No URL fallback is invented: draft/preview omit canonical links and emit `noindex, nofollow`; `VERCEL_URL` is deliberately not used as a production identity. They use the explicitly labeled working title and hide operator/contact values even when populated. Release requires all facts and confirmation, exposes the contact as `mailto:` and emits route-specific canonical links only from validated `SITE_URL`. Changing these values requires rebuilding.

`npm run check:release` forces release validation without publishing. It reads exported environment values (not `.env.local` automatically); `next build` loads Next environment files. Passing validation proves syntax and an explicit confirmation flag, not ownership, TLS, public availability or actual owner approval. SC-004 remains pending the human publication confirmation in T009. Custom domain configuration is optional; a subsequently verified host-provided HTTPS origin may be used. No secret keys, backend or database variables are needed.

Vercel plan: select the personal project/repository explicitly, Next.js preset, root `apps/web`, Node 24.x and the workspace lockfile. Confirm install/build resolution from the root lockfile in a preview before production. Keep Vercel-managed output defaults; do not point output to legacy `dist/`.

First verify the host-provided HTTPS URL. Then add the supplied GoDaddy hostname in Vercel and apply the project-specific records Vercel reports at that time. Do not hardcode DNS targets, replace nameservers, or change mail/unrelated records by assumption. Verify direct home/privacy loads, redirects, certificate and canonical host. Capture actual deployment URL/project/build results and rollback reference.

### Publication inputs still needed

Confirmed app title, operator identity, support email, final privacy wording and intended Vercel project access remain missing. The exact GoDaddy hostname is optional for the initial host-provided URL. These do not block local builds and tests; they block submission-ready publication. No account access or DNS change has been made.

### Deployment sequence

The owner has now requested Vercel deployment for Etsy registration, preferring the provider plugin/MCP. Preserve the implemented source and existing test evidence; no new feature generation or full CLI initialization is required.

1. Resolve access: install/connect the available Vercel plugin, inspect its live capabilities and select the intended account/team and project. Reuse an existing matching project. Current discovery found the plugin uninstalled/unconnected; no account inventory has been read. If MCP cannot upload the local source or configure the project, explain the specific gap and use the documented Vercel CLI/browser fallback with the same account/project.
2. Confirm the release facts and current privacy copy with the owner. Never infer legal identity, email or approval. The source is currently uncommitted; use an authorized local-source deployment if supported, or obtain commit/push authorization if the chosen deployment path requires Git publication.
3. Configure a single Next.js project rooted at `apps/web`, Node 24.x and the npm workspace/root lockfile. Keep framework output defaults. Verify the remote build in draft/preview mode first; do not install Playwright browsers in the hosting build just to rerun already-passing local E2E.
4. Read the actual stable production hostname assigned to the project. Set production-only `SITE_MODE=release`, validated `SITE_URL`, confirmed `APP_NAME`, `OPERATOR_NAME`, `SUPPORT_EMAIL` and `PUBLICATION_CONFIRMED=true` only after confirmation. Keep preview environments out of release mode. Rebuild/deploy to apply build-time facts; do not bypass the release gate.
5. Verify the production domain from an unauthenticated session: HTTPS, successful `/` and `/privacy`, cross-page links, `/privacy.html` redirect, unknown-route recovery, correct title/canonicals and real contact. Do not use an authenticated MCP/browser success or a protection-bypass token as proof of public availability. Keep preview/deployment protection intact where possible; the public production domain is the intended registration URL.
6. Record the actual project, deployment/build result, stable HTTPS URL and previous deployment/rollback option in PROJECT_STATE; record a first deployment without inventing a previous rollback target. Complete T009/T010 only with their respective evidence. Update existing Notion C2-01 with the verified URL under T012. GoDaddy connection remains optional T011; actual Etsy registration is a subsequent action.

## Root commands and verification

README owns executable commands for installation, browser setup, development, lint/typecheck, production build/start, functional tests, E2E and release validation. The root scripts delegate to `@esty-admin/web`; E2E builds and starts production itself on loopback port 3100 and refuses to reuse an existing server. No backend or remote access is needed.

Owner-requested verification flow: OMP implements and runs functional/E2E checks, then a read-only Codex reviewer using `gpt-6-luna` reviews the changed code and test evidence in one concise pass. Report model availability failures rather than switching models. OMP addresses confirmed findings and reruns affected checks.

Use Node's built-in test runner for configuration boundaries: missing/blank release facts, HTTPS origin validation, malformed email/control characters, mode precedence, preview protection, confirmation and draft/preview metadata/contact policy. Browser tests in `apps/web/tests/e2e/` provide functional/E2E acceptance without a duplicate component suite. The two Chromium projects use 360px and 1440px viewports; the corrected suite covers direct routes, every link/CTA and section destination, home/privacy/home journey, 308/query preservation, real 404, keyboard order/skip target and computed focus contrast, own-shop metadata/content, draft contact gates, overflow, 200% text reflow/link bounds and reduced motion. Actual result: 25/25 functional and 22/22 E2E checks; final visual evidence follows the last E2E run in PROJECT_STATE.

Visual review uses actual production browser screenshots at desktop/mobile, keyboard focus, accessibility-tree inspection and 200% CSS zoom as a reflow approximation. Record limitations separately: automated text enlargement/CSS zoom is not OS/browser-toolbar zoom or a physical-device/screen-reader audit. No live Etsy/supplier or production-host request is part of this scope.

The original implementation used Server Components, direct imports, a single sketched order-preparation sheet, white/blue/navy tokens and system type. The correction replaces that visual treatment and introduces verified local fonts as described above, retaining static composition without unnecessary client state or fetching/cache layers. Existing pinned skills and `dist/` stay unchanged.

Registry access recovered during implementation. Fresh-install/build/test results and dependency warnings belong to PROJECT_STATE, not inferred from this plan.

## Technical sources

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): App Router, TypeScript and manual setup.
- [Next.js package release](https://registry.npmjs.org/next/latest) and [React package release](https://registry.npmjs.org/react/latest): baseline versions inspected on 2026-10-25.
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) and [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): framework deployment and Node 24 baseline.
- [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain): use actual project DNS instructions.
- [Next.js Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright): browser-based acceptance/E2E and production-build testing.
- Version-matched sources: [Next.js v16.4.3 installation](https://github.com/vercel/next.js/blob/v16.4.3/docs/01-app/01-getting-started/01-installation.mdx) and installed `node_modules/next/dist/docs/` guides for metadata, redirects and Playwright. `/docs/16/` URLs returned 404; the tagged/bundled documentation resolves the version match.

No migration, data-model or API-contract artifact is needed for this public informational website. Deferred feature 001 will own those decisions for connectivity.
