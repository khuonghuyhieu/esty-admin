# Tasks: Connectivity foundation

Updated: 2026-10-30 · Actual branch main · [Plan](plan.md)

Current scope: READY_FOR_OWNER_MANUAL_ACTIONS; STOP WRITES. T059 closed after original one-P2 Luna review → OMP fix/affected checks → coordinator fix-only read-only acceptance; no unresolved confirmed findings remain in that scoped review. T060 docs-only checks/closeout complete with three disclosed pre-existing historical fragment-link limits. All68 IDs remain:55 completed/13 pending, only T059/T060 states changed. Coordinator returns the existing FE lease/final pT receipt. Sealed07 is stale; p2-fix01 is development-only. Publication, Linux release artifact, T054/historical unfulfilled native, hosted and FE gates remain separate.


## Latest owner hosting preference — Vercel, 2026-10-29

Reuse existing esty-admin-api metadata only: prj_uITHKLUGGE98VxrEcs5FoktBbcls, scope khuonghuyhieu0705s-projects, apps/api/Node24. Plan-first Vercel source/local adaptation and new T055 review are complete; preserve all current source and historical evidence. Genuine native T054 remains pending independently of Render T025/T045–T047. T056 closes documentation only; no inherited publication or external permission.

A personal account does not by itself establish non-commercial use. Official Vercel fair-use guidance defines commercial use by intended financial gain; using an internal tool for one's own shop may still fall within that definition. No provider classification/enforcement method or project-specific eligibility is known, and no paid upgrade/payment method/trial is authorized. Document this unresolved eligibility limit without forcing a new provider or presenting it as verified compliance.

Existing owner-prepared runtime/operator files are forbidden agent input. The owner later performs explicit hidden-TTY conversion into separate Vercel outputs; default reads/writes no private files. Fresh FE docs lease permits narrow BE updates only; preserve FE003/T013/preview/gallery and dated evidence byte-for-byte. No source publication or provider/SQL/deploy/DNS action.


## Required delivery endpoint

Final BE must run at https://api.lovora.us on the existing Vercel BE project and Supabase cloud. Local/provider-only success is not final acceptance. T048 remains pending for exact Vercel-provided api-only DNS, verified domain/alias/TLS and real HTTP. Native proof T054 is reopened independently of historical Render artifact T025.

## Historical execution order and current adaptation

- IncrementA, BE local: T037 → T038 → T042/T043 (status/report helpers) → T039/T040 (actual local smoke/affected checks) → T044 (one combined review) → T041 (final docs). Existing status/report command must be packaged with its helper dependencies before copied-operator acceptance.
- IncrementB, FE local: separately authorized T014 → T015 → T016 after A and the stable contract; no cloud prerequisite.
- IncrementC, cloud source/tooling: T032–T036, T045/T046, selected-provider artifact T025 and release driver T047 were authorized alongside A without waiting for FE B; source/local evidence and one independent combined review are complete.
- IncrementD, real external release: remaining T020/T027–T031 and T048, under the applicable target/private-input/read/write/deploy/DNS scope. Safe actual functional tests through api.lovora.us are required; destructive/full fixture suites stay local.

All48 IDs and historical completed tasks are preserved. Source/local completion states below reflect this authorized increment; external T048 remains unchecked. No task range authorizes a writer outside its FE/BE/shared-file lease.

Current order is T049 → T050/T051/T052 (one writer) → T053 → T055 coordinator review → T056 docs closeout. T054 remains pending if genuine settings/native artifacts are unavailable without provider access. External T020/T027–T031/T048 and FE T014–T016 stay separately gated. Checked task descriptions below are historical records; active provider instructions are the corrected open tasks and new adaptation tasks.

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

- [ ] T014 [US3] After Supabase-local/contract readiness and an explicit FE handoff, generate apps/web/src/lib/api/generated.ts and typed transport from the single contract, with drift checking and exact loopback API-origin validation; follow plan’s next-local-slice design. Any openapi-fetch install needs a separate serial dependency lease and verified exact pin.
- [ ] T015 [US2] Implement the separately approved local-only connectivity screen in apps/web/src/features/connectivity/ and proposed apps/web/src/app/connectivity/page.tsx: default-disabled gate, idle/checking/ready/degraded/unreachable, distinct live/ready indicators, safe contract errors,5s proposed client bound, cancellation/stale-result handling and keyboard retry; use required UI/React skills and application reference without changing FE003 sample frame.
- [ ] T016 [US2] Extend existing apps/web/tests/e2e/ for actual browser→local API→Supabase-local readiness plus safe API/DB failure/recovery using only test-owned processes/configuration, default-disabled404, focus/status/mobile behavior and public/Application regressions. Never reset/stop shared Supabase or redirect destructive fixtures. Record actual checks and the separate scoped Luna review/owner screen acceptance in PROJECT_STATE.md; no hosted proof inferred.

