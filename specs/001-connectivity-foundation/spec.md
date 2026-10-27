# Feature specification: Connectivity foundation

Feature: 001-connectivity-foundation · Created: 2026-10-25 · Status: prototype code/local checks and separate read-only review complete; native/hosted/full connectivity acceptance remains pending.

Source: owner's FE–BE foundation request and [ARCH-001](../architecture.md). Tracking: [Notion C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb). This feature directory is independent of Git branch naming; keep the existing review branch.

The owner resumed this backend lane alongside [feature 002 — Developer website](../002-developer-website/spec.md). The website remains independent. This increment covers local backend/environment/database/contracts and tests; frontend connectivity UI and generated output in apps/web require a later coordinated handoff. Backend-only checks cannot satisfy full UI → API → DB acceptance.

The 2026-10-27 prototype plan selects native Vercel NestJS with the existing single Supabase project. The owner subsequently authorized code-first source/local checks and an owner setup guide; actual external setup, remote database access and deployment remain deferred. Cloud Run/AWS/Azure are not prerequisites. Story 4 is a separate prototype milestone; it neither replaces Stories 1–3 nor completes their pending frontend acceptance.

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

### Story 4 — Inspect an internal hosted prototype (P1, planned)

As an authorized team member, I can inspect process health and current database readiness of a deployed prototype without exposing credentials or introducing business integrations.

Acceptance scenarios:

1. Given approved account, plan eligibility and team access, an authorized member can reach the existing health endpoints over HTTPS; unapproved anonymous access remains blocked by deployment protection.
2. Given the approved database and applied foundation migrations, readiness reports success from a fresh query. A non-destructive isolated failure check reports degraded within the planned bound, while process health remains successful; restoring configuration permits a fresh successful check.
3. Given a deployment artifact outside the repository working directory, startup and the complete expected migration-state check work without local file-layout assumptions. Migration execution remains a separate explicitly approved operator action.
4. Given missing target approval, untrusted TLS, a different database host or absent migration state, the prototype never reports readiness success. Existing local setup and failure/recovery checks continue to pass.

### Edge cases

- Missing/malformed environment values fail validation before the affected service accepts work; diagnostics do not reveal credentials.
- An unreachable API/database produces a recoverable error/degraded state. The approved local plan defines bounded connection/query/overall timeouts and immediate failure under pool saturation.
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
- FR-009: Limit the hosted prototype to the existing process-health and database-readiness contract, synthetic/test use and explicitly approved team access; do not add UI, authentication modules or business endpoints.
- FR-010: Hosted configuration must explicitly identify the approved database target, verify its TLS identity, keep credentials out of responses/logs and preserve restrictive local defaults.
- FR-011: Reuse bounded database resources across hosted requests, cancel/release failed work and check the entire migration state; retain one migration history with separately authorized migration execution.
- FR-012: Record native deployment-artifact, real database and HTTPS/access evidence before claiming the prototype complete; preserve local verification and the pending frontend work.

## Dependencies and assumptions

- ARCH-001 records Next.js/Vercel for the frontend and portable NestJS + Supabase PostgreSQL for the backend/database. Native Vercel NestJS is the prototype candidate; Cloud Run is deferred. The local foundation uses NestJS 12, Node 24, isolated PostgreSQL 17.11, node-pg-migrate 9 and OpenAPI-generated types. Local proof does not establish hosted connectivity.
- Stories 1–3 run locally without Etsy credentials, supplier connections or a hosting provider. Story 4 additionally requires verified personal Vercel identity/project, eligible plan, approved team access and explicit access to the existing Supabase project; metadata availability alone proves none of these.
- The owner authorized parallel local backend preparation on 2026-10-26. It is not a prerequisite for the website or authorization for operational integrations.
- Persistence is limited to connectivity/migration needs; operational business entities are outside this feature.
- UI requirements inherit ARCH-001: readable text/controls, visible keyboard focus, keyboard-operable retry, accessible status feedback and layouts usable on narrow and desktop screens. Doodle is guidance for future UI, not a claim that the existing landing page already uses it.

## Success criteria

- SC-001: README enables the verified local startup path without undocumented steps.
- SC-002: The UI shows success from a real database check and failure when that dependency is unavailable.
- SC-003: Contract generation, migration and appropriate checks are repeatable with recorded results.
- SC-004: The existing public website remains available and separate from connectivity/admin UI when this feature is implemented.
- SC-005: An authorized team member can inspect HTTPS live=200 and ready=200 from the real approved database; an isolated non-destructive failure/recovery exercise demonstrates truthful degraded/recovered results with an application readiness deadline of 3000ms.
- SC-006: Local checks and the standalone deployment artifact pass the planned checks, with secrets redacted and no second database project, migration history or frontend change.

## Prototype approval gates

Default scope is health/readiness only with synthetic/test use. The plan resolves the technical candidate; the coordinator must obtain owner decisions for account/plan eligibility, protected team access, exact database connection metadata and staged tooling/source/database/deployment leases. No unresolved approval is interpreted as permission. Full frontend connectivity remains a separate handoff.

## Out of scope

Real Etsy OAuth/import, operational order processing, BurgerPrints submission, application authentication/role modules, production release, Cloud Run/AWS/Azure setup, new issues/trackers, microservices and automatic Git branching. The latest owner authorization covers prototype source/local verification and an owner setup guide only; actual account/endpoint/credential setup, remote SQL and deployment remain deferred. Story 4 hosted acceptance is not implied by locally verified code.
