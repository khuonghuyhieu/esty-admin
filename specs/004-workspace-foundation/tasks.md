# Tasks: Workspace Foundation UI Preview

**Input**: Design documents from `specs/004-workspace-foundation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/ui.md`, and `quickstart.md`.

## Current owner cleanup increment

The owner explicitly supersedes the previous visible preview/sample/non-persistence explanations and disabled-placeholder requirements. The accepted feature004 review and original T001–T018 IDs/check history below remain historical; the cleanup's affected verification and separate coordinator-run scoped review are complete as recorded below. T018 remains unchecked for owner visual/flow acceptance.

- [x] Align existing feature003/004 specifications, plans, tasks and UI contracts before source work; record retained/retired components without rewriting historical acceptance.
- [x] Implement quieter Login/Team/Settings/shared chrome, enabled inert placeholder actions and unchanged functional local behavior according to the current plan.
- [x] Update existing behavioral tests; serialize owner dev3000 pause/checks/restore; capture fresh before/after and record actual results, failures, limitations and protected/authorized hash deltas here.
- [x] Complete the coordinator-owned scoped cleanup review; accepted with no actionable findings.
- [ ] Obtain explicit owner visual/flow acceptance of the cleanup. This is not inferred from either accepted review.

Scope remains UI-only and synthetic/transient. No authentication/session/API/persistence/business integration, fake success, dependency/Git/deployment actions or shared-document/other-feature writes. Preserve all original sealed manifests, review receipts and screenshot evidence. Protect the 14 FE001 web paths; disclose the three authorized feature003 document changes rather than claiming its old 17-file manifest is unchanged.

### Cleanup implementation and verification receipt

**Status: SCOPED_REVIEW_ACCEPTED / OWNER_VISUAL_ACCEPTANCE_PENDING.** This cleanup is locally implemented, verified and independently reviewed through the coordinator's accepted scoped Luna review. New owner visual/flow acceptance remains pending; original T018 remains unchecked.

- Login retains labelled fields, required/email validation with invalid-field focus and password visibility. Its concise Sign in submit prevents default; valid-looking values produce no success message, request, session or redirect. Decorative preview copy and submission feedback are removed.
- Team retains the Users/Roles keyboard tabs, member search/empty/reset and illustrative read-only permission matrix. Settings retains editable transient fields, concise Unsaved changes and reset-on-reload. Profile and row menus retain keyboard/focus/dismissal behavior. Removed explanations/badges do not turn synthetic fixtures into real accounts.
- Add/invite/edit/revoke, permission/save, settings save, sign-out and retained Application placeholders are enabled inert `type="button"` controls. Login remains `type="submit"` for real form validation. Mouse, Enter and Space preserve content/fields/URL; save remains unsaved, sign-out does not navigate, and no fake outcome, request, download/print, cookie/storage write or persistence occurs.
- Updated the existing application browser suite rather than creating a duplicate suite. Actual Node24 functional checks passed **42/42**; typecheck and lint passed. Production build plus `LOCAL_CONNECTIVITY_E2E=0 LOCAL_CONNECTIVITY_ENABLED=false npm run test:e2e --workspace=@esty-admin/web -- --output=test-results/ui-cleanup-run --reporter=line` passed **64**, with **12 intentionally skipped** enabled-connectivity cases. Public routes, legacy redirect/404 and default-disabled connectivity regressions remained covered; no API/DB fixture was started.
- Initial typecheck failed with four TS2339 errors in the new helper's generic input-node value/checked reads. Explicit input typing corrected it; typecheck/lint and production E2E then passed. The initial chain did not reach lint. Both raw outputs remain in `checks-initial.txt` and `checks-final.txt`; no passing result substitutes for the recorded initial failure.
- Isolated `apps/web/test-results/ui-cleanup-evidence/` contains 32 before, three reference and 50 after captures at **1440×1000, 390×844 and 360×800**, including errors, valid-looking inert login, profile/row menus, drawer, team empty/Roles, settings edits and 200% text. Actual browser checks measured no document overflow on all four routes at normal/200% text with reduced motion, and no browser error entries. Visible Users reset to three rows at every width; the earlier generic six-row DOM count included the hidden Roles table and is explicitly distinguished in `visual-smoke.json`.
- Matching screenshots show the intended quieter paper/ink/peach/Geist treatment; visual acceptance remains the owner's separate gate. Before screenshots use owner dev3000; after screenshots use production3100. Before-row-menu full-page captures may dismiss that menu; final open menus use viewport captures. No claim of pixel-equivalence or real account behavior is made.
- Root stopped owner session93974 before production checks. OMP stopped its3100 preview and closed managed browser tabs before requesting restore. Root restored **owner dev session6634**, reporting Node24.22.1 and Next16.4.3 Ready204ms. Bounded browser navigation then verified HTTP200 and expected headings on home/Application/Login/Settings/Team at `http://127.0.0.1:3000`. Root retains runtime ownership and keeps it running; `.next` production ownership is released.
- All14 FE001 web hashes are unchanged; three authorized feature003 document deltas are disclosed rather than calling the old17 scope unchanged. The prior connectivity/foundation manifests and foundation review-closeout remain byte-identical. Root package/lock, pointer, README, PROJECT_STATE and restored intake `next-env.d.ts` bytes also match. The old feature004 scope SHA `e0df75c7e26770eca6746d8187fdbb8662c85ce6677514bc9145e5735c268f11` remains a historical baseline, not this cleanup's review identity.
- The isolated `final-handoff.json` records this increment's20-file source/test/document scope, hashes and authorized003 deltas; `intake.json`, `visual-smoke.json`, `owner-runtime-restored.json` and screenshot hashes retain detailed evidence. Original task IDs/checkmarks, accepted review receipt and all old evidence remain intact. No README/PROJECT_STATE/feature001/005/backend/private/cloud/Git/dependency/deployment operation or new reviewer was performed.

