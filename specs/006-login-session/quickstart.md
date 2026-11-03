# Validation Handoff: Login and Current Session

**PLAN ONLY — no commands below were run, no fixture/server is active from this planning work.** Implementation and every runtime/resource action need fresh authority. The owner's preview3000, default `.next`, shared ports/services/volumes and accepted005 records remain untouched.

## Before execution

Use [the plan's ownership/resource gate](plan.md#functional-and-real-e2e-validation-plan). Coordinate a fresh synthetic fixture nonce and strict loopback targets, controlled synthetic owner/workspace, server-only configuration through an approved secure channel and the FE generated consumer. Do not reuse deleted005 fixture directories, read owner originals or ask for secrets in chat. Public site configuration remains valid independently.

The existing web Playwright config uses3100 and builds default `.next`; running it unchanged is NOT safe for this lane. T008 must first add the reviewed isolated mode, test-only build directory under an owned `apps/web/.openai/` child, new55444 web port and serial shared-Auth scenarios. Resource conflict checks precede startup; no adoption/eviction/restart of shared processes.

## Future affected commands

After implementing T008's isolated mode and receiving grants, use installed Node24 and the existing workspace scripts: `npm run codegen --workspace @esty-admin/web`, `npm run test --workspace @esty-admin/web`, `npm run lint --workspace @esty-admin/web`. Prefix typecheck, the single production build and E2E with command-local `APP_SESSION_E2E=1 APP_SESSION_E2E_RUN_ID=<approved-32-hex-nonce> APP_SESSION_MODE=local`; use `npm run typecheck --workspace @esty-admin/web`, `npm run build --workspace @esty-admin/web`, then `npm run test:e2e --workspace @esty-admin/web -- tests/e2e/application.spec.ts`. The config must carry the identical flags into its owned55444 web server and `.openai/app-session-<nonce>` build/output paths. Angle-bracket text is an execution prerequisite, not a runnable supplied secret/run ID. Current config does NOT support this mode; do not execute unchanged. No root installation or default3100/3000 execution is implied.

BE runs only the affected existing app-foundation/config/HTTP acceptance under its approved fresh fixture; it does not repeat unrelated release suites or shared55432 tests. Extend existing application/public tests instead of cloning a suite for each feature. Keep current meaningful visual/keyboard coverage, replacing only superseded preview-auth behavior assertions.

The [single resource lifecycle](plan.md#functional-and-real-e2e-validation-plan) assigns BE DB/Auth/mail/API and FE web/browser, with explicit readiness handoff and reverse cleanup. Owner preview3000/session6634 and `.next` remain reserved. Screenshots/results belong to the nonce output; cleanup uses recorded ownership, never process-name/port killing or shared-volume removal.

## Required observed journey

1. Enter synthetic admitted credentials in the real web login form; observe current AppMe identity from real Nest/DB and reload protected routes without fixture identity substitution.
2. Exercise expired access with actual provider refresh, current role/disable changes and signed-in/unadmitted handling. Preserve no-store response behavior and independently isolated users.
3. Use two tabs; delay refresh/read during logout and a new sign-in; verify no stale protected state restoration. Check cookie HttpOnly/Secure/SameSite/path/purpose behavior and absence of tokens in JS/storage/rendered content/URLs/logs.
4. Complete local-scope logout, then prove the old session is denied by real Nest while another independent session survives. Provider uncertainty remains explicit, not confirmed revocation.
5. Exercise generic invalid credentials, CSRF/Origin denial, malicious return paths, malformed cookies, missing technical key, dependency outages and disconnect. The main path must use real Auth/DB; synthetic fault peers are labelled separately.
6. Verify home/privacy, keyboard/focus/error announcements and1440/360/390 overflow/visual preservation. No host/cloud acceptance is inferred.

## Acceptance record and next gates

Later record actual commands/exits, failed attempts, exact source/config/contract identity, screenshots, functional versus real E2E evidence, and guarded owned-resource cleanup here. No checkbox is checked by planning.006 completes only when its whole journey and SC-001–SC-003 pass with the required scoped review.

007/008/009 consume the frozen006 interface after its integrated acceptance. Actual first owner/workspace, sender/callback configuration, retention policy, real Auth privileges including definer ownership/non-NULL timebox behavior, and publication/hosted acceptance remain separately approved gates inherited from005. Production schema-changing delivery is owned solely by [001's prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only); this guide neither copies nor executes it.
