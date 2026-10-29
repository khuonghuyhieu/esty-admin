# Backend foundation decisions

Current scope (2026-10-29): Vercel source/local adaptation and one new independent gpt-6-luna review completed with no confirmed actionable findings; documentation-only closeout, no new fixes or test/build reruns. Exact review evidence is in plan.md. Dated A+C/Render/Luna evidence remains historical. Publication, genuine native T054, live settings/private input, hosted/domain/FE acceptance and Hobby eligibility remain gated.

Research date: 2026-10-26. Official documentation and npm package metadata checked before selecting versions. Installation/runtime validation is separate evidence.

| Tool | Selected pin/direction | Evidence and rationale |
| --- | --- | --- |
| Node | 24.22.1, existing repo pin | Preserve FE runtime; shell Node26 is not the verification runtime |
| NestJS core/common/platform-express | 12.2.0 aligned | Official npm registry and current Nest migration guide; ESM packages, Node24 supported |
| TypeScript | 5.9.3 | openapi-typescript TS peer is ^5.x; manual tsc setup avoids Nest CLI/schematics TS6 requirement and FE toolchain churn |
| pg | 8.23.1 | Official registry; explicit connection/query/statement timeouts and bounded pool |
| node-pg-migrate | 9.0.0 | Official registry Node>=20.11, pg<9; PostgreSQL-specific migration history, transaction and locking |
| openapi-typescript | 7.13.0 | Official registry TS5 peer; OpenAPI3.1, local JSON input and generated runtime-free types |
| PostgreSQL | 17.11 official Docker image | Official supported tag; isolated portable local fixture, compatible PostgreSQL protocol without cloud credentials |

Pin supporting package versions during the authorized install, recording actual engine/peer compatibility and lockfile resolution. No latest/caret dependencies. Avoid tsx for application/tests: compile decorators with tsc and run emitted JS via Node test runner. Use existing available TypeScript only if exact pin/compatibility is verified; do not silently alter FE dependencies.

