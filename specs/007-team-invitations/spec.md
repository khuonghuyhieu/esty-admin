# Feature Specification: Team, Invitations and Membership

**Feature**: `007-team-invitations` · **Status**: READY_FOR_OWNER_PLAN_REVIEW — planning only.
**Purpose**: An Owner invites a real colleague, that colleague accepts through verified Auth, and authorized team changes persist with current role/status enforcement. One complete user journey, not separate FE/BE completion.

## Authority and baseline

This is one of the owner's four separate deliverables, not a reopened005 joint implementation. Keep005 source/history/docs unchanged. Reuse one workspace, fixed Owner/Member, invite-only admission and current membership. No dynamic roles, public bootstrap, Auth-account deletion, impersonation, new password store or business module. No source/tests/build/servers/AuthDB/dependencies/Git/cloud/reviewer/shared-doc actions are authorized by planning.

## User Scenarios & Testing

### US1 — Invite and admit a colleague (P1)

**Value / independent acceptance**: An Owner creates an offer in `/settings/team`; a real locally captured email leads the matching user through explicit confirmation to one persisted membership and admitted app access.

1. New Auth identity uses an invitation challenge, establishes its password through Auth and explicitly accepts the app offer.
2. Existing verified Auth identity uses the existing-user magic-link path without password reset/account duplication; app acceptance is still explicit.
3. Delivery confirmed means provider acknowledgement, not email receipt or app admission. Pending/failed/unknown states remain visible; unknown delivery never auto-resends.
4. GET/scanner visits do not verify the challenge or create membership. Wrong identity/email, expired/revoked offer, stale issuer authority, replay and simultaneous acceptance cannot create unauthorized/duplicate membership or audit effects.

### US2 — Manage current team roles and status (P1)

**Value / independent acceptance**: Owner changes a colleague's role or active/disabled state; a separate session observes current authorization on its next request.

1. Active Members can read the bounded roster but cannot invite, list offers or mutate roles/status. Owner has the existing fixed management capabilities.
2. Role/status edits use current revisions; conflicts require reload/review, not blind overwrite.
3. Simultaneous last-owner demotions/disables cannot remove the last active Owner. Disabled membership is never silently reactivated by an invitation.
4. Foreign/unknown member/offer IDs do not reveal other records. Removal is membership disable, never deletion of the Auth user.

### States and failure cases

Roster: loading, empty, ready, unavailable, denied. Offer status: pending/accepted/revoked/expired; delivery independently pending/confirmed/failed/unknown. Mutation: submitting, confirmed, stale revision, last-owner conflict, denied, outcome uncertain. Callback: captured challenge, awaiting explicit confirmation, verified scoped identity, acceptance pending, accepted, invalid/expired/replayed/mismatched. No sample row replaces an API error.

## Requirements

- **FR-001**: Show real paginated roster fields and fixed Owner/Member policy, using current capabilities; no mock email or invented role definition.
- **FR-002**: Owner may create, revoke and explicitly reinvite through existing revision/idempotency semantics; do not conflate provider acknowledgement, receipt and admission.
- **FR-003**: Both new and existing Auth users complete a typed, server-only email challenge and explicit matching-offer acceptance; do not use recovery as invitation.
- **FR-004**: Invalid/expired/revoked/foreign/replayed offers, wrong email, stale issuer and disabled-member acceptance grant no additional access; concurrent acceptance creates one membership/audit.
- **FR-005**: Owner role/status updates persist with current authority and revision checks; last active Owner survives races. Member writes and Auth-user deletion are unavailable.
- **FR-006**: Apply006's BFF/CSRF/cookie/cache/generation rules; the exact invitation-accept operation is the only admission exception, not a general bypass for unadmitted users.
- **FR-007**: Retain bounded/error/unknown outcomes with explicit safe recovery; operator reconciliation is a separately approved operator process, never a new public button/endpoint.
- **FR-008**: Meaningful functional tests and real browser→email/Auth→BFF→Nest→DB tests cover both user journeys before feature completion.

### Routes and API reused or missing

Existing `/settings/team` becomes real roster/offer management. Existing BE redirect `/auth/invitation?invitation=<uuid>` is a callback Route Handler; its clean UI destination is NEW `/auth/invitation/accept` to avoid a Next route/page collision. Reuse GET team, PATCH team/{memberId}, GET/POST invitations and POST invitations/{id}/revoke|reinvite|accept from the sole [OpenAPI](../001-connectivity-foundation/contracts/openapi.json). No new Nest operation/migration is identified. Missing: exact FE BFF allowlist/UI wiring, typed server callback and explicit acceptance, new-user Auth password establishment, correct invitation/magic-link email templates and browser integration. Default provider token fragments are incompatible with the selected server-only006 boundary and are not silently accepted.

### Entities and file ownership

Reuse005 memberships/offers/audit and Auth users/sessions. FE owns existing `apps/web/src/features/workspace-foundation/team-screen.tsx` and new team/callback handlers; BE owns existing application/invitation adapter acceptance and confirmed gaps only under a new grant; integration owns the shared browser fixture/suite with serialized edits. Detailed paths/dependencies are in [plan.md](plan.md).

## Success Criteria

- **SC-001**: An Owner invites one new and one existing synthetic Auth user; each reaches verified email→explicit acceptance→real admitted app access with one persisted membership.
- **SC-002**: A role/status change is observable after reload and on another user's next request; all specified privilege, offer, revision, replay and last-owner failures leave forbidden state unchanged.
- **SC-003**: Functional and real E2E evidence distinguish delivery/admission/unknown outcomes, expose no credentials, and preserve accessible desktop/mobile team interaction.

## Dependencies and completion boundary

Requires integrated [006 session/caller](../006-login-session/plan.md), accepted005 BE and separately authorized email-template/callback/fixture setup. Actual production sender remains a manual gate; local capture is not SMTP/cloud acceptance.008/009 are not prerequisites. Link [001 migration delivery](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only) for production adoption; do not copy or bypass it. The whole Owner→recipient→current-membership journey is required, not an Owner screen backed only by mocks.