## Review and evidence

- [x] T017 Obtain one read-only gpt-6-luna review of apps/api changed code/tests after actual checks. Coordinator-confirmed session 01a17906-036e-7f93-b50b-f0fb9e7f519a returned no confirmed actionable findings; no source fix or redundant test rerun required.
- [x] T018 Update PROJECT_STATE.md, README.md, AGENTS.md and specs/architecture.md only after serial lease. Resumed-lane governance was added under the earlier root-source lease; final README/PROJECT_STATE evidence records actual checks, review, FE-only push and incomplete UI acceptance. Earlier uncommitted source was subsequently published in8558e33; this checked task is historical evidence.

## Dependencies and execution

T001 → T002–T004 → T005–T007 → T008–T010 → T011–T013 → T017–T018. T010 evidence needs T011 even though test design can precede migrations. T014–T016 require a new explicit FE coordination handoff after BE contract is stable. Source may be prepared while installs are queued; no task requiring runtime validation is complete before checks execute.

Within each story tests and implementation are authored by the same BE OMP. No parallel BE source writers; FE can continue disjoint UI work. Config test design (US1), HTTP acceptance design (US2) and migration test design (US3) may be reviewed read-only independently. No [P] labels authorize shared-root concurrency. Deliver a coherent local BE slice first; never mark full Stories 1–3/SC-002 complete from backend-only evidence. Stop before commit/push/deploy.

## Story 4 — Internal hosted prototype (planned)

Independent acceptance: selected-provider compiled artifact verified locally, then actual HTTPS/access/live/readiness/origin/unknown-route checks at api.lovora.us against the approved Supabase target. Failure/recovery/load suites remain local; no untested hosted behavior is claimed. FR-009–012/FR-015/SC-005–006; no business endpoints.

