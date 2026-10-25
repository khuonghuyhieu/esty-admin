# Architecture & implementation spec

Spec: ARCH-001 · Updated: 2026-10-25 · Status: Next.js/Vercel website prioritized; documentation review in progress; connectivity deferred; implementation not started.

## Purpose and authority

Build an internal Etsy fulfillment workspace; BurgerPrints (SUP-05) is the only supplier pilot. Own-shop and consenting-seller use are the intended product scope. Etsy API access is the first integration milestone, not an implemented capability.

This file is the current technical implementation context. README only explains navigation/commands; AGENTS defines working rules; PROJECT_STATE records observed progress. Notion tracks project milestones/status and decisions; feature `tasks.md` records technical execution after a resolved plan exists. Drive retains source requirements/evidence. Link these artifacts instead of creating duplicate roadmaps or task trackers.

## Architecture boundaries

- One monorepo, one frontend, one modular-monolith backend and one database according to the actual stack decision. tc-api supplies organizational principles only: do not copy its stack, business code, credentials or internal configuration.
- Frontend: route entrypoints → feature-specific UI/application behavior → API client. Separate reusable UI from feature UI.
- Backend: HTTP transport/controller → application/service → persistence or external adapters. Domain/business behavior must not depend on HTTP requests or generated transport types.
- One API schema/contract, with stack-appropriate code generation. Never maintain duplicate FE/BE transport types by hand. Map transport models at the boundary where needed.
- Database configuration and migration mechanism; environment validation and secret-free examples; root development and verification commands.
- The immediate deliverable is a public developer website, specified in feature 002. The later connectivity feature 001 requires UI → API → database. Neither deliverable authorizes operational order/seller/supplier business modules.
- No microservices, gRPC, queues or shared-package scaffolding without an approved need. Use the documented hosting selections below; later scale-roadmap options do not authorize extra services now.

## Stack decision record

