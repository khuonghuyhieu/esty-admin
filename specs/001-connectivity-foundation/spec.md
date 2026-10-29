# Feature specification: Connectivity foundation

Feature:001-connectivity-foundation · Created:2026-10-25 · Updated:2026-10-29 · Status: Vercel adaptation source/local checks, new independent T055 review and T056 docs-only closeout complete; READY_FOR_OWNER_MANUAL_ACTIONS, STOP WRITES. Dated A+C acceptance remains historical; genuine native T054 and actual hosted/domain/full-connectivity acceptance remain pending.

Source: owner decisions and [ARCH-001](../architecture.md). Tracking: existing [Notion C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb). Keep this feature, repository and actual branch; no duplicate tracker/spec or checkout.


## Latest owner hosting preference — Vercel, 2026-10-29

The owner selected existing separate Vercel FE and esty-admin-api BE projects and authorized plan alignment followed by scoped source/local adaptation. No Render onboarding. Reuse documented BE project prj_uITHKLUGGE98VxrEcs5FoktBbcls in scope khuonghuyhieu0705s-projects, root apps/api/Node24; no provider account reads. Preserve NestJS, local/cloud Supabase, one migration history/report contract and final api.lovora.us. Retire active Render inputs rather than translating or accepting them silently. Historical Render tests/review do not satisfy Vercel native/runtime/release acceptance.

A personal account does not by itself establish non-commercial use. Official Vercel fair-use guidance defines commercial use by intended financial gain; using an internal tool for one's own shop may still fall within that definition. No provider classification/enforcement method or project-specific eligibility is known, and no paid upgrade/payment method/trial is authorized. Document this unresolved eligibility limit without forcing a new provider or presenting it as verified compliance.

Existing owner-prepared runtime/operator files must not be inspected or overwritten by the agent. Only explicit later owner TTY conversion may read them and write separate Vercel outputs, preserving original credentials and files. Default performs no private read/write. Source/local work uses synthetic fixtures only; actual private inputs, provider settings, remote SQL, release/DNS and Git publication remain separate approvals.


## Required final endpoint

The owner explicitly requires BE setup and actual testing at `https://api.lovora.us`. Local Supabase/FE/API supports development, not final completion. Existing Vercel BE + Supabase cloud, versioned migration-before-deploy, exact Vercel-provided api-only GoDaddy DNS and HTTPS/real functional checks are mandatory. No provider-only READY or URL substitutes for verified same-deployment custom-domain association.

## Current scope

Preserve verified Supabase-local/NestJS and the strict standalone integration fixture. Adapt Vercel runtime/access, offline conversion and provider-normalized release source without FE changes or new dependencies. The separately coordinated FE-local story remains independent. Actual provider setup/native proof/private inputs/SQL/release/domain testing follows only explicit external authorization. Destructive/failure suites remain isolated locally.

Current source/local permission does not authorize actual owner-secret entry, provider/account changes, SQL/migration, deployment/DNS or Git publication. Supabase local needs no cloud password. The narrow private API bearer guard is required for Vercel, including custom domains; it is not business accounts/roles/OAuth or hosted FE authentication.

## User scenarios and testing

### Story 1 — Start locally (P1)

As a developer, I can configure and start the approved local FE/API/database using documented commands.

1. Following README prerequisites/start commands brings up the approved services without undocumented steps.
2. Missing/malformed settings fail before listen with field-level remediation and no secret values.

### Story 2 — Observe connectivity (P1)

As a developer, I can use a local screen to observe actual UI→API→database state and retry after failure.

1. An explicit check shows checking then success only from actual process/database responses.
2. API-unreachable and database-degraded states are distinct, bounded and recoverable by keyboard-accessible retry.
3. Live process health and fresh database/migration readiness remain separate; a retry never displays stale success as current.
4. Failure/recovery tests affect only test-owned processes/configuration, not shared Supabase data/system services.

Independent acceptance requires the coordinated FE client/screen/browser tasks; BE-only results cannot satisfy this story.

### Story 3 — Repeat contracts and versioned migrations (P1)

As a developer/operator, I can regenerate transport types, inspect migration status and identify exactly which version/stage failed.

1. FE/BE generated types derive from the single contract; no duplicate manually maintained response model.
2. A read-only status lists applied/pending/unexpected versions without initializing history. Application migration applies only pending approved versions and an unchanged rerun applies0.
3. Each schema change creates a new unique immutable version. Assets/order drift blocks the operation.
4. Failure reports distinguish attempted/rolled-back from committed versions, identify the version when attributable and return nonzero without raw SQL/secrets.
5. A future approved release automatically runs the serialized versioned operator before same-commit deployment; failed migration blocks deployment. API startup/build/install never migrates.

### Story 4 — Test the hosted API on api.lovora.us (P1, required delivery)

As an authorized operator, I can test the real API at https://api.lovora.us using the existing Vercel BE project and Supabase cloud without exposing credentials or claiming unresolved plan eligibility.