- [x] T019 [US4] Complete the planning-only amendment in specs/001-connectivity-foundation/spec.md, plan.md, research.md, data-model.md, quickstart.md and tasks.md plus leased governance docs; run read-only consistency analysis and record actual documentation checks. All 18 original task rows and 96 protected source/config/pointer files were unchanged; 10 Markdown files/38 local links and 31 sequential task IDs passed checks. Analysis found no blocking inconsistency; coordinator review is the stopping point, not source approval.
- [ ] T020 [US4] Complete actual external prerequisites for existing Vercel esty-admin-api only: intended-use/Hobby eligibility, exact scope/team/project/root/Node/settings, private converted inputs and preview access, native T054 and real Supabase TLS/capacity. Documented metadata/owner-prepared files do not establish actual acceptance. No account reads, secret inspection, install or external operation in source/local work.
- [x] T021 [US4] Implement local/vercel startup and exact project-bound Session target configuration; preserve local defaults and environment-only hosted loading. Existing config/integration suites passed target/port/role/marker boundaries, safe diagnostics, local file/export precedence and real pg TLS trusted/untrusted/wrong-host cases through a synthetic loopback TLS fixture.
- [x] T022 [US4] Implement warm-instance pool composition with @vercel/functions3.10.4, hosted max2/local max4, fresh migration-aware reads and unchanged deadlines. Existing suites proved hosted pressure, reuse, blocked SQL, cancellation, idle cleanup and recovery; the separate platform helper attaches once during composition. This checked result covers the earlier Vercel composition only; future Render behavior is T045 and local tests, with no inferred hosted cancellation proof.
- [x] T023 [US4] Remove the runtime directory-scanning adapter; import the generated ordered name/hash manifest from src/generated/migrations.ts. API build/check detects manifest drift; stage:operator packages compiled API/operator files, approved .mjs assets and runtime dependencies. Checks passed ambiguous/missing/changed assets, later pending/failed migration detection and real staged CLI apply twice outside repository cwd.
- [x] T024 [US4] Add separate hosted operator config/command requiring MIGRATION_DATABASE_URL, exact target confirmation and verified Session TLS/5432. Reject transaction endpoints, Vercel-function migration execution and remote destructive fixture targets. Local migration behavior, advisory locks, single history and rollback/recovery checks passed; no remote migration ran.
- [x] T025 [US4] Selected-provider SOURCE/LOCAL portion complete: an isolated copied Render-mode compiled service booted outside repository cwd, enforced preview access before DB work, verified real loopback TLS/migration readiness and unknown404, then shut down on SIGTERM. Test-only transport remapping and outbound isolation are documented, including the initial failed fixture and correction. Historical native Vercel proof remains superseded/unexecuted; actual provider/domain behavior belongs to T030/T048 and is not claimed.
- [x] T026 [US4] Coordinator completed one separate Codex gpt-6-luna read-only review of T021–T025 and their checks, session `01a17c65-9fda-7fd1-8e74-344facca83c2`: no confirmed actionable findings. No reviewer edits, code fixes or test/build reruns were needed. Native Vercel artifact, real Supabase and HTTPS/access proof remain pending; review does not authorize remote execution.
- [ ] T027 [US4] With explicit read-only SQL permission, verify target identity, existing schema/history, TLS, credential privileges and connection budget on eotmpaliqcxxcotrcols. Obtain separate write approval for the exact node-pg-migrate set/checksum through the approved Session endpoint. Stop on collisions or missing privileges; no automatic role/grant creation, reset, adoption or deletion.
- [ ] T028 [US4] After exact T027 target/write approval, use the staged versioned operator once and again expecting zero additional applications, verify real schema/history/TLS and record sanitized counts/report. No hosted stress/failure suite, shared Supabase interruption, destructive local tests, second migration engine or inferred deployment readiness. First-run count follows actual preflight, not an assumed1.
- [ ] T029 [US4] Under separate external authorization, verify existing Vercel BE project id/scope/account, apps/api root/nestjs/Node24, repository/main, git.deploymentEnabled=false and no deployment bypass, runtime-only settings and application bearer boundary. Standard Protection excluding production domains is not api.lovora.us access evidence. Resolve intended-use eligibility without forced paid upgrade/payment/trial; no new Render onboarding or FE mutation.
- [ ] T030 [US4] Release the exact reviewed Vercel commit through the approved serialized migration-first driver after native T054 and real DB/settings approval; verify provider gitSource/project/owner/target and alias binding to the same deployment, then safe actual TLS/live/ready/access/unknown-route/origin behavior through api.lovora.us after T048. Provider READY/URL alone is incomplete; no destructive or failure-injection cloud suite.
- [ ] T031 [US4] Source/local owner guide, reports, selected-provider artifact evidence and actual checks are recorded in README/PROJECT_STATE/feature001 under the current FE pause receipt. Historical T026 and the completed A+C combined review remain distinct evidence. Real DB/api.lovora.us DNS/TLS/functional acceptance and FE T014–T016 remain open. Coordinator returns the current docs lease; no publication or hosted completion claim.

### Prototype dependencies and stopping points

Historical code-first order: T019 → owner source approval → T021–T024 → local/offline portions T025 → READY_FOR_REVIEW for coordinator T026. T020 remains open and gates real T027–T030 external work, not local setup/report verification. T031 local guide/evidence proceeds without external credentials. T022 depends on T021; T024 packaging depends on T023. Installation requires an explicit short serial START and handback before tests. Native proof that needs real project linkage remains pending rather than faked. T027 read permission never authorizes writes; T029 remains a separate publication gate.

One BE source writer, existing checkout and advancing user branch preserved; no Git operation or FE/feature002/003 write. Historical completion boundary was locally verified code, an owner setup guide and completed T026 read-only review. No further reviewer or remote work was authorized by that historical closeout; new increment reviews follow the current order. README/PROJECT_STATE writes wait for FE handback; evidence stays in plan.md meanwhile. Cloud Run/AWS/Azure remain deferred.

## Story 5 — Historical offline preparation, 2026-10-28

The owner authorized offline source preparation with synthetic fixtures only. T032–T036 are complete, including T035's independent combined review. Exact Session metadata is fixed, but T020's real inputs are not complete. No actual private backend files were created/read; default status is OWNER_INPUT_PENDING.

