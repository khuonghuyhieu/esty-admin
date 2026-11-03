# Workspace Foundation Preview UI Contract

This is a route and interaction contract for a synthetic UI preview. It does not define authentication or API behavior.

## Current owner cleanup contract

The following supersedes only the historical prominent explanation and disabled-action states below:

- Keep `/login`, `/application`, `/settings/team` and `/settings` with existing noindex/public separation. Dashboard/Team/Settings navigation works; Login is direct-only. No missing-route or fake logout navigation.
- Remove visible preview/sample/non-persistence notices, explanatory hints/badges/eyebrows and success-like submission feedback. Preserve meaningful labels, errors, no-results/reset, count feedback, role/table headings and concise unsaved-change state.
- Login submission prevents default, validates required/email format and focuses the first invalid field. Password visibility remains functional. Valid-looking submission is inert: no success/status notice, request, session or redirect.
- Users/Roles tabs and member search/reset work locally. Role names and the existing read-only matrix remain illustrative, not approved policy. Account/Workspace inputs update transient values and reset on reload.
- All retained former placeholders (add/invite/edit/revoke/permissions/save/Sign out and shared dashboard actions) are enabled semantic `type="button"` controls with inert handlers, without disabled/aria-disabled semantics. Pointer/Enter/Space activation must not change URL/data/settings dirty state, create downloads/print/dialogs/toasts, call APIs or write cookies/localStorage/sessionStorage. Normal same-origin framework assets/navigation for real links are allowed; placeholders initiate no requests.
- Menus retain correct keyboard selection, Escape/outside/Tab dismissal and focus return. Preserve visible focus, reduced motion, 200% text and narrow-page overflow checks.
- Nonintegrated/synthetic/transient limitations remain in documentation, not repeated throughout the UI. Old review evidence does not establish new visual acceptance.

## Historical foundation route and interaction contract

## Route map

| Route | Preview purpose | Navigation |
| --- | --- | --- |
| `/login` | Inspect sign-in form and validation/preview notice | Direct route only; no simulated successful sign-in. |
| `/application` | Existing accepted Application dashboard preview | Dashboard remains selected; Team and Settings open their routes. |
| `/settings/team` | Sample Users and Roles views in one page | Reachable from Team navigation. |
| `/settings` | Sample account/workspace fields | Reachable from Settings navigation. |
| `/`, `/privacy`, `/privacy.html` | Existing public site | Preserve current routes, content, and legacy redirect. |
| `/connectivity` | Separate feature001 local connectivity preview | Preserve its existing default-disabled/local-only policy. |

## Screen anatomy and interaction states

### Login

- Email and password fields with visible labels, required/error text, and a password visibility toggle.
- Valid-looking submit produces a clear notice that sign-in is not connected; it never creates a session or redirects to a protected route.
- Notice is programmatically associated with the form and announced to assistive technology.

### Team: Users and Roles

- Page heading and `UI preview — sample data. Changes are not saved.` notice.
- `Users` and `Roles` tabs with correct selected state and keyboard interaction.
- Users tab: searchable list of synthetic member names, reserved sample emails, illustrative roles, and display-only access status.
- No-results state includes a reset action.
- Add user/invite, save role, edit permissions, and revoke access actions are disabled and have nearby reasons.
- Roles tab: read-only illustrative permission matrix with a notice that the examples are not an approved access policy.
- The sample profile control opens a preview menu with a disabled Sign out item and a nearby explanation that no session exists.
- The profile menu opens by pointer or keyboard, closes with Escape, and returns focus to its trigger.

### Settings

- Group sample values into `Account` and `Workspace` sections.
- Show Account display name/email and Workspace name; do not introduce password, billing, store, or supplier settings in this preview.
- Local edits display an unsaved preview state; reload restores the original fixtures.
- The page explains that values are not saved; no success toast may imply persistence.

## Global interaction rules

- The shared preview banner or equally prominent notice clearly labels sample data and non-persistence.
- No browser/API network calls or persistent browser writes occur.
- Keyboard users can reach each route, operate tabs, fields, and search, and see a visible focus indicator.
- At 360px and 390px, the page has no horizontal overflow; content may wrap and controls remain touch-accessible.
- Honor reduced motion and 200% text enlargement.
- Preserve the existing Application styling and its already-reviewed desktop/mobile behavior.