1. After approved setup/release, authorized live/ready requests succeed against the real target; missing/wrong preview keys are denied before DB work.
2. The approved compiled artifact boots with expected migration metadata without repository-layout assumptions. Exact target/TLS/config failure never reports readiness success.
3. Functional, concurrency, cancellation and failure/recovery checks run locally; real non-destructive DNS/TLS/access/live/readiness/unknown-route/origin checks run through api.lovora.us. Cold start/network time is distinguished from the3000ms handler deadline. No untested hosted stress behavior is claimed.
4. Runtime/operator credentials and deploy-trigger secrets are separated. Deployment failure after committed migration is reported without automatic DB rollback/reset.

5. Success on a generated provider URL or local API alone does not satisfy the required domain. Scoped api DNS/TLS setup preserves app.lovora.us and unrelated records.

This is health/readiness only. Require real Vercel native/settings/source/project/target/domain proof separately; old Render compiled-artifact and Luna A+C results remain historical. The API itself protects all non-preflight routes, including unknown paths; Standard Protection excluding production domains is not that evidence.

### Story 5 — Owner-private cloud configuration (P2, optional later helper)

As the owner, I can privately convert my existing prepared runtime/operator files to separate Vercel outputs after synthetic offline tooling is verified.

1. Exact supplied Session metadata is used; no guessed host, password reset or service-role/management key.
2. Preparation can stop at OWNER_INPUT_PENDING with no real secret.
3. Optional conversion requires hidden owner-operated TTY confirmation before reading private originals, preserves URL encoding/decoded credentials, supports cancellation and never requests a password in argv/chat/logs.
4. Separate ignored owner-only runtime/operator files are not auto-loaded and do not arm migrations/upload secrets. Invalid/existing/symlink outputs fail without silent overwrite or partial disclosure.
5. Preserve each decoded DB password and exact approved Session tuple. Reject unknown keys, conflicting provider/mode/markers, mixed runtime/operator/deploy credentials and unsafe files. Strip source platform markers and execution confirmations from the separate converted outputs; do not overwrite originals. Default reads no private input and creates no private output.

Not a prerequisite for local development. Synthetic tests validate the helper without actual cloud inputs.

### Story 6 — Supabase local run/test environment (P1)

As a developer, I can use an isolated Supabase stack with the local backend while leaving cloud unchanged.

1. Unique local identity/loopback ports preserve FE services and existing fixture volumes; use the smallest CLI-supported stack needed for run/test, Studio optional.
2. App migrations remain node-pg-migrate; Supabase system bootstrap does not become a second application migration history. No app-DDL on stack/API startup.
3. Strict destructive integration tests stay on the original exact standalone fixture. Bounded Supabase-local smoke never resets the shared main database or changes system schemas.
4. Start/migrate/status/test/stop/restart commands are verified with data preserved, without cloud credentials/remote link or an application Auth/Storage feature.

## Edge cases

- Wrong target, occupied port, missing CLI/Docker resources, unsafe env or malformed response must identify the layer without exposing credentials.
- Pending/unexpected migration history prevents ready; no fake/adopt/reset repair, no hiding a later pending migration behind an initial applied row.
- Failed/cancelled requests release owned resources; retry checks fresh state, never unbounded background work.
- Report-write failure after commit must not be mislabeled as database rollback. Unknown commit/rollback outcome stops release for inspection.
- A deployed old process may reject a newer full migration history. Rollback/compatibility is reviewed before release, not assumed from provider rollback buttons.

## Requirements