Independent acceptance: secret-free templates plus a tested owner-operated preparation flow can be reviewed without any real password. The owner can enter it privately later; no SQL/browser/cloud evidence is required or claimed.

- [x] T032 [US5] Added apps/api/config/hosted-target.example.json with the exact approved eotmpaliqcxxcotrcols / aws-0-ap-northeast-2.pooler.supabase.com /5432/postgres/postgres.eotmpaliqcxxcotrcols tuple and pending origin/access metadata. No password, platform marker or migration confirmation; local defaults preserved.
- [x] T033 [US5] Pure offline helper and synthetic tests verify raw reserved/Unicode password round-trip, empty/control/surrogate rejection, exact tuple, redaction and runtime/operator separation. Runtime excludes MIGRATION_*; operator excludes runtime/platform/preview keys and execution confirmations. No dependencies added.
- [x] T034 [US5] Default preparation is OWNER_INPUT_PENDING with no secret files. Explicit owner TTY mode hides input/restores terminal, creates0700/0600/no-overwrite/no-symlink private pairs and an independent preview key, and cleans newly written partial pairs. Actual PTY success/cancel and terminal-error cleanup, synthetic filesystem/permission/read-only boundaries passed. No agent access to actual private backend files.
- [x] T035 [US5] Source/local checks complete: offline tests are wired into API checks,22/22 combined checks passed, then the affected offline5/5 and two additional private-read/terminal-error checks2/2 passed. Coordinator verified gpt-6-luna runtime availability and completed one independent read-only combined A+C review, session `01a181cd-ca5d-7771-b349-34c0801402ca`, exit0: no confirmed actionable findings. Reviewer made no edits and ran no tests/build/cloud; no source fix or redundant rerun needed.
- [x] T036 [US5] Current explicit FE pause receipt used for narrow README/PROJECT_STATE updates; exact owner command, private paths and OWNER_INPUT_PENDING recorded, quickstart/tasks reconciled. README owns one remaining-manual-actions list. Actual secret input/upload, real DB/provider/domain gates and FE T014–T016 remain open. Coordinator returns the lease; no Git publication.

Dependencies remain T032 → T033 → T034 → T035 → T036; documentation now records the completed independent combined review. Prior T026 is retained separately, not substituted. T046 separately updates the sole transport contract; offline tooling introduces no API endpoints.

## Story 6 — Supabase local development environment

The owner authorized minimum Supabase-local development plus source-only cloud preparation. DB-only CLI2.122.0/PostgreSQL17.11.0.006 is verified on loopback54322; Studio/gateway and application Auth/Storage features remain disabled. Existing cloud resources and the strict standalone fixture55432 are preserved. Source/local completion does not establish hosted acceptance.

- [x] T037 [US6] Inspected installed CLI2.122.0/Docker29.4.0 and supported temporary-init schema. Added unique esty-admin-local config with PostgreSQL17, disabled seed/replay and dedicated loopback network. Verified actual127.0.0.1:54322 binding; company/cloud profiles, FE state and fixture volumes preserved.
- [x] T038 [US6] Added API-workspace start/status/stop wrapper using the existing binary, empty local-only auth/config context and no remote commands. Sanitized status omits generated keys; nested API ignore covers CLI runtime state. Actual targeted start/stop/restart passed without deleting volumes.
- [x] T039 [US6] Bounded Supabase-local acceptance passed: exact synthetic target/version, compatible history, apply1/rerun0, actual live/ready200, client-only failure503 and recovery200. No reset/system-schema mutation; destructive guard remains exact standalone fixture only.
- [x] T040 [US6] Local scripts, Node24 build/config/HTTP/report regressions and actual stop/restart persistence verified. Separate Supabase-local profile added to .env.example; no actual .env overwritten. Evidence/limitations recorded in plan.md for the combined review.
- [x] T041 [US6] Under the current shared-doc receipt, README/PROJECT_STATE and quickstart document actual startup/status/migrate/stop/check commands and limits. FE T014–T016 is explicitly separate; no cloud password, hosted success, Git publication or DNS action implied.

Combined local/source execution and T044's independent combined review are complete. T014–T016 still needs a separate FE handoff and is not implemented by BE checks.

