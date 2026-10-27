# Implementation plan: Reference Application shell

Date: 2026-10-27 · Actual branch: `docs/application-shell-plan` · Status: Draft, awaiting owner review.
Input: [spec.md](spec.md). Spec Kit helpers report logical feature `003-application-shell`; they do not switch Git branches. Use `SPECIFY_FEATURE_DIRECTORY=specs/003-application-shell SPECIFY_FEATURE_NO_PERSIST=1` per invocation; preserve other sessions' feature context.

## Summary and review decisions

Reproduce the complete visual frame at https://doodle-typeui-9fa2feab.vercel.app/application before adapting it to Etsy workflows. This is a local sample-data UI preview in the existing frontend, not an operational dashboard. Review defaults are `/application` for the preview and retained sample whiteboard labels. The owner can change these defaults during plan review; do not replace the inventory with Orders/Connections screens.

Implementation resumes only after owner approval in To do FE. Documentation publication is a separate requested step. No new checkout, branch, install, source implementation, deployment or DNS action in this planning increment.

## Technical context

- Runtime/framework: existing Node 24.22.1, TypeScript, Next.js App Router and React pins from `apps/web/package.json` and the root lockfile; retain them rather than selecting new versions.
- Platform: browser UI in the existing `apps/web` workspace. Existing Vercel deployment remains unchanged by local planning.
- Data/storage: five synthetic project rows and static chart/activity fixtures; transient client state only. No BE, database, credentials, localStorage or API transport.
- Rendering: server route supplies fixture content; client components only for drawer, menu, search/filter/sort. Render chart with accessible SVG and a data alternative; use existing assets or small local SVG icons. No new chart/UI library or install is planned.
- Typography: reference Application uses sans-serif throughout data/headings. Use the installed local Geist face; record differences from reference system sans. Do not apply Delius to application tables/headings just because marketing uses it.
- Testing: existing functional harness and production Playwright suite. README owns commands; do not add a second test framework. No arbitrary benchmark/coverage target; keep fixtures small and avoid network/font dependencies.
- Skills: frontend-design, doodle, web-design-guidelines and applicable vercel-react-best-practices rules. The reference wins over generic blue/white/handwritten Doodle defaults. Fetch current interface guidelines when reviewing implementation.

## Constitution check

Before design: approved Next.js stack retained; one frontend; separate feature from website and connectivity; English artifacts; fixture claims explicit; no production business module or API duplication.
After design: same gates pass. No persistent entity, external contract, dependency expansion or runtime stack change. Functional/E2E and separate visual acceptance are required. No justified constitution exceptions.

## Observed reference evidence

On 2026-10-27, an isolated headless Chromium opened the actual URL, read rendered text/controls and captured the full desktop page at 1440×1000 and mobile at 390×844. The complete desktop composition was visually inspected. At 390px, document scroll width was 845px; reproduce the visual system, correcting this overflow.

Opening a row menu exposed Share board, Edit project, Archive project and Delete project. Clicking Filters, Table settings, New board and Notifications produced no new visible text in this check. This does not establish hidden dialog designs or production behavior. Several sidebar links point to `#`; do not copy inert enabled links. Reference screenshots under `/private/tmp` are local investigation evidence, not committed acceptance artifacts; recapture during implementation.

## Component inventory

All groups below are required. IDs provide coverage for tasks and visual review.

| ID | Group | Required anatomy |
| --- | --- | --- |
| C01 | Sidebar | SketchPad mark/name; divider; Dashboard selected; Boards badge 8; Templates; Team badge 3; Settings; icons; mobile drawer trigger |
| C02 | Sidebar storage | Canvas storage title/icon; 6.8 GB / 10 GB; 142 boards / 28,400 strokes; progress bar; 68% used |
| C03 | Header | Project dashboard title/subtitle; Northwind Studio workspace trigger with Team badge/chevron; Search boards field; notifications badge 3; JK avatar/Jordan Kim |
| C04 | Metric grid | Four cards with icon discs, values 24 / 1,842 / 18 / 68%, labels and upper-right trend/status text |
| C05 | Chart panel | Canvas activity heading/description; Daily strokes and Live sessions inset cards; line plot, grid, date/value axes and point markers |
| C06 | Recent activity | Heading/description; Drawings/Shares/Comments/Invites counters; five event rows with colored dots, descriptions, times, separators |
| C07 | Table toolbar | Whiteboard projects title; List view / Export; search; Filters; Table settings icon; New board; reference button hierarchy |
| C08 | Status filters | Show only label; All / Active / In review / Archived radio options |
| C09 | Data table | Project icon/name, Owner, Collaborators, Strokes, Updated, Status, Actions; five rows; Strokes/Updated sorting; badges; row-menu trigger and four-item menu |
| C10 | Table footer | Projects in view / Strokes in view; Print / Duplicate / Export CSV |

## Design tokens and foundations

Intent: retain the sample's spacious paper dashboard and imperfect dark framing while keeping dense data easy to scan.

