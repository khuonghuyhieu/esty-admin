# Foundation persistence

No business entities, seller/order/supplier records, roles or seed data are introduced.

The initial migration creates schema `foundation`. The explicit migration history table `public.foundation_migrations` is maintained by node-pg-migrate with its standard id/name/run_on fields. The generated release manifest and operator assets derive from `apps/api/migrations/`; readiness checks the full ordered history against that imported manifest and requires the schema using fresh read-only SQL. An applied initial migration does not hide a later pending or failed migration. Migration history is tooling state, not an application entity.

State transitions: fresh database → pending readiness; successful transactional migration → current readiness; failed migration → transaction rolled back and readiness pending; rerun up → no duplicate applied migration. DB availability is independently checked on every request. Do not infer schema readiness from a live socket alone. No automatic startup migration or destructive reset is exposed.

## Prototype packaging

No new persisted entities or database roles are introduced. Keep the same single `public.foundation_migrations` history. The generated ordered migration-name/SHA-256 manifest derives from the existing `.mjs` files and is build metadata, not another history. The web artifact imports it statically; the separately staged operator includes and verifies the actual files before DDL. Local copied-artifact and drift checks passed; the existing Supabase project has not been queried or migrated by this increment.
