# Feature specification: Connectivity foundation

Feature: 001-connectivity-foundation · Created: 2026-10-25 · Status: deferred by the owner's frontend-first priority; requirements retained; implementation not started.

Source: owner's FE–BE foundation request and [ARCH-001](../architecture.md). Tracking: [Notion C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb). This feature directory is independent of Git branch naming; keep the existing review branch.

The active deliverable is [feature 002 — Developer website](../002-developer-website/spec.md). The owner selected Next.js/Vercel and prioritized a public registration URL before this connectivity foundation. This file remains the later FE–BE–DB scope; do not use it to block or claim completion of the website.

## User scenarios and testing

Stories 2 and 3 use the local environment established by Story 1. Foundation acceptance requires all three stories; starting services alone does not complete the feature.

### Story 1 — Start the workspace locally (P1)

As a developer, I can configure and start the frontend, backend and database from documented root commands so that I can continue implementation without rediscovering setup.

Acceptance scenarios:

1. Given a fresh environment with the documented prerequisites, when the developer follows README setup/start commands, then the frontend, backend and database are available locally without undocumented steps.
2. Given missing or malformed required configuration, when the affected service starts, then it reports the invalid field and how to fix it without exposing secret values.

### Story 2 — Observe connectivity (P1)

As a developer, I can open a connectivity screen that calls the backend, checks the database and reports the actual result.

Acceptance scenarios:

1. Given running services and a reachable database, when the screen checks connectivity, then it shows loading followed by success from the real UI → API → DB path.
2. Given an unavailable API or database, when the check completes, then the screen shows an error/degraded result and a usable retry action rather than success or indefinite loading.
3. Given a running backend with an unavailable database, when health/readiness is inspected, then process health and database readiness report their distinct states.
4. Given a restored dependency, when the developer retries, then the screen reports the new result. Include empty state only where data can actually be absent.

### Story 3 — Continue with consistent contracts (P2)

As a developer or agent, I can regenerate the API client, apply migrations and run verification from the root so changes have one contract and repeatable evidence.

Acceptance scenarios:

1. Given the approved contract and tools, when code generation runs, then the FE client/transport types derive from that contract without a second manually maintained set.
2. Given the configured database, when migrations apply and are rerun, then the database reaches the intended foundation state without duplicate application of completed migrations.
3. Given the documented root verification commands, when they run, then each completes or reports a concrete failure recorded in PROJECT_STATE; an unrun check is not reported as passing.

### Edge cases

- Missing/malformed environment values fail validation before the affected service accepts work; diagnostics do not reveal credentials.
- An unreachable API/database produces a recoverable error/degraded state. Planning must define bounded connection/request timeouts using the approved stack; no numeric timeout has been approved yet.
- Failed checks must not display a previous successful result as current. Restoring a dependency allows a fresh check through retry.
- Migration failure must remain visible and prevent a readiness claim; recovery behavior must follow the approved migration tool's guarantees.
- Connectivity checks do not create order, seller or supplier records; an empty business dataset is not a connectivity failure.

## Requirements

- FR-001: Provide one FE and one modular-monolith BE with the boundaries in ARCH-001.
- FR-002: Validate environment at startup and document secret-free examples.
- FR-003: Connect to the approved database and supply a migration mechanism without inventing operational business tables.
- FR-004: Expose truthful process health and database readiness.
- FR-005: Use one contract/schema and generated FE client suited to the approved stack.
- FR-006: Provide a readable connectivity screen with loading, error and recovery behavior; apply the existing UI skills.
- FR-007: Provide setup/dev/check/build/codegen/migration root commands relevant to the stack.
- FR-008: Update README usage and PROJECT_STATE with actual verification and remaining work.

## Dependencies and assumptions

- ARCH-001 records Next.js/Vercel for the frontend and NestJS/Cloud Run + Supabase PostgreSQL for later connectivity. Exact backend/database versions, local setup and migration/codegen tools still need resolution when this feature resumes.
- This feature runs locally and does not require Etsy credentials, a supplier connection or a hosting provider.
- This feature follows the public website/API-registration preparation milestone. It is not a prerequisite for that website.
- Persistence is limited to connectivity/migration needs; operational business entities are outside this feature.
- UI requirements inherit ARCH-001: readable text/controls, visible keyboard focus, keyboard-operable retry, accessible status feedback and layouts usable on narrow and desktop screens. Doodle is guidance for future UI, not a claim that the existing landing page already uses it.

## Success criteria

- SC-001: README enables the verified local startup path without undocumented steps.
- SC-002: The UI shows success from a real database check and failure when that dependency is unavailable.
- SC-003: Contract generation, migration and appropriate checks are repeatable with recorded results.
- SC-004: The existing public website remains available and separate from connectivity/admin UI when this feature is implemented.

## Decisions to resolve when this feature resumes

The frontend decision is supplied: Next.js hosted on Vercel. Backend/database direction remains NestJS on Cloud Run and Supabase PostgreSQL. Resolve exact versions, database development/connection mode and migration/API-codegen tools in this feature's later plan. No such plan or implementation is claimed now.

## Out of scope

Real Etsy OAuth/import, operational order processing, BurgerPrints submission, production role enforcement, cloud deployment, new issues/trackers, microservices and automatic Git branching.