- FR-001: Retain one frontend and portable modular-monolith backend with ARCH-001 boundaries.
- FR-002: Validate configuration at startup; provide secret-free examples, including a separate local Supabase profile without overwriting owner files.
- FR-003: Use the approved database target and one application migration mechanism; no invented business tables, cloud data copy or duplicate migration history.
- FR-004: Expose truthful process health and fresh database/full-migration readiness with bounded resources/failure behavior.
- FR-005: Generate FE/BE transport types from one API contract and check drift.
- FR-006: Provide a local-only readable connectivity screen with checking/error/fresh retry and accessible controls.
- FR-007: Document verified local startup/status/migration/check/build/codegen/stop commands using existing root/API-workspace conventions.
- FR-008: Record actual checks/limitations in PROJECT_STATE and commands in README; proposed docs are not implementation evidence.
- FR-009: Limit cloud preview to health/readiness and controlled operator access; no business auth, user accounts, roles, shop/order/supplier endpoints or new frontend modules.
- FR-010: Bind hosted configuration to the approved project/host/user/database/port, verify TLS and separate private runtime/operator inputs; preserve restrictive local defaults.
- FR-011: Reuse bounded database resources and cancel/release failures; execute app migrations only through a separately authorized serialized operator/release step.
- FR-012: Verify the selected-provider compiled artifact locally and actual HTTPS/access/database readiness after deployment before claiming cloud completion. Do not equate local tests with hosted platform evidence.
- FR-013: Provide a pure validated offline conversion and explicit owner-operated TTY entrypoint into separate ignored0700/0600 Vercel outputs; preserve originals/decoded credentials and reject unknown keys/mode/target confusion. Default OWNER_INPUT_PENDING has no private read/write or network/SQL/deploy operation.
- FR-014: Retain unique immutable migration versions/committed history, read-only status and sanitized per-attempt version/stage/result reports; future releases block deploy on migration failure.
- FR-015: In Vercel API mode require a private64hex bearer key before DB work on all non-preflight routes; missing/malformed/wrong/duplicate access returns generic401, safe exact-origin GET/Authorization OPTIONS returns204 without DB and authorized unknown routes return404. Preserve local behavior; no secret URL/log/browser bundle or bypass proxy.
- FR-016: Configure the hosted BE at https://api.lovora.us using the exact provider-required GoDaddy api record, verify DNS/TLS and actual safe authorized functional tests against Supabase cloud, and preserve app.lovora.us/unrelated DNS.
- FR-017: Normalize provider deployment identity/state, verify provider-returned gitSource SHA/repository rather than user metadata, exact BE project/owner/target, and api.lovora.us alias→same-deployment binding around HTTP smoke. Queued/building/unknown/mismatched/failed/cancelled/timeout outcomes never claim release success. Preserve serialized migration-first reports/locks; disable automatic Git deployment bypass and reject retired Render inputs.

## Dependencies and constraints

Node24.22.1/NestJS12.2.0/current dependencies, installed Supabase CLI2.122.0 and both Docker volumes are unchanged. Destructive fixtures remain exact55432 only. No install/ci/prune, root dependency/ignore/pointer or FE changes. Hobby eligibility for own-shop use is unresolved, not evidence of permitted commercial use; no provider switch or paid upgrade/trial is forced. Actual Vercel project/settings/native artifact/private scope and cloud proof remain external gates. All artifacts English; conversation Vietnamese.

## Success criteria

- SC-001: Verified local commands start/restart/stop the intended environment without undocumented steps, lost volumes or impact to unrelated services.
- SC-002: The local browser reports actual API/DB success, safe failure and fresh recovery through the generated client.
- SC-003: Contract generation, immutable migrations/status/rerun and relevant checks have repeatable recorded results; unchanged rerun applies0.
- SC-004: Home/privacy/legacy redirect/404 and sample Application remain functional and independently accepted; connectivity does not replace their content.
- SC-005: After separately approved cloud execution, actual HTTPS authorized live200/ready200 and missing/wrong-key denial are recorded. Local failure checks preserve the3000ms handler deadline; no hosted failure/load/cancellation proof is inferred.
- SC-006: New local code and the selected-provider compiled artifact pass scoped checks with redacted output, one application history per environment and no unrequested FE/runtime/dependency change.
- SC-007: Synthetic conversion/TTY/filesystem tests prove exact target and decoded-password preservation, mode/key isolation, hidden confirmation/cancel, no private read/write by default and no overwrite/symlink/partial disclosure.
- SC-008: Local disposable-fixture checks prove reliable failed-version/stage attribution where available, rolled-back versus committed state and nonzero failure exits; release-driver tests prove a migration failure prevents deployment.
- SC-009: api.lovora.us resolves to the actual selected BE service with a valid HTTPS certificate; authorized live/ready and unauthorized/unknown-route/origin behavior are recorded through that hostname, with app.lovora.us unaffected. No local/provider-only success substitutes.
- SC-010: Synthetic Vercel API transport and local release fixtures reject wrong project/owner/target/source/deploy/alias identity, metadata-only source claims, redirects, uncertain states and migration failure; valid same-commit READY plus same-domain binding and HTTP smoke alone permits success. Tests never contact real provider hosts.

## Delivery and approval boundaries

T049 planning/consistency preceded completed T050–T053 source/local adaptation. The coordinator verified REVIEW_MODEL_READY and completed one new gpt-6-luna read-only T055 review, session01a186d0-f5ff-7a80-9210-aaf9cb2a8d40, exit0: no confirmed actionable findings. T056 is documentation-only; no source fix or affected/full-suite rerun is needed. T054 genuine native proof remains PENDING, without inheriting Render T025. All prior IDs/checkmarks and dated Luna reviews remain historical. External T020/T027–T031/T048 and separately coordinated FE T014–T016 remain open; source publication needs a separate request.

## Out of scope

Business entities/OAuth/Etsy/supplier operations, account/role frameworks, production release, Cloud Run/AWS/Azure/billing/root-domain or unrelated DNS, new trackers/specs/checkouts, unrequested dependency operations and automatic app-DDL at startup. Full cloud test suites and automatic Git-push-triggered CI are not required for this slice; future release driver is owner-invoked locally with automatic internal migration/deploy ordering. Commit/push/setup/deploy each follows the applicable owner request.
