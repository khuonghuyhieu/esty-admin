# Tasks: Login and Current Session

**Status**: READY_FOR_OWNER_PLAN_REVIEW. All tasks are future work; no source/check/resource authorization is implied.
**Inputs**: [spec](spec.md), [plan](plan.md), [BFF contract](contracts/session-bff.md), [validation guide](quickstart.md).
**Completion unit**: the real login→current me/membership→protected app→logout journey, not FE or BE alone. Task IDs are scoped to006.

## Phase 1 — Explicit ownership and common prerequisites

- [ ] T001 Record the later owner implementation decision, exact FE/BE/integration owners, protected preview/shared paths, secure configuration channel and fresh isolated-resource agreement in `specs/006-login-session/plan.md`; link001's existing migration-delivery gate without copying/implementing it. Do not answer a superseded005 dialog. **FR-008; SC-001–SC-003.**
- [ ] T002 [FE] Regenerate only `apps/web/src/lib/api/generated.ts` from `specs/001-connectivity-foundation/contracts/openapi.json` under the coordinated handoff; verify AppMe/security/error compatibility without hand-written transport duplicates or canonical mutation. **FR-001, FR-006, FR-008.**
- [ ] T003 [P] [BE] Bind existing005 source/current-session/role behavior and newly approved synthetic fixture ownership in `apps/api/tests/app-foundation.integration.test.ts` and `apps/api/tests/app-fixture-lifecycle.ts`; reuse controlled owner bootstrap and exact guard/registry cleanup. No new password module/migration or source fix absent a confirmed gap and grant. **FR-001, FR-007, FR-008.**
- [ ] T004 [P] [FE] Implement server-only config, purpose-bound AES-GCM cookies and exact Origin/CSRF helpers in new `apps/web/src/features/app-session/{config,cookies,csrf}.ts`; names-only `apps/web/.env.example`; behavioral tamper/duplicate/boundary tests in new `apps/web/tests/functional/app-session.test.ts`. No new dependency or owner-secret read. **FR-003, FR-004, FR-006; SC-002, SC-003.**

## Phase 2 — US1: Sign in and receive current admission

**Independent acceptance**: actual browser form → local Auth → fixed-origin Nest me → DB membership → protected rendered identity. Prerequisites T001–T004.

- [ ] T005 [US1] [FE] Implement bounded request-scoped Auth/app callers in new `apps/web/src/features/app-session/{auth-client,app-client}.ts` and exact context/begin/login/me handlers in new `apps/web/src/app/api/auth/{context,begin,login}/route.ts` and `apps/web/src/app/api/app/me/route.ts`; enforce the operation table, technical401→safe503 distinction and no-store responses in `contracts/session-bff.md`. **FR-001, FR-003, FR-004, FR-006; SC-001, SC-002.**
- [ ] T006 [US1] [FE] Wire real sign-in, accessible validation/autofill, begin-before-credentials, safe return paths and unadmitted/unavailable states into existing `apps/web/src/features/workspace-foundation/login-screen.tsx` and `apps/web/src/app/login/page.tsx`; remove preview success/no-op behavior without storing credentials. **FR-001, FR-002, FR-006; SC-001, SC-003.**
- [ ] T007 [US1] [FE] Add current server admission to existing `apps/web/src/app/{application,settings,settings/team}/page.tsx`; pass only sanitized current identity into existing `features/application-preview/{application-shell,application-preview}.tsx` and `features/workspace-foundation/profile-menu.tsx`. Preserve public pages and clearly unconnected Team/Settings bodies until007/008. Never refresh/write cookies from RSC or guard the public root layout globally. **FR-001, FR-002, FR-003, FR-006; SC-001, SC-003.**
- [ ] T008 [US1] [INTEGRATION] Add the shared real-Auth fixture in `apps/web/tests/e2e/app-session-fixture.ts`, isolated approved build/server mode in existing `apps/web/next.config.ts` and `playwright.config.ts`, and first real journey in existing `tests/e2e/application.spec.ts`. Exercise admitted, invalid and unadmitted identities with actual stored membership; owner3000/session6634/.next/shared ports remain untouched. Implement the exact flags, nonce and lifecycle in `plan.md`, not an ad-hoc default build. **FR-001, FR-002, FR-008; SC-001–SC-003.**