## Migration version/status visibility

Owner-confirmed immutable versions and failure/stage reporting are implemented locally using the existing history and runner. No actual provider release was executed.

- [x] T042 [US3] Read-only status never initializes history; custom v9 loader and transaction observation identify both action and SQL failures in the exact version, preserve advisory locking/order and whole-batch rollback, and keep raw SQL/errors out of reports. Existing manifest drift/order guards remain. Disposable-fixture tests passed, including cancelled/unknown outcomes.
- [x] T043 [US3] Added migration-status entrypoint, sanitized machine reports and concise nonzero failure summaries. Copied operator status/migrate/report closure ran outside repo cwd. Actual CLI report-write failure returned1 while preserving committed DB outcome; no startup DDL, audit table or root command change.
- [x] T044 [US3] Actual Node24/local fixture/Supabase/artifact/report checks and docs are complete. The same independent read-only gpt-6-luna A+C review as T035, session `01a181cd-ca5d-7771-b349-34c0801402ca`, completed with no confirmed actionable findings; historical T026 is not substituted. No reviewer edits/tests/build/cloud or source fix/redundant rerun. README retains release order, uncertain outcomes/lock and old-readiness/rollback limits; real cloud acceptance and the initial synthetic outbound-attempt disclosure remain unchanged.

Historical reporting/local T044 review remains complete. The new Vercel T055 review is also complete independently; T056 documentation closeout follows. Source publication and actual external acceptance remain separately gated.

## Historical Render source/local completion — 2026-10-28

T045–T047 below preserve the reviewed Render implementation/results at that date. They are not active provider instructions or Vercel acceptance; T050–T054 supersede their provider-specific source paths.

- [x] T045 [US4] Explicit Render marker/PORT/env-only mode, exact approved Session/TLS tuple, hosted pool max2 and persistent shutdown implemented; local/Vercel preserved. Synthetic config/HTTP checks and isolated compiled Render/TLS/readiness/SIGTERM proof passed. Actual Render settings remain unverified.
- [x] T046 [US4] Preview-only64hex bearer boundary returns generic401 before any connection, permits only safe exact-origin GET/Authorization preflight and returns authorized unknown404. Local/Vercel unchanged; sole OpenAPI401/security and BE generated types updated. No real preview key or browser auth integration provisioned.
- [x] T047 [US4] Owner-invoked release source uses separate private operator/deploy context, exact clean source/manifest/target, one run lock, status→migration/report→same-commit Render deploy→safe domain smoke. Synthetic/disposable tests passed migration-failure deploy refusal, queued/failed/wrong-commit/cancel/timeout outcomes, serialization and persisted committed-DB/deploy-failure/lock state. Real service/API/SQL/deployment remain T020/T027–T030 gates, not exercised.

One combined review covers A/C and selected-provider T025. This source/local completion does not complete real T020/T027–T031/T048 or FE T014–T016. No reviewer, commit/push or external operation is initiated by OMP.

## Required custom API domain and hosted testing

- [ ] T048 [US4] After separate actual Vercel project/domain approval, add only api.lovora.us to existing esty-admin-api and obtain its exact required DNS records. Apply only the approved GoDaddy api-label correction; preserve app/root/mail/nameservers/unrelated DNS, no invented CNAME/IP. Verify domain ownership/TLS and alias project/deployment identity, confirm app.lovora.us unaffected, then T030 safe real functional checks. Record sanitized evidence in feature001 plan/README/PROJECT_STATE; no hosted completion from local/provider-only proof or automatic domain mutation by release code.

Final acceptance order: reviewed local/source preparation → approved existing-project/native/domain-ownership setup → actual DB preflight/approved migration and same-commit release → T048 same-deployment alias/TLS acceptance → T030 domain functional results → T031 evidence closeout. T048 remains mandatory; its initial domain setup precedes the release preflight, while final binding follows deployment. All original48 IDs and historical completed work are retained; the new adaptation tasks follow.

## Vercel adaptation — authorized plan then source/local, 2026-10-29

