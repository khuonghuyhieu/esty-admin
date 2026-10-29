# Architecture & implementation spec

Spec: ARCH-001 · Updated: 2026-10-27 · Status: local backend verified; local testing prioritized, existing cloud unchanged; hosted/full connectivity acceptance pending. PROJECT_STATE owns current website evidence.


## Latest owner hosting preference — Vercel, 2026-10-29

FE and BE use their existing separate Vercel projects. Feature001's scoped runtime bearer, private conversion and serialized release identity/domain adaptation is locally verified; its new independent coordinator-run gpt-6-luna review completed with no confirmed actionable findings. See feature001 plan for exact evidence. Reuse esty-admin-api metadata (prj_uITHKLUGGE98VxrEcs5FoktBbcls, personal scope khuonghuyhieu0705s-projects, root apps/api, Node24) without account reads. No Render onboarding. Current work is documentation-only closeout; source publication and all actual external execution require separate approval. Dated A+C/Render results remain historical, not genuine native Vercel proof.

A personal account does not by itself establish non-commercial use. Official Vercel fair-use guidance defines commercial use by intended financial gain; using an internal tool for one's own shop may still fall within that definition. No provider classification/enforcement method or project-specific eligibility is known, and no paid upgrade/payment method/trial is authorized. Document this unresolved eligibility limit without forcing a new provider or presenting it as verified compliance.

The owner reports existing private runtime/operator files. Agents never read or overwrite them; the synthetic-tested explicit owner TTY conversion produces separate Vercel files only on later owner invocation. Preserve all current source, root dependencies/ignore/pointer, FE and local volumes. Hosted tests through api.lovora.us and genuine native T054 remain required and unverified. No account/private-input/remote SQL/deployment/DNS/Git action, install, runtime or test operation is authorized during this docs-only closeout.


## Purpose and authority

Build an internal Etsy fulfillment workspace; BurgerPrints (SUP-05) is the only supplier pilot. The current public website correction describes internal-team/own-shop use, following the owner's registration direction. Broader consenting-seller use remains historical product context, not availability claimed by this correction. Etsy API access is the first integration milestone, not an implemented capability.

This file is the current technical implementation context. README only explains navigation/commands; AGENTS defines working rules; PROJECT_STATE records observed progress. Notion tracks project milestones/status and decisions; feature `tasks.md` records technical execution after a resolved plan exists. Drive retains source requirements/evidence. Link these artifacts instead of creating duplicate roadmaps or task trackers.

### Scoped local backend resumption — 2026-10-26

The owner authorized parallel disjoint FE/BE work on existing `main@128cfc8`. Feature 001 now owns the local NestJS/PostgreSQL foundation, migration-aware health/readiness, contract generation and HTTP/integration verification in `apps/api/`. Its [plan](001-connectivity-foundation/plan.md) and [research](001-connectivity-foundation/research.md) resolve local tool versions and design. Older deferred/unimplemented wording below is historical for this scoped lane, not a prohibition on the authorized BE source.

The website remains independent. The local authorization did not include hosted connectivity, auth, Etsy/supplier integration or full UI → API → DB acceptance. Subsequent source/dependency/database/documentation leases and actual results are recorded in PROJECT_STATE; no historic lease is an ongoing deployment authorization.

### Historical internal backend prototype decision — 2026-10-27

The owner prioritizes a quickly deployable internal prototype: native Vercel NestJS in a separate BE project, the existing one Supabase project and only existing health/readiness endpoints. Cloud Run/AWS/Azure, containers and Google billing setup remain deferred. Platform access controls replace new auth/business modules; no new operational DB role is required. Feature001 code/local checks now cover project-bound Session configuration, verified TLS, generated migration metadata, portable operator packaging and bounded hosted pool lifecycle. Actual target values remain future owner inputs, not compiled guesses; local evidence is not hosted proof.

The owner subsequently authorized code-first feature001 source/local verification and an owner setup guide, followed by a coordinator-run review. External project/credential/endpoint setup is deferred, not a source prerequisite. Preserve one node-pg-migrate history and separately approve all remote SQL/migration/deployment. CLI authentication evidence belongs to the coordinator; source work must not inspect cached credentials or call cloud APIs. Offline native-build limitations and actual local results belong in feature001's plan; full hosted proof remains pending.


### Required hosted BE test endpoint — 2026-10-28

The owner explicitly requires setup and actual testing of BE at https://api.lovora.us. Supabase local on Docker and existing NestJS are development/pre-release environments only; hosted API uses the existing Supabase-cloud project, not a public tunnel to local Docker. Keep the strict standalone destructive-test fixture and one node-pg-migrate application history. Versioned migration reporting and automated release ordering remain required.