Owner-designated source: [Cloud Cost & Handover Control](https://docs.google.com/spreadsheets/d/1o_I2L-gkTjowxb61i_o7CRee58DbeJaL/edit), reviewed on 2026-10-25. Coordinates below refer to its named tabs. The source records selections and planning assumptions, not evidence that services are provisioned or the full production scope is approved.

| Decision | Recorded selection and evidence | Remaining decision / implementation impact |
| --- | --- | --- |
| Frontend framework | Owner chose Next.js on 2026-10-25; use App Router/TypeScript as the implementation plan | Website stack is resolved; precise dependency pins are technical planning details |
| Frontend hosting | Owner chose Vercel on 2026-10-25 | Supersedes the workbook's Cloudflare Pages selection; no Vercel project/deployment is verified |
| Backend | NestJS business API; `Service Register!B7` | Exact NestJS and runtime versions are not recorded |
| Backend hosting | Google Cloud Run marked Selected; `Service Register!A7:N7` | Initial Singapore, min instances 0/max 1; concurrency, project ownership, billing and rollback configuration remain unverified |
| Database | Supabase PostgreSQL; `Service Register!A11:M11`, `Scale & Cost Roadmap!A19:B19` | PostgreSQL version, local development setup and connection mode are not recorded |
| Authentication | Supabase Auth marked Selected; `Service Register!A12:M12` | Service selection does not authorize adding production auth to the connectivity feature |
| Small-file storage | Supabase Storage marked Selected; `Service Register!A13:M13` | Bucket policies/retention are not recorded; no foundation business-file feature is implied |
| Build / image registry | Google Cloud Build + Artifact Registry marked Selected; `Service Register!A8:M9` | Pipeline configuration remains to implement; image-retention direction is current + 2 rollback images |
| Domain | Owner reports an existing GoDaddy domain on 2026-10-25 | Exact domain/subdomain and DNS state remain unknown; use a verified Vercel URL first if domain setup is pending |
| Monitoring / email | Sentry + Resend marked Planned/Recommended; `Service Register!A14:M15` | Not mandatory foundation dependencies and not shown active |
| Scheduled jobs / large artwork | Cloud Scheduler optional/later; AWS S3 disabled; `Service Register!A10:M10`, `A16:N16` | No scheduler, queue or S3 activation in the current connectivity feature; S3/R2 are later roadmap options |
| Migration / API codegen tooling | Not named in the inspected sources | Resolve for deferred feature 001; no database/client scaffolding in the website phase |

The earlier handoff missed this workbook and incorrectly described BE/DB/hosting as entirely missing. Retain recovered backend/database selections, with the later owner decisions taking precedence for Next.js, Vercel and the existing GoDaddy domain. The workbook remains historical evidence and has not been edited to reflect this override.

Other evidence reviewed: Docs 00–07 cover product direction, workflows, rules, mapping, PRD, technical spikes and UAT. They contain draft/template requirements, not a frontend framework or dependency-version decision. [Technical Spike](https://docs.google.com/document/d/1qTKpEP8WRu0wve_HJGb1XBG7rkRnz_Rhvj-RDHIwA7o/edit) remains TBD. The Phase 1.1 accounting draft separately mentions a Cloud Run modular monolith; it does not authorize accounting implementation here.

Reconciliation: older product/mapping/UAT docs still describe four suppliers; the owner's BurgerPrints-only pilot remains current. The delivery tracker contains historical Not started rows and unfilled approval/evidence columns; it is not proof that current Notion tasks are unstarted. Cloud workbook handover rows H01–H15 are Not started. Free-tier amounts and scale-stage cost bands are historical planning assumptions; verify current official terms before deployment or paid decisions.

Access limitation: this exact Drive ID is still an Office workbook according to metadata, even though it opens in Sheets. Native Sheets metadata returned FAILED_PRECONDITION. The current 57,488-byte cloud workbook was downloaded and inspected, not inferred from the older 31,956-byte local download. Direct native-sheet notes require the converted file's ID; no changes to the original workbook were made during this review.

Do not use architecture document ID `1UjQckJz9NH4ZNgViYEBEyy8lmiIh5A01bl_hD9CnokU`: its related task belongs to Camp Ticket. Older four-supplier planning does not override the owner's BurgerPrints-only pilot.

## Owner-confirmed delivery order

Latest decisions on 2026-10-25 supersede the earlier foundation-first sequence:

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| W0 — Documentation | Review website requirements, technical plan and tasks | Scope, decisions, dependencies and publication gates are explicit |
| W1 — Frontend | Next.js landing page and privacy page using existing UI skills | Local startup, lint/typecheck/build and responsive/keyboard review |
| W2 — Public URL | Vercel deployment; connect the existing GoDaddy domain when ready | Public HTTPS routes load without reviewer sign-in; final URL/contact/content verified |
| W3 — Etsy access | Owner uses the verified website URL in the actual registration flow | Registration/access result recorded; OAuth/API proof requires separate implementation |
| Later — Connectivity | Resume feature 001 with NestJS/Cloud Run and Supabase | Real UI → API → DB acceptance remains required for that feature |

This turn prepares documentation only, following the owner's instruction to review docs before code. Do not infer runtime completion from specs or dependency-version research.

## Planned source organization

One repository with one frontend. Create application paths only when implementation resumes:

```text
apps/web/src/app/          Next.js route entrypoints and layouts
apps/web/src/features/     landing/privacy composition and feature content
apps/web/src/components/   genuinely reusable website UI
apps/web/src/lib/          validated public site configuration
```

Use npm workspaces and root dev/check/build commands when implementing. Configure Vercel's root as `apps/web`; the root lockfile owns dependencies. `apps/api` is reserved for later connectivity work and must not be created empty now. No shared packages are required.

`dist/` is the existing static content reference, not the new deployment root. Retain it until migration is verified. Public pages and the future admin share the frontend but have distinct routes/features. The landing page is not an OAuth callback.

## UI implementation constraints

Use the existing local skills: frontend-design for layout/implementation, doodle for selected visual tokens, web-design-guidelines for review. No new framework is implied by these skills.

Doodle tokens: primary #49B6E5, secondary #263D5B, background #FFFFFF, text #111827; spacing 4/8/12/16/24/32. Prefer readable body text, visible focus and accessible contrast. Handwritten accents are optional around dense controls; tables/forms prioritize scanning and operation. Do not put white small text on the blue accent without a contrast check. Decorative graphics must be hidden from assistive technology. Respect reduced motion and narrow screens.

## Feature acceptance

[Feature 002](002-developer-website/spec.md) defines the current public website; its [draft plan](002-developer-website/plan.md) and [tasks](002-developer-website/tasks.md) guide later implementation. It needs no backend, database, authentication, supplier connection or Etsy credentials.

[Feature 001](001-connectivity-foundation/spec.md) remains deferred and unimplemented. Its later acceptance still requires validated environment configuration, migrations, a generated FE API client and the real UI → API → DB path, distinguishing process health from database readiness. The website does not satisfy those criteria.

README owns actual commands once implemented. The website plan labels future commands and deployment steps as planned, not currently runnable.

## Integration work after the website

Real Etsy OAuth/API access, seller isolation implementation, order import, BurgerPrints mapping/submission and operational roles need their own approved requirements and evidence. Future product data is scoped by seller/shop; exact tables, API endpoints and module definitions are not approved in this spec. Do not imply any external integration works based on a static page or mockup.

Etsy registration and API proof remain tracked under C2-01; supplier discovery and mapping remain their existing tasks. Current Etsy app rules must be verified from official sources when doing that work; previous registration notes do not establish current policy or require a local archive.

## Tracking and changes

[Notion C3-03 — technical design and build decision](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb) tracks this spec/foundation context. [C2-01 — Etsy access](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) tracks the independent registration/API milestone.

Record accepted architecture changes here with date and source. Update only affected existing Notion tasks; do not create a parallel tracker, invent owners/dates or mark C3 Done merely because this spec exists. C3 production scope/estimate approval is separate from the already-authorized local foundation.

2026-10-25: consolidated scattered architecture/UI context into ARCH-001. Following the owner's cleanup request, superseded local archives were removed and Git metadata was moved into the standalone repository. Current specs and skills are the implementation context; no parent backup is required. No stack, business module or production release decision was added.

2026-10-25 (latest owner direction): Next.js + Vercel, existing GoDaddy domain, frontend/public URL before backend/database. The owner then requested documentation before code. Feature 002 captures this separate deliverable; feature 001 remains deferred.
