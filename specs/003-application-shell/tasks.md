# Tasks: Reference Application shell

Historical implementation status (2026-10-27): T001–T012 complete on the owner-authorized `main@b370578` baseline, including local verification, retained comparison evidence and the coordinator's separate read-only `gpt-6-luna` review with no actionable findings. Inputs: [spec](spec.md), [plan](plan.md), [UI contract](contracts/ui.md), [fixture model](data-model.md). T013 remained unchecked pending owner visual acceptance at that time. No commit/push/deploy/DNS or FE dependency operation occurred. Tests resumed only after the explicit owner-approved direct BE install-window handback; no source fix or test rerun was needed after review.

Current owner decision — 2026-11-01: the owner explicitly accepted the current Application visual design in the direct FE implementation handoff. T013 is now complete; the pending wording in the dated implementation/publication history is retained as history. This acceptance changes documentation only: no redesign, duplicate tests or new reviewer. Feature001 local connectivity remains separately scoped.

## Current owner cleanup increment

The new owner instruction supersedes visible preview/explanation and disabled-placeholder requirements only. Original T001–T013 IDs/checkmarks and C01–C10 acceptance below remain historical; they do not approve this changed UI. See the current supersession in [spec](spec.md#current-owner-supersession--ui-cleanup) and retained/retired inventory in [plan](plan.md#current-owner-cleanup-plan--superseding-visible-chrome-and-placeholder-behavior).

- [x] Align existing 003/004 specs/plans/tasks/UI contracts before source changes; retain historical review/failure evidence and no-auth/no-API/no-persistence boundaries.
- [x] Implement useful-route-only sidebar, retire C02 and redundant visible copy, and enable retained inert placeholders without changing functional fixture journeys or the core visual arrangement.
- [x] Serialize owner dev3000 pause → affected Node24/static/production checks → owner dev3000 restore; retain fresh before/after evidence and actual failures/results in this existing task record.
- [x] Obtain the coordinator's separate scoped Luna review of the cleanup; accepted with no actionable findings.
- [ ] Obtain new owner visual acceptance. Historical T013 acceptance is not acceptance of cleanup.

Only affected Application/foundation source/tests and existing feature003/004 artifacts are writable. The old FE001 manifest's 14 web files remain protected; its three feature003 documents are authorized changes with transparent hash deltas. No shared README/PROJECT_STATE, feature001/005, backend, dependencies, private/cloud, Git or deployment changes.

### Cleanup implementation and verification receipt

**Status: SCOPED_REVIEW_ACCEPTED / OWNER_VISUAL_ACCEPTANCE_PENDING.** Implementation, local verification and the coordinator's separate cleanup review are complete. New owner visual acceptance remains pending; historical T013 acceptance is preserved and does not approve this changed UI.

- C01 now links only Dashboard, Team and Settings. Boards/Templates and their explanation are removed; Login remains directly accessible. C02 sidebar storage/progress and unused fixture/style fields are retired. C03 keeps useful title/workspace/search/notification/profile controls without the duplicate subtitle, plan badge or explanation.
- C04's four-card arrangement, including its compact Storage used metric, remains intentionally unchanged. C05/C06 chart/activity and C07–C10 project arrangement, fixture data, search/filter/sort/reset and keyboard/menu/drawer behavior remain. Preview explanations are removed; retained placeholder controls are enabled semantic buttons that prevent default and have no business effect.
- Existing `apps/web/tests/e2e/application.spec.ts` now checks the useful sidebar and enabled inert actions with mouse, Enter and Space, including stable URL/content/fields and no requests, dialogs, downloads, printing, cookie/storage writes or fake success. Existing functional tests remain unchanged because their pure business rules did not change.
- Actual Node24 commands: `npm run test --workspace=@esty-admin/web` passed **42/42**; `npm run typecheck --workspace=@esty-admin/web` and `npm run lint --workspace=@esty-admin/web` passed after the correction below. `LOCAL_CONNECTIVITY_E2E=0 LOCAL_CONNECTIVITY_ENABLED=false npm run test:e2e --workspace=@esty-admin/web -- --output=test-results/ui-cleanup-run --reporter=line` built the production app and passed **64**, with **12 intentionally skipped** enabled-connectivity cases and no E2E failures. No API/DB fixture was started.
- Failure disclosure: the first typecheck found four TS2339 errors in the new E2E helper's generic DOM-node value/checked access. Explicit input typing fixed the helper; the affected typecheck/lint and production E2E then passed. The first command chain stopped before lint. Raw initial and final outputs are retained separately; no earlier failure was overwritten.
- Fresh evidence is isolated in `apps/web/test-results/ui-cleanup-evidence/`: 32 before, three reference and 50 after screenshots at **1440×1000, 390×844 and 360×800**. Normal and 200% text with reduced motion produced no document overflow on Application/Login/Team/Settings at all three widths (24 measured route/size states). Actual menus/drawer, login errors, team empty/reset/Roles, settings edits and dashboard search were inspected; browser error entries were empty.
- Matching reference/local screenshots retain paper/dots, ink outlines/shadows, peach accents and readable Geist. The quieter chrome/sidebar is an intentional owner-directed deviation, not pixel-equivalence. Before captures came from owner dev3000 and include its development indicator; after captures came from production3100. Before-row-menu full-page captures are not proof of an open menu because scrolling can dismiss it; final open-menu captures use viewport screenshots. The reference's narrow layout overflow is not copied.
- Runtime serialization: root stopped old owner session93974 before production work. OMP stopped its production3100 service and closed managed tabs, then returned `.next` ownership. Root restored **session6634**, reporting Node24.22.1 / Next16.4.3 Ready204ms. OMP verified HTTP200 and expected headings for `/`, `/application`, `/login`, `/settings` and `/settings/team` at `http://127.0.0.1:3000`; root keeps that owner preview running. Future production operations require fresh coordination.
- All **14 protected FE001 web paths** match their intake hashes. The three authorized `specs/003-application-shell/{spec,plan,tasks}.md` hashes change and are disclosed in the new manifest; the old 17-file scope is not claimed unchanged. Old connectivity/foundation manifests and foundation review-closeout bytes are unchanged, as are root package/lock, shared pointer, README, PROJECT_STATE and the intake `next-env.d.ts` bytes after dev restoration.
- `intake.json`, `checks-initial.txt`, `checks-final.txt`, `visual-smoke.json`, `owner-runtime-restored.json` and `final-handoff.json` in the isolated evidence directory retain exact observations, scoped source/document hashes, authorized deltas and screenshot identities. Prior sealed evidence and historical task blocks remain intact. No new tracker, source publication, dependency operation, authentication/API/persistence integration or deployment occurred.

### Accepted cleanup review and docs-only closeout

- Coordinator receipt: actual `gpt-6-luna` runtime probe returned `REVIEW_MODEL_READY`. ONE read-only, ephemeral Codex CLI reviewer session `01a19a9f-d0e8-75b3-9359-5b76bba32e18` exited0; report `/private/tmp/esty-ui-cleanup-luna-review.txt` found **no actionable findings** in the20-file cleanup scope under the latest owner supersession. The coordinator accepted this review; no fix or rerun was required.
- The coordinator verified20/20 file hashes, reviewed source/tests/current documents and saved before/after screenshots, and reported a clean scoped diff-check. Reviewed scope SHA256: `ae3bca91341f4baa0cc8fadedc266bd28960411883e458861031a91a1d2e27cd`; immutable `final-handoff.json` SHA256: `c08bb70fd4181e9b741c0f48ec378c3f4682a8e58aaba989b9a678302bb9dbbc`. All14 protected FE001 web hashes were unchanged; the three authorized003 document changes were not falsely counted unchanged.
- This closeout changes only the existing003/004 task records and separate ignored `apps/web/test-results/ui-cleanup-evidence/review-closeout.json` evidence. That file records old/new task hashes; the sealed cleanup manifest remains byte-identical as the reviewed baseline, not relabelled as the post-closeout document identity. No additional source review, tests, runtime or `.next` operation was performed.
- Retain the actual42 functional passes, lint/typecheck passes, production64 passes/0 failures/12 deliberate connectivity skips and the initial helper TS2339 failure plus correction above. Review does not replace those checks or establish real authentication, persistence, API/business/hosted integration or publication.
- Owner cleanup visual acceptance remains pending; historical003 T013 stays accepted and004 T018 stays unchecked. Root-owned owner dev3000/session6634 must remain running and was not restarted, polled or stopped. No new reviewer, source/test/shared-document/spec001/005 write, provider/private/dependency/Git action or preview restart is authorized by this closeout.

**STOP WRITES.** Scoped review is accepted; new owner visual acceptance remains open.

## Historical implementation tasks and acceptance

## Setup and foundation

- [x] T001 Confirm approved route/sample-label/disabled-action decisions in specs/003-application-shell/plan.md; read current ownership and preserve BE changes. Recapture reference desktop/mobile and row-menu states under apps/web/test-results/visual/application/; record any changed or missing reference evidence.
- [x] T002 Establish typed sample fixtures in apps/web/src/features/application-preview/model.ts and fixtures.ts: five projects, 17,540 total strokes, unique ids, nonempty titles/owners, nonnegative integer collaborators/strokes, status Active/Review/Archived and numeric updatedAt; add metrics/chart/activity/workspace data from the inventory. No transport DTO or persistence.

## US1 — Complete visual frame (P1)

Goal: all reference groups are visible. Independent check: default preview versus full-page desktop reference, including below-fold table/footer.

- [x] T003 [US1] Scope paper/dot/outline/shadow/spacing/sans-serif tokens in apps/web/src/features/application-preview/application-preview.module.css; compose C01–C03 in application-shell.tsx with sidebar/storage/header and sample-data notice. Keep unavailable controls visible but disabled/explained per contracts/ui.md.
- [x] T004 [US1] Implement C04–C06 in apps/web/src/features/application-preview/metric-card.tsx, activity-chart.tsx and activity-feed.tsx: four main metrics, two chart metrics, SVG plot, four activity counters and five event rows. Provide shared-fixture chart data alternative and labeled storage progress.
- [x] T005 [US1] Implement the complete C07–C10 initial table presentation in apps/web/src/features/application-preview/projects-table.tsx: toolbar, radio filters, seven columns, five rows/badges/triggers and footer. Preserve every disabled reference action and explanation; use initial fixture row order with no asserted active sort.
- [x] T006 [US1] Compose apps/web/src/features/application-preview/application-preview.tsx and apps/web/src/app/application/page.tsx; set unconditional noindex/nofollow. Inspect apps/web/src/app/layout.tsx and public composition before separating public/app shells; preserve home/privacy URLs, legacy redirect and 404 without duplicate headers or nested main landmarks.

## US2 — Inspect table and menu states (P1)

Goal: meaningful fixture interactions without business effects. Independent check: search → filter → sort → menu → reset, including zero matches.

- [x] T007 [US2] Write focused failing behavior tests in apps/web/tests/functional/application-table.test.ts using the existing runner for trimmed case-insensitive title/owner search, AND status filters, numeric/date sorting, stable-id ties and filtered aggregates/reset. Then implement apps/web/src/features/application-preview/table-state.ts; preserve five rows/17,540 strokes after reset.
- [x] T008 [US2] Wire synchronized header/table search, radio filters, sortable headers/aria-sort and resettable no-results state in apps/web/src/features/application-preview/projects-table.tsx and application-shell.tsx. Default sort unset; first selected key ascending, subsequent clicks toggle; In review maps to Review.
- [x] T009 [US2] Implement apps/web/src/features/application-preview/row-menu.tsx with all four observed labels disabled, accessible keyboard navigation where applicable, edge-aware placement, outside/Escape dismissal and focus return. Extend apps/web/tests/e2e/application.spec.ts with the main fixture journey, totals, empty state and disabled-action assertions; run against production.

## US3 — Mobile and keyboard review (P1)

Goal: complete frame remains reachable at narrow widths. Independent check: drawer/menu keyboard behavior, table scroll and chart data at each target viewport.

- [x] T010 [US3] Complete responsive/drawer behavior in apps/web/src/features/application-preview/application-shell.tsx, projects-table.tsx and application-preview.module.css: wrapping header/toolbar, stacked panels, accessible modal drawer, long-label handling and named scrollable table region. No page overflow at 1440×1000, 390×844 or 360×800; honor reduced motion and 200% text reflow.
- [x] T011 [US3] Extend apps/web/tests/e2e/application.spec.ts for drawer focus containment/return, menu dismissal, icon labels, chart alternative, mobile column reachability, noindex and viewport overflow. Run affected functional/production E2E commands from README.md, including existing public-route regressions; record actual results/limitations in PROJECT_STATE.md. Fetch current web interface guidelines during UI review.

## Closeout

- [x] T012 Capture fresh same-viewport reference/implementation comparisons for C01–C10 and open-menu/drawer states under apps/web/test-results/visual/application/ after the final test run; record visual matrix and intentional adaptations in PROJECT_STATE.md. Obtain one scoped read-only gpt-6-luna review under AGENTS.md; OMP fixes confirmed findings and reruns affected checks. Update README.md navigation only with actual runnable preview evidence.
- [x] T013 Owner explicitly accepted the existing Application visual design on 2026-11-01 in the direct FE handoff. Retained preview/comparison and independent-audit evidence are unchanged; current shared status is recorded by the exclusive BE docs writer. No redesign or redundant checks accompanied this docs-only acceptance, and feature001 T014–T016 is not completed by it.

## Dependencies and implementation strategy

T001 → T002 → T003–T006 (complete frame) → T007–T009 (fixture interactions) → T010–T011 (responsive/keyboard acceptance) → T012 → T013. Add observable failing tests before the corresponding behavior implementation; passing tests do not establish visual acceptance. T003–T006 is an intermediate visual checkpoint, not feature completion; all three stories remain required.

One OMP source writer is expected in To do FE. After T002, metric/chart/activity components in T004 are disjoint implementation units, but are authored serially by that writer; no extra agents are requested. US2's pure table behavior can be developed independently against fixtures; US3's acceptance checks can be specified independently but require the integrated shell to pass. Do not run concurrent root installs or modify BE/cloud scope.

Task count: 13 (foundation 2, US1 4, US2 3, US3 2, closeout 2). All task IDs are local to this feature; feature 001/002 task histories are preserved.

Publication update (2026-10-27): the owner subsequently authorized committing/pushing the remaining source/tests/docs to main before further work. This supersedes the earlier publication stop only. T013 remains unchecked and hosted/deployment acceptance is not inferred.