### Accepted cleanup review and docs-only closeout

- Coordinator receipt: actual `gpt-6-luna` runtime probe returned `REVIEW_MODEL_READY`. ONE read-only, ephemeral Codex CLI reviewer session `01a19a9f-d0e8-75b3-9359-5b76bba32e18` exited0. Report `/private/tmp/esty-ui-cleanup-luna-review.txt` found **no actionable findings** in the20-file cleanup scope under the latest owner supersession; the coordinator accepted it. No fix, check rerun or further reviewer was needed.
- The coordinator verified20/20 scoped file hashes, source/tests/current documents and saved before/after screenshots, with a clean scoped diff-check. Reviewed scope SHA256 is `ae3bca91341f4baa0cc8fadedc266bd28960411883e458861031a91a1d2e27cd`; sealed `final-handoff.json` SHA256 is `c08bb70fd4181e9b741c0f48ec378c3f4682a8e58aaba989b9a678302bb9dbbc`. All14 protected FE001 web hashes remained unchanged; the three authorized003 document changes were explicitly distinguished.
- Only existing003/004 task records and separate ignored `apps/web/test-results/ui-cleanup-evidence/review-closeout.json` evidence change in this closeout. The new evidence records old/new task hashes without rewriting or relabelling the frozen cleanup manifest. This accepted cleanup review is distinct from the historical foundation review below.
- Actual42 functional passes, lint/typecheck passes, production64 passes/0 failures/12 deliberate connectivity skips and the initial helper TS2339 failure/correction remain the retained verification. Reviewer/coordinator performed no code fix, check rerun, server/provider/Git/private/dependency action; this documentation closeout does not rerun those checks.
- New owner cleanup visual acceptance remains pending. Historical003 T013 acceptance is preserved;004 T018 stays unchecked. Root-owned owner dev3000/session6634 remains intentionally available and is not restarted, polled or stopped. No runtime/`.next`, source/test/shared-document/spec001/005 writes, new reviewer or real auth/persistence/API/business/hosted integration/publication claim is authorized.

**STOP WRITES.** Scoped review is accepted; explicit owner visual/flow acceptance remains open.

## Historical foundation implementation and review record

