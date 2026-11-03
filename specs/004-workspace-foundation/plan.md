# Implementation Plan: Workspace Foundation UI Preview

**Feature Directory**: `specs/004-workspace-foundation`  
**Branch**: existing `main` (no branch change)  
**Date**: 2026-11-02  
**Spec**: [spec.md](spec.md)

**Input**: Build the common dashboard foundation UI first so the owner can review it with To do FE before business-flow UX is specified.

**Status**: UI-only implementation plan. It authorizes no real authentication, persistence, API integration, source work by this planning pane, deployment, or Git action.

## Current owner cleanup implementation plan

This owner-authorized source/local cleanup follows alignment of existing feature003/004 artifacts. Prior planning and accepted review evidence below remain historical. The changed visible-copy/no-op contract supersedes the old prominent-preview and disabled-action design, not the underlying no-auth/API/persistence boundary.

| Surface | Retain | Retire / current behavior |
| --- | --- | --- |
| Login | Brand, labelled email/password, validation alerts and first-invalid focus, visibility toggle | Remove eyebrow, preview banner/hint/footer and submission status. Use a concise Sign in heading/control. Valid-looking submit prevents default and has no side effect or fake success. |
| Team Users | Users/Roles tabs, member identities/emails/role/status, search count/no-results/reset and row controls | Remove illustrative/sample badges and explanatory paragraphs; concise headings/search labels. Add/invite/edit/revoke controls are enabled inert buttons. |
| Team Roles | Existing illustrative Admin/Operator/Viewer labels and read-only matrix | Remove explanatory notice/eyebrow; edit/save buttons are enabled inert. Examples remain illustrations, not approved policy. |
| Settings | Account/Workspace field groups, current synthetic values, local edits, concise Unsaved changes indicator, reload reset | Remove badges, eyebrow/description/non-persistence hints and original-sample-value status. Save changes is enabled inert and must not clear dirty state or report saved. |
| Profile and shared shell | Profile menu and focus/dismissal model, Dashboard/Team/Settings navigation, direct Login route | Sign out enabled inert without hint; no session or redirect. Retire reference-only navigation/C02 storage/duplicate header copy per feature003 plan. |

Keep scoped CSS, Doodle paper/ink/peach and readable Geist; remove obsolete styles/state/exports created only for retired copy. No new abstractions, packages, routes or business workflows. Native submit validation stays in its event handler; do not add effects, requests or persistence. Fixtures and read-only permissions stay synthetic in these documents.

Extend existing browser-functional tests rather than duplicate DOM state in Node. Assert actual clickable pointer/Enter/Space behavior with no API/download/print/navigation/browser-write/data-change/success effects, including no-op save preserving edited fields/dirty state and no-op sign-out preserving the page. Keep validation, visibility, tabs/search/reset and menu focus tests. Preserve public/redirect/404/noindex/default-disabled-connectivity regressions and disabled feature001 runtime isolation.

Serialize `.next` with root pT: capture before against owner dev3000, coordinate stop before typegen/build/E2E, run existing Node24 tools without installs, capture production after, then restore dev3000 and verify all owner routes. Use isolated ignored `apps/web/test-results/ui-cleanup-evidence/` and distinct test output paths; never overwrite prior manifests/reviews/screenshots. Existing 003/004 tasks own evidence. New scoped review and owner visual/flow acceptance stay pending; no Git/deploy/shared-document/other-feature authority is added.

## Historical foundation implementation plan

## Summary

Create the preview screens that most dashboards need before adding business workflows: a sign-in page, a combined Users/Roles page, basic Settings, and links from the existing dashboard frame. Keep the accepted Application look. Every identity, role, and setting is illustrative; local edits are transient, reset on reload, and never imply a real account or saved change.

The existing `/application` view already supplies the accepted dashboard frame. This increment does not redesign it or add speculative order/supplier KPIs. After To do FE reviews the foundation UI, the owner can tell the business story through the screens; that later discussion will define products, orders, suppliers, fulfillment, and operational dashboard content.

## Technical Context

**Language/Version**: Existing Node 24, TypeScript, Next.js App Router, and React versions in `apps/web/package.json`.

**Primary Dependencies**: Existing `@esty-admin/web` workspace only. No new dependency is planned.

**Storage**: Synthetic local fixtures and transient component state only. No API, database, cookie, localStorage, session, or other persistent write.

**Testing**: Existing web Node functional suite and production Playwright suite. Extend existing suites.

**Target Platform**: Existing Next.js frontend project. No hosting setting or deployment change.

**Project Type**: UI preview in the existing internal web application.

**Performance Goals**: No new target. Keep the small fixture screens responsive and avoid adding new data-fetching or rendering dependencies.

**Constraints**: All preview routes must say that data is sample and changes are not saved. Do not expose authentication or authorization success. No requests to the API or external services. Preserve public routes, `/connectivity`, `/application` visual acceptance, and `dist/`. Do not edit feature001, README, PROJECT_STATE, architecture, or the shared feature pointer.

