# Tasks: Connectivity foundation

Updated: 2026-10-27 · Coordinator-reported branch main · [Plan](plan.md)

Tests are required by owner/project governance. The local BE slice T001–T013 and T017–T018 is complete; FE tasks remain a coordinated follow-up. The current increment authorizes prototype planning only. New execution tasks below are not implementation/deployment authorization. Checked means actual evidence exists, not source merely drafted.

## Setup and foundation

- [x] T001 Audit readiness and resolve local design in specs/001-connectivity-foundation/plan.md and research.md without shared mutation.
- [x] T002 Create aligned pinned NestJS/TypeScript configuration in apps/api/package.json and tsconfig.json; obtain explicit FE lease before package.json/package-lock.json workspace changes or additive install. Authorized additive install and resolved pins verified; no existing package version churn.
- [x] T003 Add isolated PostgreSQL 17.11 fixture in apps/api/compose.yaml and synthetic apps/api/.env.example; preserve host PostgreSQL and FE dependencies. Authorized Compose health and PostgreSQL version/digest observed; volume preserved.
- [x] T004 Generate apps/api/src/generated/api.ts from specs/001-connectivity-foundation/contracts/openapi.json with deterministic drift check; keep apps/web output unmodified.

## Story 1 — Local startup (P1)

Independent check: valid config starts local API; invalid config exits before listen without secrets. DB fixture starts independently of FE.

- [x] T005 [US1] Add observable config/redaction/boundary tests in apps/api/tests/config.test.ts.
- [x] T006 [US1] Implement validated config and loopback bootstrap/shutdown in apps/api/src/config/ and apps/api/src/main.ts.
- [x] T007 [US1] Add scoped root commands in package.json and canonical README.md usage after explicit shared-file lease; preserve FE defaults. BE README hunks survived the FE-only push and are preserved in the final documentation closeout.

## Story 2 — Observe connectivity (P1)

Independent BE check: real HTTP live=200 while DB-down ready=503, within timeout; DB recovery returns ready=200. Full story requires later FE journey.

- [x] T008 [US2] Add HTTP/contract/failure-boundary tests in apps/api/tests/http.test.ts including silent TCP peer, pool pressure, degraded repetition, CORS, unknown route and shutdown.
- [x] T009 [US2] Implement transport/application/adapters under apps/api/src/connectivity/ with fresh DB and full migration-set checks, 3000ms overall deadline and cancellation/resource cleanup.
- [x] T010 [US2] Prove real HTTP → PostgreSQL degraded/recovery behavior in apps/api/tests/integration.test.ts with safe isolated local fixtures.

## Story 3 — Repeatable contracts and migrations (P2)

Independent BE check: codegen has no drift; migrations applied twice create one history record; a failing migration rolls back. Full story still needs FE client use.

- [x] T011 [US3] Implement transactional advisory-locked migration runner in apps/api/scripts/ and initial schema-only migration in apps/api/migrations/ with explicit history table/timeouts.
- [x] T012 [US3] Verify pre/post migration readiness, repeatability, no business tables and rollback/history consistency in apps/api/tests/integration.test.ts.
- [x] T013 [US3] Run BE build/typecheck, functional/HTTP/integration tests and deterministic generation; exact commands/results are recorded in plan.md and PROJECT_STATE.md under the renewed docs lease.

## Coordinated FE follow-up — not this increment

- [ ] T014 [US3] Coordinate FE ownership before generating apps/web/src/lib/api/generated.ts and a typed openapi-fetch transport from the single contract.
- [ ] T015 [US2] Coordinate readable connectivity screen in apps/web/src/features/connectivity/ with loading, failure, keyboard retry and fresh state; use required UI/React skills and application reference.
- [ ] T016 [US2] Extend existing apps/web/tests/e2e/ suite for actual UI → API → DB success, DB/API failure and recovery, preserving feature 002 routes.

## Review and evidence

- [x] T017 Obtain one read-only gpt-6-luna review of apps/api changed code/tests after actual checks. Coordinator-confirmed session 01a17906-036e-7f93-b50b-f0fb9e7f519a returned no confirmed actionable findings; no source fix or redundant test rerun required.
- [x] T018 Update PROJECT_STATE.md, README.md, AGENTS.md and specs/architecture.md only after serial lease. Resumed-lane governance was added under the earlier root-source lease; final README/PROJECT_STATE evidence records actual checks, review, FE-only push and incomplete UI acceptance. BE source remains uncommitted.

## Dependencies and execution

T001 → T002–T004 → T005–T007 → T008–T010 → T011–T013 → T017–T018. T010 evidence needs T011 even though test design can precede migrations. T014–T016 require a new explicit FE coordination handoff after BE contract is stable. Source may be prepared while installs are queued; no task requiring runtime validation is complete before checks execute.

Within each story tests and implementation are authored by the same BE OMP. No parallel BE source writers; FE can continue disjoint UI work. Config test design (US1), HTTP acceptance design (US2) and migration test design (US3) may be reviewed read-only independently. No [P] labels authorize shared-root concurrency. Deliver a coherent local BE slice first; never mark full Stories 1–3/SC-002 complete from backend-only evidence. Stop before commit/push/deploy.

## Story 4 — Internal hosted prototype (planned)

Independent acceptance: protected HTTPS health/readiness backed by the approved single Supabase project, bounded failure/recovery, verified TLS and native artifact proof. FR-009–012 / SC-005–006; no new UI or business endpoints.

