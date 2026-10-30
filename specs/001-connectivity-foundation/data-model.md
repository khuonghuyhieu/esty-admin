# Foundation persistence

No business entities, seller/order/supplier records, roles or seed data are introduced.

The initial migration creates schema `foundation`. The explicit migration history table `public.foundation_migrations` is maintained by node-pg-migrate with its standard id/name/run_on fields. The generated release manifest and operator assets derive from `apps/api/migrations/`; readiness checks the full ordered history against that imported manifest and requires the schema using fresh read-only SQL. An applied initial migration does not hide a later pending or failed migration. Migration history is tooling state, not an application entity.

State transitions: fresh database → pending readiness; successful transactional migration → current readiness; failed migration → transaction rolled back and readiness pending; rerun up → no duplicate applied migration. DB availability is independently checked on every request. Do not infer schema readiness from a live socket alone. No automatic startup migration or destructive reset is exposed.

## Prototype packaging

No new persisted entities or database roles are introduced. Keep the same single `public.foundation_migrations` history. The generated ordered migration-name/SHA-256 manifest derives from the existing `.mjs` files and is build metadata, not another history. The web artifact imports it statically; the separately staged operator includes and verifies the actual files before DDL. Local copied-artifact and drift checks passed; the existing Supabase project has not been queried or migrated by this increment.

## Step 1 configuration artifacts

Public target metadata retains the exact approved Session tuple. The owner reports prepared runtime.json/operator.json under ignored .openai/private/backend; the agent never reads them. A pure conversion validates plain allowlisted string objects, matching URLs/tuple and source provider markers without mutating inputs. Explicit owner TTY invocation writes separate runtime.vercel.json/operator.vercel.json using0700/0600, exclusive/no-symlink writes and partial cleanup. Runtime contains API_RUNTIME=vercel, DATABASE_URL, separate preview key, HTTPS origin and optional verified CA; no operator/deploy credentials or platform-owned markers. Operator contains only the tuple/MIGRATION_DATABASE_URL/optional CA; migration target/confirmation is deliberately not armed. Default OWNER_INPUT_PENDING reads/writes no private file.

## Supabase local boundary

Supabase may initialize local platform schemas and service metadata. They are owned by the local platform, not application migrations/tests. The application retains only its foundation schema/history and generated manifest. Do not add foundation SQL to Supabase CLI migrations or modify Auth/Storage/system schemas. No cloud data copy, business seed or new application entity is required.

## Migration visibility model

The committed DB history remains public.foundation_migrations with applied names/times. A sanitized per-attempt report records run/source/target labels, manifest digest, timestamps/duration, stage/attributable failed version, attempted versions with outcomes and committed before/after history. Outcomes distinguish not_started, committed, rolled_back and unknown; reporting failure is independent of DB outcome. Failed attempts never become applied history. Release reports separately preserve committed-DB/deploy-failure and retained-lock state. These artifacts are not another database ledger or historic DB checksum store.

## Vercel release identity

Separate future owner-only deploy.vercel.json holds VERCEL_TOKEN, fixed VERCEL_PROJECT_ID, fixed VERCEL_SCOPE, owner-supplied VERCEL_TEAM_ID, exact REPOSITORY, DEPLOYMENT_TARGET=production, preview key and exact API/browser origins. Team/account id is validated against provider project.accountId and deployment.ownerId; a matching slug alone is insufficient. No deploy context reaches the API runtime. The production target is a provider alias-routing choice for the protected test API, not product-production approval.

Normalized deployment state records provider, id, revision, artifact digest, project, owner, target and status (queued/building/ready/failed/canceled). The expanded prebuilt adapter derives revision/artifact binding from the independently approved immutable artifact and this invocation's verified upload receipt, then requires provider-returned deployment identity plus corresponding file-tree evidence. The former gitSource-only trigger is retired; requested metadata is never proof. READY alone is insufficient: exact artifact evidence, verified project domain and alias deploymentId/projectId must match before and after safe HTTP smoke. Unknown binding/attestation/state or cancellation retains conservative reconciliation semantics without automatic rollback/unlock/retry.

## Immutable artifact model

- Source: schema version, mode (development overlay versus releasable committed source), base revision/tree, repository identity, sorted public source file path/mode/size/SHA-256 records and content digest. A development overlay's digest describes actual captured bytes, not the base commit's tree. Releasable use additionally requires exact clean approved published source.
- Build evidence: Node/OS/architecture, CLI and NestJS/Node/build-utils versions plus measured/pinned integrity, verified relevant public project/team/root/framework/target metadata, original application config digest, effective builder-input config digest and raw output runtime-file manifest. No build/runtime secrets or full private settings.
- Final manifest: every output/operator file's safe relative path, regular-file type, normalized permissions, size, SHA-256 and upload SHA-1; sorted directory/type/mode inventory; exact source/config/migration/tool/target bindings. No symlink/special/private/environment files. The canonical provenance.json hash is the separately approved artifact identity; it cannot authorize itself.
- Output: exactly one Node24 index.func with expected listening main.js handler, empty environment, explicit duration10/cancellation, canonical request-path-preserving catch-all route and self-contained runtime dependencies/generated migration metadata. Original operator/migration assets are sealed separately and never included in upload.
- Consumption: private verified snapshot, exact approved output bytes/upload references, provider deployment ID and artifact digest. Changes to original or snapshot between validation and creation fail; no silent rebuild or retry. Provider file-tree evidence is checked against uploaded paths/modes/content-addressed identifiers, not arbitrary meta.

Transitions: captured source → raw upstream output → validated application-owned final output → sealed/approved artifact → verified consumption snapshot → serialized status/migration/report → prebuilt upload/create → pending/ready identity and file evidence → same-domain smoke → complete. Any mismatch stops; uncertain provider/DB outcomes retain the lock. Raw output, development overlay and local cancellation evidence never transition directly to hosted acceptance.
