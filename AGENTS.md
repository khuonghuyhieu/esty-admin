# E-commerce workspace

## Start here

- Read `PROJECT_STATE.md` at the start of a task, then only the files relevant to that task. Do not repeat a full workspace/account scan when a targeted read is enough.
- Current deliverable: ONE English landing page introducing an application for the internal team, initially used as the project website for Etsy Developer registration/API access. `privacy.html` is a supporting page, not a second landing page.
- For landing-page work, read `.agents/skills/ecommerce-landing-page/SKILL.md`. The editable site is `dist/`; there is no separate build source or build command.
- For frontend design, read `DESIGN.md`. Use `.agents/skills/doodle/SKILL.md` for visual tokens, `.agents/skills/frontend-design/SKILL.md` for implementation/design decisions, and `.agents/skills/web-design-guidelines/SKILL.md` for a scoped quality review. Doodle is the chosen style; do not load competing visual templates by default.
- For the technical roadmap, read `etsy-api-first.md`. Older workflow/Gantt snapshots live in the separate planning workspace and do not override the latest user direction.

## Working agreements

- Communicate with the owner in Vietnamese; keep public site copy in English unless requested otherwise.
- Continue authorized local edits and checks without asking the owner to repeat known decisions. Ask only for missing facts that materially affect the result, such as the actual support address or legal name. Do not invent those facts.
- Keep project context in this source tree. Skill instructions describe reusable work; `PROJECT_STATE.md` holds changing decisions and handoff information.
- After meaningful work, update the relevant state entries with changed paths, checks actually performed, remaining gaps and the next concrete step. Never mark visual review, deployment, registration or API access successful without evidence.
- Keep existing static HTML/CSS unless a requirement justifies new dependencies. Do not introduce a framework/backend/database just to serve this informational landing page.
- The Etsy integration is planned. Do not imply Etsy endorsement, approved access, functioning OAuth, live order import or working supplier submission without evidence. The landing page itself is not an OAuth callback.
- The owner authorized a local FE–BE connectivity foundation on 2026-10-24. This overrides the previous landing-page-only scope for that foundation, but does not approve business modules or select a stack. Read the foundation handoff in `PROJECT_STATE.md`; implementation awaits the actual FE/BE/DB decision. The later owner request authorizes a review branch and pull request for these documentation/skill changes. Do not deploy or merge without a further request.
- The previously linked “06 — Technical Architecture & Spike Findings” (`1UjQckJz9NH4ZNgViYEBEyy8lmiIh5A01bl_hD9CnokU`) belongs to Camp Ticket, as verified through its related Notion task. It is not an E-commerce architecture decision. E-commerce technical evidence is linked from `PROJECT_STATE.md`.

## Application foundation

- Use one monorepo, one frontend, one modular-monolith backend and the database specified by the owner's actual decision. Reuse tc-api's organizational principles only; never copy its business code, credentials or internal configuration.
- Frontend routes are entrypoints; organize business UI by feature and separate reusable UI. Backend transport/controllers call application services; persistence and external integrations are adapters. Business logic must not depend on HTTP requests or generated transport types.
- Use one API contract with stack-appropriate code generation. Do not hand-maintain duplicate FE/BE API types. Add migrations, validated environment configuration and secret-free `.env.example` files.
- First executable path is a connectivity screen → API → DB, with health/readiness behavior and loading/error/empty states where applicable. Do not invent order, seller, supplier or OAuth behavior before its scope is approved. No microservices, gRPC, queues or shared-package scaffolding without a demonstrated approved need.
- Apply `DESIGN.md` and the existing frontend, Doodle and UI review skills to admin UI; prioritize readable tables/forms. Keep the static developer landing page separate.
- Expose root setup/dev/lint/typecheck/test/build and migration commands as supported by the decided stack. Record actual checks, failures and unverified behavior in `PROJECT_STATE.md`; keep usage in README. A folder skeleton is not a completed foundation.