**Status**: **READY_FOR_REVIEW** — owner-authorized UI-only implementation T001–T017 is locally verified; T018 screenshots are captured for handoff, but owner visual/flow acceptance remains pending. FE OMP stops writes here. The coordinator alone starts the separate Luna review. Real auth, API, persistence, backend work, Git, and deployment remain out of scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]** marks work that can proceed independently in different files.
- Story labels map implementation work to `spec.md` user stories.
- Extend the existing functional and production E2E suites; do not add a second test framework.

## Phase 1: Preview fixtures and route foundation

**Purpose**: Establish clearly synthetic content and new routes without changing shared project setup.

- [x] T001 Define illustrative member, role, and settings fixtures with reserved `.test` emails in `apps/web/src/features/workspace-foundation/fixtures.ts`; include the preview/non-persistence label with all fixture views.
- [x] T002 Add App Router entrypoints for `/login`, `/settings`, and `/settings/team` in `apps/web/src/app/login/page.tsx`, `apps/web/src/app/settings/page.tsx`, and `apps/web/src/app/settings/team/page.tsx`; keep them `noindex` and preserve existing public and connectivity routes.

## Phase 2: User Story 1 - Review the sign-in experience (Priority: P1)

**Goal**: Present an accessible sign-in form and its preview-only states without pretending to authenticate.

**Independent Test**: Open `/login`, submit empty, malformed, and valid-looking sample values, and verify accessible feedback with no session, request, or protected-route transition.

### Tests for User Story 1

- [x] T003 [US1] Cover required fields, email format, password visibility, preview-only submission, and zero persistence through the existing production browser suite in `apps/web/tests/e2e/application.spec.ts`. Native form validity and React/DOM state are exercised directly rather than duplicated in artificial Node tests; see verification notes below.
- [x] T004 [US1] Extend `apps/web/tests/e2e/application.spec.ts` with keyboard and pointer coverage of the login form and its non-authenticating preview notice.

### Implementation for User Story 1

- [x] T005 [US1] Implement the labelled login form, validation messages, password visibility, and explicit preview-only submit state in `apps/web/src/features/workspace-foundation/login-screen.tsx`; do not create or imply a session.

**Checkpoint**: Login layout and validation work locally; a successful-looking form submission still does not log in.

## Phase 3: User Story 2 - Preview user and role administration (Priority: P1)

**Goal**: Show user and role screens together with local search and clearly disabled real account/policy actions.

**Independent Test**: Open `/settings/team`, search sample members, reset a no-results state, switch to Roles, and inspect the illustrative permission matrix.

### Tests for User Story 2

- [x] T006 [US2] Add pure sample member search/reset functional tests in `apps/web/tests/functional/workspace-foundation.test.ts`; cover Users/Roles tab state, read-only example permissions, disabled account actions, and no network/persistence in the existing `apps/web/tests/e2e/application.spec.ts`.
- [x] T007 [US2] Extend `apps/web/tests/e2e/application.spec.ts` for Team navigation, tab keyboard behavior, search/no-results/reset, and disabled-action explanations.

### Implementation for User Story 2

- [x] T008 [US2] Implement the Users list, local search, no-results state, and Roles tab with illustrative read-only permissions in `apps/web/src/features/workspace-foundation/team-screen.tsx`.
- [x] T009 [US2] Keep add/invite, role-edit, permission-save, and access-revoke controls disabled with nearby preview explanations in `apps/web/src/features/workspace-foundation/team-screen.tsx`.

**Checkpoint**: User and role examples are visibly synthetic; no change can alter a real account or permission.

## Phase 4: User Story 3 - Preview dashboard navigation and basic settings (Priority: P2)

**Goal**: Connect foundation destinations to the accepted dashboard frame and show transient account/workspace settings.

**Independent Test**: Navigate among `/application`, `/settings/team`, and `/settings`; edit a sample setting, reload, and confirm the original value returns.

### Tests for User Story 3

- [x] T010 [US3] Cover sample settings, transient edit state, reset-on-reload behavior, and sample labels directly in `apps/web/tests/e2e/application.spec.ts`; do not duplicate React state with a contrived pure-function implementation.
- [x] T011 [US3] Extend `apps/web/tests/e2e/application.spec.ts` for Dashboard/Team/Settings navigation and viewport overflow at 1440×1000, 390×844, and 360×800.