Source pins additionally resolve `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `@types/node@24.10.1` and `@types/pg@8.23.1`. Official registry metadata confirms the selected type-package versions. The version-tagged [v9 programmatic API](https://github.com/salsita/node-pg-migrate/blob/v9.0.0/docs/src/api.md) confirms `runner`, connected `dbClient` ownership, `migrationsSchema`, `singleTransaction`, `checkOrder`, `noLock` and safe logger injection. The authorized install, installed-type compilation and actual PostgreSQL migration/rollback checks subsequently passed; see plan.md for evidence rather than treating this research as runtime proof.

## Alternatives and decisions

- Plain pg plus node-pg-migrate is smaller than introducing an ORM for a schema-only connectivity check. Use explicit history table, single transaction, advisory lock and configured database client/timeouts. Verify version-9 option signatures against installed types before source acceptance; current website may document later main-branch options.
- Local official PostgreSQL is sufficient for this foundation. Full Supabase local stack/CLI would add unrelated Auth/Storage infrastructure. Hosted Supabase, Cloud Run and TLS/credential configuration remain later work; local success is not hosted success.
- Contract-first OpenAPI JSON avoids duplicated Nest Swagger DTO schemas. openapi-typescript emits types; later FE uses openapi-fetch. This increment proves generation in BE-owned output only, preserving FE lease.
- Database readiness requires both a fresh read-only query and expected migration history/schema. Socket liveness alone is insufficient. Explicit bounded connection/query/overall timers plus destruction of abandoned clients prevents indefinite checks and background resource growth.

## Primary sources

- [NestJS migration guide](https://docs.nestjs.com/migration-guide): Nest12 ESM/runtime requirements and optional CLI TS6 migration.
- [Nest core official package metadata](https://registry.npmjs.org/@nestjs/core/12.2.0), [common](https://registry.npmjs.org/@nestjs/common/12.2.0), [platform-express](https://registry.npmjs.org/@nestjs/platform-express/12.2.0).
- [pg package metadata](https://registry.npmjs.org/pg/8.23.1), [Client timeout API](https://node-postgres.com/apis/client), [Pool acquisition/lifecycle API](https://node-postgres.com/apis/pool).
- [node-pg-migrate metadata](https://registry.npmjs.org/node-pg-migrate/9.0.0), [official source at v9.0.0](https://github.com/salsita/node-pg-migrate/tree/v9.0.0), [migration documentation](https://salsita.github.io/node-pg-migrate/).
- [openapi-typescript metadata](https://registry.npmjs.org/openapi-typescript/7.13.0), [official introduction](https://openapi-ts.dev/introduction), [typed fetch API](https://openapi-ts.dev/openapi-fetch/api).
- [Official PostgreSQL Docker image](https://hub.docker.com/_/postgres), [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

No implementation/test result is inferred from documentation or dependency compatibility alone.

## Prototype decision evidence — 2026-10-27

- [Vercel native NestJS](https://vercel.com/docs/frameworks/backend/nestjs) recognizes `src/main.ts`, uses a single Function with Fluid compute and requires CLI 48.4.0 or later. The [official deployment guide](https://vercel.com/kb/guide/ship-a-nestjs-app-on-vercel) retains normal Nest bootstrap/listen without a custom serverless adapter. Coordinator reports isolated CLI 65.4.0 installed; browser login is still awaiting owner authorization, not verified account/project access.
- [Node runtime](https://vercel.com/docs/functions/runtimes/node-js) supports ESM; the [project configuration reference](https://vercel.com/docs/project-configuration/vercel-json) defines function duration, file inclusion and cancellation options. These documents do not prove this exact Nest12/NodeNext/decorator build. Native artifact execution is an acceptance gate; ordinary tsc output is insufficient.
- [Vercel pooling guidance](https://vercel.com/kb/guide/connection-pooling-with-functions) recommends warm-instance reuse and `attachDatabasePool` for idle cleanup before suspension, rather than per-request pools or pool closure. [Official package metadata](https://registry.npmjs.org/@vercel/functions/3.10.4) supplies the proposed 3.10.4 pin (Node >=20). No dependency was installed during planning.
- [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres) distinguishes IPv6 direct connections, IPv4 Session pooler on 5432 and transaction pooler on 6543. Its generic serverless recommendation is transaction mode; this limited health-only prototype deliberately selects Session mode to preserve current pg settings and migration session locks with fewer changes. Tradeoff: active sessions occupy backend connections. Hosted max 2, idle cleanup, protected low traffic and actual project-budget validation bound the intended use; broader scaling needs a separate decision. Exact pooler hosts must come from Connect, not a guessed region/index.
- [pg TLS guidance](https://node-postgres.com/features/ssl) warns that URL SSL options can replace explicit TLS configuration. Keep URL options rejected and enforce certificate-chain/hostname verification. Password-redacted Connect metadata and securely provided credentials are execution prerequisites; no secret in chat or repository. No new operational DB roles or enterprise infrastructure is required.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby) is personal/non-commercial; [fair-use guidance](https://vercel.com/docs/limits/fair-use-guidelines) defines commercial use. “Internal prototype” does not establish eligibility. Verify the personal account, separate BE project, plan and platform tester access before deployment; do not infer paid-plan approval or create application auth.

Targeted source review found three necessary portability changes: `src/main.ts`/config assume loopback local execution; `.env` and migration-directory lookup rely on compiled layout; pool shutdown currently relies on process/module lifecycle. The plan isolates these changes while retaining the contract, full migration-history check, 3000ms deadline and one node-pg-migrate runner. No remote SQL, native build or hosted success is inferred from these observations.

## Code-first implementation evidence

The later owner decision deferred all actual target/account/secret setup while authorizing source and synthetic local checks. Instead of compiling a guessed hostname or real project ID, config requires the complete owner-approved Session tuple, restricts host syntax to the AWS Supabase shared-pooler domain, matches the URL exactly and binds the username suffix to the project ref. This is a trusted configuration boundary, not application authentication.

@vercel/functions3.10.4 was subsequently installed under the single explicit serial window; local Node24 tests and staged-artifact smoke passed. Real pg TLS trust/hostname verification was exercised using generated disposable certificates and loopback forwarding only. No real Supabase endpoint or cached cloud credential was used. The network-denied CLI65.4.0 build returned project_settings_required, leaving native/platform proof pending. See plan.md for exact commands/results and README for future owner setup; earlier planning statements are historical observations, not current execution status.

## Step 1 planning decisions — owner-controlled credential entry

- Exact Session tuple comes from the owner's copied Connect output, not regional hostname inference. No external lookup is needed to prepare those values.
- Keep new tooling offline and dependency-free. Reuse Node's test runner; no Supabase skill/npm bootstrap or pg connection is necessary for encoding/configuration preparation.
- Owner enters the raw password only in their own hidden-input terminal after preparation. Reject argv/env/pipe password transport rather than printing shell assignments. Agent-authored fixtures stay synthetic.
- Separate ignored private JSON outputs avoid shell/dotenv quoting errors and accidental local API env replacement. They are handoff files, not automatic execution configuration. Execution confirmations are intentionally absent.
- Rejected alternatives: replacing the default local .env, storing credentials in tracked examples, creating platform secrets now, invoking migrations as a configuration check or marking T020 complete from endpoint metadata.

## Free-host evaluation — 2026-10-28

Render Free is a candidate for the owner's limited prototype, not a selected production platform. Official free docs establish sleep/wake behavior,750 shared hours, quota-triggered supplementary billing when a payment method exists and suspension/build-disable behavior when none exists. The zero-cost proposal therefore excludes payment methods/upgrades and accepts quota suspension. Keep Supabase rather than expiring Render Free Postgres. Node24 can be explicitly pinned; current Vercel-only hosted binding/markers require a reviewed Render adapter. Free public web-service/private-network semantics do not supply the existing Vercel Authentication boundary; an owner-approved preview-access design is required. Details and primary-source links are in plan.md's Render evaluation. No provider action or runtime proof occurred.

## Supabase local decision

The owner now prefers Supabase local over the standalone PostgreSQL-only development environment. Official local docs require the CLI plus a Docker-compatible runtime and document local Studio/free isolated development; config controls the project identity/ports/services. Keep the installed2.122.0 CLI and verify its supported schema rather than reinstalling. This supersedes the earlier decision that a full local stack was unnecessary for development. Preserve node-pg-migrate as the sole application migration engine and the old strict integration fixture. Local platform schemas/services do not authorize application Auth/Storage features or establish hosted parity.

## Current source/local decisions — 2026-10-28

Installed CLI2.122.0 supports the DB-only exclusion/config path, disabled seed/replay and a caller-provided Docker network; actual healthy PostgreSQL17.11.0.006 publishing was verified at127.0.0.1:54322. Studio/gateway are intentionally disabled. Version-matched node-pg-migrate9 exposes custom migration-loader strategies; wrapping the approved action before execution gives reliable action-error attribution that logger-only instrumentation cannot supply. Transaction acknowledgements separately determine committed/rolled-back/unknown state.

Render release source uses [create deploy](https://api-docs.render.com/reference/create-deploy) with commitId and [retrieve deploy](https://api-docs.render.com/reference/retrieve-deploy), plus read-only [service settings](https://api-docs.render.com/reference/retrieve-service).201/202 is not success; only matching source plus live status and actual API smoke can complete release. The local source tests use synthetic responses/disposable databases, not a real provider token or service. No new dependency was needed. Initial fixture/TTY issues and verified corrections are disclosed in the execution evidence, including the first Render fixture's incomplete loopback remapping.

## Vercel adaptation decisions — 2026-10-29

Retain existing Vercel BE/NestJS/Node24, no Render onboarding/dependency change. [Native NestJS](https://vercel.com/docs/frameworks/backend/nestjs) recognizes src/main and one Fluid Function; docs do not prove this native ESM/decorator artifact. Retain attachDatabasePool/Session TLS/max2/deadlines; genuine settings/native proof stays T054 pending without provider access.

Require API bearer on all Vercel non-preflight routes. [Standard Protection](https://vercel.com/docs/deployment-protection) excludes production domains; all_except_custom_domains is not api.lovora.us protection. No paid upgrade or hosted FE auth scope. Intended-use/Hobby eligibility remains unresolved.

Pure conversion validates source objects, preserves original files/decoded passwords, rejects unknown/provider-key confusion and strips markers/execution confirmations. Only later explicit owner TTY invocation reads real inputs and creates separate Vercel outputs; default no private read/write.

[POST v13 deployments](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) takes existing project, explicit production target and gitSource repo/ref/sha;200 only acknowledges. [GET v13 withGitRepoInfo=true](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url) and [full OpenAPI](https://vercel.com/openapi.json) expose gitSource.sha/repository/projectId/ownerId/target. User meta is not source evidence. QUEUED/INITIALIZING/BUILDING are pending; READY is only a platform state; ERROR/BLOCKED/CANCELED are non-success.

[Project GET](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name) checks fixed BE id/account/root/framework/Node/repository/main; [domain GET](https://vercel.com/docs/rest-api/projects/get-a-project-domain) checks name/project/verified/no redirect; [alias GET](https://vercel.com/docs/rest-api/aliases/get-an-alias) checks exact deployment/project before and after real-domain smoke. Missing/reduced identity/stale alias/unknown states fail closed; source tests use synthetic transport, never real-fetch fallback.

[git.deploymentEnabled=false](https://vercel.com/docs/project-configuration/git-configuration) disables all Git-triggered deployments in reviewed BE config. Project gitProviderOptions.createDeployments controls GitHub events, not that protection. Source verifier checks exact clean approved config. No Render fields, fabricated native settings, generic DNS target or READY-only success.
