# Architecture & implementation spec

Spec: ARCH-001 · Updated: 2026-10-25 · Status: foundation scope authorized; stack unresolved; implementation not started.

## Purpose and authority

Build an internal Etsy fulfillment workspace; BurgerPrints (SUP-05) is the only supplier pilot. Own-shop and consenting-seller use are the intended product scope. Etsy API access is the first integration milestone, not an implemented capability.

This file is the current technical implementation context. README only explains navigation/commands; AGENTS defines working rules; PROJECT_STATE records observed progress. Notion tracks execution and decisions; Drive retains source requirements/evidence. Do not duplicate roadmaps or task trackers in this repository.

## Owner-confirmed foundation boundaries

- One monorepo, one frontend, one modular-monolith backend and one database according to the actual stack decision. tc-api supplies organizational principles only: do not copy its stack, business code, credentials or internal configuration.
- Frontend: route entrypoints → feature-specific UI/application behavior → API client. Separate reusable UI from feature UI.
- Backend: HTTP transport/controller → application/service → persistence or external adapters. Domain/business behavior must not depend on HTTP requests or generated transport types.
- One API schema/contract, with stack-appropriate code generation. Never maintain duplicate FE/BE transport types by hand. Map transport models at the boundary where needed.
- Database configuration and migration mechanism; environment validation and secret-free examples; root development and verification commands.
- Foundation only: a connectivity screen → API → database. Do not create operational order/seller/supplier tables or business behavior to make a demo appear functional.
- No microservices, gRPC, queues or shared-package scaffolding without an approved need. No cloud provider is chosen here.

## Stack decision record

| Decision | Current evidence | Implementation impact |
| --- | --- | --- |
| Frontend runtime/framework | Not located in checked E-commerce docs | Blocks app setup |
| Backend runtime/framework | Not located | Blocks app setup |
| Database engine/version | Not located | Blocks connectivity and migrations |
| Migration/codegen tools | Derive from approved stack | Do not select independently before stack |
| Cloud/hosting | Not selected here | Does not block local foundation |

Owner's next required input: the existing approved FE/BE/DB document or explicit stack values. The foundation itself is already authorized; do not ask for that approval again.

Checked on 2026-10-24: [Technical Spike](https://docs.google.com/document/d/1qTKpEP8WRu0wve_HJGb1XBG7rkRnz_Rhvj-RDHIwA7o/edit) has TBD decisions; [PRD](https://docs.google.com/document/d/1GFC-88PxndkCf2XkSFQmWgZJd1AP0IwczEaPLbHatG0/edit) is Draft; [Product Brief](https://docs.google.com/document/d/1UYPYpqzjHB9y3Fc3dDUUc4vHJlv_vkBitDQc7Ih-Ago/edit) does not specify the stack. This is not proof that another approved document does not exist.

Do not use architecture document ID `1UjQckJz9NH4ZNgViYEBEyy8lmiIh5A01bl_hD9CnokU`: its related task belongs to Camp Ticket. Older four-supplier planning does not override the owner's BurgerPrints-only pilot.

## Proposed source organization

These application paths are proposals to adapt to the approved framework, not existing code or new architectural decisions:

```text
apps/web/     route entrypoints, features, reusable UI, generated API client
apps/api/     bootstrap/config, modules, application logic, adapters, migrations
```

Do not create empty directories as a substitute for a runnable foundation. Existing `dist/` remains the separate static developer landing page; preserve its files and current hosting path during foundation work. It is not the operational admin or an OAuth callback.

## UI implementation constraints

Use the existing local skills: frontend-design for layout/implementation, doodle for selected visual tokens, web-design-guidelines for review. No new framework is implied by these skills.

Doodle tokens: primary #49B6E5, secondary #263D5B, background #FFFFFF, text #111827; spacing 4/8/12/16/24/32. Prefer readable body text, visible focus and accessible contrast. Handwritten accents are optional around dense controls; tables/forms prioritize scanning and operation. Do not put white small text on the blue accent without a contrast check. Decorative graphics must be hidden from assistive technology. Respect reduced motion and narrow screens.

## Implementation sequence and acceptance

| Milestone | Deliverable | Evidence required |
| --- | --- | --- |
| F0 — Record stack | Update decision record with owner/source; adapt proposed folders | FE, BE and DB identified without assumptions |
| F1 — Connectivity foundation | Validated env, DB connection, migrations, health/readiness, generated FE API client and connectivity UI | Root setup/dev/check/build commands; actual UI → API → DB result; DB unavailable produces truthful degraded/error behavior |
| F2 — Verify and hand off | Tests appropriate to runtime, migration verification and UI behavior | Record checks actually run; verify loading/error and empty state where applicable, narrow/desktop layouts and keyboard behavior; document failures and remaining work |

F1 must distinguish process health from database readiness. Choose concrete routes and payloads according to the approved stack. No business-record schema is authorized by this connectivity exercise. Tests must cover meaningful behavior, not merely mirror code.

Root commands must cover setup, dev, lint, typecheck where relevant, tests, build, codegen and migrations as supported by the stack. README becomes the usage reference once commands exist. Avoid duplicate commands/docs spread across feature folders.

## Integration work outside this foundation

Real Etsy OAuth/API access, seller isolation implementation, order import, BurgerPrints mapping/submission and operational roles need their own approved requirements and evidence. Future product data is scoped by seller/shop; exact tables, API endpoints and module definitions are not approved in this spec. Do not imply any external integration works based on a static page or mockup.

Etsy registration and API proof remain tracked under C2-01; supplier discovery and mapping remain their existing tasks. Current Etsy app rules must be verified from official sources when doing that work; archived registration notes are historical evidence, not current policy.

## Tracking and changes

[Notion C3-03 — technical design and build decision](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb) tracks this spec/foundation context. [C2-01 — Etsy access](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) tracks the independent registration/API milestone.

Record accepted architecture changes here with date and source. Update only affected existing Notion tasks; do not create a parallel tracker, invent owners/dates or mark C3 Done merely because this spec exists. C3 production scope/estimate approval is separate from the already-authorized local foundation.

2026-10-25: consolidated scattered architecture/UI context into ARCH-001; parked legacy roadmap, design notes and landing-specific workflow outside active source. No stack, business module or production release decision was added.