The active plan uses the existing Vercel BE project, validated private inputs, real DB preflight/versioned migration, same-commit deployment, exact Vercel-provided GoDaddy api-only DNS, TLS and actual safe functional checks. Require the API's own bearer boundary even when Vercel Standard Protection excludes production domains. Preserve app.lovora.us/root/mail/unrelated resources and all previous local evidence. No paid upgrade/payment method/trial is authorized; account eligibility, native artifact and actual domain association remain gates. Local/provider-only success is not hosted acceptance.

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
| Backend | NestJS modular API; `Service Register!B7` | Local foundation uses NestJS12.2.0 / Node24.22.1; preserve portable layers |
| Backend hosting | Existing separate esty-admin-api Vercel project + existing Supabase cloud; final api.lovora.us | Adaptation source/local authorized; actual native/settings/access/source/domain/TLS proof and Hobby eligibility remain unverified |
| Database | Existing one Supabase PostgreSQL project; local PostgreSQL17.11 verified | Prototype uses verified-TLS Session pooler5432; exact Connect metadata/secret and remote SQL proof remain execution prerequisites |
| Authentication | Supabase Auth marked Selected; `Service Register!A12:M12` | Service selection does not authorize adding production auth to the connectivity feature |
| Small-file storage | Supabase Storage marked Selected; `Service Register!A13:M13` | Bucket policies/retention are not recorded; no foundation business-file feature is implied |
| Build / image registry | Google Cloud Build + Artifact Registry were selected in the workbook | Deferred with Cloud Run; neither is a prototype prerequisite |
| Domain | Owner reports an existing GoDaddy domain on 2026-10-25 | Exact domain/subdomain and DNS state remain unknown; use a verified Vercel URL first if domain setup is pending |
| Monitoring / email | Sentry + Resend marked Planned/Recommended; `Service Register!A14:M15` | Not mandatory foundation dependencies and not shown active |
| Scheduled jobs / large artwork | Cloud Scheduler optional/later; AWS S3 disabled; `Service Register!A10:M10`, `A16:N16` | No scheduler, queue or S3 activation in the current connectivity feature; S3/R2 are later roadmap options |
| Migration / API codegen tooling | Local node-pg-migrate9 and OpenAPI/openapi-typescript verified in feature001 | Retain one history/contract; FE client and full browser journey remain pending |

The earlier handoff missed this workbook and incorrectly described BE/DB/hosting as entirely missing. Retain recovered backend/database selections, with the later owner decisions taking precedence for Next.js, Vercel and the existing GoDaddy domain. The workbook remains historical evidence and has not been edited to reflect this override.