### Implementation for User Story 3

- [x] T012 [US3] Implement Account and Workspace sections with sample values and transient unsaved state in `apps/web/src/features/workspace-foundation/settings-screen.tsx`.
- [x] T013 [US3] Link Team and Settings in the existing sidebar and add a keyboard-operable sample profile menu with disabled/explained Sign out in `apps/web/src/features/application-preview/application-shell.tsx`; preserve the dashboard layout and other unavailable reference actions.

**Checkpoint**: Existing dashboard appearance is preserved; new navigation opens the two preview routes and local settings reset on reload.

## Phase 5: Accessibility and acceptance handoff

**Purpose**: Verify the preview contract, responsive behavior, and owner-facing evidence.

- [x] T014 Verify the new routes remain excluded from indexing and keep `/`, `/privacy`, `/privacy.html`, and `/connectivity` behavior intact in `apps/web/src/app/` and the existing E2E suite.
- [x] T015 Verify keyboard operation including Escape/focus return for the profile menu, visible focus, reduced motion, 200% text reflow, and no page-level horizontal overflow for the new routes in `apps/web/src/features/workspace-foundation/` and `apps/web/tests/e2e/application.spec.ts`.
- [x] T016 Add a browser assertion that foundation preview actions make no API requests and write no cookies, localStorage, or session storage in `apps/web/tests/e2e/application.spec.ts`.
- [x] T017 Run the affected web functional, typecheck, lint, and production E2E checks listed in `specs/004-workspace-foundation/quickstart.md`; record actual results and limitations in this feature's review notes.
- [ ] T018 Capture same-viewport screenshots for `/login`, `/settings/team`, and `/settings`; present the screens and preview states to the owner and record visual/flow feedback in this feature's tasks file. **Capture/handoff portion complete; owner feedback and visual/flow acceptance pending.** Stop before business-flow planning, commit, push, or deployment.

## Dependencies and Execution Order

### Phase Dependencies

- **Preview fixtures and routes (Phase 1)**: Required before all stories.
- **US1 (Phase 2)**: Can proceed after the preview foundation.
- **US2 (Phase 3)**: Can proceed after fixture and route setup.
- **US3 (Phase 4)**: Depends on the accepted dashboard shell from feature003; does not depend on real authentication or business data.
- **Accessibility and handoff (Phase 5)**: Depends on the three preview screens.

### User Story Dependencies

- **US1 (P1)**: Independent once T001–T002 are complete; this is a non-authenticating UI preview.
- **US2 (P1)**: Independent once T001–T002 are complete; uses sample users/roles only.
- **US3 (P2)**: Uses the existing Application preview and the routes built above; no business-flow contract is needed.

### Parallel Opportunities

- After T001–T002, US1 and US2 screen work can be developed independently in their feature files by the single assigned FE writer.
- Functional test cases can be authored before the corresponding screen components, then checked in the existing web test commands.
- Do not run concurrent web builds or E2E runs because they share `.next/`.

## Implementation Strategy

1. Build the three basic screens as a sample-data UI preview; keep all real account and save actions unavailable.
2. Present the complete local preview and screenshots for owner UI/UX review.
3. After To do FE has the foundation UI increment, return here to brainstorm a concrete business story and create its separately scoped UX plan.

## Notes

- Task IDs are local to feature004. Feature001 connectivity and feature003 visual acceptance remain separate.
- Future business-flow UX will determine catalog source, store behavior, order lifecycle, supplier routing, and fulfillment status. This task list does not preselect those rules.
- No task authorizes real authentication, API/account access, external integrations, dependency installation, deployment, DNS, or Git publication.

## Implementation and local verification evidence