| Token / role | Planned value or constraint |
| --- | --- |
| Paper | `#f9f6f0` |
| Inset/secondary surface | `#efebe1` |
| Ink | `#111827`; text/outline |
| Peach accent | `#eacdc2`; emphasize primary fixture controls |
| Secondary text | Start with existing readable muted token; measure contrast before acceptance |
| Outline | Dark 2–3px strokes, varied asymmetric elliptical radii; no random per-render variation |
| Shadow | Solid dark offset, generally 4–6px; tune against same-viewport screenshots |
| Canvas | Subtle dotted texture, decorative and hidden from accessibility tree |
| Type | Sans-serif 14/16px data/body, 18px panel headings, approximately 28px page heading, 32px metrics; adjust from captured reference |
| Spacing | 4/8/12/16/24/32px scale; desktop sidebar approximately 280px, main padding approximately 32px |

These layout sizes are initial implementation targets inferred from screenshots, not measured upstream component source. Verify computed contrast, loaded fonts and screenshots. Keep asymmetry on containers without rotating text or shrinking touch targets. No gradients or unrelated decorative illustrations.

## Layout and responsive behavior

Desktop at 1440px: sidebar on the left, main content to its right; header row, four equal metric cards, two equal chart/activity panels, full-width table panel. Preserve content order and top-level spacing.

Below 1024px: sidebar becomes an accessible drawer and metrics use two columns; header controls wrap. Below 768px: chart/activity panels stack; table toolbar wraps, search expands to available width. At 360px/390px: use 16px main padding, two metric columns where readable, otherwise one; retain visible labels and all groups. The table alone may scroll horizontally inside a named keyboard-accessible region. Never hide columns without another way to reach their content. Menus must fit the viewport. Targets should be at least 44px for touch without distorting desktop density.

At 200% text enlargement, cards/header/toolbar must reflow. Honor reduced motion. The chart needs a concise accessible summary and a reachable table/list of plotted values. Color never carries status alone.

## Component behavior and content

See [UI contract](contracts/ui.md) for observed versus proposed interactions. All controls retain their reference location; functional fixture controls expose hover/focus/active states. Disabled controls retain readable labels and an adjacent preview explanation. Avoid misleading enabled controls that perform nothing.

A small visible banner states `UI preview — sample data. Changes are not saved.` Do not put developer-only implementation detail throughout the screen. Keep current reference labels as calibration fixtures; do not invent real operator identity or claim these people belong to the owner's team. Rebranding/navigation/business vocabulary follows a later owner decision.

## Proposed source organization

```text
apps/web/src/app/application/page.tsx
apps/web/src/features/application-preview/
  application-preview.tsx
  application-preview.module.css
  fixtures.ts
  model.ts
  table-state.ts
  application-shell.tsx
  metric-card.tsx
  activity-chart.tsx
  activity-feed.tsx
  projects-table.tsx
  row-menu.tsx
apps/web/tests/functional/application-table.test.ts
apps/web/tests/e2e/application.spec.ts
```

These are planned paths, not existing implementation. Keep styling scoped. Root layout/global fonts remain shared; route must not inherit the public header/footer: inspect current root composition and scope that shell to public routes with minimal regression-safe changes if necessary. Prefer rendering the existing site shell in public composition over moving URLs. Preserve `/`, `/privacy`, `/privacy.html` redirect and unknown-route recovery. `/application` emits `noindex,nofollow` in every site mode. Preview is not authentication and holds no real data; do not publish it without separate authorization.

## Validation and acceptance

Functional tests cover case-insensitive search, combined status filter, numeric/date ordering with stable tie-breaks, no-results reset and footer aggregates. E2E covers direct preview load, search → filter → sort → menu → reset, disabled preview controls, drawer/menu keyboard/focus, chart data alternative and mobile table reachability. Run existing public journeys as regressions using README commands. Cover 1440×1000, 390×844 and 360×800, reduced motion and 200% text reflow. No live API is required.

Capture fresh reference/implementation screenshots at identical viewports with fonts loaded. Retain ignored evidence under `apps/web/test-results/visual/application/` after tests. Compare C01–C10 and record pass/mismatch/intentional difference for type, surfaces, palette, outlines/shadows, spacing/hierarchy and responsive behavior. Include menu-open and drawer-open captures. The sample banner, disabled actions, accessible chart alternative and corrected mobile overflow are intentional adaptations, not defects to hide. Tests/review do not replace explicit owner visual acceptance.

## Delivery and handoff

1. Owner reviews this draft, especially preview route, retained sample labels and disabled-action policy.
2. On explicit request, publish only approved planning changes, preserving uncommitted BE work. Do not stage the entire working tree.
3. In To do FE, implementation uses OMP under current AGENTS harness rules after checking real ownership/pane state. No OMP or reviewer is started by creating this plan.
4. Implement T001–T012; obtain one scoped read-only `gpt-6-luna` code review and fix confirmed findings through OMP.
5. Present preview/comparisons for T013 owner acceptance. Stop before commit/push/deploy/DNS unless separately requested.

BE source, feature 001, shared dependency files and cloud configuration remain outside this lane. Request a serial dependency lease only if an actual need emerges. Feature 001 connectivity tasks stay separate; this preview cannot mark them done. Root domain/API setup is independent of this UI work.
