# Data Model: Internal App Foundation

**BASELINE_APPROVED — BE source/local model selected.** One workspace, fixed Owner/Member, minimal names/read-only Auth email and controlled admission are approved. Records below remain design until actual migration/source verification is recorded; no production values are seeded. Actual owner identity/email/retention setup remains deferred.

## Ownership and trust

| Entity | Authority | Identifier / boundary | Not its responsibility |
|---|---|---|---|
| Auth user | Supabase Auth | Stable `auth.users.id` UUID | Workspace capabilities or app profile ownership policy |
| Auth session | Supabase Auth | Verified JWT `session_id` bound to `sub` | App membership/role or unconditional continued access |
| App profile | App, one per Auth UUID | Logical `user_id` binding verified through Auth; no managed-schema FK | Password, email-verification or token storage |
| Workspace | App | Server-selected internal `workspace_id` | Public tenant creation, shops or customer accounts |
| Membership | App | Unique `(workspace_id, user_id)` | Global account deletion or Auth-session issuance |
| Invitation | App offer plus separate Auth verification | Workspace-scoped invitation UUID | Granting a role merely because an email was sent |
| Audit event | App | Event UUID and workspace/actor/target scope | A second authentication or migration ledger |

No business entity is keyed by mutable email. No provider role claim, editable `user_metadata`, UI fixture or browser-submitted actor ID is authoritative for capabilities. The proposed profile is global; membership is the workspace-scoped policy connection. An inactive membership does not erase the profile or disable unrelated Auth identities.

## Selected app records

### Profile

- `user_id`: UUID primary key, logically bound to the verified Auth primary key. No FK or trigger touches managed Auth tables; this preserves ordinary foundation-only PostgreSQL migration compatibility.
- `display_name`: trimmed/nonblank presentation field,1–100 Unicode code points.
- `revision`: monotonically increasing optimistic-write revision.
- `created_at`, `updated_at`: server timestamps.

Provision explicitly during approved bootstrap/admission, not an automatic privilege-granting Auth trigger. Self profile operations derive `user_id` from verified identity and require current app admission. Auth email is read through a trusted Auth interface and is read-only in the proposed settings UI; do not persist an independently editable email/password copy. Missing profiles for existing members are an inconsistency, not permission to fabricate sample values.

### Workspace

- `id`: UUID selected by approved bootstrap/configuration, never inferred from a browser role.
- `display_name`: approved internal-team label with the proposed profile-equivalent length rules.
- `revision`, `created_at`, `updated_at`.
- `bootstrap_request_id`, `bootstrap_fingerprint`: immutable original operator approval/input binding. Idempotent retry compares the original input, not mutable current display names.

The application supports only the configured internal workspace and no create/list-tenant UI/API. Bootstrap serializes initialization and refuses a second workspace. Workspace identifiers/FKs remain explicit so future boundary expansion requires an intentional migration/policy change, not implicit global records.

### Membership

- `workspace_id`, `user_id`: composite primary/unique key; FKs to workspace and app profile.
- `role_code`: fixed `owner`/`member`; unknown values denied.
- `status`: `active` or `disabled`; membership removal is a soft disable.
- `revision`, `created_at`, `updated_at`; `disabled_at` when disabled.
- Mutating actor and reason category belong in audit, not an uncontrolled free-text secret field.

Invariant: an initialized workspace has at least one active owner. Serialize all owner-affecting operations on its workspace row; recheck actor and target under the same transaction. Enforce the invariant for approved operator paths as well as HTTP operations, including attempted hard deletion. No cascade may silently remove the last owner. Recommended FKs restrict deletion while membership/audit references remain; final account deletion/anonymization policy is D05, not an automatically enabled Auth delete operation. Do not install triggers on managed Auth tables.

Transitions:

