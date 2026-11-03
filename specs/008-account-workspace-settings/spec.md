# Feature Specification: Account and Workspace Settings

**Feature**: `008-account-workspace-settings` · **Status**: READY_FOR_OWNER_PLAN_REVIEW — planning only, not owner acceptance or implementation.
**Purpose**: An admitted user changes their own display name and sees it persist; an Owner separately changes the workspace name without granting Members workspace administration.

## Authority and scope

This is one of the owner's four separately manageable FE+BE+integration deliverables. Preserve accepted005 and its sole contract/history. One workspace and fixed Owner/Member are already approved. No new settings subsystem, email/password editing, timezone/notification persistence, dynamic role editor, account deletion or audit dashboard is added. Source/runtime/resources/shared docs/Git/provider actions require later grants.

## User Scenarios & Testing

### US1 — Save my account display name (P1)

**Value / independent acceptance:** an admitted Member or Owner edits their own display name in `/settings`, saves, reloads and sees the persisted identity in settings and the profile menu.

1. Settings loads the actual current profile and read-only verified Auth email, not fixture defaults.
2. Valid self-name save confirms the persisted value; a full reload and current identity display agree.
3. Invalid/blank/overlong or malformed names show an accessible error without a persisted change.
4. Another tab's change produces a conflict: keep the user's draft separate from the latest value and require explicit review/reapply. No silent overwrite.

### US2 — Save workspace settings as an Owner (P1)

**Value / independent acceptance:** an Owner saves the workspace display name; another admitted user sees the new name after reload. A Member has a real read-only workspace view and cannot mutate it directly.

1. Account and workspace are separate forms/save outcomes. A successful account save is not undone or misreported when workspace save fails.
2. A current Owner can update only the existing workspace display name with its current revision.
3. A Member, or an Owner whose current role was removed, cannot save workspace changes. Losing authority removes stale editing controls after revalidation.
4. Concurrent updates require explicit conflict recovery; rejected or rolled-back changes do not produce successful-change audit records.

### States and edge cases

Loading, ready, dirty draft, saving, saved, invalid input, stale revision, permission lost, signed out, dependency unavailable and outcome unconfirmed. Preserve per-form drafts without persisting sensitive identity to browser storage; prevent double submission. A timeout can hide a committed write, so reload authoritative values before proposing another explicit save. Never fill errors with sample profile/workspace data. Session-generation changes discard late results and old drafts belonging to another identity.

## Requirements

- **FR-001**: Render current profile, trusted read-only email, workspace and current capabilities; keep both settings forms tied to the current admitted identity.
- **FR-002**: Allow Member/Owner to save only their own display name; confirm persistence through a new read and reflected profile-menu identity, not optimistic state alone.
- **FR-003**: Allow only current Owners to save workspace display name; Members can read it but direct writes deny. No email, notification, timezone or extra setting is sent or falsely reported persisted.
- **FR-004**: Apply existing name/revision validation and explicit conflict handling; keep draft/latest values distinct and do not automatically overwrite a new revision.
- **FR-005**: Keep account/workspace saves independent; distinguish denied, unavailable and unknown outcomes. Never claim a combined atomic save or automatically retry a mutation.
- **FR-006**: Reuse006's server-only transport, current admission, Origin/CSRF, generation and no-store boundaries; no browser technical key or cross-user cached settings.
- **FR-007**: Preserve existing transactional audit/scoping/redaction behavior for actual successful changes; denied, invalid or rolled-back writes do not create false success records. Verify via existing privileged acceptance reads, not a new audit UI.
- **FR-008**: Complete functional and real browser→BFF→Nest→DB save/reload/denial/conflict journeys before reporting this feature complete.

### Routes and reused or missing API

Existing `/settings` becomes operational. Reuse GET/PATCH `/v1/app/me` and GET/PATCH `/v1/app/workspace` from the [sole OpenAPI](../001-connectivity-foundation/contracts/openapi.json); GET `/v1/app/audit` is an existing Owner-only validation surface, not a new screen. No missing Nest business operation or migration is identified. Missing: FE consumer/caller integration, exact BFF mutations, real two-form state, current profile-menu synchronization and browser acceptance.

### Entities and ownership

Existing profile, Auth email, workspace, membership/capabilities, revisions and redacted audit records; no new persisted model. FE owns existing settings UI and the narrow006 me/workspace caller extensions. BE owns existing settings/audit behavior and authorized regression support, not a speculative rewrite. One integration owner serializes shared session/menu/tests. Exact files and canonical schemas are in [plan.md](plan.md).

## Success Criteria

- **SC-001**: A Member and an Owner each save their own valid name; reload and profile menu show the stored value. Owner workspace save persists for another user's reload.
- **SC-002**: Invalid fields, foreign/self-scope violations, stale revisions, Member/current-role denial and dependency/uncertain outcomes never show false success or overwrite another user's state; successful audit effects are scoped/redacted and rejected writes have none.
- **SC-003**: Real browser evidence proves separate save outcomes, explicit conflict recovery and identity isolation while keyboard/mobile settings remain usable and no credentials are exposed.

## Dependencies and completion boundary

Requires integrated [006](../006-login-session/plan.md), not007 or009. No mail/provider setup is needed for settings beyond006's local Auth fixture. Actual owner/retention/SMTP and cloud release are not fake local blockers. Production activation links [001's existing migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only) without copying tasks. A source-complete FE form or accepted BE unit alone does not close this feature.
