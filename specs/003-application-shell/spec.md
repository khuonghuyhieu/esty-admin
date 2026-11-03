# Feature specification: Reference Application shell

Created: 2026-10-27 · Status: T001–T013 complete; owner explicitly accepted the current Application visual design on 2026-11-01 · Authorized implementation baseline: `main@b370578`.

Owner request: first build the complete UI frame visible at https://doodle-typeui-9fa2feab.vercel.app/application. Identify its components before planning; review this plan before publication and implementation in the To do FE session. This feature supersedes the earlier suggestion to start with operational Orders/Order detail screens. [ARCH-001](../architecture.md) retains stack authority.

## Current owner supersession — UI cleanup

The owner authorized cleanup of the existing Application/foundation surfaces by the sole FE writer. This supersedes only the visible preview/sample/non-persistence explanations, disabled-placeholder contract and reference-only chrome below. Earlier C01–C10 coverage, task checkmarks, visual acceptance and review/failure records remain **historical evidence**, not acceptance of this changed UI.

- Keep real Dashboard (`/application`), Team (`/settings/team`) and Settings (`/settings`) navigation. Login remains directly available at `/login`; do not add a public CTA or pretend that sign-out navigates to it.
- Remove Boards/Templates dead navigation, C02 sidebar storage/progress, repeated preview/unavailable copy, duplicate workspace subtitles and the header plan badge. Preserve the core four-card/chart/activity/table arrangement and its functioning fixture search/filter/sort/reset, menus and drawer.
- Retained placeholders become enabled semantic `type="button"` controls with inert handlers, including row actions, workspace/notification controls and table toolbar/footer actions. No disabled/aria-disabled state, fake success, mutation, download, print, API request, persistent browser write or navigation is allowed. This deliberately supersedes the earlier prohibition on enabled no-ops.
- Retain Doodle paper/ink/peach, readable Geist, meaningful labels/headings, chart data alternative, keyboard/focus/Escape behavior, noindex and narrow-screen usability. Synthetic/transient/nonintegrated limitations remain documented here, not repeated as visible banners.
- Current acceptance covers useful-route-only sidebar without C02 storage, absent explanatory clutter, enabled no-op mouse/keyboard activation without side effects, preserved functional journeys, public/redirect/404/default-disabled-connectivity regressions, and fresh desktop/mobile comparisons. This supersedes affected FR-001/003/007/008/009 and SC-001/004 wording below; unrelated requirements remain in force.
- No real auth/policy/business integration, dependency, Git publication or deployment is authorized. All 14 FE001 `apps/web` manifest paths remain protected; the three feature003 documents are explicitly authorized to change and must be recorded as changed, not counted as unchanged in the old 17-file manifest. New coordinator-scoped review and owner visual acceptance remain pending.

## Historical accepted-frame requirements and evidence

## Current owner acceptance — 2026-11-01

The owner explicitly accepted the existing Application frame in the direct FE implementation handoff. T013 is complete on that owner decision, not inferred from automated checks. Preserve the accepted design, sample behavior and retained comparison/audit evidence; no redesign or redundant test run accompanies this documentation-only acceptance. Earlier pending-acceptance and publication statements below are dated history. Separately authorized feature001 T014–T016 remains a local connectivity increment, not hosted UI→API→DB acceptance or business-flow authorization.


## User scenarios and testing

### US1 — Recognize the complete Application frame (P1)

As the owner, I can review the whole reference layout before deciding how Etsy workflows will occupy it.

Independent test: open the preview and compare every component group against the reference at the same viewport.

1. Given the default preview, when it loads, then sidebar, header, four metric cards, activity chart, recent activity and the complete table section are present in reference order.
2. Given sample content, when I inspect the page, then it is visibly labeled as a UI preview with sample data, without implying Etsy connections or real team accounts.
3. Given the public website, when I open home/privacy separately, then both retain their current content and navigation.

### US2 — Inspect table and menu states (P1)

As the owner, I can exercise local table interactions and identify which controls are only visual placeholders.

Independent test: search and filter fixtures, sort rows, open/dismiss a row menu and reset the table.

1. Given sample rows, when search/status filters change, then rows and footer totals reflect the visible subset; zero matches show a clear empty state with reset.
2. Given sortable headers, when activated by pointer or keyboard, then order and sort indication update consistently.
3. Given a row action button, when opened, then Share board, Edit project, Archive project and Delete project appear; dismissal restores focus and no business operation executes.
4. Given an unavailable action, when inspected, then it is visibly disabled and its preview limitation is explained. No enabled control silently does nothing.