**Scale/Scope**: Four foundation routes and a small synthetic team/role/settings dataset. No business-scale volume claims.

## Constitution Check

- **I. Evidence before stack selection**: PASS. Keep the existing Next.js/React workspace.
- **II. Small, executable architecture**: PASS. This preview adds no service, contract, persistence, dependency, or shared package.
- **III. Verify each deliverable**: PASS. New user-visible routes include functional and production E2E acceptance. These checks prove preview behavior only.
- **IV. Keep one current context**: PASS. Feature004 owns this scoped UI plan; no duplicate roadmap, shared pointer, or root-document update.
- **V. Scope and UI discipline**: PASS. Preserve the accepted application appearance, readable data typography, and accessibility. No business module is selected by the fixture content.

This plan is ready for a To do FE **UI-only** implementation handoff after owner review of the routes and illustrative sample content. Real authentication, authorization, member administration, or business integration requires separate approved scope and backend contracts.

## Screen and Route Plan

| Route | Screen | Main UI states |
| --- | --- | --- |
| `/login` | Sign-in preview | Default, required field, invalid email, preview-only submit notice |
| `/application` | Existing accepted dashboard preview | Existing sample-data notice and frame; Team/Settings navigation reaches new routes; existing unavailable actions stay disabled |
| `/settings/team` | User and role administration preview | Users tab, Roles tab, searchable sample list, no-results state, read-only permission example, disabled account/policy actions |
| `/settings` | Basic account/workspace settings preview | Sample values, transient edited state, reset-on-reload explanation |

### Suggested screen behavior

- **Login**: email/password inputs with labels, field validation, password visibility, and a submit notice explaining that sign-in is not connected. Submitting must not create a session or navigate to protected content.
- **Users**: compact table with illustrative names, reserved sample emails, example role labels, and sample status. Search works locally. Add/invite and real access changes are disabled and explained.
- **Roles**: read-only matrix with example roles such as Admin, Operator, and Viewer. Display a clear note that these examples are not the approved business permission policy.
- **Settings**: Account display name/email and Workspace name using sample values. Inputs may demonstrate focus and edited states, but their values are transient and reset on reload.
- **Application navigation**: make Team and Settings open the new preview routes. Preserve Dashboard behavior and leave unrelated reference destinations unavailable.
- **Sample profile menu**: allow the current disabled profile control to open a keyboard-operable preview menu containing a disabled, explained Sign out item. Escape closes it and returns focus; it does not end a session.

The Doodle visual reference is the existing accepted `/application` implementation. Reuse its paper surfaces, ink outlines/shadows, peach accents, and readable sans-serif data typography. Do not import generic Doodle tokens that conflict with the measured reference and do not redesign the dashboard.

## Project Structure

These paths are implementation targets for To do FE, not files created by this planning task.

```text
apps/web/src/app/login/page.tsx
apps/web/src/app/settings/page.tsx
apps/web/src/app/settings/team/page.tsx
apps/web/src/features/workspace-foundation/
  login-screen.tsx
  team-screen.tsx
  settings-screen.tsx
  fixtures.ts
apps/web/src/features/application-preview/application-shell.tsx  # Team/Settings links only
apps/web/tests/functional/workspace-foundation.test.ts
apps/web/tests/e2e/application.spec.ts  # extend existing suite
```

**Structure Decision**: Keep route entrypoints in the existing App Router and screen composition in a feature-specific directory. Reuse the accepted application styling and test harness. Do not add a design-system package or duplicate test suite.

## Acceptance Plan

- Functional tests cover login validation/preview notice, sample member search/reset, role tab content, and transient settings changes.
- Production E2E covers direct route access, navigation between dashboard/team/settings, keyboard operation, disabled-action explanations, noindex, mobile overflow, and preservation of public routes.
- Assert that the preview causes no API/network requests and does not write cookies, localStorage, or session state.
- Capture `/login`, `/settings/team`, and `/settings` at 1440×1000, 390×844, and 360×800 where applicable. Compare the shared visual treatment to the existing accepted Application frame; report any intentional differences.
- Use README's existing web checks after the implementation handoff. No tests or builds were run for this plan.

## Next Planning Phase

After To do FE has the foundation UI increment, resume brainstorming here with the owner to tell the business story through the dashboard and related screens. Product sources, order lifecycle, supplier rules, fulfillment states, and operational metrics are intentionally not planned in feature004.

## Handoff Boundary

- The planning pane owns this feature's scope and tasks only.
- The owner may send the reviewed UI-only tasks to the existing To do FE writer. This plan does not start, inspect, or message that lane.
- The implementation must stop at the preview boundary: no real auth, API, persistence, external service, account, deployment, DNS, dependency, or Git operation.
- Feature001 FE connectivity tasks and feature003 visual acceptance retain their separate ownership and status.
