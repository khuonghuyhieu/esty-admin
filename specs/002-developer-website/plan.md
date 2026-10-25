# Implementation plan: Developer website

Date: 2026-10-25 · Branch: `docs/developer-website-planning` · Status: draft for review; application implementation not started.

Input: [spec.md](spec.md), [ARCH-001](../architecture.md) and the owner's Next.js/Vercel/GoDaddy decisions. This compact plan keeps technical research and validation here because this feature has no persistent entities or external API contracts. It does not claim a full Spec Kit CLI run.

## Summary

Build one Next.js frontend with a public landing page and privacy page, then deploy it on Vercel to obtain a verified URL for Etsy registration. Backend/database connectivity is a later deliverable. Use the existing three UI skills and static content reference.

For React/Next.js implementation and review, also read [vercel-react-best-practices](../../.agents/skills/vercel-react-best-practices/SKILL.md) and the relevant rules before changing components, pages/layouts, Server/Client boundaries, hydration or bundle loading. Consult fetching/caching rules only if the feature actually needs those behaviors. Use documentation matching the installed Next.js version for framework APIs; keep the public website scope unchanged.

## Technical context

| Item | Planning decision | Authority |
| --- | --- | --- |
| Framework / hosting | Next.js on Vercel | Owner decision |
| Domain | Existing GoDaddy domain; exact hostname pending | Owner statement |
| Routing / language | App Router, TypeScript; mostly server components and static pages | Implementation design |
| Version baseline | Next.js 16.4.3, React/React DOM 19.3.1; Node.js 24.x | Verified release baseline; lock compatible exact dependencies when setup runs |
| Styling | Plain CSS/CSS Modules and semantic Doodle tokens; no component kit required | Existing UI direction |
| Package layout | npm workspaces; one application `apps/web`; one root lockfile | Existing monorepo boundary adapted to a frontend-only first phase |
| Data / external contracts | No persistence or business API in this feature | Feature scope |
| Checks | ESLint, TypeScript and production build; manual route/responsive/keyboard review | Acceptance implementation |

The version baseline is a technical proposal, not a historical owner choice or installed package claim. At implementation, recheck supported stable/security-patched versions and record changes before locking. The local shell currently reports Node 26; project development/deployment should use the planned Node 24 baseline consistently.

## Constitution check

- Owner stack decisions are explicit and supersede earlier Cloudflare Pages/foundation-first direction.
- One repository and one frontend; no empty API directory, duplicate checkout, database, queue or shared package.
- Constitution v1.2.0 distinguishes website acceptance from deferred connectivity acceptance.
- Specs own requirements; this plan owns implementation design; tasks own technical execution; Notion owns milestone/status tracking.
- Publication is a separate milestone with actual evidence; docs/build output cannot establish an Etsy integration or app approval.

## Planned source structure

These paths do not exist yet and are created only after documentation review:

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

White background, dark ink `#111827`, navy `#263D5B`, blue accent `#49B6E5` and the 4/8/12/16/24/32 spacing scale. Use blue for accents with dark readable labels; navy for buttons with light text. Readable system body type; handwriting/sketch accents are optional around the workflow illustration.

Home composition: compact header → purpose/development status and workflow illustration → authorized-seller workflow → BurgerPrints pilot scope → privacy/contact links. Use the user's actual content, no invented metrics, testimonials, legal identity or working connect-shop CTA. Privacy is a readable document, not a decorative dashboard. Verify the actual final palette contrast and typography during UI implementation.

Use semantic links/buttons, skip navigation, visible focus, heading order, decorative SVG hiding and reduced motion. Preserve planned-versus-working wording. Fetch the current web-design-guidelines when reviewing the implemented UI.

## Environment and deployment

| Input | Purpose | When required |
| --- | --- | --- |
| `SITE_URL` | Validated absolute HTTPS canonical URL for the chosen release | Submission-ready production release |
| `SUPPORT_EMAIL` | Confirmed public contact, validated as email | Submission-ready production release |
| `OPERATOR_NAME` | Owner-confirmed operator identity for relevant privacy copy | Submission-ready production release |
| `VERCEL_URL` / deployment metadata | Host-generated preview context; not a guessed final domain | Use only if available from Vercel |

No secret keys or backend/database environment variables are required. These names are planned; no `.env` is created in this documentation task. Development can use truthful draft copy without owner facts. Validate release-required facts before claiming readiness; do not silently replace them with invented values. Preview canonical/indexing behavior must reflect preview status.

Vercel plan: select the personal project/repository explicitly, Next.js preset, root `apps/web`, Node 24.x and the workspace lockfile. Confirm install/build resolution from the root lockfile in a preview before production. Keep Vercel-managed output defaults; do not point output to legacy `dist/`.

First verify the host-provided HTTPS URL. Then add the supplied GoDaddy hostname in Vercel and apply the project-specific records Vercel reports at that time. Do not hardcode DNS targets, replace nameservers, or change mail/unrelated records by assumption. Verify direct home/privacy loads, redirects, certificate and canonical host. Capture actual deployment URL/project/build results and rollback reference.

### Publication inputs still needed

Exact domain/subdomain; confirmed app title, operator identity and support email; access to the intended Vercel project; confirmation of privacy wording. These do not block frontend implementation after this documentation phase, but prevent a submission-ready publication claim until supplied. No account access or DNS change has been made.

## Planned root commands and verification

After implementation, README must document `npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run build` and `npm run start`, delegating to `@esty-admin/web`. They are not currently available. Generate the lockfile during the initial authorized install, then verify a fresh `npm ci`.

Validate both routes in development and production mode; `/privacy.html` redirects to `/privacy`; unknown routes provide a way home. Check all navigation, 360px/1440px layout, zoom, keyboard focus and reduced motion. Verify metadata against the actual release host. No test suite or browser result is claimed by this plan; record each check only after it runs.

Current environment limitation: an npm registry metadata request failed with `ENOTFOUND` before the owner asked to stop at docs. No package install, application source or lockfile was created. Restore registry access or use a verified compatible local cache when implementation resumes; do not report a successful build without running it.

## Technical sources

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): App Router, TypeScript and manual setup.
- [Next.js package release](https://registry.npmjs.org/next/latest) and [React package release](https://registry.npmjs.org/react/latest): baseline versions inspected on 2026-10-25.
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) and [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): framework deployment and Node 24 baseline.
- [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain): use actual project DNS instructions.

No migration, data-model or API-contract artifact is needed for this public informational website. Deferred feature 001 will own those decisions for connectivity.