### US3 — Review on mobile and with keyboard (P1)

As a reviewer, I can navigate the entire frame on narrow screens and by keyboard.

Independent test: use the sidebar drawer, table and menu at 390px/360px; complete the search/filter/menu journey without a mouse.

1. Given a narrow viewport, when content reflows, then the page itself has no horizontal overflow; the table can scroll inside a labeled region.
2. Given an open mobile drawer or row menu, when Escape is pressed, then it closes and focus returns to its trigger.
3. Given an icon-only control or chart, when accessed with assistive technology, then it has a meaningful label or readable data alternative.

### Edge cases

- Long project/owner/workspace labels wrap or truncate with an accessible full name.
- Combined filters produce no matches; clearing restores all five fixture rows and totals.
- A menu near a viewport edge remains visible; scrolling does not strand an overlay.
- Reduced motion and 200% text enlargement preserve usable controls and readable content.
- The reference is unavailable or changes: record the limitation and seek visual review rather than inventing evidence.

## Functional requirements

- FR-001: Include all ten component groups in the [component inventory](plan.md#component-inventory); retain reference hierarchy and density.
- FR-002: Match the reference's paper/dot surfaces, sketch outlines, offset shadows, peach accents and readable sans-serif typography; generic skill tokens cannot override this reference.
- FR-003: Present sidebar navigation labels/badges, storage card/progress, header workspace/search/notification/profile controls and four metric cards.
- FR-004: Present the chart panel with two compact metrics and the recent-activity panel with four counters and five activity entries.
- FR-005: Present the entire table toolbar, status radio group, seven-column table, status badges, sortable headers, row menus, footer totals and footer actions.
- FR-006: Provide local fixture search, combined status filtering, numeric/date sorting, correct filtered totals and resettable no-results state.
- FR-007: Implement accessible row-menu and mobile-drawer opening, closing and focus behavior; mark unimplemented preview actions disabled with an explanation.
- FR-008: Preserve all reference control positions even when disabled; distinguish observed reference behavior from proposed preview behavior in the interaction contract.
- FR-009: Clearly label all displayed data as sample data; preview interactions must not call external services or persist changes.
- FR-010: Support desktop 1440px, mobile 390px and 360px without page-level horizontal overflow, with visible focus, semantic controls and reduced motion.
- FR-011: Keep the preview separate from home/privacy; it must remain excluded from indexing and have no public-site navigation CTA added in this increment.
- FR-012: Verify meaningful local functional behavior, production browser journeys, existing public-route regressions and same-viewport visual comparisons before owner visual acceptance.

## Key entities

Sample workspace/profile, metric, chart point, activity event, project row and transient table/menu state. These are display fixtures, not Etsy or supplier business models. See [data-model.md](data-model.md).

## Success criteria

- SC-001: All ten inventory groups are present; the visual review records typography, palette, surface, outline/shadow, spacing and hierarchy against the reference.
- SC-002: Search → status filter → sort → row menu → reset works; displayed counts/totals equal the visible fixture rows.
- SC-003: At 1440px, 390px and 360px, page scroll width does not exceed viewport width; all table columns remain reachable within the table region.
- SC-004: Keyboard users can reach and dismiss drawer/menu controls; disabled actions and chart data remain understandable.
- SC-005: Existing public route journeys pass alongside preview journeys; sample UI never reports a real integration success.
- SC-006: Owner reviews desktop/mobile comparisons and explicitly accepts the frame; automated checks alone cannot complete acceptance.

## Assumptions and scope

Preserve the sample's whiteboard terminology and synthetic values for visual calibration. Adaptation to Etsy labels, operational screens, authentication, API calls, notification services, persistence, CSV/print actions and destructive operations are later decisions. The reference's other sidebar destinations are not evidence of full screens. This feature does not complete feature 001 T014–T016. The owner authorized local T001–T012 implementation; T012 is complete following the coordinator's separate read-only review with no actionable findings. T013 remains open for explicit owner visual acceptance. No dependency install, commit/push, deployment or DNS change is authorized.

Latest owner authorization (2026-10-27): commit/push the existing reviewed source/tests/docs to main. Earlier publication restrictions above are superseded for this request; visual acceptance, deployment and business integrations remain separate.