- Approved bootstrap → active owner.
- Valid accepted invitation → active member with its explicitly approved role.
- Active ↔ disabled only through current authorized membership administration.
- Role change on an active or disabled record requires explicit allowed operation; a disabled owner does not satisfy the active-owner count.
- Invitation acceptance/recovery never silently reactivates a disabled membership or overwrites an existing role. Return a conflict requiring explicit administration.
- Ownership transfer/promotion requires an existing verified active successor and an atomic owner-preserving transition.

### Invitation

- `id`, `workspace_id`: UUID scope.
- `recipient_email`: normalized only according to the approved Auth/email policy; do not strip dots/plus tags or merge identities heuristically. Access restricted; D05 governs retention.
- `target_role_code`: fixed `member`; invitation requests cannot select Owner or overwrite an existing membership.
- `inviter_user_id`, `inviter_membership_revision`: attribution and stale-authority evidence. Revision change requires re-evaluating actual authority, not trusting the stored value.
- `status`: `pending`, `accepted`, `revoked`; expiry is determined by trusted `expires_at` rather than requiring a background job. APIs may project `expired` for pending records whose deadline passed.
- `created_at`, `expires_at`, `accepted_at`, `accepted_by_user_id`, `revoked_at`, `superseded_by_id` where applicable.
- `revision`: monotonically increasing offer revision for revoke/reinvite/accept conflicts.
- `idempotency_key` and request fingerprint, unique within workspace/actor/operation; same key/different payload conflicts. No email-send retry hidden behind a duplicate request.
- `delivery_state`: `pending`, `confirmed`, `failed`, `unknown`; only the bounded outcome is persisted, not raw provider responses. Confirmed means provider accepted the send, not receipt or membership acceptance.

The membership offer is identified by an unguessable invitation UUID but its ID is not sufficient authorization. Acceptance requires current verified email/identity matching, an unexpired/unrevoked offer and current authorized issuer/target role. Do not store Auth link/token hashes as a substitute for that identity check. Provider-issued email challenges remain Auth-owned secrets; the exact link/callback shape is settled under D03. No second password or authentication-token system is proposed.

Pending-offer uniqueness and reinvite are transactional for `(workspace_id, approved_email_key)`: lock the workspace/offer, expire or revoke a previous live offer before creating the replacement. Reinvite does not itself revoke every Supabase Auth token previously issued; app acceptance checks the current offer state independently. Accepted replay by the same identity is idempotent. Wrong identity, stale/revoked offer or disabled membership cannot create access.

Delivery cannot be atomic with the SQL transaction. Reserve and audit intent before provider work; record confirmed failure/success/unknown afterwards. Unknown acknowledgement blocks automatic resend and requires approved reconciliation. A crash after provider action is not proof that no email/user was created. Do not delete provider users automatically to compensate.

### Audit event

- `id`, `workspace_id`, verified `actor_user_id`; controlled bootstrap/reconciliation use the explicit operator approval UUID as `request_id`.
- Allowlisted `action`, `target_id`, relevant before/after role/status/revision fields, `outcome`, `request_id`, `occurred_at`. Action identifies the target category and changed operation; there is no arbitrary `target_type`, `field_names` or metadata JSON.
- No passwords, tokens, Auth links, raw provider payloads or full personal-profile values.

Local app mutations and their accepted audit event commit together; audit failure rolls back the mutation. External Auth/email events use separate intent/outcome records and never claim cross-system transaction atomicity. Runtime audit access is append-only, reads Owner-only. Retention duration/deletion policy remains a real-activation gate, not a BE source blocker. No automatic purge or invented indefinite production retention; an explicit approved retention-policy identifier is required for hosted activation.

## Request and transaction semantics