- Intake: existing `main` at `cfd7feba87513b6ea5a7aa1afc8ecd4b542eb2de`; pre-existing FE001/FE003/shared-document changes preserved. The feature004 prerequisite helper passed with command-local `SPECIFY_FEATURE_DIRECTORY=specs/004-workspace-foundation SPECIFY_FEATURE_NO_PERSIST=1`; requirements checklist passed 17/17. No shared-pointer write.
- Ownership: FE OMP remains the only source writer for this increment. No dependency, package/lock, installed-module, API, workflow, feature001, feature003, shared-doc, private/cloud, Git, publication, or deployment changes are part of feature004. Existing shared-document/Git HOLD remains in force.
- Implementation: three nonindexable routes, native email validity and required-field feedback, sample-only sign-in status, transient settings, local member search, keyboard Users/Roles tabs, read-only illustrative permissions, explained unavailable actions, and a dismissible sample profile menu. Existing dashboard fixtures/layout/CSS remain unchanged; only authorized navigation/profile behavior changes in its shell.
- Test placement adaptation: per the authorized browser-behavior coverage option, T003/T006/T010 DOM/state scenarios run through the existing production Playwright suite. The Node suite only adds two meaningful pure member-filter tests (case/whitespace/name/email matching, no-results/reset/order/nonmutation). No second test framework or duplicate state implementation.
- Runtime: cached Node24; no install. `npm run test --workspace=@esty-admin/web` passed **42/42**. `npm run typecheck --workspace=@esty-admin/web` and `npm run lint --workspace=@esty-admin/web` passed, including reruns after the login accessibility fix.
- Initial production run: `LOCAL_CONNECTIVITY_E2E=0 LOCAL_CONNECTIVITY_ENABLED=false npm run test:e2e --workspace=@esty-admin/web -- --output=test-results/feature004-run --reporter=line` built the production app and reported **61 passed, 3 failed, 12 skipped**. All three failures were the login reset scenario: the empty status region had `display: none`, so it disappeared from the accessibility tree. The empty live region now remains mounted/exposed; validation errors are alerts. A transient incorrect edit range was corrected immediately before verification.
- Affected-path verification: `LOCAL_CONNECTIVITY_E2E=0 LOCAL_CONNECTIVITY_ENABLED=false npm run test:e2e --workspace=@esty-admin/web -- --grep foundation --output=test-results/feature004-final-run --reporter=line` rebuilt production and passed **18/18** at 1440×1000, 360×800, and 390×844. The unaffected public/dashboard/default-disabled-connectivity regressions passed in the initial run; no redundant full-suite rerun is claimed. The 12 enabled-connectivity scenarios remain intentionally skipped; no API/DB fixture was started.
- Browser coverage includes required/malformed/valid-looking login, password reveal/hide, no auth transition, reload reset, member search/no-results/reset, keyboard tab wrap/Home/End, illustrative read-only permissions, disabled controls with descriptions, transient account/workspace edits, sidebar navigation, profile keyboard/outside/Escape/Tab dismissal, new-route noindex, skip links, visible input focus, reduced motion and 200% text reflow without page overflow. The no-side-effect scenario records unexpected non-GET/external/API requests, cookie/storage write attempts and final browser stores; all remained empty. Same-origin Next navigation/asset requests are allowed.
- Evidence is isolated under ignored `apps/web/test-results/feature004-evidence/`, `feature004-run/`, and `feature004-final-run/`; initial failures remain preserved. Existing FE001 evidence/report paths are untouched. Non-failing `NO_COLOR`/`FORCE_COLOR` warnings came from the test harness.
- Separate gates: no independent feature004 review has occurred; the coordinator alone starts one Luna review. T018 owner visual/flow acceptance remains pending. FE001 owner visual/hosted acceptance and later business-flow planning are not implied by these checks.

### T018 screenshot handoff and boundaries

