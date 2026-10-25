# E-commerce project constitution

Version: 1.2.0 · Established: 2026-10-25 · Amended: 2026-10-25 · Derived from the owner's existing instructions, not a new stack or production approval.

## I. Evidence before stack selection

Use the owner's actual FE/BE/DB decision. Never infer a stack from tc-api, a UI skill or another project's document. Missing decisions remain NEEDS CLARIFICATION. Follow `specs/architecture.md` for approved boundaries and evidence.

## II. Small, executable architecture

One monorepo, one frontend, one modular-monolith backend and one database. Separate frontend features/shared UI and backend transport/application/adapters. Use one API contract with appropriate code generation. No microservices, gRPC, queues or shared packages without approved need. A folder skeleton is not a runnable foundation.

## III. Verify each deliverable

Apply acceptance to the active feature. The owner-prioritized developer website requires accessible public pages, a repeatable frontend build and a verified HTTPS URL; it does not depend on backend/database completion. Later connectivity acceptance still requires UI → API → DB, validated environment examples without secrets, migrations, health/readiness and root commands. Record actual checks and limitations. Do not imply Etsy approval, OAuth or supplier submission from a website or mockup.

## IV. Keep one current context

`specs/architecture.md` is cross-cutting architecture; `specs/<feature>/spec.md` defines feature requirements, `plan.md` defines a resolved implementation design, and `tasks.md` defines executable steps only when prerequisites exist. Do not duplicate these in extra roadmap/plan files. Notion holds project milestones/status and links to feature artifacts; Drive keeps original evidence. Use Git history for versioned repository documents; do not create a parent backup folder as a prerequisite for ongoing work.

## V. Scope and UI discipline

Foundation is authorized; production business modules remain separate. The pilot supplier is BurgerPrints. Use the existing frontend-design, Doodle and web-design-guidelines skills; readable admin tables/forms and accessible interactions take precedence over decoration. Preserve `dist/` unless the request affects the developer landing page.

## Governance

Repository and PR artifacts must be written in English, including code comments, UI text, documentation, specifications, generated plans/tasks, agent instructions, commit messages and PR descriptions. Conversation with the owner may remain Vietnamese. Functional Unicode test fixtures and upstream licenses retain their original content. This language rule was explicitly confirmed by the owner on 2026-10-25 and applies to future Spec Kit output.

User direction takes precedence. Amend these principles only for an explicit decision, recording its date/source and impact on affected specs. Do not invent owners, due dates, stack choices or evidence. No new Git branch, automatic issue creation, merge or deployment is implied by running a Spec Kit skill. Reuse the current review branch unless the owner requests another.

2026-10-25 (1.1.1): clarify Principle IV following the owner's archive cleanup and documentation review requests. The standalone repository replaces the parent archive dependency; feature checklists and Notion project status have distinct roles. No scope or stack decision changes.

2026-10-25 (1.2.0): amend Principle III for the owner's Next.js/Vercel frontend-first decision. Website acceptance is independent of deferred connectivity; current work is docs before code. Feature 001 retains its full connectivity requirements and feature 002 owns website delivery.
