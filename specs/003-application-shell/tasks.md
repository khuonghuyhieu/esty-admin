# Tasks: Reference Application shell

Status: T001–T012 complete on the owner-authorized `main@b370578` baseline, including local verification, retained comparison evidence and the coordinator's separate read-only `gpt-6-luna` review with no actionable findings. Inputs: [spec](spec.md), [plan](plan.md), [UI contract](contracts/ui.md), [fixture model](data-model.md). T013 remains unchecked pending owner visual acceptance. No commit/push/deploy/DNS or FE dependency operation occurred. Tests resumed only after the explicit owner-approved direct BE install-window handback; no source fix or test rerun was needed after review.

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
- [ ] T013 Present local preview and comparison evidence; record explicit owner visual acceptance or unresolved mismatches in PROJECT_STATE.md and this tasks.md. Leave unchecked until acceptance. Stop before commit/push/deploy/DNS and do not mark feature 001 connectivity tasks complete.

## Dependencies and implementation strategy

T001 → T002 → T003–T006 (complete frame) → T007–T009 (fixture interactions) → T010–T011 (responsive/keyboard acceptance) → T012 → T013. Add observable failing tests before the corresponding behavior implementation; passing tests do not establish visual acceptance. T003–T006 is an intermediate visual checkpoint, not feature completion; all three stories remain required.

One OMP source writer is expected in To do FE. After T002, metric/chart/activity components in T004 are disjoint implementation units, but are authored serially by that writer; no extra agents are requested. US2's pure table behavior can be developed independently against fixtures; US3's acceptance checks can be specified independently but require the integrated shell to pass. Do not run concurrent root installs or modify BE/cloud scope.

Task count: 13 (foundation 2, US1 4, US2 3, US3 2, closeout 2). All task IDs are local to this feature; feature 001/002 task histories are preserved.

Publication update (2026-10-27): the owner subsequently authorized committing/pushing the remaining source/tests/docs to main before further work. This supersedes the earlier publication stop only. T013 remains unchecked and hosted/deployment acceptance is not inferred.
