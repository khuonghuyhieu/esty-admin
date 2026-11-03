# Feature Specification: Workspace Foundation UI Preview

**Feature Branch**: `004-workspace-foundation`

**Created**: 2026-11-02

**Status**: Draft for UI-only implementation review; no real authentication or business integration

**Input**: Prepare the common dashboard foundation screens so the owner can review and tell the product story before detailed business-flow UX is planned.

## Current owner supersession — quieter foundation UI

The owner authorized an implementation cleanup after the accepted scoped feature004 review. Original requirements, task IDs/checkmarks, review and failure evidence remain historical. Current cleanup changes visible explanatory copy and placeholder affordances only; synthetic identities, illustrative roles and transient state are still not real authentication, permission policy, persistence or business integration.

- Remove preview/sample/non-persistence banners, badges, decorative eyebrows and repeated explanatory paragraphs from Login, Team and Settings. Keep field labels/errors, search no-results/reset, functional count/unsaved-change feedback, role labels and table headings.
- Login retains required/email-format validation, password visibility and first-invalid focus. Submit always prevents default; valid-looking input produces no authentication/session, request, redirect or fake success/preview-status message.
- Add/invite/edit/revoke/permission/save and Sign out controls become enabled `type="button"` placeholders with inert handlers and no disabled/aria-disabled state. They perform no real or simulated account/policy/save/logout operation. The profile menu retains keyboard navigation, Escape/outside dismissal and focus return.
- Users/Roles tabs, local member search/reset, editable Account/Workspace fields and reload reset remain functional. Preserve useful Dashboard/Team/Settings navigation; Login remains directly accessible, not a fake logout destination. Shared Application chrome follows feature003's current retained/retired inventory.
- These decisions supersede affected US1–US3 explanatory/disabled scenarios, FR-002/004/005/007/008/009/014, SC-004 and the disabled/explanation parts of SC-006 below. Noindex, no network/persistent writes, public/default-disabled-connectivity behavior, responsive/keyboard usability and the no-auth-success contract remain required.
- New acceptance: absence of redundant explanatory copy; all retained no-op controls enabled and harmless by pointer/keyboard; actual validation/search/tabs/settings/navigation/menu behavior intact; fresh 1440/390/360 screenshots and affected functional/production checks. Prior review acceptance does not cover this changed scope; one coordinator review and owner visual/flow acceptance remain pending. T018 stays unchecked.

## Historical foundation specification

## User Scenarios & Testing

### User Story 1 - Review the sign-in experience (Priority: P1)

The owner can inspect the sign-in screen and its basic form states as part of the dashboard UI preview.

**Why this priority**: Login is a standard entry screen for an internal dashboard, and its placement and tone should be reviewed before detailed workflows are designed.

**Independent Test**: Open `/login`, inspect default and validation states, submit the preview form, and confirm the UI clearly states that authentication is not connected.

**Acceptance Scenarios**:

1. **Given** the login page is open, **When** a visitor inspects it, **Then** the page presents labelled email and password fields, a primary sign-in control, and a clear preview notice.
2. **Given** a required field is missing or the email format is invalid, **When** the form is submitted, **Then** the invalid field receives an accessible message and visible focus.
3. **Given** valid-looking sample credentials are entered, **When** sign-in is submitted, **Then** the page explains that real sign-in is unavailable and does not create a session or navigate as if login succeeded.
4. **Given** the sample profile menu is open on `/application`, **When** the sign-out control is inspected, **Then** it is visibly unavailable in the preview and explains that sign-out is not connected.

---

### User Story 2 - Preview user and role administration (Priority: P1)

The owner can inspect how user management and role configuration fit together in the dashboard settings.

**Why this priority**: User and role administration are related screens in the foundation and were explicitly grouped together by the owner.

**Independent Test**: Open `/settings/team`, move between Users and Roles, search sample members, inspect the role matrix, and confirm that unavailable account/policy actions are explained.

**Acceptance Scenarios**:

1. **Given** `/settings/team` is open, **When** the Users tab is selected, **Then** a labelled sample member list shows display name, sample email, illustrative role, and sample access state.
2. **Given** the owner selects the Roles tab, **When** the screen loads, **Then** illustrative roles and a read-only example permission matrix are shown with a notice that they are not an approved access policy.
3. **Given** a user or role action is unavailable, **When** it is inspected, **Then** it is disabled and a nearby explanation states that the preview does not manage real accounts or permissions.
4. **Given** a search query matches no sample members, **When** the list updates, **Then** a clear empty state and reset action are shown.

---

### User Story 3 - Preview dashboard navigation and basic settings (Priority: P2)

The owner can move between the existing dashboard frame, team/roles, and basic account/workspace settings to review how the foundation fits together.

**Why this priority**: The existing Application frame is already accepted; this increment connects its foundation destinations without inventing operational business content.

**Independent Test**: Navigate among `/application`, `/settings`, and `/settings/team` at desktop and mobile sizes; inspect the basic settings preview and return to the dashboard.

