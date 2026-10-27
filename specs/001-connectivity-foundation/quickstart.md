# Foundation validation guide

README owns canonical commands and the owner setup guide. Historical foundation checks/review are recorded in PROJECT_STATE; the new code-first checks are recorded separately in [plan.md](plan.md). Do not treat the earlier review as approval of the new code. The returned documentation window was used only for BE evidence/setup; FE/application003 text was preserved and the window returned.

1. Use Node 24.22.1 and the agreed additive workspace install. Configure apps/api from its secret-free example; no live credentials required.
2. Start the isolated loopback PostgreSQL fixture. Start API with valid configuration. Liveness returns 200 while readiness reports pending migrations.
3. Apply migrations twice. Both runs succeed; one initial history record and no business tables exist. Readiness now returns 200 from a real query.
4. Stop only this isolated DB. Liveness stays 200; readiness returns 503 within the documented deadline. Restart DB and retry; readiness recovers without restarting API.
5. Run BE config/HTTP tests, database integration/HTTP E2E, build/typecheck and codegen drift checks when behavior changes. Include silent TCP, pool pressure, migration rollback and later pending/failed migration cases. Record actual outputs and blockers in PROJECT_STATE under the applicable docs lease.
6. Obtain one read-only gpt-6-luna review of changed source/test gaps. Fix confirmed findings through BE OMP and rerun affected checks.

No apps/web edits occur in this increment. A later coordinated FE-generated client/connectivity screen and browser success/failure/retry journey remain required for complete feature acceptance. No cloud, operational integration or publication follows from these local checks.

## Code-first prototype and deferred external setup

Local source/checks for T021–T024 and the local portion of T025 are complete. Follow the [README local commands](../../README.md#local-backend-foundation) and [prototype owner guide](../../README.md#backend-prototype--local-code-verified-external-setup-pending) for exact commands, artifact layout and required/optional settings. No actual secret, endpoint or project linkage was needed for synthetic verification.

Acceptance exercised:

1. Configuration rejects missing hosted metadata, mismatched project/role/host/database/port, URL TLS overrides and unsafe binding/origin. Local package env loading works outside cwd; hosted loading ignores local env files.
2. Actual pg TLS over loopback accepts a trusted matching certificate, rejects untrusted/wrong-host certificates and preserves safe HTTP degradation. Hosted max2 reuse, saturation, server timeout, disconnect, idle cleanup and recovery are observed; local max4 checks remain passing.
3. Generated migration metadata and staged operator assets agree; ambiguous/missing/changed assets fail. Real migrations apply once then zero times, retain rollback/later-state behavior, and staged CLI/API work outside repository cwd.
4. Separate compiled-process smoke observed pending→ready→DB-unavailable→ready while liveness remained successful; random fixtures/processes were cleaned without touching the shared volume.
5. Offline native Vercel build stopped at `project_settings_required` with networking denied and empty auth/config. Native ESM/decorator/function/cancellation proof remains pending genuine approved setup; local tsc/staged execution does not replace it.

The coordinator's separate read-only gpt-6-luna review (T026) is complete with no confirmed actionable findings; see plan.md for its session evidence. No fix or rerun was needed. T020 and all T027–T030 remain deferred: approved Connect Session tuple/private credential, database preflight/migration, eligible personal BE project/platform protection, native artifact and protected HTTPS acceptance. Never use transaction-pool6543, a second migration engine or destructive local tests against Supabase.

The README guide distinguishes pg runtime inputs from optional CA and future CLI IDs/tokens. Use owner-approved existing credentials without inventing new operational roles. The per-instance pool/3000ms handler deadline is not a cold-start/network SLA; actual project capacity and hosted behavior still need proof. T014–T016/full UI → API → DB acceptance remains separate.
