# Backend foundation decisions

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
