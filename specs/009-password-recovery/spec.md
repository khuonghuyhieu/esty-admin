# Feature Specification: Password Recovery

**Feature**: `009-password-recovery` · **Status**: READY_FOR_OWNER_PLAN_REVIEW — planning only, not owner acceptance or implementation.
**Purpose**: A user who forgot their password requests recovery, verifies a real email challenge, sets a new password, explicitly revokes prior sessions and signs in afresh without gaining workspace privileges.

## Authority and scope

One of the owner's four separate FE+BE+integration deliverables. Reuse approved single-workspace/Owner/Member/invite-only policy and existing Auth recovery/current-session enforcement. No Nest password/reset-owner endpoint, app password store, account registration, membership reactivation, role change or public operator recovery. Preserve005 and the sole API/history. No source/runtime/mail/provider/private/dependency/Git/reviewer action is authorized by this plan.

## User Scenarios & Testing

### US1 — Request and verify a recovery link (P1)

**Value / independent acceptance:** a user reaches recovery from `/login`, requests a link, receives actual local email and explicitly verifies a valid challenge without exposing credentials or account existence.

1. Syntactically valid requests show the same generic eligible acknowledgement for registered and unregistered addresses; never assert that mail was delivered or that an account exists.
2. A real recovery email reaches a clean confirmation screen; merely opening/scanning the link does not verify it or change a password.
3. Explicit verification accepts only the recovery challenge purpose. Invitation/magic-link, malformed, expired, consumed or tampered links cannot become recovery sessions.
4. Recoverable input/throttle/unavailable states are distinct without disclosing provider payloads or account existence; no hidden resend loop.

### US2 — Set a password, end old sessions and sign in afresh (P1)

**Value / independent acceptance:** an actual verified recovery session sets a provider-accepted password, explicit global sign-out revokes old sessions, then fresh login succeeds with current membership checks.

1. New password and confirmation are checked without storing/logging them; provider policy determines acceptance.
2. Password-update confirmation and global-revocation confirmation are separate facts. A confirmed password change with uncertain revocation is not reported as completed recovery.
3. Explicit recovery completion signs out all provider sessions; both previously independent sessions are denied by the existing API. Fresh login with the new password is required; the old password fails.
4. A disabled or unadmitted user can recover their Auth password but remains denied application admission. Recovery cannot bootstrap an Owner or reactivate membership.
5. Lost acknowledgement, expired completion context or a late token response cannot silently reapply the password, restore app access or claim unobserved revocation.

### States and edge cases

Request idle/submitting/generic eligible acknowledgement/invalid/throttled/unavailable; link captured/awaiting confirmation/verified restricted/invalid/expired/consumed; password submitting/rejected/changed/unknown; revocation pending/confirmed/unknown; fresh login/current admission or denial. Keep explicit retry paths bounded. Old private UI is invalidated on credential transitions. No fake success or fixture identity fallback.

## Requirements

- **FR-001**: Provide a public recovery entry from login and generic initiation without recipient/account-existence disclosure or promised delivery.
- **FR-002**: Bind the configured recovery callback to a typed, short-lived, single-use server challenge; GET does not verify or mutate identity, and URL fragments containing access/refresh tokens are unsupported.
- **FR-003**: Accept password updates only through a verified recovery context and existing provider policy; no local password database or new Nest password operation.
- **FR-004**: Require explicit global provider sign-out and fresh006 login after password update; ordinary006 logout remains local. Prior independent sessions must be denied before claiming successful global recovery completion.
- **FR-005**: Recovery grants no app membership, role, owner bootstrap or reactivation; current disabled/unadmitted checks still apply at fresh login.
- **FR-006**: Reuse006 cookie/purpose/generation/Origin/CSRF/no-store/bounded-request rules; recovery tokens never directly authorize app reads or session promotion.
- **FR-007**: Distinguish confirmed password change, uncertain password outcome and uncertain revocation; never automatically replay password writes or treat an expired/rejected old token as proof of global revocation.
- **FR-008**: Complete meaningful functional and real browser→local email/Auth→new password→old-session denial→fresh current-membership login acceptance before feature completion.

### Routes and reused or missing API

Existing `/login` links to new `/forgot-password`. New `/auth/recovery` is the clean UI, while `/auth/recovery/callback` is the separate GET handler. Auth owns recovery request/verify/password update/global logout; [canonical GET `/v1/app/me`](../001-connectivity-foundation/contracts/openapi.json) proves current session/membership after fresh login or denies old sessions. No missing Nest business operation/migration is identified. Missing: exact provider template/callback binding, FE server-only restricted session/UI/error transitions and browser integration.

### Entities and ownership

Existing Auth identity/session, provider recovery challenge and current app membership;006 owns transport-only sealed challenge/restricted envelopes. No new persisted domain entity. FE owns recovery pages/handlers and a narrow login-link change; BE supports current-session/membership regression and owned real Auth/mail fixture. One integration owner serializes shared006 helpers and the existing E2E suite. Detailed paths/contracts are in [plan.md](plan.md).

## Success Criteria

- **SC-001**: A real locally delivered recovery link leads through explicit verification and provider password change to confirmed global logout and successful fresh admitted login; old password and two prior sessions are denied.
- **SC-002**: Defined invalid/expired/replayed/wrong-purpose/CSRF/late-response/uncertain-outcome cases grant no app access, false completion or membership changes; disabled membership remains denied.
- **SC-003**: Generic request responses do not expose recipient existence, tokens/passwords remain absent from JS/storage/rendered content/logs, and recovery remains usable with keyboard/mobile layouts.

## Dependencies and completion boundary

Requires integrated [006](../006-login-session/plan.md) plus this feature's granted local callback/mail template; not007 or008. Local synthetic email capture does not require production SMTP/real owner/retention decisions and does not prove hosted delivery. Production adoption retains [001's single versioned migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only). Operator recovery is a separate approved process, never this public journey.