- [x] T019 [US4] Complete the planning-only amendment in specs/001-connectivity-foundation/spec.md, plan.md, research.md, data-model.md, quickstart.md and tasks.md plus leased governance docs; run read-only consistency analysis and record actual documentation checks. All 18 original task rows and 96 protected source/config/pointer files were unchanged; 10 Markdown files/38 local links and 31 sequential task IDs passed checks. Analysis found no blocking inconsistency; coordinator review is the stopping point, not source approval.
- [ ] T020 [US4] External prerequisites remain deferred: actual Session connection metadata/private credential, separate BE project, eligible use and platform tester access. Source/local T021–T025 was authorized independently. The owner granted the one serial install through Ask; installation and handback are complete. Do not request secrets or contact real endpoints during code-first work.
- [x] T021 [US4] Implement local/vercel startup and exact project-bound Session target configuration; preserve local defaults and environment-only hosted loading. Existing config/integration suites passed target/port/role/marker boundaries, safe diagnostics, local file/export precedence and real pg TLS trusted/untrusted/wrong-host cases through a synthetic loopback TLS fixture.
- [x] T022 [US4] Implement warm-instance pool composition with @vercel/functions3.10.4, hosted max2/local max4, fresh migration-aware reads and unchanged deadlines. Existing suites proved hosted pressure, reuse, blocked SQL, cancellation, idle cleanup and recovery; the separate platform helper attaches once during composition. Actual Vercel cancellation remains T025/T030 external proof.
- [x] T023 [US4] Remove the runtime directory-scanning adapter; import the generated ordered name/hash manifest from src/generated/migrations.ts. API build/check detects manifest drift; stage:operator packages compiled API/operator files, approved .mjs assets and runtime dependencies. Checks passed ambiguous/missing/changed assets, later pending/failed migration detection and real staged CLI apply twice outside repository cwd.
- [x] T024 [US4] Add separate hosted operator config/command requiring MIGRATION_DATABASE_URL, exact target confirmation and verified Session TLS/5432. Reject transaction endpoints, Vercel-function migration execution and remote destructive fixture targets. Local migration behavior, advisory locks, single history and rollback/recovery checks passed; no remote migration ran.
- [ ] T025 [US4] Local portion complete: Node24 codegen/manifest drift, typecheck/build, 11 config/HTTP checks, 11 integration checks including TLS subtests, portable staged entrypoint/CLI and separate real HTTP failure/recovery smoke passed. Native settings are prepared in apps/api/vercel.json, but the network-denied CLI65.4.0 attempt returned project_settings_required. Native artifact compilation/ESM/decorator/cancellation proof remains pending genuine approved project setup; tsc is not substituted.
- [x] T026 [US4] Coordinator completed one separate Codex gpt-6-luna read-only review of T021–T025 and their checks, session `01a17c65-9fda-7fd1-8e74-344facca83c2`: no confirmed actionable findings. No reviewer edits, code fixes or test/build reruns were needed. Native Vercel artifact, real Supabase and HTTPS/access proof remain pending; review does not authorize remote execution.
- [ ] T027 [US4] With explicit read-only SQL permission, verify target identity, existing schema/history, TLS, credential privileges and connection budget on eotmpaliqcxxcotrcols. Obtain separate write approval for the exact node-pg-migrate set/checksum through the approved Session endpoint. Stop on collisions or missing privileges; no automatic role/grant creation, reset, adoption or deletion.
- [ ] T028 [US4] After T027 write approval, run the staged migration CLI once and again (zero new applications), verify schema/history and prove actual HTTP → Session pooler → readiness, server timeout and cleanup using the owner-approved existing credential. Record sanitized evidence; never run destructive local tests against Supabase or invoke Supabase migrations.
- [ ] T029 [US4] Obtain explicit preview-deployment and scoped secret/protection-setting approval for the verified separate BE Vercel project. Confirm eligible plan, tester access, exact root/region/preview target and credential privilege exposure. Do not set operator-only MIGRATION_DATABASE_URL in the runtime environment, rely on first-run bare CLI defaults or use production/domain/FE actions.
- [ ] T030 [US4] Publish only the approved protected preview and exercise authorized HTTPS live/ready, anonymous denial, unknown route, repeated/concurrent requests and platform cancellation/resource behavior. With separate approval use an isolated preview's invalid DB config for non-destructive bounded failure/recovery; never interrupt shared Supabase. Record cold/warm observations separately from the 3000ms handler deadline.
- [ ] T031 [US4] Local portion complete: owner guide/example and actual local/offline evidence are recorded in README, PROJECT_STATE and feature001 plan/quickstart; the short docs window preserved FE/application003 content and was returned. Dependency lease is returned and T026 review evidence is recorded. Hosted/native evidence and protected URL remain pending; no production/Git claim or completion of T014–T016.

### Prototype dependencies and stopping points

Code-first order: T019 → owner source approval → T021–T024 → local/offline portions T025 → READY_FOR_REVIEW for coordinator T026. T020 remains open and gates all T027–T030 external work, not source/local verification. T031 local guide/evidence proceeds without external credentials. T022 depends on T021; T024 packaging depends on T023. Installation requires an explicit short serial START and handback before tests. Native proof that needs real project linkage remains pending rather than faked. T027 read permission never authorizes writes; T029 remains a separate publication gate.

One BE source writer, existing checkout and advancing user branch preserved; no Git operation or FE/feature002/003 write. Current completion boundary is locally verified code, an owner setup guide and completed T026 read-only review. No further reviewer or remote work is authorized by this closeout. README/PROJECT_STATE writes wait for FE handback; evidence stays in plan.md meanwhile. Cloud Run/AWS/Azure remain deferred.