## Phase 3 — US2: Refresh and sign out without stale restoration

**Independent acceptance**: two tabs, actual refresh, local logout and denied old JWT through real Nest. Depends on T005–T008.

- [ ] T009 [US2] [FE] Implement exact refresh/logout handlers in new `apps/web/src/app/api/auth/{refresh,logout}/route.ts`; session-cookie writes never rotate context, logout rotates context/clears cookies, provider scope is local, and unconfirmed acknowledgements never become confirmed revocation. No automatic write retry. **FR-003–FR-007; SC-001, SC-002.**
- [ ] T010 [US2] [FE] Implement origin-wide Web Lock/generation/invalidation coordination in new `apps/web/src/features/app-session/session-controller.ts` and `session-provider.tsx`; connect the existing profile menu and login restore state. Discard late identity/data responses, revalidate on visibility/pageshow, fail clearly when required browser APIs are unsupported, and serialize shared shell/menu edits. **FR-002, FR-005, FR-007; SC-001–SC-003.**
- [ ] T011 [US2] [BE] Extend only relevant behavioral acceptance in `apps/api/tests/app-foundation.integration.test.ts` under the granted fixture: old JWT after confirmed local logout denies, independent session survives, current disabled/demoted membership denies immediately; preserve existing definer/technical bearer behavior and no managed Auth SQL mutation. **FR-001, FR-005, FR-007, FR-008; SC-002.**
- [ ] T012 [US2] [FE] Complete focused cases in `apps/web/tests/functional/app-session.test.ts` and adapt existing `tests/functional/workspace-foundation.test.ts`: Origin/CSRF before upstream, tampered/purpose/generation cookies, safe invalid-context reset, stale responses, technical401, deadlines/disconnect, generic provider errors and no credential disclosure. Delete only superseded incidental/preview-only behavior assertions, not meaningful regressions. **FR-003–FR-008; SC-002, SC-003.**
- [ ] T013 [US2] [INTEGRATION] Extend the same `apps/web/tests/e2e/application.spec.ts` journey with real expiry/refresh/logout, two tabs and two user contexts, delayed refresh/read during logout/new begin, back/forward replay, disabled membership, unavailable dependencies and provider-outcome uncertainty. Label synthetic fault injection separately from actual Auth/DB evidence. **FR-005–FR-008; SC-001–SC-003.**

## Phase 4 — Whole-feature acceptance and handoff

- [ ] T014 [INTEGRATION] Run the affected existing functional/application/public-route checks and actual1440/360/390 keyboard/overflow/visual checks described in `specs/006-login-session/quickstart.md` only under the future grant; record real commands/results/failures and exact owned cleanup there. Do not call a mock-only/HTTP-only run browser E2E. **FR-002, FR-008; SC-001–SC-003.**
- [ ] T015 [COORDINATOR] Obtain the separately authorized scoped implementation review and resolve confirmed findings through their file owners; record actual outcome in `specs/006-login-session/plan.md`. No duplicate reviewer or model-identity invention. **FR-003–FR-008; SC-002, SC-003.**
- [ ] T016 [INTEGRATION] Record the completed journey, remaining hosted/setup gates and frozen session/caller interface handoff for007/008/009 in `specs/006-login-session/quickstart.md` and `tasks.md`. Close006 only with SC-001–SC-003 evidence, not per-lane reports. No005/shared-doc/publication change without a separate lease. **FR-008; SC-001–SC-003.**

## Dependencies and parallel execution

T001 → T002/T003/T004; T003 and T004 are disjoint BE/FE slices after their grants. T002+T004 → T005 → T006/T007 → T008. T008 → T009 → T010; T011 can proceed with T009/T010 in BE-owned files and approved resources. T012 follows the actual FE behavior; T013 joins all lane results → T014 → T015 → T016. No `[P]` permits simultaneous writes to common helpers, generated files, shell/menu, configs or the E2E suite. Real-Auth fixture scenarios are serial even when isolated unit checks are parallel.

Implement the full feature in these increments; an intermediate usable login screen is not acceptance of the requested refresh/logout/security journey. Production migration delivery stays a linked001 prerequisite, not a copied task suite.