Other evidence reviewed: Docs 00–07 cover product direction, workflows, rules, mapping, PRD, technical spikes and UAT. They contain draft/template requirements, not a frontend framework or dependency-version decision. [Technical Spike](https://docs.google.com/document/d/1qTKpEP8WRu0wve_HJGb1XBG7rkRnz_Rhvj-RDHIwA7o/edit) remains TBD. The Phase 1.1 accounting draft separately mentions a Cloud Run modular monolith; it does not authorize accounting implementation here.

Reconciliation: older product/mapping/UAT docs still describe four suppliers; the owner's BurgerPrints-only pilot remains current. The delivery tracker contains historical Not started rows and unfilled approval/evidence columns; it is not proof that current Notion tasks are unstarted. Cloud workbook handover rows H01–H15 are Not started. Free-tier amounts and scale-stage cost bands are historical planning assumptions; verify current official terms before deployment or paid decisions.

Access limitation: this exact Drive ID is still an Office workbook according to metadata, even though it opens in Sheets. Native Sheets metadata returned FAILED_PRECONDITION. The current 57,488-byte cloud workbook was downloaded and inspected, not inferred from the older 31,956-byte local download. Direct native-sheet notes require the converted file's ID; no changes to the original workbook were made during this review.

Do not use architecture document ID `1UjQckJz9NH4ZNgViYEBEyy8lmiIh5A01bl_hD9CnokU`: its related task belongs to Camp Ticket. Older four-supplier planning does not override the owner's BurgerPrints-only pilot.

## Owner-confirmed delivery order

The 2026-10-25 website sequence remains independent; the 2026-10-27 backend prototype decision above supersedes Cloud Run as its immediate hosting candidate:

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| W0 — Documentation | Review website requirements, technical plan and tasks | Scope, decisions, dependencies and publication gates are explicit |
| W1 — Frontend | Next.js landing page and privacy page using existing UI skills | Local startup, lint/typecheck/build and responsive/keyboard review |
| W2 — Public URL | Vercel deployment; connect the existing GoDaddy domain when ready | Public HTTPS routes load without reviewer sign-in; final URL/contact/content verified |
| W3 — Etsy access | Owner uses the verified website URL in the actual registration flow | Registration/access result recorded; OAuth/API proof requires separate implementation |
| Separate — Connectivity | Verified local BE; plan native Vercel/Supabase health-only prototype | Hosted prototype proof does not complete the later real UI → API → DB journey |

On 2026-10-25 the owner resumed implementation for feature 002 T001–T008 on existing `main` at `70992fc`. After local completion and review, the owner requested Vercel deployment for a registration URL and explicitly authorized FE commit/push to `main`. This supersedes the local-only stop, while preserving the account/project and public-fact confirmation gates. DNS changes and actual Etsy registration remain subsequent work.

## Planned source organization

One repository with one frontend. Feature 002 implements these application paths:

```text
apps/web/src/app/          Next.js route entrypoints and layouts
apps/web/src/features/     landing/privacy composition and feature content
apps/web/src/components/   genuinely reusable website UI
apps/web/src/lib/          validated public site configuration
```

Use npm workspaces and root commands. The frontend Vercel root is `apps/web`; the BE workspace is `apps/api`, whose local foundation now exists. Future provider build/start settings must preserve root workspace-lock resolution. The root lockfile owns dependencies and needs a serial lease for changes. No shared packages are required.

`dist/` is the existing static content reference, not the new deployment root. Retain it until migration is verified. Public pages and the future admin share the frontend but have distinct routes/features. The landing page is not an OAuth callback.

## UI implementation constraints

Use the existing local skills: frontend-design for layout/implementation, doodle for selected visual tokens, web-design-guidelines for review. No new framework is implied by these skills.

The owner-supplied marketing/application references supersede the generic blue/white Doodle styling for the requested UI correction (2026-10-26). Feature 002's plan owns measured visual tokens, font roles, public-page composition and screenshot acceptance; preserve pinned upstream skills. Application tables/forms use readable sans-serif type and prioritize scanning and operation. Decorative graphics must be hidden from assistive technology. Respect contrast, reduced motion and narrow screens rather than copying reference defects. Reference application screens do not authorize operational feature implementation.

## Feature acceptance

[Feature 002](002-developer-website/spec.md) defines the current public website; its [plan](002-developer-website/plan.md) and [tasks](002-developer-website/tasks.md) guide implementation. It needs no backend, database, authentication, supplier connection or Etsy credentials. PROJECT_STATE owns actual local evidence; external review and publication remain separate gates.

[Feature 001](001-connectivity-foundation/spec.md) has verified local foundation and code-first prototype behavior, with its separate read-only review complete and native/hosted proof pending. Full acceptance still requires the FE-generated client and real UI → API → DB path. Neither the public website nor backend-only checks satisfy those criteria.

README owns runnable local commands. Deployment steps remain planned and unexecuted; a production build is not a published release.

## Integration work after the website

Real Etsy OAuth/API access, seller isolation implementation, order import, BurgerPrints mapping/submission and operational roles need their own approved requirements and evidence. Future product data is scoped by seller/shop; exact tables, API endpoints and module definitions are not approved in this spec. Do not imply any external integration works based on a static page or mockup.

Etsy registration and API proof remain tracked under C2-01; supplier discovery and mapping remain their existing tasks. Current Etsy app rules must be verified from official sources when doing that work; previous registration notes do not establish current policy or require a local archive.

## Tracking and changes

[Notion C3-03 — technical design and build decision](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb) tracks this spec/foundation context. [C2-01 — Etsy access](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) tracks the independent registration/API milestone.

Record accepted architecture changes here with date and source. Update only affected existing Notion tasks; do not create a parallel tracker, invent owners/dates or mark C3 Done merely because this spec exists. C3 production scope/estimate approval is separate from the already-authorized local foundation.

2026-10-25: consolidated scattered architecture/UI context into ARCH-001. Following the owner's cleanup request, superseded local archives were removed and Git metadata was moved into the standalone repository. Current specs and skills are the implementation context; no parent backup is required. No stack, business module or production release decision was added.

2026-10-25 (latest owner direction): Next.js + Vercel, existing GoDaddy domain, frontend/public URL before backend/database. The owner then requested documentation before code. Feature 002 captures this separate deliverable; feature 001 remains deferred.
