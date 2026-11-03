# Workspace Foundation Preview Fixtures

These shapes exist only to plan a visual UI preview. They do not define a database schema, auth identity, API DTO, permission policy, or persistent model.

| Fixture | Example fields | Rules |
| --- | --- | --- |
| Sample member | Stable local id, display name, reserved `.test` email, illustrative role label, sample access status | Mark the entire list as sample data; never use a real person's identity. |
| Illustrative role | Local id, label, read-only example permission labels | Example labels are not an approved role catalog or enforceable permissions. |
| Sample setting | Account display name, account email, workspace name, scope (`Account` or `Workspace`) | Values are synthetic; changes are transient and reset on reload. Do not imply a saved update. |
| Preview state | Route, selected tab, search text, locally edited form values | In-memory UI state only; no cookies, localStorage, session storage, API, or database writes. |

## Proposed sample content

- Workspace: `Sample Workspace`.
- Members: `Jordan Kim`, `Alex Rivera`, and `Maya Chen` with reserved sample emails.
- Illustrative roles: `Admin`, `Operator`, and `Viewer`, shown with a nearby note that they are examples only.
- Example access states: `Active` and `Invited`; the latter is display-only and does not send an invitation.

## Preview state coverage

- Login: empty, invalid email, missing password, and preview-only submission notice.
- Users: loading, sample rows, filtered rows, no-results, and disabled add/invite action.
- Roles: read-only sample permission matrix and disabled edit action.
- Settings: default sample values, edited/unsaved local state, and reset after reload.