- [x] T049 Active documents aligned before source. Installed feature/no-persist prerequisites/setup completed without template/pointer replacement. Read-only consistency found no blocking contradiction/constitution violation or uncovered FR001–017; all56 IDs remain unique, original38 completions retained. Native T054 remains pending; subsequent T055 review completion is recorded below, not inherited from history.
- [x] T050 [US4] Local/vercel-only runtime, retired-provider refusal, exact Session target and Vercel bearer composition implemented; attachDatabasePool/bounds preserved. Sole OpenAPI0.3.0/BE types regenerated. Config9/9 and HTTP4/4 passed, including duplicate denial/noDB/safe OPTIONS/authorized404.
- [x] T051 [US5] Pure validated Vercel conversion and explicit hidden-TTY owner entrypoint implemented; original files preserved, separate0700/0600/no-overwrite outputs, context/Unicode/target rejection and confirmation stripping. Offline8/8 passed in the corrected14/14 provider+offline run, including real PTY confirm/cancel; actual owner inputs never read.
- [x] T052 [US4] Active Render adapter replaced with normalized Vercel project/source/owner/target/domain binding and safe smoke. Migration-first reports/locks and git.deploymentEnabled=false enforced. Synthetic provider6/6 passed; initial alias-counter test-fixture failure and correction are recorded, not suppressed.
- [x] T053 [US4] Cached Node24 codegen/drift/manifest/typecheck/build, affected tests, sandboxed release/TLS package14/14 and independent HTTP200→503→200 smoke completed. CLI defaults performed no private/external operation. Exact attempts/cleanup/protected-root evidence recorded in plan/PROJECT_STATE; zero owned fixture DBs remain. Native artifact is separately PENDING, not inferred from copied output.
- [ ] T054 [US4] Genuine Vercel native artifact acceptance is PENDING independently of copied tsc/Render T025. Renewed isolated CLI65.4.0 investigation reproduces the unsupported dedicated NestJS/functions path; diagnostic removal loses required function controls and selects a non-bootstrapping factory. Relevant verified settings were manually copied, not a full genuine pull. See plan.md for exact failures, metadata limits and required compatibility decision; actual provider/domain acceptance remains separate.
- [x] T055 Coordinator verified REVIEW_MODEL_READY and completed one new independent gpt-6-luna read-only review, session01a186d0-f5ff-7a80-9210-aaf9cb2a8d40, exit0: no confirmed actionable findings in scoped Vercel adaptation. OMP read /private/tmp/esty-vercel-review-result.txt. No reviewer edits/tests/build/provider calls, source fix or affected/full-suite rerun. Genuine native T054/live settings/Supabase-cloud/domain-binding limits remain explicit; historical A+C review is not inherited.
- [x] T056 Docs-only closeout completed under fresh FE lease after T055:10 documents checked,47 local file links resolve, fences/whitespace/task IDs and protected historical/FE sections pass. Nine documents changed; data-model.md intentionally unchanged. One Vercel-only checklist at README.md:349. Coordinator-confirmed55-file pre-plan disk comparisons, FE snapshots, empty index and clean diff check are separately attributed. READY_FOR_OWNER_MANUAL_ACTIONS; STOP WRITES. No source fix/rerun/publication/private/cloud action; coordinator returns lease. T054/external/FE gates remain pending.

## T054 native-build repair followup

- [ ] T057 [US4] Investigate actual unused_function failure/root selection and implement the smallest native config/entrypoint correction in apps/api; correct active apps/api/.env.example provider instructions without changing dependencies or runtime security. PARTIAL: root/builder failure identified and env correction smoke passed; native source repair blocked on a supported controls-preserving builder path.
- [ ] T058 [US4] Build an isolated public source copy with empty auth, inspect native output and exercise synthetic loopback-only HTTP plus affected API checks; record exact provenance, failures and limits in plan.md, README.md and PROJECT_STATE.md. Diagnostic execution/evidence complete (config9/9 + HTTP4/4); passing repaired native artifact/HTTP acceptance remains blocked.
- [x] T059 Original independent gpt-6-luna review, REVIEW_MODEL_READY/exit0/session01a18a7c-b31c-7121-ae83-7b4e5ea90b9b, reported one confirmed P2: incomplete installed own-package verification. OMP fixed it and recorded6pass/9fail→31/31, pre-invocation rejection smoke and refreshed p2-fix01 provenance. Coordinator accepted THIS FIX ONLY by read-only inspection of verifier/caller/tests/safe primitives, without another independent review or test/build run. No unresolved confirmed findings remain in this scoped review; the original review is not relabeled no-findings.
- [x] T060 Docs-only closeout under the current unreturned FE lease:10 documents checked/9 updated; data-model unchanged. All55 local file targets exist;19 scoped fragments checked,16 resolve/3 pre-existing historical mismatches disclosed and preserved. Fences/new whitespace/merge markers/task IDs/single owner list/protected historical-FE blocks pass. All68 IDs retained,55 complete/13 pending; only T059/T060 states changed. README.md:399 owns seven owner actions. READY_FOR_OWNER_MANUAL_ACTIONS; STOP WRITES. No source/runtime/build/test/install/private/provider/Git action or new reviewer; coordinator returns lease/final pT receipt.