1. Technical API guard runs before any DB work on every non-preflight API route.
2. Protected app routes additionally verify a user JWT and its configured claims. Use `sub` + `session_id` with the app-owned boolean `app_private.has_current_session(uuid,uuid)` interface; never query by user-submitted email as an authorization substitute.
3. Load the configured workspace membership and evaluate the approved operation capability. Invitation acceptance is a narrowly scoped exception to needing pre-existing membership, not to authenticated identity/technical protection.
4. Parameterize every object query by trusted identity/workspace. A foreign-object request does not disclose whether the object exists.
5. For writes, use a consistent workspace → sorted actor/target memberships → target-record lock order, recheck permissions and revision, apply mutation and append audit atomically. Bound waits, transaction/query execution and cancellation within existing budgets.
6. Session/membership checks are not cached positively across requests. A read admitted before a revoke may complete; writes serialize app-membership changes. Auth-provider revocation and app transactions are separate systems: do not promise cancellation of every in-flight write at the exact instant of remote logout. Requests admitted after confirmed session revocation must fail.

## Database access boundary

The app-owned `app_private` schema has no PUBLIC/`anon`/`authenticated` access. Separately provision `app_runtime` and `app_operator` before the app migration when enabling Auth. Both must lack superuser, BYPASSRLS, CREATEDB and CREATEROLE powers; migration/runtime checks reject those flags. The migration conditionally grants only app operations to existing roles and does not create roles. A foundation-only DB without those roles still migrates, but receives no app access.

`app_runtime` receives scoped-operation support and append-only audit permissions, not workspace creation, audit update/delete or managed Auth mutations. `app_operator` receives only bootstrap/reconciliation support, with a separate credential. NestJS capabilities and scoped SQL remain mandatory: direct PostgreSQL does not inherit end-user JWT/RLS automatically.

The initial isolated-fixture `SELECT(id,user_id,not_after)` grant did not bypass pinned GoTrue's RLS on `auth.sessions`: a real verified session was visible to the fixture migration owner but hidden from runtime. That failed approach is retained as evidence, not the active interface. The exact obsolete three-column grant was revoked; no other grants, managed Auth schema/RLS or role powers were changed.

The approved append-only correction, `1792972800002-app-session-check.mjs`, creates `app_private.has_current_session(uuid,uuid)` as a fixed-`pg_catalog`-search-path SECURITY DEFINER function. It returns only a parameter-bound boolean using fully qualified `auth.sessions` id/user_id/not_after; PUBLIC execute is revoked and only existing `app_runtime` receives execute. If `row_security_active` says the definer cannot see unfiltered sessions, it raises a privilege error mapped to safe503 rather than falsely reporting an expired/revoked identity. The actual fixture migration owner retains its existing privileges; the migration grants no new role powers.

Actual local checks verified ownership/ACL/search_path, valid versus mismatched session/user, denied direct runtime Auth reads and safe503 after temporarily transferring this app-owned function to the RLS-constrained runtime role, followed by restored successful access. Real GoTrue logout/recovery exercised revocation. This fixture has no session timebox, so a non-NULL `not_after` expiration boundary is not claimed; hosted activation must verify definer ownership/visibility and managed-schema compatibility separately, without assuming current credentials suffice.

## Migration boundary

The new local migration is `apps/api/migrations/1792972800001-app-foundation.mjs`, appended to the existing node-pg-migrate history/checksum/report mechanism. The original foundation file stays unchanged. Indexes support active-owner checks, pending-offer uniqueness, invitation roster and ordered audit pagination. There is no second migration history, startup table creation, real-owner seed or cloud SQL. Destructive down migration is intentionally refused pending a separately reviewed retention/recovery procedure.

The already-applied app migration remains byte-immutable (SHA256 `4416736cb809720359dd0d650a3d530e6c3836be683f7c1700a8da8138df9608`). The session-interface correction is a second append in that same history, not an edit or reset. Actual apply/replay checks matched all three generated migration entries and preserved the fixture marker/history during app-data cleanup.

The current-schema-only feature001 delivery path must reject this proposed schema until its separately approved migration-before-deploy extension is verified. Preserve old→target manifests and source/artifact identity; unknown SQL commit outcomes fence retries. Retention/deletion choices, migration credentials and initial owner data are prerequisites, not values to guess in migration code.
