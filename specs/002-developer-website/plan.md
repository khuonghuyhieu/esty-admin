# Implementation plan: Developer website

Date: 2026-10-25 · Branch: `main` (starting commit `70992fc`) · Status: T001–T008 local implementation and external review complete; publication excluded.

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
| Version baseline | Next.js 16.4.3, React/React DOM 19.3.1; Node.js 24.22.1 | Registry versions/peer ranges verified; exact direct pins and root lockfile installed |
| Styling | Plain CSS/CSS Modules and semantic Doodle tokens; no component kit required | Existing UI direction |
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

White background, dark ink `#111827`, navy `#263D5B`, blue accent `#49B6E5` and the 4/8/12/16/24/32 spacing scale. Use blue for accents with dark readable labels; navy for buttons with light text. Readable system body type; handwriting/sketch accents are optional around the workflow illustration.

Home composition: compact header → purpose/development status and workflow illustration → authorized-seller workflow → BurgerPrints pilot scope → privacy/contact links. Use the user's actual content, no invented metrics, testimonials, legal identity or working connect-shop CTA. Privacy is a readable document, not a decorative dashboard. Verify the actual final palette contrast and typography during UI implementation.

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

Use Node's built-in test runner for configuration boundaries: missing/blank release facts, HTTPS origin validation, malformed email/control characters, mode precedence, preview protection, confirmation and draft/preview metadata/contact policy. Browser tests in `apps/web/tests/e2e/` provide functional/E2E acceptance without a duplicate component suite. The two Chromium projects use 360px and 1440px viewports; they cover direct routes, the home/privacy/home journey, workflow anchor, 308 legacy redirect with query preservation, 404 recovery, keyboard order/visible focus/skip target, metadata, honest capability/contact status, overflow, 200% text reflow and reduced-motion preference.

Visual review uses actual production browser screenshots at desktop/mobile, keyboard focus, accessibility-tree inspection and 200% CSS zoom as a reflow approximation. Record limitations separately: automated text enlargement/CSS zoom is not OS/browser-toolbar zoom or a physical-device/screen-reader audit. No live Etsy/supplier or production-host request is part of this scope.

All page/feature/shell components are Server Components, with direct imports, no client state, fetching/cache layers, component kit, external fonts or image requests. Doodle uses a single sketched order-preparation sheet, white/blue/navy tokens, readable system type, visible navy focus and no animation. Privacy remains a plain readable document. Existing pinned skills and `dist/` stay unchanged.

Registry access recovered during implementation. Fresh-install/build/test results and dependency warnings belong to PROJECT_STATE, not inferred from this plan.

## Technical sources

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): App Router, TypeScript and manual setup.
- [Next.js package release](https://registry.npmjs.org/next/latest) and [React package release](https://registry.npmjs.org/react/latest): baseline versions inspected on 2026-10-25.
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) and [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): framework deployment and Node 24 baseline.
- [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain): use actual project DNS instructions.
- [Next.js Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright): browser-based acceptance/E2E and production-build testing.
- Version-matched sources: [Next.js v16.4.3 installation](https://github.com/vercel/next.js/blob/v16.4.3/docs/01-app/01-getting-started/01-installation.mdx) and installed `node_modules/next/dist/docs/` guides for metadata, redirects and Playwright. `/docs/16/` URLs returned 404; the tagged/bundled documentation resolves the version match.

No migration, data-model or API-contract artifact is needed for this public informational website. Deferred feature 001 will own those decisions for connectivity.