Dependencies: T057 → T058 → T059 → T060. T054 remains pending until native acceptance is evidenced with the metadata-fidelity limitation explicitly resolved; no local success completes external T020/T027–T030/T048.

## Expanded application-owned native artifact — READY_FOR_REVIEW

T057/T058's narrow repair was blocked as recorded; this expanded implementation resolves its source/local goals through T061–T068 without erasing the failed attempts or inheriting a review. T054 remains a partial/local-versus-provider acceptance gate. Old checked rows are historical; the active deployment design is prebuilt exact-artifact consumption, never the former Git-source trigger.

- [x] T061 [US4] Existing six feature001 artifacts aligned before code; ordered prerequisites then setup preserved templates/pointer, hooks absent. Read-only consistency covered20 FR/12 SC and68 unique tasks, all original60 checkbox states preserved, no blocking contradiction/constitution violation/unmapped expanded task. Official Build Output/CLI/API and exact public package integrity resolve source design; provider attestation/enforcement remains an explicit external gate. Fresh FE NO-INFLIGHT/pause lease recorded; no code/test/cloud action was part of planning.
- [x] T062 [US4] Refactor apps/api/src/main.ts and app.ts into canonical real NestFactory bootstrap plus reusable module/HTTP composition; migrate every caller/test helper, preserve guard/TLS/pool/deadline behavior and verify emitted-listener shutdown.
- [x] T063 [US4] Implement apps/api/scripts/build-artifact.ts and artifact.ts with unchanged pinned upstream native --standalone build in isolated public source, validated raw output and fail-closed final Build Output API assembly; bind source vercel.json controls duration10/cancellation and preserve raw evidence.
- [x] T064 [US4] Seal and validate exact source/tree versus development overlay, config/migration/tool/platform provenance and complete artifact/operator path/type/mode/size/content manifests in apps/api/scripts/artifact.ts; reject secrets/unsafe paths/symlinks/stale/tampered/missing/extra files and verify private consumption snapshots.
- [x] T065 [US4] Replace the Git-source path in apps/api/scripts/vercel-deploy.ts/release.ts/release-core.ts with exact verified prebuilt uploads/creation/file evidence; preserve migration-first serialization, identity/domain checks and conservative unknown/cancel locks, with no rebuild/fallback or real provider call.
- [x] T066 [US4] Run actual isolated upstream build/final artifact and emitted-handler HTTP checks, extending apps/api/tests/integration.test.ts/helpers only for meaningful guard/readiness/recovery/disconnect/shutdown/resource behavior on exact standalone55432 disposable fixtures; record provider enforcement limits separately.
- [x] T067 [US4] Add focused artifact/provenance tests under apps/api/tests and extend existing release tests for tampering/stale/private/path/platform failures, mutation during upload and same-artifact ordering/queued/failure/cancel/uncertainty/no-Git-rebuild with synthetic transport; run affected checks once after edits.
- [x] T068 Record exact distinct commands/results/failures, raw/final provenance, cleanup and external gates in feature001 plus freshly leased README.md/PROJECT_STATE.md; preserve historical/FE blocks, maintain one manual list, pause source and send READY_FOR_REVIEW to coordinator. No reviewer/publication/deployment by OMP.

Dependencies: T061 → T062 → T063/T064 → T065 → T066/T067 → T068 → existing T059 → existing T060. T063/T064 are one writer's coupled artifact contract, not independent source lanes. FR-018 maps T062/T063/T066; FR-019 maps T064/T067; FR-017/020 map T065/T067; FR-008 maps T061/T068; SC-010–012 map T066/T067 and the separately gated real provider/native evidence under T054.