**Acceptance Scenarios**:

1. **Given** the existing dashboard frame is open, **When** Team or Settings navigation is selected, **Then** the matching preview route opens and its navigation item is selected.
2. **Given** `/settings` is open, **When** the account/workspace sections are inspected, **Then** sample display name, email, and workspace name values are clearly labelled and the page explains that edits are not saved.
3. **Given** a settings field is edited in the preview, **When** the local value changes, **Then** an unsaved preview state is shown and reloading restores the sample value.
4. **Given** any foundation route is viewed by keyboard or at a narrow viewport, **When** the user moves through its controls, **Then** focus is visible and there is no page-level horizontal overflow.

## Edge Cases

- The login form is submitted empty, with malformed email, or with a long value.
- The preview notice is missed by a screen reader or appears too far from the related control.
- Search has no sample-member matches; resetting restores the complete sample list.
- Long names, emails, or role labels wrap without obscuring row actions.
- A disabled action is mistaken for a working integration or real access control.
- The mobile viewport is 390px or 360px wide, text is enlarged to 200%, or reduced motion is enabled.
- A user opens a new route directly or uses browser back/refresh while navigating the preview.

## Requirements

### Functional Requirements

- **FR-001**: The preview MUST provide `/login`, `/settings`, and `/settings/team` routes while preserving `/application` and all public routes.
- **FR-002**: The login screen MUST include labelled email and password fields, required/email-format feedback, and a clear explanation that authentication is not connected.
- **FR-003**: Submitting the login preview MUST NOT create a session, make an API request, or imply successful authentication.
- **FR-004**: The existing dashboard frame MUST link to the Team and Settings preview routes; unrelated reference actions remain disabled and explained.
- **FR-005**: The team screen MUST group Users and Roles views together and display clearly labelled synthetic member and role examples.
- **FR-006**: Member search MUST filter the sample list and provide a resettable no-results state.
- **FR-007**: Account creation, invitations, role edits, permission changes, and real sign-out MUST remain disabled and explained; no action may change real access.
- **FR-008**: Basic settings MUST show Account display name/email and Workspace name fields. Fields MAY update local preview state only; the page MUST state that values are not saved and a reload MUST restore the original fixtures.
- **FR-009**: Illustrative role names, member identities, access states, and settings values MUST be labelled as sample content, not approved policy or real accounts.
- **FR-010**: This preview MUST make no external API calls, write no persistent browser data, and add no authentication or business integration.
- **FR-011**: All new routes and controls MUST have semantic labels, keyboard-accessible navigation, visible focus, and responsive layouts without page-level horizontal overflow at 1440px, 390px, and 360px.
- **FR-012**: The preview MUST retain the accepted Application visual treatment and readable admin typography; it MUST NOT redesign the shell.
- **FR-013**: The preview MUST remain separate from public home/privacy navigation and retain the application's noindex behavior.
- **FR-014**: The sample profile control on `/application` MUST open a keyboard-operable preview menu with a disabled, explained Sign out item; Escape MUST close it and return focus to the trigger.

### Out of Scope

- Real login, logout, sessions, route security, account creation/invitation, role enforcement, or permission persistence.
- Settings or roles backed by an identity provider, backend, database, or production account.
- Store connections, supplier configuration, marketplace catalog, orders, fulfillment, or live business dashboard metrics.
- Changes to feature001 connectivity or feature003's accepted visual design.

## Key Entities

- **Sample member**: Synthetic display name, reserved sample email, illustrative role, and preview access state.
- **Illustrative role**: Sample role label and read-only example permissions used only to lay out the Roles view.
- **Preview setting**: Sample account/workspace value held in transient UI state and reset on reload.
- **Preview route state**: Current route, selected settings tab, search query, and unsaved sample field values.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An owner can visit all four foundation routes directly and navigate between them without a missing-route state.
- **SC-002**: Empty and malformed login form submissions produce accessible field feedback; a valid-looking submission never reports authentication success.
- **SC-003**: Search over sample members updates visible rows, and reset restores every sample member.
- **SC-004**: Every disabled or local-only action has a visible explanation that it is preview-only and not saved.
- **SC-005**: All foundation routes are keyboard reachable and fit the viewport at 1440px, 390px, and 360px without page-level horizontal overflow.
- **SC-006**: Functional and production-browser acceptance proves the route, form, sample search, settings preview, disabled-action, public-route, and no-network behaviors.

## Assumptions

- The existing Application frame is visually accepted; this increment adds foundation destinations and does not redesign it.
- The current `/application` content remains a clearly identified synthetic preview. It is not relabelled as live store/order data.
- Example roles such as Admin, Operator, and Viewer are placeholders for layout review only; they do not define the future policy.
- Business-flow UX and all genuine authentication/API contracts are planned after the owner reviews the foundation UI with To do FE.
- Repository artifacts remain in English. The owner conversation remains in Vietnamese.
