# Tasks: Account and Workspace Settings

**READY_FOR_OWNER_PLAN_REVIEW — future work only.** [Spec](spec.md) · [plan and evidence matrix](plan.md) · [006 contract](../006-login-session/contracts/session-bff.md).
IDs are local to008; all implementation checkboxes remain unchecked. One completed settings journey requires real save/reload/current denial and audit evidence, not isolated lane completion.

## Phase 1 — Dependencies and ownership

- [ ] T001 Bind integrated006 acceptance and later FE/BE/integration/file/resource grants in `specs/008-account-workspace-settings/plan.md`; no007/009 dependency, new provider setup, duplicate fixture or005/shared-doc mutation. Preserve owner3000/session6634/.next and link001 migration delivery only for production. **FR-006, FR-008; SC-001–SC-003.**
- [ ] T002 [P] [BE] Reuse accepted T041/T042/T043 settings/audit/scoping evidence and prepare only relevant current scenarios in `apps/api/tests/app-foundation.integration.test.ts`; verify self/Owner boundaries and transactional redaction without speculative API/source/migration changes. Fresh granted synthetic fixture only. **FR-002, FR-003, FR-007, FR-008; SC-001, SC-002.**
- [ ] T003 [FE] Add exact generated AppNamePatch operations to006 `apps/web/src/features/app-session/app-client.ts`, existing `apps/web/src/app/api/app/me/route.ts` and new `apps/web/src/app/api/app/workspace/route.ts`. Body only displayName/revision; trim nonblank1–100 Unicode code points, reject controls/malformed Unicode, revision integer1–2147483646. Preserve result wrappers, server technical bearer/current user token, all-mutation Origin/CSRF/no-store and technical401→503; no foreign ID, email or extra settings. **FR-001–FR-006; SC-001, SC-002.**

## Phase 2 — US1: Persist my display name

**Independent acceptance:** Member and Owner each save their own name, reload and see current profile/menu identity with unchanged read-only Auth email. Depends on T001/T003 and actual006 integration.

- [ ] T004 [US1] [FE] Replace sample account state/inert save in `apps/web/src/features/workspace-foundation/settings-screen.tsx` and `apps/web/src/app/settings/page.tsx`; create focused `settings-state.ts` beside the screen for independent form/draft/revision transitions. Render real AppMe, accessible input/errors and read-only trusted email; no localStorage or optimistic persistence claim. **FR-001, FR-002, FR-004–FR-006; SC-001, SC-003.**
- [ ] T005 [US1] [FE] Bind confirmed AppProfileResult followed by current me to006 `apps/web/src/features/app-session/session-provider.tsx` and existing `features/workspace-foundation/profile-menu.tsx`. Preserve committed-save versus failed-revalidation distinction and discard old identity/generation results/drafts; never promote stale capabilities. Serialize shared provider/menu edits with other features. **FR-001, FR-002, FR-005, FR-006; SC-001–SC-003.**

## Phase 3 — US2: Persist workspace settings as Owner

**Independent acceptance:** Owner workspace save survives another user's reload; Member direct write and demoted Owner deny. Profile/workspace outcomes remain independent. Depends on T003/T004; no invitation or recovery implementation required.

- [ ] T006 [US2] [FE] Add the separate workspace form/action to `apps/web/src/features/workspace-foundation/settings-screen.tsx` and `settings-state.ts`, with current Owner capability and Member read-only view. Use AppWorkspaceResult/current revision; no Save All transaction or rollback fiction. Keep account success true if workspace save fails. **FR-001, FR-003–FR-006; SC-001–SC-003.**
- [ ] T007 [US2] [FE] Implement409 latest-versus-draft review/explicit reapply and current403/401/503/unknown-result recovery in `apps/web/src/features/workspace-foundation/settings-state.ts` and `settings-screen.tsx`; reuse it for both forms. Reload authoritative state before retry, never auto-overwrite or replay after refresh. Scope CSS edits in `workspace-foundation.module.css` through one writer. **FR-003–FR-006; SC-002, SC-003.**
- [ ] T008 [P] [US2] [BE] Reuse/extend meaningful current-role, revision race and audit rollback/redaction assertions in `apps/api/tests/app-foundation.integration.test.ts` as needed by the integrated scenarios. Use existing GET audit with Owner access for acceptance only, not a new web audit/operator endpoint. No duplicate tests of unchanged forwarding. **FR-003, FR-004, FR-007, FR-008; SC-002.**

## Phase 4 — Joint acceptance and closeout

- [ ] T009 [INTEGRATION] Extend existing `apps/web/tests/e2e/application.spec.ts` and006 `app-session-fixture.ts` under one serial writer: real Member/Owner profile save/reload/menu, Owner workspace save/other-user reload, Member/demoted-Owner direct denial, actual stale revision, independent outcomes and scoped audit persistence/rollback checks. Label synthetic outage injection separately. **FR-001–FR-008; SC-001–SC-003.**
- [ ] T010 [FE] Add focused `apps/web/tests/functional/settings-state.test.ts` and adapt `tests/functional/workspace-foundation.test.ts` for real input boundaries, conflict/latest/draft transitions,403/unknown outcomes and cross-identity discard. Delete obsolete incidental/mock-persistence assertions rather than repin them; do not duplicate the main E2E at every layer. **FR-001, FR-004–FR-008; SC-002, SC-003.**
- [ ] T011 [INTEGRATION] Run affected functional/application/public-regression checks and actual keyboard/error/1440/360/390 overflow checks using006's granted isolated mode; record exact commands/results/failures, persisted state/audit evidence and owned cleanup in `specs/008-account-workspace-settings/plan.md`. No default `.next`, unapproved shared resources or mock-only completion. **FR-008; SC-001–SC-003.**
- [ ] T012 [COORDINATOR] Obtain the later separately authorized scoped implementation review, resolve confirmed findings with owners, and record whole-journey acceptance plus shared-file/resource handback in `specs/008-account-workspace-settings/plan.md` and `tasks.md`. No reviewer launch now; no hosted/publication claim or005 task/history rewrite. **FR-006–FR-008; SC-001–SC-003.**

## Dependencies and parallel possibilities

T001 → T002/T003; BE T002 and FE T003 are disjoint after grants. T003 → T004 → T005/T006 (serialize shared settings/UI work); T006 → T007. T008 can run alongside FE T006/T007 in its BE-owned file/resource lane. T002/T005/T007/T008 → T009; T010 exercises completed transitions; T009/T010 → T011 → T012. T009 and any007/009 changes to the same browser fixture/suite are serialized. UI files can proceed alongside007 team and009 recovery after006, but common callers/provider/menu/CSS have one integration owner. No parallel runtime/agent authorization is implied.

An initial profile form is an implementation increment, not completion of the account/workspace feature. All SCs require the integrated evidence; production migration delivery remains solely001's linked gate.