- Ran the final production app on loopback3100 and exercised the real surfaces with managed Chromium, independently of the test runner. Observed empty-form alerts and first-invalid focus, preview-only submission, member no-results/reset, role matrix, unsaved settings and original values after reload, and profile-menu dismissal. Browser error collection was empty.
- Captured **30 final screenshots** under `apps/web/test-results/feature004-evidence/`: `login-{1440,390,360}.png`, `login-errors-{1440,390,360}.png`, `login-submitted-{1440,390,360}.png`, `team-users-{1440,390,360}.png`, `team-empty-{1440,390,360}.png`, `team-roles-{1440,390,360}.png`, `settings-{1440,390,360}.png`, `settings-unsaved-{1440,390,360}.png`, `profile-menu-{1440,390,360}.png`, `application-after-1440.png`, `team-roles-scrolled-360.png`, and `settings-text200-360.png`. Viewports are 1440×1000, 390×844 and 360×800; full-page captures retain the viewport width and may exceed its height.
- Same-viewport visual comparison used the pre-write accepted `application-before-1440.png`, final `application-after-1440.png`, and observed public reference `reference-1440.png`. Retained the accepted readable sans-serif application treatment, dotted paper, ink sketch borders, offset shadows and peach accents. Dashboard arrangement/content is preserved apart from the authorized navigation/profile affordances and explanatory copy. This is a local visual comparison, not a claim of owner acceptance or exact pixel fidelity.
- Mobile observations: each new route's document width equalled its 390px/360px viewport. Member/permission tables scroll inside named keyboard-focusable regions rather than expanding the page. A real horizontal wheel gesture moved the 360px Roles region by 312px while document width stayed 360px. Full-page screenshot capture was normalized to scroll-top to avoid a browser capture artifact involving the offscreen skip link; no source change was needed.
- Final protected-file check: all **17** FE001 reviewed files still match manifest `721474b470e010d3bec62ccffd5aa985fde088863bf8d35ddda6b4248cca6357`. Root package/lock, shared feature pointer, accepted `application-preview.tsx` and its CSS also match intake hashes. The scoped final manifest/evidence record is `apps/web/test-results/feature004-evidence/final-handoff.json`.
- Released the feature004 managed browser tab and stopped both session-owned baseline/final preview servers. No web server, API/DB fixture, build/test, new agent or reviewer remains running from this increment. Existing shared services/volumes and other panes were not touched.
- **Pending owner gates:** foundation visual/flow feedback and separate coordinator-run review. No business-flow decisions, publication, remote integration, real sign-in, persistence or deployment acceptance are claimed. Git and shared-document HOLD are not lifted by this handoff.

### Accepted scoped review — docs-only closeout

- **Current review status: ACCEPTED; T018 owner visual/flow acceptance remains PENDING.** This coordinator-supplied receipt supersedes only the pending-review statements in the original handoff above; those statements and the sealed handoff remain historical evidence.
- The actual `gpt-6-luna` runtime probe returned `REVIEW_MODEL_READY`. ONE read-only, ephemeral Codex CLI reviewer session `01a19a74-a257-76b3-bb44-554026936f95` exited **0**. Report: `/private/tmp/esty-feature004-luna-review.txt`. Result: **NO actionable findings** in the 14-file feature004 scope. No source fixes, additional reviewer, or check reruns are needed.
- The coordinator independently verified all 14 file hashes and calculated scope SHA256 `e0df75c7e26770eca6746d8187fdbb8662c85ce6677514bc9145e5735c268f11`; all 17 protected FE001 hashes remained unchanged. Reviewer/coordinator inspected static source/tests and saved screenshots/evidence; neither ran tests, builds or servers, nor modified the repository. This closeout records the supplied review receipt, not another independent review.
- Retain the actual implementation evidence without relabelling it: **42 functional passes**, lint/typecheck **PASS**, initial production **61 passed / 3 failed / 12 skipped**, the disclosed login live-region failure and correction, affected production **18/18 passed**, and **46 unchanged regression cases passed in the initial run**. There was **no final full-suite rerun**; enabled-connectivity scenarios were intentionally skipped. No checks were rerun for review or this docs-only closeout.
- `apps/web/test-results/feature004-evidence/final-handoff.json` remains the immutable reviewed baseline, including its original status, task hash and scope hash. This append changes only `tasks.md`; its old/new hashes and the unchanged sealed-baseline identity are recorded separately in ignored `apps/web/test-results/feature004-evidence/review-closeout.json`. The reviewed 14-file scope hash is not a claim about the post-closeout document bytes.
- T018 stays unchecked until owner visual/flow feedback is accepted. Scope remains a synthetic, transient UI-only preview: no authentication/session, API, persistence, business or hosted integration, publication or deployment acceptance. No source/shared README/PROJECT_STATE/feature001/003/005 edits, dependency changes, Git/deploy permission, or further review/testing authority is added. **STOP WRITES after this docs-only closeout.**
